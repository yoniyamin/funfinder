# Environment Variables Setup

## Required Environment Variables

To use Neo4j AuraDB integration, you need to create a `.env` file in the root directory with the following variables:

### Neo4j AuraDB Configuration (Required)
```bash
# Your Neo4j AuraDB credentials
NEO4J_URI=neo4j+s://your-database-id.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-database-password

# Database name (optional, defaults to 'neo4j')
NEO4J_DATABASE=neo4j
```

### DEPRECATED: MongoDB Configuration 
⚠️ **Note: This project has migrated from MongoDB to Neo4j AuraDB**
The following MongoDB configuration is no longer used:
```bash
# DEPRECATED - MongoDB Atlas connection string
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority&appName=yourapp
# MONGODB_DB_NAME=funfinder
```

### AI Provider API Keys (At least one required)
```bash
GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### External API Keys (Optional)
```bash
GOOGLE_SEARCH_API_KEY=your_google_search_api_key
GOOGLE_SEARCH_ENGINE_ID=your_google_search_engine_id
OPENWEBNINJA_API_KEY=your_openwebninja_api_key
TICKETMASTER_API_KEY=your_ticketmaster_api_key
```

### Server Configuration (Optional)
```bash
PORT=8787
```

## Setup Instructions

1. Create a `.env` file in the root directory of your project
2. Copy the environment variables above and fill in your actual values
3. Make sure `.env` is in your `.gitignore` file (for security)
4. Restart your server to load the new environment variables

## Security Notes

- Never commit your `.env` file to version control
- Keep your Neo4j credentials secure
- Use environment variables for all sensitive configuration data
- The app will fall back to local file storage if Neo4j environment variables are not set

### Advanced Configuration (Optional)

```bash
# Use environment variable for encryption key instead of Neo4j/file storage
ENCRYPTION_KEY=your_64_character_hex_string_here
```

## What Gets Stored in Neo4j AuraDB

When Neo4j AuraDB is configured, the following data is stored in the cloud as a graph database:

### Node Types Created:
- **`SearchHistory`** - Your search parameters and timestamps (last 20 searches)
- **`Location`** - Unique locations with relationships to excluded attractions
- **`Attraction`** - Excluded attractions linked to locations
- **`SearchCache`** - Cached search results (last 20, no expiration - repeats return instantly)
- **`SystemConfig`** - Application configuration including:
  - Master encryption key for securing API keys
  - API configuration (encrypted Gemini, OpenRouter, Google Search keys, etc.)

### Master Key Storage:
The encryption key used to secure your API keys is now stored in Neo4j for seamless access across devices and environments. The priority order is:
1. `ENCRYPTION_KEY` environment variable (highest priority)
2. Master key from Neo4j (if connected)
3. Master key from local `.master-key` file (fallback)
4. Generated temporary key (if all else fails)

## Testing Your Setup

Run the development server and check the console output:

### Neo4j Status:
- ✅ "✅ Using Neo4j AuraDB for data storage" = Neo4j is working perfectly
- ⚠️ "❌ Neo4j connection failed, falling back to file-based storage" = Check your environment variables

### Encryption Status:
- ✅ "🔑 Loaded master key from Neo4j" = Master key successfully retrieved from cloud
- ✅ "🔑 Found existing master key in local file" = Using local backup key
- ✅ "🔄 Migrated existing master key from file to Neo4j" = Local key moved to cloud
- ✅ "🆕 Generated new master key" = Created new encryption key

### Data Migration:
- ✅ "💾 Saved new master key to Neo4j" = Key stored in cloud
- ✅ "💾 Saved new master key to local file (backup)" = Local backup created
- ✅ "🔄 Migrated API configuration from file to Neo4j" = API keys moved to cloud
- ✅ "☁️ API keys loaded from Neo4j" = API configuration retrieved from cloud
- ✅ "☁️ API keys saved to Neo4j" = API configuration updated in cloud

## Performance Improvements

### Smart Search Caching:
- **No expiration**: Search results are cached indefinitely until manually cleared
- **Instant repeats**: Identical searches return cached results immediately
- **LRU eviction**: Least recently used results are removed when cache exceeds 20 entries
- **Access tracking**: Cache tracks when results were last accessed for optimal cleanup
