/**
 * Game — Central bootstrap coordinator assembling core services, gameplay systems,
 * rendering layers, and UI screen controllers with clean unidirectional dependencies.
 */

import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { SaveManager } from './SaveManager.js';
import { ScreenManager } from './ScreenManager.js';
import { AudioManager } from './AudioManager.js';

import { loadGameData } from '../utils/DataLoader.js';
import { formatNumber } from '../utils/MathUtils.js';

import { AssetManager } from '../rendering/AssetManager.js';
import { AnimationManager } from '../rendering/AnimationManager.js';
import { ParticleSystem } from '../rendering/ParticleSystem.js';
import { BattleRenderer } from '../rendering/BattleRenderer.js';

import { HeroSystem } from '../systems/HeroSystem.js';
import { FormationSystem } from '../systems/FormationSystem.js';
import { CardSystem } from '../systems/CardSystem.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { MissionSystem } from '../systems/MissionSystem.js';

import { UnitManager } from '../battle/UnitManager.js';
import { TargetingSystem } from '../battle/TargetingSystem.js';
import { MovementSystem } from '../battle/MovementSystem.js';
import { CombatSystem } from '../battle/CombatSystem.js';
import { ProjectileSystem } from '../battle/ProjectileSystem.js';
import { SkillSystem } from '../battle/SkillSystem.js';
import { WaveManager } from '../battle/WaveManager.js';
import { BattleManager } from '../battle/BattleManager.js';

import { HomeScreen } from '../ui/HomeScreen.js';
import { MissionsScreen } from '../ui/MissionsScreen.js';
import { BattleScreen } from '../ui/BattleScreen.js';
import { HeroScreen } from '../ui/HeroScreen.js';
import { FormationScreen } from '../ui/FormationScreen.js';
import { SummonScreen } from '../ui/SummonScreen.js';
import { InventoryScreen } from '../ui/InventoryScreen.js';
import { SettingsScreen } from '../ui/SettingsScreen.js';

