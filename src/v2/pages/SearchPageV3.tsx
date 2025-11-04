import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toISODate, geocode, resolvePlace, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../../lib/api';
import { getPlaceKeyCacheKey } from '../../lib/placekey';
import type { Context, LLMResult, SavedActivity, TripList } from '../../lib/schema';
import { getImageUrl } from '../../config/assets';
import { AnimatedModal } from '../components/AnimatedModal';
import { ExclusionManager } from '../components/ExclusionManager';
import { MyTripsModal } from '../components/MyTripsModal';
import LucideLoader from '../components/LucideLoader';
import Settings from '../../components/Settings';
import { 
  MapPin, Calendar, Users, Clock, Search, History, Settings as SettingsIcon, 
  X, Plus, Sparkles, Loader, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Trees, Building2, Palette, Home, Star, Ban, Sliders, Heart
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
  state?: string;
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

  // Feature tags for quick filters - colorful with gradients using Sunny Mint palette
  const FEATURE_TAGS = [
    // Accessibility
    { id: 'wheelchair', label: 'Wheelchair', instruction: 'wheelchair accessible', color: 'text-white border-[#2E8B92]', style: { background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' } },
    { id: 'metro', label: 'Near Metro', instruction: 'near metro station or public transport', color: 'text-white border-[#2E8B92]', style: { background: 'linear-gradient(135deg, #2E8B92 0%, #25767C 100%)' } },
    { id: 'parking', label: 'Parking', instruction: 'parking available', color: 'text-white border-[#56B88F]', style: { background: 'linear-gradient(135deg, #56B88F 0%, #2E8B92 100%)' } },
    
    // Amenities
    { id: 'food', label: 'Food', instruction: 'food available on-site or nearby', color: 'text-white border-[#F2A15F]', style: { background: 'linear-gradient(135deg, #F2A15F 0%, #F26B8A 100%)' } },
    { id: 'restrooms', label: 'Restrooms', instruction: 'clean restrooms available', color: 'text-white border-gray-400', style: { background: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)' } },
    { id: 'shade', label: 'Shade', instruction: 'shaded areas available', color: 'text-white border-[#56B88F]', style: { background: 'linear-gradient(135deg, #56B88F 0%, #2E8B92 100%)' } },
    
    // Activity Type
    { id: 'outdoor', label: 'Outdoor', instruction: 'outdoor activities preferred', color: 'text-white border-[#2E8B92]', style: { background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' } },
    { id: 'indoor', label: 'Indoor', instruction: 'indoor activities preferred', color: 'text-white border-[#F2A15F]', style: { background: 'linear-gradient(135deg, #F2A15F 0%, #F2C14E 100%)' } },
    { id: 'educational', label: 'Educational', instruction: 'educational or learning focus', color: 'text-white border-[#2E8B92]', style: { background: 'linear-gradient(135deg, #2E8B92 0%, #25767C 100%)' } },
    { id: 'creative', label: 'Creative', instruction: 'arts and crafts activities', color: 'text-white border-[#F26B8A]', style: { background: 'linear-gradient(135deg, #F26B8A 0%, #F2A15F 100%)' } },
    
    // Constraints
    { id: 'free', label: 'Free/Cheap', instruction: 'free or budget-friendly', color: 'text-white border-[#F2C14E]', style: { background: 'linear-gradient(135deg, #F2C14E 0%, #F2A15F 100%)' } },
    { id: 'quiet', label: 'Quiet', instruction: 'calm and quiet environment', color: 'text-white border-gray-400', style: { background: 'linear-gradient(135deg, #94A3B8 0%, #64748B 100%)' } },
    { id: 'active', label: 'Active', instruction: 'high energy and physical activities', color: 'text-white border-[#56B88F]', style: { background: 'linear-gradient(135deg, #56B88F 0%, #2E8B92 100%)' } },
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
  const [showMyTrips, setShowMyTrips] = useState(false);
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
  const [favorites, setFavorites] = useState<SavedActivity[]>([]);
  const [tripLists, setTripLists] = useState<TripList[]>([]);
  
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

      // Use fetchWithTimeout with 10 second timeout
      const response = await Promise.race([
        fetch(url.toString()),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 10000ms')), 10000)
        )
      ]);

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
      
      // Resolve location to PlaceKey first to get stable cache key
      let placeKeyId: string | null = null;
      try {
        const placeKey = await resolvePlace(location);
        placeKeyId = getPlaceKeyCacheKey(placeKey);
        console.log('📍 Resolved to PlaceKey:', placeKeyId);
      } catch (error) {
        console.warn('⚠️ Failed to resolve PlaceKey, using location string:', error);
      }
      
      // Use PlaceKey ID for cache lookup if available, otherwise fall back to location string
      const cacheLocation = placeKeyId || location;
      const response = await fetch(`/api/cached-activities?location=${encodeURIComponent(cacheLocation)}&limit=10`);
      
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
        // Group cities by name to detect duplicates
        const cityGroups = new Map<string, any[]>();
        data.results.forEach((result: any) => {
          const key = `${result.name}, ${result.country}`;
          if (!cityGroups.has(key)) {
            cityGroups.set(key, []);
          }
          cityGroups.get(key)!.push(result);
        });
        
        // Only include state if there are multiple cities with the same name in different states/provinces
        const citiesData: City[] = data.results.map((result: any) => {
          const key = `${result.name}, ${result.country}`;
          const duplicates = cityGroups.get(key)!;
          const needsState = duplicates.length > 1;
          
          return {
            name: result.name,
            country: result.country || '',
            state: needsState ? (result.admin1 || undefined) : undefined
          };
        });
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
    const locationString = city.state ? `${city.name}, ${city.state}, ${city.country}` : `${city.name}, ${city.country}`;
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

  // Load favorites and trip lists
  const loadFavoritesAndLists = async () => {
    try {
      const [favoritesRes, listsRes] = await Promise.all([
        fetch('/api/favorites'),
        fetch('/api/trip-lists')
      ]);

      if (favoritesRes.ok) {
        const favData = await favoritesRes.json();
        setFavorites(favData.favorites || []);
      }

      if (listsRes.ok) {
        const listsData = await listsRes.json();
        setTripLists(listsData.lists || []);
      }
    } catch (error) {
      console.error('Error loading favorites/lists:', error);
    }
  };

  // Trip list handlers
  const handleCreateList = async (name: string, location?: string) => {
    const response = await fetch('/api/trip-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, location })
    });

    if (!response.ok) throw new Error('Failed to create list');
  };

  const handleDeleteList = async (listId: string) => {
    await fetch(`/api/trip-lists/${listId}`, { method: 'DELETE' });
  };

  const handleRemoveFavorite = async (activityId: string) => {
    await fetch(`/api/favorites/${activityId}`, { method: 'DELETE' });
  };

  const handleAddActivityToList = async (listId: string, activityId: string) => {
    await fetch(`/api/trip-lists/${listId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId })
    });
  };

  const handleRemoveActivityFromList = async (listId: string, activityId: string) => {
    await fetch(`/api/trip-lists/${listId}/activities/${activityId}`, { method: 'DELETE' });
  };

  const handleReorderList = async (listId: string, activityIds: string[]) => {
    await fetch(`/api/trip-lists/${listId}/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityIds })
    });
  };

  // Load favorites on mount
  useEffect(() => {
    loadFavoritesAndLists();
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #e0f2f1 0%, #f0f9f4 20%, #e8f5e9 40%, #f1f8f6 60%, #ffffff 100%)', zIndex: 0 }}>
      {/* Playful Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle, #56B88F 1px, transparent 1px)`,
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
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(46, 139, 146, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <History className="w-5 h-5" style={{ color: '#2E8B92' }} />
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
                <SettingsIcon className="w-5 h-5" style={{ color: '#F2A15F' }} />
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
                      {/* My Trips Option */}
                      <motion.button
                        whileHover={{ backgroundColor: '#e0f2f1' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowMyTrips(true);
                          setShowSettingsMenu(false);
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
                      >
                        <Heart className="w-5 h-5 text-pink-500" />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">My Trips</div>
                          <div className="text-xs text-gray-600">Favorites & Trip Rules</div>
                        </div>
                        {favorites.length > 0 && (
                          <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                            {favorites.length}
                          </span>
                        )}
                      </motion.button>
                      
                      <div className="h-px bg-gray-200 my-1" />
                      
                      {/* Settings Option */}
                      <motion.button
                        whileHover={{ backgroundColor: '#e0f2f1' }}
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
            background: 'linear-gradient(135deg, #2E8B92, #56B88F, #F2A15F, #F26B8A)',
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
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: 'linear-gradient(90deg, #2E8B92 0%, #56B88F 100%)' }}
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
                        className="text-2xl font-black text-transparent bg-clip-text"
                        style={{ 
                          fontFamily: 'Baloo 2, sans-serif',
                          background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 50%, #F2A15F 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent'
                        }}
                      >
                        {DYNAMIC_MESSAGES[dynamicMessage]}
                      </p>
                      
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="flex justify-center gap-1.5 pt-2"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2E8B92' }}></span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#56B88F' }}></span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F2A15F' }}></span>
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
                <div className="w-7 h-7 rounded-full flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}>
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-bold" style={{ color: '#2E8B92' }}>WHERE</span>
              </motion.div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setLocationSearchText(searchParams.location || '');
                    setShowLocationModal(true);
                    setLocationSuggestions([]);
                  }}
                  className="w-full px-4 py-3.5 pr-24 bg-white border-2 rounded-2xl focus:outline-none text-left text-gray-900 font-medium transition-all shadow-sm hover:shadow-md"
                  style={{ borderColor: '#2E8B92' }}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 157, 0.15)'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = ''}
                >
                  {searchParams.location || 'City or neighborhood'}
                </button>
                {/* Clear button - only show when there's a location */}
                {searchParams.location && (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSearchParams({ location: '' });
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-all"
                    title="Clear location"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
                {/* GPS Button */}
                <motion.button
                  type="button"
                  onClick={detectCurrentLocation}
                  disabled={isDetectingLocation}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}
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
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, #F2A15F 0%, #F2C14E 100%)' }}>
                    <Calendar className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#F2A15F' }}>WHEN</span>
                </motion.div>
                <button
                  onClick={() => setShowDateModal(true)}
                  className="w-full px-3 py-3 bg-white border-2 rounded-xl focus:outline-none text-sm font-semibold text-gray-900 transition-all shadow-sm hover:shadow-md"
                  style={{ borderColor: '#F2A15F' }}
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
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, #F2C14E 0%, #F2A15F 100%)' }}>
                    <Clock className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#F2C14E' }}>DURATION</span>
                </motion.div>
                <select
                  value={searchParams.duration}
                  onChange={(e) => updateSearchParams({ duration: Number(e.target.value) })}
                  className="w-full px-3 py-3 bg-white border-2 rounded-xl focus:outline-none text-sm font-semibold text-gray-900 transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                  style={{ 
                    borderColor: '#F2C14E',
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
                <div className="w-7 h-7 rounded-full flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}>
                  <Users className="w-4 h-4 text-white" />
                </div>
                  <span className="text-xs font-bold" style={{ color: '#2E8B92' }}>KIDS AGES</span>
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
                        style={{ background: 'linear-gradient(135deg, #2E8B92, #56B88F)' }}
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
                            : 'bg-white text-gray-700 border-2 border-[#b2dfdb] hover:border-[#80cbc4]'
                        }`}
                        style={isSelected ? {
                          background: 'linear-gradient(135deg, #2E8B92, #56B88F)',
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
                    : 'linear-gradient(135deg, #2E8B92 0%, #56B88F 50%, #2E8B92 100%)',
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
                          background: i % 3 === 0 ? '#F2C14E' : i % 3 === 1 ? '#56B88F' : '#ffffff'
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
                          style={selectedTags.includes(tag.id) ? {
                            ...tag.style,
                            transform: 'translateZ(0)',
                            willChange: 'transform, opacity'
                          } : {
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
                background: 'linear-gradient(135deg, #2E8B92, #56B88F)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                ⭐ Popular in {searchParams.location}
              </h3>
              <button 
                onClick={handleSearch}
                className="text-[10px] font-semibold hover:opacity-70 transition-opacity" 
                style={{ color: '#2E8B92' }}
              >
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
                        onClick={() => {
                          // Store the activity to highlight in sessionStorage
                          sessionStorage.setItem('highlightActivity', activity.title);
                          // Trigger search
                          handleSearch();
                        }}
                      >
                        {/* Modern Card Design - Strict Fixed Height */}
                        <div className="relative bg-white rounded-2xl overflow-hidden shadow-md border-2 border-gray-100 hover:shadow-xl transition-all" style={{ height: '150px' }}>
                          <div className="flex flex-col h-full">
                            {/* Colorful Top Section with Icon - Fixed Height */}
                            <div className="relative flex items-center justify-center" style={{ height: '80px', flexShrink: 0, background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 50%, #F2A15F 100%)' }}>
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
                            <div className="bg-white px-3 pt-2 pb-2 flex flex-col" style={{ height: '70px', flexShrink: 0 }}>
                              <h4 className="font-bold text-xs text-gray-900 leading-tight line-clamp-2 overflow-hidden" style={{ 
                                fontFamily: 'Baloo 2, sans-serif',
                                minHeight: '32px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {activity.title}
                              </h4>
                              <div className="mt-auto">
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap" style={{ background: 'linear-gradient(135deg, #e0f2f1 0%, #ffe4cc 100%)', color: '#1e5e5a' }}>
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
        maxHeight="75vh"
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
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none text-gray-900 placeholder-gray-400"
              style={{ transition: 'all 0.2s' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#2E8B92';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(46, 139, 146, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#f3f4f6';
                e.currentTarget.style.boxShadow = 'none';
              }}
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

        {/* Results - Fixed height scrollable area */}
        <div className="space-y-2 overflow-y-auto" style={{ height: '400px', maxHeight: '50vh' }}>
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
                className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl transition-colors text-left"
                style={{ backgroundColor: '#f9fafb' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e0f2f1'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}>
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{city.name}</p>
                  <p className="text-sm text-gray-600">{city.state ? `${city.state}, ${city.country}` : city.country}</p>
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
                        className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl transition-colors text-left"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e0f2f1'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}>
                          <History className="w-5 h-5 text-white" />
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

      {/* My Trips Modal */}
      {removeFromExclusionList && (
        <MyTripsModal
          isOpen={showMyTrips}
          onClose={() => setShowMyTrips(false)}
          favorites={favorites}
          tripLists={tripLists}
          exclusionList={exclusionList}
          removeFromExclusionList={removeFromExclusionList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
          onRemoveFavorite={handleRemoveFavorite}
          onAddActivityToList={handleAddActivityToList}
          onRemoveActivityFromList={handleRemoveActivityFromList}
          onReorderList={handleReorderList}
          onRefreshData={loadFavoritesAndLists}
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

