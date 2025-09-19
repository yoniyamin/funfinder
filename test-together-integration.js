// Test Together.ai JSON mode integration
const https = require('https');
const http = require('http');

function makeHttpRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'localhost',
      port: 8787,
      path: '/api/activities',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseData));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function testTogetherIntegration() {
  console.log('🧪 Testing Together.ai JSON mode integration...');
  
  const testPayload = {
    location: 'New York',
    age: '8',
    interests: ['art', 'science'],
    apiProvider: 'together',
    model: 'meta-llama/Llama-3.2-3B-Instruct-Turbo'
  };

  try {
    console.log('📤 Sending test request to http://localhost:8787/api/activities');
    console.log('📋 Test payload:', JSON.stringify(testPayload, null, 2));
    
    const startTime = Date.now();
    const result = await makeHttpRequest(testPayload);
    const duration = Date.now() - startTime;
    console.log(`⏱️  Request completed in ${duration}ms`);
    console.log('✅ Response received successfully');
    console.log('📊 Response structure:');
    console.log(`   - Activities count: ${result.activities?.length || 0}`);
    console.log(`   - AI Provider: ${result.ai_provider || 'unknown'}`);
    console.log(`   - AI Model: ${result.ai_model || 'unknown'}`);
    console.log(`   - Query location: ${result.query?.location || 'unknown'}`);
    console.log(`   - Has web sources: ${result.web_sources?.length > 0 ? 'Yes' : 'No'}`);
    
    // Check for parsing errors
    if (result.activities && result.activities.length > 0) {
      console.log('🔍 Validating first activity structure:');
      const firstActivity = result.activities[0];
      const requiredFields = ['title', 'category', 'description', 'suitable_ages', 'duration_hours'];
      const missingFields = requiredFields.filter(field => !firstActivity[field]);
      
      if (missingFields.length === 0) {
        console.log('✅ All required fields present');
        console.log('📝 Sample activity:', {
          title: firstActivity.title,
          category: firstActivity.category,
          duration_hours: firstActivity.duration_hours,
          weather_fit: firstActivity.weather_fit
        });
      } else {
        console.log('❌ Missing required fields:', missingFields);
      }
    } else {
      console.log('❌ No activities in response');
    }

    // Test for common Llama parsing issues
    console.log('🔍 Checking for previous parsing issues:');
    const allActivities = result.activities || [];
    let hasParsingIssues = false;
    
    allActivities.forEach((activity, index) => {
      // Check for malformed weather_fit values
      if (activity.weather_fit && !['excellent', 'good', 'ok', 'poor'].includes(activity.weather_fit)) {
        console.log(`❌ Activity ${index + 1}: Invalid weather_fit value: ${activity.weather_fit}`);
        hasParsingIssues = true;
      }
      
      // Check for malformed boolean values
      if (activity.free !== undefined && typeof activity.free !== 'boolean') {
        console.log(`❌ Activity ${index + 1}: Invalid free value type: ${typeof activity.free} (${activity.free})`);
        hasParsingIssues = true;
      }
      
      // Check for empty required fields
      if (!activity.title || !activity.description) {
        console.log(`❌ Activity ${index + 1}: Missing title or description`);
        hasParsingIssues = true;
      }
    });
    
    if (!hasParsingIssues) {
      console.log('✅ No parsing issues detected!');
    }
    
    console.log('\n🎯 Together.ai JSON mode test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure the server is running on port 8787');
    }
  }
}

// Run the test
testTogetherIntegration();
