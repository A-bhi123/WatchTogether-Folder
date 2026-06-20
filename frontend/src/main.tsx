import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#242424',
            color: '#e5e5e5',
            border: '1px solid #3d3d3d',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#E50914', secondary: '#141414' },
          },
          error: {
            iconTheme: { primary: '#ff4444', secondary: '#141414' },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
