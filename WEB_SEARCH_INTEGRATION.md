# Web Search Integration Guide

This guide explains how to enhance the Kids Activities Finder with real web search capabilities to get Google AI Overview-style results.

## Current Implementation

The app currently includes:
- ✅ Basic web search with URL checking for trusted sources (Lonely Planet, Time Out)
- ✅ Enhanced event intelligence with location-specific festival data
- ✅ Simulated AI Overview-style responses for major cities
- ✅ Web source attribution in results

## Production Search API Integration

### 1. Google Custom Search API (Recommended)

To get Google search results similar to AI Overview:

```javascript
// Add to server/index.js
async function searchWithGoogleAPI(query, location) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  const searchQuery = `${location} family activities kids events festivals today`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=10`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return data.items?.map(item => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    source: 'Google Search'
  })) || [];
}
```

**Setup:**
1. Get API key from [Google Cloud Console](https://console.cloud.google.com/)
2. Create Custom Search Engine at [Google CSE](https://cse.google.com/)
3. Add environment variables:
   ```bash
   GOOGLE_SEARCH_API_KEY=your_api_key_here
   GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
   ```

### 2. Bing Search API (Alternative)

```javascript
async function searchWithBingAPI(query, location) {
  const apiKey = process.env.BING_SEARCH_API_KEY;
  const endpoint = 'https://api.bing.microsoft.com/v7.0/search';
  
  const searchQuery = `${location} family activities kids events`;
  const url = `${endpoint}?q=${encodeURIComponent(searchQuery)}&count=10`;
  
  const response = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey }
  });
  
  const data = await response.json();
  return data.webPages?.value?.map(item => ({
    title: item.name,
    url: item.url,
    snippet: item.snippet,
    source: 'Bing Search'
  })) || [];
}
```

### 3. Event-Specific APIs

#### Eventbrite API
```javascript
async function getEventbriteEvents(location, date) {
  const token = process.env.EVENTBRITE_API_KEY;
  const url = `https://www.eventbriteapi.com/v3/events/search/`;
  
  const params = new URLSearchParams({
    'q': 'family kids children',
    'location.address': location,
    'start_date.keyword': 'today',
    'token': token
  });
  
  const response = await fetch(`${url}?${params}`);
  const data = await response.json();
  
  return data.events?.map(event => ({
    title: event.name.text,
    url: event.url,
    snippet: event.description?.text?.substring(0, 200) + '...',
    source: 'Eventbrite',
    date: event.start.local,
    venue: event.venue?.name
  })) || [];
}
```

#### Ticketmaster API
```javascript
async function getTicketmasterEvents(location) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const url = 'https://app.ticketmaster.com/discovery/v2/events.json';
  
  const params = new URLSearchParams({
    'apikey': apiKey,
    'city': location.split(',')[0],
    'classificationName': 'Family',
    'size': 10
  });
  
  const response = await fetch(`${url}?${params}`);
  const data = await response.json();
  
  return data._embedded?.events?.map(event => ({
    title: event.name,
    url: event.url,
    snippet: event.pleaseNote || event.info || 'Family-friendly event',
    source: 'Ticketmaster',
    date: event.dates.start.localDate,
    venue: event._embedded?.venues?.[0]?.name
  })) || [];
}
```

## Advanced Web Scraping (Use with Caution)

⚠️ **Important**: Web scraping may violate terms of service. Always check robots.txt and ToS before implementing.

### Scraping Travel Sites

```javascript
import * as cheerio from 'cheerio';

async function scrapeLonelyPlanet(location) {
  try {
    const url = `https://www.lonelyplanet.com/articles/${location}-with-kids`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KidsActivitiesFinder/1.0)'
      }
    });
    
    if (!response.ok) return [];
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const activities = [];
    $('.activity-card').each((i, elem) => {
      activities.push({
        title: $(elem).find('.title').text().trim(),
        description: $(elem).find('.description').text().trim(),
        source: 'Lonely Planet'
      });
    });
    
    return activities;
  } catch (error) {
    console.log('Scraping failed:', error.message);
    return [];
  }
}
```

## Getting AI Overview-Style Content

### Strategy 1: Enhanced Search Queries

Use specific search patterns that trigger rich results:

```javascript
const enhancedQueries = [
  `${location} festivals today events happening now`,
  `${location} family activities kids current events`,
  `${location} what to do with children this week`,
  `${location} concerts shows family friendly today`
];
```

### Strategy 2: Multiple Source Aggregation

Combine multiple APIs for comprehensive results:

```javascript
async function getComprehensiveEventData(location, date) {
  const [googleResults, eventbriteEvents, ticketmasterEvents] = await Promise.all([
    searchWithGoogleAPI('events festivals', location),
    getEventbriteEvents(location, date),
    getTicketmasterEvents(location)
  ]);
  
  return {
    web_results: googleResults,
    ticketed_events: [...eventbriteEvents, ...ticketmasterEvents],
    search_quality: 'comprehensive'
  };
}
```

### Strategy 3: Local Tourism APIs

Many cities have official tourism APIs:

```javascript
// Madrid Example
async function getMadridEvents() {
  const url = 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';
  const response = await fetch(url);
  const data = await response.json();
  
  return data['@graph']?.map(event => ({
    title: event.title,
    description: event.description,
    date: event.dtstart,
    location: event.location?.locality,
    source: 'Madrid Open Data'
  })) || [];
}
```

## Environment Setup

Add these environment variables to your `.env` file:

```bash
# Search APIs
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_custom_search_engine_id
BING_SEARCH_API_KEY=your_bing_api_key

# Event APIs
EVENTBRITE_API_KEY=your_eventbrite_token
TICKETMASTER_API_KEY=your_ticketmaster_api_key

# Optional: Other APIs
FOURSQUARE_API_KEY=your_foursquare_key
YELP_API_KEY=your_yelp_key
```

## Rate Limiting & Caching

Implement caching to avoid hitting API limits:

```javascript
const cache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function cachedSearch(query, location) {
  const cacheKey = `${query}_${location}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const results = await searchWithGoogleAPI(query, location);
  cache.set(cacheKey, {
    data: results,
    timestamp: Date.now()
  });
  
  return results;
}
```

## Integration Steps

1. **Choose your primary search API** (Google Custom Search recommended)
2. **Set up API credentials** and test with simple queries
3. **Replace mock functions** in `server/index.js` with real API calls
4. **Add error handling** and fallbacks for when APIs fail
5. **Implement caching** to reduce API costs and improve performance
6. **Test thoroughly** with different locations and dates
7. **Monitor API usage** and costs

## Cost Considerations

- **Google Custom Search**: $5 per 1,000 queries (100 free per day)
- **Bing Search**: $7 per 1,000 queries  
- **Eventbrite**: Free tier available
- **Ticketmaster**: Free with rate limits

## Legal Considerations

1. **API Terms of Service**: Always comply with each API's ToS
2. **Attribution**: Properly credit data sources
3. **Rate Limits**: Respect API rate limiting
4. **Data Privacy**: Handle user queries appropriately
5. **Web Scraping**: Use only when allowed by robots.txt and ToS

---

With these integrations, your Kids Activities Finder will provide current, comprehensive information similar to Google's AI Overview, giving users the most up-to-date activity recommendations for their location and date.