export class Game {
  constructor() {
    this.eventBus = new EventBus();
    this.saveManager = new SaveManager({ eventBus: this.eventBus });
    this.assetManager = new AssetManager({ eventBus: this.eventBus });
    this.dataRegistry = null;
    this.gameState = null;
    this.screenManager = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    const viewportEl = document.getElementById('screen-viewport');
    const navRootEl = document.getElementById('primary-nav');

    try {
      // 1. Load & validate JSON data configurations
      this.dataRegistry = await loadGameData();

      // 2. Load or recover versioned local save (with automatic v1 -> v2 migration)
      const saveResult = this.saveManager.load();
      this.gameState = new GameState(saveResult.data, this.eventBus);

      // 3. Audio & Rendering services
      this.audioManager = new AudioManager(this.gameState);
      this.animationManager = new AnimationManager();
      this.particleSystem = new ParticleSystem();
      this.battleRenderer = new BattleRenderer({
        assetManager: this.assetManager,
        animationManager: this.animationManager,
        particleSystem: this.particleSystem,
        gameState: this.gameState,
      });

      // 4. Gameplay systems
      this.economySystem = new EconomySystem({
        gameState: this.gameState,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.heroSystem = new HeroSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.formationSystem = new FormationSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        heroSystem: this.heroSystem,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.cardSystem = new CardSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.progressionSystem = new ProgressionSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        formationSystem: this.formationSystem,
        cardSystem: this.cardSystem,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.gachaSystem = new GachaSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        economySystem: this.economySystem,
        heroSystem: this.heroSystem,
        formationSystem: this.formationSystem,
        cardSystem: this.cardSystem,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });
      this.missionSystem = new MissionSystem({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        economySystem: this.economySystem,
        progressionSystem: this.progressionSystem,
        saveManager: this.saveManager,
        eventBus: this.eventBus,
      });

      // 5. Battle simulation subsystems
      this.unitManager = new UnitManager({
        dataRegistry: this.dataRegistry,
        eventBus: this.eventBus,
      });
      this.targetingSystem = new TargetingSystem({
        balance: this.dataRegistry.balance,
      });
      this.movementSystem = new MovementSystem({
        balance: this.dataRegistry.balance,
      });
      this.combatSystem = new CombatSystem({
        eventBus: this.eventBus,
        dataRegistry: this.dataRegistry,
      });
      this.projectileSystem = new ProjectileSystem({
        eventBus: this.eventBus,
      });
      this.skillSystem = new SkillSystem({
        gameState: this.gameState,
        heroSystem: this.heroSystem,
        eventBus: this.eventBus,
        dataRegistry: this.dataRegistry,
      });
      this.waveManager = new WaveManager({
        eventBus: this.eventBus,
        balance: this.dataRegistry.balance,
      });
      this.battleManager = new BattleManager({
        dataRegistry: this.dataRegistry,
        gameState: this.gameState,
        eventBus: this.eventBus,
        progressionSystem: this.progressionSystem,
        economySystem: this.economySystem,
        heroSystem: this.heroSystem,
        cardSystem: this.cardSystem,
        unitManager: this.unitManager,
        targetingSystem: this.targetingSystem,
        movementSystem: this.movementSystem,
        combatSystem: this.combatSystem,
        projectileSystem: this.projectileSystem,
        skillSystem: this.skillSystem,
        waveManager: this.waveManager,
        battleRenderer: this.battleRenderer,
        animationManager: this.animationManager,
        particleSystem: this.particleSystem,
        audioManager: this.audioManager,
      });

      // 6. ScreenManager & all seven screens
      this.screenManager = new ScreenManager({
        viewportEl,
        navRootEl,
        eventBus: this.eventBus,
      });

      const sharedContext = {
        eventBus: this.eventBus,
        gameState: this.gameState,
        saveManager: this.saveManager,
        screenManager: this.screenManager,
        assetManager: this.assetManager,
        audioManager: this.audioManager,
        dataRegistry: this.dataRegistry,
        heroSystem: this.heroSystem,
        formationSystem: this.formationSystem,
        cardSystem: this.cardSystem,
        economySystem: this.economySystem,
        progressionSystem: this.progressionSystem,
        gachaSystem: this.gachaSystem,
        missionSystem: this.missionSystem,
        battleManager: this.battleManager,
        notify: (message, level = 'info') => this.notify(message, level),
        confirmDialog: (opts) => this.confirmDialog(opts),
        openGuide: () => this.openGuide(),
      };

      this.screenManager.register('home', new HomeScreen(sharedContext));
      this.screenManager.register('missions', new MissionsScreen(sharedContext));
      this.screenManager.register('battle', new BattleScreen(sharedContext));
      this.screenManager.register('heroes', new HeroScreen(sharedContext));
      this.screenManager.register('formation', new FormationScreen(sharedContext));
      this.screenManager.register('summon', new SummonScreen(sharedContext));
      this.screenManager.register('inventory', new InventoryScreen(sharedContext));
      this.screenManager.register('settings', new SettingsScreen(sharedContext));

      this._prevHeaderResources = {
        credits: this.gameState.resources.credits,
        astrite: this.gameState.resources.astrite,
      };
      this._bindGlobalChrome();
      this._syncHeaderResources();
      this._syncMuteButton();
      this.eventBus.on('state:changed', () => {
        this._syncHeaderResources();
        this._syncMuteButton();
        this.audioManager?.syncVolumes?.();
      });
      this.eventBus.on('screen:changed', ({ to }) => {
        this.gameState.setUI({ activeScreen: to });
        document.getElementById('app')?.classList.toggle('is-battle-mode', to === 'battle');
        this.audioManager?.setBgmMode?.(to === 'battle' ? 'battle' : 'menu');
      });

      // Non-blocking background asset preload
      this.assetManager.preloadGroup();

      // Mount Home screen
      this.screenManager.navigate('home');

      if (saveResult.status === 'recovered') {
        this.notify('Recovered missing or corrupted save fields safely.', 'warn');
      }

      // Hidden developer inspection handle (no UI controls exposed to normal players)
      if (typeof window !== 'undefined') {
        window.__ASTRAL_DEV__ = {
          toggleDebug: () => this.battleManager.toggleDebugMode(),
          setDebug: (flag) => this.battleManager.setDebugMode(flag),
          battleManager: this.battleManager,
        };
      }

      this._initialized = true;
    } catch (error) {
      console.error('[Game] Initialization failed:', error);
      if (viewportEl) {
        viewportEl.innerHTML = `
          <div class="error-banner" role="alert">
            <strong>Initialization Error:</strong> ${error instanceof Error ? error.message : String(error)}
          </div>
        `;
      }
    }
  }

