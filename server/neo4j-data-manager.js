import neo4j from 'neo4j-driver';

// Neo4j Data Manager - Replaces MongoDB with Neo4j AuraDB
export class Neo4jDataManager {
  constructor() {
    this.driver = null;
    this.session = null;
    this.isConnected = false;
    this.uri = process.env.NEO4J_URI;
    this.user = process.env.NEO4J_USER;
    this.password = process.env.NEO4J_PASSWORD;
    this.database = process.env.NEO4J_DATABASE || 'neo4j';
    
    if (!this.uri || !this.user || !this.password) {
      throw new Error('NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables are required for Neo4j integration');
    }
  }

  async connect() {
    if (this.isConnected) return;
    
    try {
      this.driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password));
      
      // Test connection
      const session = this.driver.session({ database: this.database });
      await session.run('RETURN 1');
      session.close();
      
      this.isConnected = true;
      
      // Create constraints and indexes for better performance
      await this.createConstraints();
      console.log('Connected to Neo4j AuraDB successfully');
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async createConstraints() {
    const session = this.driver.session({ database: this.database });
    try {
      // Create constraints for unique identifiers
      await session.run('CREATE CONSTRAINT search_cache_key IF NOT EXISTS FOR (s:SearchCache) REQUIRE s.searchKey IS UNIQUE');
      await session.run('CREATE CONSTRAINT location_name IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE');
      await session.run('CREATE CONSTRAINT system_config_type IF NOT EXISTS FOR (s:SystemConfig) REQUIRE s.type IS UNIQUE');
      
      // Create indexes for performance
      await session.run('CREATE INDEX search_history_timestamp IF NOT EXISTS FOR (s:SearchHistory) ON (s.timestamp)');
      await session.run('CREATE INDEX search_cache_last_accessed IF NOT EXISTS FOR (s:SearchCache) ON (s.lastAccessed)');
    } catch (error) {
      console.warn('Constraint/Index creation warning (may already exist):', error.message);
    } finally {
      session.close();
    }
  }

  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  // Search result caching methods
  async getCachedSearchResults(location, date, duration_hours, ages, query, extra_instructions = '', ai_provider = 'gemini') {
    await this.ensureConnection();
    
    const searchKey = this.generateSearchKey(location, date, duration_hours, ages, query, extra_instructions, ai_provider);
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(
        'MATCH (s:SearchCache {searchKey: $searchKey}) RETURN s',
        { searchKey }
      );
      
      if (result.records.length > 0) {
        const record = result.records[0];
        const cacheNode = record.get('s').properties;
        
        console.log('⚡ Returning cached search results for:', searchKey);
        
        // Update the access timestamp
        await session.run(
          'MATCH (s:SearchCache {searchKey: $searchKey}) SET s.lastAccessed = datetime()',
          { searchKey }
        );
        
        try {
          const parsedResults = JSON.parse(cacheNode.results);
          console.log('✅ Successfully parsed cached results');
          return parsedResults;
        } catch (parseError) {
          console.error('❌ Failed to parse cached results JSON:', parseError.message);
          console.error('Raw cached data:', cacheNode.results);
          return null;
        }
      }
    } catch (error) {
      console.error('Error retrieving cached results:', error.message);
    } finally {
      session.close();
    }
    
