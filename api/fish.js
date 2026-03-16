export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q) return new Response(JSON.stringify({ error: 'query required' }), {
    status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });

  try {
    // 1. Wikipedia 검색 — 한국어 우선
    const koSearch = await fetch(
      `https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'FishMuseumApp/1.0' } }
    );

    // 2. 영어 Wikipedia도 병렬로
    const enSearch = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q + ' fish')}`,
      { headers: { 'User-Agent': 'FishMuseumApp/1.0' } }
    );

    const koData = koSearch.ok ? await koSearch.json() : null;
    const enData = enSearch.ok ? await enSearch.json() : null;

    // 둘 다 없으면
    if (!koData && !enData) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const ko = koData?.type === 'standard' ? koData : null;
    const en = enData?.type === 'standard' ? enData : null;

    const summary = ko?.extract || en?.extract || '';
    const title   = ko?.title   || en?.title   || q;
    const enTitle = en?.title   || '';
    const thumbnail = ko?.thumbnail?.source || en?.thumbnail?.source || null;

    // extract에서 학명 파싱 시도
    const sciMatch = summary.match(/\(([A-Z][a-z]+ [a-z]+(?:\s[a-z]+)?)\)/);
    const scientificName = sciMatch ? sciMatch[1] : '';

    // 수온, 수명 등 간단 파싱
    const tempMatch  = summary.match(/(\d+)[~\-–](\d+)\s*[°℃C]/);
    const temperature = tempMatch ? `${tempMatch[1]}–${tempMatch[2]}°C` : '-';

    const lifeMatch = summary.match(/(\d+)[~\-–]?(\d+)?\s*년/);
    const lifespan  = lifeMatch
      ? (lifeMatch[2] ? `${lifeMatch[1]}–${lifeMatch[2]}년` : `${lifeMatch[1]}년`)
      : '-';

    const sizeMatch = summary.match(/(\d+(?:\.\d+)?)\s*cm/);
    const maxSize   = sizeMatch ? `${sizeMatch[1]} cm` : '-';

    // 해수/담수 판별
    const waterKeywords = ['해수','바다','coral','ocean','marine','reef','saltwater'];
    const freshKeywords = ['담수','민물','freshwater','river','lake','stream'];
    const lowerSummary  = summary.toLowerCase();
    const waterType = waterKeywords.some(k => lowerSummary.includes(k)) ? '해수'
                    : freshKeywords.some(k => lowerSummary.includes(k)) ? '담수'
                    : '미확인';

    return new Response(JSON.stringify({
      koreanName:     title,
      englishName:    enTitle.replace(/ fish$/i, ''),
      scientificName,
      classification: '-',
      lifespan,
      maxSize,
      temperature,
      ph:             '-',
      minTank:        '-',
      conservationStatus: 'LC',
      difficulty:     '중급자',
      waterType,
      price:          '시세 확인 중',
      habitat:        summary.slice(0, 200) + (summary.length > 200 ? '...' : ''),
      description:    summary.slice(0, 300) + (summary.length > 300 ? '...' : ''),
      picture:        thumbnail,
      tips: [
        '전문 판매점에 문의해 적정 수조 크기를 확인하세요.',
        '수질 및 수온을 종에 맞게 유지해주세요.',
        '합사 가능한 어종을 미리 확인하세요.',
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
