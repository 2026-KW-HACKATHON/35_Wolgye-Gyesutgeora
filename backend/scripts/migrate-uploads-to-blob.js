/**
 * 로컬 uploads/ 폴더의 사진을 Vercel Blob 으로 옮기고
 * report_images 테이블의 filename·url 컬럼을 새 값으로 업데이트합니다.
 *
 * 사용법:
 *   1) backend/.env 에 다음을 설정
 *      - DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD : 옮길 대상 DB (Neon 등)
 *      - DB_SSL=true  (클라우드 DB 면)
 *      - BLOB_READ_WRITE_TOKEN=<Vercel 대시보드 → Storage → Blob → 토큰 복사>
 *      - UPLOAD_DIR=uploads  (기본값, 다른 폴더면 지정)
 *   2) node scripts/migrate-uploads-to-blob.js          ← 미리보기(DRY-RUN, 실제 변경 X)
 *      node scripts/migrate-uploads-to-blob.js --apply  ← 실제 업로드 + DB 업데이트
 *
 * 안전:
 *  - 로컬 uploads/ 폴더는 지우지 않습니다 (백업).
 *  - url 이 이미 http(s)://로 시작하는 레코드는 이미 Blob 으로 이전된 것으로 보고 스킵.
 *  - 파일이 사라졌거나 접근 실패한 레코드는 로그만 남기고 다음으로.
 *  - 레코드 단위로: Blob 업로드 성공 → DB UPDATE 성공. 둘 중 하나라도 실패하면 로그에 기록.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { put } = require('@vercel/blob');

const APPLY = process.argv.includes('--apply');
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

const CONTENT_TYPE_BY_EXT = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

const useSSL = process.env.DB_SSL === 'true';
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN 환경변수가 필요합니다.');
    console.error('Vercel 대시보드 → Storage → Blob store → ".env.local" 토큰을 복사해 .env 에 넣으세요.');
    process.exit(1);
  }
  console.log(`[config] upload dir : ${UPLOAD_DIR}`);
  console.log(`[config] mode       : ${APPLY ? 'APPLY (실제 업로드+DB UPDATE)' : 'DRY-RUN (미리보기, --apply 로 실제 실행)'}`);

  // 레거시 레코드는 url 이 '/uploads/<파일명>' 꼴.
  // 이미 Blob 으로 이전된 레코드는 http(s)://로 시작하므로 WHERE 로 걸러낸다.
  const { rows } = await pool.query(
    `SELECT id, report_id, filename, original, url, sort_order
     FROM report_images
     WHERE url NOT LIKE 'http://%' AND url NOT LIKE 'https://%'
     ORDER BY report_id, sort_order`
  );
  console.log(`[info] 대상 레코드: ${rows.length}건\n`);

  let ok = 0, missing = 0, failed = 0;

  for (const row of rows) {
    const localName = row.filename;
    const localPath = path.join(UPLOAD_DIR, localName);

    if (!fs.existsSync(localPath)) {
      console.warn(`[miss] ${row.id} filename=${localName} → 로컬 파일 없음`);
      missing++;
      continue;
    }

    const ext = path.extname(localName).toLowerCase() || '.jpg';
    // 기존 UUID 파일명을 그대로 Blob key 로 사용 (충돌 가능성 극히 낮음)
    const key = `reports/${localName}`;
    const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

    if (!APPLY) {
      console.log(`[dry ] ${row.id} ${localName} → ${key} (${contentType})`);
      ok++;
      continue;
    }

    try {
      const buf = fs.readFileSync(localPath);
      const { url } = await put(key, buf, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      });
      await pool.query(
        'UPDATE report_images SET filename = $1, url = $2 WHERE id = $3',
        [key, url, row.id]
      );
      console.log(`[ok  ] ${row.id} ${localName} → ${url}`);
      ok++;
    } catch (err) {
      console.error(`[fail] ${row.id} ${localName}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n요약: ok=${ok}, missing=${missing}, failed=${failed}`);
  if (!APPLY && ok > 0) {
    console.log('실제 실행하려면: node scripts/migrate-uploads-to-blob.js --apply');
  }
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
