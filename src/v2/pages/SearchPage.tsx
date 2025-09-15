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
  onSearch
}: SearchPageProps) {
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
  const ageModalRef = useRef<HTMLDivElement>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const dateModalRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const instructionsModalRef = useRef<HTMLDivElement>(null);

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

  // Load cities from CSV
  useEffect(() => {
    const loadCities = async () => {
      try {
        const response = await fetch('/world-cities.csv');
        const csvText = await response.text();
        const lines = csvText.split('\n');
        const citiesData: City[] = [];
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const [name, country] = line.split(',');
            if (name && country) {
              citiesData.push({ name: name.trim(), country: country.trim() });
            }
          }
        }
        
        setCities(citiesData);
      } catch (error) {
        console.error('Failed to load cities:', error);
      }
    };

    loadCities();
  }, []);

  // Open location modal
  const handleLocationModalOpen = () => {
    setLocationSearchText(searchParams.location || '');
    setShowLocationModal(true);
    if (searchParams.location && searchParams.location.length >= 2) {
      const filtered = cities.filter(city => 
        city.name.toLowerCase().includes(searchParams.location.toLowerCase()) ||
        city.country.toLowerCase().includes(searchParams.location.toLowerCase())
      ).slice(0, 50);
      setLocationSuggestions(filtered);
    }
  };

  // Filter cities in modal
  const handleLocationSearch = (value: string) => {
    setLocationSearchText(value);
    
    if (value.length >= 2) {
      const filtered = cities.filter(city => 
        city.name.toLowerCase().includes(value.toLowerCase()) ||
        city.country.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 50);
      setLocationSuggestions(filtered);
    } else {
      setLocationSuggestions([]);
    }
  };

  // Handle selecting a city suggestion
  const handleCitySelect = (city: City) => {
    updateSearchParams({ location: `${city.name}, ${city.country}` });
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
    };

    const handleResize = () => {
      // Close modals on resize
      setShowLocationModal(false);
      setShowDateModal(false);
      setShowAgeModal(false);
      setShowHistory(false);
      setShowInstructionsModal(false);
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
          src={getImageUrl('BG5')}
          alt="Nature background with kids playing"
          className="glass-bg-image glass-bg-image-mobile"
        />
        <div className="glass-bg-overlay"></div>
      </div>

      {/* Content Container */}
      <div className="glass-content">
        
        {/* Instructions Preview - Top of Screen */}
        {searchParams.extraInstructions && !loading.isLoading && (
          <div className="instructions-top-preview">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm font-medium text-yellow-800">Special Instructions</span>
            </div>
            <p className="text-sm text-yellow-700 break-words">{searchParams.extraInstructions}</p>
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
            {/* Location */}
            <div className="glass-row">
              <div className="glass-row-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#e53e3e"/>
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
            <div className="glass-row">
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

          </div>
          
          {/* Top Actions - Instructions, Recent, Reset */}
          <div className="glass-card-actions">
            {/* Recent Searches */}
            {searchHistory.length > 0 && (
              <div className="glass-action-container" ref={historyDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="glass-action-btn-with-label"
                  title="Recent searches"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="action-label">History</span>
                </button>
                
                {showHistory && (
                  <div className="glass-history-dropdown-top">
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
                    </div>
                  </div>
                  
                  {/* Results */}
                  <div className="location-results">
                    {locationSuggestions.length > 0 ? (
                      locationSuggestions.map((city, index) => (
                        <button
                          key={`${city.name}-${city.country}-${index}`}
                          type="button"
                          onClick={() => handleCitySelect(city)}
                          className="location-result-item"
                        >
                          <div className="location-result-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#e53e3e"/>
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
                      <div className="location-placeholder">
                        Start typing to search for cities...
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
                    <h4 className="instructions-tags-title">Quick Tags</h4>
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
                  </div>
                  
                  {/* Instructions Input */}
                  <div className="instructions-input">
                    <label className="instructions-label">
                      Instructions
                    </label>
                    <textarea
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      placeholder="Click tags above or type your requirements..."
                      className="instructions-input-field"
                      rows={3}
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="instructions-actions">
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