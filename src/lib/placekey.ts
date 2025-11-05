/**
 * PlaceKey: Canonical place identifier using stable IDs instead of strings
 * 
 * This solves the "Lisbon, Ohio" vs "Lisbon, Portugal" problem by using
 * stable canonical IDs (GeoNames, OSM, etc.) instead of location strings.
 */

export type PlaceKey = {
  provider: 'openmeteo' | 'geonames' | 'osm' | 'google' | 'wikidata';
  id: string | number;
  country_code: string; // ISO-3166-1 alpha-2 (US, PT, etc.)
  admin1_code?: string; // ISO-3166-2 (US-OH, PT-11, etc.)
  name: string;
  lat: number;
  lon: number;
  population?: number;
  feature_class?: string; // GeoNames: P (populated place)
  feature_code?: string; // GeoNames: PPLC, PPLA, PPLA2, PPL
};

/**
 * Get a stable cache key from PlaceKey
 */
export function getPlaceKeyCacheKey(placeKey: PlaceKey): string {
  return `${placeKey.provider}:${placeKey.id}`;
}

/**
 * Get a display string for PlaceKey (for UI)
 */
export function getPlaceKeyDisplayString(placeKey: PlaceKey, includeState = true): string {
  if (includeState && placeKey.admin1_code) {
    // Extract state name from ISO code (e.g., "US-OH" -> "OH")
    const stateCode = placeKey.admin1_code.split('-').pop();
    return `${placeKey.name}, ${stateCode}, ${placeKey.country_code}`;
  }
  return `${placeKey.name}, ${placeKey.country_code}`;
}

/**
 * US State name to ISO-3166-2 code mapping
 */
const US_STATE_TO_CODE: Record<string, string> = {
  'Alabama': 'US-AL', 'Alaska': 'US-AK', 'Arizona': 'US-AZ', 'Arkansas': 'US-AR',
  'California': 'US-CA', 'Colorado': 'US-CO', 'Connecticut': 'US-CT', 'Delaware': 'US-DE',
  'Florida': 'US-FL', 'Georgia': 'US-GA', 'Hawaii': 'US-HI', 'Idaho': 'US-ID',
  'Illinois': 'US-IL', 'Indiana': 'US-IN', 'Iowa': 'US-IA', 'Kansas': 'US-KS',
  'Kentucky': 'US-KY', 'Louisiana': 'US-LA', 'Maine': 'US-ME', 'Maryland': 'US-MD',
  'Massachusetts': 'US-MA', 'Michigan': 'US-MI', 'Minnesota': 'US-MN', 'Mississippi': 'US-MS',
  'Missouri': 'US-MO', 'Montana': 'US-MT', 'Nebraska': 'US-NE', 'Nevada': 'US-NV',
  'New Hampshire': 'US-NH', 'New Jersey': 'US-NJ', 'New Mexico': 'US-NM', 'New York': 'US-NY',
  'North Carolina': 'US-NC', 'North Dakota': 'US-ND', 'Ohio': 'US-OH', 'Oklahoma': 'US-OK',
  'Oregon': 'US-OR', 'Pennsylvania': 'US-PA', 'Rhode Island': 'US-RI', 'South Carolina': 'US-SC',
  'South Dakota': 'US-SD', 'Tennessee': 'US-TN', 'Texas': 'US-TX', 'Utah': 'US-UT',
  'Vermont': 'US-VT', 'Virginia': 'US-VA', 'Washington': 'US-WA', 'West Virginia': 'US-WV',
  'Wisconsin': 'US-WI', 'Wyoming': 'US-WY',
  // Also map abbreviations
  'AL': 'US-AL', 'AK': 'US-AK', 'AZ': 'US-AZ', 'AR': 'US-AR',
  'CA': 'US-CA', 'CO': 'US-CO', 'CT': 'US-CT', 'DE': 'US-DE',
  'FL': 'US-FL', 'GA': 'US-GA', 'HI': 'US-HI', 'ID': 'US-ID',
  'IL': 'US-IL', 'IN': 'US-IN', 'IA': 'US-IA', 'KS': 'US-KS',
  'KY': 'US-KY', 'LA': 'US-LA', 'ME': 'US-ME', 'MD': 'US-MD',
  'MA': 'US-MA', 'MI': 'US-MI', 'MN': 'US-MN', 'MS': 'US-MS',
  'MO': 'US-MO', 'MT': 'US-MT', 'NE': 'US-NE', 'NV': 'US-NV',
  'NH': 'US-NH', 'NJ': 'US-NJ', 'NM': 'US-NM', 'NY': 'US-NY',
  'NC': 'US-NC', 'ND': 'US-ND', 'OH': 'US-OH', 'OK': 'US-OK',
  'OR': 'US-OR', 'PA': 'US-PA', 'RI': 'US-RI', 'SC': 'US-SC',
  'SD': 'US-SD', 'TN': 'US-TN', 'TX': 'US-TX', 'UT': 'US-UT',
  'VT': 'US-VT', 'VA': 'US-VA', 'WA': 'US-WA', 'WV': 'US-WV',
  'WI': 'US-WI', 'WY': 'US-WY'
};

