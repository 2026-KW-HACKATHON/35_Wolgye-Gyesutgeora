// 서버 호출은 모두 이 파일에서 합니다. (로그인·제보 API는 3, 4단계에서 여기에 추가)

// 태그 목록: [{ id, code, label, category, icon }]
async function fetchTags() {
  const res = await fetch(BASE_URL + '/api/tags');
  if (!res.ok) throw new Error('tags ' + res.status);
  const { tags } = await res.json();
  return tags;
}

// 지도용 제보 목록
async function fetchReports() {
  const res = await fetch(BASE_URL + '/api/reports');
  if (!res.ok) throw new Error('reports ' + res.status);
  const { reports } = await res.json();
  return reports;
}
