import React, { useState } from 'react';

interface CacheInfo {
  isCached: boolean;
  cacheType: 'exact' | 'similar';
  similarity: number;
  originalSearch: {
    location: string;
    date: string;
    searchKey: string;
  };
}

interface CacheIndicatorProps {
  cacheInfo?: CacheInfo;
  onRefreshSearch?: () => void;
  currentSearch?: { location: string; date: string };
}

export default function CacheIndicator({ cacheInfo, onRefreshSearch, currentSearch }: CacheIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{vertical: 'top' | 'bottom', horizontal: 'left' | 'center' | 'right'}>({vertical: 'top', horizontal: 'center'});
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

  const calculateTooltipPosition = (rect: DOMRect) => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const tooltipHeight = 240;
    const tooltipWidth = 320;
    const margin = 16; // 1rem margin from viewport edges
    
    // Determine vertical position
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    const vertical = (spaceAbove >= tooltipHeight + 10) ? 'top' : 'bottom';
    
    // Determine horizontal position
    const elementCenter = rect.left + rect.width / 2;
    const tooltipHalfWidth = tooltipWidth / 2;
    
    let horizontal: 'left' | 'center' | 'right' = 'center';
    
    // Check if centered tooltip would exceed viewport
    if (elementCenter - tooltipHalfWidth < margin) {
      horizontal = 'left';
    } else if (elementCenter + tooltipHalfWidth > viewportWidth - margin) {
      horizontal = 'right';
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
          className={`absolute z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-sm ${
            tooltipPosition.vertical === 'top'
              ? 'bottom-full mb-2'
              : 'top-full mt-2'
          } ${
            tooltipPosition.horizontal === 'left' 
              ? 'left-0' 
              : tooltipPosition.horizontal === 'right'
              ? 'right-0'
              : 'left-1/2 transform -translate-x-1/2'
          }`}
          style={{
            maxWidth: 'calc(100vw - 2rem)',
            ...(tooltipPosition.horizontal === 'center' && {
              left: '50%',
              transform: 'translateX(-50%)',
            }),
          }}
        >
          <div className={`absolute ${
            tooltipPosition.horizontal === 'left' 
              ? 'left-4' 
              : tooltipPosition.horizontal === 'right'
              ? 'right-4'
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

            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              {cacheInfo.cacheType === 'exact' 
                ? 'These results were cached from an identical search.' 
                : 'These results were adapted from a similar search based on location, weather, and timing patterns.'}
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
