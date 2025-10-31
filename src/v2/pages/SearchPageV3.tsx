import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toISODate, geocode, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../../lib/api';
import type { Context, LLMResult } from '../../lib/schema';
import { getImageUrl } from '../../config/assets';
import { AnimatedModal } from '../components/AnimatedModal';
import { ExclusionManager } from '../components/ExclusionManager';
import LucideLoader from '../components/LucideLoader';
import Settings from '../../components/Settings';
import { 
  MapPin, Calendar, Users, Clock, Search, History, Settings as SettingsIcon, 
  X, Plus, Sparkles, Loader, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Trees, Building2, Palette, Home, Star, Ban, Sliders
} from 'lucide-react';

// Dynamic loading messages that rotate when status seems stuck
const DYNAMIC_MESSAGES = [
  "Finding the best activities for you...",
  "Searching nearby attractions...",
  "Checking weather conditions...",
  "Looking for festivals and events...",
  "Finding family-friendly options...",
  "Almost there, hang tight!",
  "Gathering recommendations...",
  "Personalizing your results..."
];

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

interface City {
  name: string;
  country: string;
}

interface SearchPageProps {
  searchParams: {
    location: string;
    date: string;
    duration: number | '';
    ages: number[];
    extraInstructions: string;
  };
  updateSearchParams: (params: any) => void;
  searchHistory: SearchHistoryEntry[];
  loading: {
    isLoading: boolean;
    progress: number;
    status: string;
  };
  setLoading: (loading: any) => void;
  setSearchResults: (results: any) => void;
  showResults: () => void;
  deleteHistoryEntry: (id: string) => void;
  loadFromHistory: (entry: SearchHistoryEntry) => void;
  reloadSearchHistory: () => void;
  onSearch?: () => void;
  isDesktop?: boolean;
  isDesktopSidebar?: boolean;
  searchContext?: any;
  exclusionList?: {[location: string]: string[]};
  removeFromExclusionList?: (location: string, attraction: string) => Promise<boolean>;
}

const AGE_OPTIONS = [
  { value: 'toddlers', label: 'Toddlers (0-2)', ages: [0, 1, 2] },
  { value: 'preschoolers', label: 'Preschoolers (3-5)', ages: [3, 4, 5] },
  { value: 'early-elementary', label: 'Elementary (6-8)', ages: [6, 7, 8] },
  { value: 'pre-teens', label: 'Pre-teens (9-12)', ages: [9, 10, 11, 12] },
  { value: 'teenagers', label: 'Teens (13-17)', ages: [13, 14, 15, 16, 17] }
];

// Activity type for carousel
interface Activity {
  id: number;
  title: string;
  image?: string; // Emoji fallback
  emoji?: string; // Emoji fallback
  category: string;
  imageUrl?: string; // Real image URL
  description?: string;
  address?: string;
  link?: string;
}

// Sample cached activities for carousel
const SAMPLE_ACTIVITIES: Activity[] = [
  { id: 1, title: 'Central Park Playground', image: '🎪', emoji: '🎪', category: 'Outdoor' },
  { id: 2, title: 'Science Museum', image: '🔬', emoji: '🔬', category: 'Museum' },
  { id: 3, title: 'Art Workshop', image: '🎨', emoji: '🎨', category: 'Creative' },
  { id: 4, title: 'Zoo Adventure', image: '🦁', emoji: '🦁', category: 'Outdoor' },
  { id: 5, title: 'Aquarium Visit', image: '🐠', emoji: '🐠', category: 'Indoor' },
  { id: 6, title: 'Trampoline Park', image: '🤸', emoji: '🤸', category: 'Indoor' },
  { id: 7, title: 'Botanical Garden', image: '🌺', emoji: '🌺', category: 'Outdoor' },
  { id: 8, title: 'Movie Theater', image: '🎬', emoji: '🎬', category: 'Indoor' },
  { id: 9, title: 'Beach Day', image: '🏖️', emoji: '🏖️', category: 'Outdoor' },
  { id: 10, title: 'Cooking Class', image: '👨‍🍳', emoji: '👨‍🍳', category: 'Creative' },
];

