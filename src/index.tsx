import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';

// Temporarily disable StrictMode to prevent development-mode search cancellation issues
// StrictMode causes components to mount/unmount/remount which cancels fetch requests
ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);
