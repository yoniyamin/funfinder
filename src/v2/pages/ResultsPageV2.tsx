import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Activity, Context } from '../../lib/schema';
import { getImageUrl } from '../../config/assets';
import { shareActivityCard, isSharingSupported } from '../../lib/share-card';
import './ResultsPageV2.css';

interface ResultsPageProps {
  searchResults: {
    activities: Activity[] | null;
    ctx: Context | null;
    webSources: Array<{title: string; url: string; source: string}> | null;
  };
  searchParams: {
    location: string;
    date: string;
    duration: number | '';
    ages: number[];
    extraInstructions: string;
  };
  loading: {
    isLoading: boolean;
    progress: number;
    status: string;
  };
  exclusionList: {[location: string]: string[]};
  addToExclusionList: (location: string, attraction: string) => Promise<boolean>;
  removeFromExclusionList: (location: string, attraction: string) => Promise<boolean>;
  backToSearch: () => void;
  onRefreshSearch?: () => void;
  isDesktopSideBySide?: boolean;
}

// Import additional icons for better category representation
import { 
  MapPin, Calendar, Clock, Users, DollarSign, 
  Sun, CloudRain, Cloud, Droplets, Wind, PartyPopper,
  ChevronDown, ExternalLink, Share2, XCircle,
  Filter, X, Eye, Sparkles, BookOpen,
  Landmark, TreePine, Baby, Mountain, Waves, Palette, 
  Theater, Snowflake, UtensilsCrossed, Music, Camera,
  Castle, Building2, Gamepad2, Umbrella, Flame,
  ThermometerSun, Shirt, ShieldCheck, Heart
} from 'lucide-react';
import { WeatherCarousel } from '../components/WeatherCarousel';
import { getWeatherTips, getWeatherSummary } from '../../lib/weatherHelpers';

// Icon mapping for categories with more specific icons
function getCategoryIcon(category: string) {
  const iconMap: {[key: string]: typeof MapPin} = {
    'playground': Baby,
    'park': TreePine,
    'museum': Landmark,
    'outdoor': Mountain,
    'indoor': Building2,
    'water': Waves,
    'hike': Mountain,
    'creative': Palette,
    'festival': PartyPopper,
    'show': Theater,
    'seasonal': Snowflake,
    'other': Sparkles,
  };
  return iconMap[category] || Sparkles;
}

// Weather icon mapping
function getWeatherIcon(weather: string) {
  switch(weather) {
    case 'good': return Sun;
    case 'ok': return Cloud;
    case 'bad': return CloudRain;
    default: return Sun;
  }
}