// Feature tags for quick filters - colorful with gradients
const FEATURE_TAGS = [
  // Accessibility
  { id: 'wheelchair', label: 'Wheelchair', instruction: 'wheelchair accessible', color: 'bg-gradient-to-r from-blue-400 to-blue-600 text-white border-blue-400' },
  { id: 'metro', label: 'Near Metro', instruction: 'near metro station or public transport', color: 'bg-gradient-to-r from-purple-400 to-purple-600 text-white border-purple-400' },
  { id: 'parking', label: 'Parking', instruction: 'parking available', color: 'bg-gradient-to-r from-indigo-400 to-indigo-600 text-white border-indigo-400' },
  
  // Amenities
  { id: 'food', label: 'Food', instruction: 'food available on-site or nearby', color: 'bg-gradient-to-r from-red-400 to-rose-600 text-white border-red-400' },
  { id: 'restrooms', label: 'Restrooms', instruction: 'clean restrooms available', color: 'bg-gradient-to-r from-gray-400 to-gray-600 text-white border-gray-400' },
  { id: 'shade', label: 'Shade', instruction: 'shaded areas available', color: 'bg-gradient-to-r from-green-400 to-emerald-600 text-white border-green-400' },
  
  // Activity Type
  { id: 'outdoor', label: 'Outdoor', instruction: 'outdoor activities preferred', color: 'bg-gradient-to-r from-teal-400 to-cyan-600 text-white border-teal-400' },
  { id: 'indoor', label: 'Indoor', instruction: 'indoor activities preferred', color: 'bg-gradient-to-r from-orange-400 to-amber-600 text-white border-orange-400' },
  { id: 'educational', label: 'Educational', instruction: 'educational or learning focus', color: 'bg-gradient-to-r from-violet-400 to-purple-600 text-white border-violet-400' },
  { id: 'creative', label: 'Creative', instruction: 'arts and crafts activities', color: 'bg-gradient-to-r from-pink-400 to-rose-600 text-white border-pink-400' },
  
  // Constraints
  { id: 'free', label: 'Free/Cheap', instruction: 'free or budget-friendly', color: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-400' },
  { id: 'quiet', label: 'Quiet', instruction: 'calm and quiet environment', color: 'bg-gradient-to-r from-slate-400 to-slate-600 text-white border-slate-400' },
  { id: 'active', label: 'Active', instruction: 'high energy and physical activities', color: 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white border-cyan-400' },
];

export default function SearchPageV3({
  searchParams,
  updateSearchParams,
  searchHistory,
  loading,
  setLoading,
  setSearchResults,
  showResults,
  deleteHistoryEntry,
  loadFromHistory,
  reloadSearchHistory,
  onSearch,
  isDesktop = false,
  isDesktopSidebar = false,
  searchContext = null,
  exclusionList = {},
  removeFromExclusionList
}: SearchPageProps) {
  
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showExclusionManager, setShowExclusionManager] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState(searchParams.extraInstructions || '');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [cities, setCities] = useState<City[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<City[]>([]);
  const [locationSearchText, setLocationSearchText] = useState('');
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [newKidAge, setNewKidAge] = useState('');
  const [cachedActivities, setCachedActivities] = useState<Activity[]>(SAMPLE_ACTIVITIES);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFeaturesExpanded, setIsFeaturesExpanded] = useState(false); // Collapsible features
  const [dynamicMessage, setDynamicMessage] = useState(0);

  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const lastProgressRef = useRef(0);
  const progressStuckTimeRef = useRef(0);

  const reverseGeocodeCoordinates = async (latitude: number, longitude: number): Promise<string | null> => {
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
      url.searchParams.set('latitude', latitude.toString());
      url.searchParams.set('longitude', longitude.toString());
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'en');

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error('Reverse geocoding failed:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      const result = data.results?.[0];
      if (!result) {
        console.warn('Reverse geocoding returned no results for coordinates:', { latitude, longitude });
        return null;
      }

      return `${result.name}, ${result.country}`;
    } catch (error) {
      console.error('Failed to reverse geocode location:', error);
      return null;
    }
  };

  // Add kid age
  const addKidAge = () => {
    const age = parseInt(newKidAge);
    if (!isNaN(age) && age >= 0 && age <= 17 && !searchParams.ages.includes(age)) {
      updateSearchParams({ ages: [...searchParams.ages, age].sort((a, b) => a - b) });
      setNewKidAge('');
    }
  };

  // Toggle kid age (for bubble selection)
  const toggleKidAge = (age: number) => {
    if (searchParams.ages.includes(age)) {
      updateSearchParams({ ages: searchParams.ages.filter(a => a !== age) });
    } else {
      updateSearchParams({ ages: [...searchParams.ages, age].sort((a, b) => a - b) });
    }
  };

  // Remove kid age
  const removeKidAge = (age: number) => {
    updateSearchParams({ ages: searchParams.ages.filter(a => a !== age) });
  };

  // Detect current location
  const detectCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    const hasSecureContext = typeof window !== 'undefined'
      ? (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost')
      : false;

    if (!hasSecureContext) {
      alert('Location detection requires a secure (HTTPS) connection. Please switch to HTTPS or enter your city manually.');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const location = await reverseGeocodeCoordinates(latitude, longitude);
        if (location) {
          updateSearchParams({ location });
          localStorage.setItem('lastDetectedLocation', location);
        } else {
          alert('We could not determine your location. Please enter it manually.');
        }
        setIsDetectingLocation(false);
      },
      (error) => {
        console.warn('Geolocation permission denied or unavailable:', error);
        alert('Location access denied. Please allow location access or enter manually.');
        setIsDetectingLocation(false);
      }
    );
  };

  // Handle search
  const handleSearch = async () => {
    if (onSearch) {
      onSearch();
    }
  };

  // Toggle tag selection
  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  // Convert selected tags to extraInstructions format
  useEffect(() => {
    const instructions = selectedTags
      .map(tagId => FEATURE_TAGS.find(t => t.id === tagId)?.instruction)
      .filter(Boolean)
      .join(', ');
    updateSearchParams({ extraInstructions: instructions });
  }, [selectedTags]);

  // Fetch cached activities from backend
  const fetchCachedActivities = async (location: string) => {
    try {
      console.log('🎪 Fetching cached activities for:', location);
      const response = await fetch(`/api/cached-activities?location=${encodeURIComponent(location)}&limit=10`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.ok && data.activities && data.activities.length > 0) {
          console.log('✅ Loaded', data.activities.length, 'cached activities');
          setCachedActivities(data.activities);
        } else {
          console.log('⚠️ No cached activities found, using sample data');
          setCachedActivities(SAMPLE_ACTIVITIES);
        }
      } else {
        console.log('❌ Failed to fetch cached activities, using sample data');
        setCachedActivities(SAMPLE_ACTIVITIES);
      }
    } catch (error) {
      console.error('❌ Error fetching cached activities:', error);
      setCachedActivities(SAMPLE_ACTIVITIES);
    }
  };

  // Auto-detect location on mount
  useEffect(() => {
    if (!searchParams.location) {
      const cachedLocation = localStorage.getItem('lastDetectedLocation');
      if (cachedLocation) {
        updateSearchParams({ location: cachedLocation });
      } else if ('geolocation' in navigator) {
        const hasSecureContext = typeof window !== 'undefined'
          ? (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost')
          : false;

        if (!hasSecureContext) {
          console.warn('Geolocation requires a secure (HTTPS) context. Skipping automatic detection.');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const location = await reverseGeocodeCoordinates(latitude, longitude);
            if (location) {
              updateSearchParams({ location });
              localStorage.setItem('lastDetectedLocation', location);
            }
          },
          (error) => {
            console.warn('Geolocation permission denied or unavailable:', error);
          }
        );
      }
    }
  }, []);

  // Fetch cached activities when location changes (removed duplicate)
  useEffect(() => {
    if (searchParams.location) {
      fetchCachedActivities(searchParams.location);
    }
  }, [searchParams.location]);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsMenu]);

  // Rotate dynamic messages during loading
  useEffect(() => {
    if (!loading.isLoading) {
      setDynamicMessage(0);
      lastProgressRef.current = 0;
      progressStuckTimeRef.current = 0;
      return;
    }

    // Check if progress is stuck
    const isStuck = loading.progress === lastProgressRef.current;
    if (isStuck) {
      progressStuckTimeRef.current += 1;
    } else {
      progressStuckTimeRef.current = 0;
      lastProgressRef.current = loading.progress;
    }

    // Rotate messages faster when stuck at high progress
    const rotationSpeed = (isStuck && loading.progress >= 70) ? 3000 : 4000;
    
    const interval = setInterval(() => {
      setDynamicMessage(prev => (prev + 1) % DYNAMIC_MESSAGES.length);
    }, rotationSpeed);

    return () => clearInterval(interval);
  }, [loading.isLoading, loading.progress]);

  // Fetch cities from Open-Meteo Geocoding API
  const fetchCitiesFromAPI = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setLocationSuggestions([]);
      return;
    }

    setIsLoadingCities(true);
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', searchQuery);
      url.searchParams.set('count', '50');
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch cities');
      }

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const citiesData: City[] = data.results.map((result: any) => ({
          name: result.name,
          country: result.country || result.admin1 || ''
        }));
        setLocationSuggestions(citiesData);
      } else {
        setLocationSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to fetch cities from API:', error);
      setLocationSuggestions([]);
    } finally {
      setIsLoadingCities(false);
    }
  };

  // Handle location search with debouncing
  const handleLocationSearch = (value: string) => {
    setLocationSearchText(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (value.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchCitiesFromAPI(value);
      }, 300);
    } else {
      setLocationSuggestions([]);
    }
  };

  // Clear location search
  const handleClearLocationSearch = () => {
    setLocationSearchText('');
    setLocationSuggestions([]);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  // Handle selecting a city suggestion
  const handleCitySelect = (city: City) => {
    const locationString = `${city.name}, ${city.country}`;
    updateSearchParams({ location: locationString });
    setShowLocationModal(false);
    setLocationSuggestions([]);
    setLocationSearchText('');
    localStorage.setItem('lastDetectedLocation', locationString);
  };

  // Handle selecting from location history
  const handleLocationHistorySelect = (location: string) => {
    updateSearchParams({ location });
    setShowLocationModal(false);
    setLocationSuggestions([]);
    setLocationSearchText('');
  };

  // Get unique locations from history
  const getUniqueLocationsFromHistory = () => {
    if (!searchHistory || searchHistory.length === 0) return [];
    
    const uniqueLocations = new Set<string>();
    searchHistory.forEach(entry => {
      if (entry.location && entry.location.trim()) {
        uniqueLocations.add(entry.location.trim());
      }
    });
    
    return Array.from(uniqueLocations).slice(0, 10);
  };

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handleDateSelect = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(selectedDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dayStr}`;
    updateSearchParams({ date: dateString });
    setShowDateModal(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return currentMonth.getFullYear() === today.getFullYear() &&
           currentMonth.getMonth() === today.getMonth() &&
           day === today.getDate();
  };

  const isSelected = (day: number) => {
    if (!searchParams.date) return false;
    const selectedDate = new Date(searchParams.date);
    return currentMonth.getFullYear() === selectedDate.getFullYear() &&
           currentMonth.getMonth() === selectedDate.getMonth() &&
           day === selectedDate.getDate();
  };

  const isPastDate = (day: number) => {
    const today = new Date();
    const dateToCheck = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    today.setHours(0, 0, 0, 0);
    dateToCheck.setHours(0, 0, 0, 0);
    return dateToCheck < today;
  };

  // Quick date selectors
  const selectToday = () => {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    updateSearchParams({ date: dateString });
    setShowDateModal(false);
  };

  const selectTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0];
    updateSearchParams({ date: dateString });
    setShowDateModal(false);
  };

  // Format date
  const getDateDisplay = () => {
    if (!searchParams.date) return 'When?';
    const date = new Date(searchParams.date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get kids count
  const getKidsCount = () => {
    return searchParams.ages.length;
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #fff5e6 0%, #ffe6f0 20%, #e6f3ff 40%, #fff0f5 60%, #ffffff 100%)', zIndex: 0 }}>
      {/* Playful Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle, #ff6b9d 1px, transparent 1px)`,
        backgroundSize: '30px 30px',
        zIndex: 1
      }}></div>

      {/* Compact Top Bar - Centered Logo */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-b border-gray-200"
        style={{ paddingTop: 'env(safe-area-inset-top)', zIndex: 50 }}
      >
        <div className="relative flex items-center justify-center px-2 py-1.5">
          {/* Left Actions */}
          <div className="absolute left-2 flex gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowHistory(!showHistory)}
              className="relative p-2 rounded-xl transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 107, 157, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <History className="w-5 h-5" style={{ color: '#ff6b9d' }} />
              {searchHistory.length > 0 && (
                <motion.span 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"
                />
              )}
            </motion.button>
          </div>
          
          {/* Centered Logo */}
          <motion.div 
            className="flex items-center justify-center px-12"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          >
            <img 
              src="/LogoV3_crop.png" 
              alt="FunFinder" 
              className="w-auto"
              style={{ height: '5.5rem', maxWidth: '100%' }}
            />
          </motion.div>
          
          {/* Right Actions */}
          <div className="absolute right-2 flex gap-1" ref={settingsMenuRef}>
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="p-2 rounded-xl transition-colors"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 165, 0, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <SettingsIcon className="w-5 h-5" style={{ color: '#ffa500' }} />
              </motion.button>
              
              {/* Settings Dropdown Menu */}
              <AnimatePresence>
                {showSettingsMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border-2 border-gray-200 overflow-hidden z-50"
                  >
                    <div className="py-2">
                      {/* Excluded Activities Option */}
                      <motion.button
                        whileHover={{ backgroundColor: '#fef3c7' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowExclusionManager(true);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
                      >
                        <Ban className="w-5 h-5 text-red-500" />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">Excluded Activities</div>
                          <div className="text-xs text-gray-600">Manage blocked items</div>
                        </div>
                        {Object.keys(exclusionList).length > 0 && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                            {Object.values(exclusionList).reduce((sum, arr) => sum + arr.length, 0)}
                          </span>
                        )}
                      </motion.button>
                      
                      <div className="h-px bg-gray-200 my-1" />
                      
                      {/* Settings Option */}
                      <motion.button
                        whileHover={{ backgroundColor: '#e0f2fe' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowSettings(true);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
                      >
                        <Sliders className="w-5 h-5 text-blue-500" />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">App Settings</div>
                          <div className="text-xs text-gray-600">Configure API & preferences</div>
                        </div>
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content - Fixed layout with carousel at bottom */}
      <div 
        className="absolute left-0 right-0 flex flex-col overflow-hidden"
        style={{ 
          top: 'calc(7.5rem + env(safe-area-inset-top))',
          bottom: 'calc(8rem + env(safe-area-inset-bottom))',
          zIndex: 20
        }}
      >
        {/* "What's the plan?" - In the gap */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center pb-1 flex-shrink-0"
        >
          <h1 className="text-base font-semibold whitespace-nowrap" style={{ 
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.2em'
          }}>
            What's the plan?
          </h1>
        </motion.div>

        {/* Docked Search Form with Animation - Better Styling */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.6, 
            delay: 0.4,
            type: "spring",
            stiffness: 100
          }}
          className="px-4 flex-shrink-0 relative z-10"
        >
          <div className="bg-gray-50 rounded-2xl shadow-xl shadow-gray-300/50 p-3 border border-gray-300">
            
            {/* Loading Animation - Replaces Form When Searching */}
            <AnimatePresence mode="wait">
              {loading.isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="py-8"
                >
                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: '0%' }}
                        animate={{ width: `${loading.progress}%` }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Animated Loader */}
                  <div className="flex justify-center mb-4">
                    <LucideLoader size={96} />
                  </div>

                  {/* Progress Percentage - Below Loader */}
                  <div className="text-center mb-4">
                    <span className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                      {Math.round(loading.progress)}%
                    </span>
                  </div>

                  {/* Single Loading Status Text - Rotating messages */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={dynamicMessage}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4 }}
                      className="text-center space-y-3"
                    >
                      {/* Show rotating messages */}
                      <p 
                        className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500"
                        style={{ fontFamily: 'Baloo 2, sans-serif' }}
                      >
                        {DYNAMIC_MESSAGES[dynamicMessage]}
                      </p>
                      
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="flex justify-center gap-1.5 pt-2"
                      >
                        <span className="w-2.5 h-2.5 bg-orange-500 rounded-full"></span>
                        <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
                        <span className="w-2.5 h-2.5 bg-pink-500 rounded-full"></span>
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
            {/* Loading Progress Bar - OLD, now integrated above */}
            
            {/* Location */}
            <div className="mb-4">
              <motion.div 
                className="flex items-center gap-2 mb-0.5"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-md">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-bold" style={{ color: '#ff6b9d' }}>WHERE</span>
              </motion.div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setLocationSearchText(searchParams.location || '');
                    setShowLocationModal(true);
                    setLocationSuggestions([]);
                  }}
                  className="w-full px-4 py-3.5 pr-12 bg-white border-2 rounded-2xl focus:outline-none text-left text-gray-900 font-medium transition-all shadow-sm hover:shadow-md"
                  style={{ borderColor: '#ff6b9d' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 157, 0.15)'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = ''}
                >
                  {searchParams.location || 'City or neighborhood'}
                </button>
                {/* GPS Button */}
                <div className="absolute inset-y-0 right-2 flex items-center">
                  <motion.button
                    type="button"
                    onClick={detectCurrentLocation}
                    disabled={isDetectingLocation}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 bg-gradient-to-br from-pink-400 to-rose-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Use current location"
                  >
                    {isDetectingLocation ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 2v4m0 12v4M2 12h4m12 0h4m-6.07-6.07l2.83-2.83m-11.52 0l2.83 2.83m8.69 8.69l2.83 2.83m-11.52 0l2.83-2.83M12 8a4 4 0 100 8 4 4 0 000-8z" />
                      </svg>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Date & Duration - Compact Row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Date */}
              <div>
                <motion.div 
                  className="flex items-center gap-1 mb-0.5"
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-sm">
                    <Calendar className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#ffa500' }}>WHEN</span>
                </motion.div>
                <button
                  onClick={() => setShowDateModal(true)}
                  className="w-full px-3 py-3 bg-white border-2 rounded-xl focus:outline-none text-sm font-semibold text-gray-900 transition-all shadow-sm hover:shadow-md"
                  style={{ borderColor: '#ffa500' }}
                >
                  {getDateDisplay()}
                </button>
              </div>

              {/* Duration - Button Selector */}
              <div>
                <motion.div 
                  className="flex items-center gap-1 mb-0.5"
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center shadow-sm">
                    <Clock className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#ffd700' }}>DURATION</span>
                </motion.div>
                <select
                  value={searchParams.duration}
                  onChange={(e) => updateSearchParams({ duration: Number(e.target.value) })}
                  className="w-full px-3 py-3 bg-white border-2 rounded-xl focus:outline-none text-sm font-semibold text-gray-900 transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                  style={{ 
                    borderColor: '#ffd700',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '1.25rem'
                  }}
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={3}>3 hours</option>
                  <option value={4}>4 hours</option>
                  <option value={5}>5+ hours</option>
                </select>
              </div>
            </div>

            {/* Kids Ages - Bubble Selector with Fixed Height */}
            <div className="mb-4">
              {/* Label and Selected Pills */}
              <motion.div 
                className="flex items-start gap-2 flex-wrap mb-0.5"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-md">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-bold" style={{ color: '#c084fc' }}>KIDS AGES</span>
                </div>
                
                {/* Selected Age Pills */}
                {searchParams.ages.length > 0 && (
                  <>
                    {searchParams.ages.map((age, idx) => (
                      <motion.span
                        key={age}
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", delay: idx * 0.05 }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-white rounded-full text-xs font-bold shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #ff6b9d, #c084fc)' }}
                      >
                        {age}y
                        <button
                          onClick={() => removeKidAge(age)}
                          className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    ))}
                  </>
                )}
              </motion.div>

              {/* Age Bubbles - Horizontal Scroll - Fixed height to prevent layout shift */}
              <div className="relative h-[52px]">
                {/* Scroll indicators - subtle fade */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none z-10"></div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none z-10"></div>
                
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide h-full items-center">
                  {Array.from({ length: 18 }, (_, i) => i).map((age, idx) => {
                    const isSelected = searchParams.ages.includes(age);
                    return (
                      <motion.button
                        key={age}
                        type="button"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 180,
                          damping: 25,
                          delay: idx * 0.02
                        }}
                        whileHover={{ scale: 1.15, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleKidAge(age)}
                        className={`flex-shrink-0 w-10 h-10 rounded-full font-bold text-sm shadow-md transition-all ${
                          isSelected
                            ? 'text-white shadow-lg scale-110'
                            : 'bg-white text-gray-700 border-2 border-purple-200 hover:border-purple-400'
                        }`}
                        style={isSelected ? {
                          background: 'linear-gradient(135deg, #ff6b9d, #c084fc)',
                          transform: 'translateZ(0)',
                          willChange: 'transform, opacity'
                        } : {
                          transform: 'translateZ(0)',
                          willChange: 'transform, opacity'
                        }}
                      >
                        {age}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Big Search Button */}
            <div className="relative mb-3">
              <motion.button
                onClick={handleSearch}
                disabled={loading.isLoading || !searchParams.location || !searchParams.date}
                whileHover={{ 
                  scale: 1.05,
                  transition: { duration: 0.2 }
                }}
                whileTap={{ 
                  scale: 0.95,
                  transition: { duration: 0.1 }
                }}
                className="relative w-full py-4 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-black text-xl rounded-2xl transition-all flex items-center justify-center gap-3 overflow-hidden"
                style={{
                  background: loading.isLoading 
                    ? '#cccccc' 
                    : 'linear-gradient(135deg, #ff3366 0%, #ff6b9d 50%, #ff8c42 100%)',
                  fontFamily: 'Baloo 2, sans-serif'
                }}
              >
                {/* Sparkle particle explosion - bubbles only, no other animations */}
                {!loading.isLoading && searchParams.location && searchParams.date && (
                  <>
                    {[...Array(20)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full shadow-lg"
                        style={{
                          left: `${50 + Math.cos((i / 20) * Math.PI * 2) * 45}%`,
                          top: `${50 + Math.sin((i / 20) * Math.PI * 2) * 45}%`,
                          background: i % 3 === 0 ? '#ffd700' : i % 3 === 1 ? '#ff6b9d' : '#ffffff'
                        }}
                        animate={{
                          scale: [0, 2.5, 0],
                          opacity: [0, 1, 0],
                          x: [0, Math.cos((i / 20) * Math.PI * 2) * 50],
                          y: [0, Math.sin((i / 20) * Math.PI * 2) * 50],
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          delay: i * 0.06,
                          ease: "easeOut"
                        }}
                      />
                    ))}
                  </>
                )}
                
                {/* Search icon - simple spinning when loading, static otherwise */}
                <motion.div
                  animate={loading.isLoading ? { rotate: 360 } : {}}
                  transition={{
                    duration: loading.isLoading ? 1 : 0,
                    repeat: loading.isLoading ? Infinity : 0,
                    ease: "linear"
                  }}
                >
                  <Search className="w-7 h-7 drop-shadow-lg" />
                </motion.div>
                <span className="relative z-10 drop-shadow-lg">
                  {loading.isLoading ? 'Searching...' : 'Find Activities'}
                </span>
              </motion.button>
            </div>

            {/* Feature Tags - Collapsible & Tag-Style */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setIsFeaturesExpanded(!isFeaturesExpanded)}
                className="flex items-center justify-between w-full mb-2 group"
              >
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[10px] font-bold text-gray-700 uppercase">Features</span>
                  {selectedTags.length > 0 && (
                    <span className="text-[9px] text-gray-500">({selectedTags.length} selected)</span>
                  )}
                </div>
                {isFeaturesExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>
              
              {/* Collapsible Feature Tags - Colorful with Bouncing */}
              <AnimatePresence>
                {isFeaturesExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                    className="overflow-hidden relative"
                  >
                    {/* Scroll indicators - both sides with animated chevrons */}
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 via-gray-50/60 to-transparent pointer-events-none z-10 flex items-center justify-start">
                      <ChevronLeft className="w-4 h-4 text-gray-400 animate-pulse" />
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 via-gray-50/60 to-transparent pointer-events-none z-10 flex items-center justify-end">
                      <ChevronRight className="w-4 h-4 text-gray-400 animate-pulse" />
                    </div>
                    
                    <div className="grid grid-flow-col auto-cols-max gap-1.5 overflow-x-auto pb-1 scrollbar-hide px-1" style={{ gridTemplateRows: 'repeat(2, auto)' }}>
                      {FEATURE_TAGS.map((tag, idx) => (
                        <motion.button
                          key={tag.id}
                          initial={{ scale: 0, opacity: 0, y: -20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 180,
                            damping: 25,
                            delay: idx * 0.02
                          }}
                          whileHover={{ scale: 1.08, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleTag(tag.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all shadow-md whitespace-nowrap ${
                            selectedTags.includes(tag.id)
                              ? `${tag.color} border-current shadow-lg scale-105`
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-lg'
                          }`}
                          style={{
                            transform: 'translateZ(0)',
                            willChange: 'transform, opacity'
                          }}
                        >
                          {tag.label}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Popular Activities Carousel - Sticky at Bottom - Fades out when features expanded or loading */}
      <AnimatePresence>
        {searchParams.location && !isFeaturesExpanded && !loading.isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ 
              duration: 0.3,
              ease: "easeInOut"
            }}
            className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-3"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))', zIndex: 40 }}
          >
              <div className="flex items-center justify-between mb-2 px-4">
                <h3 className="text-xs font-bold" style={{ 
                  background: 'linear-gradient(135deg, #ff6b9d, #ffa500)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  ⭐ Popular in {searchParams.location}
                </h3>
                <button className="text-[10px] font-semibold" style={{ color: '#ff6b9d' }}>
                  See all →
                </button>
              </div>
              
              {/* Activity Cards Carousel */}
              <div className="relative">
                {/* Scroll indicator gradient on the right */}
                <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-10"></div>
                
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide px-4">
                  {cachedActivities.slice(0, 10).map((activity, idx) => {
                    // Helper function to get Lucide icon component
                    const getIconForCategory = (category: string) => {
                      const cat = category.toLowerCase();
                      
                      if (cat.includes('outdoor') || cat.includes('park') || cat.includes('nature')) {
                        return <Trees className="w-9 h-9 text-green-500" strokeWidth={2} />;
                      } else if (cat.includes('museum') || cat.includes('gallery') || cat.includes('exhibition')) {
                        return <Building2 className="w-9 h-9 text-blue-500" strokeWidth={2} />;
                      } else if (cat.includes('creative') || cat.includes('art') || cat.includes('craft')) {
                        return <Palette className="w-9 h-9 text-pink-500" strokeWidth={2} />;
                      } else if (cat.includes('indoor') || cat.includes('mall') || cat.includes('center')) {
                        return <Home className="w-9 h-9 text-purple-500" strokeWidth={2} />;
                      } else {
                        return <Star className="w-9 h-9 text-orange-500" strokeWidth={2} />;
                      }
                    };
                    
                    return (
                      <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.7 + (idx * 0.05) }}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative flex-shrink-0 w-36 snap-start group cursor-pointer"
                      >
                        {/* Modern Card Design - Strict Fixed Height */}
                        <div className="relative bg-white rounded-2xl overflow-hidden shadow-md border-2 border-gray-100 hover:shadow-xl transition-all" style={{ height: '145px' }}>
                          <div className="flex flex-col h-full">
                            {/* Colorful Top Section with Icon - Fixed Height */}
                            <div className="relative bg-gradient-to-br from-orange-400 via-pink-500 to-purple-500 flex items-center justify-center" style={{ height: '80px', flexShrink: 0 }}>
                              {/* Lucide Icon Background Circle */}
                              <div className="w-16 h-16 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg">
                                {getIconForCategory(activity.category)}
                              </div>
                              
                              {/* Rank Badge */}
                              <div className="absolute top-2 left-2 w-6 h-6 bg-white rounded-lg flex items-center justify-center shadow-md">
                                <span className="text-xs font-black text-gray-900">{idx + 1}</span>
                              </div>
                            </div>
                            
                            {/* Content Section - Fills Remaining Space */}
                            <div className="bg-white p-3 flex flex-col" style={{ height: '65px', flexShrink: 0 }}>
                              <h4 className="font-bold text-xs text-gray-900 leading-tight line-clamp-2 flex-1 overflow-hidden" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                                {activity.title}
                              </h4>
                              <div className="mt-auto pt-1">
                                <span className="inline-block px-2.5 py-0.5 bg-gradient-to-r from-orange-100 to-pink-100 text-orange-600 rounded-full text-[9px] font-semibold whitespace-nowrap">
                                  {activity.category}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Location Modal */}
      <AnimatedModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title="Select Location"
      >
        {/* Search Input */}
        <div className="mb-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={locationSearchText}
              onChange={(e) => handleLocationSearch(e.target.value)}
              placeholder="Search for a city..."
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900 placeholder-gray-400"
            />
            {locationSearchText && (
              <button
                onClick={handleClearLocationSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-2">
          {isLoadingCities ? (
            <div className="flex items-center justify-center py-8 text-gray-600">
              <Loader className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Searching cities...</span>
            </div>
          ) : locationSuggestions.length > 0 ? (
            locationSuggestions.map((city, index) => (
              <motion.button
                key={`${city.name}-${city.country}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleCitySelect(city)}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-orange-50 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{city.name}</p>
                  <p className="text-sm text-gray-600">{city.country}</p>
                </div>
              </motion.button>
            ))
          ) : locationSearchText.length >= 2 ? (
            <div className="text-center py-8 text-gray-500">
              No cities found for "{locationSearchText}"
            </div>
          ) : (
            <>
              {/* Recent Locations */}
              {getUniqueLocationsFromHistory().length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                    <History className="w-4 h-4" />
                    Recent Locations
                  </h4>
                  <div className="space-y-2">
                    {getUniqueLocationsFromHistory().map((location, index) => (
                      <motion.button
                        key={`history-${location}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleLocationHistorySelect(location)}
                        className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-purple-50 rounded-xl transition-colors text-left"
                      >
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <History className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{location}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-center py-8 text-gray-400 text-sm">
                {getUniqueLocationsFromHistory().length > 0 
                  ? 'Type to search for more locations...' 
                  : 'Start typing to search for cities...'}
              </div>
            </>
          )}
        </div>
      </AnimatedModal>

      {/* Date Modal */}
      <AnimatedModal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
        title="Select Date"
      >
        {/* Quick Select Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={selectToday}
            className="px-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            📅 Today
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={selectTomorrow}
            className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            ⏭️ Tomorrow
          </motion.button>
        </div>

        {/* Calendar */}
        <div className="bg-gray-50 rounded-2xl p-4">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigateMonth('prev')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
            >
              <span className="text-2xl text-gray-700">‹</span>
            </motion.button>
            
            <h4 className="text-lg font-bold text-gray-900">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h4>
            
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigateMonth('next')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
            >
              <span className="text-2xl text-gray-700">›</span>
            </motion.button>
          </div>
          
          {/* Days of week */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-center text-sm font-bold text-gray-600">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square"></div>
            ))}
            
            {/* Days of the month */}
            {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, index) => {
              const day = index + 1;
              const isPast = isPastDate(day);
              const selected = isSelected(day);
              const today = isToday(day);
              
              return (
                <motion.button
                  key={day}
                  whileHover={!isPast ? { scale: 1.1 } : {}}
                  whileTap={!isPast ? { scale: 0.95 } : {}}
                  onClick={() => !isPast && handleDateSelect(day)}
                  disabled={isPast}
                  className={`aspect-square flex items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                    selected
                      ? 'bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-lg'
                      : today
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                      : isPast
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'hover:bg-gray-200 text-gray-900'
                  }`}
                >
                  {day}
                </motion.button>
              );
            })}
          </div>
        </div>
      </AnimatedModal>

      {/* History Modal */}
      <AnimatedModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title="Search History"
      >
        {searchHistory.length > 0 ? (
          <div className="space-y-3">
            {searchHistory.map((entry, idx) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  loadFromHistory(entry);
                  setShowHistory(false);
                }}
                className="bg-gray-50 rounded-xl p-4 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-orange-500" />
                      {entry.location}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(entry.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {entry.duration}h
                      </span>
                    </p>
                    {entry.kidsAges && entry.kidsAges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.kidsAges.map((age, ageIdx) => (
                          <span
                            key={ageIdx}
                            className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-xs font-medium"
                          >
                            {age}y
                          </span>
                        ))}
                      </div>
                    )}
                    {entry.extraInstructions && (
                      <p className="text-xs text-gray-500 mt-2 italic">
                        {entry.extraInstructions}
                      </p>
                    )}
                  </div>
                  
                  {/* Delete Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent card click
                      deleteHistoryEntry(entry.id);
                    }}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
                
                {/* Timestamp */}
                <p className="text-[10px] text-gray-400 mt-2">
                  {entry.searchCount > 1 && `Searched ${entry.searchCount} times • `}
                  {new Date(entry.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No search history yet</h3>
            <p className="text-sm text-gray-600">
              Your previous searches will appear here for quick access
            </p>
          </div>
        )}
      </AnimatedModal>

      {/* Exclusion Manager Modal */}
      {removeFromExclusionList && (
        <ExclusionManager
          isOpen={showExclusionManager}
          onClose={() => setShowExclusionManager(false)}
          exclusionList={exclusionList}
          removeFromExclusionList={removeFromExclusionList}
        />
      )}

      {/* Settings Modal - Using Full Settings Component */}
      <Settings 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

