/**
 * Fever Event Scraper
 * Fetches real events from FeverUp for better AI recommendations
 */

import * as cheerio from 'cheerio';

const DESCRIPTION_MAX_LENGTH = 360;

function cleanText(value) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

export function truncateText(value, maxLength = DESCRIPTION_MAX_LENGTH) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = cleanText(value);
  if (!text) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

// City slug mapping for Fever URLs
// Note: Using 'en' for all cities to ensure English descriptions in the UI
const FEVER_CITY_SLUGS = {
  'madrid': { slug: 'madrid', lang: 'en', country: 'es' },
  'barcelona': { slug: 'barcelona', lang: 'en', country: 'es' },
  'valencia': { slug: 'valencia', lang: 'en', country: 'es' },
  'sevilla': { slug: 'sevilla', lang: 'en', country: 'es' },
  'bilbao': { slug: 'bilbao', lang: 'en', country: 'es' },
  'london': { slug: 'london', lang: 'en', country: 'uk' },
  'paris': { slug: 'paris', lang: 'en', country: 'fr' },
  'new york': { slug: 'new-york', lang: 'en', country: 'us' },
  'los angeles': { slug: 'los-angeles', lang: 'en', country: 'us' },
  'miami': { slug: 'miami', lang: 'en', country: 'us' },
  'chicago': { slug: 'chicago', lang: 'en', country: 'us' },
  'lisbon': { slug: 'lisbon', lang: 'en', country: 'pt' },
  'porto': { slug: 'porto', lang: 'en', country: 'pt' },
  'rome': { slug: 'rome', lang: 'en', country: 'it' },
  'milan': { slug: 'milan', lang: 'en', country: 'it' },
  'amsterdam': { slug: 'amsterdam', lang: 'en', country: 'nl' },
  'berlin': { slug: 'berlin', lang: 'en', country: 'de' },
  'munich': { slug: 'munich', lang: 'en', country: 'de' }
};

/**
 * Normalize location name for Fever lookup
 */
