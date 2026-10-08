const { deleteImage } = require('./storage');

/**
 * 요청이 거부/실패했을 때, 그 요청 처리 중 외부 저장소(Vercel Blob)에 올라간
 * 이미지들을 되돌립니다. 컨트롤러에서 저장소에 올린 뒤 req.uploadedKeys 배열에
 * key 를 쌓아 두면, 이 함수가 이를 비우면서 해당 Blob 을 삭제합니다.
 *
 * 호출부 패턴 (createReport 등):
 *   req.uploadedKeys = [];
 *   let committed = false;
 *   try {
 *     const { key, url } = await saveImage(file);
 *     req.uploadedKeys.push(key);
 *     ... DB 작업 ...
 *     await client.query('COMMIT'); committed = true;
 *   } finally {
 *     if (!committed) await removeUploadedFiles(req);
 *   }
 */
async function removeUploadedFiles(req) {
  const keys = req?.uploadedKeys;
  if (!Array.isArray(keys) || keys.length === 0) return;
  // 각 삭제 실패는 deleteImage 내부에서 로깅만. 전체 Promise.all 은 reject 되지 않음.
  await Promise.all(keys.map(k => deleteImage(k)));
  req.uploadedKeys = [];
}

module.exports = { removeUploadedFiles };
