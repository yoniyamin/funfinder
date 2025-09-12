import neo4j from 'neo4j-driver';

/**
 * Smart Cache Manager for Neo4j - Intelligent similarity-based result reuse
 * Identifies "close enough" search requests to reuse cached results
 */
export class SmartCacheManager {
  constructor(neo4jDataManager) {
    this.dataManager = neo4jDataManager;
    
    // Similarity configuration - location is strict, weather/temporal more flexible
    this.SIMILARITY_THRESHOLDS = {
      location: { weight: 0.2, maxDistance: 20 }, // km - strict local relevance
      weather: { weight: 0.4, tolerance: 0.8 },   // More transferable between locations
      temporal: { weight: 0.3, dayRange: 14 },    // Seasonal patterns matter
      demographic: { weight: 0.1, ageFlexibility: 2 } // Age group flexibility in years
    };
    
    // Minimum similarity score to consider a match (90% threshold for quality)
    this.MIN_SIMILARITY_SCORE = 0.90;
    
    // Geographic data cache for location features
    this.locationCache = new Map();
  }

  /**
   * Normalize search request into feature vector for similarity comparison
   */
  async normalizeToFeatureVector(location, date, duration_hours, ages, context = {}) {
    const features = {};
    
    // === LOCATION FEATURES ===
    const locationFeatures = await this.extractLocationFeatures(location);
    features.location = locationFeatures;
    
    // === TEMPORAL FEATURES ===
    const dateObj = new Date(date);
    const dayOfYear = this.getDayOfYear(dateObj);
    const season = this.getSeason(dateObj);
    
    features.temporal = {
      season: season / 3,           // Normalize 0-1 (winter=0, fall=1)
      dayOfYear: dayOfYear / 365,   // Normalize 0-1
      dayOfWeek: dateObj.getDay() / 6, // Normalize 0-1
      month: dateObj.getMonth() / 11,  // Normalize 0-1
      isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6 ? 1 : 0,
      holidayProximity: context.is_public_holiday ? 1 : 0
    };
    
    // === WEATHER FEATURES ===
    features.weather = this.normalizeWeatherFeatures(context.weather || {});
    
    // === DEMOGRAPHIC FEATURES ===
    features.demographic = this.normalizeDemographicFeatures(ages, duration_hours);
    
    // === CONTEXT FEATURES ===
    features.context = {
      hasFestivals: (context.nearby_festivals?.length || 0) > 0 ? 1 : 0,
      festivalCount: Math.min((context.nearby_festivals?.length || 0) / 5, 1), // Normalize max 5 festivals
      hasExtraInstructions: context.extra_instructions ? 1 : 0,
      instructionsHash: context.extra_instructions ? (this.simpleHash(context.extra_instructions) % 1000) / 1000 : 0
    };
    
    return features;
  }

  /**
   * Extract location-based features including coordinates and classification
   */
  async extractLocationFeatures(location) {
    // Cache lookup to avoid repeated geocoding
    if (this.locationCache.has(location)) {
      return this.locationCache.get(location);
    }
    
    // Extract coordinates and classify location
    // This would integrate with your existing geocoding logic
    const locationData = {
      // For now, return normalized placeholder - you can integrate actual geocoding
      latitude: 0,    // Will be normalized -1 to 1 (lat/90)
      longitude: 0,   // Will be normalized -1 to 1 (lon/180)
      citySize: 0.5,  // 0=small town, 0.5=medium city, 1=major metro
      isCoastal: 0,   // 0=inland, 1=coastal
      population: 0.5, // Normalized city population tier
      countryCode: location.includes(',') ? location.split(',').pop().trim() : 'unknown'
    };
    
    this.locationCache.set(location, locationData);
    return locationData;
  }

  /**
   * Normalize weather data into comparable features
   */
  normalizeWeatherFeatures(weather) {
    const tempMin = weather.temperature_min_c || 15;
    const tempMax = weather.temperature_max_c || 25;
    const avgTemp = (tempMin + tempMax) / 2;
    
    return {
      avgTemperature: this.normalizeTemperature(avgTemp),
      tempRange: Math.min((tempMax - tempMin) / 30, 1), // Normalize large swings
      precipitation: Math.min((weather.precipitation_probability_percent || 0) / 100, 1),
      windSpeed: Math.min((weather.wind_speed_max_kmh || 0) / 50, 1), // Max reasonable wind
      weatherSuitability: this.calculateWeatherSuitability(avgTemp, weather.precipitation_probability_percent || 0),
      season: this.getSeasonFromTemp(avgTemp)
    };
  }

