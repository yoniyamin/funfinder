import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="glass-search-page">
      <div className="glass-bg-container">
        <img
          src="/bgpc.jpeg"
          alt="Background"
          className="glass-bg-image glass-bg-image-desktop"
        />
        <img
          src="/bg5.jpeg"
          alt="Background"
          className="glass-bg-image glass-bg-image-mobile"
        />
        <div className="glass-bg-overlay" />
      </div>
      <div className="glass-content">
        <div className="loading-animation-container">
          <div className="loading-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="loading-progress-center">Loading...</div>
          </div>
        </div>
      </div>
    </div>
  );
}
