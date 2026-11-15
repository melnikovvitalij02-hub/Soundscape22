import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PlayerProvider } from '@/context/PlayerContext';
import { LocaleProvider } from '@/context/LocaleContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </LocaleProvider>
  </StrictMode>
);
