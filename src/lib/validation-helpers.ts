import { z } from 'zod';
import { 
  ActivitySchema, 
  LLMResultSchema, 
  ContextSchema,
  WeatherApiResponseSchema,
  GeocodingResultSchema,
  ValidationError,
  ValidatedActivity,
  ValidatedLLMResult,
  ValidatedContext
} from './validation';

// Sanitization helpers for AI responses
export function sanitizeAIResponse(rawResponse: any): any {
  if (typeof rawResponse === 'string') {
    try {
      return JSON.parse(rawResponse);
    } catch {
      throw new Error('Response is not valid JSON');
    }
  }
  
  if (!rawResponse || typeof rawResponse !== 'object') {
    throw new Error('Response must be a valid object or JSON string');
  }
  
  // Deep clone to avoid mutations
  const sanitized = JSON.parse(JSON.stringify(rawResponse));
  
  // Clean up common AI response issues
  if (sanitized.activities && Array.isArray(sanitized.activities)) {
    sanitized.activities = sanitized.activities.map((activity: any) => {
      const cleaned = { ...activity };
      
      // Fix common string issues
      ['title', 'description', 'suitable_ages', 'address', 'notes'].forEach(field => {
        if (typeof cleaned[field] === 'string') {
          // Remove markdown formatting, extra quotes, and normalize whitespace
          cleaned[field] = cleaned[field]
            .replace(/^\*\*|^\*|^"|^'|"$|'$|\*\*$|\*$/g, '') // Remove markdown and quotes
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        }
      });
      
      // Normalize category to lowercase
      if (typeof cleaned.category === 'string') {
        cleaned.category = cleaned.category.toLowerCase().trim();
      }
      
      // Convert string numbers to actual numbers
      ['duration_hours', 'lat', 'lon'].forEach(field => {
        if (typeof cleaned[field] === 'string' && cleaned[field]) {
          const num = parseFloat(cleaned[field]);
          if (!isNaN(num)) {
            cleaned[field] = num;
          }
        }
      });
      
      // Convert string booleans to actual booleans
      if (typeof cleaned.free === 'string') {
        const lowerFree = cleaned.free.toLowerCase();
        if (lowerFree === 'true' || lowerFree === 'yes') {
          cleaned.free = true;
        } else if (lowerFree === 'false' || lowerFree === 'no') {
          cleaned.free = false;
        }
      }
      
      // Ensure weather_fit is in correct format
      if (typeof cleaned.weather_fit === 'string') {
        cleaned.weather_fit = cleaned.weather_fit.toLowerCase().trim();
      }
      
      return cleaned;
    });
  }
  
  return sanitized;
}

// Enhanced validation function for AI responses with detailed error reporting
export function validateAIResponse(rawResponse: any, context?: string): ValidatedLLMResult {
  try {
    // First sanitize the response
    const sanitized = sanitizeAIResponse(rawResponse);
    
    // Validate with Zod schema
    const result = LLMResultSchema.parse(sanitized);
    
    console.log(`✅ Validation successful: ${result.activities.length} activities validated`);
    return result;
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Create detailed validation error
      const validationError = new ValidationError(error, context);
      
      // Log detailed error information for debugging
      console.error('❌ AI Response Validation Failed:', {
        context,
        issues: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          received: issue.received,
          code: issue.code
        })),
        rawResponse: typeof rawResponse === 'object' 
          ? JSON.stringify(rawResponse, null, 2).substring(0, 500) + '...'
          : String(rawResponse).substring(0, 500) + '...'
      });
      
      throw validationError;
    }
    
    // Re-throw other errors
    throw error;
  }
}

// Validate individual activity with helpful error messages
export function validateActivity(activity: any, index?: number): ValidatedActivity {
  try {
    return ActivitySchema.parse(activity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const context = index !== undefined ? `Activity ${index + 1}` : 'Activity';
      throw new ValidationError(error, context);
    }
    throw error;
  }
}

// Validate external API responses with graceful degradation
export function validateWeatherResponse(response: any): any {
  try {
    return WeatherApiResponseSchema.parse(response);
  } catch (error) {
    console.warn('Weather response validation failed, using defaults:', error);
    return { tmax: null, tmin: null, pprob: null, wind: null };
  }
}

export function validateGeocodingResponse(response: any): any {
  try {
    return GeocodingResultSchema.parse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error, 'Geocoding response');
    }
    throw error;
  }
}

// Context validation with helpful error messages
export function validateContext(context: any): ValidatedContext {
  try {
    return ContextSchema.parse(context);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error, 'Search context');
    }
    throw error;
  }
}

