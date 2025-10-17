import React, { useState, useRef, useEffect } from 'react';
import { toISODate, geocode, fetchHolidays, fetchWeatherDaily, fetchFestivalsWikidata, fetchHolidaysWithGemini } from '../../lib/api';
import type { Context, LLMResult } from '../../lib/schema';
import { getImageUrl } from '../../config/assets';

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
  onSearch?: () => void; // Add external search trigger
  isDesktop?: boolean; // For full-width desktop layout
  isDesktopSidebar?: boolean; // For side-by-side layout
  searchContext?: any; // Search context for sidebar mode
}

const AGE_OPTIONS = [
  { value: 'toddlers', label: 'Toddlers (0-2 years)', ages: [0, 1, 2] },
  { value: 'preschoolers', label: 'Preschoolers (3-5 years)', ages: [3, 4, 5] },
  { value: 'early-elementary', label: 'Early Elementary (6-8 years)', ages: [6, 7, 8] },
  { value: 'pre-teens', label: 'Pre-teens (9-12 years)', ages: [9, 10, 11, 12] },
  { value: 'teenagers', label: 'Teenagers (13-17 years)', ages: [13, 14, 15, 16, 17] }
];

const ALLOWED_CATS = 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other';

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

export default function SearchPage({
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
  searchContext = null
}: SearchPageProps) {
  
  // State for prompt viewing (desktop only)
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState(searchParams.extraInstructions || '');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [cities, setCities] = useState<City[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<City[]>([]);
  const [locationSearchText, setLocationSearchText] = useState('');
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [showInstructionsPreview, setShowInstructionsPreview] = useState(false);
  const ageModalRef = useRef<HTMLDivElement>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const dateModalRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const instructionsModalRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instructionsPreviewRef = useRef<HTMLDivElement>(null);

  const handleAgeOptionChange = (option: typeof AGE_OPTIONS[0]) => {
    updateSearchParams({ ages: option.ages });
    setShowAgeModal(false);
  };

  const handleResetForm = () => {
    updateSearchParams({
      location: '',
      date: '',
      duration: 1,
      ages: [],
      extraInstructions: ''
    });
    setExtraInstructions('');
    setShowHistory(false);
  };

  // Sync local extraInstructions with searchParams when they change
  useEffect(() => {
    setExtraInstructions(searchParams.extraInstructions || '');
  }, [searchParams.extraInstructions]);

  // Extract unique locations from search history
  const getUniqueLocationsFromHistory = () => {
    if (!searchHistory || searchHistory.length === 0) return [];
    
    const uniqueLocations = new Set<string>();
    
    // Extract locations from search history, most recent first
    searchHistory.forEach(entry => {
      if (entry.location && entry.location.trim()) {
        uniqueLocations.add(entry.location.trim());
      }
    });
    
    // Convert to array and limit to 10 most recent
    return Array.from(uniqueLocations).slice(0, 10);
  };

  // Fetch cities from Open-Meteo Geocoding API (replaces CSV)
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

  // Open location modal
  const handleLocationModalOpen = () => {
    setLocationSearchText(searchParams.location || '');
    setShowLocationModal(true);
    setLocationSuggestions([]);
  };

  // Handle location search with debouncing
  const handleLocationSearch = (value: string) => {
    setLocationSearchText(value);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (value.length >= 2) {
      // Debounce API calls by 300ms
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
  };

  // Handle selecting from location history
  const handleLocationHistorySelect = (location: string) => {
    updateSearchParams({ location });
    setShowLocationModal(false);
    setLocationSuggestions([]);
    setLocationSearchText('');
  };

  // Handle clicking outside to close dropdowns and modals
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ageModalRef.current && !ageModalRef.current.contains(event.target as Node)) {
        setShowAgeModal(false);
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setShowLocationModal(false);
      }
      if (dateModalRef.current && !dateModalRef.current.contains(event.target as Node)) {
        setShowDateModal(false);
      }
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
      if (instructionsModalRef.current && !instructionsModalRef.current.contains(event.target as Node)) {
        setShowInstructionsModal(false);
      }
      if (instructionsPreviewRef.current && !instructionsPreviewRef.current.contains(event.target as Node)) {
        setShowInstructionsPreview(false);
      }
    };

    const handleResize = () => {
      // Close modals on resize
      setShowLocationModal(false);
      setShowDateModal(false);
      setShowAgeModal(false);
      setShowHistory(false);
      setShowInstructionsModal(false);
      setShowInstructionsPreview(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
    };
  }, [showLocationModal, showDateModal, showAgeModal, showHistory, showInstructionsModal]);

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handleDateSelect = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    // Format date manually to avoid timezone conversion issues with toISOString()
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

  const getCurrentAgeLabel = () => {
    if (searchParams.ages.length === 0) return '';
    
    // Find matching age group
    for (const option of AGE_OPTIONS) {
      if (option.ages.length === searchParams.ages.length && 
          option.ages.every(age => searchParams.ages.includes(age))) {
        return option.label;
      }
    }
    
    // Custom ages
    const sortedAges = [...searchParams.ages].sort((a, b) => a - b);
    return `Ages ${sortedAges.join(', ')}`;
  };

  // Helper function to render all modals (same for both layouts)
  const renderModals = () => (
    <>
      {/* Location Modal */}
      {showLocationModal && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-container" ref={locationDropdownRef}>
            <div className="modal-content location-modal">
              <div className="modal-header">
                <h3 className="modal-title">Select Location</h3>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                {/* Search Input */}
                <div className="location-search">
                  <div className="location-search-wrapper">
                    <svg className="location-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      value={locationSearchText}
                      onChange={(e) => handleLocationSearch(e.target.value)}
                      placeholder="Search for a city or country..."
                      className="location-search-input"
                      autoFocus
                    />
                    {locationSearchText && (
                      <button
                        type="button"
                        onClick={handleClearLocationSearch}
                        className="location-search-clear"
                        title="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Results */}
                <div className="location-results">
                  {isLoadingCities ? (
                    <div className="location-loading">
                      <div className="location-loading-spinner"></div>
                      <span className="text-gray-600 text-sm">Searching cities...</span>
                    </div>
                  ) : locationSuggestions.length > 0 ? (
                    locationSuggestions.map((city, index) => (
                      <button
                        key={`${city.name}-${city.country}-${index}`}
                        type="button"
                        onClick={() => handleCitySelect(city)}
                        className="location-result-item"
                      >
                        <div className="location-result-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#475569"/>
                          </svg>
                        </div>
                        <div className="location-result-info">
                          <span className="location-result-name">{city.name}</span>
                          <span className="location-result-country">{city.country}</span>
                        </div>
                      </button>
                    ))
                  ) : locationSearchText.length >= 2 ? (
                    <div className="location-no-results">
                      No cities found for "{locationSearchText}"
                    </div>
                  ) : (
                    <div className="location-section">
                      {(() => {
                        const uniqueLocations = getUniqueLocationsFromHistory();
                        return uniqueLocations.length > 0 && (
                          <>
                            <div className="location-section-header">
                              <h4 className="location-section-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                                  <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="currentColor"/>
                                </svg>
                                Recent Locations
                              </h4>
                            </div>
                            {uniqueLocations.map((location, index) => (
                              <button
                                key={`history-${location}-${index}`}
                                type="button"
                                onClick={() => handleLocationHistorySelect(location)}
                                className="location-result-item location-history-item"
                              >
                                <div className="location-result-icon">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="#6B7280"/>
                                  </svg>
                                </div>
                                <div className="location-result-info">
                                  <span className="location-result-name">{location}</span>
                                </div>
                              </button>
                            ))}
                          </>
                        );
                      })()}
                      <div className="location-placeholder">
                        {getUniqueLocationsFromHistory().length > 0 ? 'Type to search for more locations...' : 'Start typing to search for cities...'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Date Modal */}
      {showDateModal && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-container" ref={dateModalRef}>
            <div className="modal-content">
              <div className="modal-header">
                <h3 className="modal-title">Select Date</h3>
                <button
                  type="button"
                  onClick={() => setShowDateModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="calendar-container">
                  {/* Calendar Header */}
                  <div className="calendar-header">
                    <button
                      type="button"
                      onClick={() => navigateMonth('prev')}
                      className="calendar-nav"
                    >
                      ‹
                    </button>
                    <h4 className="calendar-month">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <button
                      type="button"
                      onClick={() => navigateMonth('next')}
                      className="calendar-nav"
                    >
                      ›
                    </button>
                  </div>
                  
                  {/* Days of week */}
                  <div className="calendar-weekdays">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="calendar-weekday">{day}</div>
                    ))}
                  </div>
                  
                  {/* Calendar Grid */}
                  <div className="calendar-grid">
                    {/* Empty cells for days before month starts */}
                    {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, index) => (
                      <div key={`empty-${index}`} className="calendar-day-empty"></div>
                    ))}
                    
                    {/* Days of the month */}
                    {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, index) => {
                      const day = index + 1;
                      const isPast = isPastDate(day);
                      const selected = isSelected(day);
                      const today = isToday(day);
                      
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => !isPast && handleDateSelect(day)}
                          disabled={isPast}
                          className={`calendar-day ${selected ? 'calendar-day-selected' : ''} ${today ? 'calendar-day-today' : ''} ${isPast ? 'calendar-day-disabled' : ''}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Instructions Modal */}
      {showInstructionsModal && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-container" ref={instructionsModalRef}>
            <div className="modal-content">
              <div className="modal-header">
                <h3 className="modal-title">Other Instructions</h3>
                <button
                  type="button"
                  onClick={() => setShowInstructionsModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                {/* Quick Tags */}
                <div className="instructions-tags">
                  <div className="instructions-tags-scroll-container">
                    <div className="instructions-tags-scroll">
                      {[
                        '♿ Wheelchair accessible',
                        '🚇 Near metro/public transport',
                        '🌳 Outdoor activities preferred',
                        '🏢 Indoor activities preferred',
                        '💰 Budget-friendly options',
                        '🎨 Creative/educational focus',
                        '🏃‍♂️ High energy activities',
                        '😴 Calm/quiet activities',
                        '🍔 Food available on-site',
                        '🅿️ Parking available'
                      ].map((tag, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            const tagText = tag.substring(2); // Remove emoji
                            if (extraInstructions.includes(tagText)) {
                              // Remove the tag
                              setExtraInstructions(extraInstructions.replace(tagText, '').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, ''));
                            } else {
                              // Add the tag
                              setExtraInstructions(extraInstructions + (extraInstructions ? ', ' + tagText : tagText));
                            }
                          }}
                          className={`instructions-tag-scroll ${extraInstructions.includes(tag.substring(2)) ? 'active' : ''}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="tags-scroll-indicator">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="opacity-50">
                        <path d="M19 12l-7 7m0 0l-7-7m7 7V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Instructions Input */}
                <div className="instructions-input">
                  <textarea
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    placeholder="Instructions - Click tags above or type your requirements..."
                    className="instructions-input-field"
                    rows={3}
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="instructions-actions-row">
                  <button
                    type="button"
                    onClick={() => {
                      setExtraInstructions('');
                      updateSearchParams({ extraInstructions: '' });
                    }}
                    className="instructions-btn instructions-btn-clear"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSearchParams({ extraInstructions: extraInstructions });
                      setShowInstructionsModal(false);
                    }}
                    className="instructions-btn instructions-btn-save"
                  >
                    Save Instructions
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Age Modal */}
      {showAgeModal && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-container" ref={ageModalRef}>
            <div className="modal-content">
              <div className="modal-header">
                <h3 className="modal-title">Select Kids Ages</h3>
                <button
                  type="button"
                  onClick={() => setShowAgeModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="age-options">
                  {AGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleAgeOptionChange(option)}
                      className="age-option-item"
                    >
                      <div className="age-option-icon">
                        {option.value === 'toddlers' && '👶'}
                        {option.value === 'preschoolers' && '🧒'}
                        {option.value === 'early-elementary' && '👦'}
                        {option.value === 'pre-teens' && '👧'}
                        {option.value === 'teenagers' && '👨‍🎓'}
                      </div>
                      <div className="age-option-info">
                        <span className="age-option-label">{option.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  // Desktop Compact Form Layout
  if (isDesktop || isDesktopSidebar) {
    return (
      <div className={`desktop-search-container ${isDesktopSidebar ? 'sidebar-mode' : 'full-mode'}`}>
        <div className="desktop-search-content">
          {/* Background for desktop */}
          {!isDesktopSidebar && (
            <div className="desktop-bg-container">
              <img
                src={getImageUrl('FUNFINDER')}
                alt="Fun Finder background with playground and kids"
                className="desktop-bg-image"
              />
              <div className="desktop-bg-overlay"></div>
            </div>
          )}
          
          {/* Desktop Search Form */}
          <div className={`desktop-form-wrapper ${isDesktopSidebar ? 'sidebar-form' : 'full-form-no-title'}`}>
            
            {/* Instructions Preview - Desktop */}
            {searchParams.extraInstructions && !loading.isLoading && (
              <div className="desktop-instructions-preview">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                    <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-medium text-yellow-800">Special Instructions</span>
                </div>
                <p className="text-sm text-yellow-700 break-words">{searchParams.extraInstructions}</p>
              </div>
            )}
            

            {/* Desktop Search Form (hidden when loading) */}
            {!loading.isLoading && (
              <div className="desktop-search-form">
                <div className="desktop-form-grid">
                  {/* Location and Date - Row 1 */}
                  <div className="desktop-form-row">
                    <div className="desktop-form-field">
                      <label className="desktop-field-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-purple-600">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
                        </svg>
                        Location
                      </label>
                      <button
                        type="button"
                        onClick={handleLocationModalOpen}
                        className={`desktop-input-button ${searchParams.location ? 'has-value' : ''}`}
                      >
                        {searchParams.location || 'Enter location...'}
                      </button>
                    </div>
                    
                    <div className="desktop-form-field">
                      <label className="desktop-field-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-blue-600">
                          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="currentColor"/>
                        </svg>
                        Date
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowDateModal(true)}
                        className={`desktop-input-button ${searchParams.date ? 'has-value' : ''}`}
                      >
                        {searchParams.date ? new Date(searchParams.date).toLocaleDateString() : 'Select date...'}
                      </button>
                    </div>
                  </div>

                  {/* Duration and Ages - Row 2 */}
                  <div className="desktop-form-row">
                    <div className="desktop-form-field">
                      <label className="desktop-field-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-purple-600">
                          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="currentColor"/>
                          <path d="m12.5 7-1 1v6l1 1 4.25-2.5.75-1.25-5-3.25z" fill="currentColor"/>
                        </svg>
                        Duration: {searchParams.duration === 10 ? '10+' : searchParams.duration} hours
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        className="desktop-slider w-full cursor-pointer"
                        value={searchParams.duration || 1}
                        onChange={e => updateSearchParams({ duration: parseInt(e.target.value) })}
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>1h</span>
                        <span>5h</span>
                        <span>10+h</span>
                      </div>
                    </div>
                    
                    <div className="desktop-form-field">
                      <label className="desktop-field-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-green-600">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                        </svg>
                        Kids Ages
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAgeModal(true)}
                        className={`desktop-input-button ${searchParams.ages.length > 0 ? 'has-value' : ''}`}
                      >
                        {searchParams.ages.length > 0 ? getCurrentAgeLabel() : 'Select ages...'}
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - Row 3 */}
                  <div className={`desktop-form-actions ${isDesktopSidebar ? 'sidebar-actions' : ''}`}>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleResetForm}
                        className="desktop-action-btn secondary"
                        title="Reset form"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 4v6h6"/>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                        Reset
                      </button>

                      {searchHistory.length > 0 && (
                        <div className="desktop-action-container" ref={historyDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setShowHistory(!showHistory)}
                            className="desktop-action-btn secondary"
                            title="Recent searches"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            History
                          </button>
                          
                          {showHistory && (
                            <div className="desktop-history-dropdown">
                              {searchHistory.map((entry) => (
                                <div key={entry.id} className="desktop-history-item">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      loadFromHistory(entry);
                                      setShowHistory(false);
                                    }}
                                    className="desktop-history-button"
                                  >
                                    <div className="font-medium text-gray-900">{entry.location}</div>
                                    <div className="text-sm text-gray-600">
                                      {entry.date} • {entry.duration}h • Ages: {entry.kidsAges.join(', ')}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {new Date(entry.timestamp).toLocaleDateString()}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteHistoryEntry(entry.id);
                                    }}
                                    className="text-red-500 hover:text-red-700 p-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowInstructionsModal(true)}
                        className={`desktop-action-btn secondary ${extraInstructions ? 'has-instructions' : ''}`}
                        title={extraInstructions ? 'Instructions saved - click to edit' : 'Add instructions'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171"/>
                        </svg>
                        Instructions
                      </button>
                    </div>

                    {/* Search Button - Full width in sidebar mode */}
                    <button
                      type="button"
                      onClick={() => onSearch && onSearch()}
                      disabled={!searchParams.location.trim() || !searchParams.date || searchParams.duration === '' || searchParams.ages.length === 0}
                      className={`desktop-search-button ${isDesktopSidebar ? 'sidebar-search-button' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                      Search Activities
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Context in Sidebar Mode */}
            {isDesktopSidebar && searchContext && (
              <div className="desktop-sidebar-context">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Search Context</h3>
                
                {/* Full Weather Card - matches mobile version */}
                <div className={`p-3 rounded-xl border border-gray-200 text-white relative overflow-hidden mb-4 ${
                  searchContext.weather.temperature_max_c === null && searchContext.weather.precipitation_probability_percent === null
                    ? 'bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700'
                    : 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700'
                }`}>
                  <div className="absolute top-2 right-2 text-xs opacity-75">
                    {new Date(searchContext.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-2xl">
                        {searchContext.weather.temperature_max_c === null && searchContext.weather.precipitation_probability_percent === null
                          ? '🌫️' 
                          : (searchContext.weather.precipitation_probability_percent > 70 ? '🌧️' : 
                             searchContext.weather.precipitation_probability_percent > 40 ? '⛅' : 
                             searchContext.weather.temperature_max_c > 25 ? '☀️' : 
                             searchContext.weather.temperature_max_c < 10 ? '❄️' : '🌤️')
                        }
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {searchContext.weather.temperature_max_c ?? '—'}°
                        </div>
                        <div className="text-xs opacity-80">
                          {searchContext.weather.temperature_max_c === null && searchContext.weather.temperature_min_c === null
                            ? 'Weather data unavailable'
                            : `${searchContext.weather.temperature_min_c ?? '—'}°~${searchContext.weather.temperature_max_c ?? '—'}°`
                          }
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span>💧</span>
                        <span>{searchContext.weather.precipitation_probability_percent ?? '—'}%</span>
                      </div>
                      {typeof searchContext.weather.wind_speed_max_kmh === 'number' && (
                        <div className="flex items-center gap-1">
                          <span>💨</span>
                          <span>{Math.round(searchContext.weather.wind_speed_max_kmh)}km/h</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {searchContext.weather.temperature_max_c === null && searchContext.weather.precipitation_probability_percent === null && (
                    <div className="mt-2 text-xs opacity-80">
                      Weather forecast unavailable for future dates
                    </div>
                  )}
                </div>

                {/* Compact Status Row */}
                <div className="flex gap-2 text-xs mb-3">
                  {/* Holiday Status */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200">
                    <span className="text-sm">{searchContext.is_public_holiday ? '🎉' : '📅'}</span>
                    <span className="text-gray-700">
                      {searchContext.is_public_holiday 
                        ? (searchContext.holidays && searchContext.holidays.length > 0 
                            ? `${searchContext.holidays.length} holiday${searchContext.holidays.length > 1 ? 's' : ''}`
                            : 'Public holiday')
                        : 'No public holiday'}
                    </span>
                  </div>

                  {/* Festival Status */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200">
                    <span className="text-sm">🎪</span>
                    <span className="text-gray-700">
                      {searchContext.nearby_festivals.length > 0 
                        ? `${searchContext.nearby_festivals.length} festival${searchContext.nearby_festivals.length > 1 ? 's' : ''}`
                        : 'No festivals'
                      }
                    </span>
                  </div>
                </div>

                {/* Holidays Detail (only if there are holidays) */}
                {searchContext.holidays && searchContext.holidays.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {searchContext.holidays.map((holiday: {name: string; localName: string; date: string}, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                        <span className="text-sm">🎉</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-yellow-900 truncate">{holiday.localName}</div>
                          {holiday.localName !== holiday.name && (
                            <div className="text-xs text-yellow-700 truncate">{holiday.name}</div>
                          )}
                          <div className="text-xs text-yellow-600">
                            {new Date(holiday.date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Festivals Detail (only if there are festivals) */}
                {searchContext.nearby_festivals.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {searchContext.nearby_festivals.slice(0, 2).map((f: {name: string; start_date: string | null; end_date: string | null; url: string | null; distance_km: number | null}, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-200">
                        <span className="text-sm">🎪</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">{f.name}</div>
                          {f.start_date && (
                            <div className="text-xs text-gray-600">
                              {f.start_date === f.end_date 
                                ? (f.start_date ? new Date(f.start_date).toLocaleDateString() : 'Unknown')
                                : `${f.start_date ? new Date(f.start_date).toLocaleDateString() : 'Unknown'} - ${f.end_date ? new Date(f.end_date).toLocaleDateString() : 'Unknown'}`
                              }
                            </div>
                          )}
                          {f.distance_km && (
                            <div className="text-xs text-gray-500">{f.distance_km}km away</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {searchContext.nearby_festivals.length > 2 && (
                      <div className="text-center text-xs text-gray-500 py-1">
                        +{searchContext.nearby_festivals.length - 2} more festivals
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* All the modals remain the same */}
        {renderModals()}
      </div>
    );
  }

  // Detect if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
    || (window.navigator as any).standalone 
    || document.referrer.includes('android-app://');

  // Mobile Layout (Original)
  return (
    <div className="glass-search-page">
      {/* Background Image */}
      <div className="glass-bg-container">
        <img
          src={getImageUrl('BGPC')}
          alt="Nature background with kids playing"
          className="glass-bg-image glass-bg-image-desktop"
        />
        <img
          src={getImageUrl(isStandalone ? 'BG5_FS' : 'BG5')}
          alt="Nature background with kids playing"
          className="glass-bg-image glass-bg-image-mobile"
        />
        <div className="glass-bg-overlay"></div>
      </div>

      {/* Content Container */}
      <div className="glass-content">
        
        {/* Instructions Preview - Top of Screen */}
        {searchParams.extraInstructions && !loading.isLoading && (
          <div 
            ref={instructionsPreviewRef}
            className={`instructions-top-preview ${showInstructionsPreview ? 'expanded' : 'collapsed'}`}
            onClick={() => setShowInstructionsPreview(!showInstructionsPreview)}
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm font-medium text-yellow-800">Special Instructions</span>
            </div>
            {showInstructionsPreview && (
              <p className="text-sm text-yellow-700 break-words mt-2 instructions-text-animated">{searchParams.extraInstructions}</p>
            )}
          </div>
        )}
        
        {/* Loading Animation */}
        {loading.isLoading && (
          <div className="cancel-search-container">
            <div className="loading-animation-container">
              <div className="loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="loading-progress-center">{loading.progress}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Main Search Form (hidden when loading) */}
        {!loading.isLoading && (
          <>
            {/* Glassmorphism Search Card */}
            <div className="glass-card">
          <div className="glass-stack">
            {/* Location and Date - Side by Side */}
            <div className="glass-row-double">
              {/* Location */}
              <div className="glass-row glass-row-half">
                <div className="glass-row-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#475569"/>
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={handleLocationModalOpen}
                  className="glass-input glass-button"
                >
                  <span className={searchParams.location ? '' : 'glass-placeholder'}>
                    {searchParams.location || 'Location'}
                  </span>
                </button>
              </div>

              {/* Date */}
              <div className="glass-row glass-row-half">
                <div className="glass-row-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="#3182ce"/>
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDateModal(true)}
                  className="glass-input glass-button"
                >
                  <span className={searchParams.date ? '' : 'glass-placeholder'}>
                    {searchParams.date ? new Date(searchParams.date).toLocaleDateString() : 'Date'}
                  </span>
                </button>
              </div>
            </div>

            {/* Kids Ages */}
            <div className="glass-row">
              <div className="glass-row-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#38a169"/>
                </svg>
              </div>
              <button
                type="button"
                onClick={() => setShowAgeModal(true)}
                className="glass-input glass-button"
              >
                <span className={searchParams.ages.length > 0 ? '' : 'glass-placeholder'}>
                  {searchParams.ages.length > 0 ? getCurrentAgeLabel() : 'Kids ages'}
                </span>
              </button>
            </div>

            {/* Duration */}
            <div className="glass-row">
              <div className="glass-row-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="#805ad5"/>
                  <path d="m12.5 7-1 1v6l1 1 4.25-2.5.75-1.25-5-3.25z" fill="#805ad5"/>
                </svg>
              </div>
              <div className="glass-input flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">Activity Duration</span>
                  <span className="text-sm font-bold text-gray-800">
                    {searchParams.duration === 10 ? '10+' : searchParams.duration} hours
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  className="duration-slider w-full cursor-pointer"
                  value={searchParams.duration || 1}
                  onChange={e => updateSearchParams({ duration: parseInt(e.target.value) })}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1h</span>
                  <span>5h</span>
                  <span>10+h</span>
                </div>
              </div>
            </div>

          </div>
          
          {/* Top Actions - Reset, History, Instructions */}
          <div className="glass-card-actions">
            {/* Reset Button */}
            <button
              type="button"
              onClick={handleResetForm}
              className="glass-action-btn-with-label"
              title="Reset form"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="action-label">Reset</span>
            </button>

            {/* Recent Searches */}
            {searchHistory.length > 0 && (
              <div className="glass-action-container" ref={historyDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="glass-action-btn-with-label history-btn"
                  title="Recent searches"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="action-label">History</span>
                </button>
                
                {showHistory && (
                  <div className="glass-history-dropdown-top">
                    {searchHistory.length > 3 && (
                      <div className="history-scroll-indicator">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-bounce">
                          <path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-xs text-gray-500">Scroll for more</span>
                      </div>
                    )}
                    {searchHistory.map((entry) => (
                      <div key={entry.id} className="glass-history-item">
                        <button
                          type="button"
                          onClick={() => {
                            loadFromHistory(entry);
                            setShowHistory(false);
                          }}
                          className="glass-history-button"
                        >
                          <div className="glass-history-title">{entry.location}</div>
                          <div className="glass-history-details">
                            {entry.date} • {entry.duration}h • Ages: {entry.kidsAges.join(', ')}
                          </div>
                          {entry.extraInstructions && entry.extraInstructions.trim() && (
                            <div className="glass-history-instructions" title={entry.extraInstructions}>
                              💬 {entry.extraInstructions.length > 40 ? entry.extraInstructions.substring(0, 40) + '...' : entry.extraInstructions}
                            </div>
                          )}
                          <div className="glass-history-date">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryEntry(entry.id);
                          }}
                          className="glass-history-delete"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            <button
              type="button"
              onClick={() => setShowInstructionsModal(true)}
              className={`glass-action-btn-with-label ${extraInstructions ? 'has-instructions' : ''}`}
              title={extraInstructions ? 'Instructions saved - click to edit' : 'Add other instructions'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="action-label">Instructions</span>
            </button>
          </div>
        </div>


        {/* Location Modal */}
        {showLocationModal && (
          <>
            <div className="modal-backdrop" />
            <div className="modal-container" ref={locationDropdownRef}>
              <div className="modal-content location-modal">
                <div className="modal-header">
                  <h3 className="modal-title">Select Location</h3>
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(false)}
                    className="modal-close"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {/* Search Input */}
                  <div className="location-search">
                    <div className="location-search-wrapper">
                      <svg className="location-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <input
                        type="text"
                        value={locationSearchText}
                        onChange={(e) => handleLocationSearch(e.target.value)}
                        placeholder="Search for a city or country..."
                        className="location-search-input"
                        autoFocus
                      />
                      {locationSearchText && (
                        <button
                          type="button"
                          onClick={handleClearLocationSearch}
                          className="location-search-clear"
                          title="Clear search"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Results */}
                  <div className="location-results">
                    {isLoadingCities ? (
                      <div className="location-loading">
                        <div className="location-loading-spinner"></div>
                        <span className="text-gray-600 text-sm">Searching cities...</span>
                      </div>
                    ) : locationSuggestions.length > 0 ? (
                      locationSuggestions.map((city, index) => (
                        <button
                          key={`${city.name}-${city.country}-${index}`}
                          type="button"
                          onClick={() => handleCitySelect(city)}
                          className="location-result-item"
                        >
                          <div className="location-result-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#475569"/>
                            </svg>
                          </div>
                          <div className="location-result-info">
                            <span className="location-result-name">{city.name}</span>
                            <span className="location-result-country">{city.country}</span>
                          </div>
                        </button>
                      ))
                    ) : locationSearchText.length >= 2 ? (
                      <div className="location-no-results">
                        No cities found for "{locationSearchText}"
                      </div>
                    ) : (
                      <div className="location-section">
                        {(() => {
                          const uniqueLocations = getUniqueLocationsFromHistory();
                          return uniqueLocations.length > 0 && (
                            <>
                              <div className="location-section-header">
                                <h4 className="location-section-title">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="currentColor"/>
                                  </svg>
                                  Recent Locations
                                </h4>
                              </div>
                              {uniqueLocations.map((location, index) => (
                                <button
                                  key={`history-${location}-${index}`}
                                  type="button"
                                  onClick={() => handleLocationHistorySelect(location)}
                                  className="location-result-item location-history-item"
                                >
                                  <div className="location-result-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                      <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="#6B7280"/>
                                    </svg>
                                  </div>
                                  <div className="location-result-info">
                                    <span className="location-result-name">{location}</span>
                                  </div>
                                </button>
                              ))}
                            </>
                          );
                        })()}
                        <div className="location-placeholder">
                          {getUniqueLocationsFromHistory().length > 0 ? 'Type to search for more locations...' : 'Start typing to search for cities...'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Date Modal */}
        {showDateModal && (
          <>
            <div className="modal-backdrop" />
            <div className="modal-container" ref={dateModalRef}>
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title">Select Date</h3>
                  <button
                    type="button"
                    onClick={() => setShowDateModal(false)}
                    className="modal-close"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  <div className="calendar-container">
                    {/* Calendar Header */}
                    <div className="calendar-header">
                      <button
                        type="button"
                        onClick={() => navigateMonth('prev')}
                        className="calendar-nav"
                      >
                        ‹
                      </button>
                      <h4 className="calendar-month">
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </h4>
                      <button
                        type="button"
                        onClick={() => navigateMonth('next')}
                        className="calendar-nav"
                      >
                        ›
                      </button>
                    </div>
                    
                    {/* Days of week */}
                    <div className="calendar-weekdays">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="calendar-weekday">{day}</div>
                      ))}
                    </div>
                    
                    {/* Calendar Grid */}
                    <div className="calendar-grid">
                      {/* Empty cells for days before month starts */}
                      {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, index) => (
                        <div key={`empty-${index}`} className="calendar-day-empty"></div>
                      ))}
                      
                      {/* Days of the month */}
                      {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, index) => {
                        const day = index + 1;
                        const isPast = isPastDate(day);
                        const selected = isSelected(day);
                        const today = isToday(day);
                        
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => !isPast && handleDateSelect(day)}
                            disabled={isPast}
                            className={`calendar-day ${selected ? 'calendar-day-selected' : ''} ${today ? 'calendar-day-today' : ''} ${isPast ? 'calendar-day-disabled' : ''}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Instructions Modal */}
        {showInstructionsModal && (
          <>
            <div className="modal-backdrop" />
            <div className="modal-container" ref={instructionsModalRef}>
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title">Other Instructions</h3>
            <button
              type="button"
                    onClick={() => setShowInstructionsModal(false)}
                    className="modal-close"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {/* Quick Tags */}
                  <div className="instructions-tags">
                    <div className="instructions-tags-scroll-container">
                      <div className="instructions-tags-scroll">
                        {[
                          '♿ Wheelchair accessible',
                          '🚇 Near metro/public transport',
                          '🌳 Outdoor activities preferred',
                          '🏢 Indoor activities preferred',
                          '💰 Budget-friendly options',
                          '🎨 Creative/educational focus',
                          '🏃‍♂️ High energy activities',
                          '😴 Calm/quiet activities',
                          '🍔 Food available on-site',
                          '🅿️ Parking available'
                        ].map((tag, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              const tagText = tag.substring(2); // Remove emoji
                              if (extraInstructions.includes(tagText)) {
                                // Remove the tag
                                setExtraInstructions(extraInstructions.replace(tagText, '').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, ''));
                              } else {
                                // Add the tag
                                setExtraInstructions(extraInstructions + (extraInstructions ? ', ' + tagText : tagText));
                              }
                            }}
                            className={`instructions-tag-scroll ${extraInstructions.includes(tag.substring(2)) ? 'active' : ''}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                      <div className="tags-scroll-indicator">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="opacity-50">
                          <path d="M19 12l-7 7m0 0l-7-7m7 7V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Instructions Input */}
                  <div className="instructions-input">
                    <textarea
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      placeholder="Instructions - Click tags above or type your requirements..."
                      className="instructions-input-field"
                      rows={3}
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="instructions-actions-row">
                    <button
                      type="button"
                      onClick={() => {
                        setExtraInstructions('');
                        updateSearchParams({ extraInstructions: '' });
                      }}
                      className="instructions-btn instructions-btn-clear"
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateSearchParams({ extraInstructions: extraInstructions });
                        setShowInstructionsModal(false);
                      }}
                      className="instructions-btn instructions-btn-save"
                    >
                      Save Instructions
                    </button>
                  </div>
                </div>
              </div>
          </div>
          </>
        )}
        
        </>
        )}

        {/* Age Modal */}
        {showAgeModal && (
          <>
            <div className="modal-backdrop" />
            <div className="modal-container" ref={ageModalRef}>
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title">Select Kids Ages</h3>
                  <button
                    type="button"
                    onClick={() => setShowAgeModal(false)}
                    className="modal-close"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  <div className="age-options">
                    {AGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleAgeOptionChange(option)}
                        className="age-option-item"
                      >
                        <div className="age-option-icon">
                          {option.value === 'toddlers' && '👶'}
                          {option.value === 'preschoolers' && '🧒'}
                          {option.value === 'early-elementary' && '👦'}
                          {option.value === 'pre-teens' && '👧'}
                          {option.value === 'teenagers' && '👨‍🎓'}
                        </div>
                        <div className="age-option-info">
                          <span className="age-option-label">{option.label}</span>
                          
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}