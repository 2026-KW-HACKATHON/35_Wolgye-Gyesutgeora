const multer = require('multer');
const path = require('path');

// 사진은 Vercel Blob 등 외부 저장소로 업로드하므로, multer 는 메모리에 받아 두기만
// 하고(file.buffer) 실제 저장은 src/utils/storage.js 의 saveImage 가 처리합니다.
// 로컬 디스크(uploads/) 를 쓰지 않기 때문에 Vercel 서버리스에서도 동작합니다.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다. (jpg, png, webp, heic)'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    files: 3,
  },
});

module.exports = upload;
