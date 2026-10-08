
function markerCategory(codes) {
  const tags = Array.isArray(codes) ? codes : [];
  const categories = tags.map(code => (tagInfo[code] || {}).category);

  if (categories.includes('physical')) return 'physical';
  if (categories.includes('temp')) return 'temp';
  if (tags.includes('safety_path')) return 'safe';
  return 'other';
}

const CATEGORY_MARKER_ICONS = {
  physical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>',
  temp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 20h18L12 3Z"/><path d="M10 10h4M8 15h8"/></svg>',
  safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 10v7"/><path d="M12 7h.01"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/></svg>'
};

const CATEGORY_MARKER_LABELS = {
  physical: '물리적 장애',
  temp: '임시 장애물',
  safe: '여성 안심길',
  other: '기타'
};
