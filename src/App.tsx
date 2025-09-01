import React, { useMemo, useState, useEffect } from 'react';
import { toISODate, geocode, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from './lib/api';
import type { Activity, Context, LLMResult } from './lib/schema';
import Settings from './components/Settings';

interface SearchHistoryEntry {
  id: string;
  location: string;
  date: string;
  duration: number;
  kidsAges: number[];
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

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{status}</span>
        <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-gradient-to-r from-indigo-500 to-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
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
      setAgeInput(Array.isArray(entry.kidsAges) ? entry.kidsAges.join(', ') : '');
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
      try {
        const hol = await fetchHolidays(country_code, date.slice(0,4));
        const matches = hol.filter((h:any)=>h.date===date);
        isHoliday = matches.length>0;
      } catch (error) {
        console.warn('Failed to fetch holidays, continuing without holiday data:', error);
        // Continue without holiday data - don't let this block the entire search
      }

      setStatus('Searching for nearby festivals…');
      setProgress(55);
      let festivals: Array<{name:string; url:string|null; start_date:string|null; end_date:string|null; lat:number|null; lon:number|null; distance_km:number|null}> = [];
      try {
        festivals = await fetchFestivalsWikidata(lat, lon, date);
        
        // If no festivals found and Gemini holiday fetching might be enabled, try Gemini as fallback
        if (festivals.length === 0) {
          console.log('No festivals found from Wikidata, trying Gemini comprehensive search...');
          try {
            const geminiEvents = await fetchHolidaysWithGemini(`${name}, ${country}`, date);
            if (geminiEvents.length > 0) {
              console.log(`✨ Gemini found ${geminiEvents.length} holidays/festivals in 3-day period around ${date}`);
              
              // Separate holidays from festivals using helper function
              const { holidays: actualHolidays, festivals: actualFestivals } = separateHolidaysFromFestivals(geminiEvents, date);
              
              // If we found holidays that match today's date, mark as holiday
              if (actualHolidays.length > 0 && !isHoliday) {
                isHoliday = true;
                console.log(`✨ Found public holiday(s) from Gemini: ${actualHolidays.map((h: any) => h.name).join(', ')}`);
              }
              
              // Use only the festivals (holidays filtered out)
              festivals = actualFestivals;
              console.log(`🎭 Filtered festivals (holidays removed): ${festivals.length} events remaining`);
            }
          } catch (geminiError) {
            console.warn('Gemini holiday/festival fallback failed:', geminiError);
            // Continue without Gemini data - this is just a fallback
          }
        }
      } catch (error) {
        console.warn('Failed to fetch festivals, trying Gemini comprehensive search...', error);
        // Try Gemini as complete fallback if Wikidata fails entirely
        try {
          const geminiEvents = await fetchHolidaysWithGemini(`${name}, ${country}`, date);
          if (geminiEvents.length > 0) {
            console.log(`✨ Gemini comprehensive search found ${geminiEvents.length} holidays/festivals`);
            
            // Separate holidays from festivals using helper function
            const { holidays: actualHolidays, festivals: actualFestivals } = separateHolidaysFromFestivals(geminiEvents, date);
            
            if (actualHolidays.length > 0 && !isHoliday) {
              isHoliday = true;
              console.log(`✨ Found public holiday(s) from Gemini fallback: ${actualHolidays.map((h: any) => h.name).join(', ')}`);
            }
            
            // Use only the festivals (holidays filtered out)
            festivals = actualFestivals;
            console.log(`🎭 Filtered festivals in fallback (holidays removed): ${festivals.length} events remaining`);
          }
        } catch (geminiError) {
          console.warn('All festival/holiday fetching failed:', geminiError);
          // Continue without festival data - don't let this block the entire search
        }
      }

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
        nearby_festivals: festivals.map(f=>({ name:f.name, start_date:f.start_date||null, end_date:f.end_date||null, url:f.url||null, distance_km:f.distance_km||null }))
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
      setTimeout(() => {
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
        
        setStatus('Processing results…');
        setProgress(95);
        setActivities(data.data.activities);
        setWebSources(data.data.web_sources || null);
        
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
        // Always clear the interval when done
        clearInterval(messageInterval);
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
    if(fCat) list = list.filter(a=>a.category===fCat);
    if(fFree==='true') list = list.filter(a=>a.free===true);
    if(fFree==='false') list = list.filter(a=>a.free===false);
    if(fWeather) list = list.filter(a=>a.weather_fit===fWeather);
    return list;
  }, [activities, fCat, fFree, fWeather]);

  return (
    <div className="hero min-h-screen">
      <header className="mx-auto max-w-5xl px-4 pt-10 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1"></div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowExclusionManager(true)}
              className="btn btn-secondary flex items-center gap-2 text-sm"
              title="Manage Excluded Activities"
            >
              <span>🚫</span>
              <span>Exclusions</span>
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="btn btn-secondary flex items-center gap-2 text-sm"
              title="API Settings"
            >
              <span>⚙️</span>
              <span>Settings</span>
            </button>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Kids Activities Finder</h1>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Discover fun and engaging activities for your children based on location, age, weather, and local events!</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-12 space-y-6">
        <section className="card p-5 md:p-6">
          {/* Search History Dropdown */}
          {searchHistory.length > 0 && (
            <div className="mb-4 relative">
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
                <div className="absolute top-8 left-0 right-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchHistory && searchHistory.length > 0 ? searchHistory.map((entry) => {
                    // Safety check for entry data
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

          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={e=>{ e.preventDefault(); run(); }}>
            <div>
              <label className="block text-sm font-semibold mb-1 flex items-center gap-1">
                <span>📍</span>
                Location
              </label>
              <input className="input" value={location} onChange={e=>setLocation(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1 flex items-center gap-1">
                <span>📅</span>
                Date
              </label>
              <input type="date" className="input" value={date} onChange={e=>setDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Duration (hours)</label>
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
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Kids' Ages</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {ages.map(a=> (
                  <span key={a} className="chip">{a} years <button className="ml-1" onClick={(e)=>{e.preventDefault(); removeAge(a);}}>✕</button></span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={17} className="input w-32" placeholder="Age" value={ageInput} onChange={e=>setAgeInput(e.target.value)} />
                <button type="button" className="btn btn-secondary" onClick={addAge}>+ Add</button>
              </div>
            </div>
            <div className="md:col-span-2 pt-2">
              <div className="flex items-center gap-3 mb-3">
                <button className="btn btn-primary" type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Searching...
                    </>
                  ) : (
                    <>🔍 Find Activities</>
                  )}
                </button>
              </div>
              {isLoading && (
                <ProgressBar progress={progress} status={status} />
              )}
            </div>
          </form>
        </section>

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
              <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-teal-50">
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
              
              <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
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
                <article key={idx} className="relative p-5 rounded-2xl border border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200">
                  {/* Exclude button in top-right corner */}
                  <button
                    onClick={async () => {
                      if (ctx && await addToExclusionList(ctx.location, a.title || 'Untitled activity')) {
                        // Remove this activity from current results
                        setActivities(prev => prev ? prev.filter(act => act.title !== a.title) : prev);
                      }
                    }}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 opacity-80 hover:opacity-100"
                    title="Don't suggest this attraction again for this location"
                  >
                    🚫
                  </button>

                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-2xl flex-shrink-0 mt-1">{getCategoryIcon(a.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 pr-8">
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
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

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
