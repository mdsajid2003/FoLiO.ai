import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// #32 fix: use the single canonical ErrorBoundary — the previous inline class here
// had different behaviour (Reload only) and no route-change reset, meaning a broken
// page stayed broken after navigation. Using the shared component ensures consistent
// error UX throughout the app.
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
