# 🚀 API Setup Guide - Google Custom Search & Eventbrite Integration

This guide will help you set up the Google Custom Search API and Eventbrite API to enhance your Kids Activities Finder with real-time data.

## 🎯 Overview

With these APIs configured, your app will:
- ✅ Get **real-time search results** similar to Google's AI Overview
- ✅ Include **current events** from Eventbrite
- ✅ Provide **location-specific recommendations** with current data
- ✅ Offer **enhanced activity suggestions** beyond AI training data

## 📋 Prerequisites

- A Google Account
- An Eventbrite Account (for event data)
- Credit card for Google Cloud (minimal costs - first 100 searches/day free)

---

## 🔍 Google Custom Search API Setup

### Step 1: Enable the API

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select a Project**
   - Click the project dropdown (top left)
   - Either create a new project or select an existing one

3. **Enable Custom Search API**
   - Go to: https://console.cloud.google.com/apis/library/customsearch.googleapis.com
   - Click **"Enable"**

### Step 2: Create API Key

1. **Go to Credentials**
   - Navigate to: https://console.cloud.google.com/apis/credentials
   - Click **"+ Create Credentials"** → **"API Key"**

2. **Secure Your API Key (Recommended)**
   - Click on your new API key to edit it
   - Under "API restrictions", select "Restrict key"
   - Choose "Custom Search API" from the list
   - Save your changes

3. **Copy Your API Key**
   - Copy the API key (starts with `AIza...`)
   - Keep this secure - you'll need it for the app

### Step 3: Create Custom Search Engine

1. **Go to Google Custom Search**
   - Visit: https://cse.google.com/
   - Click **"Add"** to create a new search engine

2. **Configure Search Engine**
   - **Sites to search**: Enter `*` (asterisk) to search the entire web
   - **Language**: Select your preferred language
   - **Name**: Give it a descriptive name like "Kids Activities Search"
   - Click **"Create"**

3. **Get Search Engine ID**
   - After creation, click **"Control Panel"**
   - Find **"Search engine ID"** in the Basics tab
   - Copy this ID - you'll need it for the app

### Step 4: Test Your Setup

You can test your API with this URL (replace with your values):
```
https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_SEARCH_ENGINE_ID&q=Madrid+family+activities
```

---

## 🎪 Eventbrite API Setup

### Step 1: Create Eventbrite Account

1. **Sign up or Log in**
   - Visit: https://www.eventbrite.com/
   - Create an account or sign in

### Step 2: Create an App

1. **Go to API Portal**
   - Visit: https://www.eventbrite.com/platform/api/
   - Click **"Create an App"**

2. **Fill App Details**
   - **App Name**: "Kids Activities Finder"
   - **Description**: "Finding family-friendly events and activities"
   - **App URL**: You can use `http://localhost:8787` for development
   - Agree to terms and create

### Step 3: Get Your Token

1. **Access Your App**
   - Go to your app dashboard
   - Find **"Personal OAuth Token"**
   - Copy this token - it starts with your account info

2. **Token Permissions**
   - The personal token automatically has read access to public events
   - This is sufficient for searching family events

---

## ⚙️ Configure the App

### Method 1: Using the Settings UI (Recommended)

1. **Start the app**
   ```bash
   npm run dev
   ```

2. **Open Settings**
   - Click the **⚙️ Settings** button in the top-right
   - Enter your API credentials:
     - **Google Search API Key**: Your `AIza...` key
     - **Google Search Engine ID**: Your custom search engine ID
     - **Eventbrite API Key**: Your personal OAuth token

3. **Test the APIs**
   - Click **"🔧 Test API Connections"**
   - Verify both APIs show as working

### Method 2: Environment Variables

Create a `.env` file in your project root:

```bash
# Google Custom Search
GOOGLE_SEARCH_API_KEY=AIza...your_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Eventbrite
EVENTBRITE_API_KEY=your_personal_oauth_token

# Encryption key for secure storage (optional)
ENCRYPTION_KEY=your_random_32_char_encryption_key
```

---

## 🧪 Testing Your Setup

### Quick Test

1. **Start the app**: `npm run dev`
2. **Search for activities** in any location
3. **Look for indicators**:
   - 🌐 "Enhanced with web data" badge on results
   - "Enhanced with Current Web Intelligence" section
   - Google Search API results in web sources
   - Eventbrite events (if available in the area)

### Manual API Testing

**Test Google Search:**
```bash
curl "https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_ENGINE_ID&q=Madrid+family+activities"
```

**Test Eventbrite:**
```bash
curl "https://www.eventbriteapi.com/v3/events/search/?q=family&location.address=Madrid&token=YOUR_TOKEN"
```

---

## 💰 Costs & Usage

### Google Custom Search API
- **Free Tier**: 100 searches per day
- **Paid**: $5 per 1,000 additional queries
- **Usage**: Each activity search uses 1 query
- **Monitoring**: Check usage at [Google Cloud Console](https://console.cloud.google.com/apis/api/customsearch.googleapis.com/quotas)

### Eventbrite API
- **Free**: Personal OAuth tokens have generous limits
- **Rate Limits**: 1,000 requests per hour
- **Usage**: Each activity search uses 1 request

### Cost Optimization Tips
- Results are cached for 1 hour to reduce API calls
- Failed requests don't consume quota
- App works with fallback data if APIs are unavailable

---

## 🔒 Security Best Practices

### API Key Security
- ✅ **Never expose API keys** in frontend code
- ✅ **Use environment variables** or the encrypted storage
- ✅ **Restrict API keys** to specific APIs in Google Console
- ✅ **Regenerate keys** if they're ever compromised

### App Security
- API keys are encrypted when stored locally
- Keys are never sent to the frontend
- All API calls are made server-side

---

## 🐛 Troubleshooting

### Common Issues

**❌ "Google Search API not configured"**
- Check that both API key and Search Engine ID are set
- Verify the API key has Custom Search API enabled
- Test the API manually with curl

**❌ "Google Search API error: 403"**
- API key restrictions may be too restrictive
- Check if Custom Search API is enabled for your project
- Verify you haven't exceeded the daily quota

**❌ "Eventbrite API error: 401"**
- Check that your personal OAuth token is correct
- Ensure the token isn't expired
- Verify the token has read permissions

**❌ No search results appear**
- Check browser console for error messages
- Verify APIs are working in the Settings test
- Try different search locations

### Debug Mode

Enable debug logging by checking the browser console and server logs:
```bash
# Server will show API call logs
npm run dev:server
```

### Getting Help

1. **Check the Settings page** - Use the "Test API Connections" feature
2. **Review server logs** - Look for API error messages
3. **Verify API quotas** - Check Google Cloud Console usage
4. **Test APIs manually** - Use curl commands above

---

## 🎉 Success! 

Once configured, you'll see:
- ✅ "Enhanced with web data" indicators
- ✅ Current event information in results
- ✅ Real-time search data from Google
- ✅ Eventbrite events for family activities
- ✅ More accurate, location-specific recommendations

Your Kids Activities Finder now has access to the same type of current, comprehensive information that powers Google's AI Overview!

---

## 📚 Additional Resources

- [Google Custom Search API Documentation](https://developers.google.com/custom-search/v1/introduction)
- [Eventbrite API Documentation](https://www.eventbrite.com/platform/api/)
- [Google Cloud Console](https://console.cloud.google.com/)
- [API Rate Limits and Quotas](https://developers.google.com/custom-search/v1/overview#pricing)

Need help? The Settings page includes built-in API testing and detailed error messages to help diagnose any issues.