  _bindGlobalChrome() {
    const brandBtn = document.getElementById('brand-home-btn');
    brandBtn?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.screenManager.navigate('home');
    });

    const navRoot = document.getElementById('primary-nav');
    navRoot?.addEventListener('click', (event) => {
      const target = event.target.closest('[data-screen]');
      if (!target) return;
      const screenId = target.getAttribute('data-screen');
      if (screenId) {
        this.audioManager?.playClick();
        this.screenManager.navigate(screenId);
      }
    });

    const guideBtn = document.getElementById('hdr-guide-btn');
    guideBtn?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.openGuide();
    });

    const muteBtn = document.getElementById('hdr-mute-btn');
    muteBtn?.addEventListener('click', () => {
      if (!this.gameState) return;
      const nextMuted = !this.gameState.settings.muted;
      this.gameState.mutatePersistent('settings', (p) => {
        p.settings.muted = nextMuted;
      });
      this.saveManager?.save(this.gameState.toSerializableSave());
      this.audioManager?.syncVolumes?.();
      this._syncMuteButton();
      if (!nextMuted) {
        this.audioManager?.playClick();
      }
      this.notify(nextMuted ? 'Audio muted.' : 'Audio unmuted.');
    });
  }

  _syncMuteButton() {
    const muteBtn = document.getElementById('hdr-mute-btn');
    if (!muteBtn || !this.gameState) return;
    const isMuted = Boolean(this.gameState.settings?.muted);
    muteBtn.classList.toggle('is-muted', isMuted);
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    muteBtn.title = isMuted ? 'Unmute Game Audio' : 'Mute Game Audio';
  }

  _syncHeaderResources() {
    if (!this.gameState) return;
    const lv = document.getElementById('hdr-level');
    const cr = document.getElementById('hdr-credits');
    const as = document.getElementById('hdr-astrite');
    const curCredits = this.gameState.resources.credits;
    const curAstrite = this.gameState.resources.astrite;

    if (lv) lv.textContent = String(this.gameState.player.level);
    if (cr) {
      cr.textContent = formatNumber(curCredits);
      if (this._prevHeaderResources && curCredits > this._prevHeaderResources.credits) {
        this._flashResource(cr.parentElement);
      }
    }
    if (as) {
      as.textContent = formatNumber(curAstrite);
      if (this._prevHeaderResources && curAstrite > this._prevHeaderResources.astrite) {
        this._flashResource(as.parentElement);
      }
    }
    this._prevHeaderResources = { credits: curCredits, astrite: curAstrite };
  }

  _flashResource(el) {
    if (!el) return;
    el.classList.remove('is-gained');
    void el.offsetWidth;
    el.classList.add('is-gained');
    setTimeout(() => el.classList.remove('is-gained'), 600);
  }

  notify(message, level = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${level === 'warn' ? 'toast--warn' : level === 'error' ? 'toast--error' : level === 'success' ? 'toast--success' : ''}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Keep toast stack clean (max 4 visible)
    while (container.children.length > 4) {
      container.firstElementChild?.remove();
    }
    setTimeout(() => {
      toast.classList.add('is-exiting');
      setTimeout(() => toast.remove(), 220);
    }, 2900);
  }

  confirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm }) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.hidden = false;
    modalRoot.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" class="modal-dialog__title">${title}</h2>
        <p class="modal-dialog__message">${message}</p>
        <div class="btn-row modal-dialog__actions">
          <button type="button" id="modal-cancel" class="btn btn-secondary btn-sm">Cancel</button>
          <button type="button" id="modal-confirm" class="btn btn-danger btn-sm">${confirmLabel}</button>
        </div>
      </div>
    `;

    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') close();
    };

    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      modalRoot.hidden = true;
      modalRoot.innerHTML = '';
    };

    window.addEventListener('keydown', onKeyDown);
    modalRoot.querySelector('#modal-cancel')?.addEventListener('click', () => {
      this.audioManager?.playClick();
      close();
    });
    modalRoot.querySelector('#modal-confirm')?.addEventListener('click', () => {
      this.audioManager?.playClick();
      close();
      if (typeof onConfirm === 'function') onConfirm();
    });
    modalRoot.addEventListener(
      'click',
      (ev) => {
        if (ev.target === modalRoot) close();
      },
      { once: true },
    );
  }

  openGuide() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.hidden = false;
    modalRoot.innerHTML = `
      <div class="modal-dialog guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-modal-title">
        <div class="guide-modal__head">
          <div>
            <div class="section-kicker section-kicker--gold">Star Struck Field Reference</div>
            <h2 id="guide-modal-title" class="modal-dialog__title">Tactical Guide &amp; Controls</h2>
          </div>
          <button type="button" id="guide-close-x" class="btn btn-ghost btn-sm" aria-label="Close Tactical Guide">Close</button>
        </div>

        <div class="guide-steps">
          <div class="guide-step-card">
            <div class="guide-step-card__num">01</div>
            <h3 class="guide-step-card__title">Squad &amp; Battlefield Prep</h3>
            <p class="guide-step-card__body">
              Before waves start, place your 4 squad units anywhere inside the blue <strong>Ally Zone</strong>.
              Units advance automatically, engage enemies by class role (Defender, Cavalry, Archer, Cleric),
              and push toward the opposing stronghold.
            </p>
          </div>

          <div class="guide-step-card">
            <div class="guide-step-card__num">02</div>
            <h3 class="guide-step-card__title">6-Slot Adjacent Card Merging</h3>
            <p class="guide-step-card__body">
              Two side-by-side identical cards glow gold when ready to merge. Click the first card, then click
              its matching neighbor to fuse them into a stronger <strong>Lv.II</strong> or <strong>Lv.III</strong>
              instruction — boosting stats, skill damage, or support power.
            </p>
          </div>

          <div class="guide-step-card">
            <div class="guide-step-card__num">03</div>
            <h3 class="guide-step-card__title">Energy, Commanders &amp; Shortcuts</h3>
            <p class="guide-step-card__body">
              Commanders provide a permanent army passive and charge an off-field <strong>Ultimate</strong> from
              combat and card plays. Click the Ultimate button, click the glowing <strong>Commander Dais</strong>
              on the battlefield, or use shortcuts:
            </p>
            <div class="guide-keys-grid">
              <span><kbd>1</kbd>–<kbd>6</kbd> Select / Play / Merge Card</span>
              <span><kbd>Space</kbd> / <kbd>Q</kbd> Commander Ultimate</span>
              <span><kbd>Enter</kbd> Start Battle (Prep)</span>
              <span><kbd>P</kbd> Pause · <kbd>S</kbd> Speed 1x/2x · <kbd>Esc</kbd> Cancel</span>
            </div>
          </div>
        </div>

        <div class="btn-row modal-dialog__actions">
          <button type="button" id="guide-close-btn" class="btn btn-primary btn-sm">Got It</button>
        </div>
      </div>
    `;

    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') close();
    };

    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      modalRoot.hidden = true;
      modalRoot.innerHTML = '';
    };

    window.addEventListener('keydown', onKeyDown);
    modalRoot.querySelector('#guide-close-x')?.addEventListener('click', () => {
      this.audioManager?.playClick();
      close();
    });
    modalRoot.querySelector('#guide-close-btn')?.addEventListener('click', () => {
      this.audioManager?.playClick();
      close();
    });
    modalRoot.addEventListener(
      'click',
      (ev) => {
        if (ev.target === modalRoot) close();
      },
      { once: true },
    );
  }
}
