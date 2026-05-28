import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

// tekivex-ui CSS must come BEFORE our own styles so our overrides win
// where they exist, and the library's base styles fill in the rest.
import 'tekivex-ui/styles';
import './styles.css';

import { TkxThemeBridge } from './theme/TkxThemeBridge.tsx';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TkxThemeBridge>
      <App />
    </TkxThemeBridge>
  </React.StrictMode>,
);
