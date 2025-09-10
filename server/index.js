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

dotenv.config();

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
        openrouter: process.env.OPENROUTER_API_KEY ? 'configured' : 'not_configured'
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
    return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
  if (geminiKey && (geminiKey !== currentGeminiKey || !model)) {
    currentGeminiKey = geminiKey;
    genAI = new GoogleGenerativeAI(currentGeminiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('Gemini AI model initialized');
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
  openrouter_api_key: '',
  ai_provider: 'gemini', // 'gemini' or 'openrouter'
  openrouter_model: 'deepseek/deepseek-chat-v3.1:free',
  google_search_api_key: '',
  google_search_engine_id: '',
  openwebninja_api_key: '',
  ticketmaster_api_key: '',
  enable_gemini_holidays: false, // Enable Gemini-powered holiday/festival fetching
  max_activities: 20 // Maximum number of activities to generate
};

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
    
    const { location, date, duration_hours, ages } = query;
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
    dataManager = new Neo4jDataManager();
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
  } catch (error) {
    console.error('Error loading API keys:', error.message);
    loadFromEnvironment();
  }
}

function loadFromEnvironment() {
  // Load from environment variables as fallback
  apiKeys.gemini_api_key = process.env.GEMINI_API_KEY || '';
  apiKeys.openrouter_api_key = process.env.OPENROUTER_API_KEY || '';
  apiKeys.ai_provider = process.env.AI_PROVIDER || 'gemini';
  apiKeys.openrouter_model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free';
  apiKeys.google_search_api_key = process.env.GOOGLE_SEARCH_API_KEY || '';
  apiKeys.google_search_engine_id = process.env.GOOGLE_SEARCH_ENGINE_ID || '';
  apiKeys.openwebninja_api_key = process.env.OPENWEBNINJA_API_KEY || '';
  apiKeys.ticketmaster_api_key = process.env.TICKETMASTER_API_KEY || '';
  apiKeys.enable_gemini_holidays = process.env.ENABLE_GEMINI_HOLIDAYS === 'true' || false;
  apiKeys.max_activities = parseInt(process.env.MAX_ACTIVITIES) || 20;
  
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
    evidence: ['string[]|optional']
  } ]
};