    return null;
  }

  async cacheSearchResults(location, date, duration_hours, ages, query, results, extra_instructions = '', ai_provider = 'gemini') {
    await this.ensureConnection();
    
    const searchKey = this.generateSearchKey(location, date, duration_hours, ages, query, extra_instructions, ai_provider);
    const session = this.driver.session({ database: this.database });
    
    try {
      const resultsJson = JSON.stringify(results);
      console.log('💾 Caching search results for:', searchKey, 'Size:', resultsJson.length, 'chars');
      
      // Create or update cache entry
      await session.run(`
        MERGE (s:SearchCache {searchKey: $searchKey})
        SET s.location = $location,
            s.date = $date,
            s.duration_hours = $duration_hours,
            s.ages = $ages,
            s.query = $query,
            s.extra_instructions = $extra_instructions,
            s.ai_provider = $ai_provider,
            s.results = $results,
            s.timestamp = datetime(),
            s.lastAccessed = datetime()
      `, {
        searchKey,
        location,
        date,
        duration_hours: duration_hours || null,
        ages: ages || [],
        query: query || '',
        extra_instructions: extra_instructions || '',
        ai_provider: ai_provider || 'gemini',
        results: resultsJson
      });
      
      // Keep only last 20 search results - remove oldest by lastAccessed
      await session.run(`
        MATCH (s:SearchCache)
        WITH s ORDER BY s.lastAccessed ASC
        WITH collect(s) as caches
        WHERE size(caches) > 20
        UNWIND caches[0..size(caches)-21] as oldCache
        DELETE oldCache
      `);
      
      console.log('✅ Successfully cached search results for:', searchKey);
    } catch (error) {
      console.error('Error caching search results:', error.message);
    } finally {
      session.close();
    }
  }

  generateSearchKey(location, date, duration_hours, ages, query, extra_instructions = '', ai_provider = 'gemini') {
    const normalizedLocation = location.toLowerCase().trim();
    const normalizedQuery = query?.toLowerCase().trim() || '';
    const agesStr = ages?.sort().join(',') || '';
    const normalizedInstructions = extra_instructions?.toLowerCase().trim() || '';
    const normalizedProvider = ai_provider?.toLowerCase().trim() || 'gemini';
    return `${normalizedLocation}-${date}-${duration_hours || ''}-${agesStr}-${normalizedQuery}-${normalizedInstructions}-${normalizedProvider}`;
  }

  // Search history methods
  async loadSearchHistory() {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(`
        MATCH (s:SearchHistory)
        RETURN s
        ORDER BY s.timestamp DESC
        LIMIT 20
      `);
      
      return result.records.map(record => {
        const props = record.get('s').properties;
        return {
          id: props.id,
          location: props.location,
          date: props.date,
          duration: props.duration,
          kidsAges: props.kidsAges || [],
          timestamp: props.timestamp,
          searchCount: props.searchCount || 1
        };
      });
    } catch (error) {
      console.error('Error loading search history from Neo4j:', error.message);
      return [];
    } finally {
      session.close();
    }
  }

  async saveSearchHistory(history) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      // Clear existing history
      await session.run('MATCH (s:SearchHistory) DELETE s');
      
      // Insert new history
      if (history.length > 0) {
        for (const entry of history) {
          await session.run(`
            CREATE (s:SearchHistory {
              id: $id,
              location: $location,
              date: $date,
              duration: $duration,
              kidsAges: $kidsAges,
              timestamp: $timestamp,
              searchCount: $searchCount
            })
          `, {
            id: entry.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            location: entry.location,
            date: entry.date,
            duration: entry.duration,
            kidsAges: entry.kidsAges || [],
            timestamp: entry.timestamp,
            searchCount: entry.searchCount || 1
          });
        }
      }
    } catch (error) {
      console.error('Error saving search history to Neo4j:', error.message);
      throw error;
    } finally {
      session.close();
    }
  }

  async addToSearchHistory(query) {
    await this.ensureConnection();
    
    const { location, date, duration_hours, ages } = query;
    const session = this.driver.session({ database: this.database });
    
    try {
      // Remove existing entry with same parameters
      await session.run(`
        MATCH (s:SearchHistory)
        WHERE s.location = $location AND s.date = $date 
          AND s.duration = $duration AND s.kidsAges = $ages
        DELETE s
      `, {
        location,
        date,
        duration: duration_hours,
        ages: ages || []
      });
      
      // Add new entry
      const historyEntry = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        location,
        date,
        duration: duration_hours || null,
        kidsAges: ages || [],
        timestamp: new Date().toISOString(),
        searchCount: 1
      };
      
      await session.run(`
        CREATE (s:SearchHistory {
          id: $id,
          location: $location,
          date: $date,
          duration: $duration,
          kidsAges: $kidsAges,
          timestamp: $timestamp,
          searchCount: $searchCount
        })
      `, historyEntry);
      
      // Keep only last 20 entries
      await session.run(`
        MATCH (s:SearchHistory)
        WITH s ORDER BY datetime(s.timestamp) ASC
        WITH collect(s) as histories
        WHERE size(histories) > 20
        UNWIND histories[0..size(histories)-21] as oldHistory
        DELETE oldHistory
      `);
      
      return historyEntry;
    } catch (error) {
      console.error('Error adding to search history:', error.message);
      throw error;
    } finally {
      session.close();
    }
  }

  // Exclusion list methods
  async loadExclusionList() {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(`
        MATCH (l:Location)-[:EXCLUDES]->(a:Attraction)
        RETURN l.name as location, collect(a.name) as attractions
      `);
      
      const exclusions = {};
      result.records.forEach(record => {
        exclusions[record.get('location')] = record.get('attractions');
      });
      
      return exclusions;
    } catch (error) {
      console.error('Error loading exclusion list from Neo4j:', error.message);
      return {};
    } finally {
      session.close();
    }
  }

  async saveExclusionList(exclusions) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      // Clear existing exclusions
      await session.run('MATCH (l:Location)-[r:EXCLUDES]->(a:Attraction) DELETE r, a, l');
      
      // Insert new exclusions
      for (const [location, attractions] of Object.entries(exclusions)) {
        if (attractions.length > 0) {
          await session.run(`
            MERGE (l:Location {name: $location})
          `, { location });
          
          for (const attraction of attractions) {
            await session.run(`
              MATCH (l:Location {name: $location})
              MERGE (a:Attraction {name: $attraction})
              MERGE (l)-[:EXCLUDES]->(a)
            `, { location, attraction });
          }
        }
      }
    } catch (error) {
      console.error('Error saving exclusion list to Neo4j:', error.message);
      throw error;
    } finally {
      session.close();
    }
  }

  async addToExclusionList(location, attraction) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(`
        MERGE (l:Location {name: $location})
        MERGE (a:Attraction {name: $attraction})
        MERGE (l)-[r:EXCLUDES]->(a)
        RETURN r
      `, { location, attraction });
      
      return result.records.length > 0;
    } catch (error) {
      console.error('Error adding to exclusion list:', error.message);
      return false;
    } finally {
      session.close();
    }
  }

  async removeFromExclusionList(location, attraction) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(`
        MATCH (l:Location {name: $location})-[r:EXCLUDES]->(a:Attraction {name: $attraction})
        DELETE r, a
        WITH l
        MATCH (l)
        WHERE NOT (l)-[:EXCLUDES]->()
        DELETE l
        RETURN COUNT(*) as deletedCount
      `, { location, attraction });
      
      return result.records[0]?.get('deletedCount') > 0;
    } catch (error) {
      console.error('Error removing from exclusion list:', error.message);
      return false;
    } finally {
      session.close();
    }
  }

  // Master key methods for encryption
  async getMasterKey() {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(
        'MATCH (s:SystemConfig {type: "masterKey"}) RETURN s.value as value'
      );
      
      return result.records.length > 0 ? result.records[0].get('value') : null;
    } catch (error) {
      console.error('Error retrieving master key from Neo4j:', error.message);
      return null;
    } finally {
      session.close();
    }
  }

  async saveMasterKey(masterKey) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      await session.run(`
        MERGE (s:SystemConfig {type: "masterKey"})
        SET s.value = $value,
            s.createdAt = datetime(),
            s.lastAccessed = datetime()
      `, { value: masterKey });
      
      console.log('Master key saved to Neo4j');
      return true;
    } catch (error) {
      console.error('Error saving master key to Neo4j:', error.message);
      return false;
    } finally {
      session.close();
    }
  }

  async updateMasterKeyAccess() {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      await session.run(`
        MATCH (s:SystemConfig {type: "masterKey"})
        SET s.lastAccessed = datetime()
      `);
    } catch (error) {
      console.log('Note: Could not update master key access time:', error.message);
    } finally {
      session.close();
    }
  }

  // API Configuration methods
  async getApiConfig() {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(
        'MATCH (s:SystemConfig {type: "apiConfig"}) RETURN s.value as value'
      );
      
      if (result.records.length > 0) {
        const configJson = result.records[0].get('value');
        // Parse the JSON string back into an object
        return JSON.parse(configJson);
      }
      return null;
    } catch (error) {
      console.error('Error retrieving API config from Neo4j:', error.message);
      return null;
    } finally {
      session.close();
    }
  }

  async saveApiConfig(apiConfig) {
    await this.ensureConnection();
    const session = this.driver.session({ database: this.database });
    
    try {
      // Convert the config object to a JSON string for Neo4j storage
      const configJson = JSON.stringify(apiConfig);
      
      await session.run(`
        MERGE (s:SystemConfig {type: "apiConfig"})
        SET s.value = $value,
            s.updatedAt = datetime()
      `, { value: configJson });
      
      console.log('💾 API configuration saved to Neo4j');
      return true;
    } catch (error) {
      console.error('Error saving API config to Neo4j:', error.message);
      return false;
    } finally {
      session.close();
    }
  }

  async close() {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
      console.log('Neo4j connection closed');
    }
  }
}
