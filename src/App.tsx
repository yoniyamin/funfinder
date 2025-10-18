import React, { useMemo, useState, useEffect } from 'react';
import { toISODate, geocode, fetchHolidays, fetchHolidaysWithFallback, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from './lib/api';
import type { Activity, Context, LLMResult } from './lib/schema';
import { validateAIResponse, getValidationErrorSummary, ValidationError } from './lib/validation-helpers';
import Settings from './components/Settings';
import { shareActivityCard, isSharingSupported } from './lib/share-card';

interface SearchHistoryEntry {
  id: string;
  location: string;
  date: string;
  duration: number;
  kidsAges: number[];
  extraInstructions?: string;
  timestamp: string;
  searchCount: number;
}

const ALLOWED_CATS = 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other';

function getCategoryIcon(category: string): string {
  switch(category) {
    case 'playground': return '🏞️';
    case 'park': return '🌳';
    case 'museum': return '🏛️';
    case 'outdoor': return '🌤️';
    case 'indoor': return '🏠';
    case 'water': return '💧';
    case 'hike': return '🥾';
    case 'creative': return '🎨';
    case 'festival': return '🎪';
    case 'show': return '🎭';
    case 'seasonal': return '🌟';
    default: return '📍';
  }
}

function getFreeIcon(free: boolean | undefined): React.ReactNode {
  if (free === true) return <span className="text-green-600">💚</span>;
  if (free === false) return <span className="text-amber-600">💰</span>;
  return null;
}

function getWeatherIcon(weather: string): string {
  switch(weather) {
    case 'good': return '☀️';
    case 'ok': return '⛅';
    case 'bad': return '🌧️';
    default: return '🌤️';
  }
}

function getDetailedWeatherIcon(temp: number | null, precipitation: number | null): string {
  if (precipitation !== null && precipitation > 70) return '🌧️';
  if (precipitation !== null && precipitation > 40) return '⛅';
  if (temp !== null && temp > 25) return '☀️';
  if (temp !== null && temp < 10) return '❄️';
  return '🌤️';
}

function getTemperatureColor(temp: number | null): string {
  if (temp === null) return 'text-gray-600';
  if (temp >= 25) return 'text-orange-600';
  if (temp >= 15) return 'text-green-600';
  if (temp >= 5) return 'text-blue-600';
  return 'text-indigo-600';
}

function Chip({ children }: { children: React.ReactNode }) { return <span className="chip">{children}</span>; }

const ExcludeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.3 8.3l7.4 7.4" />
  </svg>
);

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{status}</span>
        <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-gradient-fun h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <section className="card p-5 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-gray-200 bg-white animate-pulse">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
            <div className="flex gap-1 mb-3">
              <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              <div className="h-6 bg-gray-200 rounded-full w-12"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-4/5"></div>
              <div className="h-3 bg-gray-200 rounded w-3/5"></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App(){
  // Clear form fields on app start
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [ages, setAges] = useState<number[]>([]);
  const [ageInput, setAgeInput] = useState<string>('');
  const [extraInstructions, setExtraInstructions] = useState<string>('');
  
  // Search history state
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [webSources, setWebSources] = useState<Array<{title: string; url: string; source: string}> | null>(null);

  const [fCat, setFCat] = useState<string>('');
  const [fFree, setFFree] = useState<string>('');
  const [fWeather, setFWeather] = useState<string>('');

  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showExclusionManager, setShowExclusionManager] = useState<boolean>(false);
  const [exclusionList, setExclusionList] = useState<{[location: string]: string[]}>({});
  const [sharingActivityIdx, setSharingActivityIdx] = useState<number | null>(null);

  const cats = useMemo(()=> Array.from(new Set((activities||[]).map(a=>a.category))).sort(), [activities]);

  // Load search history and exclusion list on component mount
  useEffect(() => {
    loadSearchHistory();
    loadExclusionList();
  }, []);

  const loadSearchHistory = async () => {
    try {
      const response = await fetch('/api/search-history');
      const data = await response.json();
      if (data.ok) {
        setSearchHistory(data.history);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  };

  const loadExclusionList = async () => {
    try {
      const response = await fetch('/api/exclusion-list');
      const data = await response.json();
      if (data.ok) {
        setExclusionList(data.exclusions);
      }
    } catch (error) {
      console.error('Failed to load exclusion list:', error);
    }
  };

  const addToExclusionList = async (location: string, attraction: string) => {
    try {
      const response = await fetch('/api/exclusion-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, attraction })
      });
      const data = await response.json();
      if (data.ok) {
        setExclusionList(data.exclusions);
        return true;
      }
    } catch (error) {
      console.error('Failed to add to exclusion list:', error);
    }
    return false;
  };

  const removeFromExclusionList = async (location: string, attraction: string) => {
    try {
      const response = await fetch(`/api/exclusion-list/${encodeURIComponent(location)}/${encodeURIComponent(attraction)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.ok) {
        setExclusionList(data.exclusions);
        return true;
      }
    } catch (error) {
      console.error('Failed to remove from exclusion list:', error);
    }
    return false;
  };

  // Helper function to separate holidays from festivals
  const separateHolidaysFromFestivals = (events: any[], targetDate: string) => {
    const holidayKeywords = ['labor day', 'labour day', 'memorial day', 'independence day', 'veterans day', 'presidents day', 'martin luther king', 'columbus day', 'thanksgiving', 'christmas', 'easter', 'new year', 'holiday', 'national day'];
    
    const holidays = events.filter((event: any) => 
      event.start_date === targetDate && holidayKeywords.some(keyword => 
        event.name.toLowerCase().includes(keyword)
      )
    );
    
    const festivals = events.filter((event: any) => 
      !(event.start_date === targetDate && holidayKeywords.some(keyword => 
        event.name.toLowerCase().includes(keyword)
      ))
    );
    
    return { holidays, festivals };
  };

  const deleteHistoryEntry = async (id: string) => {
    try {
      const response = await fetch(`/api/search-history/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.ok) {
        setSearchHistory(prev => prev.filter(entry => entry.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete search history entry:', error);
    }
  };

  const loadFromHistory = (entry: SearchHistoryEntry) => {
    try {
      setLocation(entry.location || '');
      setDate(entry.date || '');
      setDuration(entry.duration || '');
      setAges(Array.isArray(entry.kidsAges) ? entry.kidsAges : []);
      setExtraInstructions(entry.extraInstructions || '');
      setAgeInput(''); // Clear age input when loading from history
      setShowHistory(false);
    } catch (error) {
      console.error('Error loading from history:', error);
      alert('Failed to load search from history');
      setShowHistory(false);
    }
  };

  function addAge(){
    const v = parseInt(ageInput, 10);
    if(Number.isFinite(v)){
      const next = Array.from(new Set([...ages, v])).sort((a,b)=>a-b);
      setAges(next); setAgeInput('');
    }
  }
  function removeAge(v:number){ setAges(ages.filter(a=>a!==v)); }

  async function fetchPrompt(context: Context){
    try{
      const resp = await fetch('/api/prompt', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ctx: context, allowedCategories: ALLOWED_CATS }) });
      if(!resp.ok){ throw new Error(await resp.text()); }
      const data: { ok:boolean; prompt: string } = await resp.json();
      setPrompt(data.prompt);
    } catch(err:any){
      console.error('Failed to fetch prompt:', err);
      setPrompt('Error fetching prompt: ' + err.message);
    }
  }

  async function run(){
    try{
      // Form validation
      if (!location.trim()) {
        alert('Please enter a location');
        return;
      }
      if (!date) {
        alert('Please select a date');
        return;
      }
      if (duration === '' || typeof duration !== 'number' || duration <= 0) {
        alert('Please enter a valid duration');
        return;
      }
      if (ages.length === 0) {
        alert('Please add at least one child age');
        return;
      }

      // Clear existing results and reset states
      setIsLoading(true);
      setActivities(null);
      setWebSources(null);
      setCtx(null);
      setPrompt('');
      setProgress(0);
      
      setStatus('Geocoding location…');
      setProgress(10);
      const g = await geocode(location);
      const { latitude: lat, longitude: lon, country_code, name, country } = g as any;

      setStatus('Fetching weather forecast…');
      setProgress(25);
      let w: { tmax: number | null; tmin: number | null; pprob: number | null; wind: number | null } = { tmax: null, tmin: null, pprob: null, wind: null };
      try {
        w = await fetchWeatherDaily(lat, lon, date);
      } catch (error) {
        console.warn('Weather data not available for this date, using default values:', error);
        // Continue with null weather data for future dates or when API fails
      }

      setStatus('Checking public holidays…');
      setProgress(40);
      let isHoliday = false;
      let holidayDetails: Array<{name: string; localName: string; date: string}> = [];
      try {
        console.log(`🔍 Starting enhanced holiday detection for ${name}, ${country} (${country_code}) on ${date}`);
        const hol = await fetchHolidaysWithFallback(country_code, date.slice(0,4), `${name}, ${country}`, date);
        // Ensure date is in YYYY-MM-DD format for comparison
        const normalizedDate = new Date(date).toISOString().split('T')[0];
        
        // More flexible date filtering: check for holidays within ±3 days of target date
        const targetDateObj = new Date(normalizedDate);
        const threeDaysBefore = new Date(targetDateObj.getTime() - 3 * 24 * 60 * 60 * 1000);
        const threeDaysAfter = new Date(targetDateObj.getTime() + 3 * 24 * 60 * 60 * 1000);
        
        const matches = hol.filter((h: any) => {
          if (!h.date && !h.start_date) return false;
          const holidayDate = new Date(h.date || h.start_date);
          return holidayDate >= threeDaysBefore && holidayDate <= threeDaysAfter;
        });
        
        isHoliday = matches.length > 0;
        if (matches.length > 0) {
          holidayDetails = matches.map((h: any) => ({
            name: h.name,
            localName: h.localName || h.name,
            date: h.date || h.start_date
          }));
          console.log(`🎊 Enhanced holiday detection found ${matches.length} holidays near ${normalizedDate}:`, matches.map((h: any) => h.localName || h.name).join(', '));
        } else {
          console.log(`📅 Enhanced holiday detection found no holidays near ${normalizedDate} in ${name}, ${country} (searched ${hol.length} total holidays)`);
          // Log the holidays that were found for debugging
          if (hol.length > 0) {
            console.log(`🔍 Available holidays found:`, hol.map((h: any) => `${h.name} (${h.date || h.start_date})`).join(', '));
          }
        }
      } catch (error) {
        console.warn('Enhanced holiday detection failed, continuing without holiday data:', error);
        // Continue without holiday data - don't let this block the entire search
      }

      setStatus('Preparing search context…');
      setProgress(55);
      // Holiday and festival information is now handled server-side in the activity search
      console.log('🎭 Holiday and festival context will be gathered server-side during activity search');

      const context: Context = {
        location: `${name}, ${country}`,
        date,
        duration_hours: duration,
        ages,
        weather: {
          temperature_min_c: w.tmin,
          temperature_max_c: w.tmax,
          precipitation_probability_percent: w.pprob,
          wind_speed_max_kmh: w.wind
        },
        is_public_holiday: isHoliday,
        nearby_festivals: [], // Will be populated server-side with holiday/festival context
        holidays: holidayDetails, // Include actual holiday details for UI display
        ...(extraInstructions.trim() && { extra_instructions: extraInstructions.trim() })
      };
      setCtx(context);

      setStatus('Preparing AI prompt…');
      setProgress(65);
      // Fetch the prompt for display
      await fetchPrompt(context);

      setStatus('Searching web for current events & recommendations…');
      setProgress(75);

      setStatus('Generating activity recommendations… This might take a while');
      setProgress(85);
      
      // Rotating status messages during generation
      const loadingMessages = [
        'Generating activity recommendations… This might take a while',
        'Free models are a bit slower… Thanks for your patience! 🤖',
        'Analyzing local attractions and family-friendly activities… ⏳',
        'Checking weather conditions and seasonal activities… 🌤️',
        'Finding the perfect activities for your family… 👨‍👩‍👧‍👦',
        'Searching for hidden gems and popular destinations… 💎',
        'Considering age-appropriate activities and duration… 🎯',
        'Almost ready with personalized recommendations… ✨'
      ];
      
      let messageIndex = 0;
      const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setStatus(loadingMessages[messageIndex]);
        console.log(`🔄 Loading message changed to: ${loadingMessages[messageIndex]}`);
      }, 15000); // Change message every 15 seconds for better user experience
      
      // Also change the first message after a shorter delay to show it's working
      const messageTimeout = setTimeout(() => {
        if (messageIndex === 0) { // Only if we haven't moved yet
          messageIndex = 1;
          setStatus(loadingMessages[messageIndex]);
          console.log(`🔄 First message change to: ${loadingMessages[messageIndex]}`);
        }
      }, 5000);
      
      try {
        const resp = await fetch('/api/activities', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ctx: context, allowedCategories: ALLOWED_CATS }) });
        
        if(!resp.ok){ 
          const errorText = await resp.text();
          throw new Error(errorText || 'Failed to get activities from AI model'); 
        }
        const data: { ok:boolean; data: LLMResult } = await resp.json();
        if(!data.ok || !data.data?.activities) {
          throw new Error('Invalid response from AI model');
        }
        
        setStatus('Validating results…');
        setProgress(90);
        
        // Client-side validation of the AI response
        try {
          const validatedResult = validateAIResponse(data.data, 'Client-side API response');
          console.log(`✅ Client-side validation successful: ${validatedResult.activities.length} activities validated`);
          
          setStatus('Processing results…');
          setProgress(95);
          setActivities(validatedResult.activities);
          setWebSources(validatedResult.web_sources || null);
        } catch (validationError) {
          if (validationError instanceof ValidationError) {
            const errorSummary = getValidationErrorSummary(validationError);
            console.warn('⚠️ Client-side validation failed, using server response as-is:', errorSummary);
            // Fallback to unvalidated data with warning
            setActivities(data.data.activities);
            setWebSources(data.data.web_sources || null);
          } else {
            throw validationError;
          }
        }
        
        setStatus('Complete!');
        setProgress(100);
        
        // Reload search history to show the new entry
        loadSearchHistory();
        
        // Clear status after a short delay
        setTimeout(() => {
          setStatus('');
          setIsLoading(false);
          setProgress(0);
        }, 1000);
        
      } catch(err:any){
        console.error(err);
        setStatus(err.message || 'Something went wrong');
        setIsLoading(false);
        setProgress(0);
      } finally {
        // Always clear the interval and timeout when done
        clearInterval(messageInterval);
        clearTimeout(messageTimeout);
      }
      
    } catch(err:any){
      console.error(err);
      setStatus(err.message || 'Something went wrong');
      setIsLoading(false);
      setProgress(0);
    }
  }

  const filtered = useMemo(()=>{
    let list = (activities||[]).slice();
    const location = ctx?.location;

    let locationExclusions: string[] = [];
    if (location) {
      locationExclusions = exclusionList[location] || [];
      if (locationExclusions.length === 0) {
        const match = Object.entries(exclusionList).find(([loc]) => loc.toLowerCase() === location.toLowerCase());
        if (match) {
          locationExclusions = match[1];
        }
      }
    }

    if (locationExclusions.length > 0) {
      const normalized = locationExclusions.map(entry => entry.toLowerCase());
      list = list.filter(activity => {
        const title = (activity.title || '').toLowerCase();
        if (!title) return true;
        return !normalized.some(excluded => title.includes(excluded) || excluded.includes(title));
      });
    }

    if(fCat) list = list.filter(a=>a.category===fCat);
    if(fFree==='true') list = list.filter(a=>a.free===true);
    if(fFree==='false') list = list.filter(a=>a.free===false);
    if(fWeather) list = list.filter(a=>a.weather_fit===fWeather);
    return list;
  }, [activities, ctx?.location, exclusionList, fCat, fFree, fWeather]);

    return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 pb-12">
      {/* Hero Banner Section */}
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-0 sm:pt-0 mobile-main-container">
        <div className="relative overflow-hidden">
          {/* Banner Image - Mobile: full screen, Desktop: rounded */}
          <div className="relative h-[65vh] md:h-[450px] w-full mobile-bg-container">
            <img 
              src="/bg2.jpeg" 
              alt="FunFinder" 
              className="w-full h-full object-cover rounded-3xl md:rounded-3xl sm:rounded-none mobile-bg-image"
              style={{objectPosition: '60% center'}}
            />
            {/* Mobile: no rounded overlay, Desktop: rounded overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/20 rounded-3xl md:rounded-3xl sm:rounded-none mobile-overlay"></div>
            {/* Fade out edges */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-white/30 rounded-3xl md:rounded-3xl sm:rounded-none mobile-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent rounded-3xl md:rounded-3xl sm:rounded-none mobile-overlay"></div>
            
            {/* Description Text Overlay - Positioned just below the title in image */}
            <div className="absolute inset-0 z-11 flex items-start justify-center pt-20 sm:pt-24 px-4">
              <div className="text-center mobile-description-container">
                <p className="text-white text-sm sm:text-lg md:text-xl max-w-2xl mx-auto font-bold drop-shadow-lg" style={{textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000'}}>Discover amazing activities for your kids with our AI-powered search. Find age-appropriate, fun, and educational experiences in your area.</p>
              </div>
            </div>
          </div>

          {/* Search Form Overlapping Banner */}
          <div className="relative z-10 -mt-72 sm:-mt-24 w-full max-w-5xl mx-auto mobile-search-form">
            <div className="bg-orange/40 backdrop-blur-md rounded-3xl shadow-2xl border border-orange-200/50 p-6 md:p-8 relative overflow-hidden">
              {/* Orange overlay for better transition */}
              <div className="absolute inset-0 bg-gradient-to-b from-orange-100/30 via-orange-50/20 to-white/50 rounded-3xl"></div>
              <div className="relative z-10">
              {/* Search History Dropdown */}
              {searchHistory.length > 0 && (
                <div className="mb-6 relative">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    <span>📋</span>
                    Recent Searches ({searchHistory.length})
                    <span className={`transform transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  
                  {showHistory && (
                    <div className="absolute top-8 left-0 right-0 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {searchHistory && searchHistory.length > 0 ? searchHistory.map((entry) => {
                        if (!entry || !entry.id) return null;
                        
                        return (
                          <div key={entry.id} className="p-3 border-b border-gray-100 hover:bg-gray-50 flex items-center justify-between group">
                            <button
                              type="button"
                              onClick={() => loadFromHistory(entry)}
                              className="flex-1 text-left"
                            >
                              <div className="font-medium text-gray-900">{entry.location || 'Unknown Location'}</div>
                              <div className="text-sm text-gray-600">
                                {entry.date || 'No date'} • {entry.duration || 0}h • Ages: {Array.isArray(entry.kidsAges) ? entry.kidsAges.join(', ') : 'No ages'}
                              </div>
                              {entry.extraInstructions && entry.extraInstructions.trim() && (
                                <div className="text-xs text-gray-500 italic mt-1" title={entry.extraInstructions}>
                                  💬 {entry.extraInstructions.length > 40 ? entry.extraInstructions.substring(0, 40) + '...' : entry.extraInstructions}
                                </div>
                              )}
                              <div className="text-xs text-gray-400">
                                {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown date'}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHistoryEntry(entry.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                              title="Delete this search"
                            >
                              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        );
                      }) : (
                        <div className="p-3 text-gray-500 text-center">No search history available</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={e=>{ e.preventDefault(); }}>
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                    <span>📍</span>
                    Where?
                  </label>
                  <input className="input" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Madrid, Spain" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                    <span>📅</span>
                    When?
                  </label>
                  <input type="date" className="input" value={date} onChange={e=>setDate(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                    <span>⏱️</span>
                    For how long? (hours)
                  </label>
                  <input 
                    type="number" 
                    min={1} 
                    step={0.5} 
                    className="input" 
                    value={duration} 
                    onChange={e => {
                      const val = e.target.value;
                      setDuration(val === '' ? '' : parseFloat(val));
                    }} 
                    placeholder="3"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                    <span>👶</span>
                    Kids' Ages
                  </label>
                  <div className="flex items-start gap-2">
                    <input type="number" min={0} max={17} className="input flex-1" placeholder="8" value={ageInput} onChange={e=>setAgeInput(e.target.value)} />
                    <button type="button" className="btn btn-secondary bg-gradient-to-r from-green-100 to-emerald-100 hover:from-green-200 hover:to-emerald-200 text-green-700 border border-green-200 whitespace-nowrap" onClick={addAge}>+ Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ages.map(a=> (
                      <span key={a} className="chip">{a} years <button className="ml-1" onClick={(e)=>{e.preventDefault(); removeAge(a);}}>✕</button></span>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                    <span>📝</span>
                    What else should we know? (Optional) 
                  </label>
                  <textarea 
                    className="input h-20 resize-none" 
                    placeholder="Outdoor activities, wheelchair accessible, near metro station..."
                    value={extraInstructions}
                    onChange={e=>setExtraInstructions(e.target.value)}
                  />
                </div>
                {/* Loading progress bar */}
                {isLoading && (
                  <div className="md:col-span-2 mt-6">
                    <ProgressBar progress={progress} status={status} />
                  </div>
                )}
              </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <main className="mx-auto max-w-5xl px-4 py-12 pb-32 sm:pb-20 space-y-6">

        {ctx && (
          <section className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Search Context</h2>
              <div className="flex items-center gap-3">
                {!isLoading && (
                  <button 
                    className="btn btn-secondary text-xs" 
                    onClick={() => setShowPrompt(!showPrompt)}
                  >
                    {showPrompt ? '🔍 Hide Prompt' : '🔍 View AI Prompt'}
                  </button>
                )}
                <div className="text-sm text-gray-500">{ctx.location}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white relative overflow-hidden">
                <div className="absolute top-2 right-2 text-xs opacity-75">
                  {new Date(ctx.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-5xl">
                    {getDetailedWeatherIcon(ctx.weather.temperature_max_c, ctx.weather.precipitation_probability_percent)}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {ctx.weather.temperature_max_c ?? '—'}°
                    </div>
                    <div className="text-sm opacity-80">
                      {ctx.weather.temperature_min_c ?? '—'}°~{ctx.weather.temperature_max_c ?? '—'}°
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <span>💧</span>
                      <span>Rain</span>
                    </span>
                    <span className="font-medium">
                      {ctx.weather.precipitation_probability_percent ?? '—'}%
                    </span>
                  </div>
                  
                  {typeof ctx.weather.wind_speed_max_kmh === 'number' && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span>💨</span>
                        <span>Wind</span>
                      </span>
                      <span className="font-medium">
                        {Math.round(ctx.weather.wind_speed_max_kmh)} km/h
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-white/10 rounded-full"></div>
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-white/5 rounded-full"></div>
              </div>
              <div className="p-5 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{ctx.is_public_holiday ? '🎉' : '📅'}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Public Holiday</div>
                    <div className="text-xs text-gray-600">For this date</div>
                  </div>
                </div>
                <div className="text-center py-2">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    ctx.is_public_holiday 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}>
                    {ctx.is_public_holiday ? '✅ Yes' : '❌ No'}
                  </div>
                </div>
              </div>
              
              <div className="p-5 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🎪</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Nearby Festivals</div>
                    <div className="text-xs text-gray-600">Within 60km, ±7 days</div>
                  </div>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {ctx.nearby_festivals.length ? ctx.nearby_festivals.slice(0,3).map((f,i)=> (
                    <div key={i} className="bg-white/50 rounded-lg p-2 border border-purple-100">
                      <div className="flex items-start gap-2">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                          {f.distance_km ?? '—'} km
                        </span>
                        <div className="flex-1 min-w-0">
                          {f.url ? (
                            <a className="text-sm text-purple-700 hover:text-purple-900 hover:underline font-medium block truncate" href={f.url} target="_blank">
                              {f.name}
                            </a>
                          ) : (
                            <div className="text-sm text-gray-700 font-medium truncate">{f.name}</div>
                          )}
                          {(f.start_date || f.end_date) && (
                            <div className="text-xs text-gray-500 mt-1">
                              {f.start_date ?? '—'}{f.end_date ? ' → '+f.end_date : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      <div className="text-lg mb-1">🔍</div>
                      <div>None found within ±7 days</div>
                    </div>
                  )}
                  {ctx.nearby_festivals.length > 3 && (
                    <div className="text-center text-xs text-purple-600 font-medium">
                      +{ctx.nearby_festivals.length - 3} more festivals
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}



        {showPrompt && prompt && !isLoading && (
          <section className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">AI Prompt</h2>
              <span className="text-xs text-gray-500">This is what gets sent to the AI model</span>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 overflow-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{prompt}</pre>
            </div>
          </section>
        )}

        {isLoading && progress >= 70 && (
          <LoadingSkeleton />
        )}

        {webSources && webSources.length > 0 && !isLoading && (
          <section className="card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌐</span>
                <h2 className="text-lg font-semibold">Enhanced with Current Web Intelligence</h2>
                <div className="flex items-center gap-1 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 px-2 py-1 rounded-full text-xs font-medium border border-green-200">
                  <span>⚡</span>
                  <span>Live Data</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              These activity recommendations were enhanced using current information from trusted travel sources and event platforms, 
              providing you with up-to-date insights similar to Google's AI Overview:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {webSources.map((source, idx) => {
                const isEventSource = source.source.toLowerCase().includes('event') || 
                                     source.source.toLowerCase().includes('tourism') || 
                                     source.source.toLowerCase().includes('intelligence');
                return (
                  <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isEventSource 
                      ? 'border-purple-200 bg-purple-50 hover:bg-purple-100' 
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  }`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isEventSource 
                        ? 'bg-purple-100' 
                        : 'bg-indigo-100'
                    }`}>
                      {isEventSource ? (
                        <span className="text-purple-600 text-sm">🎪</span>
                      ) : (
                        <span className={`${isEventSource ? 'text-purple-600' : 'text-indigo-600'} text-xs font-bold`}>
                          {source.source.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`text-sm font-medium hover:underline block truncate ${
                          isEventSource ? 'text-purple-700 hover:text-purple-900' : 'text-indigo-600 hover:text-indigo-800'
                        }`}
                      >
                        {source.title}
                      </a>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        {isEventSource && <span>📅</span>}
                        <span>{source.source}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`transition-colors ${
                          isEventSource 
                            ? 'text-purple-400 hover:text-purple-600' 
                            : 'text-gray-400 hover:text-indigo-600'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-800 flex items-start gap-2">
                <span className="text-blue-600 flex-shrink-0">💡</span>
                <div>
                  <span className="font-medium">How this works:</span> We search current travel guides, event platforms, and local tourism sources 
                  to provide the AI with fresh, location-specific information beyond its training data. This ensures recommendations 
                  include current festivals, seasonal events, and newly opened attractions.
                </div>
              </div>
            </div>
          </section>
        )}

        {activities && !isLoading && (
          <section className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Activities</h2>
              </div>
              <div className="flex gap-2">
                <select className="input w-44" value={fCat} onChange={e=>setFCat(e.target.value)}>
                  <option value="">All categories</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="input w-36" value={fFree} onChange={e=>setFFree(e.target.value)}>
                  <option value="">Free & paid</option>
                  <option value="true">Free only</option>
                  <option value="false">Paid only</option>
                </select>
                <select className="input w-44" value={fWeather} onChange={e=>setFWeather(e.target.value)}>
                  <option value="">Any weather fit</option>
                  <option value="good">Good</option>
                  <option value="ok">OK</option>
                  <option value="bad">Bad</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a, idx)=> (
                <article key={idx} id={`activity-card-${idx}`} className="relative rounded-2xl bg-gradient-border p-[2px] hover:shadow-lg transition-all duration-200">
                  <div className="bg-white rounded-2xl p-5 h-full relative">
                  {/* Exclude button in top-right corner */}
                  <button
                    onClick={async () => {
                      if (ctx && await addToExclusionList(ctx.location, a.title || 'Untitled activity')) {
                        // Remove this activity from current results
                        setActivities(prev => prev ? prev.filter(act => act.title !== a.title) : prev);
                      }
                    }}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                    title="Exclude this activity from future suggestions for this location"
                  >
                    <ExcludeIcon className="h-4 w-4" />
                    <span>Don't show again</span>
                  </button>

                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-2xl flex-shrink-0 mt-1">{getCategoryIcon(a.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 pr-16">
                        <h3 className="font-semibold text-gray-900 text-base leading-tight">{a.title || 'Untitled activity'}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {getFreeIcon(a.free)}
                          <span className="text-lg">{getWeatherIcon(a.weather_fit)}</span>
                        </div>
                      </div>
                      {a.address && (<div className="text-[13px] text-gray-600 mt-1 flex items-center gap-1"><span>📍</span>{a.address}</div>)}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mb-3">
                    {a.category && <Chip>{getCategoryIcon(a.category)} {a.category}</Chip>}
                    {a.free!=null && <Chip>{getFreeIcon(a.free)} {a.free ? 'Free' : 'Paid'}</Chip>}
                    {typeof a.duration_hours==='number' && <Chip>⏱️ {a.duration_hours}h</Chip>}
                    {a.suitable_ages && <Chip>👶 {a.suitable_ages}</Chip>}
                  </div>
                  
                  <p className="text-sm text-gray-700 leading-relaxed">{a.description || ''}</p>
                  {a.notes && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-[13px] text-amber-800 flex items-start gap-2">
                        <span className="text-amber-600 flex-shrink-0">⚠️</span>
                        <span>{a.notes}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {a.booking_url && (
                        <a className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline font-medium flex items-center gap-1" href={a.booking_url} target="_blank">
                          🔗 Book/Info
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {Array.isArray(a.evidence) && a.evidence.length>0 && (
                        <div className="text-[11px] text-gray-500">
                          <span>Sources: </span>
                          {a.evidence.map((u,i)=> (
                            <a key={i} className="text-indigo-500 hover:underline ml-1" href={u} target="_blank">
                              [{i+1}]
                            </a>
                          ))}
                        </div>
                      )}
                      {isSharingSupported() && (
                        <button
                          data-share-btn
                          onClick={async () => {
                            setSharingActivityIdx(idx);
                            try {
                              const cardElement = document.getElementById(`activity-card-${idx}`);
                              if (cardElement) {
                                await shareActivityCard(a, cardElement, ctx?.location);
                              }
                            } catch (error) {
                              console.error('Share failed:', error);
                            } finally {
                              setSharingActivityIdx(null);
                            }
                          }}
                          disabled={sharingActivityIdx === idx}
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 p-2 rounded-lg transition-all hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
                          title="Share this activity"
                        >
                          {sharingActivityIdx === idx ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"></path>
                              <polyline points="16 6 12 2 8 6"></polyline>
                              <line x1="12" y1="2" x2="12" y2="15"></line>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 sm:hidden">
        <div className="flex justify-around items-center py-2 px-4">
          {/* Search Button */}
          <button 
            onClick={() => run()}
            disabled={isLoading}
            className="flex flex-col items-center justify-center py-2 px-4 relative group"
          >
            {/* Gradient overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-orange-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            {/* Search icon with stars */}
            <div className="relative z-10 mb-1">
              {isLoading ? (
                <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full"></div>
              ) : (
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {/* Magnifying glass */}
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                  {/* Stars around */}
                  <circle cx="6" cy="6" r="0.5" fill="currentColor"></circle>
                  <circle cx="18" cy="6" r="0.5" fill="currentColor"></circle>
                  <circle cx="6" cy="16" r="0.5" fill="currentColor"></circle>
                  <circle cx="18" cy="16" r="0.5" fill="currentColor"></circle>
                </svg>
              )}
            </div>
            <span className="text-xs text-purple-600 font-medium">Search</span>
          </button>

          {/* Exclusions Button */}
          <button 
            onClick={() => setShowExclusionManager(true)}
            className="flex flex-col items-center justify-center py-2 px-4 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="mb-1">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <span className="text-xs text-red-600 font-medium">Exclusions</span>
          </button>

          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(true)}
            className="flex flex-col items-center justify-center py-2 px-4 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="mb-1">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
            <span className="text-xs text-blue-600 font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <Settings 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      {/* Exclusion Manager Modal */}
      {showExclusionManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Manage Excluded Activities</h2>
                <button
                  onClick={() => setShowExclusionManager(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Remove activities you don't want to see in future recommendations. Exclusions are saved per location.
              </p>
            </div>

            <div className="p-6">
              {Object.keys(exclusionList).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-4">🎯</span>
                  <p>No exclusions yet!</p>
                  <p className="text-sm">Use the "Don't suggest this again" button on activities to add exclusions.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(exclusionList).map(([location, attractions]) => (
                    <div key={location} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <span>📍</span>
                        {location}
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                          {attractions.length} excluded
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {attractions.map((attraction, index) => (
                          <div key={index} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
                            <span className="text-sm text-gray-700">{attraction}</span>
                            <button
                              onClick={() => removeFromExclusionList(location, attraction)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                              title="Remove from exclusions"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowExclusionManager(false)}
                  className="btn btn-primary"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
