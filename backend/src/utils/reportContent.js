// 제보 본문(제목·설명·태그·통행 상태) 수정을 한곳에서 처리한다.
//   - 관리자 "정보 수정" API (PATCH /api/reports/:id)
//   - 정보 변경 신고 수락 시 원본 제보 자동 반영 (PATCH /api/admin/change-reports/:id)
// 반드시 호출하는 쪽에서 연 트랜잭션(BEGIN ~ COMMIT) 안에서 사용할 것.

const ACCESSIBILITY_STATUSES = ['passable', 'inconvenient', 'impassable'];
const TITLE_MAX = 200; // reports.title VARCHAR(200)

/** 검증 실패용 에러. 컨트롤러가 status/code를 그대로 응답에 쓴다. */
class ContentError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.status = status;
  }
}

/** "1,3" / ["1","3"] / [1,3] → [1, 3] (숫자가 아닌 값은 버림) */
function parseTagIds(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map(v => parseInt(v)).filter(v => !Number.isNaN(v));
  }
  return String(raw)
    .split(',')
    .map(v => parseInt(v.trim()))
    .filter(v => !Number.isNaN(v));
}

/**
 * 제보 본문을 수정한다. 넘기지 않은(undefined) 항목은 그대로 둔다.
 *
 * fields:
 *   title                string|null  빈 문자열은 null(제목 없음)로 저장
 *   description          string|null  빈 문자열은 null로 저장
 *   tagIds               number[]     태그 전체 교체 (최소 1개, 존재하는 태그만)
 *   removeTagCodes       string[]     현재 태그에서 이 code들만 제거 (tagIds가 있으면 무시)
 *   accessibilityStatus  passable|inconvenient|impassable
 *
 * - 제보 행을 FOR UPDATE로 잠근 채 수정한다.
 * - 아무 항목도 안 넘겨도 updated_at(= '최근 확인일')은 새로 찍힌다.
 * - 제보가 없으면 null, 수정했으면 { tagsChanged } 를 반환한다.
 * - 값이 잘못되면 ContentError를 던진다 (호출한 쪽에서 ROLLBACK).
 */
async function updateReportContent(client, reportId, fields = {}) {
  const { title, description, tagIds, removeTagCodes, accessibilityStatus } = fields;

  // ── 값 검증 (DB를 건드리기 전에) ─────────────────────────────────────
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      throw new ContentError('title은 문자열이어야 합니다.', 'INVALID_TITLE');
    }
    if (title.trim().length > TITLE_MAX) {
      throw new ContentError(`title은 ${TITLE_MAX}자 이하여야 합니다.`, 'INVALID_TITLE');
    }
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    throw new ContentError('description은 문자열이어야 합니다.', 'INVALID_DESCRIPTION');
  }
  if (accessibilityStatus !== undefined &&
      !ACCESSIBILITY_STATUSES.includes(accessibilityStatus)) {
    throw new ContentError(
      `accessibility_status는 ${ACCESSIBILITY_STATUSES.join(', ')} 중 하나여야 합니다.`,
      'INVALID_ACCESSIBILITY_STATUS'
    );
  }
  if (tagIds !== undefined && tagIds.length === 0) {
    throw new ContentError('태그는 최소 1개 이상이어야 합니다.', 'TAGS_REQUIRED');
  }

  // ── 제보 잠금 ────────────────────────────────────────────────────────
  const { rows: found } = await client.query(
    'SELECT id FROM reports WHERE id = $1 FOR UPDATE',
    [reportId]
  );
  if (found.length === 0) return null;

  // ── 태그 계산 ────────────────────────────────────────────────────────
  let nextTagIds = null; // null이면 태그는 건드리지 않음
  if (tagIds !== undefined) {
    const unique = [...new Set(tagIds)];
    const { rows: valid } = await client.query(
      'SELECT id FROM tags WHERE id = ANY($1::int[])',
      [unique]
    );
    if (valid.length !== unique.length) {
      throw new ContentError('존재하지 않는 태그가 포함되어 있습니다.', 'INVALID_TAG');
    }
    nextTagIds = unique;
  } else if (removeTagCodes && removeTagCodes.length > 0) {
    const { rows: current } = await client.query(
      `SELECT t.id, t.code
       FROM report_tags rt JOIN tags t ON t.id = rt.tag_id
       WHERE rt.report_id = $1`,
      [reportId]
    );
    const kept = current.filter(t => !removeTagCodes.includes(t.code)).map(t => t.id);
    if (kept.length !== current.length) {
      if (kept.length === 0) {
        // 제보는 태그가 최소 1개 있어야 하므로, 마지막 태그가 빠지면 관리자가 대체 태그를 정해야 한다.
        throw new ContentError(
          '이 태그를 제거하면 제보에 태그가 하나도 남지 않습니다. tag_ids로 새 태그를 지정해주세요.',
          'TAGS_WOULD_BE_EMPTY'
        );
      }
      nextTagIds = kept;
    }
  }

  // ── 본문 UPDATE (updated_at은 항상 갱신) ─────────────────────────────
  const sets = ['updated_at = NOW()'];
  const params = [reportId];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (title !== undefined)               push('title', (title || '').trim() || null);
  if (description !== undefined)         push('description', (description || '').trim() || null);
  if (accessibilityStatus !== undefined) push('accessibility_status', accessibilityStatus);

  await client.query(`UPDATE reports SET ${sets.join(', ')} WHERE id = $1`, params);

  // ── 태그 교체 ────────────────────────────────────────────────────────
  if (nextTagIds) {
    await client.query('DELETE FROM report_tags WHERE report_id = $1', [reportId]);
    for (const tagId of nextTagIds) {
      await client.query(
        'INSERT INTO report_tags (report_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [reportId, tagId]
      );
    }
  }

  return { tagsChanged: nextTagIds !== null };
}

module.exports = { ContentError, parseTagIds, updateReportContent, ACCESSIBILITY_STATUSES };
