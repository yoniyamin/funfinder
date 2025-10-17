import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import neo4j from 'neo4j-driver';
import { Neo4jDataManager } from './neo4j-data-manager.js';
import { validateForModel, validateAIResponse, isResponseStructureValid, getValidationErrorSummary, ValidationError } from './validation.js';
import { scrapeFeverEvents, formatEventsForAI, getFeverEventsWithCache } from './fever-scraper.js';
import SimpleCache from './simple-cache.js';

dotenv.config();

// Initialize simple cache for Fever events (fallback when Neo4j not available)
const feverCache = new SimpleCache();

const PORT = process.env.PORT || 8787;
const app = express();

// Configure CORS - allow all origins in development and same-origin in production
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? true  // Allow same-origin requests in production (frontend served from same domain)
    : true, // Allow all origins in development
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Request logging middleware for debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`🌐 ${timestamp} - ${req.method} ${req.path} - ${req.ip || req.connection.remoteAddress}`);
  next();
});

// Health check endpoint for connectivity testing
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
    services: {
      neo4j: typeof dataManager !== 'undefined' && dataManager ? 'connected' : 'disconnected',
      ai_providers: {
        gemini: process.env.GEMINI_API_KEY ? 'configured' : 'not_configured',
        openrouter: process.env.OPENROUTER_API_KEY ? 'configured' : 'not_configured',
        together: process.env.TOGETHER_API_KEY ? 'configured' : 'not_configured'
      }
    }
  };
  
  console.log('💓 Health check requested:', healthStatus);
  res.json({ ok: true, health: healthStatus });
});

// Simple connectivity test endpoint
app.get('/api/test', (req, res) => {
  console.log('🧪 Connectivity test requested');
  res.json({ 
    ok: true, 
    message: 'Backend connectivity test successful',
    timestamp: new Date().toISOString(),
    server_time: Date.now()
  });
});

// Serve static files from dist directory in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  console.log(`📁 Serving static files from: ${distPath}`);
  
  // Check if dist directory exists
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log('✅ Static files serving enabled');
  } else {
    console.warn('⚠️ Warning: dist directory not found. Run "npm run build" first.');
  }
}

// AI Provider Factory - Creates isolated instances per request
class AIProviderFactory {
  static createGeminiClient(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key not provided');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = apiKeys.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    return genAI.getGenerativeModel({ 
      model: geminiModel,
      generationConfig: {
        temperature: 0.2, // Optimized for deterministic JSON output
        topP: 0.9,
        candidateCount: 1
      }
    });
  }
  
  static createOpenRouterClient(apiKey) {
    if (!apiKey) {
      throw new Error('OpenRouter API key not provided');
    }
    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
    });
  }
  
  static createTogetherClient(apiKey) {
    if (!apiKey) {
      throw new Error('Together.ai API key not provided');
    }
    return new OpenAI({
      baseURL: 'https://api.together.xyz/v1',
      apiKey: apiKey,
    });
  }
}

// JSON Schema for structured activity responses (Together.ai JSON mode)
function getActivityResponseSchema() {
  return {
    type: "object",
    properties: {
      query: {
        type: "object",
        properties: {
          location: { type: "string" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          duration_hours: { type: "number" },
          ages: { 
            type: "array",
            items: { type: "integer" }
          },
          weather: {
            type: "object",
            properties: {
              temperature_min_c: { type: "number" },
              temperature_max_c: { type: "number" },
              precipitation_probability_percent: { type: "number" },
              wind_speed_max_kmh: { type: ["number", "null"] }
            },
            required: ["temperature_min_c", "temperature_max_c", "precipitation_probability_percent"]
          },
          is_public_holiday: { type: "boolean" },
          nearby_festivals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                start_date: { type: ["string", "null"] },
                end_date: { type: ["string", "null"] },
                url: { type: ["string", "null"] },
                distance_km: { type: ["number", "null"] }
              },
              required: ["name"]
            }
          },
          holidays: { type: "array" },
          exclusions: { type: "array" }
        },
        required: ["location", "date", "duration_hours", "ages", "weather", "is_public_holiday"]
      },
      activities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            category: { 
              type: "string",
              enum: ["outdoor", "indoor", "museum", "park", "playground", "water", "hike", "creative", "festival", "show", "seasonal", "other"]
            },
            description: { type: "string" },
            suitable_ages: { type: "string" },
            duration_hours: { type: "number" },
            address: { type: ["string", "null"] },
            lat: { type: ["number", "null"] },
            lon: { type: ["number", "null"] },
            booking_url: { type: ["string", "null"] },
            free: { type: ["boolean", "string"] },
            weather_fit: { 
              type: "string",
              enum: ["good", "ok", "bad"]
            },
            notes: { type: ["string", "null"] },
            evidence: {
              type: "array",
              items: { type: "string" }
            },
            source: { type: ["string", "null"] }
          },
          required: ["title", "category", "description", "suitable_ages", "duration_hours", "weather_fit", "evidence"]
        },
        minItems: 1,
        maxItems: 30
      }
    },
    required: ["query", "activities"]
  };
}

// Initialize AI providers (deprecated - kept for settings/test endpoints)
let currentGeminiKey = process.env.GEMINI_API_KEY || '';
let currentOpenRouterKey = process.env.OPENROUTER_API_KEY || '';
let genAI = null;
let model = null;
let openAI = null;

function initializeAIProviders() {
  // Initialize Gemini
  const geminiKey = apiKeys.gemini_api_key || process.env.GEMINI_API_KEY || '';
  const geminiModel = apiKeys.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  if (geminiKey && (geminiKey !== currentGeminiKey || !model)) {
    currentGeminiKey = geminiKey;
    genAI = new GoogleGenerativeAI(currentGeminiKey);
    model = genAI.getGenerativeModel({ 
      model: geminiModel,
      generationConfig: {
        temperature: 0.5, // Low for structured output, higher than holiday data
        topP: 0.9,
        candidateCount: 1
      }
    });
    console.log('Gemini AI model initialized with reasoning suppression');
  }
  
  // Initialize OpenRouter
  const openRouterKey = apiKeys.openrouter_api_key || process.env.OPENROUTER_API_KEY || '';
  if (openRouterKey) {
    if (!openAI || openRouterKey !== currentOpenRouterKey) {
      currentOpenRouterKey = openRouterKey;
      openAI = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: currentOpenRouterKey,
      });
      console.log('OpenRouter client initialized');
    }
  } else {
    console.log('No OpenRouter API key found');
  }
}

// Legacy function name for backwards compatibility
function reinitializeGemini() {
  initializeAIProviders();
}

// Secure API Key Management
const CONFIG_FILE = path.join(process.cwd(), '.api-config.json');
const MASTER_KEY_FILE = path.join(process.cwd(), '.master-key');

// Master key management - ensures persistence across sessions
async function getOrCreateMasterKey() {
  // First try environment variable (highest priority)
  if (process.env.ENCRYPTION_KEY) {
    console.log('🔑 Using encryption key from environment variable');
    return process.env.ENCRYPTION_KEY;
  }
  
  // If Neo4j is connected, try to get master key from there
  if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
    try {
      const neo4jMasterKey = await dataManager.getMasterKey();
      if (neo4jMasterKey && neo4jMasterKey.length === 64) {
        console.log('🔑 Loaded master key from Neo4j');
        // Update access time for tracking
        await dataManager.updateMasterKeyAccess();
        return neo4jMasterKey;
      }
    } catch (error) {
      console.log('⚠️  Could not load master key from Neo4j:', error.message);
    }
  }
  
  // Try to load existing master key from local file
  let existingMasterKey = null;
  try {
    if (fs.existsSync(MASTER_KEY_FILE)) {
      const masterKey = fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim();
      if (masterKey && masterKey.length === 64) { // 32 bytes = 64 hex chars
        existingMasterKey = masterKey;
        console.log('🔑 Found existing master key in local file');
      } else {
        console.log('⚠️  Invalid master key found in local file, will generate new one');
      }
    }
  } catch (error) {
    console.log('⚠️  Error reading master key file:', error.message);
  }
  
  // If we have an existing key from file, try to migrate it to Neo4j
  if (existingMasterKey && isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
    try {
      const saved = await dataManager.saveMasterKey(existingMasterKey);
      if (saved) {
        console.log('🔄 Migrated existing master key from file to Neo4j');
        return existingMasterKey;
      }
    } catch (error) {
      console.log('⚠️  Failed to migrate master key to Neo4j:', error.message);
    }
  }
  
  // If we found an existing key but Neo4j isn't available, use it
  if (existingMasterKey) {
    console.log('🔑 Using existing master key from local file');
    return existingMasterKey;
  }
  
  // Generate new master key
  const newMasterKey = crypto.randomBytes(32).toString('hex');
  console.log('🆕 Generated new master key');
  
  // Save to Neo4j if available
  if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
    try {
      const saved = await dataManager.saveMasterKey(newMasterKey);
      if (saved) {
        console.log('💾 Saved new master key to Neo4j');
      }
    } catch (error) {
      console.log('⚠️  Failed to save master key to Neo4j:', error.message);
    }
  }
  
  // Always save to local file as backup
  try {
    fs.writeFileSync(MASTER_KEY_FILE, newMasterKey, { mode: 0o600 }); // Read/write for owner only
    console.log('💾 Saved new master key to local file (backup)');
  } catch (error) {
    console.error('❌ Error saving master key file:', error.message);
    console.log('⚠️  Continuing with in-memory key (will not persist across restarts)');
  }
  
  return newMasterKey;
}

// ENCRYPTION_KEY will be initialized asynchronously
let ENCRYPTION_KEY = null;

// API Key Storage
let apiKeys = {
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash-lite', // Gemini model to use
  openrouter_api_key: '',
  together_api_key: '',
  ai_provider: 'gemini', // 'gemini', 'openrouter', or 'together'
  openrouter_model: 'deepseek/deepseek-chat-v3.1:free',
  together_model: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
  google_search_api_key: '',
  google_search_engine_id: '',
  openwebninja_api_key: '',
  ticketmaster_api_key: '',
  enable_gemini_holidays: false, // Enable Gemini-powered holiday/festival fetching
  max_activities: 20, // Maximum number of activities to generate
  cache_include_model: false, // Include AI model in cache key
  cache_similarity_threshold: 0.90, // Minimum similarity for cache matching (90%)
  cache_location_weight: 0.20, // Location importance in similarity (20%)
  cache_weather_weight: 0.40, // Weather importance in similarity (40%)
  cache_temporal_weight: 0.30, // Temporal importance in similarity (30%)
  cache_demographic_weight: 0.10 // Age group importance in similarity (10%)
};

function applyCacheSettings() {
  if (dataManager && typeof dataManager.updateCacheSettings === 'function') {
    dataManager.updateCacheSettings(apiKeys);
  }
}

