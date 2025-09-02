export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { 
    extend: {
      backgroundImage: {
        'gradient-hero': 'linear-gradient(45deg, #ff0080, #ff8c00, #40e0d0, #ee82ee, #7fff00, #1e90ff, #ff69b4, #ffd700)',
        'gradient-fun': 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57)',
        'gradient-playful': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-border': 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57, #ff8a80)',
      },
      animation: {
        'gradient-x': 'gradient-x 3s ease infinite',
        'gradient-xy': 'gradient-xy 6s ease infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          },
        },
        'gradient-xy': {
          '0%, 100%': {
            'background-size': '400% 400%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '400% 400%',
            'background-position': 'right center'
          },
        },
      }
    } 
  },
  plugins: [],
};