export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { 
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2E8B92',
          hover: '#25767C',
        },
        secondary: {
          DEFAULT: '#F2A15F',
        },
        accent: {
          DEFAULT: '#F26B8A',
        },
        success: {
          DEFAULT: '#56B88F',
        },
        warning: {
          DEFAULT: '#F2C14E',
        },
        'sunny-mint': {
          bg: '#FAFBFC',
          surface: '#FFFFFF',
          text: {
            primary: '#1E2A32',
            secondary: '#5B6B75',
          },
          divider: '#E6EEF2',
        }
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(45deg, #2E8B92, #56B88F, #F2A15F, #F26B8A)',
        'gradient-fun': 'linear-gradient(45deg, #56B88F, #2E8B92, #F2A15F)',
        'gradient-playful': 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)',
        'gradient-border': 'linear-gradient(45deg, #2E8B92, #56B88F, #F2A15F, #F26B8A)',
        'gradient-cta': 'linear-gradient(90deg, #2E8B92, #56B88F)',
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