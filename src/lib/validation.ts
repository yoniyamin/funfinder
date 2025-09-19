import { z } from 'zod';

// Define allowed category enum for better validation
const ActivityCategory = z.enum([
  'outdoor', 'indoor', 'museum', 'park', 'playground', 'water', 
  'hike', 'creative', 'festival', 'show', 'seasonal', 'other'
]);

const WeatherFit = z.enum(['good', 'ok', 'bad']);

// Weather schema with graceful handling of null values
export const WeatherSchema = z.object({
  temperature_min_c: z.number().nullable().catch(null),
  temperature_max_c: z.number().nullable().catch(null),
  precipitation_probability_percent: z.number().nullable().catch(null),
  wind_speed_max_kmh: z.number().nullable().catch(null),
});

// Festival/holiday schema with flexible validation
export const FestivalSchema = z.object({
  name: z.string().trim().min(1, "Festival name cannot be empty"),
  start_date: z.string().nullable().catch(null),
  end_date: z.string().nullable().catch(null),
  url: z.string().url().nullable().catch(null).or(z.literal("").transform(() => null)),
  distance_km: z.number().nullable().catch(null),
});

export const HolidaySchema = z.object({
  name: z.string().trim().min(1, "Holiday name cannot be empty"),
  localName: z.string().trim().min(1, "Holiday local name cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

// Context schema with validation and defaults
export const ContextSchema = z.object({
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
export const ActivitySchema = z.object({
  title: z.string()
    .trim()
    .min(1, "Activity title cannot be empty")
    .transform(title => title.replace(/^["']|["']$/g, '')), // Remove surrounding quotes
  
  category: ActivityCategory
    .catch('other') // Default to 'other' if invalid category
    .transform(cat => cat.toLowerCase() as any),
  
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
      return addr.replace(/^["']|["']$/g, '');
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
export const WebSourceSchema = z.object({
  title: z.string().trim().min(1, "Web source title cannot be empty"),
  url: z.string().url("Invalid web source URL"),
  source: z.string().trim().min(1, "Web source name cannot be empty"),
});

// Discovered holiday schema (for AI-discovered holidays)
export const DiscoveredHolidaySchema = z.object({
  name: z.string().trim().min(1, "Holiday name cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  type: z.string().optional().default('holiday'),
});

// Main LLM result schema with comprehensive validation
export const LLMResultSchema = z.object({
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

// Validation helpers for external API responses
export const GeocodingResultSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().trim().min(1),
  country: z.string().trim().min(1),
  country_code: z.string().trim().length(2),
});

export const WeatherApiResponseSchema = z.object({
  tmax: z.number().nullable().catch(null),
  tmin: z.number().nullable().catch(null),
  pprob: z.number().nullable().catch(null),
  wind: z.number().nullable().catch(null),
});

// Type exports for use throughout the application
export type ValidatedActivity = z.infer<typeof ActivitySchema>;
export type ValidatedLLMResult = z.infer<typeof LLMResultSchema>;
export type ValidatedContext = z.infer<typeof ContextSchema>;
export type ValidatedWeather = z.infer<typeof WeatherSchema>;
export type ValidatedFestival = z.infer<typeof FestivalSchema>;
export type ValidatedHoliday = z.infer<typeof HolidaySchema>;
export type ValidatedWebSource = z.infer<typeof WebSourceSchema>;
export type ValidatedDiscoveredHoliday = z.infer<typeof DiscoveredHolidaySchema>;
export type ValidatedGeocodingResult = z.infer<typeof GeocodingResultSchema>;
export type ValidatedWeatherApiResponse = z.infer<typeof WeatherApiResponseSchema>;

// Validation error class for better error handling
export class ValidationError extends Error {
  public readonly issues: z.ZodIssue[];
  
  constructor(error: z.ZodError, context?: string) {
    const message = context 
      ? `${context}: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      : error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    
    super(message);
    this.name = 'ValidationError';
    this.issues = error.issues;
  }
}
