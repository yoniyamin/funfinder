/**
 * Weather and Festival Cache Manager
 * Provides strict caching for weather data and range-based caching for festivals/holidays
 */

export class WeatherFestivalCache {
  constructor(neo4jDataManager) {
    this.dataManager = neo4jDataManager;
  }

  /**
   * Cache weather data with strict location + date matching
   */
  async cacheWeatherData(location, date, weatherData) {
    await this.dataManager.ensureConnection();
    const session = this.dataManager.driver.session({ database: this.dataManager.database });
    
    try {
      const weatherKey = this.generateWeatherKey(location, date);
      const weatherJson = JSON.stringify(weatherData);
      
      console.log('🌤️ Caching weather data for:', location, date);
      
      await session.run(`
        MERGE (w:WeatherCache {weatherKey: $weatherKey})
        SET w.location = $location,
            w.date = $date,
            w.weatherData = $weatherData,
            w.timestamp = datetime(),
            w.lastAccessed = datetime()
      `, {
        weatherKey,
        location,
        date,
        weatherData: weatherJson
      });
      
      // Keep only last 100 weather entries (weather data is smaller, so we can keep more)
      await session.run(`
        MATCH (w:WeatherCache)
        WITH w ORDER BY w.lastAccessed ASC
        WITH collect(w) as caches
        WHERE size(caches) > 100
        UNWIND caches[0..size(caches)-101] as oldCache
        DELETE oldCache
      `);
      
    } catch (error) {
      console.error('Error caching weather data:', error.message);
    } finally {
      session.close();
    }
  }

  /**
   * Get cached weather data (strict location + date matching)
   */
  async getCachedWeatherData(location, date) {
    await this.dataManager.ensureConnection();
    const session = this.dataManager.driver.session({ database: this.dataManager.database });
    
    try {
      const weatherKey = this.generateWeatherKey(location, date);
      
      const result = await session.run(
        'MATCH (w:WeatherCache {weatherKey: $weatherKey}) RETURN w',
        { weatherKey }
      );
      
      if (result.records.length > 0) {
        const record = result.records[0];
        const weatherNode = record.get('w').properties;
        
        console.log('🌤️ Found cached weather data for:', location, date);
        
        // Update access timestamp
        await session.run(
          'MATCH (w:WeatherCache {weatherKey: $weatherKey}) SET w.lastAccessed = datetime()',
          { weatherKey }
        );
        
        try {
          return JSON.parse(weatherNode.weatherData);
        } catch (parseError) {
          console.error('❌ Failed to parse cached weather data:', parseError.message);
          return null;
        }
      }
      
    } catch (error) {
      console.error('Error retrieving cached weather data:', error.message);
    } finally {
      session.close();
    }
    
    return null;
  }

  /**
   * Cache festival/holiday data with location + date range
   */
  async cacheFestivalData(location, searchStartDate, searchEndDate, festivalsData) {
    await this.dataManager.ensureConnection();
    const session = this.dataManager.driver.session({ database: this.dataManager.database });
    
    try {
      const festivalKey = this.generateFestivalKey(location, searchStartDate, searchEndDate);
      const festivalsJson = JSON.stringify(festivalsData);
      
      console.log('🎭 Caching festival data for:', location, searchStartDate, 'to', searchEndDate);
      
      await session.run(`
        MERGE (f:FestivalCache {festivalKey: $festivalKey})
        SET f.location = $location,
            f.searchStartDate = $searchStartDate,
            f.searchEndDate = $searchEndDate,
            f.festivalsData = $festivalsData,
            f.timestamp = datetime(),
            f.lastAccessed = datetime()
      `, {
        festivalKey,
        location,
        searchStartDate,
        searchEndDate,
        festivalsData: festivalsJson
      });
      
      // Keep only last 50 festival entries 
      await session.run(`
        MATCH (f:FestivalCache)
        WITH f ORDER BY f.lastAccessed ASC
        WITH collect(f) as caches
        WHERE size(caches) > 50
        UNWIND caches[0..size(caches)-51] as oldCache
        DELETE oldCache
      `);
      
    } catch (error) {
      console.error('Error caching festival data:', error.message);
    } finally {
      session.close();
    }
  }

