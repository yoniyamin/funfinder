/**
 * Fever Event Scraper
 * Fetches real events from FeverUp for better AI recommendations
 */

import * as cheerio from 'cheerio';

// City slug mapping for Fever URLs
const FEVER_CITY_SLUGS = {
  'madrid': { slug: 'madrid', lang: 'es', country: 'es' },
  'barcelona': { slug: 'barcelona', lang: 'es', country: 'es' },
  'valencia': { slug: 'valencia', lang: 'es', country: 'es' },
  'sevilla': { slug: 'sevilla', lang: 'es', country: 'es' },
  'bilbao': { slug: 'bilbao', lang: 'es', country: 'es' },
  'london': { slug: 'london', lang: 'en', country: 'uk' },
  'paris': { slug: 'paris', lang: 'fr', country: 'fr' },
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
      const title = $el.find('[class*="title"], h2, h3, h4').first().text().trim() ||
                   $el.find('a').first().attr('aria-label') ||
                   $el.find('img').first().attr('alt');
      
      const link = $el.find('a').first().attr('href');
      const imgSrc = $el.find('img').first().attr('src');
      
      // Try to find price
      const priceText = $el.find('[class*="price"]').first().text().trim();
      const price = extractPrice(priceText);
      
      // Try to find category/tags
      const category = $el.find('[class*="category"], [class*="tag"]').first().text().trim();
      
      // Only add if we have at least a title
      if (title && title.length > 3 && !title.toLowerCase().includes('fever')) {
        events.push({
          title: title,
          url: link ? (link.startsWith('http') ? link : `https://feverup.com${link}`) : null,
          price_from: price,
          free: price === 0,
          category: category || 'other',
          image_url: imgSrc,
          source: 'Fever',
          description: null, // Will be populated if we click into the event
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
              events.push({
                title: event.name,
                url: event.url || null,
                price_from: event.offers?.price ? parseFloat(event.offers.price) : null,
                free: event.offers?.price === 0 || event.isAccessibleForFree === true,
                category: event.eventAttendanceMode || 'other',
                description: event.description?.substring(0, 200),
                start_date: event.startDate,
                end_date: event.endDate,
                location: event.location?.name,
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
    
    const duration = performance.now() - startTime;
    console.log(`✅ [Fever] Scraped ${events.length} events in ${duration.toFixed(2)}ms`);
    
    // Deduplicate by title
    const uniqueEvents = [];
    const seenTitles = new Set();
    
    for (const event of events) {
      if (!seenTitles.has(event.title)) {
        seenTitles.add(event.title);
        uniqueEvents.push(event);
      }
    }
    
    console.log(`📊 [Fever] Returning ${uniqueEvents.length} unique events`);
    return uniqueEvents;
    
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
    description: event.description || `Event available in ${event.source}`,
    url: event.url,
    suitable_for_kids: event.suitable_for_kids,
    start_date: event.start_date || null,
    end_date: event.end_date || null
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

