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
  onSearch?: () => void;
  setLoading?: (loading: any) => void;
  onCancelSearch?: () => void;
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
  onCancelSearch,
  searchParams
}: BottomNavBarProps) {
  const canNavigateToResults = hasResults && !loading.isLoading;

  // Check if search form is ready
  const canSearch = searchParams && 
    searchParams.location.trim() && 
    searchParams.date && 
    searchParams.duration !== '' &&
    typeof searchParams.duration === 'number' &&
    searchParams.duration > 0 &&
    searchParams.ages.length > 0;

  // Button configuration for search page only - Only Search button
  const getButtons = (): NavButton[] => {
    return [
      {
        id: 'search',
        icon: loading.isLoading ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2"></circle>
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"></path>
          </svg>
        ),
        label: loading.isLoading ? 'Cancel' : 'Search Activities',
        color: 'text-white',
        action: loading.isLoading 
          ? () => onCancelSearch && onCancelSearch()
          : () => canSearch && onSearch && onSearch(),
        disabled: loading.isLoading ? false : !canSearch,
        isPrimary: true
      }
    ];
  };

  const buttons = getButtons();

  return (
    <>
      {/* Bottom Navigation Bar */}
      <div className="mobile-dock">
        {/* Progress Bar - Above buttons in its own row */}
        {loading.isLoading && (
          <ProgressBar progress={loading.progress} status={loading.status} />
        )}
        
        {/* Button Row - Full Width Search Button */}
        <div className="flex justify-center items-center py-3 px-4">
            {buttons.map((button) => {
            if (button.isPrimary === true) {
              // Primary search button - full width and larger
              return (
                <button
                  key={button.id}
                  onClick={button.action}
                  disabled={button.disabled}
                  className={`glass-cta-enhanced w-full ${
                    button.disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    {button.icon}
                    <span className="font-bold text-white text-xl">{button.label}</span>
                  </div>
                </button>
              );
            }
            return null;
          })}
          </div>
        </div>
    </>
  );
}
