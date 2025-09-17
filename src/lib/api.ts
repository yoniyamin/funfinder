import { validateGeocodingResponse, validateWeatherResponse, ValidatedGeocodingResult, ValidatedWeatherApiResponse } from './validation-helpers';

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

export async function geocode(name: string, signal?: AbortSignal){
  const startTime = performance.now();
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  
  console.log(`📍 [${new Date().toISOString()}] Geocoding: ${name}`);
  
  try {
    const r = await fetch(url, { signal });
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
    
    // Validate the geocoding response
    try {
      const validatedResult = validateGeocodingResponse(j.results[0]);
      console.log(`✅ [${new Date().toISOString()}] Geocoding response validated successfully`);
      return validatedResult;
    } catch (validationError) {
      console.warn(`⚠️ [${new Date().toISOString()}] Geocoding response validation failed:`, validationError.message);
      // Return unvalidated result as fallback but log the issue
      return j.results[0] as { latitude:number; longitude:number; name:string; country:string; country_code:string };
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Geocoding error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

export async function fetchWeatherDaily(lat:number, lon:number, dateISO:string, signal?: AbortSignal){
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
    const r = await fetch(url, { signal });
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
    
    // Validate the weather response with graceful degradation
    const validatedWeather = validateWeatherResponse(weather);
    console.log(`✅ [${new Date().toISOString()}] Weather response validated successfully`);
    return validatedWeather;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Weather fetch error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

export async function fetchHolidays(code:string, year:string, signal?: AbortSignal){
  const startTime = performance.now();
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`;
  
  console.log(`🗓️ [${new Date().toISOString()}] Fetching holidays from Nager.Date: ${url}`);
  
  try {
    const r = await fetchWithTimeout(url, { signal }, 8000); // 8 second timeout for holidays
    const duration = performance.now() - startTime;
    
    if(!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Nager.Date holiday fetch failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Holiday fetch failed: ${r.status} ${r.statusText}`);
    }
    
    // Handle 204 No Content - valid response but no holidays data
    if(r.status === 204) {
      console.log(`⚠️ [${new Date().toISOString()}] Nager.Date has no holiday data for ${code}/${year} (${duration.toFixed(2)}ms) - will try fallback APIs`);
      throw new Error(`No holiday data available for country ${code} in Nager.Date API`);
    }
    
    const data = await r.json();
    console.log(`✅ [${new Date().toISOString()}] Nager.Date holiday fetch completed (${duration.toFixed(2)}ms): Found ${data.length} holidays`);
    return data;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Nager.Date holiday fetch error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

// Enhanced holiday fetching with multiple API fallbacks
export async function fetchHolidaysWithFallback(countryCode: string, year: string, location: string, targetDate: string, signal?: AbortSignal) {
  const startTime = performance.now();
  console.log(`🔄 [${new Date().toISOString()}] Starting comprehensive holiday search for ${location} (${countryCode}) on ${targetDate}`);
  
  // Check if this country is known to have issues with standard APIs
  if (isCountryKnownToLackHolidayData(countryCode)) {
    console.log(`🎯 [${new Date().toISOString()}] Country ${countryCode} known to have limited holiday API support - prioritizing enhanced server-side detection`);
    
    // For countries known to have poor API coverage, try enhanced server-side detection first
    try {
      console.log(`🔗 [${new Date().toISOString()}] Using enhanced server-side holiday detection for ${location} (known limited coverage country)`);
      const enhancedResponse = await fetch('/api/holidays-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          location, 
          date: targetDate, 
          countryCode, 
          year 
        }),
        signal
      });
      
      if (enhancedResponse.ok) {
        const enhancedData = await enhancedResponse.json();
        if (enhancedData.ok && enhancedData.holidays && enhancedData.holidays.length > 0) {
          console.log(`✅ [${new Date().toISOString()}] Enhanced server-side holiday detection successful for known problematic country: Found ${enhancedData.holidays.length} holidays via ${enhancedData.source}`);
          return enhancedData.holidays;
        }
      }
    } catch (enhancedError) {
      console.log(`⚠️ [${new Date().toISOString()}] Enhanced server-side holiday detection failed for ${location}: ${enhancedError.message}`);
    }
  }

  // First, try the primary Nager.Date API
  try {
    const nagerHolidays = await fetchHolidays(countryCode, year, signal);
    if (nagerHolidays && nagerHolidays.length > 0) {
      console.log(`✅ [${new Date().toISOString()}] Primary API (Nager.Date) successful for ${countryCode}`);
      return nagerHolidays;
    }
  } catch (nagerError) {
    console.log(`⚠️ [${new Date().toISOString()}] Primary API (Nager.Date) failed for ${countryCode}: ${nagerError.message}`);
  }
  
  // Fallback 1: Try Wikidata SPARQL query (comprehensive holiday + festival data)
  if (location.includes(',')) {
    try {
      console.log(`🌍 [${new Date().toISOString()}] Trying Wikidata SPARQL holiday detection for ${location}`);
      
      // Extract lat/lon if we can (this would need geocoding in a real implementation)
      // For now, we'll use a simplified approach with country-based queries
      const wikidataResults = await fetchHolidaysAndFestivalsWikidata(0, 0, targetDate, countryCode, 100, signal);
      
      if (wikidataResults && wikidataResults.length > 0) {
        const holidays = wikidataResults
          .filter(r => r.type.includes('holiday'))
          .map(h => ({
            date: h.start_date || h.observed_date || targetDate,
            name: h.name,
            localName: h.name,
            countryCode: countryCode,
            fixed: false,
            global: true,
            launchYear: null,
            types: ["Public"]
          }));
          
        if (holidays.length > 0) {
          console.log(`✅ [${new Date().toISOString()}] Wikidata SPARQL successful: Found ${holidays.length} holidays for ${countryCode}`);
          return holidays;
        }
      }
    } catch (wikidataError) {
      console.log(`⚠️ [${new Date().toISOString()}] Wikidata SPARQL failed for ${countryCode}: ${wikidataError.message}`);
    }
  }
  
  // Fallback 2: Try Calendarific API (if API key is available)
  try {
    const calendarificHolidays = await fetchHolidaysFromCalendarific(countryCode, year, signal);
    if (calendarificHolidays && calendarificHolidays.length > 0) {
      console.log(`✅ [${new Date().toISOString()}] Fallback API (Calendarific) successful for ${countryCode}`);
      return calendarificHolidays;
    }
  } catch (calendarificError) {
    console.log(`⚠️ [${new Date().toISOString()}] Fallback API (Calendarific) failed for ${countryCode}: ${calendarificError.message}`);
  }
  
  // Fallback 3: Use enhanced server-side holiday detection (for countries that weren't handled above)
  if (!isCountryKnownToLackHolidayData(countryCode)) {
    try {
      console.log(`🔗 [${new Date().toISOString()}] Trying enhanced server-side holiday detection for ${location}`);
      const enhancedResponse = await fetch('/api/holidays-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          location, 
          date: targetDate, 
          countryCode, 
          year 
        }),
        signal
      });
      
      if (enhancedResponse.ok) {
        const enhancedData = await enhancedResponse.json();
        if (enhancedData.ok && enhancedData.holidays && enhancedData.holidays.length > 0) {
          console.log(`✅ [${new Date().toISOString()}] Enhanced server-side holiday detection successful: Found ${enhancedData.holidays.length} holidays via ${enhancedData.source}`);
          return enhancedData.holidays;
        }
      }
    } catch (enhancedError) {
      console.log(`⚠️ [${new Date().toISOString()}] Enhanced server-side holiday detection failed for ${location}: ${enhancedError.message}`);
    }
  }
  
  // Fallback 4: Direct AI holiday detection (if server-side failed)
  try {
    console.log(`🤖 [${new Date().toISOString()}] Trying direct AI holiday detection for ${location}`);
    const geminiHolidays = await fetchHolidaysWithGemini(location, targetDate, signal);
    if (geminiHolidays && geminiHolidays.length > 0) {
      console.log(`✅ [${new Date().toISOString()}] Direct AI holiday detection successful for ${location}`);
      return geminiHolidays.map((h: any) => ({
        date: h.start_date || targetDate,
        name: h.name,
        localName: h.name,
        countryCode: countryCode,
        fixed: false,
        global: true,
        launchYear: null,
        types: ["Public"]
      }));
    }
  } catch (geminiError) {
    console.log(`⚠️ [${new Date().toISOString()}] Direct AI holiday detection failed for ${location}: ${geminiError.message}`);
  }
  
  const totalDuration = performance.now() - startTime;
  console.log(`❌ [${new Date().toISOString()}] All holiday APIs failed for ${location} (${countryCode}) after ${totalDuration.toFixed(2)}ms`);
  return [];
}

