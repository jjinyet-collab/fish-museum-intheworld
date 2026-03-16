export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
 
  const { q } = req.query;
  if (!q) { res.status(400).json({ error: 'query required' }); return; }
 
  try {
    // 1. FishBase에서 학명 검색
    const searchRes = await fetch(
      `https://fishbase.ropensci.org/species?genus=${encodeURIComponent(q)}&limit=5`,
      { headers: { 'Accept': 'application/json' } }
    );
 
    // 2. 한국어 이름으로도 검색 시도 (학명 매핑)
    const commonRes = await fetch(
      `https://fishbase.ropensci.org/comnames?ComName=${encodeURIComponent(q)}&Language=Korean&limit=5`,
      { headers: { 'Accept': 'application/json' } }
    );
 
    let speciesId = null;
    let speciesData = null;
 
    // 학명 검색 결과 처리
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        speciesId = searchData.data[0].SpecCode;
        speciesData = searchData.data[0];
      }
    }
 
    // 한국어 이름 검색 결과 처리
    if (!speciesId && commonRes.ok) {
      const commonData = await commonRes.json();
      if (commonData.data && commonData.data.length > 0) {
        speciesId = commonData.data[0].SpecCode;
      }
    }
 
    // 영어 common name으로도 재시도
    if (!speciesId) {
      const engRes = await fetch(
        `https://fishbase.ropensci.org/comnames?ComName=${encodeURIComponent(q)}&Language=English&limit=5`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (engRes.ok) {
        const engData = await engRes.json();
        if (engData.data && engData.data.length > 0) {
          speciesId = engData.data[0].SpecCode;
        }
      }
    }
 
    if (!speciesId) {
      res.status(404).json({ error: 'not found' }); return;
    }
 
    // 3. 상세 정보 가져오기
    const [detailRes, ecosysRes, introRes] = await Promise.all([
      fetch(`https://fishbase.ropensci.org/species/${speciesId}`, { headers: { 'Accept': 'application/json' } }),
      fetch(`https://fishbase.ropensci.org/ecology?SpecCode=${speciesId}`, { headers: { 'Accept': 'application/json' } }),
      fetch(`https://fishbase.ropensci.org/comnames?SpecCode=${speciesId}&Language=Korean&limit=1`, { headers: { 'Accept': 'application/json' } }),
    ]);
 
    const detail   = detailRes.ok   ? (await detailRes.json()).data   : null;
    const ecology  = ecosysRes.ok   ? (await ecosysRes.json()).data   : null;
    const korean   = introRes.ok    ? (await introRes.json()).data    : null;
 
    const sp = detail || speciesData;
    if (!sp) { res.status(404).json({ error: 'detail not found' }); return; }
 
    // 4. 응답 포맷 정리
    const eco = ecology && ecology.length > 0 ? ecology[0] : {};
 
    res.status(200).json({
      speciesId,
      scientificName: `${sp.Genus || ''} ${sp.Species || ''}`.trim(),
      englishName:    sp.FBname || sp.fbname || '',
      koreanName:     (korean && korean.length > 0) ? korean[0].ComName : '',
      family:         sp.Family || '',
      order:          sp.Order  || '',
      maxLength:      sp.Length    ? `${sp.Length} cm`  : (sp.LengthFemale ? `${sp.LengthFemale} cm` : '-'),
      commonLength:   sp.CommonLength ? `${sp.CommonLength} cm` : '-',
      weight:         sp.Weight    ? `${sp.Weight} g`   : '-',
      lifespan:       sp.LongevityWild ? `${sp.LongevityWild}년` : '-',
      tempMin:        sp.TempMin   || null,
      tempMax:        sp.TempMax   || null,
      temperature:    (sp.TempMin && sp.TempMax) ? `${sp.TempMin}–${sp.TempMax}°C` : '-',
      phMin:          eco.pHMin    || null,
      phMax:          eco.pHMax    || null,
      ph:             (eco.pHMin && eco.pHMax) ? `${eco.pHMin}–${eco.pHMax}` : '-',
      dangerous:      sp.Dangerous || '-',
      aquarium:       sp.Aquarium  || '-',
      habitat:        sp.Comments  || '',
      picture:        speciesId ? `https://www.fishbase.se/images/species/${sp.PicPreferredName}` : null,
      iucn:           sp.iucn_version || 'LC',
      distribution:   sp.Distribution || '',
    });
 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
 