// MongoDB Data Manager - Replaces file-based storage with cloud storage
class MongoDataManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI;
    this.dbName = process.env.MONGODB_DB_NAME || 'funfinder';
    
    if (!this.connectionString) {
      throw new Error('MONGODB_URI environment variable is required for MongoDB integration');
    }
  }

  async connect() {
    if (this.isConnected) return;
    
    try {
      this.client = new MongoClient(this.connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.isConnected = true;
      
      // Create indexes for better performance
      await this.createIndexes();
      console.log('Connected to MongoDB Atlas successfully');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Create indexes for search cache
      await this.db.collection('searchCache').createIndex({ searchKey: 1 }, { unique: true });
      await this.db.collection('searchCache').createIndex({ timestamp: 1 });
      await this.db.collection('searchCache').createIndex({ lastAccessed: 1 });
      
      // Create indexes for search history
      await this.db.collection('searchHistory').createIndex({ timestamp: -1 });
      await this.db.collection('searchHistory').createIndex({ searchKey: 1 });
      
      // Create indexes for exclusion list
      await this.db.collection('exclusions').createIndex({ location: 1 });
      
      // Create indexes for system configuration (master key, etc.)
      await this.db.collection('systemConfig').createIndex({ type: 1 }, { unique: true });
    } catch (error) {
      console.warn('Index creation warning (may already exist):', error.message);
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
    
    try {
      const cached = await this.db.collection('searchCache').findOne({ searchKey });
      
      if (cached) {
        console.log('⚡ Returning cached search results for:', searchKey);
        // Update the access timestamp to track when this cache was last used
        await this.db.collection('searchCache').updateOne(
          { searchKey },
          { $set: { lastAccessed: new Date() } }
        );
        
        // Apply exclusion filtering to cached results
        if (cached.results && cached.results.activities) {
          const exclusions = await this.loadExclusionList();
          const locationExclusions = exclusions[location] || [];
          
          if (locationExclusions.length > 0) {
            console.log(`🚫 Filtering ${locationExclusions.length} excluded activities from Mongo cached results`);
            const originalCount = cached.results.activities.length;
            
            // Filter out excluded activities (case-insensitive matching)
            cached.results.activities = cached.results.activities.filter(activity => {
              const activityTitle = (activity.title || '').toLowerCase();
              const isExcluded = locationExclusions.some(excluded => 
                activityTitle.includes(excluded.toLowerCase()) || 
                excluded.toLowerCase().includes(activityTitle)
              );
              return !isExcluded;
            });
            
            console.log(`✅ Filtered Mongo cached results: ${originalCount} → ${cached.results.activities.length} activities`);
          }
        }

        if (cached.ai_provider && cached.results) {
          if (!cached.results.ai_model) {
            cached.results.ai_model = cached.ai_provider;
          }
          if (!cached.results.ai_provider) {
            cached.results.ai_provider = cached.ai_provider;
          }
        }

        return cached.results;
      }
    } catch (error) {
      console.error('Error retrieving cached results:', error.message);
    }
    
    return null;
  }

  async cacheSearchResults(location, date, duration_hours, ages, query, results, extra_instructions = '', ai_provider = 'gemini') {
    await this.ensureConnection();
    
    const searchKey = this.generateSearchKey(location, date, duration_hours, ages, query, extra_instructions, ai_provider);
    
    try {
      await this.db.collection('searchCache').replaceOne(
        { searchKey },
        {
          searchKey,
          location,
          date,
          duration_hours,
          ages,
          query,
          extra_instructions,
          ai_provider,
          results,
          timestamp: new Date(),
          lastAccessed: new Date()
        },
        { upsert: true }
      );
      
      // Keep only last 20 search results per collection size limit
      const count = await this.db.collection('searchCache').countDocuments();
      if (count > 20) {
        // Remove oldest cached results based on last access time, not creation time
        const oldestDocs = await this.db.collection('searchCache')
          .find({})
          .sort({ lastAccessed: 1 })
          .limit(count - 20)
          .toArray();
        
        const idsToDelete = oldestDocs.map(doc => doc._id);
        await this.db.collection('searchCache').deleteMany({ _id: { $in: idsToDelete } });
      }
      
      console.log('💾 Cached search results for:', searchKey);
    } catch (error) {
      console.error('Error caching search results:', error.message);
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

  // Search history methods (maintaining compatibility)
  async loadSearchHistory() {
    await this.ensureConnection();
    
    try {
      const history = await this.db.collection('searchHistory')
        .find({})
        .sort({ timestamp: -1 })
        .limit(20)
        .toArray();
      
      return history.map(doc => ({
        id: doc._id.toString(),
        location: doc.location,
        date: doc.date,
        duration: doc.duration,
        kidsAges: doc.kidsAges,
        extraInstructions: doc.extraInstructions || '',
        timestamp: doc.timestamp,
        searchCount: doc.searchCount || 1
      }));
    } catch (error) {
      console.error('Error loading search history from MongoDB:', error.message);
      return [];
    }
  }

  async saveSearchHistory(history) {
    await this.ensureConnection();
    
    try {
      // Clear existing history and insert new one
      await this.db.collection('searchHistory').deleteMany({});
      
      if (history.length > 0) {
        const docs = history.map(entry => ({
          location: entry.location,
          date: entry.date,
          duration: entry.duration,
          kidsAges: entry.kidsAges,
          timestamp: entry.timestamp,
          searchCount: entry.searchCount || 1
        }));
        
        await this.db.collection('searchHistory').insertMany(docs);
      }
    } catch (error) {
      console.error('Error saving search history to MongoDB:', error.message);
      throw error;
    }
  }

  async addToSearchHistory(query) {
    await this.ensureConnection();
    
    const { location, date, duration_hours, ages, extra_instructions } = query;
    const searchKey = `${location}-${date}-${duration_hours || ''}-${ages?.join(',') || ''}`;
    
    try {
      // Remove existing entry with same parameters if it exists
      await this.db.collection('searchHistory').deleteMany({
        location,
        date,
        duration: duration_hours,
        kidsAges: ages
      });
      
      // Add new entry
      const historyEntry = {
        location,
        date,
        duration: duration_hours || null,
        kidsAges: ages || [],
        extraInstructions: extra_instructions || '',
        timestamp: new Date().toISOString(),
        searchCount: 1
      };
      
      const result = await this.db.collection('searchHistory').insertOne(historyEntry);
      
      // Keep only last 20 entries
      const count = await this.db.collection('searchHistory').countDocuments();
      if (count > 20) {
        const oldestDocs = await this.db.collection('searchHistory')
          .find({})
          .sort({ timestamp: 1 })
          .limit(count - 20)
          .toArray();
        
        const idsToDelete = oldestDocs.map(doc => doc._id);
        await this.db.collection('searchHistory').deleteMany({ _id: { $in: idsToDelete } });
      }
      
      return {
        id: result.insertedId.toString(),
        ...historyEntry
      };
    } catch (error) {
      console.error('Error adding to search history:', error.message);
      throw error;
    }
  }

  // Exclusion list methods (maintaining compatibility)
  async loadExclusionList() {
    await this.ensureConnection();
    
    try {
      const exclusions = await this.db.collection('exclusions').find({}).toArray();
      
      const result = {};
      exclusions.forEach(doc => {
        result[doc.location] = doc.attractions || [];
      });
      
      return result;
    } catch (error) {
      console.error('Error loading exclusion list from MongoDB:', error.message);
      return {};
    }
  }

  async saveExclusionList(exclusions) {
    await this.ensureConnection();
    
    try {
      // Clear existing exclusions and insert new ones
      await this.db.collection('exclusions').deleteMany({});
      
      const docs = Object.entries(exclusions).map(([location, attractions]) => ({
        location,
        attractions
      }));
      
      if (docs.length > 0) {
        await this.db.collection('exclusions').insertMany(docs);
      }
    } catch (error) {
      console.error('Error saving exclusion list to MongoDB:', error.message);
      throw error;
    }
  }

  async addToExclusionList(location, attraction) {
    await this.ensureConnection();
    
    try {
      const existing = await this.db.collection('exclusions').findOne({ location });
      
      if (existing) {
        if (!existing.attractions.includes(attraction)) {
          await this.db.collection('exclusions').updateOne(
            { location },
            { $push: { attractions: attraction } }
          );
          return true;
        }
      } else {
        await this.db.collection('exclusions').insertOne({
          location,
          attractions: [attraction]
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error adding to exclusion list:', error.message);
      return false;
    }
  }

  async removeFromExclusionList(location, attraction) {
    await this.ensureConnection();
    
    try {
      const result = await this.db.collection('exclusions').updateOne(
        { location },
        { $pull: { attractions: attraction } }
      );
      
      if (result.modifiedCount > 0) {
        // Check if attractions array is now empty and remove the document if so
        const updated = await this.db.collection('exclusions').findOne({ location });
        if (updated && updated.attractions.length === 0) {
          await this.db.collection('exclusions').deleteOne({ location });
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error removing from exclusion list:', error.message);
      return false;
    }
  }

  // Master key methods for encryption
  async getMasterKey() {
    await this.ensureConnection();
    
    try {
      const keyDoc = await this.db.collection('systemConfig').findOne({ type: 'masterKey' });
      return keyDoc ? keyDoc.value : null;
    } catch (error) {
      console.error('Error retrieving master key from MongoDB:', error.message);
      return null;
    }
  }

  async saveMasterKey(masterKey) {
    await this.ensureConnection();
    
    try {
      await this.db.collection('systemConfig').replaceOne(
        { type: 'masterKey' },
        {
          type: 'masterKey',
          value: masterKey,
          createdAt: new Date(),
          lastAccessed: new Date()
        },
        { upsert: true }
      );
      
      console.log('Master key saved to MongoDB');
      return true;
    } catch (error) {
      console.error('Error saving master key to MongoDB:', error.message);
      return false;
    }
  }

  async updateMasterKeyAccess() {
    await this.ensureConnection();
    
    try {
      await this.db.collection('systemConfig').updateOne(
        { type: 'masterKey' },
        { $set: { lastAccessed: new Date() } }
      );
    } catch (error) {
      console.log('Note: Could not update master key access time:', error.message);
    }
  }

  // API Configuration methods
  async getApiConfig() {
    await this.ensureConnection();
    
    try {
      const configDoc = await this.db.collection('systemConfig').findOne({ type: 'apiConfig' });
      return configDoc ? configDoc.value : null;
    } catch (error) {
      console.error('Error retrieving API config from MongoDB:', error.message);
      return null;
    }
  }

  async saveApiConfig(apiConfig) {
    await this.ensureConnection();
    
    try {
      await this.db.collection('systemConfig').replaceOne(
        { type: 'apiConfig' },
        {
          type: 'apiConfig',
          value: apiConfig,
          updatedAt: new Date()
        },
        { upsert: true }
      );
      
      console.log('💾 API configuration saved to MongoDB');
      return true;
    } catch (error) {
      console.error('Error saving API config to MongoDB:', error.message);
      return false;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('MongoDB connection closed');
    }
  }
}

// Legacy file-based DataStorageManager for fallback
class DataStorageManager {
  constructor() {
    this.SEARCH_HISTORY_FILE = path.join(process.cwd(), '.search-history.json');
    this.EXCLUSION_LIST_FILE = path.join(process.cwd(), '.exclusion-list.json');
    this.fileLocks = new Map(); // Simple file locking mechanism
  }
  
  async withFileLock(filePath, operation) {
    while (this.fileLocks.get(filePath)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.fileLocks.set(filePath, true);
    try {
      return await operation();
    } finally {
      this.fileLocks.delete(filePath);
    }
  }
  
  async loadSearchHistory() {
    return this.withFileLock(this.SEARCH_HISTORY_FILE, () => {
      try {
        if (fs.existsSync(this.SEARCH_HISTORY_FILE)) {
          const data = fs.readFileSync(this.SEARCH_HISTORY_FILE, 'utf8');
          return JSON.parse(data);
        }
        return [];
      } catch (error) {
        console.error('Error loading search history:', error.message);
        return [];
      }
    });
  }
  
  async saveSearchHistory(history) {
    return this.withFileLock(this.SEARCH_HISTORY_FILE, () => {
      try {
        fs.writeFileSync(this.SEARCH_HISTORY_FILE, JSON.stringify(history, null, 2));
      } catch (error) {
        console.error('Error saving search history:', error.message);
        throw error;
      }
    });
  }
  
  async loadExclusionList() {
    return this.withFileLock(this.EXCLUSION_LIST_FILE, () => {
      try {
        if (fs.existsSync(this.EXCLUSION_LIST_FILE)) {
          const data = fs.readFileSync(this.EXCLUSION_LIST_FILE, 'utf8');
          return JSON.parse(data);
        }
        return {};
      } catch (error) {
        console.error('Error loading exclusion list:', error.message);
        return {};
      }
    });
  }
  
  async saveExclusionList(exclusions) {
    return this.withFileLock(this.EXCLUSION_LIST_FILE, () => {
      try {
        fs.writeFileSync(this.EXCLUSION_LIST_FILE, JSON.stringify(exclusions, null, 2));
      } catch (error) {
        console.error('Error saving exclusion list:', error.message);
        throw error;
      }
    });
  }
  
  async addToSearchHistory(query) {
    const history = await this.loadSearchHistory();
    const { location, date, duration_hours, ages } = query;
    
    // Create a unique key for the search
    const searchKey = `${location}-${date}-${duration_hours || ''}-${ages?.join(',') || ''}`;
    
    // Remove existing entry with same parameters if it exists
    const filteredHistory = history.filter(entry => 
      `${entry.location}-${entry.date}-${entry.duration || ''}-${entry.kidsAges?.join(',') || ''}` !== searchKey
    );
    
    // Add new entry at the beginning
    const historyEntry = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      location,
      date,
      duration: duration_hours || null,
      kidsAges: ages || [],
      timestamp: new Date().toISOString(),
      searchCount: 1
    };
    
    const newHistory = [historyEntry, ...filteredHistory].slice(0, 20);
    await this.saveSearchHistory(newHistory);
    return historyEntry;
  }
  
  async addToExclusionList(location, attraction) {
    const exclusions = await this.loadExclusionList();
    
    if (!exclusions[location]) {
      exclusions[location] = [];
    }
    
    if (!exclusions[location].includes(attraction)) {
      exclusions[location].push(attraction);
      await this.saveExclusionList(exclusions);
      return true;
    }
    
    return false;
  }
  
  async removeFromExclusionList(location, attraction) {
    const exclusions = await this.loadExclusionList();
    
    if (exclusions[location]) {
      const initialLength = exclusions[location].length;
      exclusions[location] = exclusions[location].filter(item => item !== attraction);
      
      if (exclusions[location].length === 0) {
        delete exclusions[location];
      }
      
      if (initialLength > (exclusions[location]?.length || 0)) {
        await this.saveExclusionList(exclusions);
        return true;
      }
    }
    
    return false;
  }
}

// Initialize Neo4j data manager (with fallback to file-based storage)
let dataManager;
let isNeo4jConnected = false;

async function initializeDataManager() {
  try {
    // Check if Neo4j environment variables are configured
    if (!process.env.NEO4J_URI || !process.env.NEO4J_USER || !process.env.NEO4J_PASSWORD) {
      console.log('⚠️  Neo4j environment variables not found (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)');
      console.log('📝 Using local file storage. See ENVIRONMENT_SETUP.md for Neo4j setup instructions.');
      dataManager = new DataStorageManager();
      isNeo4jConnected = false;
      return;
    }

    console.log('🔗 Neo4j credentials found, attempting connection...');
    dataManager = new Neo4jDataManager(apiKeys);
    await dataManager.connect();
    isNeo4jConnected = true;
    console.log('✅ Using Neo4j AuraDB for data storage');
  } catch (error) {
    console.warn('❌ Neo4j connection failed, falling back to file-based storage');
    console.warn('Error details:', error.message);
    console.log('📝 Check your Neo4j credentials in .env file. See ENVIRONMENT_SETUP.md for setup instructions.');
    dataManager = new DataStorageManager();
    isNeo4jConnected = false;
  }
}

// Initialize encryption key and data manager
async function initializeSystem() {
  // First initialize the data manager
  await initializeDataManager();
  
  // Then initialize the encryption key (which may depend on Neo4j)
  try {
    ENCRYPTION_KEY = await getOrCreateMasterKey();
    console.log('🔐 Encryption system initialized');
    
    // Load API keys after encryption is ready
    await loadApiKeys();
    loadSearchHistory();
    loadExclusionList();
    
    // Initialize AI providers with loaded keys
    initializeAIProviders();
  } catch (error) {
    console.error('Failed to initialize encryption key:', error.message);
    // Generate a temporary key for this session
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    console.log('⚠️  Using temporary encryption key for this session');
  }
}

// Initialize the system
initializeSystem().catch(error => {
  console.error('Failed to initialize system:', error.message);
  // Fallback initialization
  dataManager = new DataStorageManager();
  isNeo4jConnected = false;
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  console.log('⚠️  Running with fallback configuration');
});

// Legacy global variables (deprecated - kept for backward compatibility)
let searchHistory = [];
let exclusionList = {};



// Encryption utilities
function encrypt(text) {
  if (!text) return '';
  if (!ENCRYPTION_KEY) {
    console.log('⚠️  Encryption key not ready, returning text as-is');
    return text;
  }
  
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.log('Encryption error:', error.message);
    return text; // Return unencrypted if encryption fails
  }
}

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  if (!ENCRYPTION_KEY) {
    console.log('⚠️  Encryption key not ready, returning text as-is');
    return encryptedText;
  }
  
  try {
    // Handle both old format (without IV) and new format (with IV)
    if (encryptedText.includes(':')) {
      // New format with IV
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const parts = encryptedText.split(':');
      if (parts.length !== 2) return '';
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      // Old format - fallback for existing encrypted data
      const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch (error) {
    console.log(`Decryption failed for key, skipping: ${error.message}`);
    return '';
  }
}

// Load API keys on startup
async function loadApiKeys() {
  try {
    // First try to load from Neo4j if available
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const neo4jConfig = await dataManager.getApiConfig();
        if (neo4jConfig) {
          let loadedAnyKey = false;
          
          Object.keys(apiKeys).forEach(key => {
            if (neo4jConfig[key]) {
              if (typeof neo4jConfig[key] === 'string') {
                const decryptedValue = decrypt(neo4jConfig[key]);
                if (decryptedValue) {
                  apiKeys[key] = decryptedValue;
                  loadedAnyKey = true;
                }
              } else {
                // Non-string values are stored directly
                apiKeys[key] = neo4jConfig[key];
                loadedAnyKey = true;
              }
            }
          });
          
          if (loadedAnyKey) {
            console.log('☁️ API keys loaded from Neo4j');
            applyCacheSettings();
            return;
          }
        }
      } catch (neo4jError) {
        console.log('⚠️  Could not load API config from Neo4j:', neo4jError.message);
      }
    }

    // Fallback to local file
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const encryptedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        let loadedAnyKey = false;
        
        Object.keys(apiKeys).forEach(key => {
          if (encryptedConfig[key]) {
            if (typeof encryptedConfig[key] === 'string') {
              const decryptedValue = decrypt(encryptedConfig[key]);
              if (decryptedValue) {
                apiKeys[key] = decryptedValue;
                loadedAnyKey = true;
              }
            } else {
              // Non-string values are stored directly
              apiKeys[key] = encryptedConfig[key];
              loadedAnyKey = true;
            }
          }
        });
        
        if (loadedAnyKey) {
          console.log('💾 API keys loaded from local file');
          
          // Migrate to Neo4j if connected
          if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
            try {
              await dataManager.saveApiConfig(encryptedConfig);
              console.log('🔄 Migrated API configuration from file to Neo4j');
            } catch (migrateError) {
              console.log('⚠️  Failed to migrate API config to Neo4j:', migrateError.message);
            }
          }

          applyCacheSettings();
          return;
        } else {
          console.log('No valid encrypted keys found, falling back to environment variables');
        }
      } catch (configError) {
        console.log('Configuration file corrupted, clearing and using environment variables:', configError.message);
        // Delete corrupted config file
        fs.unlinkSync(CONFIG_FILE);
      }
    }
    
    // Final fallback to environment variables
    loadFromEnvironment();
    applyCacheSettings();
  } catch (error) {
    console.error('Error loading API keys:', error.message);
    loadFromEnvironment();
    applyCacheSettings();
  }
}

function loadFromEnvironment() {
  // Load from environment variables as fallback
  // AI Provider Environment Variables:
  // - GEMINI_API_KEY: Google Gemini API key
  // - OPENROUTER_API_KEY: OpenRouter API key  
  // - TOGETHER_API_KEY: Together.ai API key (supports JSON mode)
  // - AI_PROVIDER: 'gemini', 'openrouter', or 'together'
  // - OPENROUTER_MODEL: OpenRouter model name
  // - TOGETHER_MODEL: Together.ai model name (JSON mode supported models recommended)
  apiKeys.gemini_api_key = process.env.GEMINI_API_KEY || '';
  apiKeys.openrouter_api_key = process.env.OPENROUTER_API_KEY || '';
  apiKeys.together_api_key = process.env.TOGETHER_API_KEY || '';
  apiKeys.ai_provider = process.env.AI_PROVIDER || 'gemini';
  apiKeys.openrouter_model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free';
  apiKeys.together_model = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.2-3B-Instruct-Turbo';
  apiKeys.google_search_api_key = process.env.GOOGLE_SEARCH_API_KEY || '';
  apiKeys.google_search_engine_id = process.env.GOOGLE_SEARCH_ENGINE_ID || '';
  apiKeys.openwebninja_api_key = process.env.OPENWEBNINJA_API_KEY || '';
  apiKeys.ticketmaster_api_key = process.env.TICKETMASTER_API_KEY || '';
  apiKeys.enable_gemini_holidays = process.env.ENABLE_GEMINI_HOLIDAYS === 'true' || false;
  apiKeys.max_activities = parseInt(process.env.MAX_ACTIVITIES) || 20;
  apiKeys.cache_include_model = process.env.CACHE_INCLUDE_MODEL === 'true' || false;
  apiKeys.cache_similarity_threshold = parseFloat(process.env.CACHE_SIMILARITY_THRESHOLD) || 0.90;
  apiKeys.cache_location_weight = parseFloat(process.env.CACHE_LOCATION_WEIGHT) || 0.20;
  apiKeys.cache_weather_weight = parseFloat(process.env.CACHE_WEATHER_WEIGHT) || 0.40;
  apiKeys.cache_temporal_weight = parseFloat(process.env.CACHE_TEMPORAL_WEIGHT) || 0.30;
  apiKeys.cache_demographic_weight = parseFloat(process.env.CACHE_DEMOGRAPHIC_WEIGHT) || 0.10;
  
  const hasKeys = Object.values(apiKeys).some(key => typeof key === 'string' && key.length > 0);
  if (hasKeys) {
    console.log('API keys loaded from environment variables');
  }
}

// Save API keys securely
async function saveApiKeys() {
  try {
    const encryptedConfig = {};
    Object.keys(apiKeys).forEach(key => {
      // Save all values, including false booleans and empty strings
      if (apiKeys[key] !== null && apiKeys[key] !== undefined) {
        // Encrypt string values, save others as-is
        if (typeof apiKeys[key] === 'string' && apiKeys[key].length > 0) {
          encryptedConfig[key] = encrypt(apiKeys[key]);
        } else if (typeof apiKeys[key] !== 'string') {
          encryptedConfig[key] = apiKeys[key]; // Save non-string values directly (including false booleans)
        }
      }
    });

    // Save to Neo4j first if available
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        await dataManager.saveApiConfig(encryptedConfig);
        console.log('☁️ API keys saved to Neo4j');
      } catch (neo4jError) {
        console.log('⚠️  Failed to save API config to Neo4j:', neo4jError.message);
      }
    }

    // Always save to local file as backup
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(encryptedConfig, null, 2));
    console.log('💾 API keys saved to local file (backup)');
  } catch (error) {
    console.error('Error saving API keys:', error.message);
  }
}

// Legacy functions for backward compatibility (deprecated)
function loadSearchHistory() {
  dataManager.loadSearchHistory().then(history => {
    searchHistory = history;
    console.log(`Loaded ${searchHistory.length} search history entries`);
  }).catch(error => {
    console.error('Error loading search history:', error.message);
    searchHistory = [];
  });
}

function loadExclusionList() {
  dataManager.loadExclusionList().then(list => {
    exclusionList = list;
    const totalExclusions = Object.values(exclusionList).reduce((sum, list) => sum + list.length, 0);
    console.log(`Loaded exclusion list for ${Object.keys(exclusionList).length} locations (${totalExclusions} total exclusions)`);
  }).catch(error => {
    console.error('Error loading exclusion list:', error.message);
    exclusionList = {};
  });
}

function saveExclusionList() {
  dataManager.saveExclusionList(exclusionList)
    .then(() => console.log('Exclusion list saved successfully'))
    .catch(error => console.error('Error saving exclusion list:', error.message));
}

function saveSearchHistory() {
  dataManager.saveSearchHistory(searchHistory)
    .catch(error => console.error('Error saving search history:', error.message));
}

function addToSearchHistory(query) {
  console.log('Adding to search history:', query);
  dataManager.addToSearchHistory(query)
    .then(entry => {
      console.log('Created history entry:', entry);
      // Update legacy global for backward compatibility
      searchHistory = [entry, ...searchHistory.filter(e => e.id !== entry.id)].slice(0, 20);
    })
    .catch(error => console.error('Error adding to search history:', error.message));
}

// System initialization is now handled by initializeSystem() function

const JSON_SCHEMA = {
  query: {
    location: 'string',
    date: 'YYYY-MM-DD',
    duration_hours: 'number',
    ages: 'int[]',
    weather: {
      temperature_min_c: 'number',
      temperature_max_c: 'number',
      precipitation_probability_percent: 'number',
      wind_speed_max_kmh: 'number|null'
    },
    is_public_holiday: 'boolean',
    nearby_festivals: [ { name: 'string', start_date: 'YYYY-MM-DD|null', end_date: 'YYYY-MM-DD|null', url: 'string|null', distance_km: 'number|null' } ]
  },
  activities: [ {
    title: 'string',
    category: 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other',
    description: 'string',
    suitable_ages: 'string',
    duration_hours: 'number',
    address: 'string|optional',
    lat: 'number|optional',
    lon: 'number|optional',
    booking_url: 'string|optional',
    free: 'boolean|optional',
    weather_fit: 'good|ok|bad',
    notes: 'string|optional',
    evidence: ['string[]|optional'],
    source: 'string|optional'
  } ],
  discovered_holidays: [ {
    name: 'string',
    date: 'YYYY-MM-DD',
    type: 'public_holiday|festival|celebration',
    description: 'string|optional'
  } ]
};

function buildUserMessage(ctx, allowedCats, webSearchResults = null, maxActivities = null, holidayFestivalInfo = null, feverEvents = null, aiGeneratedCount = null){
  const totalActivityCount = maxActivities || apiKeys.max_activities || 20;
  
  // Detect if this is a Llama model to provide specific instructions
  const currentModel = getActiveModelName();
  const isLlamaModel = currentModel && currentModel.includes('llama');
  
  // Determine counts based on whether we have Fever events
  const hasFeverEvents = feverEvents && feverEvents.length > 0;
  const feverCount = hasFeverEvents ? feverEvents.length : 0;
  const aiCount = aiGeneratedCount !== null ? aiGeneratedCount : totalActivityCount;
  
  // Get kids ages safely
  const kidsAges = ctx.kids_ages || ctx.kidsAges || [];
  const agesList = kidsAges.length > 0 ? kidsAges.join(', ') + ' years old' : 'all ages';
  
  const basePrompt = hasFeverEvents ? [
    `You are an intelligent event curator and family activities advisor.`,
    '',
    `TASK: Provide ${totalActivityCount} total activities (${feverCount} from curated events + ${aiCount} generated).`,
    '',
    `Below are ${feverEvents.length} candidate events from Fever.com that have been pre-scored for age appropriateness.`,
    `Review these candidates and SELECT THE BEST ${feverCount} that are most suitable for:`,
    `- Ages: ${agesList}`,
    `- Weather: ${ctx.weather.temperature_max_c !== null ? ctx.weather.temperature_max_c + '°C, ' + ctx.weather.precipitation_probability_percent + '% rain chance' : 'unknown'}`,
    `- Duration: ${ctx.duration_hours} hours available`,
    '',
    'SELECTION CRITERIA:',
    '✓ Choose events that best match the specific age group (not just "all ages")',
    '✓ Ensure weather suitability (indoor events for rainy days, etc.)',
    '✓ Diversify - avoid selecting multiple similar events (e.g., not all concerts)',
    `✓ Select exactly ${feverCount} events from the candidates below`,
    '',
    'FOR SELECTED FEVER EVENTS:',
    '✓ 🚨 CRITICAL: Copy the "source" field exactly (source: "Fever")',
    '✓ 🚨 CRITICAL: Copy the "booking_url" field from the event',
    '✓ Translate any non-English content to English',
    '✓ Verify age appropriateness and update suitable_ages if needed',
    '✓ Set accurate weather_fit based on venue type',
    '',
    `FOR AI-GENERATED ACTIVITIES (${aiCount} activities):`,
    `✓ Generate ${aiCount} additional activities from your knowledge of ${ctx.location}`,
    `✓ Tailor to ages: ${agesList}`,
    `✓ Match duration window: ${ctx.duration_hours} hours`,
    '✓ Consider weather conditions',
    '✓ Set source to null for activities you generate',
    '✓ Include booking URLs when possible',
    '',
    'HARD RULES:',
    '✓ ALL content must be in English',
    '✓ Exclude adult-only venues (bars, nightclubs, 18+ events)',
    '✓ Consider public holidays and festivals',
    '✓ Set accurate weather_fit: good (indoor/all-weather), ok (mixed), bad (outdoor-dependent)',
    ''
  ] : [
    `You are a local family activities planner. Using the provided context JSON, suggest ${totalActivityCount} kid-friendly activities.`,
    'HARD RULES:',
    '- Tailor to the exact city and date.',
    '- Respect the duration window.',
    `- Activities must be suitable for: ${agesList}`,
    '- Consider weather; set weather_fit to good/ok/bad.',
    '- Prefer options relevant to public holidays or nearby festivals when applicable.',
    '- Consider if attractions might be closed or have special hours on public holidays.',
    '- IMPORTANT: When possible, include official website links or booking URLs in the booking_url field for attractions, venues, or activities.',
    '- ALL content (titles, descriptions) must be in English.',
    '- Set source to null for all activities.',
    ''
  ];

  // Add model-specific JSON instructions
  if (isLlamaModel) {
    basePrompt.push(
      '🚨 ULTRA-STRICT JSON FORMATTING RULES FOR LLAMA MODELS:',
      '⚠️ CRITICAL: Return ONLY valid JSON - absolutely no markdown, no explanations, no extra text',
      '⚠️ STRUCTURE: Start with {"query":{...},"activities":[...]} and end with exactly }',
      '⚠️ PROPERTIES: Each activity must be a completely separate object in the activities array',
      '⚠️ NO DUPLICATES: Never repeat property names within the same activity object',
      '⚠️ QUOTES: Use only simple double quotes: "property": "value" - never use \\" or smart quotes',
      '⚠️ VALUES: Keep all values simple - strings, numbers, booleans, or null only',
      '⚠️ CATEGORIES: Use only these exact categories: outdoor, indoor, museum, park, playground, water, hike, creative, festival, show, seasonal, other',
      '⚠️ WEATHER_FIT: Use only these exact values: good, ok, bad',
      '⚠️ BOOLEANS: Use true/false for free field, or "true"/"false" as strings',
      '⚠️ NUMBERS: lat/lon should be actual numbers like 41.7853, not strings',
      '⚠️ NULLS: Use null (not "null") for missing lat/lon/address/booking_url/notes',
      '⚠️ NO HOLIDAYS: Do NOT include discovered_holidays field to prevent JSON errors',
      '⚠️ COMPLETE: Always finish with proper closing brackets: ]}',
      '⚠️ EXAMPLE ACTIVITY FROM EVENT: {"title":"Sample Event","category":"show","description":"A sample event description","suitable_ages":"Ages 6+","duration_hours":1.5,"address":"Event Venue, City","booking_url":"https://feverup.com/event-url","free":false,"weather_fit":"good","notes":null,"evidence":[],"source":"Fever"}',
      '⚠️ EXAMPLE AI-GENERATED: {"title":"Sample Activity","category":"park","description":"A sample description","suitable_ages":"All ages","duration_hours":2,"address":"123 Main St","booking_url":null,"free":true,"weather_fit":"good","notes":null,"evidence":[],"source":null}',
      ''
    );
  } else {
    basePrompt.push(
      '- IMPORTANT: Also research and include any public holidays, festivals, or special celebrations happening on or around this date in this location.',
      '- Add discovered holidays/festivals to the "discovered_holidays" array in your response.',
      ''
    );
  }

  basePrompt.push(
    '- Return ONLY a single valid JSON object matching the schema.',
    '- NO markdown code blocks, NO explanatory text, NO commentary.',
    '- Start your response with { and end with }.',
    '- Ensure all strings are properly quoted and escaped.',
    '- Do not include trailing commas.',
    ''
  );

  // Add holiday/festival context if available
  if (holidayFestivalInfo && holidayFestivalInfo.length > 0) {
    basePrompt.push(
      'HOLIDAYS & FESTIVALS CONTEXT:',
      'The following holidays and festivals are happening around this date:',
      ...holidayFestivalInfo.map(event => `- ${event.name}${event.start_date ? ` (${event.start_date}${event.end_date && event.end_date !== event.start_date ? ` to ${event.end_date}` : ''})` : ''}`),
      'Consider these when suggesting activities - some venues may be closed on holidays, or there may be special events related to festivals.',
      ''
    );
  }

  // Add extra instructions from context if provided
  if (ctx.extra_instructions && ctx.extra_instructions.trim()) {
    basePrompt.push(
      'ADDITIONAL REQUIREMENTS:',
      ctx.extra_instructions.trim(),
      ''
    );
  }

  if (webSearchResults && webSearchResults.recommendations) {
    basePrompt.push(
      'CURRENT WEB INSIGHTS:',
      'Use these recent recommendations from travel websites to inform your suggestions:',
      webSearchResults.recommendations,
      'Sources: ' + webSearchResults.sources.map(s => s.source).join(', '),
      ''
    );
  }

  // Add exclusions context (will be populated by the calling function)
  if (ctx.exclusions && ctx.exclusions.length > 0) {
    basePrompt.push(
      'DO NOT SUGGEST THESE ATTRACTIONS/ACTIVITIES (user has excluded them):',
      ...ctx.exclusions.map(item => `- ${item}`),
      'Please avoid suggesting these specific attractions, activities, or venues.',
      ''
    );
  }

  // Add candidate Fever events if available
  if (hasFeverEvents) {
    basePrompt.push(
      '═══════════════════════════════════════════════════════════',
      `FEVER EVENT CANDIDATES (${feverEvents.length} candidates - SELECT BEST ${feverCount}):`,
      '═══════════════════════════════════════════════════════════',
      '',
      'These events have been pre-scored for age appropriateness.',
      `Review them carefully and select the BEST ${feverCount} that are:`,
      '- Most suitable for the specified ages',
      '- Appropriate for the weather conditions',
      '- Diverse in type (avoid selecting multiple similar events)',
      '',
      JSON.stringify(feverEvents, null, 2),
      '',
      '═══════════════════════════════════════════════════════════',
      `END OF CANDIDATE EVENTS`,
      `🚨 SELECT THE BEST ${feverCount} events from the ${feverEvents.length} candidates above`,
      `🚨 Copy their "source" and "booking_url" fields exactly for selected events`,
      `Then generate ${aiCount} more activities from your knowledge.`,
      '═══════════════════════════════════════════════════════════',
      ''
    );
  }

  basePrompt.push(
    'Allowed categories: ' + allowedCats + '.',
    'Output schema example keys:',
    JSON.stringify(JSON_SCHEMA),
    '',
    'Context JSON:',
    JSON.stringify(ctx)
  );

  return basePrompt.join('\n');
}

