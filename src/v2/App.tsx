import React, { useState, useEffect, useRef } from 'react';
import SearchPage from './pages/SearchPage';
import ResultsPage from './pages/ResultsPage';
import BottomNavBar from './components/BottomNavBar';
import Settings from '../components/Settings';
import InstallPrompt from './components/InstallPrompt';
import type { CacheInfo } from './components/CacheIndicator';
import { toISODate, geocode, fetchHolidays, fetchHolidaysWithFallback, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../lib/api';
import type { Activity, Context, LLMResult } from '../lib/schema';
import { validateAIResponse, getValidationErrorSummary, ValidationError } from '../lib/validation-helpers';
import type { ValidatedLLMResult } from '../lib/validation';
import { getImageUrl, IMAGES } from '../config/assets';

// Hook to detect screen size
const useDesktopLayout = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  return isDesktop;
};

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
    cacheInfo?: CacheInfo;
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
  showExclusionManager: boolean;
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
  
  const isDesktop = useDesktopLayout();
  const [state, setState] = useState<AppState>({
    currentPage: 'search',
    showSplash: false, // Will be set to true for mobile in useEffect
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
    showSettings: false,
    showExclusionManager: false
  });
  
  console.log('🔥 V2 App state initialized:', state.currentPage);
  console.log('🖥️ Desktop layout:', isDesktop);

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

  // Handle splash screen - only show on mobile
  useEffect(() => {
    if (!isDesktop) {
      // Show splash screen on mobile/tablet
      setState(prev => ({ ...prev, showSplash: true }));
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, showSplash: false }));
      }, 3000); // 3 seconds for animation
      return () => clearTimeout(timer);
    }
    // Desktop: showSplash remains false (initialized state)
  }, [isDesktop]);

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
        extraInstructions: entry.extraInstructions || ''
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

  const handleSearch = async (retryCount: number = 0) => {
    // Prevent multiple concurrent searches (but allow retries)
    if ((state.loading.isLoading || activeSearchRef.current) && retryCount === 0) {
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
          const contentType = resp.headers.get('content-type') || '';
          let errorMessage = 'Failed to get activities from AI model';
          
          if (contentType.includes('text/html')) {
            // Handle HTML error pages (like 502 from Koyeb)
            const errorText = await resp.text();
            
            if (errorText.includes('502') || errorText.includes('Service unavailable')) {
              errorMessage = `Server temporarily unavailable (${resp.status}). The service may be starting up or experiencing high load.`;
            } else if (errorText.includes('504') || errorText.includes('timeout')) {
              errorMessage = `Request timeout (${resp.status}). The AI model took too long to respond.`;
            } else if (errorText.includes('503')) {
              errorMessage = `Service temporarily unavailable (${resp.status}). Please try again in a moment.`;
            } else {
              errorMessage = `Server error (${resp.status}). Please try again later.`;
            }
          } else {
            // Handle JSON error responses
            const errorText = await resp.text();
            errorMessage = errorText || errorMessage;
          }
          
          throw new Error(errorMessage); 
        }
        
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Server returned an unexpected response format. Please try again.');
        }
        
        const data: { ok:boolean; data: LLMResult } = await resp.json();
        if(!data.ok || !data.data?.activities) {
          throw new Error('Invalid response from AI model');
        }
        
        // Client-side validation of the AI response
        let validatedResult: ValidatedLLMResult | LLMResult = data.data;
        try {
          validatedResult = validateAIResponse(data.data, 'V2 Client-side API response');
          console.log(`✅ V2 Client-side validation successful: ${validatedResult.activities.length} activities validated`);
        } catch (validationError) {
          if (validationError instanceof ValidationError) {
            const errorSummary = getValidationErrorSummary(validationError);
            console.warn('⚠️ V2 Client-side validation failed, using server response as-is:', errorSummary);
            // Fallback to unvalidated data with warning
            validatedResult = data.data;
          } else {
            throw validationError;
          }
        }
        
        // Log activity search completion and duration
        const activitySearchEnd = Date.now();
        const duration = activitySearchEnd - activitySearchStart;
        console.log(`✅ AI search completed in ${(duration / 1000).toFixed(2)}s`);
        
        // Store search duration for future progress estimation
        storeSearchDuration(duration, validatedResult.ai_provider || 'unknown');
        
        setLoading({ isLoading: true, progress: 95, status: 'Processing results…' });
        setSearchResults({
          activities: validatedResult.activities as any as Activity[],
          webSources: validatedResult.web_sources || null,
          ctx: context,
          cacheInfo: (validatedResult as any).cacheInfo,
          aiModel: validatedResult.ai_model || undefined
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
          
          // Check if this is a retryable error
          const isRetryableError = err.message?.includes('502') || 
                                  err.message?.includes('503') || 
                                  err.message?.includes('504') || 
                                  err.message?.includes('timeout') ||
                                  err.message?.includes('temporarily unavailable');
          
          if (isRetryableError && retryCount < 2) {
            console.log(`Retrying search (attempt ${retryCount + 1}/2) due to temporary error:`, err.message);
            setLoading({ 
              isLoading: true, 
              progress: 30, 
              status: `Retry ${retryCount + 1}/2: Server temporarily unavailable...` 
            });
            
            // Mark search as inactive to allow retry
            activeSearchRef.current = false;
            
            // Wait a bit before retrying
            setTimeout(() => {
              handleSearch(retryCount + 1);
            }, 2000);
            return;
          }
          
          // Show user-friendly error message
          const userFriendlyMessage = err.message?.includes('Server temporarily unavailable') 
            ? 'The AI service is temporarily unavailable. This usually resolves within a minute. Please try again shortly.'
            : err.message || 'Something went wrong while searching for activities';
            
          setLoading({ isLoading: false, progress: 0, status: `Error: ${userFriendlyMessage}` });
          
          // Clear error after 8 seconds to allow retry
          setTimeout(() => {
            setLoading({ isLoading: false, progress: 0, status: '' });
          }, 8000);
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
      
      // Client-side validation for fresh search
      let validatedFreshResult: ValidatedLLMResult | LLMResult = data.data;
      try {
        validatedFreshResult = validateAIResponse(data.data, 'V2 Fresh search API response');
        console.log(`✅ V2 Fresh search validation successful: ${validatedFreshResult.activities.length} activities validated`);
      } catch (validationError) {
        if (validationError instanceof ValidationError) {
          const errorSummary = getValidationErrorSummary(validationError);
          console.warn('⚠️ V2 Fresh search validation failed, using server response as-is:', errorSummary);
          validatedFreshResult = data.data;
        } else {
          throw validationError;
        }
      }
      
      setLoading({ isLoading: true, progress: 95, status: 'Processing fresh results...' });
      
      // Update with fresh results
      setSearchResults({
        activities: validatedFreshResult.activities as any as Activity[],
        webSources: validatedFreshResult.web_sources || null,
        ctx: context,
        cacheInfo: (validatedFreshResult as any).cacheInfo,
        aiModel: validatedFreshResult.ai_model || undefined
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

  // Desktop Top Navigation Component
  const renderDesktopTopNav = () => (
    <div className="desktop-top-nav">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 
            className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent cursor-pointer hover:scale-105 transition-transform duration-200"
            onClick={() => setState(prev => ({ ...prev, searchResults: { ...prev.searchResults, activities: null } }))}
            title="Back to search"
          >
            Fun Finder
          </h1>
          {state.loading.isLoading && (
            <div className="flex items-center gap-3">
              <div className="loading-spinner-small">
                <div className="spinner-ring-small"></div>
              </div>
              <span className="text-sm text-gray-600">{state.loading.status}</span>
              <span className="text-sm font-bold text-purple-600">{state.loading.progress}%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {state.searchResults.activities && (
            <button
              onClick={handleRefreshSearch}
              disabled={state.loading.isLoading}
              className="desktop-nav-btn bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
              title="Refresh search results"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Fresh Search
            </button>
          )}
          <button
            onClick={() => setState(prev => ({ ...prev, showExclusionManager: true }))}
            className="desktop-nav-btn bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
            title="Manage exclusion list"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Exclusions
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, showSettings: true }))}
            className="desktop-nav-btn bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </div>
      {state.loading.isLoading && (
        <div className="w-full bg-gray-200 h-1">
          <div 
            className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 h-1 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, state.loading.progress))}%` }}
          />
        </div>
      )}
    </div>
  );

  console.log('🔥 V2 App rendering, current page:', state.currentPage);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* PWA Install Prompt */}
      <InstallPrompt />
      
      {/* Desktop Top Navigation */}
      {isDesktop && renderDesktopTopNav()}
      
      {/* Main Content */}
      <main className={isDesktop ? '' : (state.currentPage === 'search' ? 'pb-24' : '')}>
        {isDesktop ? (
          // Desktop Layout: Side-by-side when results are available
          <div className="desktop-layout">
            {state.searchResults.activities ? (
              // Side-by-side layout
              <div className="flex" style={{ height: 'calc(100vh - 80px)' }}>
                <div className="w-2/5 border-r border-gray-200 overflow-y-auto">
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
                    isDesktopSidebar={true}
                    searchContext={state.searchResults.ctx}
                  />
                </div>
                <div className="w-3/5 overflow-y-auto">
                  <ResultsPage
                    searchResults={state.searchResults}
                    searchParams={state.searchParams}
                    loading={state.loading}
                    exclusionList={state.exclusionList}
                    addToExclusionList={addToExclusionList}
                    removeFromExclusionList={removeFromExclusionList}
                    backToSearch={() => setState(prev => ({ ...prev, searchResults: { ...prev.searchResults, activities: null } }))}
                    onRefreshSearch={handleRefreshSearch}
                    isDesktopSideBySide={true}
                  />
                </div>
              </div>
            ) : (
              // Full-width search page
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
                isDesktop={true}
              />
            )}
          </div>
        ) : (
          // Mobile Layout: Original behavior
          <>
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
          </>
        )}
      </main>

      {/* Bottom Navigation - Only show on mobile search page */}
      {!isDesktop && state.currentPage === 'search' && (
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

      {/* Exclusion Manager Modal */}
      {state.showExclusionManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Manage Excluded Activities</h2>
                <button
                  onClick={() => setState(prev => ({ ...prev, showExclusionManager: false }))}
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
              {Object.keys(state.exclusionList).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-4">🎯</span>
                  <p>No exclusions yet!</p>
                  <p className="text-sm">Use the "Don't suggest this again" button on activities to add exclusions.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(state.exclusionList).map(([location, attractions]) => (
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
          </div>
        </div>
      )}

      {/* Splash Screen Overlay */}
      {state.showSplash && (
        <div className="splash-screen">

          <div className="splash-top splash-layer">
            <img src={getImageUrl('BGPC')} alt="Fun Finder" className="splash-image splash-image-desktop" />
            <img src={getImageUrl('BG7')} alt="Fun Finder" className="splash-image splash-image-mobile" />
          </div>
          <div className="splash-bottom splash-layer">
            <img src={getImageUrl('BGPC')} alt="Fun Finder" className="splash-image splash-image-desktop" />
            <img src={getImageUrl('BG7')} alt="Fun Finder" className="splash-image splash-image-mobile" />
          </div>
        </div>
      )}
    </div>
  );
}
