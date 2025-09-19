import { z } from 'zod';

// Define allowed category enum for better validation
const ActivityCategory = z.enum([
  'outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 
  'hike', 'creative', 'festival', 'show', 'seasonal', 'other'
]);

const WeatherFit = z.enum(['good', 'ok', 'bad']);

// Weather schema with graceful handling of null values
const WeatherSchema = z.object({
  temperature_min_c: z.number().nullable().catch(null),
  temperature_max_c: z.number().nullable().catch(null),
  precipitation_probability_percent: z.number().nullable().catch(null),
  wind_speed_max_kmh: z.number().nullable().catch(null),
});

// Festival/holiday schema with flexible validation
const FestivalSchema = z.object({
  name: z.string().trim().min(1, "Festival name cannot be empty"),
  start_date: z.string().nullable().catch(null),
  end_date: z.string().nullable().catch(null),
  url: z.string().url().nullable().catch(null).or(z.literal("").transform(() => null)),
  distance_km: z.number().nullable().catch(null),
});

const HolidaySchema = z.object({
  name: z.string().trim().min(1, "Holiday name cannot be empty"),
  localName: z.string().trim().min(1, "Holiday local name cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

// Context schema with validation and defaults
const ContextSchema = z.object({
  location: z.string().trim().min(1, "Location cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  duration_hours: z.number().min(0.5).max(24).catch(2), // Default to 2 hours if invalid
  ages: z.array(z.number().min(0).max(120)).min(1, "At least one age must be provided"),
  weather: WeatherSchema,
  is_public_holiday: z.boolean().catch(false),
  nearby_festivals: z.array(FestivalSchema).default([]),
  holidays: z.array(HolidaySchema).optional(),
  extra_instructions: z.string().optional(),
  exclusions: z.array(z.string()).optional().default([]),
});

// Activity schema with robust validation and coercion
const ActivitySchema = z.object({
  title: z.string()
    .trim()
    .min(1, "Activity title cannot be empty")
    .transform(title => title.replace(/^["']|["']$/g, '')), // Remove surrounding quotes
  
  category: ActivityCategory
    .catch('other') // Default to 'other' if invalid category
    .transform(cat => cat.toLowerCase()),
  
  description: z.string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description too long")
    .transform(desc => desc.replace(/^["']|["']$/g, '')), // Remove surrounding quotes
  
  suitable_ages: z.string()
    .trim()
    .min(1, "Suitable ages cannot be empty")
    .transform(ages => ages.replace(/^["']|["']$/g, '')), // Remove surrounding quotes
  
  duration_hours: z.number()
    .min(0.25, "Duration must be at least 15 minutes")
    .max(12, "Duration cannot exceed 12 hours")
    .catch(2), // Default to 2 hours if invalid
  
  address: z.string()
    .trim()
    .nullable()
    .optional()
    .transform(addr => {
      if (!addr || addr === "" || addr === "null") return undefined;
      return addr?.replace(/^["']|["']$/g, '');
    }),
  
  lat: z.number()
    .min(-90).max(90)
    .nullable()
    .optional()
    .catch(undefined),
  
  lon: z.number()
    .min(-180).max(180)
    .nullable()
    .optional()
    .catch(undefined),
  
  booking_url: z.string()
    .url("Invalid booking URL")
    .nullable()
    .optional()
    .catch(undefined)
    .transform(url => {
      if (!url || url === "" || url === "null") return undefined;
      return url;
    }),
  
  free: z.boolean()
    .nullable()
    .optional()
    .catch(undefined),
  
  weather_fit: WeatherFit
    .catch('ok'), // Default to 'ok' if invalid
  
  notes: z.string()
    .trim()
    .nullable()
    .optional()
    .transform(notes => {
      if (!notes || notes === "" || notes === "null") return undefined;
      return notes.replace(/^["']|["']$/g, '');
    }),
  
  evidence: z.array(z.string().trim())
    .optional()
    .default([])
    .transform(evidence => evidence.filter(e => e.length > 0)),
});

// Web sources schema
const WebSourceSchema = z.object({
  title: z.string().trim().min(1, "Web source title cannot be empty"),
  url: z.string().url("Invalid web source URL"),
  source: z.string().trim().min(1, "Web source name cannot be empty"),
});

// Discovered holiday schema (for AI-discovered holidays)
const DiscoveredHolidaySchema = z.object({
  name: z.string().trim().min(1, "Holiday name cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  type: z.string().optional().default('holiday'),
});

// Main LLM result schema with comprehensive validation
const LLMResultSchema = z.object({
  query: ContextSchema.optional(),
  
  activities: z.array(ActivitySchema)
    .min(1, "At least one activity must be provided")
    .max(30, "Too many activities (maximum 30)"),
  
  web_sources: z.array(WebSourceSchema)
    .optional()
    .default([]),
  
  ai_provider: z.string()
    .optional()
    .default('unknown'),
  
  ai_model: z.string()
    .optional()
    .default('unknown'),
  
  discovered_holidays: z.array(DiscoveredHolidaySchema)
    .optional()
    .default([]),
  
  cacheBypassReason: z.string().optional(),
  cacheInfo: z.any().optional(),
});

// Validation error class for better error handling
class ValidationError extends Error {
  constructor(error, context) {
    const message = context 
      ? `${context}: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      : error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    
    super(message);
    this.name = 'ValidationError';
    this.issues = error.issues;
  }
}

// Sanitization helpers for AI responses
function sanitizeAIResponse(rawResponse) {
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
    sanitized.activities = sanitized.activities.map((activity) => {
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
function validateAIResponse(rawResponse, context) {
  try {
    // First sanitize the response
    const sanitized = sanitizeAIResponse(rawResponse);
    
    // Validate with Zod schema
    const result = LLMResultSchema.parse(sanitized);
    
    console.log(`✅ Zod validation successful: ${result.activities.length} activities validated`);
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

// Validation with automatic fixes and fallbacks
function validateWithFallbacks(rawResponse) {
  try {
    return validateAIResponse(rawResponse);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn('🔧 Primary validation failed, attempting repairs...');
      
      // Try to repair common issues
      const repaired = repairCommonIssues(rawResponse);
      
      try {
        return validateAIResponse(repaired, 'After repair attempt');
      } catch (repairError) {
        console.error('🔧 Repair attempt failed:', repairError);
        
        // Last resort: create a minimal valid response
        return createMinimalValidResponse(rawResponse);
      }
    }
    throw error;
  }
}

// Repair common issues in AI responses
function repairCommonIssues(rawResponse) {
  const repaired = { ...sanitizeAIResponse(rawResponse) };
  
  // Ensure activities array exists
  if (!repaired.activities || !Array.isArray(repaired.activities)) {
    repaired.activities = [];
  }
  
  // Repair activities with missing required fields
  repaired.activities = repaired.activities
    .map((activity, index) => {
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
    .filter((activity) => activity.title && activity.description); // Remove activities that can't be fixed
  
  return repaired;
}

// Create a minimal valid response as last resort
function createMinimalValidResponse(rawResponse) {
  console.warn('🚨 Creating minimal valid response as fallback');
  
  return {
    query: undefined,
    activities: [{
      title: 'Activity Search Failed',
      category: 'other',
      description: 'The AI model returned an invalid response. Please try again with a different search.',
      suitable_ages: 'All ages',
      duration_hours: 2,
      weather_fit: 'ok',
      evidence: []
    }],
    web_sources: [],
    ai_provider: 'unknown',
    ai_model: 'unknown',
    discovered_holidays: []
  };
}

// Helper to check if a response looks like it might be valid before full validation
function isResponseStructureValid(response) {
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
  const validActivities = response.activities.filter((activity) => 
    activity && 
    typeof activity === 'object' &&
    activity.title && 
    activity.description
  );
  
  return validActivities.length > 0;
}

// Model-specific validation configurations
const ModelValidationConfig = {
  'openrouter': {
    enableStrictValidation: true,
    enableRepairAttempts: true,
    maxActivities: 25
  },
  'gemini': {
    enableStrictValidation: true,
    enableRepairAttempts: true,
    maxActivities: 30 // Gemini can handle more activities reliably
  },
  // Llama models need special handling due to JSON formatting issues
  'openrouter-meta-llama/llama-3.2-3b-instruct:free': {
    enableStrictValidation: false,
    enableRepairAttempts: true,
    enableAdvancedRepairs: true,
    maxActivities: 10, // Increased from 8 but still conservative
    requireFallbackHandling: true
  },
  'default': {
    enableStrictValidation: false,
    enableRepairAttempts: true,
    maxActivities: 20
  }
};

// Model-aware validation function  
function validateForModel(rawResponse, modelName) {
  const config = ModelValidationConfig[modelName] || ModelValidationConfig.default;
  
  console.log(`🔍 Validating response for model: ${modelName || 'unknown'} (strict: ${config.enableStrictValidation}, repairs: ${config.enableRepairAttempts})`);
  
  // Special handling for Llama models that are known to have JSON formatting issues
  if (config.requireFallbackHandling) {
    console.log(`⚠️ Model ${modelName} requires special fallback handling due to known JSON formatting issues`);
    
    try {
      // Try with fallbacks first for problematic models
      return validateWithFallbacks(rawResponse);
    } catch (error) {
      console.warn(`🔧 Primary validation with fallbacks failed for ${modelName}, creating emergency valid response`);
      
      // For models known to have severe issues, create a valid minimal response
      if (isResponseStructureValid(rawResponse)) {
        // If basic structure is valid, try to extract what we can
        try {
          const activities = rawResponse.activities || [];
          if (activities.length > 0) {
            return createMinimalValidResponse(rawResponse);
          }
        } catch (extractError) {
          console.log('Failed to extract activities from malformed response');
        }
      }
      
      // Last resort for completely malformed responses
      return createMinimalValidResponse(rawResponse);
    }
  }
  
  if (config.enableStrictValidation) {
    return validateAIResponse(rawResponse, `Model: ${modelName}`);
  } else {
    return validateWithFallbacks(rawResponse);
  }
}

// Export helper for getting validation error details in a user-friendly format
function getValidationErrorSummary(error) {
  if (!(error instanceof ValidationError)) {
    return error.message;
  }
  
  const fieldErrors = error.issues.map(issue => {
    const field = issue.path.join('.');
    return `${field}: ${issue.message}`;
  });
  
  return `Validation failed for: ${fieldErrors.join(', ')}`;
}

export {
  // Schemas
  ActivitySchema,
  LLMResultSchema,
  ContextSchema,
  WeatherSchema,
  
  // Main validation functions
  validateAIResponse,
  validateWithFallbacks,
  validateForModel,
  
  // Helper functions
  sanitizeAIResponse,
  isResponseStructureValid,
  getValidationErrorSummary,
  
  // Error classes
  ValidationError,
  
  // Config
  ModelValidationConfig
};
