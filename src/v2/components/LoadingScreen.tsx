import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../config/assets';

// Hook to detect desktop layout
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

export default function LoadingScreen() {
  const isDesktop = useDesktopLayout();
  
  // Detect if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
    || (window.navigator as any).standalone 
    || document.referrer.includes('android-app://');

  // Simple blue background in standalone mode, full image in browser
  if (isStandalone) {
    return (
      <div className="simple-loading-screen">
        <div className="loading-screen-animation">
          <div className="loading-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="loading-progress-center">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Regular loading screen with image for browser mode
  return (
    <div className="glass-search-page loading-screen-no-padding">
      <div className="glass-bg-container">
        <img
          src={getImageUrl(isDesktop ? 'FUNFINDER' : 'BGPC')}
          alt="Background"
          className="glass-bg-image glass-bg-image-desktop"
        />
        <img
          src={getImageUrl('BG7')}
          alt="Background"
          className="glass-bg-image glass-bg-image-mobile"
        />
      </div>
      
      {/* Loading Animation */}
      <div className="loading-screen-animation">
        <div className="loading-spinner">
          <div className="spinner-ring" />
          <div className="spinner-ring" />
          <div className="spinner-ring" />
          <div className="loading-progress-center">Loading...</div>
        </div>
      </div>
    </div>
  );
}
