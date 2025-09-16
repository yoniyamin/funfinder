import React, { useState } from 'react';

export interface CacheSimilarityFactor {
  score: number;
  weight: number;
  distance?: number;
}

export interface CacheInfo {
  isCached: boolean;
  cacheType: 'exact' | 'similar';
  similarity: number;
  similarityBreakdown?: Record<string, CacheSimilarityFactor>;
  originalSearch: {
    location: string;
    date: string;
    searchKey: string;
  };
  cachedModel?: string;
}

export interface CacheIndicatorProps {
  cacheInfo?: CacheInfo;
  onRefreshSearch?: () => void;
  currentSearch?: { location: string; date: string };
}

export default function CacheIndicator({ cacheInfo, onRefreshSearch, currentSearch }: CacheIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{vertical: 'top' | 'bottom', horizontal: 'left' | 'center' | 'right' | 'mobile-left' | 'mobile-right', leftOffset?: number}>({vertical: 'top', horizontal: 'center'});
  const [showFactors, setShowFactors] = useState(false);

  if (!cacheInfo?.isCached) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.95) return 'text-green-600';
    if (similarity >= 0.90) return 'text-blue-600';
    return 'text-orange-600';
  };

  const getIconColor = (cacheType: string, similarity: number) => {
    if (cacheType === 'exact') return 'text-green-500';
    if (similarity >= 0.90) return 'text-blue-500';
    return 'text-orange-500';
  };

  const getFactorIcon = (factor: string) => {
    switch (factor) {
      case 'location': return '📍';
      case 'weather': return '🌤️';
      case 'temporal': return '📅';
      case 'demographic': return '👥';
      case 'instructions': return '📝';
      default: return '🔹';
    }
  };

  const getFactorLabel = (factor: string) => {
    switch (factor) {
      case 'location': return 'Location';
      case 'weather': return 'Weather';
      case 'temporal': return 'Date/Time';
      case 'demographic': return 'Age/Duration';
      case 'instructions': return 'Special Instructions';
      default: return factor;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.95) return 'text-green-600';
    if (score >= 0.85) return 'text-blue-600';
    if (score >= 0.70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const calculateTooltipPosition = (rect: DOMRect) => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const tooltipHeight = 240;
    const tooltipWidth = 360; // Updated to match actual tooltip width
    const margin = 16; // 1rem margin from viewport edges

    // Determine vertical position
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    const vertical = (spaceAbove >= tooltipHeight + 10) ? 'top' : 'bottom';
    
    // Mobile-specific positioning (narrow screens)
    if (viewportWidth <= 480) {
      // On mobile, use the same right positioning logic that works on desktop
      const elementCenter = rect.left + rect.width / 2;
      const tooltipHalfWidth = tooltipWidth / 2;
      
      // Determine if we should position right (near right edge) or left
      if (elementCenter + tooltipHalfWidth > viewportWidth - margin) {
        // Position on the right using the proven -235px offset
        return { 
          vertical, 
          horizontal: 'mobile-right',
          leftOffset: -235
        };
      } else {
        // Position on the left with margin
        return { 
          vertical, 
          horizontal: 'mobile-left',
          leftOffset: margin
        };
      }
    }
    
    // Desktop positioning logic
    const elementCenter = rect.left + rect.width / 2;
    const tooltipHalfWidth = tooltipWidth / 2;

    let horizontal: 'left' | 'center' | 'right' = 'center';
    let offset = 0;

    // Check if centered tooltip would exceed viewport
    if (elementCenter - tooltipHalfWidth < margin) {
      horizontal = 'left';
      offset = Math.max(margin - rect.left, 0);
    } else if (elementCenter + tooltipHalfWidth > viewportWidth - margin) {
      horizontal = 'right';
      const rightSpace = viewportWidth - rect.right;
      offset = Math.max(margin - rightSpace, 0);
    }

    
    // Additional check for right positioning - ensure tooltip fits when right-aligned
    if (horizontal === 'right') {
      const rightEdgePosition = rect.right;
      // Check if right-aligned tooltip would extend beyond left edge of viewport
      const leftEdgeWhenRightAligned = rightEdgePosition - tooltipWidth;
      if (leftEdgeWhenRightAligned < margin) {
        // If right-aligned tooltip would exceed left edge, try center first
        if (elementCenter - tooltipHalfWidth >= margin && elementCenter + tooltipHalfWidth <= viewportWidth - margin) {
          horizontal = 'center';
        } else {
          // If center doesn't work either, force left alignment
          horizontal = 'left';
        }
      }
    }
    
    return { vertical, horizontal };
  };

  const handleTooltipToggle = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition(calculateTooltipPosition(rect));
    setShowTooltip(!showTooltip);
  };

  const locationMatch = currentSearch && cacheInfo
    ? currentSearch.location.toLowerCase() === cacheInfo.originalSearch.location.toLowerCase()
    : true;
  const dateMatch = currentSearch && cacheInfo
    ? currentSearch.date === cacheInfo.originalSearch.date
    : true;
  const breakdownEntries = cacheInfo.similarityBreakdown
    ? Object.entries(cacheInfo.similarityBreakdown).filter(([, data]) => data.weight > 0 || data.score > 0)
    : [];

  return (
    <div className="relative inline-flex items-center gap-1">
      <div
        className={`inline-flex items-center cursor-pointer transition-colors hover:scale-110 ${getIconColor(cacheInfo.cacheType, cacheInfo.similarity)}`}
        onClick={handleTooltipToggle}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltipPosition(calculateTooltipPosition(rect));
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd" />
        </svg>
      </div>
      <span
        className={`text-xs font-medium cursor-pointer ${getSimilarityColor(cacheInfo.similarity)}`}
        onClick={() => setShowFactors(!showFactors)}
      >
        {(cacheInfo.similarity * 100).toFixed(1)}%
      </span>

      {showTooltip && (
        <div
          className={`absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-sm ${
            tooltipPosition.vertical === 'top'
              ? 'bottom-full mb-2'
              : 'top-full mt-2'

          } ${
            tooltipPosition.horizontal === 'left' 
              ? 'left-0' 
              : tooltipPosition.horizontal === 'right'
              ? ''  // Don't use right-0, we'll handle this with style
              : tooltipPosition.horizontal === 'mobile-left' || tooltipPosition.horizontal === 'mobile-right'
              ? ''  // Mobile positioning handled with style
              : 'left-1/2 transform -translate-x-1/2'
          }`}
          style={{
            width: '360px',
            maxWidth: 'calc(100vw - 2rem)',
            ...(tooltipPosition.horizontal === 'center' && {
              left: '50%',
              transform: 'translateX(-50%)',
            }),
            ...(tooltipPosition.horizontal === 'right' && {
              left: '-235px',  // Use the exact offset you found works
            }),
            ...((tooltipPosition.horizontal === 'mobile-left' || tooltipPosition.horizontal === 'mobile-right') && {
              left: `${tooltipPosition.leftOffset}px`,
            }),
          }}
        >
          <div className={`absolute ${
            tooltipPosition.horizontal === 'left'
              ? 'left-4'
              : tooltipPosition.horizontal === 'right'
              ? 'right-4'
              : tooltipPosition.horizontal === 'mobile-right'
              ? 'right-4'  // For mobile right, position arrow near right side
              : tooltipPosition.horizontal === 'mobile-left'
              ? 'left-4'   // For mobile left, position arrow near left side
              : 'left-1/2 transform -translate-x-1/2'
          } ${
            tooltipPosition.vertical === 'top'
              ? 'top-full -mt-1'
              : 'bottom-full -mb-1'
          }`}>
            <div className={`border-4 border-transparent ${
              tooltipPosition.vertical === 'top'
                ? 'border-t-white'
                : 'border-b-white'
            }`}></div>
          </div>
          
          <div className="space-y-2">
            <div className="font-semibold text-gray-800 border-b border-gray-200 pb-1">
              {cacheInfo.cacheType === 'exact' ? '⚡ Cached Results' : '✨ Similar Results'}
            </div>
            
            <div className="text-gray-600">
              <div className="flex justify-between">
                <span className="font-medium">Match Type:</span>
                <span className={`capitalize font-medium ${cacheInfo.cacheType === 'exact' ? 'text-green-600' : 'text-blue-600'}`}>
                  {cacheInfo.cacheType}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Similarity:</span>
                <span className={`font-medium ${getSimilarityColor(cacheInfo.similarity)}`}>
                  {(cacheInfo.similarity * 100).toFixed(1)}%
                </span>
              </div>

              {cacheInfo.cachedModel && (
                <div className="flex justify-between">
                  <span className="font-medium">AI Model:</span>
                  <span className="font-medium text-gray-800 text-xs">{cacheInfo.cachedModel}</span>
                </div>
              )}
            </div>

            {cacheInfo.cacheType === 'similar' && (
              <div className="bg-blue-50 rounded p-2 mt-2">
                <div className="text-xs text-blue-800 font-medium mb-1">Original Search:</div>
                <div className="text-xs text-blue-700">
                  <div>📍 {cacheInfo.originalSearch.location}</div>
                  <div>📅 {formatDate(cacheInfo.originalSearch.date)}</div>
                </div>
              </div>
            )}

            {/* Similarity Breakdown for similar matches */}
            {cacheInfo.cacheType === 'similar' && cacheInfo.similarityBreakdown && (
              <div className="bg-gray-50 rounded p-2 mt-2">
                <div className="text-xs text-gray-800 font-medium mb-2">Similarity Breakdown:</div>
                <div className="space-y-1">
                  {breakdownEntries.map(([factor, data]) => (
                    <div key={factor} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1">
                        <span>{getFactorIcon(factor)}</span>
                        <span className="text-gray-600">{getFactorLabel(factor)}:</span>
                        {factor === 'location' && data.distance !== undefined && (
                          <span className="text-gray-500">({data.distance.toFixed(1)}km)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`font-medium ${getScoreColor(data.score)}`}>
                          {(data.score * 100).toFixed(0)}%
                        </span>
                        <span className="text-gray-400 text-xs">
                          (w:{Math.round(data.weight * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Factors reducing score */}
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Factors reducing score:</span>
                    {(() => {
                      const lowFactors = breakdownEntries
                        .filter(([_, data]) => data.score < 0.9)
                        .map(([factor, data]) => `${getFactorLabel(factor)} (${(data.score * 100).toFixed(0)}%)`);
                      return lowFactors.length > 0 ? ` ${lowFactors.join(', ')}` : ' None - high similarity!';
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              {cacheInfo.cacheType === 'exact'
                ? 'These results were cached from an identical search.'
                : 'These results were adapted from a similar search considering location, weather, timing, and special instructions.'}
            </div>

            {onRefreshSearch && cacheInfo.cacheType !== 'exact' && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTooltip(false);
                    onRefreshSearch();
                  }}
                  className="w-full px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Run Fresh Search
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showFactors && (
        <div className="absolute z-50 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs left-1/2 transform -translate-x-1/2">
          <div className="font-semibold text-gray-800 mb-1">Score Factors</div>
          <div className={locationMatch ? 'text-green-700' : 'text-orange-700'}>
            📍 Location {locationMatch ? 'match' : 'changed'}
          </div>
          <div className={dateMatch ? 'text-green-700' : 'text-orange-700'}>
            📅 Date {dateMatch ? 'match' : 'changed'}
          </div>
        </div>
      )}
    </div>
  );
}