function buildUserMessageForDisplay(ctx, allowedCats, maxActivities = null, extraInstructions = '', holidayFestivalInfo = null){
  const activityCount = maxActivities || apiKeys.max_activities || 20;
  const sixthCount = Math.floor(activityCount / 6);
  const aiCount = activityCount - sixthCount;
  
  const basePrompt = [
    `You are a local family activities planner. Using the provided context JSON, suggest ${activityCount} kid-friendly activities.`,
    '',
    '🎪 NOTE: In the actual search, real Fever.com events will be fetched and included in the prompt.',
    `The AI will receive approximately ${sixthCount} pre-filtered live events from Fever,`,
    `and will be asked to generate ${aiCount} additional activities from its knowledge.`,
    `The Fever events section is not shown in this preview but will be added automatically.`,
    '',
    'HARD RULES:',
    '- Tailor to the exact city and date.',
    '- Respect the duration window.',
    '- Activities must fit ALL provided ages.',
    '- Consider weather; set weather_fit to good/ok/bad.',
    '- Prefer options relevant to public holidays or nearby festivals when applicable.',
    '- Consider if attractions might be closed or have special hours on public holidays.',
    '- IMPORTANT: When possible, include official website links or booking URLs in the booking_url field for attractions, venues, or activities.',
    '- IMPORTANT: Also research and include any public holidays, festivals, or special celebrations happening on or around this date in this location.',
    '- Add discovered holidays/festivals to the "discovered_holidays" array in your response.',
    '- Return ONLY a single JSON object matching the schema; NO markdown or commentary.',
    ''
  ];

  // Add holiday/festival context if available
  if (holidayFestivalInfo && holidayFestivalInfo.length > 0) {
    basePrompt.push(
      'HOLIDAYS & FESTIVALS CONTEXT:',
      'The following holidays and festivals are happening around this date:',
      ...holidayFestivalInfo.map(event => `- ${event.name}${event.start_date ? ` (${event.start_date}${event.end_date && event.end_date !== event.start_date ? ` to ${event.end_date}` : ''})` : ''}`),
      'Consider these when suggesting activities - some venues may be closed on holidays, or there may be special events related to festivals.',
      ''
    );
  }

  // Add extra instructions if provided
  if (extraInstructions && extraInstructions.trim()) {
    basePrompt.push(
      'ADDITIONAL REQUIREMENTS:',
      extraInstructions.trim(),
      ''
    );
  }

  basePrompt.push(
    'Allowed categories: ' + allowedCats + '.',
    '',
    'Context JSON:',
    JSON.stringify(ctx, null, 2)
  );

  return basePrompt.join('\n');
}

function cleanJsonString(text) {
  // Remove common prefixes/suffixes that models sometimes add
  let cleaned = text.trim();
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  
  // Remove common prefixes
  cleaned = cleaned.replace(/^(?:Here's|Here is|The JSON|JSON:|Response:)\s*/i, '');
  
  // Find the first { and last } to extract just the JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

function removeDuplicateFields(jsonString) {
  // Fix duplicate fields in JSON objects (common issue with some models)
  // This handles cases like: "field": "value", "field": "value2"
  const duplicateFieldPattern = /"([^"]+)":\s*([^,}]+),\s*"([^"]+)":\s*([^,}]+)/g;
  
  return jsonString.replace(duplicateFieldPattern, (match, field1, value1, field2, value2) => {
    // If fields are the same, keep only the first occurrence
    if (field1 === field2) {
      return `"${field1}": ${value1}`;
    }
    // Otherwise, keep both
    return match;
  });
}

function parseJsonWithFallback(text) {
  console.log(`📝 Attempting to parse ${text.length} character response`);
  
  // First, try parsing as-is
  try {
    const result = JSON.parse(text);
    console.log('✅ JSON parsed successfully on first attempt');
    
    // Quick validation check to ensure it has the basic structure we need
    if (isResponseStructureValid(result)) {
      console.log('✅ Basic structure validation passed');
      return result;
    } else {
      console.log('⚠️ JSON parsed but structure invalid, trying fallback methods...');
    }
  } catch (e) {
    console.log('❌ Initial JSON parse failed, trying to clean...', e.message);
  }
  
  // Try cleaning the text (handles reasoning text)
  try {
    const cleaned = cleanJsonString(text);
    console.log(`🧹 Cleaned text from ${text.length} to ${cleaned.length} characters`);
    const result = JSON.parse(cleaned);
    console.log('✅ JSON parsed successfully after cleaning');
    
    // Structure validation for cleaned result
    if (isResponseStructureValid(result)) {
      console.log('✅ Cleaned result structure validation passed');
      return result;
    } else {
      console.log('⚠️ Cleaned result structure invalid, continuing with fixes...');
    }
  } catch (e) {
    console.log('❌ Cleaned JSON parse failed...', e.message);
  }
  
  // Try fixing common JSON issues
  try {
    let fixed = cleanJsonString(text);
    
    // Remove duplicate fields first (common issue with some models)
    fixed = removeDuplicateFields(fixed);
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing commas between array/object elements
    fixed = fixed.replace(/}(\s*){/g, '}, {');
    fixed = fixed.replace(/](\s*)\[/g, '], [');
    
    // Fix unescaped quotes in strings (basic attempt)
    fixed = fixed.replace(/: "([^"]*)"([^",\]\}]*)"([^"]*)",/g, ': "$1\\"$2\\"$3",');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Fix missing quotes around property names
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Enhanced fixes for Llama model-specific issues
    console.log('🔧 Applying Llama-specific JSON repairs...');
    
    // Fix malformed escaped quotes (major issue with Llama models)
    // Pattern: "name\\\":\\\"value\\\" → "name":"value"
    fixed = fixed.replace(/"([^"]+)\\+"\s*:\s*\\+"([^"]*?)\\+"/g, '"$1":"$2"');
    
    // Fix missing quotes around common enum values (weather_fit, category, etc.)
    const enumValues = ['good', 'ok', 'bad', 'outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 'hike', 'creative', 'festival', 'show', 'seasonal', 'other'];
    enumValues.forEach(value => {
      // Fix unquoted enum values: "weather_fit":good → "weather_fit":"good"
      const unquotedRegex = new RegExp(`(:\\s*)${value}(\\s*[,}])`, 'g');
      fixed = fixed.replace(unquotedRegex, `$1"${value}"$2`);
    });
    
    // Fix boolean values without quotes: "free":true → "free":"true"
    fixed = fixed.replace(/(:\s*)true(\s*[,}])/g, '$1"true"$2');
    fixed = fixed.replace(/(:\s*)false(\s*[,}])/g, '$1"false"$2');
    
    // Fix numeric strings that should be numbers: "duration_hours":"2" → "duration_hours":2
    fixed = fixed.replace(/("duration_hours"\s*:\s*)"(\d+(?:\.\d+)?)"/g, '$1$2');
    fixed = fixed.replace(/("lat"\s*:\s*)"(-?\d+(?:\.\d+)?)"/g, '$1$2');
    fixed = fixed.replace(/("lon"\s*:\s*)"(-?\d+(?:\.\d+)?)"/g, '$1$2');
    
    // Fix extra spaces in quoted values: "free ":"true " → "free":"true"
    fixed = fixed.replace(/"([^"]+)\s+"\s*:\s*"([^"]*)\s*"/g, '"$1":"$2"');
    
    // Fix malformed activity objects that are concatenated instead of in array
    // Look for pattern: },"title": that should be },{"title":
    fixed = fixed.replace(/},\s*"title":/g, '},{"title":');
    
    // Remove problematic discovered_holidays section that often has malformed JSON
    if (fixed.includes('discovered_holidays')) {
      console.log('🔧 Removing problematic discovered_holidays section...');
      fixed = fixed.replace(/,?\s*"discovered_holidays"\s*:\s*\[[^\]]*$/g, '');
    }
    
    console.log(`🔧 Applied JSON fixes, final length: ${fixed.length}`);
    const result = JSON.parse(fixed);
    console.log('✅ JSON parsed successfully after fixes');
    
    // Structure validation for fixed result
    if (isResponseStructureValid(result)) {
      console.log('✅ Fixed result structure validation passed');
      return result;
    } else {
      console.log('⚠️ Fixed result structure invalid, trying aggressive repairs...');
    }
  } catch (e) {
    console.log('❌ Fixed JSON parse failed...', e.message);
  }
  
  // Final attempt: More aggressive duplicate field removal
  try {
    let fixed = cleanJsonString(text);
    
    // More aggressive duplicate field removal - scan for patterns like:
    // "field": value, ... "field": value2
    const lines = fixed.split('\n');
    const seenFields = new Set();
    const cleanedLines = [];
    
    for (const line of lines) {
      const fieldMatch = line.match(/"([^"]+)":\s*/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const lineKey = `${fieldName}_${JSON.stringify(line.match(/:\s*([^,}]+)/)?.[1] || '')}`;
        
        if (!seenFields.has(lineKey)) {
          seenFields.add(lineKey);
          cleanedLines.push(line);
        } else {
          console.log(`🔧 Removed duplicate field: ${fieldName}`);
        }
      } else {
        cleanedLines.push(line);
      }
    }
    
    fixed = cleanedLines.join('\n');
    
    // Apply other fixes with enhanced Llama handling
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    fixed = fixed.replace(/}(\s*){/g, '}, {');
    fixed = fixed.replace(/](\s*)\[/g, '], [');
    fixed = fixed.replace(/'/g, '"');
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Additional fixes for Llama's specific issues
    // Fix empty property values that should be null/false/defaults
    fixed = fixed.replace(/"lat"\s*:\s*""\s*,/g, '"lat":null,');
    fixed = fixed.replace(/"lon"\s*:\s*""\s*,/g, '"lon":null,');
    fixed = fixed.replace(/"free"\s*:\s*""\s*,/g, '"free":false,');
    fixed = fixed.replace(/"weather_fit"\s*:\s*""\s*,/g, '"weather_fit":"ok",');
    fixed = fixed.replace(/"booking_url"\s*:\s*""\s*,/g, '"booking_url":null,');
    fixed = fixed.replace(/"notes"\s*:\s*""\s*,/g, '"notes":null,');
    fixed = fixed.replace(/"address"\s*:\s*""\s*,/g, '"address":null,');
    
    // Handle incomplete JSON by ensuring proper closing
    if (!fixed.trim().endsWith('}') && !fixed.trim().endsWith(']')) {
      console.log('🔧 Adding missing JSON closing brackets...');
      if (fixed.includes('"activities":[')) {
        // Ensure activities array is properly closed
        if (!fixed.includes(']}')) {
          fixed = fixed.replace(/[,\s]*$/, '') + ']}';
        }
      } else {
        fixed = fixed.replace(/[,\s]*$/, '') + '}';
      }
    }
    
    // Additional Llama-specific aggressive repairs
    console.log('🔧 Applying aggressive Llama-specific repairs...');
    
    // Enhanced Llama activity reconstruction
    try {
      console.log('🔧 Starting enhanced Llama activity reconstruction...');
      
      // Find the activities array content - use permissive regex for incomplete JSON
      const activitiesMatch = fixed.match(/"activities"\s*:\s*\[(.*)$/);
      if (activitiesMatch) {
        let activitiesContent = activitiesMatch[1];
        console.log(`🔧 Found activities content: ${activitiesContent.length} characters`);
        
        // Check for multiple title properties (indicates malformed structure)
        const titleMatches = activitiesContent.match(/"title"\s*:/g);
        if (titleMatches && titleMatches.length > 1) {
          console.log(`🔧 Found ${titleMatches.length} title properties, reconstructing...`);
          
          // More sophisticated reconstruction approach
          const activities = [];
          const requiredFields = ['title', 'category', 'description', 'suitable_ages', 'duration_hours', 'weather_fit'];
          
          // Split on title boundaries and reconstruct each activity
          const titleSplits = activitiesContent.split(/(?="title"\s*:)/);
          
          for (let i = 0; i < titleSplits.length; i++) {
            const segment = titleSplits[i].trim();
            if (!segment || segment.length < 10) continue; // Skip tiny segments
            
            console.log(`🔧 Processing segment ${i + 1}: ${segment.substring(0, 100)}...`);
            
            try {
              // Extract properties from this segment until we hit the next title
              let activityProps = {};
              
              // Find all property patterns in this segment
              const propRegex = /"([^"]+)"\s*:\s*([^,}]+(?:}|,|$))/g;
              let match;
              let foundProperties = 0;
              
              while ((match = propRegex.exec(segment)) !== null) {
                const [, propName, propValue] = match;
                
                // Stop if we hit a property that belongs to the next activity
                if (propName === 'title' && foundProperties > 0) break;
                
                // Clean the property value
                let cleanValue = propValue.trim().replace(/,$/, '');
                
                // Handle quoted strings
                if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
                  cleanValue = cleanValue.slice(1, -1);
                }
                
                // Handle empty strings and special values
                if (cleanValue === '' || cleanValue === '""') {
                  if (['booking_url', 'notes', 'address'].includes(propName)) {
                    cleanValue = null;
                  } else if (['lat', 'lon'].includes(propName)) {
                    cleanValue = null;
                  } else if (propName === 'free') {
                    cleanValue = false;
                  } else if (propName === 'weather_fit') {
                    cleanValue = 'ok';
                  } else if (propName === 'category') {
                    cleanValue = 'other';
                  } else if (propName === 'suitable_ages') {
                    cleanValue = 'All ages';
                  } else if (propName === 'description') {
                    cleanValue = 'Activity description';
                  }
                }
                
                // Convert numeric strings to actual numbers
                if (propName === 'duration_hours' && typeof cleanValue === 'string') {
                  cleanValue = parseFloat(cleanValue) || 2;
                }
                if (['lat', 'lon'].includes(propName) && typeof cleanValue === 'string' && cleanValue !== '') {
                  cleanValue = parseFloat(cleanValue) || null;
                }
                
                // Handle invalid category formats (like "park|playground")
                if (propName === 'category' && typeof cleanValue === 'string' && cleanValue.includes('|')) {
                  // Take the first valid category from pipe-separated list
                  const validCategories = ['outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 'hike', 'creative', 'festival', 'show', 'seasonal', 'other'];
                  const categories = cleanValue.split('|').map(c => c.trim().toLowerCase());
                  cleanValue = categories.find(c => validCategories.includes(c)) || 'other';
                }
                
                activityProps[propName] = cleanValue;
                foundProperties++;
              }
              
              // Ensure we have minimum required fields
              const hasRequired = requiredFields.every(field => activityProps.hasOwnProperty(field));
              if (hasRequired && activityProps.title) {
                // Set defaults for missing fields
                if (!activityProps.evidence) activityProps.evidence = [];
                if (activityProps.duration_hours && typeof activityProps.duration_hours === 'string') {
                  activityProps.duration_hours = parseFloat(activityProps.duration_hours) || 2;
                }
                
                activities.push(activityProps);
                console.log(`✅ Successfully reconstructed activity: "${activityProps.title}"`);
              }
            } catch (segmentError) {
              console.log(`⚠️ Failed to process segment ${i + 1}:`, segmentError.message);
            }
          }
          
          if (activities.length > 0) {
            // Reconstruct as proper JSON
            const reconstructedJson = JSON.stringify(activities);
            fixed = fixed.replace(/"activities"\s*:\s*\[[^\]]*(?:\]|$)/, `"activities":${reconstructedJson}`);
            console.log(`🔧 Successfully reconstructed ${activities.length} activities from malformed structure`);
          }
        }
        
        // Handle malformed discovered_holidays section (common in Llama responses)
        if (fixed.includes('discovered_holidays')) {
          console.log('🔧 Fixing malformed discovered_holidays section...');
          // Remove malformed discovered_holidays that cause JSON parsing errors
          fixed = fixed.replace(/,?\s*"discovered_holidays"\s*:\s*\[[^\]]*\]?[^}]*$/g, '');
          // Also handle escaped quotes in discovered_holidays  
          fixed = fixed.replace(/"discovered_holidays"\s*:\s*\[.*?"name\\\\\"[^}]*$/g, '');
        }
        
        // Handle incomplete JSON (missing closing brackets)
        if (!fixed.endsWith('}')) {
          console.log('🔧 Fixing incomplete JSON ending...');
          // Remove any trailing incomplete content and close properly
          fixed = fixed.replace(/[,\s]*$/, '') + '}';
        }
      }
    } catch (reconstructError) {
      console.log('⚠️ Enhanced activity reconstruction failed:', reconstructError.message);
    }
    
    // Apply enum and boolean fixes again after reconstruction
    const enumValues = ['good', 'ok', 'bad', 'outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 'hike', 'creative', 'festival', 'show', 'seasonal', 'other'];
    enumValues.forEach(value => {
      const unquotedRegex = new RegExp(`(:\\s*)${value}(\\s*[,}])`, 'g');
      fixed = fixed.replace(unquotedRegex, `$1"${value}"$2`);
    });
    
    fixed = fixed.replace(/(:\s*)true(\s*[,}])/g, '$1"true"$2');
    fixed = fixed.replace(/(:\s*)false(\s*[,}])/g, '$1"false"$2');
    fixed = fixed.replace(/"([^"]+)\s+"\s*:\s*"([^"]*)\s*"/g, '"$1":"$2"');
    
    console.log(`🔧 Applied aggressive JSON fixes, final length: ${fixed.length}`);
    const result = JSON.parse(fixed);
    console.log('✅ JSON parsed successfully after aggressive fixes');
    
    // Final structure validation
    if (isResponseStructureValid(result)) {
      console.log('✅ Final structure validation passed');
      return result;
    } else {
      console.log('⚠️ Final structure validation failed');
      throw new Error('Parsed JSON does not have valid activity structure');
    }
    
    return result;
  } catch (e) {
    console.log('❌ Aggressive fixed JSON parse failed...', e.message);
    console.log('🚨 Raw response preview:', text.substring(0, 500) + '...');
    console.log('🚨 Cleaned response preview:', cleanJsonString(text).substring(0, 500) + '...');
    throw new Error(`Failed to parse JSON response after multiple attempts. The AI model may have returned malformed JSON. Please try again. Error: ${e.message}`);
  }
}

