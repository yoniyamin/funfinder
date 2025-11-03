export type Context = {
  location: string;
  date: string; // YYYY-MM-DD
  duration_hours: number;
  ages: number[];
  weather: {
    temperature_min_c: number | null;
    temperature_max_c: number | null;
    precipitation_probability_percent: number | null;
    wind_speed_max_kmh: number | null;
    hourly?: Array<{
      time: string;
      tempC: number;
      rainChance: number;
      weatherCode?: number;
    }>;
  };
  is_public_holiday: boolean;
  nearby_festivals: Array<{
    name: string;
    start_date: string | null;
    end_date: string | null;
    url: string | null;
    distance_km: number | null;
  }>;
  holidays?: Array<{
    name: string;
    localName: string;
    date: string;
  }>;
  extra_instructions?: string;
};

export type Activity = {
  title: string;
  category: 'outdoor'|'indoor'|'museum'|'park'|'playground'|'water'|'hike'|'creative'|'festival'|'show'|'seasonal'|'other';
  description: string;
  suitable_ages: string;
  duration_hours: number;
  address?: string;
  lat?: number;
  lon?: number;
  booking_url?: string;
  free?: boolean;
  weather_fit: 'good'|'ok'|'bad';
  notes?: string;
  evidence?: string[];
  source?: string;
};

export type LLMResult = { 
  query: Context; 
  activities: Activity[];
  web_sources?: Array<{
    title: string;
    url: string;
    source: string;
  }>;
  ai_provider?: string;
  ai_model?: string;
};

// Favorites and Trip Lists
export type SavedActivity = Activity & {
  activityId: string; // UUID for the saved activity
  savedAt: string; // ISO timestamp
  location: string; // Location where this was found
  listIds?: string[]; // Lists this activity belongs to
};

export type TripList = {
  listId: string; // UUID
  name: string; // List name
  location?: string; // Optional location association
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  activityIds: string[]; // Ordered array of activity IDs
};

export type ShareableListData = {
  listName: string;
  location?: string;
  activityCount: number;
  activities: Array<{
    title: string;
    category: string;
    duration_hours: number;
    address?: string;
    booking_url?: string;
    free?: boolean;
  }>;
};