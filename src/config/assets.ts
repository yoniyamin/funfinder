// Asset configuration for Fun Finder
// This allows switching between local assets and GitHub Pages deployment

const isDevelopment = import.meta.env.DEV;
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const GITHUB_PAGES_BASE = import.meta.env.VITE_ASSET_BASE_URL || 'https://yoniyamin.github.io/funfinder/assets';

export const getAssetUrl = (filename: string): string => {
  // Use local assets for development OR when running locally (even production builds)
  if (isDevelopment || isLocalhost) {
    return `/${filename}`;
  } else {
    // Use GitHub Pages assets only when actually deployed to GitHub Pages
    return `${GITHUB_PAGES_BASE}/${filename}`;
  }
};

// Specific image exports for easy importing
export const IMAGES = {
  BG5: 'bg5.jpeg',
  BG5_FS: 'bg5_fs.jpeg',
  BG6: 'bg6.jpeg', 
  BG7: 'bg7.jpeg',
  BGPC: 'bgpc.jpeg',
  FUNFINDER: 'funfinder2-1600x1000.png'
} as const;

// Helper function to get image URLs
export const getImageUrl = (image: keyof typeof IMAGES): string => {
  return getAssetUrl(IMAGES[image]);
};