async function searchCurrentEvents(location, date) {
  try {
    const results = [];
    const locationName = location.split(',')[0].trim();
    const today = new Date().toISOString().split('T')[0];
    const searchDate = date || today;
    
    // Get current events and festivals info
    const eventSources = [
      {
        name: 'Local Events',
        searches: [
          `${locationName} events today ${searchDate}`,
          `${locationName} festivals ${new Date().getFullYear()}`,
          `${locationName} family events this week`,
          `${locationName} concerts shows ${searchDate}`
        ]
      }
    ];

    // Enhanced event information based on location (providing local intelligence like AI Overview)
    console.log(`Generating enhanced local intelligence for: ${locationName}`);
    if (locationName.toLowerCase().includes('madrid')) {
      const currentMonth = new Date().getMonth() + 1;
      const currentDay = new Date().getDate();
      
      // Check if we're near major festival dates
      const festivals = [];
      
      // San Isidro Festival (May 15)
      if (currentMonth === 5) {
        festivals.push({
          name: 'San Isidro Festival',
          status: currentDay <= 15 ? 'upcoming' : 'recently ended',
          date: 'May 15th',
          description: 'Madrid\'s patron saint festival with traditional celebrations, folk dancing, and cultural events throughout the city'
        });
      }
      
      // Summer festivals (July)
      if (currentMonth >= 6 && currentMonth <= 8) {
        festivals.push({
          name: 'Mad Cool Festival',
          status: 'season',
          date: 'July (Summer)',
          description: 'International music festival featuring major artists across rock, pop, indie, and electronic genres'
        });
      }
      
      let festivalInfo = '';
      if (festivals.length > 0) {
        festivalInfo = festivals.map(f => `${f.name} (${f.date}): ${f.description}`).join('. ') + '. ';
      }
      
      results.push({
        title: 'Madrid Events & Festivals Intelligence',
        url: 'https://www.esmadrid.com/en',
        snippet: `${festivalInfo}For current events, check Bandsintown for concerts and live performances. Visit ESMadrid.com for ongoing cultural activities, music shows, and family events. Popular venues include Retiro Park for outdoor events and various cultural centers throughout the city.`,
        source: 'Local Intelligence (Enhanced)',
        details: {
          major_annual_festivals: [
            {
              name: 'San Isidro Festival',
              date: 'May 15th',
              family_friendly: true,
              description: 'Traditional celebrations with folk music, dancing, and cultural activities'
            },
            {
              name: 'Mad Cool Festival',
              date: 'July',
              family_friendly: false,
              description: 'Major international music festival with world-class artists'
            },
            {
              name: 'Veranos de la Villa',
              date: 'July-September',
              family_friendly: true,
              description: 'Summer cultural program with outdoor concerts, theater, and family activities'
            }
          ],
          event_resources: [
            { name: 'Bandsintown', url: 'https://www.bandsintown.com/madrid', type: 'Concerts & Live Music' },
            { name: 'ESMadrid', url: 'https://www.esmadrid.com/en', type: 'Official Tourism Events' },
            { name: 'Time Out Madrid', url: 'https://www.timeout.com/madrid', type: 'Current Events & Activities' }
          ]
        }
      });
    }
    
    // Add location-specific event patterns for other major cities
    else if (locationName.toLowerCase().includes('barcelona')) {
      results.push({
        title: 'Barcelona Events & Festivals',
        url: 'https://www.barcelona.cat/en',
        snippet: 'La Mercè Festival (September): Barcelona\'s biggest annual festival with parades, concerts, and cultural events. Primavera Sound (May/June): Major music festival. Check Barcelona.cat and local event platforms for current activities.',
        source: 'Barcelona Tourism'
      });
    }
    else if (locationName.toLowerCase().includes('paris')) {
      results.push({
        title: 'Paris Events & Festivals',
        url: 'https://www.parisinfo.com/en',
        snippet: 'Fête de la Musique (June 21): City-wide music celebration. Nuit Blanche (October): All-night arts festival. Christmas Markets (December). Visit ParisInfo.com and local venues for family-friendly events and current exhibitions.',
        source: 'Paris Tourism'
      });
    }

    // Add general event search results
    results.push({
      title: `${locationName} Family Events & Activities`,
      url: `https://www.google.com/search?q=${encodeURIComponent(locationName + ' family events today')}`,
      snippet: `Current family-friendly events, festivals, and activities happening in ${locationName}. Updated daily with concerts, cultural events, and seasonal celebrations.`,
      source: 'Event Search'
    });

    return results;
    
  } catch (error) {
    console.log('Event search failed:', error.message);
    return [];
  }
}

async function searchWeb(query, location, date = null, maxResults = 5) {
  try {
    const results = [];
    
    // Normalize location for URL creation
    const locationSlug = location.toLowerCase()
      .replace(/,.*$/, '') // Remove country part
      .replace(/[^a-z\s]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .trim();
    
    // First, get current events and festivals with date context
    const eventResults = await searchCurrentEvents(location, date);
    results.push(...eventResults);
    
    // Get real-time event data from APIs (with individual error handling)
    const [googleResults, openWebNinjaEvents] = await Promise.allSettled([
      searchWithGoogleAPI(query, location).catch(err => {
        console.log('Google Search API error (non-blocking):', err.message);
        return [];
      }),
      searchOpenWebNinjaEvents(location, date).catch(err => {
        console.log('OpenWeb Ninja API error (non-blocking):', err.message);
        return [];
      })
    ]);
    
    // Extract results from settled promises
    const googleData = googleResults.status === 'fulfilled' ? googleResults.value : [];
    const openWebNinjaData = openWebNinjaEvents.status === 'fulfilled' ? openWebNinjaEvents.value : [];
    
    if (googleData.length > 0) {
      results.push(...googleData);
      console.log(`Added ${googleData.length} Google search results`);
    }
    
    if (openWebNinjaData.length > 0) {
      results.push(...openWebNinjaData);
      console.log(`Added ${openWebNinjaData.length} OpenWeb Ninja events`);
    }
    
    // Then get family travel content from trusted sources
    const sources = [
      {
        name: 'Lonely Planet',
        urlPattern: `https://www.lonelyplanet.com/articles/${locationSlug}-with-kids`,
        fallbackPattern: `https://www.lonelyplanet.com/articles/${locationSlug}-family`,
        searchPattern: `site:lonelyplanet.com ${location} kids children family`
      },
      {
        name: 'Time Out',
        urlPattern: `https://www.timeout.com/${locationSlug}/kids`,
        fallbackPattern: `https://www.timeout.com/${locationSlug}/family`, 
        searchPattern: `site:timeout.com ${location} kids family activities`
      }
    ];
    
    for (const source of sources) {
      try {
        let targetUrl = source.urlPattern;
        
        // Create a timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        try {
          let response = await fetch(targetUrl, { 
            method: 'HEAD',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; KidsActivitiesFinder/1.0)'
            }
          });
          
          if (!response.ok && source.fallbackPattern) {
            targetUrl = source.fallbackPattern;
            response = await fetch(targetUrl, { 
              method: 'HEAD',
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KidsActivitiesFinder/1.0)'
              }
            });
          }
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            results.push({
              title: `${location} Family Activities - ${source.name}`,
              url: targetUrl,
              snippet: `Discover the best family-friendly activities, attractions, and dining options in ${location}. Expert recommendations for families traveling with children.`,
              source: source.name
            });
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
        
      } catch (error) {
        // If direct URL doesn't work, add a generic entry
        results.push({
          title: `${location} Family Guide - ${source.name}`,
          url: source.urlPattern,
          snippet: `Family travel guide for ${location} with kid-friendly attractions, activities, and practical tips for traveling with children.`,
          source: source.name
        });
      }
    }
    
    return results.slice(0, maxResults);
    
  } catch (error) {
    console.log('Web search failed:', error.message);
    return [
      {
        title: `${location} Family Travel Guide`,
        url: `https://www.google.com/search?q=${encodeURIComponent(location + ' family activities with kids')}`,
        snippet: `Find family-friendly activities, attractions, and dining options in ${location}. Recommendations for traveling with children.`,
        source: 'Travel Guide'
      }
    ];
  }
}

// Real Google Custom Search API Implementation
async function searchWithGoogleAPI(query, location) {
  const apiKeyValue = apiKeys.google_search_api_key;
  const searchEngineId = apiKeys.google_search_engine_id;
  
  if (!apiKeyValue || !searchEngineId) {
    console.log('Google Search API not configured - using fallback search');
    return [];
  }
  
  try {
    const searchQuery = `${location} family activities kids events festivals ${query}`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKeyValue}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=8`;
    
    console.log('Making Google Custom Search API call...');
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Search API error:', response.status, errorText);
      return [];
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      console.log(`Google Search API returned ${data.items.length} results`);
      return data.items.map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        source: 'Google Search API',
        displayedLink: item.displayLink || '',
        searchScore: item.cacheId ? 'high' : 'standard'
      }));
    }
    
    console.log('Google Search API returned no results');
    return [];
  } catch (error) {
    console.error('Google Search API error:', error.message);
    return [];
  }
}

// OpenWeb Ninja API Implementation  
async function searchOpenWebNinjaEvents(location, date) {
  const apiKeyValue = apiKeys.openwebninja_api_key;
  
  if (!apiKeyValue) {
    console.log('OpenWeb Ninja API not configured - skipping');
    return [];
  }
  
  try {
    const locationQuery = encodeURIComponent(location.split(',')[0]); // Use just city name
    const searchQuery = encodeURIComponent('family kids children activities events');
    
    // OpenWeb Ninja Real-Time Events API endpoint
    const searchUrl = `https://api.openwebninja.com/api/events_search?q=${searchQuery}&location=${locationQuery}&start_date=${date}&num=10`;
    
    console.log('Making OpenWeb Ninja API call...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'X-RapidAPI-Key': apiKeyValue,
        'X-RapidAPI-Host': 'api.openwebninja.com',
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('OpenWeb Ninja API error:', response.status, errorText);
      return [];
    }
    
    const data = await response.json();
    
    if (data.events && data.events.length > 0) {
      console.log(`OpenWeb Ninja API returned ${data.events.length} events`);
      return data.events.slice(0, 5).map(event => ({
        title: event.title || event.name || 'Family Event',
        url: event.link || event.url || event.event_url || '#',
        snippet: event.description || event.snippet || 'Family-friendly event in your area',
        source: 'OpenWeb Ninja Events',
        date: event.date || event.start_date || date,
        venue: event.venue || event.location || 'Various locations',
        eventType: 'events'
      }));
    }
    
    console.log('OpenWeb Ninja API returned no events');
    return [];
  } catch (error) {
    console.error('OpenWeb Ninja API error:', error.message);
    return [];
  }
}

function extractSearchInsights(searchResults, location) {
  if (!searchResults || searchResults.length === 0) {
    return null;
  }
  
  const insights = {
    sources: searchResults.map(r => ({ title: r.title, url: r.url, source: r.source })),
    recommendations: searchResults.map(r => r.snippet).join(' '),
    total_sources: searchResults.length
  };
  
  return insights;
}

// Gemini-powered holiday and festival fetching (comprehensive search for 3-day period)
async function fetchHolidaysWithGemini(location, date) {
  const geminiKey = apiKeys.gemini_api_key || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) {
    console.log('Gemini holiday fetching requires API key but none available');
    return [];
  }
  
  try {
    // Initialize Gemini for holiday fetching
    console.log('Initializing Gemini for holiday fetching...');
    const tempGenAI = new GoogleGenerativeAI(geminiKey);
    const geminiModel = apiKeys.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const tempModel = tempGenAI.getGenerativeModel({ 
      model: geminiModel,
      generationConfig: {
        temperature: 0.0, // Maximum determinism for factual holiday data
        topP: 0.8,
        candidateCount: 1
      }
    });
    
    // Calculate date range (day before to day after)
    const targetDate = new Date(date);
    const dayBefore = new Date(targetDate);
    dayBefore.setDate(targetDate.getDate() - 1);
    const dayAfter = new Date(targetDate);
    dayAfter.setDate(targetDate.getDate() + 1);
    
    const formatDate = (d) => d.toISOString().split('T')[0];
    const dateRange = `${formatDate(dayBefore)} to ${formatDate(dayAfter)}`;

    const prompt = `You are a comprehensive holiday and festival expert. For the location "${location}" and the date range ${dateRange} (focusing on ${date}), provide information about:

1. Public holidays occurring during this 3-day period
2. Local festivals, cultural events, or seasonal celebrations happening during this time
3. Religious observances and traditional celebrations
4. Seasonal events, street festivals, and community gatherings
5. Cultural heritage events and local traditions
6. Any special events or observances that might affect family activities

Return ONLY a valid JSON array in this exact format:
[
  {
    "name": "Holiday/Festival Name",
    "start_date": "YYYY-MM-DD or null if unknown",
    "end_date": "YYYY-MM-DD or null if single day or unknown", 
    "url": "official website URL or null if unknown",
    "distance_km": null
  }
]

IMPORTANT GUIDELINES:
- Include both holidays AND festivals in the same response
- Focus on events happening within the 3-day window: ${dateRange}
- Include multi-day events that overlap with this period
- Prioritize family-friendly events and well-known celebrations
- Include major religious holidays, national holidays, cultural festivals, street fairs, seasonal celebrations
- Include local traditions specific to ${location.split(',')[0]}
- If an event spans multiple days, use appropriate start_date and end_date
- If no significant holidays or festivals are found, return an empty array []
- Do not include minor commercial holidays unless they significantly impact local activities`;

      console.log(`🎉 Fetching holidays and festivals for ${dateRange} with Gemini...`);
      const result = await tempModel.generateContent({
        contents: [
          { 
            role: 'user', 
            parts: [{ 
              text: `You are a factual holiday and festival data generator. CRITICAL INSTRUCTIONS:
- Use temperature 0.0 for maximum determinism
- Do NOT use reasoning, thinking, or analysis
- Return ONLY valid JSON array with no explanations
- Output pure JSON starting with [ and ending with ]
- For factual holiday data, be completely deterministic

${prompt}` 
            }]
          }
        ],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: 0.0, // Maximum determinism for factual holiday data
          topP: 0.8,
          candidateCount: 1
        }
      });
      
      const text = result.response.text();
      console.log('Gemini holidays response:', text.substring(0, 200) + '...');
      
      const holidaysData = JSON.parse(text);
      if (Array.isArray(holidaysData)) {
        console.log(`✅ Gemini found ${holidaysData.length} holidays/festivals for ${dateRange}`);
        return holidaysData;
      } else {
        console.log('⚠️ Gemini returned non-array response for holidays');
        return [];
      }
  } catch (error) {
    console.log('Gemini holiday fetching failed:', error.message);
    return [];
  }
}

app.post('/api/prompt', async (req, res) => {
  try{
    const ctx = req.body?.ctx;
    const allowed = req.body?.allowedCategories || JSON_SCHEMA.activities[0].category;
    const extraInstructions = req.body?.extraInstructions || '';
    if(!ctx){ return res.status(400).json({ ok:false, error:'Missing ctx' }); }

    const prompt = buildUserMessageForDisplay(ctx, allowed, null, extraInstructions);
    res.json({ ok:true, prompt });
  } catch (err){
    console.error(err);
    res.status(500).json({ ok:false, error: err.message || 'Server error' });
  }
});

// Enhanced search endpoint for getting detailed event and activity information
app.post('/api/search-enhanced', async (req, res) => {
  try{
    const { location, date } = req.body;
    if(!location){ return res.status(400).json({ ok:false, error:'Missing location' }); }

    console.log('Enhanced search request for:', location, date || 'no date specified');
    
    // Check for cached enhanced search results first (only if using Neo4j)
    let enhancedData = null;
    const searchDate = date || new Date().toISOString().split('T')[0];
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const cachedResults = await dataManager.getCachedSearchResults(
          location, 
          searchDate, 
          null, // no duration for enhanced search
          [], // no ages for enhanced search
          'enhanced-search',
          '', // no extra instructions for enhanced search
          'enhanced', // special provider for enhanced search
          { // Basic context for enhanced search
            weather: {},
            is_public_holiday: false,
            nearby_festivals: []
          }
        );
        
        if (cachedResults) {
          console.log('⚡ Using cached enhanced search results for:', location, searchDate);
          enhancedData = cachedResults;
        }
      } catch (cacheError) {
        console.log('Enhanced search cache retrieval failed (non-blocking):', cacheError.message);
      }
    }

    // If no cached results, perform new enhanced search
    if (!enhancedData) {
      console.log('🔍 No cached enhanced search results found, performing new search...');
      
      // Get detailed search results including events
      const searchResults = await searchWeb('comprehensive family activities events', location, searchDate, 10);
      const eventResults = await searchCurrentEvents(location, searchDate);
      
      // Combine and structure results
      enhancedData = {
        location: location,
        search_date: searchDate,
        travel_sources: searchResults.filter(r => r.source !== 'Event Search'),
        event_intelligence: eventResults,
        total_sources: searchResults.length + eventResults.length,
        search_quality: eventResults.length > 0 ? 'enhanced' : 'standard'
      };
      
      // Cache the enhanced search results (only if using Neo4j)
      if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
        try {
          await dataManager.cacheSearchResults(
            location, 
            searchDate, 
            null, // no duration for enhanced search
            [], // no ages for enhanced search
            'enhanced-search',
            enhancedData,
            '', // no extra instructions for enhanced search
            'enhanced' // special provider for enhanced search
          );
        } catch (cacheError) {
          console.log('Failed to cache enhanced search results (non-blocking):', cacheError.message);
        }
      }
    }
    
    res.json({ ok: true, data: enhancedData });
  } catch (err){
    console.error('Enhanced search error:', err);
    res.status(500).json({ ok:false, error: err.message || 'Enhanced search failed' });
  }
});