// Truncate text with read more
function TruncatedText({ text, maxLength = 150 }: { text: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text) return null;
  
  const needsTruncation = text.length > maxLength;
  const displayText = isExpanded || !needsTruncation ? text : text.slice(0, maxLength) + '...';
  
  return (
    <div className="truncated-text">
      <p className="text-sm text-gray-700 leading-relaxed">{displayText}</p>
      {needsTruncation && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="read-more-btn"
        >
          {isExpanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

// Activity Card Component
interface ActivityCardProps {
  activity: Activity;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onExclude: () => void;
  context: Context | null;
  displayIndex: number;
  isFlipped: boolean;
  onToggleFlip: () => void;
}

function ActivityCard({ 
  activity, 
  index, 
  isExpanded, 
  onToggleExpand,
  onExclude,
  context,
  displayIndex,
  isFlipped,
  onToggleFlip
}: ActivityCardProps) {
  const [sharingActivity, setSharingActivity] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const CategoryIcon = getCategoryIcon(activity.category);
  const WeatherIcon = getWeatherIcon(activity.weather_fit);
  const cardRef = useRef<HTMLDivElement>(null);

  const hasPrimaryAction = Boolean(activity.booking_url);

  // Check if activity is already favorited on mount
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      try {
        const response = await fetch('/api/favorites');
        if (response.ok) {
          const data = await response.json();
          const favorites = data.favorites || [];
          // Check if this activity title exists in favorites
          const isAlreadyFavorited = favorites.some(
            (fav: any) => fav.title === activity.title && fav.location === context?.location
          );
          setIsFavorited(isAlreadyFavorited);
        }
      } catch (error) {
        console.error('Error checking favorite status:', error);
      }
    };
    
    checkFavoriteStatus();
  }, [activity.title, context?.location]);

  // Handle adding to favorites
  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Optimistic UI update
    const wasFavorited = isFavorited;
    setIsFavorited(!isFavorited);
    
    // Trigger animation only when favoriting (not unfavoriting)
    if (!wasFavorited) {
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    }

    try {
      if (!wasFavorited) {
        // Add to favorites
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity,
            location: context?.location || 'Unknown'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to save favorite');
        }

        console.log('✅ Activity saved to favorites');
      } else {
        // Remove from favorites - would need activityId
        // For now, just toggle the UI state
        console.log('ℹ️ Unfavoriting not yet implemented');
      }
    } catch (error) {
      console.error('Error saving favorite:', error);
      // Revert on error
      setIsFavorited(wasFavorited);
    }
  };
  
  const handleLocationClick = (e: React.MouseEvent) => {
    console.log('🖱️ Location button clicked!', { index, address: activity.address, isFlipped });
    e.preventDefault();
    e.stopPropagation();
    console.log('🔄 After preventDefault/stopPropagation, calling onToggleFlip...');
    if (activity.address) {
      onToggleFlip();
      console.log('✅ onToggleFlip called, new isFlipped should be:', !isFlipped);
    } else {
      console.warn('⚠️ No address found, flip not triggered');
    }
  };

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activity.booking_url) {
      window.open(activity.booking_url, '_blank');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSharingActivity(true);
    try {
      const cardElement = document.getElementById(`activity-card-${index}`);
      if (cardElement) {
        await shareActivityCard(activity, cardElement, context?.location);
      }
    } catch (error) {
      console.error('Share failed:', error);
    } finally {
      setSharingActivity(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Activity Number Badge - Outside card to prevent clipping */}
      <div className="activity-number-badge">
        {displayIndex}
      </div>

      <motion.article
        ref={cardRef}
        id={`activity-card-${index}`}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`activity-card-v2 ${isExpanded ? 'expanded' : 'collapsed'} ${isFlipped ? 'flipped' : ''}`}
        onClick={onToggleExpand}
        style={{ cursor: 'pointer' }}
      >
        {/* Collapsed State */}
      {!isExpanded ? (
        <div className="card-collapsed-content">
          <div className="card-header-minimal">
            <div className="flex items-start gap-3 flex-1">
              <div className="category-icon-wrapper">
                <CategoryIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="activity-title-collapsed">{activity.title || 'Untitled activity'}</h3>
                {activity.address && (
                  <div className="activity-location-brief">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="location-text">{activity.address.split(',').slice(0, 2).join(',')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card-meta-minimal">
            <div className="meta-badges">
              {activity.free !== undefined && (
                <span 
                  className={`meta-badge ${activity.free ? 'badge-free' : 'badge-paid'}`}
                  title={activity.free ? 'This activity is free of charge' : 'This activity requires payment'}
                >
                  {activity.free ? 'Free' : 'Paid'}
                </span>
              )}
              {typeof activity.duration_hours === 'number' && (
                <span 
                  className="meta-badge"
                  title={`Average visit duration: ${activity.duration_hours} ${activity.duration_hours === 1 ? 'hour' : 'hours'}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {activity.duration_hours}h
                </span>
              )}
              <span 
                className={`meta-badge badge-weather-${activity.weather_fit || 'any'}`}
                title={
                  activity.weather_fit === 'good' ? 'Perfect day to be outside!' :
                  activity.weather_fit === 'ok' ? 'Works in most weather conditions' :
                  activity.weather_fit === 'bad' ? 'Great indoor option for rainy days' :
                  'All-weather activity'
                }
              >
                <WeatherIcon className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          <div className="card-actions-collapsed" onClick={(e) => e.stopPropagation()}>
            {/* Primary Button - Takes majority of space */}
            {activity.booking_url ? (
              <a
                href={activity.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="booking-button-primary collapsed-btn"
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1 }}
              >
                <Calendar className="w-4 h-4" />
                Book
              </a>
            ) : (
              <button
                type="button"
                className="booking-button-primary collapsed-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleExpand();
                }}
                style={{ textDecoration: 'none', flex: 1 }}
              >
                <Eye className="w-4 h-4" />
                View Details
              </button>
            )}
            
            {/* Secondary Buttons - Fixed width, side by side */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {/* Favorite Button */}
              <button
                onClick={handleFavorite}
                className="share-button-icon-only relative"
                title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                style={{
                  position: 'relative',
                  overflow: 'visible'
                }}
              >
                {showHeartAnimation && (
                  <>
                    {/* Heart particles animation */}
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                        initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                        animate={{
                          scale: [0, 1, 0.5],
                          x: Math.cos((i / 5) * Math.PI * 2) * 30,
                          y: Math.sin((i / 5) * Math.PI * 2) * 30,
                          opacity: [1, 1, 0]
                        }}
                        transition={{
                          duration: 0.8,
                          ease: 'easeOut'
                        }}
                      >
                        <Heart
                          className="w-3 h-3"
                          fill="#F26B8A"
                          stroke="#F26B8A"
                        />
                      </motion.div>
                    ))}
                  </>
                )}
                <motion.div
                  animate={showHeartAnimation ? {
                    scale: [1, 1.4, 1],
                  } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <Heart
                    className="w-4 h-4"
                    fill={isFavorited ? "#F26B8A" : "none"}
                    stroke={isFavorited ? "#F26B8A" : "currentColor"}
                    style={{ color: isFavorited ? "#F26B8A" : undefined }}
                  />
                </motion.div>
              </button>
              
              {/* Share Button */}
              {isSharingSupported() && (
                <button
                  onClick={handleShare}
                  disabled={sharingActivity}
                  className="share-button-icon-only"
                  title="Share this activity"
                >
                  {sharingActivity ? (
                    <div className="animate-spin">⏳</div>
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Expanded State */
        <div className="card-expanded-content">
          {/* Header with exclude only */}
          <div className="card-expanded-header">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExclude();
              }}
              className="exclude-button"
              title="Hide this activity"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Full Content */}
          <div className="expanded-content-body">
            <div className="flex items-start gap-4 mb-4">
              <div className="category-icon-wrapper-large">
                <CategoryIcon className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="activity-title-expanded">{activity.title || 'Untitled activity'}</h3>
                {activity.address && (
                  <button
                    type="button"
                    className="activity-address-link"
                    onClick={handleLocationClick}
                    onMouseDown={(e) => console.log('🖱️ MouseDown on location button', { index })}
                    onMouseUp={(e) => console.log('🖱️ MouseUp on location button', { index })}
                    style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%', cursor: 'pointer' }}
                  >
                    <MapPin className="w-4 h-4" />
                    {activity.address}
                  </button>
                )}
              </div>
            </div>

            {/* Detailed badges */}
            <div className="expanded-badges">
              <span 
                className="expanded-badge badge-category"
                title={`Category: ${activity.category}`}
              >
                <CategoryIcon className="w-4 h-4" />
                {activity.category}
              </span>
              {activity.free !== undefined && (
                <span 
                  className={`expanded-badge ${activity.free ? 'badge-free' : 'badge-paid'}`}
                  title={activity.free ? 'Free activity - no admission charge' : 'Paid activity - booking or tickets required'}
                >
                  <DollarSign className="w-4 h-4" />
                  {activity.free ? 'Free' : 'Paid'}
                </span>
              )}
              {typeof activity.duration_hours === 'number' && (
                <span 
                  className="expanded-badge"
                  title={`Recommended duration: ${activity.duration_hours} ${activity.duration_hours === 1 ? 'hour' : 'hours'}`}
                >
                  <Clock className="w-4 h-4" />
                  {activity.duration_hours}h
                </span>
              )}
              {activity.suitable_ages && (
                <span 
                  className="expanded-badge"
                  title={`Best suited for: ${activity.suitable_ages}`}
                >
                  <Users className="w-4 h-4" />
                  {activity.suitable_ages}
                </span>
              )}
              <span 
                className="expanded-badge badge-weather"
                title={
                  activity.weather_fit === 'good' ? 'Best enjoyed outdoors on a sunny day' :
                  activity.weather_fit === 'ok' ? 'Suitable for most weather conditions' :
                  activity.weather_fit === 'bad' ? 'Perfect indoor activity for any weather' :
                  'Works in any weather'
                }
              >
                <WeatherIcon className="w-4 h-4" />
                {activity.weather_fit === 'good' ? 'Outdoor' : 
                 activity.weather_fit === 'ok' ? 'Flexible' :
                 activity.weather_fit === 'bad' ? 'Indoor' : 'Any weather'}
              </span>
              {activity.source === 'Fever' && context && (
                <a
                  href={`https://feverup.com/en/${encodeURIComponent(context.location.split(',')[0].toLowerCase().trim().replace(/\s+/g, '-'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="expanded-badge badge-fever"
                  title="Live event from Fever - click to see more events"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PartyPopper className="w-4 h-4" />
                  <span>Live Event</span>
                </a>
              )}
            </div>

            {/* Description */}
            <div className="mt-4">
              <TruncatedText text={activity.description || ''} maxLength={200} />
            </div>

            {/* Notes */}
            {activity.notes && (
              <div className="activity-notes">
                <span className="notes-icon">⚠️</span>
                <span>{activity.notes}</span>
              </div>
            )}

            {/* Actions */}
            <div className="expanded-actions">
              {activity.booking_url ? (
                <a
                  href={activity.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="booking-button-primary expanded"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Calendar className="w-5 h-5" />
                  Book Now
                </a>
              ) : activity.address ? (
                <button
                  type="button"
                  className="booking-button-primary expanded"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleLocationClick(e);
                  }}
                  style={{ textDecoration: 'none' }}
                >
                  <MapPin className="w-5 h-5" />
                  View on Map
                </button>
              ) : null}
              {/* Favorite Button */}
              <button
                onClick={handleFavorite}
                className="share-button-icon-only relative"
                title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                style={{
                  position: 'relative',
                  overflow: 'visible'
                }}
              >
                {showHeartAnimation && (
                  <>
                    {/* Heart particles animation */}
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                        initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                        animate={{
                          scale: [0, 1, 0.5],
                          x: Math.cos((i / 5) * Math.PI * 2) * 30,
                          y: Math.sin((i / 5) * Math.PI * 2) * 30,
                          opacity: [1, 1, 0]
                        }}
                        transition={{
                          duration: 0.8,
                          ease: 'easeOut'
                        }}
                      >
                        <Heart
                          className="w-3 h-3"
                          fill="#F26B8A"
                          stroke="#F26B8A"
                        />
                      </motion.div>
                    ))}
                  </>
                )}
                <motion.div
                  animate={showHeartAnimation ? {
                    scale: [1, 1.4, 1],
                  } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <Heart
                    className="w-5 h-5"
                    fill={isFavorited ? "#F26B8A" : "none"}
                    stroke={isFavorited ? "#F26B8A" : "currentColor"}
                    style={{ color: isFavorited ? "#F26B8A" : undefined }}
                  />
                </motion.div>
              </button>
              {isSharingSupported() && (
                <button
                  onClick={handleShare}
                  disabled={sharingActivity}
                  className="share-button-icon-only"
                  title="Share this activity"
                >
                  {sharingActivity ? (
                    <div className="animate-spin">⏳</div>
                  ) : (
                    <Share2 className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map View (Flipped Side) - Only shown when expanded and flipped */}
      {isExpanded && activity.address && (
        <div className="card-map-view">
          <div className="map-view-header">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFlip();
              }}
              className="map-view-back"
              title="Back to details"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
              Back
            </button>
            <div className="map-view-title">{activity.title || 'Location'}</div>
          </div>
          <div className="map-iframe-container">
            <iframe
              src={`https://www.google.com/maps?q=${encodeURIComponent(activity.address)}&output=embed`}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map of ${activity.title}`}
            />
          </div>
          <div className="map-view-actions">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="open-maps-button"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-5 h-5" />
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
      </motion.article>
    </div>
  );
}

// Floating Activity Counter
// Removed FloatingActivityCounter - no longer needed

// Random message for activity count (chosen once)
const getRandomMessage = (count: number) => {
  const messages = [
    `activities to explore`,
    `fun experiences await`,
    `adventures available`,
    `activities for your kids`,
    `experiences to discover`,
  ];
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
};

export default function ResultsPageV2({
  searchResults,
  searchParams,
  loading,
  exclusionList,
  addToExclusionList,
  removeFromExclusionList,
  backToSearch,
  onRefreshSearch,
  isDesktopSideBySide = false
}: ResultsPageProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [currentVisibleCard, setCurrentVisibleCard] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [randomMessage] = useState(() => getRandomMessage(0)); // Choose once on mount
  const [showHourlyWeather, setShowHourlyWeather] = useState(false); // Collapsed by default
  const [showWeatherTips, setShowWeatherTips] = useState(false); // Collapsed by default
  const [showAllEvents, setShowAllEvents] = useState(false); // For expanding festivals/holidays
  const [currentTipIndex, setCurrentTipIndex] = useState(0); // Move to top level
  
  // Filters
  const [fCat, setFCat] = useState<string>('');
  const [fFree, setFFree] = useState<string>('');
  const [fWeather, setFWeather] = useState<string>('');
  const [fSource, setFSource] = useState<string>('');

  const { activities, ctx, webSources } = searchResults;

  // Weather tips rotation logic - moved to top level
  const weatherTips = useMemo(() => {
    if (!ctx) return [];
    return getWeatherTips(
      ctx.weather.temperature_max_c,
      ctx.weather.temperature_min_c,
      ctx.weather.precipitation_probability_percent,
      ctx.weather.wind_speed_max_kmh
    );
  }, [ctx]);

  useEffect(() => {
    if (weatherTips.length <= 1 || !showWeatherTips) return;
    
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % weatherTips.length);
    }, 3000); // Rotate every 3 seconds
    
    return () => clearInterval(interval);
  }, [weatherTips.length, showWeatherTips]);

  const cats = useMemo(() => 
    Array.from(new Set((activities || []).map(a => a.category))).sort(), 
    [activities]
  );

  const filtered = useMemo(() => {
    let list = (activities || []).slice();
    
    // Filter out excluded activities
    if (ctx?.location && exclusionList[ctx.location]) {
      const excluded = exclusionList[ctx.location];
      list = list.filter(a => !excluded.includes(a.title || ''));
    }
    
    if (fCat) list = list.filter(a => a.category === fCat);
    if (fFree === 'true') list = list.filter(a => a.free === true);
    if (fFree === 'false') list = list.filter(a => a.free === false);
    if (fWeather) list = list.filter(a => a.weather_fit === fWeather);
    if (fSource === 'fever') list = list.filter(a => a.source === 'Fever');
    if (fSource === 'ai') list = list.filter(a => !a.source || a.source !== 'Fever');
    
    // Distribute Fever activities throughout results
    const feverActivities = list.filter(a => a.source === 'Fever');
    const otherActivities = list.filter(a => a.source !== 'Fever');
    
    if (feverActivities.length > 0 && otherActivities.length > 0) {
      const distributed: Activity[] = [];
      const interval = Math.max(1, Math.floor(otherActivities.length / feverActivities.length));
      
      let feverIndex = 0;
      otherActivities.forEach((activity, index) => {
        distributed.push(activity);
        if ((index + 1) % interval === 0 && feverIndex < feverActivities.length) {
          distributed.push(feverActivities[feverIndex]);
          feverIndex++;
        }
      });
      
      // Add any remaining Fever activities at the end
      while (feverIndex < feverActivities.length) {
        distributed.push(feverActivities[feverIndex]);
        feverIndex++;
      }
      
      return distributed;
    }
    
    return list;
  }, [activities, fCat, fFree, fWeather, fSource, exclusionList, ctx]);

  const toggleCard = (index: number) => {
    setExpandedCards(prev => {
      const newSet = new Set<number>();
      if (!prev.has(index)) {
        // Expanding this card - collapse all others (accordion behavior)
        newSet.add(index);
      }
      // If card was already expanded and we're collapsing it, newSet stays empty
      return newSet;
    });
    
    // Reset flip state when collapsing
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const toggleFlip = (index: number) => {
    console.log(`🔄 toggleFlip called for card ${index}`);
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      const wasFlipped = newSet.has(index);
      if (wasFlipped) {
        newSet.delete(index);
        console.log(`↩️ Card ${index} will be unflipped`);
      } else {
        newSet.add(index);
        console.log(`🔁 Card ${index} will be flipped`);
      }
      console.log('📋 New flipped cards set:', Array.from(newSet));
      return newSet;
    });
  };

  const handleExclude = async (activity: Activity) => {
    const activityTitle = activity.title || 'Untitled activity';
    const locationName = ctx?.location || 'this location';
    
    if (window.confirm(`Hide "${activityTitle}" from future searches in ${locationName}?`)) {
      if (ctx && await addToExclusionList(ctx.location, activityTitle)) {
        // Activity will be filtered out automatically
      }
    }
  };

  // Intersection Observer for visible card tracking
  useEffect(() => {
    if (filtered.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible card
        let maxRatio = 0;
        let mostVisibleIndex = 0;
        
        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const index = parseInt(entry.target.getAttribute('data-card-index') || '0');
            mostVisibleIndex = index;
          }
        });
        
        if (maxRatio > 0) {
          setCurrentVisibleCard(mostVisibleIndex + 1);
        }
      },
      { 
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '-20% 0px -20% 0px'
      }
    );

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const cards = document.querySelectorAll('[data-card-index]');
      cards.forEach((card) => observer.observe(card));
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [filtered]);

  // No scroll detection needed - sections will scroll naturally

  const clearFilters = () => {
    setFCat('');
    setFFree('');
    setFWeather('');
    setFSource('');
  };

  const hasActiveFilters = fCat || fFree || fWeather || fSource;

  return (
    <div 
      className={`results-page-v2 ${isDesktopSideBySide ? 'desktop-side-by-side' : ''}`}
      style={{ backgroundImage: `url(${getImageUrl('BG6')})` }}
    >
      {/* Sticky Header - Back button, Title, Weather, and Filters stay fixed */}
      {!isDesktopSideBySide && (
        <div className="results-header-v2">
          <div className="header-row">
            <button onClick={backToSearch} className="back-button">
              <ChevronDown className="w-5 h-5 rotate-90" />
              Back to Search
            </button>
            <h1 className="results-title">Activity Results</h1>
          </div>

          {/* Weather Widget - STICKY - stays frozen with header */}
          {ctx && (
            <div style={{ 
              padding: '8px 12px',
              background: '#FFFFFF',
              borderTop: '1px solid #E5E7EB',
              borderBottom: '1px solid #E5E7EB'
            }}>
              {/* One-liner Daily Summary with integrated actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: (showHourlyWeather || showWeatherTips) ? '8px' : '0',
              }}>
                {/* Clickable weather info - expands hourly */}
                <div 
                  onClick={() => setShowHourlyWeather(!showHourlyWeather)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#374151',
                    flexWrap: 'nowrap',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    transition: 'background-color 0.2s',
                    flex: 1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span style={{ fontSize: '16px' }}>
                    {getWeatherSummary(
                      ctx.weather.temperature_min_c,
                      ctx.weather.temperature_max_c,
                      ctx.weather.precipitation_probability_percent,
                      ctx.weather.wind_speed_max_kmh
                    ).emoji}
                  </span>
                  <span>
                    {getWeatherSummary(
                      ctx.weather.temperature_min_c,
                      ctx.weather.temperature_max_c,
                      ctx.weather.precipitation_probability_percent,
                      ctx.weather.wind_speed_max_kmh
                    ).condition}
                  </span>
                  <span style={{ color: '#9CA3AF' }}>•</span>
                  <span>
                    {ctx.weather.temperature_min_c ?? '—'}°-{ctx.weather.temperature_max_c ?? '—'}°C
                  </span>
                  <span style={{ color: '#9CA3AF' }}>•</span>
                  <span>
                    {ctx.weather.precipitation_probability_percent ?? '—'}% rain
                  </span>
                  {typeof ctx.weather.wind_speed_max_kmh === 'number' && (
                    <>
                      <span style={{ color: '#9CA3AF' }}>•</span>
                      <span>
                        {Math.round(ctx.weather.wind_speed_max_kmh)} km/h wind
                      </span>
                    </>
                  )}
                  {ctx.weather.hourly && ctx.weather.hourly.length > 0 && (
                    <ChevronDown 
                      className="w-4 h-4" 
                      style={{ 
                        color: '#9CA3AF',
                        transform: showHourlyWeather ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }} 
                    />
                  )}
                </div>

                {/* Lamp icon on the right - shows/hides tips */}
                {weatherTips.length > 0 && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowWeatherTips(!showWeatherTips);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: showWeatherTips 
                        ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
                        : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!showWeatherTips) {
                        e.currentTarget.style.backgroundColor = '#FEF3C7';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!showWeatherTips) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                    title="What to bring"
                  >
                    <span style={{ fontSize: '18px' }}>💡</span>
                  </div>
                )}
              </div>

              {/* Hourly Weather Carousel - Expandable */}
              <AnimatePresence>
                {showHourlyWeather && ctx.weather.hourly && ctx.weather.hourly.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      overflow: 'hidden',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      paddingTop: '4px'
                    }}>
                      <WeatherCarousel hours={ctx.weather.hourly} visibleCount={4} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Weather Tips - Expandable via lamp icon */}
              <AnimatePresence>
                {showWeatherTips && weatherTips.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 50%, #FCD34D 100%)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#78350F',
                      boxShadow: '0 2px 8px rgba(252, 211, 77, 0.3)',
                    }}>
                      <span style={{ fontSize: '16px' }}>💡</span>
                      <span style={{ fontWeight: 700 }}>Bring:</span>
                      <div 
                        key={currentTipIndex}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          animation: 'fadeInSlide 0.5s ease-in-out',
                          flex: 1
                        }}
                      >
                        {(() => {
                          const currentTip = weatherTips[currentTipIndex % weatherTips.length];
                          const IconComponent = currentTip.icon;
                          return (
                            <>
                              <IconComponent className="w-4 h-4" style={{ color: '#92400E', strokeWidth: 2.5 }} />
                              <span>{currentTip.label}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Compact Filters Bar - Below weather, stays sticky */}
          {activities && !loading.isLoading && (
            <div className="filters-bar-integrated">
              <div className="filters-inline-compact" style={{ width: '100%', justifyContent: 'center' }}>
                <select 
                  className="filter-select-mini" 
                  value={fCat} 
                  onChange={e => setFCat(e.target.value)}
                >
                  <option value="">Category</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                
                <select 
                  className="filter-select-mini" 
                  value={fFree} 
                  onChange={e => setFFree(e.target.value)}
                >
                  <option value="">Cost</option>
                  <option value="true">Free</option>
                  <option value="false">Paid</option>
                </select>
                
                <select 
                  className="filter-select-mini" 
                  value={fWeather} 
                  onChange={e => setFWeather(e.target.value)}
                >
                  <option value="">Weather</option>
                  <option value="good">☀️ Outdoor</option>
                  <option value="ok">⛅ Flexible</option>
                  <option value="bad">🏠 Indoor</option>
                </select>
                
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="clear-btn-mini" title="Clear filters">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrollable Content Section - Holidays and Count scroll away naturally */}
      {!isDesktopSideBySide && (ctx || (activities && !loading.isLoading)) && (
        <div style={{ 
          background: 'linear-gradient(180deg, rgba(224, 242, 241, 0.3) 0%, rgba(255, 255, 255, 0.95) 50%, #FFFFFF 100%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(46, 139, 146, 0.1)',
          boxShadow: '0 2px 8px rgba(46, 139, 146, 0.05)'
        }}>
          {/* Holidays & Festivals - At the TOP */}
          {ctx && ((ctx.is_public_holiday && ctx.holidays && ctx.holidays.length > 0) || 
            (ctx.nearby_festivals && ctx.nearby_festivals.length > 0)) && (
            <div className="events-compact-section" style={{ padding: '8px 12px 6px 12px' }}>
              {ctx.is_public_holiday && ctx.holidays && ctx.holidays.length > 0 && (
                <div 
                  className="event-compact-item holiday-item"
                  onClick={() => ctx.holidays && ctx.holidays.length > 1 && setShowAllEvents(!showAllEvents)}
                  style={{ 
                    cursor: ctx.holidays && ctx.holidays.length > 1 ? 'pointer' : 'default',
                    transition: 'all 0.2s'
                  }}
                >
                  <PartyPopper className="w-4 h-4" />
                  <span>{ctx.holidays[0].localName || ctx.holidays[0].name}</span>
                  {ctx.holidays.length > 1 && (
                    <span className="event-count" style={{
                      background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)',
                      color: 'white'
                    }}>
                      +{ctx.holidays.length - 1}
                    </span>
                  )}
                </div>
              )}
              
              {/* Expanded holidays list */}
              <AnimatePresence>
                {showAllEvents && ctx.holidays && ctx.holidays.length > 1 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ 
                      marginTop: '8px',
                      paddingLeft: '28px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      overflow: 'hidden'
                    }}
                  >
                    {ctx.holidays.slice(1).map((holiday, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                          fontSize: '12px',
                          color: '#6B7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span style={{ fontSize: '10px' }}>•</span>
                        <span>{holiday.localName || holiday.name}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              
              {ctx.nearby_festivals && ctx.nearby_festivals.length > 0 && (
                <div className="event-compact-item festival-item">
                  <Music className="w-4 h-4" />
                  <span>{ctx.nearby_festivals.length} Festival{ctx.nearby_festivals.length > 1 ? 's' : ''} nearby</span>
                </div>
              )}
            </div>
          )}

          {/* Activity Count Message - Below holidays */}
          {activities && !loading.isLoading && (
            <div style={{
              padding: '8px 12px 12px 12px',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1E2A32',
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(46, 139, 146, 0.08)'
              }}>
                <span style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#2E8B92',
                  fontFamily: 'Baloo 2, sans-serif'
                }}>{filtered.length}</span>
                <span>{randomMessage}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className={`results-main ${isDesktopSideBySide ? 'desktop-main' : ''}`}>

        {/* Activities Grid */}
        {activities && !loading.isLoading && (
          <div className="activities-grid">
            {filtered.map((activity, idx) => (
              <div key={idx} data-card-index={idx}>
                <ActivityCard
                  activity={activity}
                  index={idx}
                  isExpanded={expandedCards.has(idx)}
                  onToggleExpand={() => toggleCard(idx)}
                  onExclude={() => handleExclude(activity)}
                  context={ctx}
                  displayIndex={idx + 1}
                  isFlipped={flippedCards.has(idx)}
                  onToggleFlip={() => toggleFlip(idx)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {filtered.length === 0 && activities && activities.length > 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p className="empty-text">No activities match your filters</p>
            <button onClick={clearFilters} className="empty-action">
              Clear all filters
            </button>
          </div>
        )}

        {/* Web Sources */}
        {webSources && webSources.length > 0 && !loading.isLoading && (
          <div className="web-sources-section">
            <div className="web-sources-header">
              <ExternalLink className="w-5 h-5" />
              <h2>Web Sources</h2>
              <span className="sources-badge">{webSources.length}</span>
            </div>
            <div className="web-sources-grid">
              {webSources.map((source, idx) => (
                <a 
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="web-source-card"
                >
                  <div className="source-icon">
                    {source.source.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="source-content">
                    <div className="source-title">{source.title}</div>
                    <div className="source-name">{source.source}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </a>
              ))}
            </div>
          </div>
        )}
      </main>

    </div>
  );
}