// Partial validation for incomplete responses (useful for streaming or partial updates)
export function validatePartialAIResponse(rawResponse: any): Partial<ValidatedLLMResult> {
  try {
    // Create a partial schema that doesn't require all fields
    const PartialLLMResultSchema = LLMResultSchema.partial();
    const sanitized = sanitizeAIResponse(rawResponse);
    return PartialLLMResultSchema.parse(sanitized);
  } catch (error) {
    console.warn('Partial validation failed:', error);
    return {};
  }
}

// Validation with automatic fixes and fallbacks
export function validateWithFallbacks(rawResponse: any): ValidatedLLMResult {
  try {
    return validateAIResponse(rawResponse);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn('Primary validation failed, attempting repairs...');
      
      // Try to repair common issues
      const repaired = repairCommonIssues(rawResponse);
      
      try {
        return validateAIResponse(repaired, 'After repair attempt');
      } catch (repairError) {
        console.error('Repair attempt failed:', repairError);
        
        // Last resort: create a minimal valid response
        return createMinimalValidResponse(rawResponse);
      }
    }
    throw error;
  }
}

// Repair common issues in AI responses
function repairCommonIssues(rawResponse: any): any {
  const repaired = { ...sanitizeAIResponse(rawResponse) };
  
  // Ensure activities array exists
  if (!repaired.activities || !Array.isArray(repaired.activities)) {
    repaired.activities = [];
  }
  
  // Repair activities with missing required fields
  repaired.activities = repaired.activities
    .map((activity: any, index: number) => {
      const fixed = { ...activity };
      
      // Ensure required fields have defaults
      if (!fixed.title || typeof fixed.title !== 'string') {
        fixed.title = `Activity ${index + 1}`;
      }
      
      if (!fixed.description || typeof fixed.description !== 'string') {
        fixed.description = `Description for ${fixed.title}`;
      }
      
      if (!fixed.suitable_ages || typeof fixed.suitable_ages !== 'string') {
        fixed.suitable_ages = 'All ages';
      }
      
      if (typeof fixed.duration_hours !== 'number' || fixed.duration_hours <= 0) {
        fixed.duration_hours = 2;
      }
      
      if (!fixed.category || typeof fixed.category !== 'string') {
        fixed.category = 'other';
      }
      
      if (!fixed.weather_fit || typeof fixed.weather_fit !== 'string') {
        fixed.weather_fit = 'ok';
      }
      
      return fixed;
    })
    .filter((activity: any) => activity.title && activity.description); // Remove activities that can't be fixed
  
  return repaired;
}

// Create a minimal valid response as last resort
function createMinimalValidResponse(rawResponse: any): ValidatedLLMResult {
  console.warn('Creating minimal valid response as fallback');
  
  return {
    query: undefined,
    activities: [{
      title: 'Activity Search Failed',
      category: 'other' as const,
      description: 'The AI model returned an invalid response. Please try again with a different search.',
      suitable_ages: 'All ages',
      duration_hours: 2,
      weather_fit: 'ok' as const,
      evidence: []
    }],
    web_sources: [],
    ai_provider: 'unknown',
    ai_model: 'unknown',
    discovered_holidays: []
  };
}

// Export helper for getting validation error details in a user-friendly format
export function getValidationErrorSummary(error: ValidationError): string {
  const fieldErrors = error.issues.map(issue => {
    const field = issue.path.join('.');
    return `${field}: ${issue.message}`;
  });
  
  return `Validation failed for: ${fieldErrors.join(', ')}`;
}

// Helper to check if a response looks like it might be valid before full validation
export function isResponseStructureValid(response: any): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  if (!response.activities || !Array.isArray(response.activities)) {
    return false;
  }
  
  if (response.activities.length === 0) {
    return false;
  }
  
  // Check if at least some activities have required fields
  const validActivities = response.activities.filter((activity: any) => 
    activity && 
    typeof activity === 'object' &&
    activity.title && 
    activity.description
  );
  
  return validActivities.length > 0;
}

// Model-specific validation configurations (can be extended for specific models)
export const ModelValidationConfig = {
  'openrouter': {
    enableStrictValidation: true,
    enableRepairAttempts: true,
    maxActivities: 15
  },
  'gemini': {
    enableStrictValidation: true,
    enableRepairAttempts: true,
    maxActivities: 12
  },
  'default': {
    enableStrictValidation: false,
    enableRepairAttempts: true,
    maxActivities: 10
  }
};

// Model-aware validation function
export function validateForModel(rawResponse: any, modelName?: string): ValidatedLLMResult {
  const config = ModelValidationConfig[modelName as keyof typeof ModelValidationConfig] || ModelValidationConfig.default;
  
  if (config.enableStrictValidation) {
    return validateAIResponse(rawResponse, `Model: ${modelName}`);
  } else {
    return validateWithFallbacks(rawResponse);
  }
}