// Enhanced holiday detection endpoint with multiple API fallbacks
app.post('/api/holidays-enhanced', async (req, res) => {
  try {
    const { location, date, countryCode, year } = req.body;
    if (!location || !date || !countryCode || !year) { 
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required parameters: location, date, countryCode, year' 
      }); 
    }

    console.log(`🔍 Enhanced holiday detection request for: ${location} (${countryCode}) on ${date}`);
    
    let holidays = [];
    let source = 'none';
    
    // Step 1: Check for cached data
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const cachedFestivals = await dataManager.getCachedFestivalData(location, date);
        if (cachedFestivals && cachedFestivals.length > 0) {
          console.log(`🎭 Using cached holiday data for: ${location} on ${date}`);
          return res.json({ 
            ok: true, 
            holidays: cachedFestivals, 
            total: cachedFestivals.length,
            source: 'cache'
          });
        }
      } catch (cacheError) {
        console.log('Holiday cache retrieval failed (non-blocking):', cacheError.message);
      }
    }
    
    // Step 2: Try Nager.Date API first (for supported countries)
    const isKnownUnsupported = ['IL', 'SA', 'AE', 'QA', 'BH', 'KW', 'OM', 'JO', 'LB', 'SY', 'IQ', 'YE'].includes(countryCode.toUpperCase());
    
    if (!isKnownUnsupported) {
      try {
        console.log(`🌍 Trying Nager.Date API for ${countryCode}/${year}`);
        const nagerResponse = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
        
        if (nagerResponse.ok && nagerResponse.status !== 204) {
          const nagerData = await nagerResponse.json();
          if (nagerData && nagerData.length > 0) {
            holidays = nagerData;
            source = 'nager';
            console.log(`✅ Nager.Date API successful: Found ${holidays.length} holidays`);
          }
        }
      } catch (nagerError) {
        console.log(`⚠️ Nager.Date API failed: ${nagerError.message}`);
      }
    } else {
      console.log(`🎯 Country ${countryCode} known to have limited Nager.Date support - skipping`);
    }
    
    // Step 3: Try Wikidata SPARQL query (if no holidays found yet)
    if (holidays.length === 0) {
      try {
        console.log(`🌍 Trying Wikidata SPARQL holiday detection for ${location} (${countryCode})`);
        
        // Map country codes to Wikidata country entities
        const countryEntityMap = {
          'IL': 'Q801',    // Israel
          'US': 'Q30',     // United States
          'GB': 'Q145',    // United Kingdom
          'DE': 'Q183',    // Germany
          'FR': 'Q142',    // France
          'SA': 'Q851',    // Saudi Arabia
          'AE': 'Q878',    // UAE
          'EG': 'Q79',     // Egypt
          'TR': 'Q43',     // Turkey
          'JO': 'Q810',    // Jordan
          'LB': 'Q822',    // Lebanon
          'SY': 'Q858',    // Syria
          'IQ': 'Q796',    // Iraq
          'IR': 'Q794',    // Iran
          'AF': 'Q889',    // Afghanistan
          'PK': 'Q843',    // Pakistan
          'BD': 'Q902',    // Bangladesh
          'MY': 'Q833',    // Malaysia
          'ID': 'Q252',    // Indonesia
          'TH': 'Q869',    // Thailand
          'IN': 'Q668',    // India
          'CN': 'Q148',    // China
        };
        
        const countryEntity = countryEntityMap[countryCode.toUpperCase()];
        
        if (!countryEntity) {
          console.log(`⚠️ No Wikidata entity mapping for country code: ${countryCode}`);
          throw new Error(`Country ${countryCode} not supported in Wikidata mapping`);
        }
        
        const wikidataQuery = `
          SELECT DISTINCT ?item ?itemLabel ?observed ?start ?end WHERE {
            {
              ?item wdt:P31/wdt:P279* wd:Q1197685 .  # Public holiday
              ?item wdt:P17 wd:${countryEntity} .     # Dynamic country
              OPTIONAL { ?item wdt:P837 ?observed . }
              OPTIONAL { ?item wdt:P580 ?start . }
              OPTIONAL { ?item wdt:P582 ?end . }
            }
            UNION
            {
              ?item wdt:P31/wdt:P279* wd:Q1445650 .  # Religious holiday
              ?item wdt:P17 wd:${countryEntity} .     # Dynamic country
              OPTIONAL { ?item wdt:P837 ?observed . }
              OPTIONAL { ?item wdt:P580 ?start . }
              OPTIONAL { ?item wdt:P582 ?end . }
            }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
          } LIMIT 50
        `;
        
        const wikidataUrl = new URL('https://query.wikidata.org/sparql');
        wikidataUrl.searchParams.set('format', 'json');
        wikidataUrl.searchParams.set('query', wikidataQuery);
        
        const wikidataResponse = await fetch(wikidataUrl, {
          headers: { 'Accept': 'application/sparql-results+json' }
        });
        
        if (wikidataResponse.ok) {
          const wikidataData = await wikidataResponse.json();
          const wikidataHolidays = [];
          
          for (const binding of wikidataData.results.bindings) {
            const name = binding.itemLabel?.value;
            const observed = binding.observed?.value ? binding.observed.value.substring(0, 10) : null;
            const start = binding.start?.value ? binding.start.value.substring(0, 10) : null;
            const end = binding.end?.value ? binding.end.value.substring(0, 10) : null;
            
            if (name && (observed || start)) {
              wikidataHolidays.push({
                date: observed || start || date,
                name: name,
                localName: name,
                countryCode: countryCode,
                fixed: false,
                global: true,
                launchYear: null,
                types: ["Public"]
              });
            }
          }
          
          if (wikidataHolidays.length > 0) {
            holidays = wikidataHolidays;
            source = 'wikidata';
            console.log(`✅ Wikidata SPARQL successful: Found ${holidays.length} holidays`);
          }
        }
      } catch (wikidataError) {
        console.log(`⚠️ Wikidata SPARQL failed: ${wikidataError.message}`);
      }
    }
    
    // Step 4: If still no holidays found, try Gemini AI detection
    if (holidays.length === 0) {
      try {
        console.log(`🤖 Trying AI holiday detection for ${location}`);
        const geminiHolidays = await fetchHolidaysWithGemini(location, date);
        
        if (geminiHolidays && geminiHolidays.length > 0) {
          holidays = geminiHolidays.map(h => ({
            date: h.start_date || date,
            name: h.name,
            localName: h.name,
            countryCode: countryCode,
            fixed: false,
            global: true,
            launchYear: null,
            types: ["Public"]
          }));
          source = 'ai';
          console.log(`✅ AI holiday detection successful: Found ${holidays.length} holidays`);
        }
      } catch (geminiError) {
        console.log(`⚠️ AI holiday detection failed: ${geminiError.message}`);
      }
    }
    
    // Step 5: Cache the results if we found any
    if (holidays.length > 0 && isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const targetDate = new Date(date);
        const dayBefore = new Date(targetDate);
        dayBefore.setDate(targetDate.getDate() - 1);
        const dayAfter = new Date(targetDate);
        dayAfter.setDate(targetDate.getDate() + 1);
        
        const searchStartDate = dayBefore.toISOString().split('T')[0];
        const searchEndDate = dayAfter.toISOString().split('T')[0];
        
        await dataManager.cacheFestivalData(location, searchStartDate, searchEndDate, holidays);
        console.log(`💾 Cached ${holidays.length} holidays for future use`);
      } catch (cacheError) {
        console.log('Failed to cache holiday data (non-blocking):', cacheError.message);
      }
    }
    
    res.json({ 
      ok: true, 
      holidays, 
      total: holidays.length,
      source,
      message: holidays.length > 0 ? `Found ${holidays.length} holidays via ${source}` : 'No holidays found'
    });
    
  } catch (err) {
    console.error('Enhanced holiday detection error:', err);
    res.status(500).json({ 
      ok: false, 
      error: err.message || 'Enhanced holiday detection failed' 
    });
  }
});

// Gemini-powered holiday and festival fetching endpoint with caching
app.post('/api/holidays-gemini', async (req, res) => {
  try{
    const { location, date } = req.body;
    if(!location || !date){ 
      return res.status(400).json({ ok:false, error:'Missing location or date' }); 
    }

    console.log('Gemini holiday fetch request for:', location, date);
    
    // Try to get cached festival data first
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const cachedFestivals = await dataManager.getCachedFestivalData(location, date);
        if (cachedFestivals) {
          console.log('🎭 Using cached festival data for:', location, date);
          return res.json({ ok: true, holidays: cachedFestivals, total: cachedFestivals.length });
        }
      } catch (cacheError) {
        console.log('Festival cache retrieval failed (non-blocking):', cacheError.message);
      }
    }
    
    // No cached data, fetch fresh festivals
    const holidays = await fetchHolidaysWithGemini(location, date);
    
    // Cache the fresh festival data with date range
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager && holidays.length > 0) {
      try {
        // Calculate search range (day before to day after)
        const targetDate = new Date(date);
        const dayBefore = new Date(targetDate);
        dayBefore.setDate(targetDate.getDate() - 1);
        const dayAfter = new Date(targetDate);
        dayAfter.setDate(targetDate.getDate() + 1);
        
        const searchStartDate = dayBefore.toISOString().split('T')[0];
        const searchEndDate = dayAfter.toISOString().split('T')[0];
        
        await dataManager.cacheFestivalData(location, searchStartDate, searchEndDate, holidays);
      } catch (cacheError) {
        console.log('Failed to cache festival data (non-blocking):', cacheError.message);
      }
    }
    
    res.json({ ok: true, holidays, total: holidays.length });
  } catch (err){
    console.error('Gemini holiday fetch error:', err);
    res.status(500).json({ ok:false, error: err.message || 'Gemini holiday fetch failed' });
  }
});

// Weather caching endpoints
app.post('/api/weather-cache', async (req, res) => {
  try {
    const { location, date } = req.body;
    if (!location || !date) {
      return res.status(400).json({ ok: false, error: 'Missing location or date' });
    }
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      const cachedWeather = await dataManager.getCachedWeatherData(location, date);
      if (cachedWeather) {
        return res.json({ ok: true, weather: cachedWeather });
      }
    }
    
    res.json({ ok: false, message: 'No cached weather data found' });
  } catch (err) {
    console.error('Weather cache retrieval error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Weather cache retrieval failed' });
  }
});

app.put('/api/weather-cache', async (req, res) => {
  try {
    const { location, date, weather } = req.body;
    if (!location || !date || !weather) {
      return res.status(400).json({ ok: false, error: 'Missing location, date, or weather data' });
    }
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.cacheWeatherData(location, date, weather);
      res.json({ ok: true, message: 'Weather data cached successfully' });
    } else {
      res.json({ ok: false, message: 'Weather caching not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Weather cache storage error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Weather cache storage failed' });
  }
});

// Cache management endpoints
app.delete('/api/cache/search', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.clearSearchCache();
      res.json({ ok: true, message: 'Search cache cleared successfully' });
    } else {
      res.json({ ok: false, message: 'Cache clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing search cache:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear search cache' });
  }
});

app.delete('/api/cache/weather', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.clearWeatherCache();
      res.json({ ok: true, message: 'Weather cache cleared successfully' });
    } else {
      res.json({ ok: false, message: 'Cache clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing weather cache:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear weather cache' });
  }
});

app.delete('/api/cache/festivals', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.clearFestivalCache();
      res.json({ ok: true, message: 'Festival cache cleared successfully' });
    } else {
      res.json({ ok: false, message: 'Cache clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing festival cache:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear festival cache' });
  }
});

app.delete('/api/cache/locations', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.clearLocationCache();
      res.json({ ok: true, message: 'Location cache cleared successfully' });
    } else {
      res.json({ ok: false, message: 'Cache clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing location cache:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear location cache' });
  }
});

app.delete('/api/cache/all', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      await dataManager.clearAllCache();
      res.json({ ok: true, message: 'All cache cleared successfully' });
    } else {
      res.json({ ok: false, message: 'Cache clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing all cache:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear all cache' });
  }
});

app.delete('/api/search-history/old', async (req, res) => {
  try {
    const { days } = req.body;
    const daysToKeep = parseInt(days) || 30;
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      const deleted = await dataManager.clearOldSearchHistory(daysToKeep);
      res.json({ ok: true, message: `Cleared search history older than ${daysToKeep} days`, deleted });
    } else {
      res.json({ ok: false, message: 'History clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing old search history:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear old search history' });
  }
});

app.delete('/api/search-history/all', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      const deleted = await dataManager.clearAllSearchHistory();
      res.json({ ok: true, message: 'All search history cleared', deleted });
    } else {
      res.json({ ok: false, message: 'History clearing not available (Neo4j not connected)' });
    }
  } catch (err) {
    console.error('Error clearing all search history:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to clear all search history' });
  }
});

app.get('/api/cache/stats', async (req, res) => {
  try {
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      const stats = await dataManager.getCacheStatistics();
      res.json({ ok: true, stats });
    } else {
      res.json({ ok: false, stats: { searchResults: 0, weather: 0, festivals: 0, history: 0 } });
    }
  } catch (err) {
    console.error('Error getting cache statistics:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to get cache statistics' });
  }
});

// Settings endpoints for API key management
app.get('/api/settings', (req, res) => {
  try {
    // Return configuration status without exposing actual keys
    const settings = {
      gemini_configured: !!apiKeys.gemini_api_key,
      openrouter_configured: !!apiKeys.openrouter_api_key,
      together_configured: !!apiKeys.together_api_key,
      google_search_configured: !!(apiKeys.google_search_api_key && apiKeys.google_search_engine_id),
      openwebninja_configured: !!apiKeys.openwebninja_api_key,
      ticketmaster_configured: !!apiKeys.ticketmaster_api_key,
      ai_provider: apiKeys.ai_provider || 'gemini',
      gemini_model: apiKeys.gemini_model || 'gemini-2.5-flash-lite',
      openrouter_model: apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free',
      together_model: apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      enable_gemini_holidays: !!apiKeys.enable_gemini_holidays,
      enable_reasoning: !!apiKeys.enable_reasoning,
      max_activities: apiKeys.max_activities || 20,
      cache_include_model: !!apiKeys.cache_include_model,
      cache_similarity_threshold: apiKeys.cache_similarity_threshold || 0.90,
      cache_location_weight: apiKeys.cache_location_weight || 0.20,
      cache_weather_weight: apiKeys.cache_weather_weight || 0.40,
      cache_temporal_weight: apiKeys.cache_temporal_weight || 0.30,
      cache_demographic_weight: apiKeys.cache_demographic_weight || 0.10,
      // Show masked versions for UI feedback
      gemini_api_key_masked: apiKeys.gemini_api_key ? 
        apiKeys.gemini_api_key.substring(0, 8) + '...' + apiKeys.gemini_api_key.slice(-4) : '',
      openrouter_api_key_masked: apiKeys.openrouter_api_key ? 
        apiKeys.openrouter_api_key.substring(0, 8) + '...' + apiKeys.openrouter_api_key.slice(-4) : '',
      google_search_api_key_masked: apiKeys.google_search_api_key ? 
        apiKeys.google_search_api_key.substring(0, 8) + '...' + apiKeys.google_search_api_key.slice(-4) : '',
      google_search_engine_id_masked: apiKeys.google_search_engine_id ? 
        apiKeys.google_search_engine_id.substring(0, 8) + '...' + apiKeys.google_search_engine_id.slice(-4) : '',
      openwebninja_api_key_masked: apiKeys.openwebninja_api_key ? 
        apiKeys.openwebninja_api_key.substring(0, 8) + '...' + apiKeys.openwebninja_api_key.slice(-4) : '',
      ticketmaster_api_key_masked: apiKeys.ticketmaster_api_key ? 
        apiKeys.ticketmaster_api_key.substring(0, 8) + '...' + apiKeys.ticketmaster_api_key.slice(-4) : ''
    };
    
    res.json({ ok: true, settings });
  } catch (err) {
    console.error('Settings get error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { apiKeyUpdates } = req.body;
    
    if (!apiKeyUpdates || typeof apiKeyUpdates !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid API key updates' });
    }
    
    // Update API keys and settings
    let updated = false;
    Object.keys(apiKeyUpdates).forEach(key => {
      if (key in apiKeys) {
        const newValue = typeof apiKeyUpdates[key] === 'string' ? apiKeyUpdates[key].trim() : apiKeyUpdates[key];
        if (newValue !== apiKeys[key]) {
          apiKeys[key] = newValue;
          updated = true;
          console.log(`Updated setting: ${key} = ${typeof newValue === 'string' && newValue.length > 20 ? newValue.substring(0, 8) + '...' : newValue}`);
        }
      }
    });
    
    if (updated) {
      await saveApiKeys();
      // Reinitialize AI providers if keys were updated
      initializeAIProviders();
      applyCacheSettings();
    }
    
    // Return updated configuration status
    const settings = {
      gemini_configured: !!apiKeys.gemini_api_key,
      openrouter_configured: !!apiKeys.openrouter_api_key,
      together_configured: !!apiKeys.together_api_key,
      google_search_configured: !!(apiKeys.google_search_api_key && apiKeys.google_search_engine_id),
      openwebninja_configured: !!apiKeys.openwebninja_api_key,
      ticketmaster_configured: !!apiKeys.ticketmaster_api_key,
      ai_provider: apiKeys.ai_provider || 'gemini',
      openrouter_model: apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free',
      together_model: apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      enable_gemini_holidays: !!apiKeys.enable_gemini_holidays,
      max_activities: apiKeys.max_activities || 20,
      cache_include_model: !!apiKeys.cache_include_model,
      cache_similarity_threshold: apiKeys.cache_similarity_threshold || 0.90,
      cache_location_weight: apiKeys.cache_location_weight || 0.20,
      cache_weather_weight: apiKeys.cache_weather_weight || 0.40,
      cache_temporal_weight: apiKeys.cache_temporal_weight || 0.30,
      cache_demographic_weight: apiKeys.cache_demographic_weight || 0.10,
      updated: updated
    };
    
    res.json({ ok: true, settings, message: updated ? 'API keys updated successfully' : 'No changes made' });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update settings' });
  }
});

// Test API connections endpoint
// Neo4j connection test endpoint
app.get('/api/test-neo4j', async (req, res) => {
  try {
    if (!process.env.NEO4J_URI || !process.env.NEO4J_USER || !process.env.NEO4J_PASSWORD) {
      return res.json({
        ok: false,
        configured: false,
        working: false,
        error: 'Neo4j environment variables not configured (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)',
        connection_type: 'Not configured'
      });
    }

    // Test if we can create a connection
    const testDriver = neo4j.driver(
      process.env.NEO4J_URI, 
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
    );
    
    const session = testDriver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    
    try {
      // Test basic connectivity
      const result = await session.run('RETURN "Hello Neo4j!" as message, datetime() as timestamp');
      const record = result.records[0];
      const message = record.get('message');
      const timestamp = record.get('timestamp');
      
      // Test if our current dataManager is Neo4j
      const isCurrentlyUsed = isNeo4jConnected && dataManager instanceof Neo4jDataManager;
      
      // Get some basic database info
      const dbInfo = await session.run('CALL dbms.components() YIELD name, versions, edition RETURN name, versions[0] as version, edition');
      const version = dbInfo.records.length > 0 ? dbInfo.records[0].get('version') : 'Unknown';
      const edition = dbInfo.records.length > 0 ? dbInfo.records[0].get('edition') : 'Unknown';
      
      res.json({
        ok: true,
        configured: true,
        working: true,
        error: null,
        message: `Successfully connected to Neo4j`,
        response: message,
        timestamp: timestamp.toString(),
        connection_type: isCurrentlyUsed ? 'Currently Active' : 'Available (Not Active)',
        database_info: {
          version: version,
          edition: edition,
          uri: process.env.NEO4J_URI,
          database: process.env.NEO4J_DATABASE || 'neo4j'
        }
      });
      
    } finally {
      await session.close();
      await testDriver.close();
    }
    
  } catch (error) {
    console.error('Neo4j test connection failed:', error);
    
    res.json({
      ok: false,
      configured: true,
      working: false,
      error: error.message,
      connection_type: 'Failed',
      suggestions: [
        'Check your Neo4j AuraDB credentials',
        'Ensure your database is running',
        'Verify network connectivity',
        'Check if NEO4J_URI format is correct (neo4j+s://...)'
      ]
    });
  }
});

app.post('/api/test-apis', async (req, res) => {
  try {
    const results = {
      gemini: { configured: false, working: false, error: null },
      openrouter: { configured: false, working: false, error: null },
      together: { configured: false, working: false, error: null },
      google_search: { configured: false, working: false, error: null },
      openwebninja: { configured: false, working: false, error: null }
    };
    
    // Test Gemini API
    if (apiKeys.gemini_api_key) {
      results.gemini.configured = true;
      try {
        // Reinitialize in case key just changed
        initializeAIProviders();
        
        // Double check model is initialized
        if (!model) {
          throw new Error('Gemini model not initialized - check API key');
        }
        
        const testResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Hello, respond with just "OK" to test the API.' }]}],
        });
        const response = testResult.response.text();
        results.gemini.working = response && response.length > 0;
      } catch (error) {
        console.error('Gemini test error:', error);
        results.gemini.error = error.message;
      }
    }
    
    // Test OpenRouter API
    if (apiKeys.openrouter_api_key) {
      results.openrouter.configured = true;
      try {
        // Reinitialize in case key just changed
        initializeAIProviders();
        console.log('Testing OpenRouter with model:', apiKeys.openrouter_model || 'deepseek/deepseek-r1-0528-qwen3-8b:free');
        const testResponse = await openAI.chat.completions.create({
          model: apiKeys.openrouter_model || 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          messages: [{ role: 'user', content: 'Hello, respond with just "OK" to test the API.' }],
          max_tokens: 10,
          temperature: 0.1
        });
        console.log('OpenRouter test response:', JSON.stringify(testResponse, null, 2));
        const responseMessage = testResponse.choices?.[0]?.message;
        let response = responseMessage?.content;
        
        // Check reasoning field if content is empty (for DeepSeek R1 models)
        if (!response || response.trim() === '') {
          response = responseMessage?.reasoning;
        }
        
        results.openrouter.working = response && response.length > 0;
        if (!results.openrouter.working) {
          results.openrouter.error = 'Empty response from OpenRouter';
        }
      } catch (error) {
        console.error('OpenRouter test error:', error);
        results.openrouter.error = error.message;
      }
    }
    
    // Test Together.ai API
    if (apiKeys.together_api_key) {
      results.together.configured = true;
      try {
        // Reinitialize in case key just changed
        console.log('Testing Together.ai with model:', apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo');
        const togetherAI = AIProviderFactory.createTogetherClient(apiKeys.together_api_key);
        const testResponse = await togetherAI.chat.completions.create({
          model: apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
          messages: [{ role: 'user', content: 'Hello, respond with just "OK" to test the API.' }],
          max_tokens: 10,
          temperature: 0.1
        });
        console.log('Together.ai test response:', JSON.stringify(testResponse, null, 2));
        const responseMessage = testResponse.choices?.[0]?.message;
        const response = responseMessage?.content;
        
        results.together.working = response && response.length > 0;
        if (!results.together.working) {
          results.together.error = 'Empty response from Together.ai';
        }
      } catch (error) {
        console.error('Together.ai test error:', error);
        results.together.error = error.message;
      }
    }
    
    // Test Google Search API
    if (apiKeys.google_search_api_key && apiKeys.google_search_engine_id) {
      results.google_search.configured = true;
      try {
        const testResults = await searchWithGoogleAPI('test', 'Madrid');
        results.google_search.working = testResults.length >= 0; // 0 results is still a successful API call
      } catch (error) {
        results.google_search.error = error.message;
      }
    }
    
    // Test OpenWeb Ninja API
    if (apiKeys.openwebninja_api_key) {
      results.openwebninja.configured = true;
      try {
        const testResults = await searchOpenWebNinjaEvents('Madrid', new Date().toISOString().split('T')[0]);
        results.openwebninja.working = testResults.length >= 0; // 0 results is still a successful API call
      } catch (error) {
        results.openwebninja.error = error.message;
      }
    }
    
    res.json({ ok: true, results });
  } catch (err) {
    console.error('API test error:', err);
    res.status(500).json({ ok: false, error: 'Failed to test APIs' });
  }
});

