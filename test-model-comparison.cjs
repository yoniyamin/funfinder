const OpenAI = require('openai');

// Use your API key
const openrouterKey = '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';

console.log('🔬 Testing Different OpenRouter Models');
console.log('='.repeat(50));

const openAI = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: openrouterKey,
});

// Models to test (free ones only)
const modelsToTest = [
  {
    name: "DeepSeek V3.1 (New Default)",
    model: "deepseek/deepseek-v3.1:free",
    description: "Fast, reliable, new default"
  },
  {
    name: "DeepSeek R1 8B", 
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
    description: "Reasoning model with potential parsing issues"
  },
  {
    name: "Qwen 2.5 7B",
    model: "qwen/qwen-2.5-7b-instruct:free", 
    description: "Balanced performance"
  }
];

// Simple test prompt
const testPrompt = 'Return exactly this JSON: {"test": "success", "model_response": true}';

async function testModel(modelInfo) {
  console.log(`\n🤖 Testing ${modelInfo.name}`);
  console.log(`📋 Model: ${modelInfo.model}`);
  console.log(`💡 ${modelInfo.description}`);
  console.log('-'.repeat(40));
  
  const startTime = Date.now();
  
  try {
    const response = await openAI.chat.completions.create({
      model: modelInfo.model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that responds only in valid JSON format. Return exactly what the user requests.'
        },
        {
          role: 'user',
          content: testPrompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });
    
    const duration = Date.now() - startTime;
    const responseData = response.choices?.[0]?.message;
    
    console.log(`⏱️ Response time: ${duration}ms`);
    console.log(`📊 Tokens: ${response.usage?.total_tokens || 'unknown'}`);
    
    if (responseData) {
      // Check content field
      if (responseData.content && responseData.content.trim()) {
        try {
          const parsed = JSON.parse(responseData.content);
          console.log('✅ Content field: Valid JSON');
          console.log(`📄 Response: ${responseData.content}`);
          return { success: true, duration, model: modelInfo.model, source: 'content' };
        } catch (e) {
          console.log('❌ Content field: Invalid JSON');
        }
      } else {
        console.log('⚠️ Content field: Empty');
      }
      
      // Check reasoning field (for R1 models)
      if (responseData.reasoning) {
        console.log(`🧠 Reasoning field: ${responseData.reasoning.length} chars`);
        const jsonMatch = responseData.reasoning.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('✅ Reasoning field: Contains valid JSON');
            return { success: true, duration, model: modelInfo.model, source: 'reasoning' };
          } catch (e) {
            console.log('❌ Reasoning field: Invalid JSON');
          }
        }
      }
      
      console.log('❌ No valid JSON found');
      return { success: false, duration, model: modelInfo.model, error: 'No valid JSON' };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`💥 Request failed: ${error.message}`);
    return { success: false, duration, model: modelInfo.model, error: error.message };
  }
}

async function runModelComparison() {
  const results = [];
  
  for (const model of modelsToTest) {
    const result = await testModel(model);
    results.push({ ...result, name: model.name });
    
    // Wait a bit between requests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n📊 COMPARISON SUMMARY');
  console.log('='.repeat(50));
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const speed = result.duration < 5000 ? '🚀' : result.duration < 15000 ? '🚶' : '🐌';
    const source = result.source ? `(${result.source})` : '';
    
    console.log(`${index + 1}. ${status} ${result.name} ${speed}`);
    console.log(`   Time: ${result.duration}ms ${source}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  const successfulModels = results.filter(r => r.success);
  const fastestModel = successfulModels.sort((a, b) => a.duration - b.duration)[0];
  
  if (fastestModel) {
    console.log(`\n🏆 Fastest working model: ${fastestModel.name} (${fastestModel.duration}ms)`);
  }
  
  console.log('\n💡 Recommendation:');
  console.log('- Use DeepSeek V3.1 for speed and reliability');
  console.log('- Use DeepSeek R1 only if you need advanced reasoning');
  console.log('- The parsing fix handles both models correctly');
}

// Run the comparison
runModelComparison()
  .then(() => {
    console.log('\n🎉 Model comparison completed!');
  })
  .catch(error => {
    console.error('💥 Comparison failed:', error);
  });
