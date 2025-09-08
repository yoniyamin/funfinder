import React, { useState } from 'react';
import type { AppPage } from '../App';

interface NavButton {
  id: string;
  icon: React.ReactElement | null;
  label: string;
  color: string;
  action: () => void;
  disabled: boolean;
  isPrimary?: boolean;
  isSecondary?: boolean;
  compact?: boolean;
}

interface BottomNavBarProps {
  currentPage: AppPage;
  setCurrentPage: (page: AppPage) => void;
  loading: {
    isLoading: boolean;
    progress: number;
    status: string;
  };
  hasResults: boolean;
  onSettingsOpen: () => void;
  exclusionList: {[location: string]: string[]};
  removeFromExclusionList: (location: string, attraction: string) => Promise<boolean>;
  onSearch?: () => void; // Add search handler
  setLoading?: (loading: any) => void; // Add cancel functionality
  searchParams?: {
    location: string;
    date: string;
    duration: number | '';
    ages: number[];
  };
}

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  if (progress === 0) return null;
  
  return (
    <div className="w-full px-4 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white font-medium truncate pr-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          {status}
        </span>
        <span className="text-xs text-white font-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

export default function BottomNavBar({
  currentPage,
  setCurrentPage,
  loading,
  hasResults,
  onSettingsOpen,
  exclusionList,
  removeFromExclusionList,
  onSearch,
  setLoading,
  searchParams
}: BottomNavBarProps) {
  const [showExclusionManager, setShowExclusionManager] = useState(false);

  const canNavigateToResults = hasResults && !loading.isLoading;

  // Check if search form is ready
  const canSearch = searchParams && 
    searchParams.location.trim() && 
    searchParams.date && 
    searchParams.duration !== '' &&
    typeof searchParams.duration === 'number' &&
    searchParams.duration > 0 &&
    searchParams.ages.length > 0;

  // Button configuration for different states
  const getButtons = (): NavButton[] => {
    if (currentPage === 'search') {
      return [
        {
          id: 'exclusions',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          ),
          label: 'Exclusions',
          color: 'text-white',
          action: () => setShowExclusionManager(true),
          disabled: false,
          isSecondary: true
        },
        {
          id: 'search',
          icon: loading.isLoading ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          ) : null,
          label: loading.isLoading ? 'Cancel' : 'Search',
          color: 'text-white',
          action: loading.isLoading 
            ? () => setLoading && setLoading({ isLoading: false, progress: 0, status: '' })
            : () => canSearch && onSearch && onSearch(),
          disabled: loading.isLoading ? false : !canSearch,
          isPrimary: true
        },
        {
          id: 'settings',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          ),
          label: 'Settings',
          color: 'text-white',
          action: onSettingsOpen,
          disabled: false,
          isSecondary: true
        }
      ];
    } else {
      // Results page - fit all buttons in one row
      return [
        {
          id: 'search',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          ),
          label: 'Search',
          color: 'text-indigo-600',
          action: () => setCurrentPage('search'),
          disabled: false,
          compact: true
        },
        {
          id: 'exclusions',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          ),
          label: 'Exclude',
          color: 'text-red-600',
          action: () => setShowExclusionManager(true),
          disabled: false,
          compact: true
        },
        {
          id: 'results',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          ),
          label: 'Results',
          color: 'text-green-600',
          action: () => {},
          disabled: true, // Already on results
          compact: true
        },
        {
          id: 'settings',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          ),
          label: 'Settings',
          color: 'text-blue-600',
          action: onSettingsOpen,
          disabled: false,
          compact: true
        }
      ];
    }
  };

  const buttons = getButtons();
  const isCompact = currentPage === 'results';

  return (
    <>
      {/* Bottom Navigation Bar */}
      <div className="mobile-dock">
        {/* Progress Bar - Above buttons in its own row */}
        {loading.isLoading && (
          <ProgressBar progress={loading.progress} status={loading.status} />
        )}
        
        {/* Button Row */}
        <div className="flex justify-center items-center gap-3 py-3 px-2">
            {buttons.map((button) => {
            if (button.isPrimary === true) {
              // Primary search button with glassmorphism gradient
              return (
                <button
                  key={button.id}
                  onClick={button.action}
                  disabled={button.disabled}
                  className={`glass-cta flex-1 ${
                    button.disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-center justify-center w-full h-full">
                    {button.icon || (
                      <span className="font-bold text-white text-2xl">{button.label}</span>
                    )}
                  </div>
                </button>
              );
            } else {
              // Secondary buttons
              return (
                <button
                  key={button.id}
                  onClick={button.action}
                  disabled={button.disabled}
                  className={`dock-btn flex flex-col items-center justify-center ${
                    isCompact ? 'py-1 px-2' : 'py-2 px-4'
                  } relative group transition-all duration-200 ${
                    button.disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className={`mb-1 ${button.color} ${isCompact ? 'text-sm' : ''}`}>
                    {button.icon}
                  </div>
                  
                  {/* Label */}
                  <span className={`${button.color} font-medium ${
                    isCompact ? 'text-xs' : 'text-xs'
                  }`}>
                    {button.label}
                  </span>
                  
                  {/* Active indicator for current page */}
                  {((button.id === 'search' && currentPage === 'search') || 
                    (button.id === 'results' && currentPage === 'results')) && (
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"></div>
                  )}
                </button>
              );
            }
          })}
          </div>
        </div>

      {/* Exclusion Manager Modal */}
      {showExclusionManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Manage Excluded Activities</h2>
                <button
                  onClick={() => setShowExclusionManager(false)}
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
              {Object.keys(exclusionList).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-4">🎯</span>
                  <p>No exclusions yet!</p>
                  <p className="text-sm">Use the "Don't suggest this again" button on activities to add exclusions.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(exclusionList).map(([location, attractions]) => (
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

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowExclusionManager(false)}
                  className="btn btn-primary"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
