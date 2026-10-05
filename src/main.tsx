import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import { LanguageProvider } from './LanguageContext.tsx';
import { dashboardQueryClient, restoreDashboardQueryCache, setupDashboardQueryPersistence } from './query/client';
import './index.css';

restoreDashboardQueryCache(dashboardQueryClient);
setupDashboardQueryPersistence(dashboardQueryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={dashboardQueryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