/**
 * Normalize US state name/abbreviation to ISO-3166-2 code
 */
export function normalizeUSState(state: string): string | null {
  const normalized = state.trim();
  const code = US_STATE_TO_CODE[normalized] || US_STATE_TO_CODE[normalized.toUpperCase()];
  return code || null;
}

/**
 * Extract admin1 code from Open-Meteo admin1 field
 * Open-Meteo returns admin1 as a string (e.g., "Ohio", "OH")
 * We need to convert to ISO-3166-2 format for US states
 */
export function normalizeAdmin1Code(admin1: string | undefined, countryCode: string): string | undefined {
  if (!admin1) return undefined;
  
  // For US, convert state name/abbreviation to ISO-3166-2
  if (countryCode === 'US') {
    const isoCode = normalizeUSState(admin1);
    return isoCode || undefined;
  }
  
  // For other countries, try to construct ISO-3166-2 format
  // This is a simplified approach - full implementation would need a mapping
  // For now, return as-is if it looks like an ISO code, otherwise return undefined
  if (admin1.includes('-')) {
    return admin1; // Already in ISO format
  }
  
  // Could add more country-specific mappings here
  return undefined;
}

/**
 * Parse input string to extract city, state, country parts
 */
export function parseLocationInput(input: string): {
  city: string;
  state?: string;
  country?: string;
  raw: string;
} {
  const parts = input.split(',').map(p => p.trim());
  
  if (parts.length === 1) {
    return { city: parts[0], raw: input };
  } else if (parts.length === 2) {
    return { city: parts[0], country: parts[1], raw: input };
  } else if (parts.length === 3) {
    return { city: parts[0], state: parts[1], country: parts[2], raw: input };
  }
  
  // More than 3 parts - take first as city, last as country, middle as state
  return {
    city: parts[0],
    state: parts.slice(1, -1).join(', '),
    country: parts[parts.length - 1],
    raw: input
  };
}

/**
 * Rank and filter geocoding candidates
 */
