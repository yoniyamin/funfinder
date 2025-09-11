# FunFindAI - Kids Activities Finder

A smart family activities planner powered by AI that helps parents find engaging, age-appropriate activities for their children based on location, weather, and preferences.

## ✨ Features

- **AI-Powered Recommendations** - Uses Gemini AI or OpenRouter models to generate personalized activity suggestions
- **Weather-Aware Planning** - Considers current weather conditions for activity recommendations
- **Age-Appropriate Filtering** - Tailors activities to specific age groups
- **Local Intelligence** - Integrates real-time local events and festival information
- **Smart Caching** - Caches results for faster subsequent searches
- **Exclusion Lists** - Remember activities you don't want to see again
- **Search History** - Keep track of your previous searches
- **Multi-Provider Support** - Works with multiple AI providers for reliability

## 🚀 Quick Start

### Development Mode
```bash
npm install
npm run dev
```
Access at: **http://localhost:5173**

### Production Mode
```bash
npm run build
npm run start
```
Access at: **http://localhost:8787**

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- At least one AI provider API key (Gemini or OpenRouter)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd kef
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** (see [Environment Setup](#environment-setup))

4. **Run in development mode**
   ```bash
   npm run dev
   ```

## 🌍 Environment Setup

### Required Environment Variables

Create a `.env` file in the project root:

```env
# AI Provider Configuration (Choose at least one)
GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here

# OpenRouter Model Selection (optional)
OPENROUTER_MODEL=deepseek/deepseek-chat-v3.1:free
AI_PROVIDER=gemini  # or 'openrouter'

# Database Configuration (optional but recommended)
NEO4J_URI=neo4j+s://your-aura-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j

# MongoDB Configuration (alternative to Neo4j)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net
MONGODB_DB_NAME=funfinder

# Web Search APIs (optional but recommended)
GOOGLE_SEARCH_API_KEY=your_google_custom_search_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
OPENWEBNINJA_API_KEY=your_openwebninja_api_key

# Additional APIs (optional)
TICKETMASTER_API_KEY=your_ticketmaster_api_key

# Application Settings
MAX_ACTIVITIES=20
ENABLE_GEMINI_HOLIDAYS=true
NODE_ENV=production  # For production deployment
```

### Environment Variable Details

#### AI Providers (Required - choose at least one)

**Gemini AI (Google)**
- Get your API key: https://makersuite.google.com/app/apikey
- Free tier available with generous limits
- Best performance for family activity recommendations

**OpenRouter**
- Get your API key: https://openrouter.ai/
- Access to multiple models including free options
- Good fallback option

#### Database Storage (Optional but recommended)

**Neo4j AuraDB (Recommended)**
- Sign up: https://neo4j.com/cloud/aura/
- Free tier available
- Used for caching search results and storing configuration

**MongoDB Atlas (Alternative)**
- Sign up: https://www.mongodb.com/cloud/atlas
- Free tier available
- Alternative storage backend

#### Web Search APIs (Optional but enhances results)

**Google Custom Search API**
- Console: https://console.developers.google.com/
- Create a Custom Search Engine: https://cse.google.com/
- Provides real-time web search for current events

**OpenWeb Ninja**
- Sign up: https://rapidapi.com/openwebninja/api/
- Provides event search capabilities

## 🎯 API Configuration

The application provides a settings interface to configure API keys:

1. **Access Settings**: Navigate to the settings page in the app
2. **Add API Keys**: Enter your API keys for the services you want to use
3. **Test Connections**: Use the "Test APIs" feature to verify your keys work
4. **Choose AI Provider**: Select between Gemini and OpenRouter

### API Key Priority

1. **Settings UI** (highest priority) - Keys entered through the app interface
2. **Environment Variables** - Keys from .env file or system environment
3. **Fallback** - Application will try alternative providers if available

## 🔨 Development vs Production

### Development Mode (`npm run dev`)
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend**: http://localhost:8787 (Express server)
- **Hot Reload**: Enabled for frontend
- **Auto Restart**: Enabled for backend (nodemon)

### Production Mode (`npm run start`)
- **Everything**: http://localhost:8787 (Express serves static files + API)
- **Build Required**: Must run `npm run build` first
- **Environment**: Set `NODE_ENV=production`

## 📦 Available Scripts

```bash
# Development
npm run dev          # Start both frontend and backend in development mode
npm run dev:client   # Start only frontend dev server (port 5173)
npm run dev:server   # Start only backend dev server (port 8787)

# Production
npm run build        # Build frontend for production
npm run start        # Start production server (requires NODE_ENV=production)
npm run preview      # Preview production build locally

# Testing
npm run test         # Run tests
```

## 🚀 Deployment

### Koyeb (Recommended)

The project includes a `koyeb.yaml` configuration file:

```yaml
name: funfinder
services:
  web:
    ports:
      - port: 8787
    build:
      commands:
        - npm ci
        - npm run build
    run:
      cmd: ["node", "server/index.js"]
    env:
      NODE_ENV: production
```

**Deploy to Koyeb:**
1. Connect your GitHub repository to Koyeb
2. Add your environment variables in Koyeb dashboard
3. Deploy automatically on push to main branch

### Other Platforms

**Heroku**
```bash
# Add buildpack (if needed)
heroku buildpacks:set heroku/nodejs

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set GEMINI_API_KEY=your_key_here

# Deploy
git push heroku main
```

**Railway**
```bash
# Connect GitHub repo and add environment variables
# Railway will auto-detect Node.js and run build commands
```

**Vercel/Netlify**
- These platforms are optimized for static sites
- For full-stack deployment with API, use Koyeb, Heroku, or Railway

## 🗂️ Project Structure

```
kef/
├── server/
│   ├── index.js              # Express server and API routes
│   └── neo4j-data-manager.js # Neo4j database management
├── src/
│   ├── v2/                   # Main application (version 2)
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── SearchPage.tsx
│   │   │   └── ResultsPage.tsx
│   │   └── components/
│   ├── lib/
│   │   ├── api.ts            # API client functions
│   │   └── schema.ts         # TypeScript interfaces
│   └── styles.css            # Global styles
├── public/                   # Static assets
├── dist/                     # Production build output
├── package.json              # Dependencies and scripts
├── koyeb.yaml               # Deployment configuration
├── vite.config.ts           # Vite configuration
└── tailwind.config.js       # Tailwind CSS configuration
```

## 🔧 API Endpoints

### Activities
- `POST /api/activities` - Generate activity recommendations
- `POST /api/prompt` - Get the AI prompt for debugging

### Search & History
- `POST /api/search-enhanced` - Enhanced search with web results
- `GET /api/search-history` - Get search history
- `DELETE /api/search-history/:id` - Delete search history item

### Settings & Configuration
- `GET /api/settings` - Get current API configuration status
- `POST /api/settings` - Update API keys and settings
- `POST /api/test-apis` - Test API connections

### Exclusions
- `GET /api/exclusion-list` - Get excluded activities
- `POST /api/exclusion-list` - Add activity to exclusion list
- `DELETE /api/exclusion-list/:location/:attraction` - Remove exclusion

### Holidays & Events
- `POST /api/holidays-gemini` - Get holidays/festivals using Gemini
- `GET /api/test-neo4j` - Test Neo4j database connection

### Health & Monitoring
- `GET /health` - Comprehensive health check with system info
- `GET /healthz` - Simple health check (returns "OK")
- `GET /ping` - Simple ping endpoint (returns "pong")

## 🎨 UI Features

### Search Interface
- **Location Input**: Smart city search with autocomplete
- **Date Selection**: Calendar picker with date validation
- **Activity Duration**: Flexible time input (hours)
- **Ages**: Multi-select age range picker
- **Categories**: Filter by activity types
- **Extra Instructions**: Custom requirements

### Results Display
- **Activity Cards**: Detailed activity information
- **Weather Integration**: Weather-appropriate recommendations
- **Exclusion Options**: Hide activities you don't want
- **Booking Links**: Direct links to activity booking (when available)
- **Evidence Sources**: See why activities were recommended

### Settings Management
- **API Key Configuration**: Secure key management
- **Provider Selection**: Choose between AI providers
- **Connection Testing**: Verify API functionality
- **Storage Options**: Choose between Neo4j and local storage

## 🛠️ Troubleshooting

### Common Issues

**"Cannot GET /" Error**
- Ensure `NODE_ENV=production` is set
- Run `npm run build` before `npm run start`
- Check that static files exist in `dist/` directory

**API Key Errors**
- Verify API keys are correct and have proper permissions
- Check quota limits on your API providers
- Use the settings page to test connections

**Database Connection Issues**
- For Neo4j: Check URI, username, and password
- For MongoDB: Verify connection string and network access
- Application falls back to local file storage if databases unavailable

**Build Failures**
- Clear `node_modules` and run `npm install`
- Check Node.js version (requires 18+)
- Ensure all environment variables are properly set

**502 Bad Gateway on Deployment**
- Server must bind to `0.0.0.0` not `localhost` (✅ Fixed in latest version)
- Ensure `NODE_ENV=production` is set in deployment environment
- Check health endpoints: `/health`, `/healthz`, `/ping`
- Verify `dist/` directory exists and contains built files
- Check deployment logs for build errors

**Health Check Failures**
- Access `/health` endpoint to see detailed system status
- Verify database connections if using Neo4j/MongoDB
- Check API key configuration
- Ensure all environment variables are set

### Development Tips

**Hot Reload Not Working**
```bash
# Restart development server
npm run dev
```

**API Changes Not Reflected**
```bash
# Restart backend only
npm run dev:server
```

**Build Issues**
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** for powerful activity recommendations
- **OpenRouter** for providing access to multiple AI models
- **Neo4j** for graph database capabilities
- **Tailwind CSS** for beautiful, responsive design
- **React** and **Vite** for the modern frontend framework

---

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review the [API Setup Guide](API_SETUP_GUIDE.md) for detailed API configuration
3. Open an issue on GitHub with detailed error information

**Happy family time planning! 🎉**