function normalizeLocationForFever(location) {
  const cityName = location.split(',')[0].trim().toLowerCase();
  
  // Direct match
  if (FEVER_CITY_SLUGS[cityName]) {
    return FEVER_CITY_SLUGS[cityName];
  }
  
  // Fuzzy match
  for (const [key, value] of Object.entries(FEVER_CITY_SLUGS)) {
    if (cityName.includes(key) || key.includes(cityName)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Scrape Fever events for a location
 * @param {string} location - Location name (e.g., "Madrid, Spain")
 * @param {object} options - Additional options
 * @returns {Promise<Array>} Array of events
 */
export async function scrapeFeverEvents(location, options = {}) {
  const startTime = performance.now();
  console.log(`🎪 [Fever] Fetching events for: ${location}`);
  
  try {
    const cityConfig = normalizeLocationForFever(location);
    
    if (!cityConfig) {
      console.log(`⚠️ [Fever] City not supported: ${location}`);
      return [];
    }
    
    const url = `https://feverup.com/${cityConfig.lang}/${cityConfig.slug}`;
    console.log(`🌐 [Fever] Fetching from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      console.error(`❌ [Fever] HTTP error: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const events = [];
    
    // Try to extract events from the page structure
    // Fever uses various selectors, we'll try multiple approaches
    
    // Method 1: Look for event cards with specific class patterns
    $('[class*="event"], [class*="card"], [class*="experience"]').each((index, element) => {
      if (events.length >= 50) return false; // Limit to 50 events

      const $el = $(element);

      // Extract event data
      const title = cleanText(
        $el.find('[class*="title"], h2, h3, h4').first().text()
      ) || cleanText($el.attr('aria-label')) ||
        cleanText($el.find('a').first().attr('aria-label')) ||
        cleanText($el.find('img').first().attr('alt'));

      const linkElement = $el.is('a') ? $el : $el.find('a').first();
      const rawLink = linkElement.attr('href') ||
        linkElement.attr('data-href') ||
        linkElement.attr('data-link') ||
        linkElement.attr('data-url');
      const link = rawLink ? (rawLink.startsWith('http') ? rawLink : `https://feverup.com${rawLink}`) : null;

      const imgSrcRaw = $el.find('img').first().attr('src') || linkElement.attr('data-img');
      const imgSrc = imgSrcRaw ? (imgSrcRaw.startsWith('http') ? imgSrcRaw : `https://feverup.com${imgSrcRaw}`) : null;

      // Try to find price
      const priceText = cleanText($el.find('[class*="price"], [data-test*="price"]').first().text());
      const price = extractPrice(priceText);

      // Try to find category/tags
      const category = cleanText($el.find('[class*="category"], [class*="tag"], [data-test*="category"]').first().text());

      const locationText = extractLocationFromCard($el, linkElement);
      const teaserDescription = cleanText(
        $el.find('[class*="description"], [class*="subtitle"], p').first().text()
      );

      // Only add if we have at least a title
      if (title && title.length > 3 && link && !title.toLowerCase().includes('fever')) {
        events.push({
          title: title,
          url: link,
          price_from: price,
          free: price === 0,
          category: category || 'other',
          image_url: imgSrc,
          source: 'Fever',
          description: teaserDescription || null,
          location: locationText || null,
          address: null,
          suitable_for_kids: inferKidFriendly(title, category)
        });
      }
    });

    // Method 2: Try JSON-LD structured data if available
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((index, element) => {
      try {
        const jsonData = JSON.parse($(element).html());
        if (jsonData['@type'] === 'Event' || jsonData['@type'] === 'EventSeries') {
          const eventData = Array.isArray(jsonData) ? jsonData : [jsonData];
          eventData.forEach(event => {
            if (event.name && events.length < 50) {
              const locationInfo = normalizeLocationData(event.location);
              const priceFromOffers = extractPriceFromOffers(event.offers);
              events.push({
                title: event.name,
                url: event.url || null,
                price_from: priceFromOffers,
                free: priceFromOffers === 0 || event.isAccessibleForFree === true,
                category: event.eventAttendanceMode || 'other',
                description: event.description ? cleanText(event.description).substring(0, 240) : null,
                start_date: event.startDate,
                end_date: event.endDate,
                location: locationInfo.name || null,
                address: locationInfo.address || null,
                image_url: Array.isArray(event.image) ? event.image[0] : event.image,
                source: 'Fever',
                suitable_for_kids: inferKidFriendly(event.name, event.description)
              });
            }
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Deduplicate and merge event data
    const mergedEvents = mergeEvents(events);

    // Optionally enrich with event detail pages for missing info
    if (!options.disableDetailFetch) {
      await enrichEventDetails(mergedEvents, options);
    }

    const duration = performance.now() - startTime;
    console.log(`✅ [Fever] Scraped ${events.length} events in ${duration.toFixed(2)}ms`);

    console.log(`📊 [Fever] Returning ${mergedEvents.length} unique events`);
    return mergedEvents;

  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ [Fever] Scraping error (${duration.toFixed(2)}ms):`, error.message);
    return [];
  }
}

/**
 * Extract price from text
 */
function extractPrice(text) {
  if (!text) return null;
  
  // Look for "Free" or "Gratis"
  if (/free|gratis|gratuito/i.test(text)) {
    return 0;
  }
  
  // Extract numeric price
  const match = text.match(/(\d+[.,]?\d*)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  
  return null;
}

/**
 * Infer if event is kid-friendly based on title/description
 */
function inferKidFriendly(title, description = '') {
  const kidKeywords = [
    'kids', 'children', 'family', 'niños', 'infantil', 'familiar',
    'playground', 'parque', 'museo', 'museum', 'zoo', 'aquarium',
    'jurassic', 'disney', 'animation', 'puppet', 'magic', 'magia',
    'circus', 'circo', 'workshop', 'taller', 'educational'
  ];
  
  const adultKeywords = [
    'cocktail', 'nightclub', 'burlesque', 'drag show', '18+', 'adults only',
    'wine tasting', 'bar crawl', 'bachelor', 'bachelorette'
  ];
  
  const text = `${title} ${description}`.toLowerCase();
  
  // Check for adult-only indicators
  if (adultKeywords.some(keyword => text.includes(keyword))) {
    return false;
  }
  
  // Check for kid-friendly indicators
  if (kidKeywords.some(keyword => text.includes(keyword))) {
    return true;
  }
  
  // Default to potentially suitable (let AI decide)
  return null;
}

function extractLocationFromCard($el, linkElement) {
  const selectors = [
    '[class*="location"]',
    '[class*="venue"]',
    '[data-test*="location"]',
    '[data-testid*="location"]',
    '[data-qa*="location"]'
  ];

  for (const selector of selectors) {
    const text = cleanText($el.find(selector).first().text());
    if (text) {
      return text;
    }
  }

  const attrCandidates = [
    'data-location',
    'data-venue',
    'data-analytics-location',
    'data-analytics-venue',
    'data-place'
  ];

  for (const attr of attrCandidates) {
    const value = cleanText($el.attr(attr) || linkElement?.attr(attr));
    if (value) {
      return value;
    }
  }

  return '';
}

function mergeEvents(events) {
  const result = [];
  const seen = new Map();

  for (const event of events) {
    if (!event || !event.title) continue;

    const dedupeKey = (event.url ? event.url.toLowerCase() : event.title.toLowerCase());
    if (!seen.has(dedupeKey)) {
      seen.set(dedupeKey, { ...event });
      result.push(seen.get(dedupeKey));
    } else {
      const existing = seen.get(dedupeKey);
      mergeEventData(existing, event);
    }
  }

  return result;
}

function mergeEventData(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;

    const currentValue = target[key];
    const isCurrentEmpty = currentValue === undefined || currentValue === null ||
      (typeof currentValue === 'string' && currentValue.trim() === '') ||
      (Array.isArray(currentValue) && currentValue.length === 0);

    if (isCurrentEmpty) {
      target[key] = value;
    }
  }
  return target;
}

function normalizeLocationData(locationData) {
  if (!locationData) {
    return {};
  }

  if (Array.isArray(locationData)) {
    for (const entry of locationData) {
      const normalized = normalizeLocationData(entry);
      if (normalized.name || normalized.address) {
        return normalized;
      }
    }
    return {};
  }

  if (typeof locationData === 'string') {
    return { name: cleanText(locationData) };
  }

  const name = cleanText(locationData.name || locationData['@name']);
  let address = null;
  const addressData = locationData.address;

  if (typeof addressData === 'string') {
    address = cleanText(addressData);
  } else if (addressData && typeof addressData === 'object') {
    const parts = [
      addressData.streetAddress,
      addressData.addressLocality,
      addressData.addressRegion,
      addressData.postalCode,
      addressData.addressCountry
    ].map(cleanText).filter(Boolean);
    if (parts.length > 0) {
      address = parts.join(', ');
    }
  }

  return {
    name: name || null,
    address: address || null
  };
}

function extractPriceFromOffers(offers) {
  if (!offers) {
    return null;
  }

  const offerArray = Array.isArray(offers) ? offers : [offers];
  for (const offer of offerArray) {
    if (!offer) continue;
    if (offer.price !== undefined) {
      const price = parseFloat(offer.price);
      if (!Number.isNaN(price)) {
        return price;
      }
    }

    if (offer.priceSpecification?.price !== undefined) {
      const price = parseFloat(offer.priceSpecification.price);
      if (!Number.isNaN(price)) {
        return price;
      }
    }
  }

  return null;
}

async function enrichEventDetails(events, options = {}) {
  const {
    maxDetailRequests = 6,
    detailConcurrency = 2
  } = options;

  if (!Array.isArray(events) || events.length === 0 || maxDetailRequests <= 0) {
    return;
  }

  const eventsNeedingDetails = events
    .filter(event => event.url && event.url.includes('feverup.com'))
    .filter(event => !event.location || !event.description || !event.start_date || !event.end_date)
    .slice(0, maxDetailRequests);

  if (eventsNeedingDetails.length === 0) {
    return;
  }

  console.log(`🔍 [Fever] Enriching ${eventsNeedingDetails.length} events with detail pages...`);

  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < eventsNeedingDetails.length) {
      const index = currentIndex++;
      const event = eventsNeedingDetails[index];

      try {
        const details = await fetchEventDetails(event.url);

        if (details.description) {
          event.description = details.description;
        }

        if (details.location) {
          event.location = details.location;
        }

        if (details.address) {
          event.address = details.address;
        }

        if (details.start_date) {
          event.start_date = details.start_date;
        }

        if (details.end_date) {
          event.end_date = details.end_date;
        }

        if (details.price_from !== undefined && details.price_from !== null) {
          event.price_from = details.price_from;
          event.free = details.price_from === 0;
        }

        if (details.image_url && !event.image_url) {
          event.image_url = details.image_url;
        }

        if (details.suitable_ages && !event.suitable_ages) {
          event.suitable_ages = details.suitable_ages;
        }
      } catch (err) {
        console.log(`⚠️ [Fever] Detail fetch failed for ${event.url}:`, err.message);
      }
    }
  };

  const workers = Array.from({ length: Math.min(detailConcurrency, eventsNeedingDetails.length) }, () => worker());
  await Promise.all(workers);
}

async function fetchEventDetails(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const details = {};

  const jsonLdData = extractJsonLdData($);
  for (const data of jsonLdData) {
    if (!data || typeof data !== 'object') continue;

    const type = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
    if (type.includes('Event') || type.includes('EventSeries')) {
      if (!details.title && data.name) {
        details.title = cleanText(data.name);
      }

      if (!details.description && data.description) {
        details.description = cleanText(data.description);
      }

      if (!details.start_date && data.startDate) {
        details.start_date = data.startDate;
      }

      if (!details.end_date && data.endDate) {
        details.end_date = data.endDate;
      }

      if (!details.image_url && data.image) {
        details.image_url = Array.isArray(data.image) ? data.image[0] : data.image;
      }

      const locationInfo = normalizeLocationData(data.location);
      if (locationInfo.name && !details.location) {
        details.location = locationInfo.name;
      }
      if (locationInfo.address && !details.address) {
        details.address = locationInfo.address;
      }

      if (details.price_from == null) {
        const priceFromOffers = extractPriceFromOffers(data.offers);
        if (priceFromOffers !== null) {
          details.price_from = priceFromOffers;
        }
      }
    }
  }

  if (!details.description) {
    const metaDescription = $('meta[name="description"]').attr('content');
    if (metaDescription) {
      details.description = cleanText(metaDescription);
    }
  }

  if (!details.location) {
    const fallbackLocation = cleanText($("[class*='location'], [data-test*='location']").first().text());
    if (fallbackLocation) {
      details.location = fallbackLocation;
    }
  }

  // Extract age requirement from description section
  // Look for patterns like "Age requirement: open to all" or "Edad: todas las edades"
  const descriptionText = $('#plan-description, [data-testid="plan-content-description"]').text();
  if (descriptionText) {
    // Try English patterns
    const ageRequirementMatch = descriptionText.match(/Age requirement:\s*([^\n]+)/i);
    if (ageRequirementMatch) {
      const ageText = cleanText(ageRequirementMatch[1]);
      if (ageText) {
        details.suitable_ages = ageText;
      }
    } else {
      // Try Spanish patterns
      const edadMatch = descriptionText.match(/Edad:\s*([^\n]+)/i);
      if (edadMatch) {
        const ageText = cleanText(edadMatch[1]);
        if (ageText) {
          // Translate common Spanish age terms to English
          let translatedAge = ageText
            .replace(/todas las edades/i, 'All ages')
            .replace(/mayores de (\d+) años/i, 'Ages $1+')
            .replace(/de (\d+) a (\d+) años/i, 'Ages $1-$2')
            .replace(/años/i, 'years old');
          details.suitable_ages = translatedAge;
        }
      } else {
        // Try French patterns
        const ageMatch = descriptionText.match(/Âge:\s*([^\n]+)|Âge requis:\s*([^\n]+)/i);
        if (ageMatch) {
          const ageText = cleanText(ageMatch[1] || ageMatch[2]);
          if (ageText) {
            // Translate common French age terms to English
            let translatedAge = ageText
              .replace(/tous âges/i, 'All ages')
              .replace(/ouvert à tous/i, 'All ages')
              .replace(/à partir de (\d+) ans/i, 'Ages $1+')
              .replace(/de (\d+) à (\d+) ans/i, 'Ages $1-$2')
              .replace(/ans/i, 'years old');
            details.suitable_ages = translatedAge;
          }
        }
      }
    }
  }

  return details;
}

function extractJsonLdData($) {
  const data = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const jsonText = $(element).contents().text();
    if (!jsonText) return;

    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        data.push(...parsed);
      } else {
        data.push(parsed);
      }
    } catch (err) {
      // Ignore malformed JSON blocks
    }
  });
  return data;
}

/**
 * Format events for AI consumption
 */
export function formatEventsForAI(events, maxEvents = 30) {
  if (!events || events.length === 0) return null;
  
  // Limit number of events sent to AI to avoid token limits
  const limitedEvents = events.slice(0, maxEvents);
  
  return limitedEvents.map((event, index) => ({
    id: index + 1,
    title: event.title,
    category: event.category || 'other',
    price_from: event.price_from,
    free: event.free,
    description: truncateText(event.description, DESCRIPTION_MAX_LENGTH) ||
      (event.source ? `Event available on ${event.source}` : null),
    url: event.url,
    location: event.location || null,
    address: event.address || null,
    image_url: event.image_url || null,
    suitable_for_kids: event.suitable_for_kids,
    suitable_ages: event.suitable_ages || 'All ages', // Default to "All ages" if not specified
    start_date: event.start_date || null,
    end_date: event.end_date || null,
    source: event.source || null
  }));
}

/**
 * Get Fever events with caching
 */
export async function getFeverEventsWithCache(location, cacheManager = null) {
  const cacheKey = `fever_events:${location.toLowerCase()}`;
  const cacheDuration = 6 * 60 * 60 * 1000; // 6 hours
  
  // Try cache first
  if (cacheManager) {
    try {
      const cached = await cacheManager.get(cacheKey);
      if (cached && cached.timestamp && (Date.now() - cached.timestamp < cacheDuration)) {
        console.log(`⚡ [Fever] Using cached events for ${location}`);
        return cached.events;
      }
    } catch (err) {
      console.log('⚠️ [Fever] Cache read error (non-critical):', err.message);
    }
  }
  
  // Fetch fresh events
  const events = await scrapeFeverEvents(location);
  
  // Cache the results (best effort - don't fail if caching fails)
  if (cacheManager && events.length > 0) {
    try {
      await cacheManager.set(cacheKey, {
        events,
        timestamp: Date.now()
      });
      console.log(`💾 [Fever] Cached ${events.length} events for ${location}`);
    } catch (err) {
      console.log('⚠️ [Fever] Cache write error (non-critical):', err.message);
    }
  }
  
  return events;
}

