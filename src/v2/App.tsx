import React, { useState, useEffect, useRef } from 'react';
import SearchPage from './pages/SearchPage';
import ResultsPage from './pages/ResultsPage';
import BottomNavBar from './components/BottomNavBar';
import Settings from '../components/Settings';
import { toISODate, geocode, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../lib/api';
import type { Activity, Context, LLMResult } from '../lib/schema';

interface SearchHistoryEntry {
  id: string;
  location: string;
  date: string;
  duration: number;
  kidsAges: number[];
  timestamp: string;
  searchCount: number;
}

export type AppPage = 'search' | 'results';

interface AppState {
  currentPage: AppPage;
  showSplash: boolean;
  searchParams: {
    location: string;
    date: string;
    duration: number | '';
    ages: number[];
    extraInstructions: string;
  };
  searchResults: {
    activities: Activity[] | null;
    ctx: Context | null;
    webSources: Array<{title: string; url: string; source: string}> | null;
  };
  loading: {
    isLoading: boolean;
    progress: number;
    status: string;
  };
  searchHistory: SearchHistoryEntry[];
  exclusionList: {[location: string]: string[]};
  showSettings: boolean;
}

// Utility functions for search duration tracking
const getSearchHistory = (): Array<{duration: number, model: string, timestamp: number}> => {
  try {
    const history = localStorage.getItem('searchDurationHistory');
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

const storeSearchDuration = (duration: number, model: string) => {
  try {
    const history = getSearchHistory();
    const newEntry = { duration, model, timestamp: Date.now() };
    
    // Keep only last 10 entries
    const updatedHistory = [...history, newEntry].slice(-10);
    localStorage.setItem('searchDurationHistory', JSON.stringify(updatedHistory));
  } catch (err) {
    console.warn('Failed to store search duration:', err);
  }
};

const getEstimatedProgressSteps = () => {
  const history = getSearchHistory();
  if (history.length === 0) {
    // Default progression if no history
    return {
      activitySearchStartProgress: 85,
      estimatedDuration: 60000 // 60 seconds default
    };
  }
  
  // Calculate average duration
  const avgDuration = history.reduce((sum, entry) => sum + entry.duration, 0) / history.length;
  
  // Allocate 15% of progress bar for activity search based on historical data
  // If activity search typically takes 80% of total time, allocate more progress to it
  const totalEstimatedTime = avgDuration * 1.2; // Add buffer
  const activitySearchStartProgress = Math.max(75, Math.min(85, 85 - (avgDuration / totalEstimatedTime) * 20));
  
  return {
    activitySearchStartProgress,
    estimatedDuration: avgDuration
  };
};

export default function App() {
  const [state, setState] = useState<AppState>({
    currentPage: 'search',
    showSplash: true,
    searchParams: {
      location: '',
      date: '',
      duration: '',
      ages: [],
      extraInstructions: ''
    },
    searchResults: {
      activities: null,
      ctx: null,
      webSources: null
    },
    loading: {
      isLoading: false,
      progress: 0,
      status: ''
    },
    searchHistory: [],
    exclusionList: {},
    showSettings: false
  });

  // Add AbortController ref for search cancellation
  const searchAbortController = useRef<AbortController | null>(null);
  // Add ref to store the showResults timeout so it can be cancelled
  const showResultsTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load initial data
  useEffect(() => {
    loadSearchHistory();
    loadExclusionList();
  }, []);

  // Handle splash screen
  useEffect(() => {
    const timer = setTimeout(() => {
      setState(prev => ({ ...prev, showSplash: false }));
    }, 3000); // 3 seconds for animation
    return () => clearTimeout(timer);
  }, []);

  const loadSearchHistory = async () => {
    try {
      const response = await fetch('/api/search-history');
      const data = await response.json();
      if (data.ok) {
        setState(prev => ({
          ...prev,
          searchHistory: data.history
        }));
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
        setState(prev => ({
          ...prev,
          exclusionList: data.exclusions
        }));
      }
    } catch (error) {
      console.error('Failed to load exclusion list:', error);
    }
  };

  const updateSearchParams = (params: Partial<AppState['searchParams']>) => {
    setState(prev => ({
      ...prev,
      searchParams: { ...prev.searchParams, ...params }
    }));
  };

  const setCurrentPage = (page: AppPage) => {
    setState(prev => ({ ...prev, currentPage: page }));
  };

  const setLoading = (loading: Partial<AppState['loading']>) => {
    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, ...loading }
    }));
  };

  const setSearchResults = (results: Partial<AppState['searchResults']>) => {
    setState(prev => ({
      ...prev,
      searchResults: { ...prev.searchResults, ...results }
    }));
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
        setState(prev => ({
          ...prev,
          exclusionList: data.exclusions
        }));
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
        setState(prev => ({
          ...prev,
          exclusionList: data.exclusions
        }));
        return true;
      }
    } catch (error) {
      console.error('Failed to remove from exclusion list:', error);
    }
    return false;
  };

  const deleteHistoryEntry = async (id: string) => {
    try {
      const response = await fetch(`/api/search-history/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.ok) {
        setState(prev => ({
          ...prev,
          searchHistory: prev.searchHistory.filter(entry => entry.id !== id)
        }));
      }
    } catch (error) {
      console.error('Failed to delete search history entry:', error);
    }
  };

  const loadFromHistory = (entry: SearchHistoryEntry) => {
    try {
      updateSearchParams({
        location: entry.location || '',
        date: entry.date || '',
        duration: entry.duration || '',
        ages: Array.isArray(entry.kidsAges) ? entry.kidsAges : [],
        extraInstructions: ''
      });
    } catch (error) {
      console.error('Error loading from history:', error);
      alert('Failed to load search from history');
    }
  };

  const showResults = () => {
    setCurrentPage('results');
  };

  const backToSearch = () => {
    setCurrentPage('search');
  };

  const reloadSearchHistory = () => {
    loadSearchHistory();
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

  const handleSearch = async () => {
    const ALLOWED_CATS = 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other';
    const { location, date, duration, ages, extraInstructions } = state.searchParams;

    try {
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
        alert('Please select at least one age group');
        return;
      }

      // Create new AbortController for this search
      searchAbortController.current = new AbortController();

      // Clear existing results and reset states
      setLoading({ isLoading: true, progress: 0, status: 'Starting search...' });
      setSearchResults({ activities: null, webSources: null, ctx: null });
      
      setLoading({ isLoading: true, progress: 10, status: 'Geocoding location…' });
      const g = await geocode(location, searchAbortController.current?.signal);
      const { latitude: lat, longitude: lon, country_code, name, country } = g as any;

      setLoading({ isLoading: true, progress: 25, status: 'Fetching weather forecast…' });
      let w: { tmax: number | null; tmin: number | null; pprob: number | null; wind: number | null } = { tmax: null, tmin: null, pprob: null, wind: null };
      try {
        w = await fetchWeatherDaily(lat, lon, date, searchAbortController.current?.signal);
      } catch (error) {
        console.warn('Weather data not available for this date, using default values:', error);
      }

      setLoading({ isLoading: true, progress: 40, status: 'Checking public holidays…' });
      let isHoliday = false;
      try {
        const hol = await fetchHolidays(country_code, date.slice(0,4), searchAbortController.current?.signal);
        const matches = hol.filter((h:any)=>h.date===date);
        isHoliday = matches.length>0;
      } catch (error) {
        console.warn('Failed to fetch holidays, continuing without holiday data:', error);
      }

      setLoading({ isLoading: true, progress: 55, status: 'Searching for nearby festivals…' });
      let festivals: Array<{name:string; url:string|null; start_date:string|null; end_date:string|null; lat:number|null; lon:number|null; distance_km:number|null}> = [];
      try {
        festivals = await fetchFestivalsWikidata(lat, lon, date, 60, searchAbortController.current?.signal);
        
        if (festivals.length === 0) {
          console.log('No festivals found from Wikidata, trying Gemini comprehensive search...');
          try {
            const geminiEvents = await fetchHolidaysWithGemini(`${name}, ${country}`, date, searchAbortController.current?.signal);
            if (geminiEvents.length > 0) {
              console.log(`✨ Gemini found ${geminiEvents.length} holidays/festivals in 3-day period around ${date}`);
              
              const { holidays: actualHolidays, festivals: actualFestivals } = separateHolidaysFromFestivals(geminiEvents, date);
              
              if (actualHolidays.length > 0 && !isHoliday) {
                isHoliday = true;
                console.log(`✨ Found public holiday(s) from Gemini: ${actualHolidays.map((h: any) => h.name).join(', ')}`);
              }
              
              festivals = actualFestivals;
              console.log(`🎭 Filtered festivals (holidays removed): ${festivals.length} events remaining`);
            }
          } catch (geminiError) {
            console.warn('Gemini holiday/festival fallback failed:', geminiError);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch festivals, trying Gemini comprehensive search...', error);
        try {
          const geminiEvents = await fetchHolidaysWithGemini(`${name}, ${country}`, date, searchAbortController.current?.signal);
          if (geminiEvents.length > 0) {
            console.log(`✨ Gemini comprehensive search found ${geminiEvents.length} holidays/festivals`);
            
            const { holidays: actualHolidays, festivals: actualFestivals } = separateHolidaysFromFestivals(geminiEvents, date);
            
            if (actualHolidays.length > 0 && !isHoliday) {
              isHoliday = true;
              console.log(`✨ Found public holiday(s) from Gemini fallback: ${actualHolidays.map((h: any) => h.name).join(', ')}`);
            }
            
            festivals = actualFestivals;
            console.log(`🎭 Filtered festivals in fallback (holidays removed): ${festivals.length} events remaining`);
          }
        } catch (geminiError) {
          console.warn('All festival/holiday fetching failed:', geminiError);
        }
      }

      const context: Context = {
        location: `${name}, ${country}`,
        date,
        duration_hours: duration as number,
        ages,
        weather: {
          temperature_min_c: w.tmin,
          temperature_max_c: w.tmax,
          precipitation_probability_percent: w.pprob,
          wind_speed_max_kmh: w.wind
        },
        is_public_holiday: isHoliday,
        nearby_festivals: festivals.map(f=>({ name:f.name, start_date:f.start_date||null, end_date:f.end_date||null, url:f.url||null, distance_km:f.distance_km||null })),
        ...(extraInstructions.trim() && { extra_instructions: extraInstructions.trim() })
      };

      const { activitySearchStartProgress } = getEstimatedProgressSteps();
      
      setLoading({ isLoading: true, progress: 75, status: 'Searching web for current events & recommendations…' });
      setLoading({ isLoading: true, progress: activitySearchStartProgress, status: 'Generating activity recommendations… This might take a while' });
      
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
        setLoading({ isLoading: true, progress: activitySearchStartProgress, status: loadingMessages[messageIndex] });
      }, 15000);
      
      const messageTimeout = setTimeout(() => {
        if (messageIndex === 0) {
          messageIndex = 1;
          setLoading({ isLoading: true, progress: activitySearchStartProgress, status: loadingMessages[messageIndex] });
        }
      }, 5000);
      
      try {
        // Log activity search start
        const activitySearchStart = Date.now();
        console.log('🚀 [Activity Search] Starting activity search request...');
        
        const resp = await fetch('/api/activities', { 
          method:'POST', 
          headers:{ 'Content-Type':'application/json' }, 
          body: JSON.stringify({ ctx: context, allowedCategories: ALLOWED_CATS }),
          signal: searchAbortController.current?.signal
        });
        
        if(!resp.ok){ 
          const errorText = await resp.text();
          throw new Error(errorText || 'Failed to get activities from AI model'); 
        }
        const data: { ok:boolean; data: LLMResult } = await resp.json();
        if(!data.ok || !data.data?.activities) {
          throw new Error('Invalid response from AI model');
        }
        
        // Log activity search completion and duration
        const activitySearchEnd = Date.now();
        const duration = activitySearchEnd - activitySearchStart;
        console.log(`✅ [Activity Search] Completed in ${(duration / 1000).toFixed(2)}s (${duration}ms)`);
        
        // Store search duration for future progress estimation
        storeSearchDuration(duration, data.data.ai_provider || 'unknown');
        
        setLoading({ isLoading: true, progress: 95, status: 'Processing results…' });
        setSearchResults({
          activities: data.data.activities,
          webSources: data.data.web_sources || null,
          ctx: context
        });
        
        setLoading({ isLoading: true, progress: 100, status: 'Complete!' });
        
        reloadSearchHistory();
        
        showResultsTimeout.current = setTimeout(() => {
          setLoading({ isLoading: false, progress: 0, status: '' });
          showResults();
          showResultsTimeout.current = null;
        }, 1000);
        
      } catch(err:any){
        if (err.name === 'AbortError') {
          console.log('Search was cancelled by user');
          setLoading({ isLoading: false, progress: 0, status: 'Search cancelled' });
        } else {
          console.error(err);
          setLoading({ isLoading: false, progress: 0, status: err.message || 'Something went wrong' });
        }
      } finally {
        clearInterval(messageInterval);
        clearTimeout(messageTimeout);
      }
      
    } catch(err:any){
      if (err.name === 'AbortError') {
        console.log('Search was cancelled by user');
        setLoading({ isLoading: false, progress: 0, status: 'Search cancelled' });
      } else {
        console.error(err);
        setLoading({ isLoading: false, progress: 0, status: err.message || 'Something went wrong' });
      }
    }
  };

  const handleCancelSearch = () => {
    if (searchAbortController.current) {
      searchAbortController.current.abort();
      searchAbortController.current = null;
    }
    // Clear the showResults timeout to prevent results from appearing
    if (showResultsTimeout.current) {
      clearTimeout(showResultsTimeout.current);
      showResultsTimeout.current = null;
    }
    setLoading({ isLoading: false, progress: 0, status: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Main Content */}
      <main className="pb-24">
        {state.currentPage === 'search' && (
          <SearchPage
            searchParams={state.searchParams}
            updateSearchParams={updateSearchParams}
            searchHistory={state.searchHistory}
            loading={state.loading}
            setLoading={setLoading}
            setSearchResults={setSearchResults}
            showResults={showResults}
            deleteHistoryEntry={deleteHistoryEntry}
            loadFromHistory={loadFromHistory}
            reloadSearchHistory={reloadSearchHistory}
            onSearch={handleSearch}
          />
        )}
        
        {state.currentPage === 'results' && (
          <ResultsPage
            searchResults={state.searchResults}
            searchParams={state.searchParams}
            loading={state.loading}
            exclusionList={state.exclusionList}
            addToExclusionList={addToExclusionList}
            removeFromExclusionList={removeFromExclusionList}
            backToSearch={backToSearch}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNavBar
        currentPage={state.currentPage}
        setCurrentPage={setCurrentPage}
        loading={state.loading}
        hasResults={state.searchResults.activities !== null}
        onSettingsOpen={() => setState(prev => ({ ...prev, showSettings: true }))}
        exclusionList={state.exclusionList}
        removeFromExclusionList={removeFromExclusionList}
        onSearch={handleSearch}
        setLoading={setLoading}
        onCancelSearch={handleCancelSearch}
        searchParams={state.searchParams}
      />

      {/* Settings Modal */}
      <Settings 
        isOpen={state.showSettings} 
        onClose={() => setState(prev => ({ ...prev, showSettings: false }))} 
      />

      {/* Splash Screen Overlay */}
      {state.showSplash && (
        <div className="splash-screen">
          <div className="splash-top">
            <img src="/bg7.jpeg" alt="Fun Finder" className="splash-image" />
          </div>
          <div className="splash-bottom">
            <img src="/bg7.jpeg" alt="Fun Finder" className="splash-image" />
          </div>
        </div>
      )}
    </div>
  );
}
