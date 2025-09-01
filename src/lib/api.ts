export const toISODate = (d: Date | string) =>
  typeof d === 'string' ? d : new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);

// Helper function to add timeout to fetch requests
function fetchWithTimeout(url: string | URL, options: RequestInit = {}, timeoutMs: number = 10000): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export async function geocode(name: string){
  const startTime = performance.now();
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  
  console.log(`📍 [${new Date().toISOString()}] Geocoding: ${name}`);
  
  try {
    const r = await fetch(url);
    const duration = performance.now() - startTime;
    
    if(!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Geocoding failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Geocoding failed: ${r.status} ${r.statusText}`);
    }
    
    const j = await r.json();
    if(!j.results?.length) {
      console.error(`❌ [${new Date().toISOString()}] Location not found (${duration.toFixed(2)}ms): ${name}`);
      throw new Error('No matching location found');
    }
    
    console.log(`✅ [${new Date().toISOString()}] Geocoding completed (${duration.toFixed(2)}ms): ${j.results[0].name}, ${j.results[0].country}`);
    return j.results[0] as { latitude:number; longitude:number; name:string; country:string; country_code:string };
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Geocoding error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

export async function fetchWeatherDaily(lat:number, lon:number, dateISO:string){
  const startTime = performance.now();
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', dateISO);
  url.searchParams.set('end_date', dateISO);
  
  console.log(`🌤️ [${new Date().toISOString()}] Fetching weather: ${lat}, ${lon} on ${dateISO}`);
  
  try {
    const r = await fetch(url);
    const duration = performance.now() - startTime;
    
    if(!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Weather fetch failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Weather fetch failed: ${r.status} ${r.statusText}`);
    }
    
    const d = await r.json();
    const weather = {
      tmax: d.daily?.temperature_2m_max?.[0] ?? null,
      tmin: d.daily?.temperature_2m_min?.[0] ?? null,
      pprob: d.daily?.precipitation_probability_max?.[0] ?? null,
      wind: d.daily?.wind_speed_10m_max?.[0] ?? null,
    };
    
    console.log(`✅ [${new Date().toISOString()}] Weather fetch completed (${duration.toFixed(2)}ms): ${weather.tmin}°-${weather.tmax}°C, ${weather.pprob}% rain`);
    return weather as { tmax:number|null; tmin:number|null; pprob:number|null; wind:number|null };
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Weather fetch error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

export async function fetchHolidays(code:string, year:string){
  const startTime = performance.now();
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`;
  
  console.log(`🗓️ [${new Date().toISOString()}] Fetching holidays: ${url}`);
  
  try {
    const r = await fetchWithTimeout(url, {}, 8000); // 8 second timeout for holidays
    const duration = performance.now() - startTime;
    
    if(!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Holiday fetch failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Holiday fetch failed: ${r.status} ${r.statusText}`);
    }
    
    // Handle 204 No Content - valid response but no holidays data
    if(r.status === 204) {
      console.log(`✅ [${new Date().toISOString()}] Holiday fetch completed (${duration.toFixed(2)}ms): No holidays found for ${code}/${year}`);
      return [];
    }
    
    const data = await r.json();
    console.log(`✅ [${new Date().toISOString()}] Holiday fetch completed (${duration.toFixed(2)}ms): Found ${data.length} holidays`);
    return data;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Holiday fetch error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

const toRad = (d:number)=> d*Math.PI/180;
const haversine = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const R = 6371; const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};

export async function fetchFestivalsWikidata(lat:number, lon:number, dateISO:string, radiusKm=60){
  const startTime = performance.now();
  
  console.log(`🎪 [${new Date().toISOString()}] Fetching festivals: ${lat}, ${lon} on ${dateISO} (radius: ${radiusKm}km)`);
  
  try {
    const [y,m,d] = dateISO.split('-').map(Number);
    const date = new Date(Date.UTC(y, m-1, d));
    const day = 86400000;
    const startWin = new Date(date.getTime()-7*day);
    const endWin = new Date(date.getTime()+7*day);
    const wkt = `Point(${lon} ${lat})`;
    const query = `SELECT ?item ?itemLabel ?start ?end ?coord ?article WHERE {
      ?item wdt:P31/wdt:P279* wd:Q132241 .
      ?item wdt:P625 ?coord .
      OPTIONAL { ?item wdt:P580 ?start. }
      OPTIONAL { ?item wdt:P582 ?end. }
      SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "${wkt}"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm}". }
      OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 50`;
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('format','json');
    url.searchParams.set('query', query);
    
    const r = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    const duration = performance.now() - startTime;
    
    if(!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Festivals fetch failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Festivals fetch failed: ${r.status} ${r.statusText}`);
    }
    
    const data = await r.json();
    const out: Array<{name:string; url:string|null; start_date:string|null; end_date:string|null; lat:number|null; lon:number|null; distance_km:number|null}> = [];
    
    for(const b of data.results.bindings){
      const label = b.itemLabel?.value as string;
      const article = b.article?.value ?? null;
      const point = (b.coord?.value || '') as string; // Point(lon lat)
      const open = point.indexOf('('), close = point.indexOf(')');
      let lat2: number | null = null, lon2: number | null = null;
      if(open>=0 && close>open){ const parts = point.slice(open+1, close).split(' '); lon2 = parseFloat(parts[0]); lat2 = parseFloat(parts[1]); }
      const start = b.start?.value ? b.start.value.substring(0,10) : null;
      const end = b.end?.value ? b.end.value.substring(0,10) : null;
      let within = true; if(start && end){ within = !(new Date(end) < startWin || new Date(start) > endWin); }
      const distance_km = (lat2!=null && lon2!=null) ? Math.round(haversine(lat, lon, lat2, lon2)) : null;
      if(within) out.push({ name: label, url: article, start_date: start, end_date: end, lat: lat2, lon: lon2, distance_km });
    }
    
    out.sort((a,b)=> ((a.start_date?0:1)-(b.start_date?0:1)) || ((a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)) );
    const result = out.slice(0,10);
    
    console.log(`✅ [${new Date().toISOString()}] Festivals fetch completed (${duration.toFixed(2)}ms): Found ${result.length} festivals`);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Festivals fetch error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

// Fetch holidays and festivals using Gemini AI as a fallback (3-day period)
export async function fetchHolidaysWithGemini(location: string, date: string) {
  const startTime = performance.now();
  
  console.log(`🎊 [${new Date().toISOString()}] Fetching holidays & festivals with Gemini: ${location} around ${date}`);
  
  try {
    const response = await fetch('/api/holidays-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, date })
    });
    
    const duration = performance.now() - startTime;
    
    if (!response.ok) {
      console.error(`❌ [${new Date().toISOString()}] Gemini holidays fetch failed (${duration.toFixed(2)}ms): ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.ok && Array.isArray(data.holidays)) {
      console.log(`✅ [${new Date().toISOString()}] Gemini holidays & festivals fetch completed (${duration.toFixed(2)}ms): Found ${data.holidays.length} events`);
      return data.holidays.map((h: any) => ({
        name: h.name,
        url: h.url || null,
        start_date: h.start_date || null,
        end_date: h.end_date || null,
        lat: null,
        lon: null,
        distance_km: h.distance_km || null
      }));
    } else {
      console.log(`⚠️ [${new Date().toISOString()}] Gemini holidays & festivals returned no results or invalid format`);
      return [];
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Gemini holidays & festivals fetch error (${duration.toFixed(2)}ms):`, error);
    return [];
  }
}
