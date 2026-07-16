import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { ExtensionUpdateProvider } from './providers/ExtensionUpdateProvider';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ExtensionUpdateProvider>
        <App />
      </ExtensionUpdateProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