// Calendarific API fallback (requires API key)
async function fetchHolidaysFromCalendarific(countryCode: string, year: string, signal?: AbortSignal) {
  try {
    // Try the HolidayAPI.com free endpoint as a fallback
    const startTime = performance.now();
    const url = `https://holidayapi.com/v1/holidays?pretty&country=${countryCode}&year=${year}`;
    
    console.log(`📋 [${new Date().toISOString()}] Trying free holiday APIs for country ${countryCode}`);
    
    // For now, we'll implement a simple approach that works for common cases
    // In production, you could add API keys for more comprehensive coverage
    const alternateHolidayAPIs = [
      // We could try other free holiday APIs here
      // For now, let's focus on the Gemini AI fallback
    ];
    
    console.log(`📋 [${new Date().toISOString()}] No additional free API configured for ${countryCode} - deferring to AI`);
    throw new Error('Free holiday APIs not configured for this country');
    
  } catch (error) {
    console.log(`📋 [${new Date().toISOString()}] Calendarific/alternate API failed: ${error.message}`);
    throw error;
  }
}

// Enhanced country-specific holiday handling
export function isCountryKnownToLackHolidayData(countryCode: string): boolean {
  // Countries that we know Nager.Date doesn't support
  const unsupportedCountries = [
    'IL', // Israel - confirmed not supported
    'SA', // Saudi Arabia - many APIs don't cover Islamic holidays well
    'AE', // UAE
    'QA', // Qatar
    'BH', // Bahrain
    'KW', // Kuwait
    'OM', // Oman
    'JO', // Jordan
    'LB', // Lebanon
    'SY', // Syria
    'IQ', // Iraq
    'YE', // Yemen
    'LY', // Libya
    'DZ', // Algeria
    'TN', // Tunisia
    'MA', // Morocco
    'EG', // Egypt (some Islamic holidays might be missing)
    'IR', // Iran
    'AF', // Afghanistan
    'PK', // Pakistan
    'BD', // Bangladesh
    'MY', // Malaysia
    'ID', // Indonesia
    'BN', // Brunei
  ];
  
  return unsupportedCountries.includes(countryCode.toUpperCase());
}

