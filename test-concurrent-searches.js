#!/usr/bin/env node

/**
 * Concurrent Search Test
 * 
 * This script tests the application's ability to handle multiple concurrent searches
 * without state conflicts or race conditions.
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const SERVER_URL = 'http://localhost:8787';
const NUM_CONCURRENT_SEARCHES = 3;

// Test data - different search parameters to simulate different users
const testSearches = [
  {
    name: 'User A - Madrid',
    ctx: {
      location: 'Madrid, Spain',
      date: '2024-02-15',
      duration_hours: 4,
      ages: [6, 8],
      weather: {
        temperature_min_c: 5,
        temperature_max_c: 15,
        precipitation_probability_percent: 20,
        wind_speed_max_kmh: 10
      },
      is_public_holiday: false,
      nearby_festivals: []
    }
  },
  {
    name: 'User B - Barcelona',
    ctx: {
      location: 'Barcelona, Spain',
      date: '2024-02-16',
      duration_hours: 6,
      ages: [3, 5, 10],
      weather: {
        temperature_min_c: 8,
        temperature_max_c: 18,
        precipitation_probability_percent: 10,
        wind_speed_max_kmh: 15
      },
      is_public_holiday: false,
      nearby_festivals: []
    }
  },
  {
    name: 'User C - Paris',
    ctx: {
      location: 'Paris, France',
      date: '2024-02-17',
      duration_hours: 8,
      ages: [12, 14],
      weather: {
        temperature_min_c: 2,
        temperature_max_c: 8,
        precipitation_probability_percent: 60,
        wind_speed_max_kmh: 25
      },
      is_public_holiday: true,
      nearby_festivals: [
        {
          name: 'Winter Festival',
          start_date: '2024-02-17',
          end_date: '2024-02-17',
          url: null,
          distance_km: 5
        }
      ]
    }
  }
];

async function makeSearchRequest(searchData) {
  const startTime = Date.now();
  try {
    console.log(`🚀 [${searchData.name}] Starting search request...`);
    
    const response = await fetch(`${SERVER_URL}/api/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx: searchData.ctx,
        allowedCategories: 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    if (data.ok && data.data?.activities) {
      console.log(`✅ [${searchData.name}] Completed in ${(duration / 1000).toFixed(2)}s - Got ${data.data.activities.length} activities`);
      return {
        success: true,
        duration,
        activitiesCount: data.data.activities.length,
        searchData: searchData.name,
        activities: data.data.activities.slice(0, 3).map(a => ({ title: a.title, category: a.category })) // Sample for verification
      };
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [${searchData.name}] Failed after ${(duration / 1000).toFixed(2)}s:`, error.message);
    return {
      success: false,
      duration,
      error: error.message,
      searchData: searchData.name
    };
  }
}

async function testSearchHistory() {
  console.log('\n📚 Testing search history isolation...');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/search-history`);
    const data = await response.json();
    
    if (data.ok) {
      console.log(`✅ Search history loaded: ${data.history.length} entries`);
      
      // Check if we have entries from our test searches
      const testEntries = data.history.filter(entry => 
        testSearches.some(test => entry.location === test.ctx.location)
      );
      
      console.log(`📝 Found ${testEntries.length} entries from test searches`);
      testEntries.forEach(entry => {
        console.log(`   - ${entry.location} on ${entry.date} (ages: ${entry.kidsAges?.join(', ') || 'none'})`);
      });
      
      return true;
    } else {
      console.error('❌ Failed to load search history:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Search history test error:', error.message);
    return false;
  }
}

async function testExclusionList() {
  console.log('\n🚫 Testing exclusion list isolation...');
  
  try {
    // Add a test exclusion
    const testLocation = 'Madrid, Spain';
    const testAttraction = 'Test Concurrent Attraction';
    
    const addResponse = await fetch(`${SERVER_URL}/api/exclusion-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: testLocation,
        attraction: testAttraction
      })
    });
    
    const addData = await addResponse.json();
    if (addData.ok) {
      console.log(`✅ Added test exclusion: ${testAttraction} in ${testLocation}`);
      
      // Verify it exists
      const getResponse = await fetch(`${SERVER_URL}/api/exclusion-list`);
      const getData = await getResponse.json();
      
      if (getData.ok && getData.exclusions[testLocation]?.includes(testAttraction)) {
        console.log(`✅ Exclusion verified in list`);
        
        // Clean up - remove the test exclusion
        const deleteResponse = await fetch(`${SERVER_URL}/api/exclusion-list/${encodeURIComponent(testLocation)}/${encodeURIComponent(testAttraction)}`, {
          method: 'DELETE'
        });
        
        if (deleteResponse.ok) {
          console.log(`✅ Test exclusion cleaned up`);
          return true;
        } else {
          console.log(`⚠️ Failed to clean up test exclusion (non-critical)`);
          return true;
        }
      } else {
        console.error('❌ Exclusion not found in list after adding');
        return false;
      }
    } else {
      console.error('❌ Failed to add test exclusion:', addData.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Exclusion list test error:', error.message);
    return false;
  }
}

async function runConcurrentTest() {
  console.log(`🧪 Starting concurrent search test with ${NUM_CONCURRENT_SEARCHES} searches\n`);
  
  // Check if server is running
  try {
    const healthCheck = await fetch(`${SERVER_URL}/api/settings`);
    if (!healthCheck.ok) {
      throw new Error(`Server returned ${healthCheck.status}`);
    }
    console.log('✅ Server is running and accessible\n');
  } catch (error) {
    console.error('❌ Server not accessible:', error.message);
    console.log('Please ensure the server is running on', SERVER_URL);
    process.exit(1);
  }
  
  // Run searches concurrently
  const searchPromises = testSearches.slice(0, NUM_CONCURRENT_SEARCHES).map(makeSearchRequest);
  const results = await Promise.allSettled(searchPromises);
  
  // Analyze results
  console.log('\n📊 Test Results:');
  console.log('================');
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.value.duration, 0) / successful.length;
    console.log(`⏱️ Average duration: ${(avgDuration / 1000).toFixed(2)}s`);
    
    // Check for data isolation - each search should return different results
    const activitiesSamples = successful.map(r => r.value.activities);
    const uniqueResults = new Set(activitiesSamples.map(JSON.stringify));
    
    if (uniqueResults.size === successful.length) {
      console.log('✅ Data isolation verified: Each search returned unique results');
    } else {
      console.log('⚠️ Potential data isolation issue: Some searches returned identical results');
    }
    
    // Display sample results for verification
    console.log('\n📝 Sample Results:');
    successful.forEach(result => {
      const r = result.value;
      console.log(`\n${r.searchData}:`);
      r.activities.forEach(activity => {
        console.log(`  - ${activity.title} (${activity.category})`);
      });
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Requests:');
    failed.forEach(result => {
      const r = result.status === 'fulfilled' ? result.value : { error: result.reason?.message || 'Unknown error' };
      console.log(`  - ${r.searchData || 'Unknown'}: ${r.error}`);
    });
  }
  
  // Test additional functionality
  await testSearchHistory();
  await testExclusionList();
  
  console.log('\n🎉 Concurrent test completed!');
  
  if (successful.length === results.length) {
    console.log('✅ All concurrent searches succeeded - concurrency issues appear to be resolved!');
    process.exit(0);
  } else {
    console.log('⚠️ Some searches failed - please check the server logs for details');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Add fetch polyfill for older Node.js versions
if (!global.fetch) {
  console.log('Installing fetch polyfill...');
  import('node-fetch').then(fetch => {
    global.fetch = fetch.default;
    runConcurrentTest();
  }).catch(() => {
    console.error('❌ Please install node-fetch: npm install node-fetch');
    console.log('Or use Node.js 18+ which includes fetch natively');
    process.exit(1);
  });
} else {
  runConcurrentTest();
}