function buildUserMessage(ctx, allowedCats, webSearchResults = null, maxActivities = null){
  const activityCount = maxActivities || apiKeys.max_activities || 20;
  const basePrompt = [
    `You are a local family activities planner. Using the provided context JSON, suggest ${activityCount} kid-friendly activities.`,
    'HARD RULES:',
    '- Tailor to the exact city and date.',
    '- Respect the duration window.',
    '- Activities must fit ALL provided ages.',
    '- Consider weather; set weather_fit to good/ok/bad.',
    '- Prefer options relevant to public holidays or nearby festivals when applicable.',
    '- Return ONLY a single valid JSON object matching the schema.',
    '- NO markdown code blocks, NO explanatory text, NO commentary.',
    '- Start your response with { and end with }.',
    '- Ensure all strings are properly quoted and escaped.',
    '- Do not include trailing commas.',
    ''
  ];

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

function buildUserMessageForDisplay(ctx, allowedCats, maxActivities = null, extraInstructions = ''){
  const activityCount = maxActivities || apiKeys.max_activities || 20;
  const basePrompt = [
    `You are a local family activities planner. Using the provided context JSON, suggest ${activityCount} kid-friendly activities.`,
    'HARD RULES:',
    '- Tailor to the exact city and date.',
    '- Respect the duration window.',
    '- Activities must fit ALL provided ages.',
    '- Consider weather; set weather_fit to good/ok/bad.',
    '- Prefer options relevant to public holidays or nearby festivals when applicable.',
    '- Return ONLY a single JSON object matching the schema; NO markdown or commentary.',
    ''
  ];

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

function parseJsonWithFallback(text) {
  console.log(`📝 Attempting to parse ${text.length} character response`);
  
  // First, try parsing as-is
  try {
    const result = JSON.parse(text);
    console.log('✅ JSON parsed successfully on first attempt');
    return result;
  } catch (e) {
    console.log('❌ Initial JSON parse failed, trying to clean...', e.message);
  }
  
  // Try cleaning the text (handles reasoning text)
  try {
    const cleaned = cleanJsonString(text);
    console.log(`🧹 Cleaned text from ${text.length} to ${cleaned.length} characters`);
    const result = JSON.parse(cleaned);
    console.log('✅ JSON parsed successfully after cleaning');
    return result;
  } catch (e) {
    console.log('❌ Cleaned JSON parse failed...', e.message);
  }
  
  // Try fixing common JSON issues
  try {
    let fixed = cleanJsonString(text);
    
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
    
    console.log(`🔧 Applied JSON fixes, final length: ${fixed.length}`);
    const result = JSON.parse(fixed);
    console.log('✅ JSON parsed successfully after fixes');
    return result;
  } catch (e) {
    console.log('❌ Fixed JSON parse failed...', e.message);
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
  if (!apiKeys.enable_gemini_holidays) {
    return [];
  }
  
  const geminiKey = apiKeys.gemini_api_key || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) {
    console.log('Gemini holiday fetching enabled but no API key available');
    return [];
  }
  
  try {
    // Initialize Gemini for holiday fetching
    console.log('Initializing Gemini for holiday fetching...');
    const tempGenAI = new GoogleGenerativeAI(geminiKey);
    const tempModel = tempGenAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
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
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: 0.3,
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
          'enhanced' // special provider for enhanced search
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

// Gemini-powered holiday and festival fetching endpoint
app.post('/api/holidays-gemini', async (req, res) => {
  try{
    const { location, date } = req.body;
    if(!location || !date){ 
      return res.status(400).json({ ok:false, error:'Missing location or date' }); 
    }

    console.log('Gemini holiday fetch request for:', location, date);
    
    // Check if Gemini holiday fetching is enabled
    if (!apiKeys.enable_gemini_holidays) {
      return res.json({ ok: true, holidays: [], message: 'Gemini holiday fetching is disabled' });
    }
    
    const holidays = await fetchHolidaysWithGemini(location, date);
    
    res.json({ ok: true, holidays, total: holidays.length });
  } catch (err){
    console.error('Gemini holiday fetch error:', err);
    res.status(500).json({ ok:false, error: err.message || 'Gemini holiday fetch failed' });
  }
});

// Settings endpoints for API key management
app.get('/api/settings', (req, res) => {
  try {
    // Return configuration status without exposing actual keys
    const settings = {
      gemini_configured: !!apiKeys.gemini_api_key,
      openrouter_configured: !!apiKeys.openrouter_api_key,
      google_search_configured: !!(apiKeys.google_search_api_key && apiKeys.google_search_engine_id),
      openwebninja_configured: !!apiKeys.openwebninja_api_key,
      ticketmaster_configured: !!apiKeys.ticketmaster_api_key,
      ai_provider: apiKeys.ai_provider || 'gemini',
      openrouter_model: apiKeys.openrouter_model || 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      enable_gemini_holidays: !!apiKeys.enable_gemini_holidays,
      max_activities: apiKeys.max_activities || 20,
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
    }
    
    // Return updated configuration status
    const settings = {
      gemini_configured: !!apiKeys.gemini_api_key,
      openrouter_configured: !!apiKeys.openrouter_api_key,
      google_search_configured: !!(apiKeys.google_search_api_key && apiKeys.google_search_engine_id),
      openwebninja_configured: !!apiKeys.openwebninja_api_key,
      ticketmaster_configured: !!apiKeys.ticketmaster_api_key,
      ai_provider: apiKeys.ai_provider || 'gemini',
      openrouter_model: apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free',
      enable_gemini_holidays: !!apiKeys.enable_gemini_holidays,
      max_activities: apiKeys.max_activities || 20,
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
      
      const response = await openAI.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that responds only in valid JSON format. You must return ONLY a single JSON object matching the provided schema in your response content. Do not include any explanatory text, reasoning, or commentary - just the JSON object starting with { and ending with }.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 8000, // Increased for R1 models that need reasoning + content tokens
      });
      
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
      
      // Try content field first, then reasoning field as fallback for R1 models
      let text = responseData.content || '';
      
      if (!text || text.trim() === '') {
        console.log('⚠️ Content field is empty, checking reasoning field for R1 models...');
        
        // For R1 models, sometimes the JSON is in the reasoning field
        if (responseData.reasoning) {
          console.log('Reasoning field length:', responseData.reasoning.length);
          
          // Try to extract JSON from reasoning field
          const jsonMatch = responseData.reasoning.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log('🔧 Found potential JSON in reasoning field');
            text = jsonMatch[0];
          } else {
            console.log('❌ No JSON found in reasoning field either');
            throw new Error('No JSON found in either content or reasoning field');
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
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: 0.1,
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

async function callModelWithRetry(ctx, allowedCats, maxRetries = 3, maxActivities = null, abortSignal = null) {
  let webSearchResults = null;
  
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

  // Perform enhanced web search for additional context
  try {
    console.log('Performing enhanced web search for current events and family activities...');
    const searchResults = await searchWeb('family activities kids', ctx.location, ctx.date);
    webSearchResults = extractSearchInsights(searchResults, ctx.location);
    console.log(`Found ${searchResults.length} web search results including event data`);
  } catch (error) {
    console.log('Web search failed, continuing without web insights:', error.message);
  }

  // Check for cancellation before AI call
  if (abortSignal?.aborted) {
    throw new Error('Request was cancelled');
  }

  const prompt = buildUserMessage(enrichedCtx, allowedCats, webSearchResults, maxActivities);
  
  // Determine which AI provider to use
  const provider = apiKeys.ai_provider || 'gemini';
  console.log(`Using AI provider: ${provider}`);
  
  let json;
  try {
    if (provider === 'openrouter') {
      json = await callOpenRouterModel(prompt, maxRetries, abortSignal);
    } else {
      json = await callGeminiModel(prompt, maxRetries, abortSignal);
    }
  } catch (error) {
    // Check if it was a cancellation
    if (abortSignal?.aborted || error.message.includes('cancelled')) {
      throw error;
    }
    
    // If selected provider fails, try the other one as fallback
    console.log(`Primary provider (${provider}) failed, trying fallback...`);
    try {
      if (provider === 'openrouter') {
        json = await callGeminiModel(prompt, maxRetries, abortSignal);
        console.log('Fallback to Gemini successful');
      } else {
        json = await callOpenRouterModel(prompt, maxRetries, abortSignal);
        console.log('Fallback to OpenRouter successful');
      }
    } catch (fallbackError) {
      // Check if fallback was cancelled
      if (abortSignal?.aborted || fallbackError.message.includes('cancelled')) {
        throw fallbackError;
      }
      throw new Error(`Both AI providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
    }
  }
  
  // Validate response
  if (!json.activities || !Array.isArray(json.activities)) {
    throw new Error('Response missing activities array');
  }
  
  if (json.activities.length === 0) {
    throw new Error('No activities returned');
  }
  
  // Add web search sources to the result
  if (webSearchResults && webSearchResults.sources) {
    json.web_sources = webSearchResults.sources;
  }
  
  console.log(`✅ Final result: ${json.activities.length} activities generated by AI`);
  console.log('🔍 Sample activity titles:', json.activities.slice(0, 3).map(a => a.title).join(', '));
  return json;
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
    const maxActivities = req.body?.maxActivities || null;
    
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

    // Check for cached results first (only if using Neo4j)
    let json = null;
    if (isNeo4jConnected && dataManager instanceof Neo4jDataManager) {
      try {
        const provider = apiKeys.ai_provider || 'gemini';
        const modelName = provider === 'openrouter' 
          ? `openrouter-${apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'}`
          : provider;
        const cacheKey = `${allowed}-${maxActivities || 'default'}`;
        const cachedResults = await dataManager.getCachedSearchResults(
          ctx.location, 
          ctx.date, 
          ctx.duration_hours, 
          ctx.ages, 
          cacheKey,
          ctx.extra_instructions || '',
          modelName
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
      
      // Cache the results (only if using Neo4j)
      if (isNeo4jConnected && dataManager instanceof Neo4jDataManager && json) {
        try {
          const provider = apiKeys.ai_provider || 'gemini';
          const modelName = provider === 'openrouter' 
            ? `openrouter-${apiKeys.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'}`
            : provider;
          const cacheKey = `${allowed}-${maxActivities || 'default'}`;
          await dataManager.cacheSearchResults(
            ctx.location, 
            ctx.date, 
            ctx.duration_hours, 
            ctx.ages, 
            cacheKey, 
            json,
            ctx.extra_instructions || '',
            modelName
          );
        } catch (cacheError) {
          console.log('Failed to cache search results (non-blocking):', cacheError.message);
        }
      }
    }
    
    // Save successful search to history (isolated per request)
    try {
      await dataManager.addToSearchHistory(ctx);
    } catch (historyError) {
      console.log('Failed to save search history (non-blocking):', historyError.message);
    }
    
    res.json({ ok:true, data: json });
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
    message: 'FunFindAI API is running',
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
app.get('/', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, this should be handled by the catch-all handler below
    return;
  }
  console.log('🏠 Root endpoint called (development)');
  res.json({
    name: 'FunFindAI API',
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
    
    // Check if index.html exists before serving
    if (fs.existsSync(indexPath)) {
      console.log(`🔄 Serving index.html for route: ${req.path}`);
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html not found in dist directory');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on http://0.0.0.0:' + PORT);
  console.log('🚀 Kids Activities Finder server started successfully');
  console.log('📊 Data storage:', isNeo4jConnected ? 'Neo4j AuraDB' : 'Local files');
});
