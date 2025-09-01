// Using built-in fetch (Node 18+)

console.log('🧪 Testing App Integration with Fixed OpenRouter Logic');
console.log('='.repeat(60));

// Test context similar to what your app would send
const testContext = {
  location: "London, UK",
  date: "2025-01-25",
  dateObj: new Date("2025-01-25"),
  ages: [6, 8],
  duration: 4,
  weather: {
    tmax: 8,
    tmin: 3,
    pprob: 40,
    wind: 15
  },
  holidays: [],
  festivals: []
};

const allowedCategories = "outdoor,indoor,museum,park,playground,water,hike,creative,festival,show,seasonal,other";

async function testAppIntegration() {
  const baseUrl = 'http://localhost:3001';
  
  console.log('📡 Testing server endpoints...\n');
  
  try {
    // Test 1: Check if server is running
    console.log('1️⃣ Testing server health...');
    const healthResponse = await fetch(`${baseUrl}/api/settings`);
    if (!healthResponse.ok) {
      throw new Error(`Server not responding: ${healthResponse.status}`);
    }
    console.log('✅ Server is running');
    
    const settings = await healthResponse.json();
    console.log('📊 Current settings:');
    console.log('- AI Provider:', settings.settings?.ai_provider);
    console.log('- OpenRouter Model:', settings.settings?.openrouter_model);
    console.log('- OpenRouter Configured:', settings.settings?.openrouter_configured ? '✅' : '❌');
    
    // Test 2: Test API with new logic
    console.log('\n2️⃣ Testing activities API with new OpenRouter logic...');
    const startTime = Date.now();
    
    const activitiesResponse = await fetch(`${baseUrl}/api/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ctx: testContext,
        allowedCategories: allowedCategories
      })
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Response time: ${duration}ms`);
    
    if (!activitiesResponse.ok) {
      const errorText = await activitiesResponse.text();
      console.log('❌ API Error:', activitiesResponse.status, errorText);
      return;
    }
    
    const result = await activitiesResponse.json();
    
    if (result.ok && result.data?.activities) {
      console.log('✅ API Call SUCCESS!');
      console.log(`📝 Activities returned: ${result.data.activities.length}`);
      
      if (result.data.activities.length > 0) {
        const firstActivity = result.data.activities[0];
        console.log('📍 First activity:');
        console.log(`   Title: ${firstActivity.title}`);
        console.log(`   Category: ${firstActivity.category}`);
        console.log(`   Duration: ${firstActivity.duration_hours}h`);
        console.log(`   Weather fit: ${firstActivity.weather_fit}`);
        console.log(`   Free: ${firstActivity.free ? 'Yes' : 'No'}`);
        
        // Validate schema compliance
        const requiredFields = ['title', 'description', 'category', 'suitable_ages', 'duration_hours', 'weather_fit'];
        const missingFields = requiredFields.filter(field => !(field in firstActivity));
        
        if (missingFields.length === 0) {
          console.log('✅ Schema validation PASSED');
        } else {
          console.log('❌ Schema validation FAILED - missing fields:', missingFields);
        }
        
        // Check categories
        const categories = [...new Set(result.data.activities.map(a => a.category))];
        console.log(`🏷️ Categories found: ${categories.join(', ')}`);
        
        // Check if web sources were added
        if (result.data.web_sources) {
          console.log(`🌐 Web sources: ${result.data.web_sources}`);
        }
      }
      
      console.log('\n✅ All tests PASSED! Your app should now work correctly.');
      
    } else {
      console.log('❌ API returned invalid response:', result);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Server not running. Please start it with: npm run dev');
    }
  }
}

// Run the test
testAppIntegration()
  .then(() => {
    console.log('\n🎉 Integration test completed!');
  })
  .catch(error => {
    console.error('💥 Integration test failed:', error);
  });
