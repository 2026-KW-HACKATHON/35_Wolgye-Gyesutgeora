const fs = require('fs');

/**
 * 요청이 거부/실패했을 때 multer가 이미 저장한 사진을 삭제
 */
function removeUploadedFiles(req) {
  for (const f of req.files || []) {
    fs.unlink(f.path, () => {});
  }
}

module.exports = { removeUploadedFiles };
