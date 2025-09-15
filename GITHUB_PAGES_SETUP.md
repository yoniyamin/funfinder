# GitHub Pages Static Assets Setup

This setup allows your images to be served from GitHub Pages instead of Koyeb, eliminating cold start delays for static assets.

## 🚀 Quick Setup

### 1. Enable GitHub Pages
1. Go to your GitHub repository settings
2. Scroll to "Pages" section
3. Set Source to "Deploy from a branch"
4. Select branch: `main`
5. Select folder: `/docs`
6. Click "Save"

### 2. Set Environment Variable
Create a `.env` file in your project root:
```bash
VITE_ASSET_BASE_URL=https://yourusername.github.io/yourreponame/assets
```

Replace `yourusername` and `yourreponame` with your actual GitHub username and repository name.

### 3. Deploy
Push your changes to the main branch. The GitHub Action will automatically:
- Copy images from `/public` to `/docs/assets`
- Deploy to GitHub Pages
- Your assets will be available at: `https://yourusername.github.io/yourreponame/assets/`

## 📁 File Structure
```
├── .github/workflows/
│   └── deploy-assets.yml     # Auto-deploys assets to GitHub Pages
├── docs/
│   ├── index.html           # Asset gallery page
│   └── assets/              # Your images (auto-generated)
│       ├── bg5.jpeg
│       ├── bg6.jpeg
│       ├── bg7.jpeg
│       └── bgpc.jpeg
├── src/config/
│   └── assets.ts            # Asset URL management
└── public/                  # Source images
```

## 🔄 How It Works

**Development**: Uses local images from `/public` folder
**Production**: Uses images from GitHub Pages

The `assets.ts` configuration automatically switches between local and GitHub Pages URLs based on the environment.

## 🎯 Benefits

- ✅ **No cold start delays** for images
- ✅ **Automatic deployment** via GitHub Actions  
- ✅ **CDN-like performance** from GitHub Pages
- ✅ **Fallback to local** during development
- ✅ **Version control** for assets

## 🛠️ Adding New Images

1. Add image to `/public` folder
2. Push to main branch
3. GitHub Action automatically deploys it
4. Update `IMAGES` constant in `src/config/assets.ts` if needed

Your images will be blazing fast! 🚀
