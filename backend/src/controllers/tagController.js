const pool = require('../config/db');

/**
 * GET /api/tags
 * 제보 등록 화면에서 선택할 태그 목록 (객관적 태그 - 기획안 6번 항목)
 */
async function listTags(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, code, label, category, icon FROM tags ORDER BY sort_order ASC'
    );
    return res.json({ tags: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { listTags };
