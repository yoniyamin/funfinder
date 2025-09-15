// Asset configuration for Fun Finder
// This allows switching between local assets (development) and GitHub Pages (production)

const isDevelopment = import.meta.env.DEV;
const GITHUB_PAGES_BASE = import.meta.env.VITE_ASSET_BASE_URL || 'https://yourusername.github.io/yourrepo/assets';

export const getAssetUrl = (filename: string): string => {
  if (isDevelopment) {
    // Use local assets during development
    return `/${filename}`;
  } else {
    // Use GitHub Pages assets in production
    return `${GITHUB_PAGES_BASE}/${filename}`;
  }
};

// Specific image exports for easy importing
export const IMAGES = {
  BG5: 'bg5.jpeg',
  BG6: 'bg6.jpeg', 
  BG7: 'bg7.jpeg',
  BGPC: 'bgpc.jpeg'
} as const;

// Helper function to get image URLs
export const getImageUrl = (image: keyof typeof IMAGES): string => {
  return getAssetUrl(IMAGES[image]);
};