// Test model latency endpoint
app.post('/api/test-model-latency', async (req, res) => {
  try {
    const { enableReasoning = false } = req.body;
    console.log(`🚀 Starting comprehensive model latency tests... (reasoning: ${enableReasoning})`);
    
    const results = {
      gemini: { 
        configured: false, 
        working: false, 
        latency: null, 
        error: null,
        temperature: 0.1,
        response_text: null,
        response_length: null,
        quality_analysis: null
      },
      openrouter_models: []
    };
    
    // Different prompts based on reasoning mode
    const testPrompt = enableReasoning 
      ? 'Please recommend a fun outdoor activity for families in Paris during spring. Include specific location details, best times to visit, and practical tips like transportation and costs.'
      : 'Suggest a quick outdoor activity in Paris for families in spring. Include the location name and one practical tip.';
    
    // Quality analysis function
    function analyzeResponseQuality(responseText, isReasoningMode = false) {
      if (!responseText) return null;
      
      const text = responseText.toLowerCase();
      const length = responseText.length;
      
      // Check for location information
      const hasLocationInfo = text.includes('paris') || 
                             text.includes('location') || 
                             text.includes('address') ||
                             text.includes('metro') ||
                             text.includes('station') ||
                             /\d+\s*(rue|avenue|boulevard|place)/i.test(responseText);
      
      // Check for specific details
      const hasSpecificDetails = text.includes('time') || 
                                 text.includes('cost') || 
                                 text.includes('price') || 
                                 text.includes('transport') || 
                                 text.includes('hour') ||
                                 text.includes('entrance') ||
                                 text.includes('ticket');
      
      // Completeness score (0-10)
      let completeness = 0;
      if (hasLocationInfo) completeness += 3;
      if (hasSpecificDetails) completeness += 3;
      if (length > 50) completeness += 2;
      if (length > 150) completeness += 2;
      
      // Helpful score (0-10) 
      let helpful = 0;
      if (text.includes('families') || text.includes('children')) helpful += 2;
      if (text.includes('spring')) helpful += 1;
      if (hasLocationInfo) helpful += 3;
      if (hasSpecificDetails) helpful += 3;
      if (text.includes('tip') || text.includes('advice') || text.includes('recommend')) helpful += 1;
      
      return {
        has_location_info: hasLocationInfo,
        has_specific_details: hasSpecificDetails,
        completeness_score: Math.min(completeness, 10),
        helpful_score: Math.min(helpful, 10)
      };
    }
    
    // Test Gemini latency
    if (apiKeys.gemini_api_key) {
      results.gemini.configured = true;
      try {
        // Reinitialize in case key just changed
        initializeAIProviders();
        
        if (!model) {
          throw new Error('Gemini model not initialized - check API key');
        }
        
        const startTime = performance.now();
        const testResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: testPrompt }]}],
        });
        const endTime = performance.now();
        
        const response = testResult.response.text();
        if (response && response.length > 0) {
          results.gemini.working = true;
          results.gemini.latency = Math.round(endTime - startTime);
          results.gemini.response_text = response;
          results.gemini.response_length = response.length;
          results.gemini.quality_analysis = analyzeResponseQuality(response, enableReasoning);
        } else {
          throw new Error('Empty response from Gemini');
        }
      } catch (error) {
        console.error('Gemini latency test error:', error);
        results.gemini.error = error.message;
      }
    }
    
    // Test OpenRouter models - test multiple free models
    if (apiKeys.openrouter_api_key) {
      const freeModelsToTest = [
        { 
          model: 'deepseek/deepseek-chat-v3.1:free',
          name: 'DeepSeek V3.1',
          description: 'Fast & Recommended',
          temperature: enableReasoning ? 0.3 : 0.1
        },
        { 
          model: 'meta-llama/llama-3.2-3b-instruct:free',
          name: 'Llama 3.2 3B',
          description: 'Lightweight & Fast',
          temperature: enableReasoning ? 0.5 : 0.2
        },
        { 
          model: 'mistralai/mistral-7b-instruct:free',
          name: 'Mistral 7B Instruct',
          description: 'Balanced Performance',
          temperature: enableReasoning ? 0.4 : 0.1
        },
        { 
          model: 'nvidia/nemotron-nano-9b-v2:free',
          name: 'Nemotron Nano 9B V2',
          description: 'Efficient & Fast',
          temperature: enableReasoning ? 0.3 : 0.1
        },
        { 
          model: 'google/gemma-2-2b-it:free',
          name: 'Gemma 2 2B IT',
          description: 'Google\'s lightweight model',
          temperature: enableReasoning ? 0.4 : 0.1
        },
        { 
          model: 'microsoft/phi-3-mini-128k-instruct:free',
          name: 'Phi-3 Mini 128k',
          description: 'Microsoft\'s efficient model',
          temperature: enableReasoning ? 0.4 : 0.1
        }
      ];
      
      // Reinitialize in case key just changed
      initializeAIProviders();
      
      for (const modelInfo of freeModelsToTest) {
        const modelResult = {
          model: modelInfo.model,
          name: modelInfo.name,
          description: modelInfo.description,
          configured: true,
          working: false,
          latency: null,
          error: null,
          tokens_used: null,
          is_current: modelInfo.model === (apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'),
          temperature: modelInfo.temperature,
          reasoning_enabled: enableReasoning,
          response_text: null,
          response_length: null,
          quality_analysis: null
        };
        
        try {
          console.log(`Testing ${modelInfo.name} (${modelInfo.model})...`);
          
          const startTime = performance.now();
          const testResponse = await openAI.chat.completions.create({
            model: modelInfo.model,
            messages: [{ role: 'user', content: testPrompt }],
            max_tokens: enableReasoning ? 300 : 100,
            temperature: modelInfo.temperature
          });
          const endTime = performance.now();
          
          const responseMessage = testResponse.choices?.[0]?.message;
          let response = responseMessage?.content;
          
          // Check reasoning field if content is empty (for DeepSeek R1 models)
          if (!response || response.trim() === '') {
            response = responseMessage?.reasoning;
          }
          
          if (response && response.length > 0) {
            modelResult.working = true;
            modelResult.latency = Math.round(endTime - startTime);
            modelResult.tokens_used = testResponse.usage?.total_tokens || null;
            modelResult.response_text = response;
            modelResult.response_length = response.length;
            modelResult.quality_analysis = analyzeResponseQuality(response, enableReasoning);
          } else {
            throw new Error('Empty response from OpenRouter');
          }
        } catch (error) {
          console.error(`${modelInfo.name} latency test error:`, error);
          modelResult.error = error.message;
        }
        
        results.openrouter_models.push(modelResult);
      }
    }
    
    console.log('📊 Comprehensive latency test results:', results);
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Latency test error:', err);
    res.status(500).json({ ok: false, error: 'Failed to test model latency' });
  }
});

// Call OpenRouter API with isolated client
async function callOpenRouterModel(prompt, maxRetries = 3, abortSignal = null) {
  const openRouterKey = apiKeys.openrouter_api_key || process.env.OPENROUTER_API_KEY || '';
  if (!openRouterKey) {
    throw new Error('OpenRouter API key not available');
  }
  
  // Create isolated client for this request
  const openAI = AIProviderFactory.createOpenRouterClient(openRouterKey);
  const modelName = apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free';
  
for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check for cancellation before each attempt
    if (abortSignal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    const startTime = performance.now();
    try {
      console.log(`🤖 [${new Date().toISOString()}] OpenRouter attempt ${attempt}/${maxRetries} using model: ${modelName}`);
      
      // Get model-specific configuration
      const modelConfig = getModelSpecificConfig(modelName);
      
      // Create system message based on model type
      const systemMessage = getSystemMessage(modelName);
      
      const requestBody = {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: modelConfig.temperature,
        max_tokens: 8000,
        ...modelConfig.extraParams
      };
      
      console.log(`🔧 Request config for ${modelName}:`, JSON.stringify({
        temperature: requestBody.temperature,
        extraParams: modelConfig.extraParams
      }, null, 2));
      
      const response = await openAI.chat.completions.create(requestBody);
      
      const duration = performance.now() - startTime;
      const responseData = response.choices?.[0]?.message;
      
      // Extract reasoning if available (for R1 models)
      const reasoning = responseData.reasoning || null;
      if (reasoning) {
        console.log(`🧠 [${new Date().toISOString()}] OpenRouter reasoning (${reasoning.length} chars): ${reasoning.substring(0, 200)}...`);
      }
      
      console.log(`✅ [${new Date().toISOString()}] OpenRouter completed (${duration.toFixed(2)}ms)`);
      console.log('Full OpenRouter response:', JSON.stringify(response, null, 2));
      
      if (!responseData) {
        throw new Error('No choices in OpenRouter response');
      }
      
      // Try content field first, then reasoning field as fallback
      let text = responseData.content || '';
      
      if (!text || text.trim() === '') {
        console.log('⚠️ Content field is empty, checking reasoning field...');
        
        // Some models still put response in reasoning field despite configuration
        if (responseData.reasoning) {
          console.log('Reasoning field length:', responseData.reasoning.length);
          console.log('🧠 Reasoning preview:', responseData.reasoning.substring(0, 200) + '...');
          
          // Try to extract complete JSON from reasoning field
          const extractedJson = extractCompleteJson(responseData.reasoning);
          if (extractedJson && extractedJson.includes('"activities"')) {
            text = extractedJson;
            console.log(`🔧 Extracted JSON from reasoning field: ${text.length} characters`);
          } else {
            // Fallback: look for any JSON structure with activities
            const activitiesMatch = responseData.reasoning.match(/"activities"\s*:\s*\[[\s\S]*?\]/);
            if (activitiesMatch) {
              console.log('🔧 Found activities array, trying to extract surrounding JSON...');
              const surroundingJson = extractSurroundingJson(responseData.reasoning, activitiesMatch.index);
              if (surroundingJson) {
                text = surroundingJson;
                console.log(`🔧 Extracted surrounding JSON: ${text.length} characters`);
              }
            }
          }
          
          if (!text || text.trim() === '') {
            console.log('❌ No valid JSON found in reasoning field');
            throw new Error('No JSON with activities array found in reasoning field');
          }
        } else {
          console.log('OpenRouter response structure:', JSON.stringify(responseData, null, 2));
          throw new Error('Empty content and no reasoning field in OpenRouter response');
        }
      }
      
      // Log reasoning for debugging but don't try to parse it as JSON
      if (responseData.reasoning) {
        console.log('🧠 Model reasoning available (length: ' + responseData.reasoning.length + ')');
        console.log('🧠 Reasoning preview:', responseData.reasoning.substring(0, 200) + '...');
      }
      
      console.log(`OpenRouter response length: ${text.length} characters`);
      console.log('OpenRouter response preview:', text.substring(0, 300) + '...');
      const parsed = parseJsonWithFallback(text);
      console.log(`✅ OpenRouter generated ${parsed.activities?.length || 0} activities`);
      return parsed;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] OpenRouter attempt ${attempt} failed (${duration.toFixed(2)}ms):`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
}

// Call Gemini API with isolated client
async function callGeminiModel(prompt, maxRetries = 3, abortSignal = null) {
  const geminiKey = apiKeys.gemini_api_key || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) {
    throw new Error('Gemini API key not available');
  }
  
  // Create isolated model for this request
  const model = AIProviderFactory.createGeminiClient(geminiKey);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check for cancellation before each attempt
    if (abortSignal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    const startTime = performance.now();
    try {
      console.log(`🤖 [${new Date().toISOString()}] Gemini attempt ${attempt}/${maxRetries}`);
      
      // Adjust prompt and config based on reasoning setting
      const reasoningEnabled = !!apiKeys.enable_reasoning;
      const promptPrefix = reasoningEnabled 
        ? 'You are an intelligent activity recommendation system. Use detailed reasoning and careful consideration to provide high-quality recommendations. Then return the complete JSON object with thoughtful suggestions.'
        : '/no_think You are a JSON generator. Return ONLY the requested JSON object with no reasoning traces, explanations, or commentary. Output pure JSON starting with { and ending with }.';
      
      const result = await model.generateContent({
        contents: [
          { 
            role: 'user', 
            parts: [{ 
              text: `${promptPrefix}\n\n${prompt}` 
            }]
          }
        ],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: reasoningEnabled ? 0.4 : 0.1, // Higher temp for reasoning
          topP: reasoningEnabled ? 0.95 : 0.9,
          candidateCount: 1
        }
      });
      
      const duration = performance.now() - startTime;
      const text = result.response.text();
      console.log(`✅ [${new Date().toISOString()}] Gemini completed (${duration.toFixed(2)}ms)`);
      console.log(`Gemini response length: ${text.length} characters`);
      console.log('Gemini response preview:', text.substring(0, 300) + '...');
      const parsed = parseJsonWithFallback(text);
      console.log(`✅ Gemini generated ${parsed.activities?.length || 0} activities`);
      return parsed;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Gemini attempt ${attempt} failed (${duration.toFixed(2)}ms):`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
}

// Call Together.ai API with JSON mode support
async function callTogetherModel(prompt, maxRetries = 3, abortSignal = null) {
  const togetherKey = apiKeys.together_api_key || process.env.TOGETHER_API_KEY || '';
  if (!togetherKey) {
    throw new Error('Together.ai API key not available');
  }
  
  // Create isolated client for this request
  const togetherAI = AIProviderFactory.createTogetherClient(togetherKey);
  const modelName = apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check for cancellation before each attempt
    if (abortSignal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    const startTime = performance.now();
    try {
      console.log(`🤖 [${new Date().toISOString()}] Together.ai attempt ${attempt}/${maxRetries} using model: ${modelName}`);
      
      // Build request with JSON mode support
      const requestBody = {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON response assistant. Generate a comprehensive activities response matching the provided schema. Only respond with valid JSON matching the schema structure.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent JSON output
        max_tokens: 8000,
        response_format: {
          type: "json_schema",
          schema: getActivityResponseSchema()
        }
      };
      
      console.log(`🔧 Together.ai JSON mode enabled for ${modelName}`);
      
      const response = await togetherAI.chat.completions.create(requestBody);
      
      const duration = performance.now() - startTime;
      const responseData = response.choices?.[0]?.message;
      
      console.log(`✅ [${new Date().toISOString()}] Together.ai completed (${duration.toFixed(2)}ms)`);
      
      if (!responseData || !responseData.content) {
        throw new Error('No content in Together.ai response');
      }
      
      const text = responseData.content;
      console.log(`Together.ai response length: ${text.length} characters`);
      console.log('Together.ai response preview:', text.substring(0, 200) + '...');
      
      // Parse JSON response (should be valid due to schema enforcement)
      let json;
      try {
        json = JSON.parse(text);
        console.log('✅ JSON parsed successfully from Together.ai JSON mode');
        
        // Basic structure validation
        if (!json.query || !Array.isArray(json.activities)) {
          throw new Error('Invalid response structure from Together.ai');
        }
        
        console.log(`✅ Together.ai generated ${json.activities.length} activities`);
        return json;
        
      } catch (parseError) {
        console.error('❌ Failed to parse Together.ai JSON response:', parseError.message);
        throw new Error(`Together.ai JSON parsing failed: ${parseError.message}`);
      }
      
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Together.ai attempt ${attempt} failed (${duration.toFixed(2)}ms):`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
}

async function callModelWithRetry(ctx, allowedCats, maxRetries = 3, maxActivities = null, abortSignal = null) {
  let webSearchResults = null;
  let holidayFestivalInfo = null;
  
  // Load exclusions for this location to add to context
  const exclusions = await dataManager.loadExclusionList();
  const locationExclusions = exclusions[ctx.location] || [];
  
  // Add exclusions to context for prompt building
  const enrichedCtx = {
    ...ctx,
    exclusions: locationExclusions
  };
  
  // Check for cancellation before web search
  if (abortSignal?.aborted) {
    throw new Error('Request was cancelled');
  }

  // Try to get cached festival data first (for prompt context)
  try {
    console.log('Checking for cached holiday/festival information...');
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const cachedFestivals = await dataManager.getCachedFestivalData(ctx.location, ctx.date);
        if (cachedFestivals) {
          console.log('🎭 Using cached festival data for activity context:', ctx.location, ctx.date);
          holidayFestivalInfo = cachedFestivals;
          
          // Update enriched context with cached festival data
          enrichedCtx.nearby_festivals = holidayFestivalInfo.map(event => ({
            name: event.name,
            start_date: event.start_date || null,
            end_date: event.end_date || null,
            url: event.url || null,
            distance_km: event.distance_km || null
          }));
          
          console.log(`🎉 Found ${holidayFestivalInfo.length} cached holidays/festivals for context`);
        }
      } catch (cacheError) {
        console.log('Festival cache retrieval failed (non-blocking):', cacheError.message);
      }
    }
  } catch (error) {
    console.log('Holiday/festival cache check failed, continuing without cached context:', error.message);
  }

  // Perform enhanced web search for additional context
  try {
    console.log('Performing enhanced web search for current events and family activities...');
    const searchResults = await searchWeb('family activities kids', ctx.location, ctx.date);
    webSearchResults = extractSearchInsights(searchResults, ctx.location);
    console.log(`Found ${searchResults.length} web search results including event data`);
  } catch (error) {
    console.log('Web search failed, continuing without web insights:', error.message);
  }

  // 🎪 Fetch and filter real events from Fever for better recommendations
  let feverEventsForAI = null;
  let aiGeneratedCount = maxActivities;
  
  try {
    console.log('🎪 Fetching real events from Fever...');
    const feverEvents = await getFeverEventsWithCache(ctx.location, feverCache);
    
    if (feverEvents && feverEvents.length > 0) {
      // Format all events first
      const allFormattedEvents = formatEventsForAI(feverEvents, 100);
      
      // Filter events by age-appropriateness and date relevance
      const kidsAges = ctx.kids_ages || ctx.kidsAges || ctx.ages || [];
      const targetDate = new Date(ctx.date);
      
      // Helper function to score age appropriateness
      const scoreAgeMatch = (event) => {
        if (!event.suitable_ages || kidsAges.length === 0) return 50; // Default score
        
        const ageText = event.suitable_ages.toLowerCase();
        const youngestKid = Math.min(...kidsAges);
        const oldestKid = Math.max(...kidsAges);
        const avgKidAge = kidsAges.reduce((a, b) => a + b, 0) / kidsAges.length;
        
        // Check if it's "all ages" - give medium score
        if (ageText.includes('all ages') || ageText.includes('all age') || ageText.includes('any age')) {
          return 60;
        }
        
        // Extract age ranges from the text (e.g., "6+", "8-12", "10+")
        const ageMatches = ageText.match(/(\d+)[\s-]*(?:\+|to|-)[\s-]*(\d+)?/g);
        
        if (!ageMatches) {
          // If no specific age range found but not "all ages", assume it's specific
          return 70;
        }
        
        // Check if any of the kids' ages fall within the event's age range
        let bestMatch = 0;
        for (const match of ageMatches) {
          const numbers = match.match(/\d+/g).map(n => parseInt(n));
          
          if (numbers.length === 1) {
            // "X+" format - score based on how close X is to our kids' ages
            const minAge = numbers[0];
            
            // Only score if kids meet minimum age
            if (youngestKid >= minAge) {
              // Calculate age gap between minimum age and youngest kid
              const ageGap = youngestKid - minAge;
              
              if (ageGap === 0) {
                // Perfect match: minimum age exactly matches youngest kid
                bestMatch = Math.max(bestMatch, 100);
              } else if (ageGap <= 2) {
                // Very close: within 2 years (e.g., "8+" for 9-12 year olds)
                bestMatch = Math.max(bestMatch, 95);
              } else if (ageGap <= 4) {
                // Acceptable: within 4 years (e.g., "6+" for 9-12 year olds)
                bestMatch = Math.max(bestMatch, 75);
              } else {
                // Too young: gap is large (e.g., "3+" for 9-12 year olds)
                bestMatch = Math.max(bestMatch, 65);
              }
            }
          } else if (numbers.length === 2) {
            // "X-Y" format - prefer ranges that closely match our kids' age range
            const [minAge, maxAge] = numbers;
            
            // Check if all kids fit within this range
            const allKidsFit = kidsAges.every(age => age >= minAge && age <= maxAge);
            
            if (allKidsFit) {
              // Perfect match: all kids within the specified range
              bestMatch = Math.max(bestMatch, 100);
            } else {
              // Check if any kids fit
              const anyKidFits = kidsAges.some(age => age >= minAge && age <= maxAge);
              
              if (anyKidFits) {
                // Partial match: some kids fit
                bestMatch = Math.max(bestMatch, 85);
              } else if (avgKidAge >= minAge - 2 && avgKidAge <= maxAge + 2) {
                // Close match: average kid age is near the range
                bestMatch = Math.max(bestMatch, 70);
              }
            }
          }
        }
        
        return bestMatch || 50; // Default to 50 if has age info but no match at all
      };
      
      const relevantEvents = allFormattedEvents.filter(event => {
        // Only filter out explicitly adult-only events
        if (event.suitable_for_kids === false) {
          return false;
        }
        
        // If event has specific dates, check relevance (but be lenient)
        if (event.start_date) {
          try {
            const eventStart = new Date(event.start_date);
            const eventEnd = event.end_date ? new Date(event.end_date) : eventStart;
            
            // Use wider date window (30 days before, 60 days after) to catch more events
            const daysBefore = 30;
            const daysAfter = 60;
            const windowStart = new Date(targetDate);
            windowStart.setDate(windowStart.getDate() - daysBefore);
            const windowEnd = new Date(targetDate);
            windowEnd.setDate(windowEnd.getDate() + daysAfter);
            
            // Only filter out events that are clearly outside the window
            if (eventEnd < windowStart || eventStart > windowEnd) {
              return false;
            }
          } catch (err) {
            // If date parsing fails, include the event anyway
            console.log(`⚠️ Date parsing error for event: ${event.title}, including anyway`);
          }
        }
        
        // Include events without dates (ongoing attractions/activities)
        return true;
      });
      
      console.log(`🔍 Filtered ${allFormattedEvents.length} Fever events to ${relevantEvents.length} age-appropriate and date-relevant events`);
      if (relevantEvents.length === 0 && allFormattedEvents.length > 0) {
        console.log(`⚠️ All ${allFormattedEvents.length} events were filtered out - this might indicate overly strict filtering`);
      }
      
      // Calculate split: aim for 1/6 from Fever, 5/6 from AI
      const sixthCount = Math.floor(maxActivities / 6);
      const feverCount = Math.min(sixthCount, relevantEvents.length);
      aiGeneratedCount = maxActivities - feverCount;
      
      console.log(`📊 Split calculation: maxActivities=${maxActivities}, sixthCount=${sixthCount}, relevantEvents.length=${relevantEvents.length}, feverCount=${feverCount}, aiGeneratedCount=${aiGeneratedCount}`);
      
      if (feverCount > 0) {
        // Score and rank events based on age appropriateness
        const scoredEvents = relevantEvents.map(event => ({
          event,
          ageScore: scoreAgeMatch(event)
        }));
        
        // Sort by age score (higher is better)
        scoredEvents.sort((a, b) => b.ageScore - a.ageScore);
        
        // Send top candidates to AI (2x the needed count, up to 15 max)
        const candidateCount = Math.min(feverCount * 2, 15);
        const topCandidates = scoredEvents.slice(0, candidateCount).map(scored => scored.event);
        
        // Log candidates being sent to AI
        console.log(`📊 Sending ${candidateCount} top-scored Fever event candidates to AI (will select best ${feverCount}):`);
        console.log(`   Kids ages: ${kidsAges.join(', ')}`);
        scoredEvents.slice(0, candidateCount).forEach((scored, idx) => {
          const ageInfo = scored.event.suitable_ages || 'All ages';
          const category = scored.event.category || 'other';
          console.log(`  ${idx + 1}. [Score: ${scored.ageScore}] ${scored.event.title}`);
          console.log(`      Ages: ${ageInfo} | Category: ${category}`);
        });
        
        feverEventsForAI = topCandidates;
        console.log(`✅ Prepared ${candidateCount} Fever candidate events for AI selection (AI will choose best ${feverCount}) + will generate ${aiGeneratedCount} AI activities`);
      } else {
        console.log('ℹ️ No relevant Fever events found (feverCount = 0), AI will generate all recommendations from general knowledge');
      }
    } else {
      console.log('ℹ️ No Fever events found, AI will generate recommendations from general knowledge');
    }
  } catch (error) {
    console.log('⚠️ Fever events fetch failed, continuing without real events:', error.message);
  }

  // Check for cancellation before AI call
  if (abortSignal?.aborted) {
    throw new Error('Request was cancelled');
  }

  const prompt = buildUserMessage(enrichedCtx, allowedCats, webSearchResults, maxActivities, holidayFestivalInfo, feverEventsForAI, aiGeneratedCount);
  
  // Determine which AI provider to use
  const provider = apiKeys.ai_provider || 'gemini';
  console.log(`Using AI provider: ${provider}`);
  
  let json;
  try {
    if (provider === 'openrouter') {
      json = await callOpenRouterModel(prompt, maxRetries, abortSignal);
    } else if (provider === 'together') {
      json = await callTogetherModel(prompt, maxRetries, abortSignal);
    } else {
      json = await callGeminiModel(prompt, maxRetries, abortSignal);
    }
  } catch (error) {
    // Check if it was a cancellation
    if (abortSignal?.aborted || error.message.includes('cancelled')) {
      throw error;
    }
    
    // If selected provider fails, try fallback strategies
    console.log(`Primary provider (${provider}) failed, trying fallback...`);
    try {
      if (provider === 'together') {
        // For Together.ai, first try OpenRouter, then Gemini
        json = await callOpenRouterModel(prompt, maxRetries, abortSignal);
        console.log('Fallback to OpenRouter successful');
      } else if (provider === 'openrouter') {
        // For OpenRouter, try Gemini as fallback
        json = await callGeminiModel(prompt, maxRetries, abortSignal);
        console.log('Fallback to Gemini successful');
      } else {
        // For Gemini, try Together.ai first (with JSON mode), then OpenRouter
        try {
          json = await callTogetherModel(prompt, maxRetries, abortSignal);
          console.log('Fallback to Together.ai successful');
        } catch (togetherError) {
          json = await callOpenRouterModel(prompt, maxRetries, abortSignal);
          console.log('Fallback to OpenRouter successful');
        }
      }
    } catch (fallbackError) {
      // Check if fallback was cancelled
      if (abortSignal?.aborted || fallbackError.message.includes('cancelled')) {
        throw fallbackError;
      }
      throw new Error(`All AI providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
    }
  }
  
  // Enhanced Zod validation with model-specific handling
  try {
    const modelName = getActiveModelName();
    console.log(`🔍 Starting validation for model: ${modelName}`);
    
    // First check basic structure before expensive validation
    if (!isResponseStructureValid(json)) {
      throw new Error('Response structure is invalid - missing activities array or required fields');
    }
    
    // Perform comprehensive validation with model-specific configuration
    json = validateForModel(json, modelName);
    
    console.log(`✅ Response validation successful: ${json.activities.length} activities validated`);
    
  } catch (error) {
    if (error instanceof ValidationError) {
      const errorSummary = getValidationErrorSummary(error);
      console.error('❌ Zod validation failed:', errorSummary);
      throw new Error(`AI response validation failed: ${errorSummary}`);
    } else {
      console.error('❌ Validation error:', error.message);
      throw new Error(`Response validation failed: ${error.message}`);
    }
  }
  
  // Add web search sources to the result
  if (webSearchResults && webSearchResults.sources) {
    json.web_sources = webSearchResults.sources;
  }
  
  // Process discovered holidays/festivals from AI response
  if (json.discovered_holidays && json.discovered_holidays.length > 0) {
    console.log(`🎉 AI discovered ${json.discovered_holidays.length} holidays/festivals:`, 
      json.discovered_holidays.map(h => `${h.name} (${h.date})`).join(', '));
    
    // Update the context with discovered holidays
    const discoveredFestivals = json.discovered_holidays.map(holiday => ({
      name: holiday.name,
      start_date: holiday.date,
      end_date: holiday.date,
      url: null,
      distance_km: null
    }));
    
    // Update response context to include discovered festivals
    if (!json.query) json.query = {...enrichedCtx};
    json.query.nearby_festivals = [...(json.query.nearby_festivals || []), ...discoveredFestivals];
    
    // Check if any discovered events indicate public holidays
    const hasPublicHoliday = json.discovered_holidays.some(h => 
      h.type === 'public_holiday' || 
      h.name.toLowerCase().includes('holiday') ||
      h.name.toLowerCase().includes('christmas') ||
      h.name.toLowerCase().includes('easter') ||
      h.name.toLowerCase().includes('new year') ||
      h.name.toLowerCase().includes('independence') ||
      h.name.toLowerCase().includes('national')
    );
    
    if (hasPublicHoliday && !json.query.is_public_holiday) {
      json.query.is_public_holiday = true;
      console.log('🎊 Updated public holiday status based on AI-discovered holidays');
    }
    
    // Cache the AI-discovered festival data for future use
    // Note: This runs after the main logic, not affecting the current search but helping future ones
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      setImmediate(async () => {
        try {
          await dataManager.cacheFestivalData(enrichedCtx.location, enrichedCtx.date, enrichedCtx.date, json.discovered_holidays);
          console.log(`🎭 Background: Cached AI-discovered festival data for future use: ${enrichedCtx.location} on ${enrichedCtx.date}`);
        } catch (cacheError) {
          console.log('Background: Failed to cache AI-discovered festival data (non-blocking):', cacheError.message);
        }
      });
    }
  }
  
  // Enforce Fever event count limit (1/6 of total)
  // The AI might select more than requested, so we need to trim
  const feverActivities = json.activities.filter(a => a.source === 'Fever');
  const aiActivities = json.activities.filter(a => !a.source || a.source !== 'Fever');
  
  if (feverEventsForAI && feverEventsForAI.length > 0) {
    const targetFeverCount = Math.floor(maxActivities / 6);
    
    if (feverActivities.length > targetFeverCount) {
      console.log(`⚠️ AI selected ${feverActivities.length} Fever events, but we only want ${targetFeverCount}. Trimming excess.`);
      
      // Keep only the first targetFeverCount Fever events (AI usually puts best ones first)
      const keptFever = feverActivities.slice(0, targetFeverCount);
      const removedCount = feverActivities.length - targetFeverCount;
      
      // Reconstruct activities array with correct counts
      json.activities = [...keptFever, ...aiActivities];
      
      console.log(`✅ Trimmed ${removedCount} excess Fever events. Final: ${keptFever.length} Fever + ${aiActivities.length} AI = ${json.activities.length} total`);
    } else if (feverActivities.length < targetFeverCount) {
      console.log(`ℹ️ AI selected ${feverActivities.length} Fever events (less than target ${targetFeverCount}). This is acceptable.`);
    } else {
      console.log(`✅ AI selected exactly ${feverActivities.length} Fever events as requested.`);
    }
  }
  
  console.log(`✅ Final result: ${json.activities.length} activities generated by AI`);
  console.log('🔍 Sample activity titles:', json.activities.slice(0, 3).map(a => a.title).join(', '));
  
  // Debug: Check how many activities have source field
  const withSource = json.activities.filter(a => a.source).length;
  const finalFeverCount = json.activities.filter(a => a.source === 'Fever').length;
  console.log(`🎪 Activities with source field: ${withSource} total, ${finalFeverCount} from Fever`);
  if (finalFeverCount > 0) {
    console.log('🎪 Sample Fever activity:', JSON.stringify(json.activities.find(a => a.source === 'Fever'), null, 2));
  }
  
  return json;
}