const toRad = (d:number)=> d*Math.PI/180;
const haversine = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const R = 6371; const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};

export async function fetchFestivalsWikidata(lat:number, lon:number, dateISO:string, radiusKm=60, signal?: AbortSignal){
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
    
    const r = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' }, signal });
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

// Enhanced Wikidata SPARQL query to fetch both holidays and festivals
export async function fetchHolidaysAndFestivalsWikidata(lat: number, lon: number, dateISO: string, countryCode: string, radiusKm = 100, signal?: AbortSignal) {
  const startTime = performance.now();
  
  console.log(`🌍 [${new Date().toISOString()}] Fetching holidays & festivals via Wikidata SPARQL: ${lat}, ${lon} for ${countryCode} on ${dateISO}`);
  
  try {
    const [y, m, d] = dateISO.split('-').map(Number);
    const targetDate = new Date(Date.UTC(y, m - 1, d));
    const day = 86400000;
    const startWin = new Date(targetDate.getTime() - 7 * day);
    const endWin = new Date(targetDate.getTime() + 7 * day);
    const wkt = `Point(${lon} ${lat})`;
    
    // Map country codes to Wikidata country entities
    const countryEntityMap: { [key: string]: string } = {
      'IL': 'Q801',    // Israel
      'US': 'Q30',     // United States
      'GB': 'Q145',    // United Kingdom
      'DE': 'Q183',    // Germany
      'FR': 'Q142',    // France
      'ES': 'Q29',     // Spain
      'IT': 'Q38',     // Italy
      'JP': 'Q17',     // Japan
      'IN': 'Q668',    // India
      'CN': 'Q148',    // China
      'SA': 'Q851',    // Saudi Arabia
      'AE': 'Q878',    // UAE
      'EG': 'Q79',     // Egypt
      'TR': 'Q43',     // Turkey
      'GR': 'Q41',     // Greece
      'RU': 'Q159',    // Russia
      'CA': 'Q16',     // Canada
      'AU': 'Q408',    // Australia
      'BR': 'Q155',    // Brazil
      'MX': 'Q96',     // Mexico
      'AR': 'Q414',    // Argentina
      'CL': 'Q298',    // Chile
      'TH': 'Q869',    // Thailand
      'MY': 'Q833',    // Malaysia
      'ID': 'Q252',    // Indonesia
      'PH': 'Q928',    // Philippines
      'SG': 'Q334',    // Singapore
      'KR': 'Q884',    // South Korea
      'VN': 'Q881',    // Vietnam
      'ZA': 'Q258',    // South Africa
      'NG': 'Q1033',   // Nigeria
      'KE': 'Q114',    // Kenya
      'MA': 'Q1028',   // Morocco
      'TN': 'Q948',    // Tunisia
      'DZ': 'Q262',    // Algeria
      'LY': 'Q1016',   // Libya
      'JO': 'Q810',    // Jordan
      'LB': 'Q822',    // Lebanon
      'SY': 'Q858',    // Syria
      'IQ': 'Q796',    // Iraq
      'IR': 'Q794',    // Iran
      'AF': 'Q889',    // Afghanistan
      'PK': 'Q843',    // Pakistan
      'BD': 'Q902',    // Bangladesh
    };
    
    const countryEntity = countryEntityMap[countryCode.toUpperCase()];
    
    // Enhanced SPARQL query to fetch both holidays and festivals
    const query = `SELECT DISTINCT ?item ?itemLabel ?start ?end ?coord ?article ?type ?country ?observed WHERE {
      {
        # Public holidays by country
        ?item wdt:P31/wdt:P279* wd:Q1197685 .  # Public holiday
        ${countryEntity ? `?item wdt:P17 wd:${countryEntity} .` : ''}
        OPTIONAL { ?item wdt:P837 ?observed . }  # Observed on
        OPTIONAL { ?item wdt:P580 ?start . }     # Start time
        OPTIONAL { ?item wdt:P582 ?end . }       # End time
        BIND("holiday" AS ?type)
      }
      UNION
      {
        # Religious holidays by country/region
        ?item wdt:P31/wdt:P279* wd:Q1445650 .  # Religious holiday
        ${countryEntity ? `?item wdt:P17 wd:${countryEntity} .` : ''}
        OPTIONAL { ?item wdt:P837 ?observed . }
        OPTIONAL { ?item wdt:P580 ?start . }
        OPTIONAL { ?item wdt:P582 ?end . }
        BIND("religious_holiday" AS ?type)
      }
      UNION
      {
        # Festivals and cultural events with geographic coordinates
        ?item wdt:P31/wdt:P279* wd:Q132241 .   # Festival
        ?item wdt:P625 ?coord .
        OPTIONAL { ?item wdt:P580 ?start . }
        OPTIONAL { ?item wdt:P582 ?end . }
        SERVICE wikibase:around { 
          ?item wdt:P625 ?coord . 
          bd:serviceParam wikibase:center "${wkt}"^^geo:wktLiteral . 
          bd:serviceParam wikibase:radius "${radiusKm}" . 
        }
        BIND("festival" AS ?type)
      }
      
      # Get country information
      OPTIONAL { ?item wdt:P17 ?country . }
      
      # Get Wikipedia article
      OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
      
      # Get labels
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    } LIMIT 100`;
    
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('format', 'json');
    url.searchParams.set('query', query);
    
    console.log(`🔍 [${new Date().toISOString()}] Executing enhanced Wikidata SPARQL query for ${countryCode}`);
    
    const r = await fetch(url, { 
      headers: { 'Accept': 'application/sparql-results+json' }, 
      signal 
    });
    const duration = performance.now() - startTime;
    
    if (!r.ok) {
      console.error(`❌ [${new Date().toISOString()}] Wikidata SPARQL query failed (${duration.toFixed(2)}ms): ${r.status} ${r.statusText}`);
      throw new Error(`Wikidata SPARQL query failed: ${r.status} ${r.statusText}`);
    }
    
    const data = await r.json();
    const out: Array<{
      name: string; 
      url: string | null; 
      start_date: string | null; 
      end_date: string | null; 
      lat: number | null; 
      lon: number | null; 
      distance_km: number | null;
      type: string;
      observed_date: string | null;
    }> = [];
    
    for (const b of data.results.bindings) {
      const label = b.itemLabel?.value as string;
      const article = b.article?.value ?? null;
      const type = b.type?.value || 'event';
      const observed = b.observed?.value ? b.observed.value.substring(0, 10) : null;
      
      // Handle coordinates for festivals
      const point = (b.coord?.value || '') as string;
      const open = point.indexOf('('), close = point.indexOf(')');
      let lat2: number | null = null, lon2: number | null = null;
      if (open >= 0 && close > open) { 
        const parts = point.slice(open + 1, close).split(' '); 
        lon2 = parseFloat(parts[0]); 
        lat2 = parseFloat(parts[1]); 
      }
      
      // Handle dates
      let start = b.start?.value ? b.start.value.substring(0, 10) : null;
      let end = b.end?.value ? b.end.value.substring(0, 10) : null;
      
      // For holidays with observed dates, use that as the primary date
      if (observed && type.includes('holiday')) {
        start = observed;
        end = observed;
      }
      
      // Check if the event is within our time window
      let within = true;
      if (start && end) {
        within = !(new Date(end) < startWin || new Date(start) > endWin);
      } else if (start) {
        within = !(new Date(start) < startWin || new Date(start) > endWin);
      }
      
      const distance_km = (lat2 != null && lon2 != null) ? Math.round(haversine(lat, lon, lat2, lon2)) : null;
      
      if (within && label && label.toLowerCase() !== 'no label') {
        out.push({ 
          name: label, 
          url: article, 
          start_date: start, 
          end_date: end, 
          lat: lat2, 
          lon: lon2, 
          distance_km,
          type,
          observed_date: observed
        });
      }
    }
    
    // Sort by start date, then by distance
    out.sort((a, b) => {
      const aDate = a.start_date || a.observed_date;
      const bDate = b.start_date || b.observed_date;
      return ((aDate ? 0 : 1) - (bDate ? 0 : 1)) || ((a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
    });
    
    const result = out.slice(0, 20);
    
    const holidayCount = result.filter(r => r.type.includes('holiday')).length;
    const festivalCount = result.filter(r => r.type === 'festival').length;
    
    console.log(`✅ [${new Date().toISOString()}] Wikidata SPARQL query completed (${duration.toFixed(2)}ms): Found ${holidayCount} holidays and ${festivalCount} festivals`);
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Wikidata SPARQL query error (${duration.toFixed(2)}ms):`, error);
    throw error;
  }
}

// Fetch holidays and festivals using Gemini AI as a fallback (3-day period)
export async function fetchHolidaysWithGemini(location: string, date: string, signal?: AbortSignal) {
  const startTime = performance.now();
  
  console.log(`🎊 [${new Date().toISOString()}] Fetching holidays & festivals with Gemini: ${location} around ${date}`);
  
  try {
    const response = await fetch('/api/holidays-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, date }),
      signal
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
