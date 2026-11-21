/**
 * Astral Command — Entry Point (Vanilla ES Modules)
 */

import { Game } from './core/Game.js';

const game = new Game();

// Expose controlled debug handle for inspection without polluting globals
if (typeof window !== 'undefined') {
  window.__ASTRAL_COMMAND__ = game;
  window.addEventListener('error', (event) => {
    console.error('[Astral Command] Unhandled error:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Astral Command] Unhandled promise rejection:', event.reason);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => game.init());
} else {
  game.init();
}
