/**
 * 사진 저장소 추상화 — 현재 구현: Vercel Blob (public access).
 * 저장소를 바꾸고 싶으면 saveImage / deleteImage 두 함수만 교체하면 됩니다.
 *
 * Vercel Blob 사용 시 환경변수:
 *   BLOB_READ_WRITE_TOKEN
 *     Vercel 대시보드 → Storage → Blob store 를 프로젝트에 연결하면 자동 주입됩니다.
 *     로컬 개발용으로 쓰려면 Vercel 대시보드에서 토큰을 복사해 backend/.env 에 넣으세요.
 */
const { put, del } = require('@vercel/blob');
const { randomUUID } = require('crypto');
const path = require('path');

const CONTENT_TYPE_BY_EXT = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

/**
 * 이미지 1장을 저장소에 업로드.
 * @param {{ buffer: Buffer, originalname: string, mimetype?: string }} file
 *        multer memoryStorage 가 넘겨주는 형태 (file.buffer 사용)
 * @returns {Promise<{ key: string, url: string }>}
 *          key: 삭제·식별용 (DB report_images.filename 에 저장)
 *          url: 공개 접근 URL (DB report_images.url 에 저장)
 */
async function saveImage(file) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const key = `reports/${randomUUID()}${ext}`;
  const contentType =
    file.mimetype || CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

  const { url } = await put(key, file.buffer, {
    access: 'public',
    contentType,
    // 우리가 이미 UUID 로 유일성을 보장하므로 Vercel 쪽 랜덤 suffix 는 끔
    addRandomSuffix: false,
  });

  return { key, url };
}

/**
 * 이미지 1장을 저장소에서 삭제. 실패해도 throw 하지 않습니다
 * (제보 삭제·롤백 흐름이 Blob 에러로 멈추지 않도록).
 * @param {string} keyOrUrl 저장 시 받은 key 또는 전체 URL. @vercel/blob 의 del 은 둘 다 받습니다.
 */
async function deleteImage(keyOrUrl) {
  if (!keyOrUrl) return;
  try {
    await del(keyOrUrl);
  } catch (err) {
    console.warn('[storage] 이미지 삭제 실패:', keyOrUrl, err.message);
  }
}

module.exports = { saveImage, deleteImage };