  /**
   * Normalize demographic features (ages, duration)
   */
  normalizeDemographicFeatures(ages = [], duration_hours = 4) {
    if (!ages || ages.length === 0) {
      return {
        avgAge: 0.5,        // Default middle range
        ageRange: 0,        // No range
        hasToddlers: 0,     // 0-3 years
        hasPreschool: 0,    // 4-6 years  
        hasSchoolAge: 0,    // 7-12 years
        hasTeens: 0,        // 13+ years
        duration: Math.min(duration_hours / 12, 1) // Normalize to 12 hour max
      };
    }
    
    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);
    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    
    return {
      avgAge: Math.min(avgAge / 18, 1),  // Normalize to adult
      ageRange: Math.min((maxAge - minAge) / 15, 1), // Normalize large age gaps
      hasToddlers: ages.some(age => age <= 3) ? 1 : 0,
      hasPreschool: ages.some(age => age >= 4 && age <= 6) ? 1 : 0,
      hasSchoolAge: ages.some(age => age >= 7 && age <= 12) ? 1 : 0,
      hasTeens: ages.some(age => age >= 13) ? 1 : 0,
      duration: Math.min(duration_hours / 12, 1)
    };
  }

  /**
   * Calculate similarity score between two feature vectors
   */
  calculateSimilarity(features1, features2, locationDistance = null) {
    let totalScore = 0;
    let totalWeight = 0;
    
    // === LOCATION SIMILARITY ===
    if (locationDistance !== null) {
      if (locationDistance <= this.SIMILARITY_THRESHOLDS.location.maxDistance) {
        // Inverse distance scoring - closer = higher score
        const locationScore = Math.max(0, 1 - (locationDistance / this.SIMILARITY_THRESHOLDS.location.maxDistance));
        totalScore += locationScore * this.SIMILARITY_THRESHOLDS.location.weight;
      } else {
        // Too far apart - skip this candidate
        return 0;
      }
      totalWeight += this.SIMILARITY_THRESHOLDS.location.weight;
    }
    
    // === WEATHER SIMILARITY ===
    const weatherScore = this.calculateWeatherSimilarity(features1.weather, features2.weather);
    totalScore += weatherScore * this.SIMILARITY_THRESHOLDS.weather.weight;
    totalWeight += this.SIMILARITY_THRESHOLDS.weather.weight;
    
    // === TEMPORAL SIMILARITY ===
    const temporalScore = this.calculateTemporalSimilarity(features1.temporal, features2.temporal);
    totalScore += temporalScore * this.SIMILARITY_THRESHOLDS.temporal.weight;
    totalWeight += this.SIMILARITY_THRESHOLDS.temporal.weight;
    
    // === DEMOGRAPHIC SIMILARITY ===
    const demographicScore = this.calculateDemographicSimilarity(features1.demographic, features2.demographic);
    totalScore += demographicScore * this.SIMILARITY_THRESHOLDS.demographic.weight;
    totalWeight += this.SIMILARITY_THRESHOLDS.demographic.weight;
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Weather similarity with seasonal and activity-type awareness
   */
  calculateWeatherSimilarity(weather1, weather2) {
    // Temperature similarity - more important for outdoor activities
    const tempDiff = Math.abs(weather1.avgTemperature - weather2.avgTemperature);
    const tempSimilarity = Math.max(0, 1 - tempDiff * 2); // Scale temperature differences
    
    // Precipitation similarity - dry can substitute light rain, but not heavy
    const precipDiff = Math.abs(weather1.precipitation - weather2.precipitation);
    let precipSimilarity = Math.max(0, 1 - precipDiff * 1.5);
    
    // Bonus for both being dry (< 20% chance)
    if (weather1.precipitation < 0.2 && weather2.precipitation < 0.2) {
      precipSimilarity = Math.max(precipSimilarity, 0.9);
    }
    
    // Wind similarity - less critical but affects outdoor activities
    const windDiff = Math.abs(weather1.windSpeed - weather2.windSpeed);
    const windSimilarity = Math.max(0, 1 - windDiff);
    
    // Overall weather suitability alignment
    const suitabilityDiff = Math.abs(weather1.weatherSuitability - weather2.weatherSuitability);
    const suitabilitySimilarity = Math.max(0, 1 - suitabilityDiff);
    
    // Weighted combination
    return (tempSimilarity * 0.4) + (precipSimilarity * 0.3) + (suitabilitySimilarity * 0.2) + (windSimilarity * 0.1);
  }

  /**
   * Temporal similarity with seasonal patterns and holiday awareness
   */
  calculateTemporalSimilarity(temporal1, temporal2) {
    // Season similarity - spring/fall can be interchangeable
    const seasonDiff = Math.abs(temporal1.season - temporal2.season);
    let seasonSimilarity;
    if (seasonDiff <= 0.33) { // Same or adjacent seasons
      seasonSimilarity = 1 - seasonDiff * 1.5;
    } else {
      seasonSimilarity = 0.2; // Different seasons get low but non-zero score
    }
    
    // Day of year proximity within seasonal window
    const dayDiff = Math.abs(temporal1.dayOfYear - temporal2.dayOfYear);
    const dayRange = this.SIMILARITY_THRESHOLDS.temporal.dayRange / 365;
    const daySimilarity = Math.max(0, 1 - dayDiff / dayRange);
    
    // Weekend vs weekday - moderately important for activity types
    const weekendMatch = temporal1.isWeekend === temporal2.isWeekend ? 1 : 0.7;
    
    // Holiday proximity bonus
    const holidayBonus = (temporal1.holidayProximity + temporal2.holidayProximity) * 0.1;
    
    return (seasonSimilarity * 0.4) + (daySimilarity * 0.3) + (weekendMatch * 0.2) + Math.min(holidayBonus, 0.1);
  }

  /**
   * Demographic similarity focused on age group compatibility
   */
  calculateDemographicSimilarity(demo1, demo2) {
    // Age group overlap - activities suitable for overlapping age ranges
    const toddlerMatch = this.getGroupMatch(demo1.hasToddlers, demo2.hasToddlers);
    const preschoolMatch = this.getGroupMatch(demo1.hasPreschool, demo2.hasPreschool);
    const schoolMatch = this.getGroupMatch(demo1.hasSchoolAge, demo2.hasSchoolAge);
    const teenMatch = this.getGroupMatch(demo1.hasTeens, demo2.hasTeens);
    
    // Average age proximity
    const avgAgeDiff = Math.abs(demo1.avgAge - demo2.avgAge);
    const ageSimilarity = Math.max(0, 1 - avgAgeDiff * 2);
    
    // Duration similarity - half-day vs full-day activities
    const durationDiff = Math.abs(demo1.duration - demo2.duration);
    const durationSimilarity = Math.max(0, 1 - durationDiff * 1.5);
    
    return (toddlerMatch + preschoolMatch + schoolMatch + teenMatch) * 0.15 + 
           ageSimilarity * 0.3 + 
           durationSimilarity * 0.3;
  }

  /**
   * Helper function for age group matching
   */
  getGroupMatch(has1, has2) {
    if (has1 === has2) return 1;          // Both have or both don't have
    if (has1 === 1 || has2 === 1) return 0.7; // One has, one doesn't - partial match
    return 0;
  }

  // === UTILITY FUNCTIONS ===

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  getSeason(date) {
    const month = date.getMonth();
    if (month >= 2 && month <= 4) return 1; // Spring
    if (month >= 5 && month <= 7) return 2; // Summer  
    if (month >= 8 && month <= 10) return 3; // Fall
    return 0; // Winter
  }

  getSeasonFromTemp(temp) {
    if (temp <= 5) return 0;   // Winter
    if (temp <= 15) return 1;  // Spring/Fall
    if (temp <= 25) return 2;  // Mild Summer
    return 3;                  // Hot Summer
  }

  normalizeTemperature(temp) {
    // Normalize temperature to 0-1 scale optimized for family activities
    // 0°C = 0, 30°C = 1 (comfortable range for most outdoor activities)
    return Math.max(0, Math.min(1, temp / 30));
  }

  calculateWeatherSuitability(temp, precipitation) {
    // Calculate how suitable weather is for general outdoor family activities
    let score = 0.5; // Base score
    
    // Temperature optimization (15-25°C is ideal)
    if (temp >= 15 && temp <= 25) {
      score += 0.3;
    } else if (temp >= 10 && temp <= 30) {
      score += 0.1;
    } else if (temp < 5 || temp > 35) {
      score -= 0.2;
    }
    
    // Precipitation penalty
    if (precipitation < 20) {
      score += 0.2; // Dry weather bonus
    } else if (precipitation > 60) {
      score -= 0.3; // Heavy rain penalty
    }
    
    return Math.max(0, Math.min(1, score));
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure we return a regular number, not BigInt
    return Math.abs(Number(hash));
  }
}