export function rankCandidates(
  candidates: any[],
  desiredCountry?: string,
  desiredAdmin1?: string,
  originalCityName?: string
): any[] {
  return candidates
    .filter(c => {
      // Must be a populated place (feature class P in GeoNames terms)
      // Open-Meteo doesn't have feature_class, so we'll skip this filter for now
      
      // Filter by country if specified
      // Check both country_code (e.g., "PT") and country name (e.g., "Portugal")
      if (desiredCountry) {
        const matchesCode = c.country_code === desiredCountry;
        const matchesName = c.country?.toUpperCase() === desiredCountry;
        
        if (!matchesCode && !matchesName) {
          return false;
        }
      }
      
      // Filter by admin1 if specified
      if (desiredAdmin1 && c.admin1) {
        const candidateAdmin1 = normalizeAdmin1Code(c.admin1, c.country_code);
        if (candidateAdmin1 !== desiredAdmin1) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      // First priority: exact admin1 match (if specified)
      if (desiredAdmin1) {
        const aAdmin1 = normalizeAdmin1Code(a.admin1, a.country_code);
        const bAdmin1 = normalizeAdmin1Code(b.admin1, b.country_code);
        const aMatches = aAdmin1 === desiredAdmin1;
        const bMatches = bAdmin1 === desiredAdmin1;
        
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
      }
      
      // Second priority: exact city name match (case-insensitive)
      if (originalCityName) {
        const aNameMatch = a.name?.toLowerCase() === originalCityName.toLowerCase();
        const bNameMatch = b.name?.toLowerCase() === originalCityName.toLowerCase();
        
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
      }
      
      // Third priority: higher population (as tiebreaker)
      const popA = a.population || 0;
      const popB = b.population || 0;
      if (popB !== popA) {
        return popB - popA;
      }
      
      return 0;
    });
}

/**
 * Convert Open-Meteo geocoding result to PlaceKey
 */
export function openMeteoResultToPlaceKey(result: any): PlaceKey {
  // Generate a stable ID from lat/lon (rounded to 4 decimals) + name
  // This is not ideal but Open-Meteo doesn't provide a stable ID
  // In production, you'd want to use GeoNames or OSM for stable IDs
  const stableId = `${result.latitude.toFixed(4)},${result.longitude.toFixed(4)}`;
  
  const admin1Code = normalizeAdmin1Code(result.admin1, result.country_code);
  
  return {
    provider: 'openmeteo',
    id: stableId,
    country_code: result.country_code,
    admin1_code: admin1Code,
    name: result.name,
    lat: result.latitude,
    lon: result.longitude,
    population: result.population,
  };
}

/**
 * Reverse geocode coordinates to validate PlaceKey
 * Note: Open-Meteo doesn't have a direct reverse geocoding endpoint
 * We'll use a nearby search instead (within 1km radius)
 */
export async function reverseGeocode(lat: number, lon: number): Promise<{
  country_code: string;
  admin1?: string;
  name: string;
}> {
  try {
    // Use forward geocoding with coordinates as a workaround
    // Search for nearby places using a small radius
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    // Format: lat,lon as a location string
    url.searchParams.set('name', `${lat.toFixed(4)},${lon.toFixed(4)}`);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'en');
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      // Fallback: try searching with a nearby city name pattern
      // This is a limitation - Open-Meteo doesn't have true reverse geocoding
      // For now, we'll return the coordinates as-is and skip validation
      throw new Error('No reverse geocoding results found');
    }
    
    const result = data.results[0];
    // Check if result is reasonably close (within 10km)
    const distance = Math.sqrt(
      Math.pow(result.latitude - lat, 2) + Math.pow(result.longitude - lon, 2)
    ) * 111; // Rough km conversion
    
    if (distance > 10) {
      throw new Error('Reverse geocoding result too far from coordinates');
    }
    
    return {
      country_code: result.country_code,
      admin1: result.admin1,
      name: result.name,
    };
  } catch (error) {
    // Don't log errors - this is expected to fail for Open-Meteo
    // The caller will handle the error gracefully
    throw error;
  }
}

/**
 * Validate PlaceKey by reverse geocoding
 */
export async function validatePlaceKey(placeKey: PlaceKey): Promise<boolean> {
  try {
    const reverse = await reverseGeocode(placeKey.lat, placeKey.lon);
    
    // Check country matches
    if (reverse.country_code !== placeKey.country_code) {
      return false;
    }
    
    // Check admin1 matches if both are present
    if (placeKey.admin1_code && reverse.admin1) {
      const reverseAdmin1 = normalizeAdmin1Code(reverse.admin1, reverse.country_code);
      if (reverseAdmin1 !== placeKey.admin1_code) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    // Reverse geocoding is not supported by Open-Meteo, so this is expected to fail
    // Silently return false - validation is informational, not blocking
    return false;
  }
}

