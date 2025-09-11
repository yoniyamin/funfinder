import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles.css';
import App from './App';
import LoadingScreen from './components/LoadingScreen';

// Temporarily disable StrictMode to prevent development-mode search cancellation issues
// StrictMode causes components to mount/unmount/remount which cancels fetch requests

console.log('🚀 V2 App starting...');
console.log('🔍 Root element:', document.getElementById('root'));

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('❌ Root element not found!');
    throw new Error('Root element not found');
  }

  console.log('✅ Root element found, creating React root...');
  const root = ReactDOM.createRoot(rootElement);

  console.log('✅ React root created, rendering loading screen...');

  // Render a UI-matched loading screen first
  root.render(<LoadingScreen />);

  // Then after a delay, try to load the main app
  setTimeout(() => {
    console.log('🔄 Switching to main App...');
    try {
      root.render(
        // <React.StrictMode>
          <App />
        // </React.StrictMode>
      );
      console.log('✅ Main App rendered successfully!');
    } catch (appError) {
      console.error('❌ Failed to render main App:', appError);
      root.render(
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace' }}>
          <h1>❌ Main App Failed</h1>
          <p>React works, but main App failed to load</p>
          <p>Error: {appError.message}</p>
        </div>
      );
    }
  }, 1000);

  console.log('✅ V2 App render complete!');
} catch (error) {
  console.error('❌ Failed to render V2 App:', error);
  // Fallback: show error message
  document.body.innerHTML = `
    <div style="padding: 20px; color: red; font-family: monospace; max-width: 800px; margin: 0 auto;">
      <h1>🚨 App Failed to Load</h1>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><strong>Stack:</strong> ${error.stack || 'No stack trace available'}</p>
      <p>Check the browser console for more details.</p>
      <hr>
      <h2>🔧 Troubleshooting</h2>
      <ul>
        <li>Refresh the page</li>
        <li>Check browser console for JavaScript errors</li>
        <li>Ensure JavaScript is enabled</li>
        <li>Try a different browser</li>
      </ul>
      <p><small>If this error persists, please contact support.</small></p>
    </div>
  `;
}

// Also add a global error handler
window.addEventListener('error', (event) => {
  console.error('🚨 Global error caught:', event.error);
  console.error('🚨 Error details:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
});