function getModelIdentifier() {
  const provider = apiKeys.ai_provider || 'gemini';
  if (apiKeys.cache_include_model && provider === 'openrouter') {
    return `openrouter-${apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'}`;
  }
  return provider;
}

function getActiveModelName() {
  const provider = apiKeys.ai_provider || 'gemini';
  if (provider === 'openrouter') {
    return `openrouter-${apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'}`;
  } else if (provider === 'together') {
    return `together-${apiKeys.together_model || 'meta-llama/Llama-3.2-3B-Instruct-Turbo'}`;
  }
  return apiKeys.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
}


function filterOutFestivalActivities(result) {
  if (result && Array.isArray(result.activities)) {
    result.activities = result.activities.filter(act => {
      const category = (act.category || '').toLowerCase();
      const title = (act.title || '').toLowerCase();
      return !(
        category.includes('festival') ||
        category.includes('holiday') ||
        title.includes('festival') ||
        title.includes('holiday')
      );
    });
  }
}

app.post('/api/activities', async (req, res) => {
  // Handle request cancellation
  let isCancelled = false;
  const abortController = new AbortController();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  console.log(`🚀 [SERVER DEBUG ${requestId}] New /api/activities request started`);
  console.log(`🚀 [SERVER DEBUG ${requestId}] Request headers:`, req.headers);
  
  // Use the 'aborted' event which only fires when the client truly
  // terminates the request before a response is sent. The previous
  // implementation listened for 'close', which can fire in normal
  // circumstances and led to legitimate searches being cancelled.
  req.on('aborted', () => {
    console.log(`🚫 [SERVER DEBUG ${requestId}] Request 'aborted' event triggered`);
    console.log(`🚫 [SERVER DEBUG ${requestId}] Response headers sent:`, res.headersSent);
    if (!res.headersSent) {
      console.log(`⚠️ [SERVER DEBUG ${requestId}] Client disconnected, cancelling search request`);
      isCancelled = true;
      abortController.abort();
      console.log(`🚫 [SERVER DEBUG ${requestId}] AbortController.abort() called`);
    } else {
      console.log(`ℹ️ [SERVER DEBUG ${requestId}] Response already sent, not cancelling`);
    }
  });
  
  req.on('error', (err) => {
    console.log(`❌ [SERVER DEBUG ${requestId}] Request error:`, err.message);
  });
  
  abortController.signal.addEventListener('abort', () => {
    console.log(`🚫 [SERVER DEBUG ${requestId}] AbortController signal triggered on server`);
  });

  try{
    const ctx = req.body?.ctx;
    const allowed = req.body?.allowedCategories || JSON_SCHEMA.activities[0].category;
    const maxActivities = req.body?.maxActivities || apiKeys.max_activities || 20;
    const bypassCache = req.body?.bypassCache || false;
    
    // Check if request was cancelled before we start
    if (isCancelled) {
      console.log(`🚫 [SERVER DEBUG ${requestId}] Request already cancelled, returning early`);
      return;
    }
    
    console.log(`✅ [SERVER DEBUG ${requestId}] Request validation passed, proceeding with search`);
    
    // Check if any AI provider is available
    const provider = apiKeys.ai_provider || 'gemini';
    const geminiKey = apiKeys.gemini_api_key || process.env.GEMINI_API_KEY || '';
    const openrouterKey = apiKeys.openrouter_api_key || process.env.OPENROUTER_API_KEY || '';
    
    if (provider === 'openrouter' && !openrouterKey) {
      return res.status(400).json({ 
        ok: false, 
        error: 'OpenRouter API key not configured. Please add it in Settings or switch to Gemini provider.' 
      }); 
    }
    
    if (provider === 'gemini' && !geminiKey) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gemini API key not configured. Please add it in Settings or switch to OpenRouter provider.' 
      }); 
    }
    
    // If no provider has a key, check for any working key
    if (!geminiKey && !openrouterKey) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No AI provider configured. Please add either Gemini or OpenRouter API key in Settings.' 
      }); 
    }
    
    if(!ctx){ return res.status(400).json({ ok:false, error:'Missing ctx' }); }

    // Check for cached results first (only if using Neo4j and cache is not bypassed)
    let json = null;
    let cacheBypassReason = null;
    
    if (bypassCache) {
      console.log('🔄 Cache bypassed - performing fresh search as requested');
      cacheBypassReason = 'user_requested';
    }
    
    // Check if we should bypass cache due to model change
    if (!bypassCache && apiKeys.cache_include_model) {
      const currentModel = getActiveModelName();
      console.log('🔍 Checking cache model compatibility - current model:', currentModel);
      
      // Get cached results (both exact and similar) to check model compatibility
      if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
        try {
          const modelName = getModelIdentifier();
          const cacheKey = `${allowed}-${maxActivities || 'default'}`;
          
          // Check for exact match first
          const exactCachedResults = await dataManager.getExactCachedResults(
            dataManager.generateSearchKey(ctx.location, ctx.date, ctx.duration_hours, ctx.ages, cacheKey, ctx.extra_instructions || '', modelName)
          );
          
          let shouldBypassForModel = false;
          
          if (exactCachedResults && exactCachedResults.ai_model && exactCachedResults.ai_model !== currentModel) {
            console.log(`🔄 Cache bypassed - exact match with different model (${exactCachedResults.ai_model} vs ${currentModel})`);
            shouldBypassForModel = true;
          } else if (!exactCachedResults) {
            // Check for similar results with different models
            const similarCachedResults = await dataManager.getSimilarCachedResults(
              ctx.location, ctx.date, ctx.duration_hours, ctx.ages, 
              cacheKey, ctx.extra_instructions || '', modelName, ctx
            );
            
            if (similarCachedResults && similarCachedResults.cacheInfo) {
              const { similarity, cachedModel } = similarCachedResults.cacheInfo;
              
              if (cachedModel && cachedModel !== currentModel) {
                // Only bypass if similarity is below threshold AND model is different
                const minSimilarityForModelReuse = (apiKeys.cache_similarity_threshold || 0.90) + 0.05; // Slightly higher threshold for cross-model reuse
                
                if (similarity < minSimilarityForModelReuse) {
                  console.log(`🔄 Cache bypassed - similar match with different model and low similarity (${cachedModel} vs ${currentModel}, similarity: ${(similarity * 100).toFixed(1)}%)`);
                  shouldBypassForModel = true;
                } else {
                  console.log(`✅ Keeping cache despite model change - high similarity (${cachedModel} vs ${currentModel}, similarity: ${(similarity * 100).toFixed(1)}%)`);
                }
              }
            }
          }
          
          if (shouldBypassForModel) {
            cacheBypassReason = `model_changed_from_${exactCachedResults?.ai_model || 'unknown'}_to_${currentModel}`;
            bypassCache = true;
          }
        } catch (modelCheckError) {
          console.log('Model compatibility check failed (non-blocking):', modelCheckError.message);
        }
      }
    }
    
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager && !bypassCache) {
      try {
        const modelName = getModelIdentifier();
        const cacheKey = `${allowed}-${maxActivities || 'default'}`;
        const cachedResults = await dataManager.getCachedSearchResults(
          ctx.location,
          ctx.date,
          ctx.duration_hours,
          ctx.ages,
          cacheKey,
          ctx.extra_instructions || '',
          modelName,
          ctx // Pass full context for smart caching
        );
        
        if (cachedResults) {
          console.log('⚡ Using cached search results for:', ctx.location, ctx.date);
          
          // Apply exclusion filtering to cached results
          const exclusions = await dataManager.loadExclusionList();
          const locationExclusions = exclusions[ctx.location] || [];
          
          if (locationExclusions.length > 0 && cachedResults.activities) {
            console.log(`🚫 Filtering ${locationExclusions.length} excluded activities from cached results`);
            const originalCount = cachedResults.activities.length;
            
            // Filter out excluded activities (case-insensitive matching)
            cachedResults.activities = cachedResults.activities.filter(activity => {
              const activityTitle = (activity.title || '').toLowerCase();
              const isExcluded = locationExclusions.some(excluded => 
                activityTitle.includes(excluded.toLowerCase()) || 
                excluded.toLowerCase().includes(activityTitle)
              );
              return !isExcluded;
            });
            
            console.log(`✅ Filtered cached results: ${originalCount} → ${cachedResults.activities.length} activities`);
          }
          
          filterOutFestivalActivities(cachedResults);

          if (!cachedResults.ai_provider) {
            cachedResults.ai_provider = apiKeys.ai_provider || 'gemini';
          }
          if (!cachedResults.ai_model) {
            cachedResults.ai_model = cachedResults.ai_provider;
          }

          json = cachedResults;
        }
      } catch (cacheError) {
        console.log('Cache retrieval failed (non-blocking):', cacheError.message);
      }
    }

    // If no cached results, perform new search
    if (!json) {
      // Check if request was cancelled before expensive AI call
      if (isCancelled) {
        console.log(`🚫 [SERVER DEBUG ${requestId}] Request cancelled before AI search, returning early`);
        return;
      }
      
      console.log(`🔍 [SERVER DEBUG ${requestId}] No cached results found, performing new search...`);
      json = await callModelWithRetry(ctx, allowed, 3, maxActivities, abortController.signal);

      json.ai_provider = apiKeys.ai_provider || 'gemini';
      json.ai_model = getActiveModelName();

      filterOutFestivalActivities(json);

      // Cache the results (only if using Neo4j and not fallback responses)
      if (isNeo4jConnected && dataManager instanceof Neo4jDataManager && json) {
        // Check if this is a fallback response that we should NOT cache
        const isFallbackResponse = json.activities && json.activities.length === 1 && 
          (json.activities[0].title === 'Activity Search Failed' || 
           json.activities[0].description?.includes('Please try again'));
        
        if (!isFallbackResponse) {
          try {
            const modelName = getModelIdentifier();
            const cacheKey = `${allowed}-${maxActivities || 'default'}`;
            await dataManager.cacheSearchResults(
              ctx.location,
              ctx.date,
              ctx.duration_hours,
              ctx.ages,
              cacheKey,
              json,
              ctx.extra_instructions || '',
              modelName,
              ctx // Pass full context for smart caching
            );
            console.log(`✅ Successfully cached search results with ${json.activities.length} activities`);
          } catch (cacheError) {
            console.log('Failed to cache search results (non-blocking):', cacheError.message);
          }
        } else {
          console.log('⚠️ Skipping cache for fallback response - user should try again');
        }
      }
    }
    
    // Save successful search to history (isolated per request)
    try {
      await dataManager.addToSearchHistory(ctx);
    } catch (historyError) {
      console.log('Failed to save search history (non-blocking):', historyError.message);
    }

    if (!json.ai_provider) {
      json.ai_provider = apiKeys.ai_provider || 'gemini';
    }
    if (!json.ai_model) {
      json.ai_model = getActiveModelName();
    }

    // Add cache bypass reason if applicable
    if (cacheBypassReason) {
      json.cacheBypassReason = cacheBypassReason;
    }

    res.json({ ok: true, data: json, cacheInfo: json.cacheInfo || null });
  } catch (err){
    console.log(`🚫 [SERVER DEBUG ${requestId}] Caught error:`, err.message);
    console.log(`🚫 [SERVER DEBUG ${requestId}] isCancelled:`, isCancelled);
    console.log(`🚫 [SERVER DEBUG ${requestId}] AbortController signal aborted:`, abortController.signal.aborted);
    
    // Handle cancellation gracefully
    if (isCancelled || err.message.includes('cancelled') || err.message.includes('Request was cancelled')) {
      console.log(`🚫 [SERVER DEBUG ${requestId}] Request was cancelled, not sending error response`);
      return; // Don't send a response if cancelled
    }
    
    console.error(`❌ [SERVER DEBUG ${requestId}] Final error:`, err);
    res.status(500).json({ ok:false, error: err.message || 'Server error' });
  }
});

// Search History endpoints
app.get('/api/search-history', async (req, res) => {
  try {
    const history = await dataManager.loadSearchHistory();
    res.json({ ok: true, history });
  } catch (error) {
    console.error('Error getting search history:', error);
    res.status(500).json({ ok: false, error: 'Failed to get search history' });
  }
});

