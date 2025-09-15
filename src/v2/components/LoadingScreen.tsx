import React from 'react';
import { getImageUrl } from '../../config/assets';

export default function LoadingScreen() {
  return (
    <div className="glass-search-page">
      <div className="glass-bg-container">
        <img
          src={getImageUrl('BGPC')}
          alt="Background"
          className="glass-bg-image glass-bg-image-desktop"
        />
        <img
          src={getImageUrl('BG7')}
          alt="Background"
          className="glass-bg-image glass-bg-image-mobile"
        />
        <div className="glass-bg-overlay" />
      </div>
      

      {/* Loading Animation */}
      <div className="loading-animation-container">
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