  /**
   * Get cached festival data (same location, target date within search range)
   */
  async getCachedFestivalData(location, targetDate) {
    await this.dataManager.ensureConnection();
    const session = this.dataManager.driver.session({ database: this.dataManager.database });
    
    try {
      // Find festival caches where the target date falls within the search range
      const result = await session.run(`
        MATCH (f:FestivalCache)
        WHERE f.location = $location
          AND date($targetDate) >= date(f.searchStartDate)
          AND date($targetDate) <= date(f.searchEndDate)
        RETURN f
        ORDER BY f.lastAccessed DESC
        LIMIT 1
      `, { 
        location,
        targetDate 
      });
      
      if (result.records.length > 0) {
        const record = result.records[0];
        const festivalNode = record.get('f').properties;
        
        console.log('🎭 Found cached festival data for:', location, 
          'covering date:', targetDate,
          'from range:', festivalNode.searchStartDate, 'to', festivalNode.searchEndDate);
        
        // Update access timestamp
        await session.run(
          'MATCH (f:FestivalCache {festivalKey: $festivalKey}) SET f.lastAccessed = datetime()',
          { festivalKey: festivalNode.festivalKey }
        );
        
        try {
          return JSON.parse(festivalNode.festivalsData);
        } catch (parseError) {
          console.error('❌ Failed to parse cached festival data:', parseError.message);
          return null;
        }
      }
      
    } catch (error) {
      console.error('Error retrieving cached festival data:', error.message);
    } finally {
      session.close();
    }
    
    return null;
  }

  /**
   * Generate cache key for weather data (location + exact date)
   */
  generateWeatherKey(location, date) {
    const normalizedLocation = location.toLowerCase().trim();
    return `weather-${normalizedLocation}-${date}`;
  }

  /**
   * Generate cache key for festival data (location + date range)
   */
  generateFestivalKey(location, startDate, endDate) {
    const normalizedLocation = location.toLowerCase().trim();
    return `festivals-${normalizedLocation}-${startDate}-${endDate}`;
  }

  /**
   * Create database constraints and indexes for weather/festival caching
   */
  async createCacheConstraints() {
    await this.dataManager.ensureConnection();
    const session = this.dataManager.driver.session({ database: this.dataManager.database });
    
    try {
      // Weather cache constraints
      await session.run('CREATE CONSTRAINT weather_cache_key IF NOT EXISTS FOR (w:WeatherCache) REQUIRE w.weatherKey IS UNIQUE');
      await session.run('CREATE INDEX weather_cache_location IF NOT EXISTS FOR (w:WeatherCache) ON (w.location)');
      await session.run('CREATE INDEX weather_cache_date IF NOT EXISTS FOR (w:WeatherCache) ON (w.date)');
      await session.run('CREATE INDEX weather_cache_last_accessed IF NOT EXISTS FOR (w:WeatherCache) ON (w.lastAccessed)');
      
      // Festival cache constraints
      await session.run('CREATE CONSTRAINT festival_cache_key IF NOT EXISTS FOR (f:FestivalCache) REQUIRE f.festivalKey IS UNIQUE');
      await session.run('CREATE INDEX festival_cache_location IF NOT EXISTS FOR (f:FestivalCache) ON (f.location)');
      await session.run('CREATE INDEX festival_cache_date_range IF NOT EXISTS FOR (f:FestivalCache) ON (f.searchStartDate, f.searchEndDate)');
      await session.run('CREATE INDEX festival_cache_last_accessed IF NOT EXISTS FOR (f:FestivalCache) ON (f.lastAccessed)');
      
      console.log('✅ Created weather and festival cache constraints and indexes');
      
    } catch (error) {
      console.warn('Weather/Festival cache constraint creation warning (may already exist):', error.message);
    } finally {
      session.close();
    }
  }
}