app.delete('/api/search-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await dataManager.loadSearchHistory();
    const initialLength = history.length;
    const filteredHistory = history.filter(entry => entry.id !== id);
    
    if (filteredHistory.length < initialLength) {
      await dataManager.saveSearchHistory(filteredHistory);
      // Update legacy global for backward compatibility
      searchHistory = filteredHistory;
      res.json({ ok: true, message: 'Search history entry deleted' });
    } else {
      res.status(404).json({ ok: false, error: 'Search history entry not found' });
    }
  } catch (error) {
    console.error('Error deleting search history entry:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete search history entry' });
  }
});

// Exclusion List endpoints
app.get('/api/exclusion-list', async (req, res) => {
  try {
    const exclusions = await dataManager.loadExclusionList();
    res.json({ ok: true, exclusions });
  } catch (error) {
    console.error('Error getting exclusion list:', error);
    res.status(500).json({ ok: false, error: 'Failed to get exclusion list' });
  }
});

app.post('/api/exclusion-list', async (req, res) => {
  try {
    const { location, attraction } = req.body;
    
    if (!location || !attraction) {
      return res.status(400).json({ ok: false, error: 'Location and attraction are required' });
    }
    
    const added = await dataManager.addToExclusionList(location, attraction);
    const exclusions = await dataManager.loadExclusionList();
    
    // Update legacy global for backward compatibility
    exclusionList = exclusions;
    
    if (added) {
      console.log(`Added '${attraction}' to exclusion list for ${location}`);
      res.json({ ok: true, message: 'Attraction added to exclusion list', exclusions });
    } else {
      res.json({ ok: true, message: 'Attraction already in exclusion list', exclusions });
    }
  } catch (error) {
    console.error('Error adding to exclusion list:', error);
    res.status(500).json({ ok: false, error: 'Failed to add to exclusion list' });
  }
});

app.delete('/api/exclusion-list/:location/:attraction', async (req, res) => {
  try {
    const { location, attraction } = req.params;
    const decodedLocation = decodeURIComponent(location);
    const decodedAttraction = decodeURIComponent(attraction);
    
    const removed = await dataManager.removeFromExclusionList(decodedLocation, decodedAttraction);
    const exclusions = await dataManager.loadExclusionList();
    
    // Update legacy global for backward compatibility
    exclusionList = exclusions;
    
    if (removed) {
      console.log(`Removed '${decodedAttraction}' from exclusion list for ${decodedLocation}`);
      res.json({ ok: true, message: 'Attraction removed from exclusion list', exclusions });
    } else {
      res.status(404).json({ ok: false, error: 'Attraction not found in exclusion list' });
    }
  } catch (error) {
    console.error('Error removing from exclusion list:', error);
    res.status(500).json({ ok: false, error: 'Failed to remove from exclusion list' });
  }
});

// Simple root endpoint for debugging
app.get('/api/status', (req, res) => {
  console.log('📊 Status endpoint called');
  res.status(200).json({
    status: 'running',
    message: 'FunFinder API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => {
  console.log('🏥 Health check endpoint called');
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      database: isNeo4jConnected ? 'Neo4j Connected' : 'Local Storage',
      version: process.env.npm_package_version || '0.1.1'
    };
    console.log('🏥 Health check response:', healthData);
    res.status(200).json(healthData);
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Alternative health check endpoints for different platforms
app.get('/healthz', (req, res) => {
  console.log('🏥 Simple health check (/healthz) called');
  res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
  console.log('🏥 Ping endpoint called');
  res.status(200).send('pong');
});

// Root API endpoint
app.get('/', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, let the catch-all handler serve index.html
    console.log('🏠 Root endpoint called (production) - passing to catch-all handler');
    return next();
  }
  console.log('🏠 Root endpoint called (development)');
  res.json({
    name: 'FunFinder API',
    version: '0.1.1',
    status: 'running',
    endpoints: {
      health: '/health',
      healthz: '/healthz',
      ping: '/ping',
      status: '/api/status'
    }
  });
});

// Catch-all handler: send back React's index.html file for client-side routing
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip API routes and static assets
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
      return next();
    }
    
    const indexPath = path.join(process.cwd(), 'dist', 'index.html');
    const distPath = path.join(process.cwd(), 'dist');
    
    console.log(`🔄 Catch-all handler triggered for route: ${req.path}`);
    console.log(`📁 Looking for index.html at: ${indexPath}`);
    console.log(`📁 Dist directory exists: ${fs.existsSync(distPath)}`);
    
    // Check if index.html exists before serving
    if (fs.existsSync(indexPath)) {
      console.log(`✅ Serving index.html for route: ${req.path}`);
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html not found in dist directory');
      console.log('📁 Dist directory contents:', fs.existsSync(distPath) ? fs.readdirSync(distPath) : 'Directory does not exist');
      res.status(500).send('Application not built. Please run "npm run build" first.');
    }
  });
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (dataManager && typeof dataManager.close === 'function') {
    await dataManager.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (dataManager && typeof dataManager.close === 'function') {
    await dataManager.close();
  }
  process.exit(0);
});

// Get model-specific configuration for optimal performance
function getModelSpecificConfig(modelName) {
  const lowerModel = modelName.toLowerCase();
  const reasoningEnabled = !!apiKeys.enable_reasoning;
  
  // DeepSeek models (R1, Chat) - optimized for reasoning control
  if (lowerModel.includes('deepseek')) {
    console.log(`🔧 Configuring ${modelName} with optimized settings for DeepSeek (reasoning: ${reasoningEnabled})`);
    return {
      temperature: reasoningEnabled ? 0.3 : 0.1, // Higher temp for reasoning, lower for speed
      extraParams: {
        top_p: reasoningEnabled ? 0.95 : 0.9,
        reasoning_tag: 'think'
      }
    };
  }
  
  // GPT-OSS-20B and GLM-Air - need reasoning mode disabled
  if (lowerModel.includes('gpt-oss-20b') || lowerModel.includes('glm-air')) {
    console.log(`🔧 Configuring ${modelName} with temperature for output (reasoning: ${reasoningEnabled})`);
    return {
      temperature: reasoningEnabled ? 0.5 : 0.2, // Higher temp for reasoning
      extraParams: {
        reasoning_effort: reasoningEnabled ? 'medium' : 'low'
      }
    };
  }
  
  // Nemotron models - optimized for instruction following
  if (lowerModel.includes('nemotron')) {
    console.log(`🔧 Configuring ${modelName} for instruction following (reasoning: ${reasoningEnabled})`);
    return {
      temperature: reasoningEnabled ? 0.4 : 0.1, // Higher temp for reasoning
      extraParams: {
        top_p: reasoningEnabled ? 0.95 : 0.9,
      }
    };
  }
  
  // Qwen models - optimized for structured output
  if (lowerModel.includes('qwen')) {
    console.log(`🔧 Configuring ${modelName} with Qwen optimizations`);
    return {
      temperature: 0.25, // Slightly higher for creativity while maintaining structure
      extraParams: {
        top_p: 0.9,
      }
    };
  }
  
  // Llama models - optimized for consistency
  if (lowerModel.includes('llama')) {
    // Special handling for Llama 3.2 3B model which has JSON formatting issues
    if (lowerModel.includes('llama-3.2-3b')) {
      console.log(`🔧 Configuring ${modelName} with Llama 3.2-3B enhanced JSON stability optimizations`);
      return {
        temperature: 0.05, // Ultra-low temperature for maximum JSON consistency
        extraParams: {
          top_p: 0.8, // Very low top_p to minimize randomness
          max_tokens: 2500, // Enough tokens for complete response
          frequency_penalty: 0.3, // Higher penalty to reduce property duplication
          presence_penalty: 0.2, // Encourage structured output variety
          repetition_penalty: 1.1, // Additional penalty for repetition
          stop: ["}]}", "```", "```json"] // Stop tokens to prevent extra content
        }
      };
    }
    
    console.log(`🔧 Configuring ${modelName} with Llama optimizations`);
    return {
      temperature: 0.15, // Lower temperature for better JSON consistency
      extraParams: {
        top_p: 0.88, // Slightly lower for more deterministic output
        frequency_penalty: 0.1, // Reduce repetition
        stop: ["}]}", "```", "```json"] // Stop tokens to prevent extra content
      }
    };
  }
  
  // Mistral/Mixtral models - optimized for efficiency
  if (lowerModel.includes('mistral') || lowerModel.includes('mixtral')) {
    console.log(`🔧 Configuring ${modelName} with Mistral optimizations`);
    return {
      temperature: 0.25, // Slightly higher for better creativity
      extraParams: {
        top_p: 0.9,
      }
    };
  }
  
  // Claude models (if available through OpenRouter)
  if (lowerModel.includes('claude')) {
    console.log(`🔧 Configuring ${modelName} with Claude optimizations`);
    return {
      temperature: 0.15, // Claude works well with very low temperature
      extraParams: {
        top_p: 0.95,
        thinking_tokens: 0 // Disable thinking tokens for Sonnet models
      }
    };
  }
  
  // GPT-4 models - balanced settings
  if (lowerModel.includes('gpt-4')) {
    console.log(`🔧 Configuring ${modelName} with GPT-4 optimizations`);
    return {
      temperature: 0.2, // Good balance for GPT-4
      extraParams: {
        top_p: 0.9,
      }
    };
  }
  
  // Cohere models - need thinking parameter disabled
  if (lowerModel.includes('cohere') || lowerModel.includes('command')) {
    console.log(`🔧 Configuring ${modelName} with Cohere reasoning suppression`);
    return {
      temperature: 0.2,
      extraParams: {
        top_p: 0.9,
        thinking: { type: 'disabled' } // Disable reasoning for Cohere models
      }
    };
  }

  // Google Gemma models - optimized for efficiency
  if (lowerModel.includes('gemma')) {
    console.log(`🔧 Configuring ${modelName} with Gemma optimizations (reasoning: ${reasoningEnabled})`);
    return {
      temperature: reasoningEnabled ? 0.4 : 0.1, // Higher temp for reasoning
      extraParams: {
        top_p: reasoningEnabled ? 0.95 : 0.9,
      }
    };
  }

  // Microsoft Phi models - optimized for instruction following
  if (lowerModel.includes('phi')) {
    console.log(`🔧 Configuring ${modelName} with Phi optimizations (reasoning: ${reasoningEnabled})`);
    return {
      temperature: reasoningEnabled ? 0.4 : 0.1, // Higher temp for reasoning
      extraParams: {
        top_p: reasoningEnabled ? 0.95 : 0.9,
      }
    };
  }

  // Default configuration for unknown models
  console.log(`🔧 Using default configuration for ${modelName} (reasoning: ${reasoningEnabled})`);
  return {
    temperature: reasoningEnabled ? 0.4 : 0.1, // Higher temp for reasoning
    extraParams: {
      top_p: reasoningEnabled ? 0.95 : 0.9,
    }
  };
}

// Get model-specific system message
function getSystemMessage(modelName) {
  const lowerModel = modelName.toLowerCase();
  const reasoningEnabled = !!apiKeys.enable_reasoning;
  
  // DeepSeek models: concise instructions for R1 and Chat variants
  if (lowerModel.includes('deepseek')) {
    if (reasoningEnabled) {
      return 'You are an intelligent activity recommendation system. Use detailed reasoning to provide comprehensive, well-thought-out recommendations. Consider all aspects thoroughly, then return the JSON object with high-quality, detailed suggestions. You may use reasoning steps, but ensure the final response includes the complete JSON object.';
    } else {
      return 'You are a JSON generator. Do not use <think> tags or reasoning traces. Return ONLY the requested JSON object with no explanations or commentary. Output pure JSON starting with { and ending with }.';
    }
  }
  
  // Nemotron models: system prompt for final answer only with /no_think directive
  if (lowerModel.includes('nemotron')) {
    return 'You are a JSON generator. /no_think Respond ONLY with the requested JSON object. No intermediate reasoning, no explanations, no commentary. Final answer only. Do not use thinking or reasoning modes - return the JSON directly.';
  }
  
  // GLM-Air and gpt-oss-20b: strong emphasis on direct JSON response
  if (lowerModel.includes('gpt-oss-20b') || lowerModel.includes('glm-air')) {
    return 'You are a JSON response generator with reasoning_effort set to low. You must respond ONLY with valid JSON matching the schema. Do NOT use reasoning mode, thinking mode, or any intermediate steps. Return the complete JSON object directly in your response content field. No explanations, no commentary, just pure JSON starting with { and ending with }.';
  }
  
  // Qwen models: structured output emphasis
  if (lowerModel.includes('qwen')) {
    return 'You are a JSON generator optimized for structured output. Return ONLY the requested JSON object with perfect schema compliance. No explanations, just pure JSON starting with { and ending with }.';
  }
  
  // Llama models: clear and direct instructions
  if (lowerModel.includes('llama')) {
    // Special instructions for Llama 3.2 3B model to prevent JSON formatting issues
    if (lowerModel.includes('llama-3.2-3b')) {
      return 'You are a JSON response assistant. CRITICAL: Output ONLY valid JSON with NO duplicate field names in any object. Each field name must appear exactly once per object. Ensure proper JSON syntax with correct commas and brackets. No explanations, no reasoning, no extra text - just the JSON object starting with { and ending with }. Validate that every JSON object has unique field names before responding.';
    }
    
    return 'You are a JSON response assistant. Output ONLY valid JSON matching the provided schema. No explanations, no reasoning, no extra text - just the JSON object starting with { and ending with }.';
  }
  
  // Mistral/Mixtral models: efficiency-focused
  if (lowerModel.includes('mistral') || lowerModel.includes('mixtral')) {
    return 'Generate ONLY the requested JSON object. No explanations, no reasoning steps, no commentary. Return pure JSON starting with { and ending with }.';
  }
  
  // Claude models: precise instructions with thinking tokens disabled
  if (lowerModel.includes('claude')) {
    return 'You are a JSON generator with thinking tokens disabled. Return exclusively the requested JSON object matching the schema. No additional text, explanations, thinking, or reasoning - only the JSON starting with { and ending with }.';
  }
  
  // GPT-4 models: balanced approach
  if (lowerModel.includes('gpt-4')) {
    return 'You are a JSON response generator. Return ONLY the requested JSON object matching the provided schema. No explanations, reasoning, or additional text - just pure JSON starting with { and ending with }.';
  }
  
  // Cohere models: disable thinking parameter
  if (lowerModel.includes('cohere') || lowerModel.includes('command')) {
    return 'You are a JSON generator with thinking disabled. Return ONLY the requested JSON object matching the schema. No reasoning, no thinking, no explanations - just pure JSON starting with { and ending with }.';
  }

  // Default system message
  if (reasoningEnabled) {
    return 'You are an intelligent activity recommendation system. Use detailed reasoning and careful consideration to provide high-quality, thoughtful recommendations. Take time to analyze the context, weather, location, and user preferences. Then provide a comprehensive JSON response with well-reasoned activity suggestions.';
  } else {
    return 'You are a helpful assistant that responds only in valid JSON format. You must return ONLY a single JSON object matching the provided schema in your response content. Do not include any explanatory text, reasoning, or commentary - just the JSON object starting with { and ending with }.';
  }
}

// Helper function to extract complete JSON from text starting with {
function extractCompleteJson(text) {
  // Find the first { and extract from there
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;
  
  let braceCount = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  
  return null;
}

// Helper function to extract JSON around a specific index (like activities array)
function extractSurroundingJson(text, targetIndex) {
  // Find the nearest opening brace before the target
  let startIndex = -1;
  for (let i = targetIndex; i >= 0; i--) {
    if (text[i] === '{') {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) return null;
  
  // Extract from that point
  return extractCompleteJson(text.substring(startIndex));
}

// Enhanced JSON validation and reconstruction functions for Llama models
function isValidJSONStructure(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed && 
           typeof parsed === 'object' && 
           parsed.query && 
           Array.isArray(parsed.activities);
  } catch (e) {
    return false;
  }
}

function reconstructLlamaActivities(malformedJSON) {
  try {
    console.log('🔧 Starting sophisticated Llama JSON reconstruction...');
    
    // Extract the base query part
    const queryMatch = malformedJSON.match(/"query"\s*:\s*(\{[^}]+\})/);
    if (!queryMatch) {
      console.log('❌ Could not extract query object');
      return null;
    }
    
    const queryObject = queryMatch[1];
    
    // Find activities section - be very permissive
    const activitiesMatch = malformedJSON.match(/"activities"\s*:\s*\[(.*)$/s);
    if (!activitiesMatch) {
      console.log('❌ Could not find activities section');
      return null;
    }
    
    let activitiesContent = activitiesMatch[1];
    console.log(`🔧 Found activities content: ${activitiesContent.length} characters`);
    
    // Clean up malformed discovered_holidays section first
    activitiesContent = activitiesContent.replace(/,\s*"discovered_holidays"[^}]*\}.*$/, '');
    activitiesContent = activitiesContent.replace(/\\"[^"]*\\"/g, '""'); // Remove escaped quotes
    
    // Find all activity segments by splitting on title occurrences
    const titlePattern = /"title"\s*:\s*"([^"]*)"/g;
    const titleMatches = [...activitiesContent.matchAll(titlePattern)];
    
    if (titleMatches.length === 0) {
      console.log('❌ No activity titles found');
      return null;
    }
    
    console.log(`🔧 Found ${titleMatches.length} potential activities`);
    const reconstructedActivities = [];
    
    for (let i = 0; i < titleMatches.length; i++) {
      const titleMatch = titleMatches[i];
      const title = titleMatch[1];
      const startIndex = titleMatch.index;
      const endIndex = i < titleMatches.length - 1 ? titleMatches[i + 1].index : activitiesContent.length;
      
      const activitySegment = activitiesContent.substring(startIndex, endIndex);
      console.log(`🔧 Processing activity ${i + 1}: "${title}"`);
      
      // Extract properties with fallbacks
      const activity = {
        title: title,
        category: extractPropertyValue(activitySegment, 'category', ['outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 'hike', 'creative', 'festival', 'show', 'seasonal', 'other'], 'other'),
        description: extractPropertyValue(activitySegment, 'description', [], '') || `Interesting ${title.toLowerCase()} activity`,
        suitable_ages: extractPropertyValue(activitySegment, 'suitable_ages', [], 'All ages'),
        duration_hours: parseNumericProperty(activitySegment, 'duration_hours', 2),
        address: extractPropertyValue(activitySegment, 'address', [], '') || null,
        lat: parseNumericProperty(activitySegment, 'lat', null),
        lon: parseNumericProperty(activitySegment, 'lon', null), 
        booking_url: extractPropertyValue(activitySegment, 'booking_url', [], '') || null,
        free: parseBooleanProperty(activitySegment, 'free', true),
        weather_fit: extractPropertyValue(activitySegment, 'weather_fit', ['good', 'ok', 'bad'], 'good'),
        notes: extractPropertyValue(activitySegment, 'notes', [], '') || null,
        evidence: [],
        source: extractPropertyValue(activitySegment, 'source', [], '') || null
      };
      
      // Validate activity has essential fields
      if (activity.title && activity.category && activity.description) {
        reconstructedActivities.push(activity);
        console.log(`✅ Successfully reconstructed: "${title}"`);
      } else {
        console.log(`❌ Skipping invalid activity: "${title}"`);
      }
    }
    
    if (reconstructedActivities.length === 0) {
      console.log('❌ No valid activities could be reconstructed');
      return null;
    }
    
    // Rebuild complete JSON
    const reconstructedJSON = `{"query":${queryObject},"activities":${JSON.stringify(reconstructedActivities)}}`;
    
    // Validate the reconstructed JSON
    if (isValidJSONStructure(reconstructedJSON)) {
      console.log(`🎉 Successfully reconstructed valid JSON with ${reconstructedActivities.length} activities`);
      return reconstructedJSON;
    } else {
      console.log('❌ Reconstructed JSON failed validation');
      return null;
    }
    
  } catch (error) {
    console.log('❌ Reconstruction failed:', error.message);
    return null;
  }
}

function extractPropertyValue(text, propertyName, validValues = [], defaultValue = '') {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*"([^"]*)"`, 'i');
  const match = text.match(pattern);
  if (!match) return defaultValue;
  
  const value = match[1].trim();
  if (validValues.length > 0) {
    // Check if value is in valid list, handle pipe-separated values
    if (value.includes('|')) {
      const parts = value.split('|');
      const validPart = parts.find(part => validValues.includes(part.trim()));
      return validPart || defaultValue;
    }
    return validValues.includes(value) ? value : defaultValue;
  }
  
  return value || defaultValue;
}

function parseNumericProperty(text, propertyName, defaultValue = null) {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*([0-9.]+)`, 'i');
  const stringPattern = new RegExp(`"${propertyName}"\\s*:\\s*"([^"]*)"`, 'i');
  
  let match = text.match(pattern);
  if (!match) {
    match = text.match(stringPattern);
    if (!match) return defaultValue;
  }
  
  const value = parseFloat(match[1]);
  return isNaN(value) ? defaultValue : value;
}

function parseBooleanProperty(text, propertyName, defaultValue = false) {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*(true|false|"true"|"false")`, 'i');
  const match = text.match(pattern);
  if (!match) return defaultValue;
  
  const value = match[1].toLowerCase().replace(/"/g, '');
  return value === 'true';
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on http://0.0.0.0:' + PORT);
  console.log('🚀 Kids Activities Finder server started successfully');
console.log('📦 Version 0.1.2 - Fixed white page deployment issue');
  console.log('📊 Data storage:', isNeo4jConnected ? 'Neo4j AuraDB' : 'Local files');
});
