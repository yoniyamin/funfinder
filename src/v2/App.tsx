import React, { useState, useEffect, useRef } from 'react';
import SearchPage from './pages/SearchPage';
import ResultsPage from './pages/ResultsPage';
import BottomNavBar from './components/BottomNavBar';
import Settings from '../components/Settings';
import { toISODate, geocode, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../lib/api';
import type { Activity, Context, LLMResult } from '../lib/schema';
import { getImageUrl, IMAGES } from '../config/assets';

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
    cacheInfo?: {
      isCached: boolean;
      cacheType: 'exact' | 'similar';
      similarity: number;
      originalSearch: {
        location: string;
        date: string;
        searchKey: string;
      };
    };
    aiModel?: string;
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
  console.log('🔥 V2 App component mounting...');
  
  const [state, setState] = useState<AppState>({
    currentPage: 'search',
    showSplash: true,
    searchParams: {
      location: '',
      date: '',
      duration: 1,
      ages: [],
      extraInstructions: ''
    },
    searchResults: {
      activities: null,
      ctx: null,
      webSources: null,
      aiModel: undefined
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
  
  console.log('🔥 V2 App state initialized:', state.currentPage);

  // Add AbortController ref for search cancellation
  const searchAbortController = useRef<AbortController | null>(null);
  // Add ref to store the showResults timeout so it can be cancelled
  const showResultsTimeout = useRef<number | null>(null);
  // Add refs to store message intervals so they can be cancelled
  const messageInterval = useRef<number | null>(null);
  const messageTimeout = useRef<number | null>(null);
  // Add a ref to track if a search is actively running to prevent StrictMode interference
  const activeSearchRef = useRef<boolean>(false);

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

  // Cleanup function to prevent memory leaks and request cancellation
  useEffect(() => {
    console.log('🔄 App component mounted/updated');
    return () => {
      console.warn('🚨 App component cleanup triggered');
      console.log('🚨 Active search status:', activeSearchRef.current);
      
      // Only cleanup timeouts and intervals, never abort active searches
      // This prevents React StrictMode from cancelling legitimate requests
      if (showResultsTimeout.current) {
        clearTimeout(showResultsTimeout.current);
      }
      if (messageInterval.current) {
        clearInterval(messageInterval.current);
      }
      if (messageTimeout.current) {
        clearTimeout(messageTimeout.current);
      }
      
      // NEVER abort searchAbortController here - let searches complete naturally
      console.log('🔄 Cleanup completed without aborting active searches');
    };
  }, []);

  // Add debug effect to track state changes
  useEffect(() => {
    console.log('📊 Loading state changed:', state.loading);
  }, [state.loading]);

  // Add debug effect to track page changes
  useEffect(() => {
    console.log('📄 Current page changed:', state.currentPage);
  }, [state.currentPage]);

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
    // Prevent multiple concurrent searches
    if (state.loading.isLoading || activeSearchRef.current) {
      console.log('🚫 Search already in progress, ignoring new search request');
      return;
    }

    // Mark search as active to prevent StrictMode interference
    activeSearchRef.current = true;
    console.log('🔄 Search marked as active, StrictMode remounts will be ignored');
    
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

      // Don't use AbortController for now - it's causing StrictMode issues
      // Clear any existing AbortController first
      if (searchAbortController.current) {
        searchAbortController.current = null;
      }
      
      console.log('🔄 Search starting without AbortController to avoid StrictMode interference');

      // Clear existing results and reset states
      console.log('🚀 Starting search process...');
      setSearchResults({ activities: null, webSources: null, ctx: null, aiModel: undefined });
      setLoading({ isLoading: true, progress: 0, status: 'Starting search...' });
      
      // Add small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setLoading({ isLoading: true, progress: 10, status: 'Geocoding location…' });
      const g = await geocode(location);
      const { latitude: lat, longitude: lon, country_code, name, country } = g as any;

      setLoading({ isLoading: true, progress: 25, status: 'Fetching weather forecast…' });
      let w: { tmax: number | null; tmin: number | null; pprob: number | null; wind: number | null } = { tmax: null, tmin: null, pprob: null, wind: null };
      
      // Try to get cached weather data first
      try {
        const cachedWeather = await fetch('/api/weather-cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: `${name}, ${country}`, date })
        });
        
        if (cachedWeather.ok) {
          const weatherData = await cachedWeather.json();
          if (weatherData.ok && weatherData.weather) {
            console.log('🌤️ Using cached weather data for:', `${name}, ${country}`, date);
            w = weatherData.weather;
          } else {
            // No cached weather, fetch fresh data
            w = await fetchWeatherDaily(lat, lon, date);
            
            // Cache the fresh weather data
            await fetch('/api/weather-cache', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                location: `${name}, ${country}`, 
                date, 
                weather: w 
              })
            });
          }
        } else {
          // Fallback to direct API call
          w = await fetchWeatherDaily(lat, lon, date);
        }
      } catch (error) {
        console.warn('Weather data not available for this date, using default values:', error);
      }

      setLoading({ isLoading: true, progress: 40, status: 'Checking public holidays…' });
      let isHoliday = false;
      let holidayDetails: Array<{name: string; localName: string; date: string}> = [];
      try {
        const hol = await fetchHolidays(country_code, date.slice(0,4));
        // Ensure date is in YYYY-MM-DD format for comparison
        const normalizedDate = new Date(date).toISOString().split('T')[0];
        const matches = hol.filter((h:any)=>h.date===normalizedDate);
        isHoliday = matches.length>0;
        if (matches.length > 0) {
          holidayDetails = matches.map((h: any) => ({
            name: h.name,
            localName: h.localName,
            date: h.date
          }));
          console.log(`🎊 Found public holiday on ${normalizedDate}:`, matches.map((h: any) => h.localName || h.name).join(', '));
        } else {
          console.log(`📅 No public holidays found for ${normalizedDate}`);
        }
      } catch (error) {
        console.warn('Failed to fetch holidays, continuing without holiday data:', error);
      }

      setLoading({ isLoading: true, progress: 55, status: 'Preparing search context…' });
      // Holiday and festival information is now handled server-side in the activity search
      console.log('🎭 Holiday and festival context will be gathered server-side during activity search');

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
        nearby_festivals: [], // Will be populated server-side with holiday/festival context
        holidays: holidayDetails, // Include actual holiday details for UI display
        ...(extraInstructions.trim() && { extra_instructions: extraInstructions.trim() })
      };

      const { activitySearchStartProgress } = getEstimatedProgressSteps();
      
      setLoading({ isLoading: true, progress: 75, status: 'Searching web for current events & recommendations…' });
      
      // Add small delay to prevent race conditions
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setLoading({ isLoading: true, progress: activitySearchStartProgress, status: 'Generating activity recommendations… This might take a while' });
      
      console.log(`🎯 Starting AI search at ${activitySearchStartProgress}% progress`);
      
      // Add another small delay to ensure loading state is rendered
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Clear any existing intervals first to prevent interference
      if (messageInterval.current) {
        clearInterval(messageInterval.current);
        messageInterval.current = null;
      }
      if (messageTimeout.current) {
        clearTimeout(messageTimeout.current);
        messageTimeout.current = null;
      }
      
      try {
        // Log activity search start
        const activitySearchStart = Date.now();
        console.log('🚀 Starting AI activity search...');
        
        console.log('📡 Making fetch request to /api/activities');
        console.log('📡 Request payload size:', JSON.stringify({ ctx: context, allowedCategories: ALLOWED_CATS }).length, 'bytes');
        console.log('📡 No AbortController - testing StrictMode fix');
        
        // Add a delay before fetch to ensure everything is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Fix for connection close issue - use keepalive and proper headers
        console.log('🔧 Using enhanced fetch configuration to prevent connection close');
        
        const fetchPromise = fetch('/api/activities', { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          }, 
          body: JSON.stringify({ ctx: context, allowedCategories: ALLOWED_CATS }),
          keepalive: true,
          // Remove signal temporarily to isolate the issue
          // signal: searchAbortController.current?.signal
        });
        
        console.log('📡 Fetch promise created, waiting for response...');
        
        // Add timeout wrapper to detect hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 120 seconds')), 120000);
        });
        
        const resp = await Promise.race([fetchPromise, timeoutPromise]) as Response;
        
        console.log('📡 Fetch request completed, status:', resp.status);
        console.log('📡 Response content-type:', resp.headers.get('content-type'));
        console.log('📡 Response content-length:', resp.headers.get('content-length'));
        
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
        console.log(`✅ AI search completed in ${(duration / 1000).toFixed(2)}s`);
        
        // Store search duration for future progress estimation
        storeSearchDuration(duration, data.data.ai_provider || 'unknown');
        
        setLoading({ isLoading: true, progress: 95, status: 'Processing results…' });
        setSearchResults({
          activities: data.data.activities,
          webSources: data.data.web_sources || null,
          ctx: context,
          cacheInfo: (data.data as any).cacheInfo,
          aiModel: data.data.ai_model || undefined
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
          console.log('🚫 Search was cancelled by user');
          setLoading({ isLoading: false, progress: 0, status: 'Search cancelled' });
        } else {
          console.error('❌ Search error:', err.message);
          setLoading({ isLoading: false, progress: 0, status: err.message || 'Something went wrong' });
        }
      } finally {
        // Cleanup intervals and timeouts
        if (messageInterval.current) {
          clearInterval(messageInterval.current);
          messageInterval.current = null;
        }
        if (messageTimeout.current) {
          clearTimeout(messageTimeout.current);
          messageTimeout.current = null;
        }
        // Clear the AbortController now that search is completely done
        if (searchAbortController.current) {
          searchAbortController.current = null;
        }
        // Mark search as no longer active
        activeSearchRef.current = false;
        console.log('🔄 Search marked as inactive, cleanup completed');
      }
    } catch(err:any){
      if (err.name === 'AbortError') {
        console.log('🚫 Search was cancelled by user');
        setLoading({ isLoading: false, progress: 0, status: 'Search cancelled' });
      } else {
        console.error('❌ Search error:', err.message);
        setLoading({ isLoading: false, progress: 0, status: err.message || 'Something went wrong' });
      }
      // Mark search as no longer active in case of error
      activeSearchRef.current = false;
    }
  };

  const handleCancelSearch = () => {
    console.log('🚫 Cancel button clicked - USER INITIATED CANCELLATION');
    console.trace('🚫 Cancel search stack trace:');
    
    if (searchAbortController.current) {
      console.log('🚫 Aborting search...');
      searchAbortController.current.abort();
    }
    
    // Clear timeouts and intervals to stop status updates
    if (showResultsTimeout.current) {
      clearTimeout(showResultsTimeout.current);
      showResultsTimeout.current = null;
    }
    
    if (messageInterval.current) {
      clearInterval(messageInterval.current);
      messageInterval.current = null;
    }
    
    if (messageTimeout.current) {
      clearTimeout(messageTimeout.current);
      messageTimeout.current = null;
    }
    
    // Mark search as no longer active
    activeSearchRef.current = false;
    
    setLoading({ isLoading: false, progress: 0, status: 'Search cancelled by user' });
    console.log('🚫 Search cancelled successfully');
  };

  const handleRefreshSearch = async () => {
    console.log('🔄 Starting fresh search without cache...');
    
    // Prevent multiple concurrent searches
    if (state.loading.isLoading || activeSearchRef.current) {
      console.log('🚫 Search already in progress, ignoring refresh request');
      return;
    }

    // Mark search as active
    activeSearchRef.current = true;
    
    const ALLOWED_CATS = 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other';
    
    try {
      setLoading({ isLoading: true, progress: 30, status: 'Running fresh search...' });
      
      // Use the current search context but bypass cache
      const context = state.searchResults.ctx;
      if (!context) {
        console.error('No search context available for refresh');
        return;
      }

      setLoading({ isLoading: true, progress: 70, status: 'Generating fresh recommendations...' });

      const fetchPromise = fetch('/api/activities', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        }, 
        body: JSON.stringify({ 
          ctx: context, 
          allowedCategories: ALLOWED_CATS,
          bypassCache: true // Flag to bypass cache
        }),
        keepalive: true
      });
      
      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 120 seconds')), 120000);
      });
      
      const resp = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!resp.ok) { 
        const errorText = await resp.text();
        throw new Error(errorText || 'Failed to get fresh activities from AI model'); 
      }
      
      const data: { ok: boolean; data: LLMResult } = await resp.json();
      if (!data.ok || !data.data?.activities) {
        throw new Error('Invalid response from AI model');
      }
      
      setLoading({ isLoading: true, progress: 95, status: 'Processing fresh results...' });
      
      // Update with fresh results
      setSearchResults({
        activities: data.data.activities,
        webSources: data.data.web_sources || null,
        ctx: context,
        cacheInfo: (data.data as any).cacheInfo,
        aiModel: data.data.ai_model || undefined
      });
      
      setLoading({ isLoading: true, progress: 100, status: 'Fresh search complete!' });
      
      setTimeout(() => {
        setLoading({ isLoading: false, progress: 0, status: '' });
      }, 1000);
      
      console.log('✅ Fresh search completed successfully');
      
    } catch (error) {
      console.error('❌ Fresh search failed:', error);
      setLoading({ isLoading: false, progress: 0, status: '' });
      alert('Fresh search failed. Please try again.');
    } finally {
      activeSearchRef.current = false;
    }
  };

  console.log('🔥 V2 App rendering, current page:', state.currentPage);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Main Content */}
      <main className={state.currentPage === 'search' ? 'pb-24' : ''}>
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
            onRefreshSearch={handleRefreshSearch}
          />
        )}
      </main>

      {/* Bottom Navigation - Only show on search page */}
      {state.currentPage === 'search' && (
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
      )}

      {/* Settings Modal */}
      <Settings 
        isOpen={state.showSettings} 
        onClose={() => setState(prev => ({ ...prev, showSettings: false }))} 
      />

      {/* Splash Screen Overlay */}
      {state.showSplash && (
        <div className="splash-screen">
          <div className="splash-top">
            <img src={getImageUrl('BGPC')} alt="Fun Finder" className="splash-image splash-image-desktop" />
            <img src={getImageUrl('BG7')} alt="Fun Finder" className="splash-image splash-image-mobile" />
          </div>
          <div className="splash-bottom">
            <img src={getImageUrl('BGPC')} alt="Fun Finder" className="splash-image splash-image-desktop" />
            <img src={getImageUrl('BG7')} alt="Fun Finder" className="splash-image splash-image-mobile" />
          </div>
        </div>
      )}
    </div>
  );
}
