// 메모리 LRU 캐시. 같은 (출발·도착) 좌표에 대해 TMAP을 짧은 시간 안에 다시 부르지 않기 위해 쓴다.
// - 프로세스 재시작 시 비워진다.
// - 한 Node 프로세스 안에서만 공유된다(멀티 인스턴스 환경이라면 각 인스턴스마다 별도로 유지).
// - TTL과 최대 엔트리는 .env에서 조정할 수 있다 (ROUTE_CACHE_TTL_MS, ROUTE_CACHE_SIZE).

const DEFAULT_TTL_MS = 10 * 60 * 1000;   // 10분
const DEFAULT_MAX = 500;
const KEY_PRECISION = 5;                 // 소수점 5자리 (약 1m 수준)

const ttlMs = parsePositiveInt(process.env.ROUTE_CACHE_TTL_MS, DEFAULT_TTL_MS);
const maxEntries = parsePositiveInt(process.env.ROUTE_CACHE_SIZE, DEFAULT_MAX);

const store = new Map(); // key → { value, expiresAt }

function parsePositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round(n) {
  const f = 10 ** KEY_PRECISION;
  return Math.round(n * f) / f;
}

function cacheKey(fromLat, fromLng, toLat, toLng) {
  return round(fromLat) + ',' + round(fromLng) + '|' + round(toLat) + ',' + round(toLng);
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  // LRU: 최근 사용 → 삽입 순서를 끝으로 다시 보냄
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function set(key, value) {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (store.size > maxEntries) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function size() {
  return store.size;
}

// 테스트·운영 중 수동 플러시 용도
function clear() {
  store.clear();
}

module.exports = { get, set, cacheKey, size, clear };
