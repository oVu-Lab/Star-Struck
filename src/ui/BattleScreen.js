/**
 * BattleScreen (P4 Structural Redesign) — Full-viewport 100vw x 100vh Battle Theater
 * with edge-to-edge Isometric Canvas, slim translucent top HUD, unobtrusive top-center
 * Preparation strip, unified floating bottom Tactical Command Dock (Energy/Deck Core +
 * 6-Card Hand + Commander Ultimate Console), Portrait Cut-In, and 2-Column Results Modal.
 */

import { BATTLE_PHASES } from '../battle/BattleManager.js';
import { createTutorialStageConfig } from '../battle/TutorialBattleConfig.js';
import { CardUltimateFxController } from '../rendering/AstraGlitterEffects.js';
import { CardMergeVfxController } from '../rendering/CardMergeVfxController.js';
import { NonUnitCardPlayVfx } from '../rendering/NonUnitCardPlayVfx.js';
import { isNonUnitCard } from '../rendering/NonUnitCardVfxConfig.js';
import { formatNumber } from '../utils/MathUtils.js';

const COMMANDER_FX_THEMES = {
  astra: { isAstra: true, accentColor: '#ffe594', ringColor: '#cfe8ff' },
  kael: { isAstra: false, accentColor: '#3ec9a7', ringColor: '#88e7cf' },
  lyra: { isAstra: false, accentColor: '#4cd495', ringColor: '#9beec5' },
  seraphina: { isAstra: false, accentColor: '#b78bfa', ringColor: '#d9c0ff' },
  vanguard_zero: { isAstra: false, accentColor: '#ea8d48', ringColor: '#f7c494' },
};

const CATEGORY_LABELS = {
  unit: 'Unit',
  skill: 'Skill',
  tactic: 'Tactic',
  support: 'Support',
};

const HERO_THEME_CLASSES = [
  'theme-astra',
  'theme-kael',
  'theme-lyra',
  'theme-seraphina',
  'theme-vanguard_zero',
];

function formatTimer(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = String(Math.floor(s / 60)).padStart(2, '0');
  const secs = String(s % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export class BattleScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._resizeHandler = null;
    this._keyHandler = null;
    this._cutinTimer = null;
    this._rewardTimer = null;
    this._resultsRevealTimer = null;
    this._resultsShownSessionId = null;
    this._hoveredCardSlot = -1;
    this._lastCardRenderMs = 0;
    this._hudEls = null;
    this._hudCache = {};
    this._ultFxController = null;
    this._mergeVfxController = null;
    this._cardPlayVfx = null;
    this._slotNodes = [];
    this._slotMeta = [];
    this._pendingMergeSlot = -1;
    this._isInitialHandSync = true;
    this._slotAnimTimers = new Map();
    this._lastMergedInstanceId = null;
    this._ultPulseTimer = null;
    this._ultCompleteTimer = null;
    this._lastUltPulseMs = 0;
  }

  mount(container, params = {}) {
    this._container = container;
    this._hudCache = {};
    this._slotNodes = [];
    this._slotMeta = [];
    this._pendingMergeSlot = -1;
    this._hoveredCardSlot = -1;
    this._resultsShownSessionId = null;
    this._isInitialHandSync = true;
    this._clearMergeVfx();

    const {
      battleManager,
      heroSystem,
      progressionSystem,
      assetManager,
      eventBus,
      screenManager,
      gameState,
      saveManager,
      audioManager,
      tutorialManager,
      cardSystem,
    } = this._ctx;
    const launchingTutorial = Boolean(tutorialManager?.shouldLaunch?.(params));

    if (!launchingTutorial && cardSystem?.isDeckReadyForBattle) {
      const deckCheck = cardSystem.isDeckReadyForBattle();
      if (!deckCheck.ok) {
        audioManager?.playInvalid?.();
        this._ctx.notify?.(deckCheck.reason, 'warn');
        gameState.setUI({ formationTab: 'deck' });
        screenManager?.navigate?.('formation');
        return;
      }
    }

    const stage = launchingTutorial
      ? createTutorialStageConfig()
      : progressionSystem.resolveBattleEntryStage
        ? progressionSystem.resolveBattleEntryStage({
            requestedStageId: params?.stageId || null,
            preserveSelected: params?.preserveSelectedStage ?? null,
          })
        : progressionSystem.getSelectedStage();
    const commander = heroSystem.getActiveCommander();
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const isMuted = Boolean(gameState.settings?.muted);
    const isTutorialStage = Boolean(stage?.isTutorial);
    const stageDisplayLabel = isTutorialStage
      ? `Tutorial · ${stage.name}`
      : `Stage ${stage?.code || '1-1'} · ${stage?.name || 'Outer Bastion'}`;

    container.innerHTML = `
      <section class="battle-theater" aria-label="Tactical Battlefield">
        <canvas id="battle-canvas" class="battle-canvas" aria-label="Tactical battlefield canvas"></canvas>

        <header class="battle-topbar" aria-label="Battle Status Bar">
          <div class="hud-pill-group hud-pill-group--left">
            <button
              type="button"
              id="hud-stage-name"
              class="hud-stage-name hud-stage-name--clickable${isTutorialStage ? ' is-tutorial' : ''}"
              aria-label="${
                isTutorialStage
                  ? stageDisplayLabel
                  : `${stageDisplayLabel} — Select Stage in Main Missions`
              }"
              title="${
                isTutorialStage
                  ? 'Complete or skip tutorial to select campaign stages'
                  : 'Select Battle Stage (Main Missions)'
              }"
              ${isTutorialStage ? 'disabled' : ''}
            ><span class="hud-stage-name__text">${stageDisplayLabel}</span>${
              isTutorialStage
                ? ''
                : '<svg class="hud-stage-name__arrow" viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M4.25 2.5L7.75 6L4.25 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            }</button>
          </div>

          <div class="hud-pill-group hud-pill-group--center">
            <div class="hud-force-stat hud-force-stat--ally">
              <span class="hud-force-stat__label">Ally</span>
              <span id="hud-ally-count" class="hud-force-stat__val tabular-nums">0 / 25</span>
            </div>
            <div class="hud-timer tabular-nums" id="hud-battle-timer">00:00</div>
            <div class="hud-force-stat hud-force-stat--enemy">
              <span class="hud-force-stat__label">Enemy</span>
              <span id="hud-enemy-count" class="hud-force-stat__val tabular-nums">0 / 25</span>
            </div>
          </div>

          <div class="hud-pill-group hud-pill-group--right">
            <button type="button" id="btn-battle-pause" class="hud-ctrl-btn" title="Pause / Resume (P)" disabled>Pause</button>
            <button type="button" id="btn-battle-speed" class="hud-ctrl-btn tabular-nums" title="Cycle Battle Speed (S)">1x</button>
            <button
              type="button"
              id="btn-battle-guide"
              class="hud-ctrl-btn hud-ctrl-btn--icon"
              aria-label="Open Tactical Guide"
              title="Tactical Guide & Shortcuts"
            >?</button>
            <button
              type="button"
              id="btn-battle-mute"
              class="hud-ctrl-btn hud-ctrl-btn--icon audio-toggle-btn ${isMuted ? 'is-muted' : ''}"
              aria-label="Mute or unmute game audio"
              aria-pressed="${isMuted}"
              title="${isMuted ? 'Unmute Audio' : 'Mute Audio'}"
            >
              <svg class="audio-toggle-btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 7.5h3.5L11 3.8v12.4L6.5 12.5H3V7.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                <path class="audio-wave-1" d="M13.8 7.3a3.6 3.6 0 0 1 0 5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                <path class="audio-wave-2" d="M16.1 5a6.8 6.8 0 0 1 0 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                <path class="audio-slash" d="M13.6 7.4l4.2 5.2M17.8 7.4l-4.2 5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              </svg>
            </button>
            <button type="button" id="btn-battle-retreat" class="hud-ctrl-btn hud-ctrl-btn--ghost">Retreat</button>
          </div>
        </header>

        <div id="boss-hud-bar" class="boss-hud-bar" hidden>
          <div class="boss-hud-bar__head">
            <span id="boss-hud-name" class="boss-hud-bar__name">BOSS</span>
            <span id="boss-hud-cast" class="boss-hud-bar__cast" hidden></span>
            <span id="boss-hud-hp" class="boss-hud-bar__hp tabular-nums">0 / 0</span>
          </div>
          <div class="boss-hud-track">
            <div id="boss-hud-fill" class="boss-hud-fill" style="width: 100%;"></div>
            <div id="boss-hud-shield" class="boss-hud-shield" style="width: 0%;"></div>
          </div>
        </div>

        <div id="battle-banner" class="battle-banner" aria-live="polite" hidden></div>

        <div id="prep-bar" class="prep-floating-bar">
          <button type="button" id="btn-start-battle" class="btn btn-primary btn-sm">
            Start Battle
          </button>
        </div>

        <div id="card-preview-strip" class="card-preview-strip" aria-live="polite" hidden>
          <span id="card-preview-title" class="card-preview-strip__title"></span>
          <span class="meta-sep" aria-hidden="true">·</span>
          <span id="card-preview-desc" class="card-preview-strip__desc"></span>
          <span id="card-preview-upgrade" class="card-preview-strip__upgrade"></span>
        </div>

        <div class="battle-command-dock" aria-label="Tactical Command Dock">
          <canvas id="merge-vfx-canvas" class="merge-vfx-canvas" aria-hidden="true"></canvas>
          <canvas id="merge-vfx-fg-canvas" class="merge-vfx-canvas merge-vfx-canvas--fg" aria-hidden="true"></canvas>
          <div class="dock-energy-core">
            <div>
              <div class="dock-energy-core__kicker">Command Energy</div>
              <div class="dock-energy-core__val tabular-nums" id="hud-energy-label">60 / 100</div>
            </div>
            <div class="progress-track">
              <div id="hud-energy-bar" class="progress-fill" style="width: 60%;"></div>
            </div>
            <div>
              <div class="dock-energy-core__sub tabular-nums" id="hud-deck-remaining">6-Card Pool · 5s Refill</div>
              <div class="dock-energy-core__hint" id="hand-hint-text">Keys 1-6 · Merge matching</div>
            </div>
          </div>

          <div id="tactical-card-slots" class="card-slots-grid" role="group" aria-label="Six tactical card slots"></div>

          <aside id="commander-console" class="dock-commander-module ${themeClass}" aria-label="Commander Ultimate">
            <button
              type="button"
              id="btn-trigger-ultimate"
              class="dock-commander-card"
              aria-label="${commander?.name || 'Commander'} Ultimate (${commander?.ultimateSkill?.name || 'Starfall Judgment'}): 0%"
              title="${commander?.name || 'Commander'} · ${commander?.ultimateSkill?.name || 'Starfall Judgment'} [Space]"
              disabled
            >
              <img id="battle-commander-avatar" class="dock-commander-card__art" alt="${commander?.name || 'Commander'}" />
              <div class="dock-commander-card__fx" aria-hidden="true">
                <canvas id="ult-fx-canvas" class="dock-commander-card__fx-canvas" aria-hidden="true"></canvas>
                <span class="dock-commander-card__foil"></span>
                <span class="dock-commander-card__glitter"></span>
                <span class="dock-commander-card__flare dock-commander-card__flare--a"></span>
                <span class="dock-commander-card__flare dock-commander-card__flare--b"></span>
                <span class="dock-commander-card__flare dock-commander-card__flare--c"></span>
                <span id="hud-ult-ready-badge" class="dock-commander-card__ready-badge">ULT READY</span>
              </div>
              <div
                id="hud-ult-bar-wrap"
                class="dock-commander-card__bar-wrap"
                data-ult-tier="empty"
                style="--ult-pct: 0%; --ult-ratio: 0;"
                aria-hidden="true"
              >
                <div class="dock-commander-card__ult-meta">
                  <span id="hud-ult-name" class="dock-commander-card__ult-name">${commander?.ultimateSkill?.name || 'Starfall Judgment'}</span>
                  <span id="hud-ult-pct" class="dock-commander-card__ult-pct tabular-nums">0%</span>
                </div>
                <div class="dock-commander-card__track-stage">
                  <div class="dock-commander-card__bar-aura"></div>
                  <div id="hud-ult-track" class="dock-commander-card__track">
                    <div id="hud-ult-bar" class="dock-commander-card__fill" style="width: 0%;">
                      <span class="ult-bar__flow"></span>
                      <span class="ult-bar__particles"></span>
                      <span class="ult-bar__highlight"></span>
                      <span class="ult-bar__pulse"></span>
                      <span class="ult-bar__edge"></span>
                    </div>
                    <span class="ult-bar__complete-sweep"></span>
                  </div>
                  <div id="hud-ult-sparks" class="ult-bar__sparks">
                    <span class="ult-bar__spark ult-bar__spark--1"></span>
                    <span class="ult-bar__spark ult-bar__spark--2"></span>
                    <span class="ult-bar__spark ult-bar__spark--3"></span>
                    <span class="ult-bar__spark ult-bar__spark--4"></span>
                    <span class="ult-bar__spark ult-bar__spark--5"></span>
                    <span class="ult-bar__spark ult-bar__spark--6"></span>
                    <span class="ult-bar__ambient-spark ult-bar__ambient-spark--a"></span>
                    <span class="ult-bar__ambient-spark ult-bar__ambient-spark--b"></span>
                  </div>
                </div>
              </div>
            </button>
          </aside>
        </div>

        <div id="card-play-ghost-layer" class="card-play-ghost-layer" aria-hidden="true"></div>
        <canvas id="card-play-vfx-canvas" class="card-play-vfx-canvas" aria-hidden="true"></canvas>

        <div id="ultimate-cutin" class="ultimate-cutin ${themeClass}" aria-live="assertive">
          <div class="ultimate-cutin__band">
            <div class="ultimate-cutin__portrait">
              <img id="cutin-portrait-img" alt="${commander?.name || 'Commander'}" />
            </div>
            <div class="ultimate-cutin__content">
              <div id="cutin-commander" class="ultimate-cutin__eyebrow">COMMANDER ULTIMATE</div>
              <div id="cutin-skill" class="ultimate-cutin__title">Starfall Judgment</div>
              <div id="cutin-sub" class="ultimate-cutin__sub">Tactical Command Engaged</div>
            </div>
          </div>
        </div>

        <div id="battle-outcome-splash" class="battle-outcome-splash" aria-live="assertive" hidden></div>

        <div id="battle-results-overlay" class="battle-results-overlay" hidden></div>

        <div id="tutorial-overlay-root" class="tutorial-overlay-root" hidden></div>
      </section>
    `;

    this._cacheHudRefs();
    this._initCardSlotElements();
    const fxTheme = COMMANDER_FX_THEMES[commander?.id] || COMMANDER_FX_THEMES.astra;
    this._ultFxController = new CardUltimateFxController(
      container.querySelector('#ult-fx-canvas'),
      fxTheme,
    );
    this._mergeVfxController = new CardMergeVfxController(
      container.querySelector('#merge-vfx-canvas'),
      container.querySelector('#merge-vfx-fg-canvas'),
    );
    this._cardPlayVfx = new NonUnitCardPlayVfx(
      container.querySelector('#card-play-vfx-canvas'),
      container.querySelector('#card-play-ghost-layer'),
      { assetManager },
    );

    const avatarEl = container.querySelector('#battle-commander-avatar');
    const cutinPortraitEl = container.querySelector('#cutin-portrait-img');
    if (commander) {
      if (avatarEl) assetManager.bindImageElement(avatarEl, commander.portraitAssetId);
      if (cutinPortraitEl) assetManager.bindImageElement(cutinPortraitEl, commander.portraitAssetId);
    }

    this._hudCache.stageId = stage?.id || null;
    const canvas = container.querySelector('#battle-canvas');
    if (launchingTutorial && tutorialManager) {
      tutorialManager.startSession({
        container,
        battleScreen: this,
        isReplay: Boolean(params?.replay),
      });
    } else {
      const sessionInfo = battleManager.startSession(canvas, {
        stageId: stage?.id || null,
        enforceUnlock: true,
      });
      const activeStage = sessionInfo?.stage || stage;
      if (activeStage && this._hudEls?.stageBtn) {
        this._updateStageIndicator(this._hudEls.stageBtn, activeStage);
        this._hudCache.stageId = activeStage.id;
      }
    }

    this._renderCardSlots();
    this._isInitialHandSync = false;
    this._syncHud();

    canvas?.addEventListener('mousemove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      battleManager.handleCanvasHover(ev.clientX - rect.left, ev.clientY - rect.top);
    });

    canvas?.addEventListener('mouseleave', () => {
      battleManager.clearCanvasHover();
    });

    canvas?.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const selectedBefore = this._ctx.gameState.battle.selectedCardSlot;
      const res = battleManager.handleCanvasPointer(sx, sy);
      if (res?.action === 'prep_moved' && !res.ok && res.reason) {
        this._ctx.audioManager?.playInvalid?.();
        this._ctx.notify(res.reason, 'warn');
      } else if (res?.action === 'commander_dais' && !res.ok && res.reason) {
        this._ctx.audioManager?.playInvalid?.();
        this._ctx.notify(res.reason, 'warn');
      } else if (res?.action === 'played' && !res.ok && res.reason) {
        if (selectedBefore >= 0) this._triggerInvalidSlot(selectedBefore);
        this._ctx.notify(res.reason, 'warn');
      }
      this._syncPrepControls();
      this._renderCardSlots();
    });

    container.querySelector('#hud-stage-name')?.addEventListener('click', () => {
      if (battleManager.isTutorialSession?.() || tutorialManager?.isActive?.()) {
        return;
      }
      this._ctx.audioManager?.playClick?.();
      const activeStageId =
        this._ctx.gameState.battle?.stageId ||
        progressionSystem.getSelectedStage?.()?.id ||
        null;
      const navParams = {
        category: 'main',
        ...(activeStageId ? { stageId: activeStageId } : {}),
      };
      const phase = battleManager.getPhase?.();
      if (
        !phase ||
        phase === BATTLE_PHASES.PREPARATION ||
        phase === BATTLE_PHASES.RESULTS
      ) {
        screenManager.navigate('missions', navParams);
        return;
      }
      battleManager.setPaused?.(true);
      this._syncHud();
      this._ctx.confirmDialog?.({
        title: 'Select Battle Stage',
        message: 'Leaving now will end the current battle attempt without granting rewards and open Main Missions stage selection.',
        confirmLabel: 'Select Stage',
        onConfirm: () => {
          screenManager.navigate('missions', navParams);
        },
      });
    });

    container.querySelector('#btn-battle-guide')?.addEventListener('click', () => {
      this._ctx.audioManager?.playClick?.();
      this._ctx.openGuide?.();
    });

    container.querySelector('#btn-start-battle')?.addEventListener('click', () => {
      battleManager.beginBattle();
      this._syncHud();
      this._renderCardSlots();
    });

    container.querySelector('#btn-battle-pause')?.addEventListener('click', () => {
      battleManager.togglePause();
      this._syncHud();
    });

    container.querySelector('#btn-battle-speed')?.addEventListener('click', () => {
      battleManager.cycleSpeed();
      this._syncHud();
    });

    container.querySelector('#btn-battle-mute')?.addEventListener('click', () => {
      const nextMuted = !gameState.settings.muted;
      gameState.mutatePersistent('settings', (p) => {
        p.settings.muted = nextMuted;
      });
      saveManager?.save(gameState.toSerializableSave());
      audioManager?.syncVolumes?.();
      this._syncMuteBtn();
      if (!nextMuted) audioManager?.playClick?.();
      this._ctx.notify(nextMuted ? 'Audio muted.' : 'Audio unmuted.');
    });

    container.querySelector('#btn-battle-retreat')?.addEventListener('click', () => {
      this._ctx.audioManager?.playClick();
      const phase = battleManager.getPhase();
      if (phase === BATTLE_PHASES.PREPARATION || phase === BATTLE_PHASES.RESULTS) {
        screenManager.navigate('home');
        return;
      }
      battleManager.setPaused(true);
      this._syncHud();
      this._ctx.confirmDialog({
        title: 'Retreat from Battle',
        message: 'Leaving now will end the current attempt without granting battle rewards.',
        confirmLabel: 'Retreat',
        onConfirm: () => {
          screenManager.navigate('home');
        },
      });
    });

    container.querySelector('#btn-trigger-ultimate')?.addEventListener('click', () => {
      const res = battleManager.triggerUltimate();
      if (!res.ok) {
        this._ctx.audioManager?.playInvalid?.();
        this._ctx.notify(res.reason, 'warn');
      }
    });

    this._resizeHandler = () => {
      battleManager.handleResize();
      this._cardPlayVfx?.resize();
    };
    window.addEventListener('resize', this._resizeHandler);

    // Keyboard controls: 1-6 cards, Space/Q Ultimate, P Pause, S Speed, Enter Start, Esc Deselect, Shift+D Debug
    this._keyHandler = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target?.isContentEditable) return;
      if (ev.shiftKey && ev.code === 'KeyD') {
        battleManager.toggleDebugMode();
        return;
      }
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot && modalRoot.children.length > 0) return;
      if (this._ctx.tutorialManager?.isSkipConfirmOpen?.()) {
        if (ev.code === 'Escape') {
          this._ctx.tutorialManager.cancelSkipConfirm();
        }
        return;
      }
      const phase = battleManager.getPhase();
      if (phase === BATTLE_PHASES.RESULTS) return;

      if (ev.code === 'Enter' && phase === BATTLE_PHASES.PREPARATION) {
        ev.preventDefault();
        battleManager.beginBattle();
        this._syncHud();
        this._renderCardSlots();
        return;
      }

      if (ev.code === 'Escape') {
        if (this._ctx.gameState.battle.selectedCardSlot !== -1) {
          this._ctx.gameState.setBattle({ selectedCardSlot: -1 });
          this._renderCardSlots();
        }
        return;
      }

      if (ev.code === 'KeyP') {
        battleManager.togglePause();
        this._syncHud();
        return;
      }

      if (ev.code === 'KeyS') {
        battleManager.cycleSpeed();
        this._syncHud();
        return;
      }

      if (ev.code === 'Space' || ev.code === 'KeyQ') {
        ev.preventDefault();
        const res = battleManager.triggerUltimate();
        if (!res.ok && res.reason) {
          this._ctx.audioManager?.playInvalid?.();
          this._ctx.notify(res.reason, 'warn');
        }
        return;
      }

      if (/^Digit[1-6]$/.test(ev.code)) {
        const slotIdx = Number(ev.code.slice(5)) - 1;
        const res = battleManager.interactWithCardSlot(slotIdx);
        if ((res.action === 'played' || res.action === 'blocked') && !res.ok) {
          this._triggerInvalidSlot(slotIdx);
          if (res.action === 'blocked') this._ctx.audioManager?.playInvalid?.();
          if (res.reason) this._ctx.notify(res.reason, 'warn');
        }
        this._renderCardSlots();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    this._unsubs.push(
      eventBus.on('state:changed', () => this._syncMuteBtn()),
      eventBus.on('battle:phaseChanged', () => this._renderCardSlots()),
      eventBus.on('battle:stateChanged', () => {
        this._syncHud();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this._lastCardRenderMs > 110) {
          this._renderCardSlots();
        }
      }),
      eventBus.on('cards:merged', ({ sourceIndex, targetIndex, upgradedCard }) => {
        if (upgradedCard?.instanceId && this._lastMergedInstanceId === upgradedCard.instanceId) {
          return;
        }
        this._lastMergedInstanceId = upgradedCard?.instanceId || null;
        this._pendingMergeSlot = typeof targetIndex === 'number' ? targetIndex : -1;
        this._playMergeSuccessVfx({ sourceIndex, targetIndex, upgradedCard });
        this._ctx.notify(
          `Merged into ${upgradedCard.name} (${upgradedCard.levelLabel})`,
          'success',
        );
      }),
      eventBus.on('cards:refillTick', () => this._syncRefillIndicators()),
      eventBus.on('cards:refilled', () => this._renderCardSlots()),
      eventBus.on('cards:updated', () => this._renderCardSlots()),
      eventBus.on('cards:nonUnitPlayed', (payload) => this._playNonUnitCardVfx(payload)),
      eventBus.on('commander:ultimateActivated', ({ commander: cmd, skill, summary }) => {
        this._showCutin(cmd, skill);
        if (summary && (summary.enemiesHit > 0 || summary.alliesHealed > 0)) {
          const parts = [];
          if (summary.totalDamage > 0) parts.push(`${summary.totalDamage} damage`);
          if (summary.totalHeal > 0) parts.push(`${summary.totalHeal} healed`);
          if (parts.length > 0) {
            this._ctx.notify(`${skill?.name || 'Ultimate'}: ${parts.join(' · ')}`);
          }
        }
      }),
      eventBus.on('battle:completed', (results) => {
        this._cardPlayVfx?.stop();
        this._scheduleResultsReveal(results);
      }),
    );
  }

  unmount() {
    this._clearMergeVfx();
    this._clearUltimateBarFx();
    this._cardPlayVfx?.stop();
    this._cardPlayVfx = null;
    this._mergeVfxController?.stop();
    this._mergeVfxController = null;
    this._ctx.tutorialManager?.abortSession?.();
    this._ultFxController?.stop();
    this._ultFxController = null;
    this._ctx.battleManager.stopSession();
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._cutinTimer) {
      clearTimeout(this._cutinTimer);
      this._cutinTimer = null;
    }
    if (this._rewardTimer) {
      clearTimeout(this._rewardTimer);
      this._rewardTimer = null;
    }
    if (this._resultsRevealTimer) {
      clearTimeout(this._resultsRevealTimer);
      this._resultsRevealTimer = null;
    }
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._hudEls = null;
    this._slotNodes = [];
    this._slotMeta = [];
    this._container = null;
  }

  startNormalBattleAfterTutorial() {
    if (!this._container) return;
    const deckCheck = this._ctx.cardSystem?.isDeckReadyForBattle?.();
    if (deckCheck && !deckCheck.ok) {
      this._ctx.audioManager?.playInvalid?.();
      this._ctx.notify?.(deckCheck.reason, 'warn');
      this._ctx.gameState.setUI({ formationTab: 'deck' });
      this._ctx.screenManager?.navigate?.('formation');
      return;
    }
    const stage = this._ctx.progressionSystem.resolveBattleEntryStage
      ? this._ctx.progressionSystem.resolveBattleEntryStage()
      : this._ctx.progressionSystem.getSelectedStage();
    this._hudCache = {};
    this._clearUltimateBarFx();
    this._cardPlayVfx?.stop();
    this._isInitialHandSync = true;
    const canvas = this._container.querySelector('#battle-canvas');
    const sessionInfo = this._ctx.battleManager.startSession(canvas, {
      stageId: stage?.id || null,
      enforceUnlock: true,
    });
    const activeStage = sessionInfo?.stage || stage;
    const stageEl = this._container.querySelector('#hud-stage-name');
    if (stageEl && activeStage) {
      this._updateStageIndicator(stageEl, activeStage);
      this._hudCache.stageId = activeStage.id;
    }
    this._renderCardSlots();
    this._isInitialHandSync = false;
    this._syncHud();
    this._syncPrepControls();
  }

  _updateStageIndicator(stageEl, stage) {
    if (!stageEl || !stage) return;
    const isTutorialStage = Boolean(stage.isTutorial);
    const label = isTutorialStage
      ? `Tutorial · ${stage.name}`
      : `Stage ${stage.code || '1-1'} · ${stage.name || 'Outer Bastion'}`;

    stageEl.disabled = isTutorialStage;
    if (isTutorialStage) {
      stageEl.setAttribute('disabled', '');
      stageEl.classList?.add('is-tutorial');
      stageEl.setAttribute('aria-label', label);
      stageEl.title = 'Complete or skip tutorial to select campaign stages';
    } else {
      stageEl.removeAttribute?.('disabled');
      stageEl.classList?.remove('is-tutorial');
      stageEl.setAttribute('aria-label', `${label} — Select Stage in Main Missions`);
      stageEl.title = 'Select Battle Stage (Main Missions)';
    }

    stageEl.innerHTML = `<span class="hud-stage-name__text">${label}</span>${
      isTutorialStage
        ? ''
        : '<svg class="hud-stage-name__arrow" viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true"><path d="M4.25 2.5L7.75 6L4.25 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    }`;
  }

  _syncMuteBtn() {
    const btn = this._hudEls?.muteBtn;
    if (!btn) return;
    const isMuted = Boolean(this._ctx.gameState.settings?.muted);
    btn.classList.toggle('is-muted', isMuted);
    btn.setAttribute('aria-pressed', String(isMuted));
    btn.title = isMuted ? 'Unmute Audio' : 'Mute Audio';
  }

  _cacheHudRefs() {
    const q = (sel) => this._container?.querySelector(sel) || null;
    this._hudEls = {
      stageBtn: q('#hud-stage-name'),
      waveInd: q('#hud-wave-indicator'),
      waveLbl: q('#hud-wave-label'),
      tacticWrap: q('#hud-tactic-wrap'),
      tacticLbl: q('#hud-tactic-label'),
      allyCount: q('#hud-ally-count'),
      enemyCount: q('#hud-enemy-count'),
      timerEl: q('#hud-battle-timer'),
      energyLabel: q('#hud-energy-label'),
      energyBar: q('#hud-energy-bar'),
      deckRem: q('#hud-deck-remaining'),
      handHint: q('#hand-hint-text'),
      ultName: q('#hud-ult-name'),
      ultPct: q('#hud-ult-pct'),
      ultBar: q('#hud-ult-bar'),
      ultBarWrap: q('#hud-ult-bar-wrap'),
      ultTrack: q('#hud-ult-track'),
      ultSparks: q('#hud-ult-sparks'),
      ultReadyBadge: q('#hud-ult-ready-badge'),
      ultBtn: q('#btn-trigger-ultimate'),
      cmdConsole: q('#commander-console'),
      pauseBtn: q('#btn-battle-pause'),
      speedBtn: q('#btn-battle-speed'),
      muteBtn: q('#btn-battle-mute'),
      prepBar: q('#prep-bar'),
      prepHint: q('#prep-hint'),
      prepPassive: q('#prep-passive-label'),
      bannerEl: q('#battle-banner'),
      bossBar: q('#boss-hud-bar'),
      bossName: q('#boss-hud-name'),
      bossCast: q('#boss-hud-cast'),
      bossHp: q('#boss-hud-hp'),
      bossFill: q('#boss-hud-fill'),
      bossShield: q('#boss-hud-shield'),
      previewStrip: q('#card-preview-strip'),
      previewTitle: q('#card-preview-title'),
      previewDesc: q('#card-preview-desc'),
      previewUpgrade: q('#card-preview-upgrade'),
      outcomeSplash: q('#battle-outcome-splash'),
      resultsOverlay: q('#battle-results-overlay'),
      mergeVfxCanvas: q('#merge-vfx-canvas'),
      mergeVfxFgCanvas: q('#merge-vfx-fg-canvas'),
    };
  }

  _initCardSlotElements() {
    const grid = this._container?.querySelector('#tactical-card-slots');
    if (!grid) return;
    grid.innerHTML = '';
    this._slotNodes = [];
    this._slotMeta = [];

    for (let idx = 0; idx < 6; idx += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tactical-card tactical-card--empty';
      btn.dataset.slotIndex = String(idx);
      btn.innerHTML = `
        <div class="tactical-card__inner">
          <div class="tactical-card__top">
            <span class="tactical-card__cost tabular-nums"></span>
            <span class="tactical-card__tier tabular-nums"></span>
          </div>
          <div class="tactical-card__art">
            <img class="tactical-card__img" alt="" />
            <span class="tactical-card__category"></span>
          </div>
          <div class="tactical-card__body">
            <div class="tactical-card__name"></div>
            <div class="tactical-card__footer">
              <span class="tactical-card__hint"></span>
              <span class="tactical-card__key tabular-nums" aria-hidden="true">${idx + 1}</span>
            </div>
          </div>
          <div class="tactical-card__refill" hidden>
            <span class="tactical-card__refill-label">Refilling</span>
            <span class="tactical-card__refill-time tabular-nums">5.0s</span>
            <div class="tactical-card__refill-track">
              <div class="tactical-card__refill-fill" style="width: 0%;"></div>
            </div>
            <span class="tactical-card__refill-key tabular-nums" aria-hidden="true">Slot ${idx + 1}</span>
          </div>
          <div class="tactical-card__cooldown" hidden>
            <span class="tactical-card__cooldown-text tabular-nums"></span>
          </div>
          <span class="tactical-card__flash" aria-hidden="true"></span>
        </div>
        <span class="tactical-card__merge-badge" hidden aria-hidden="true"></span>
        <span class="tactical-card__levelup" hidden aria-hidden="true"></span>
      `;

      btn.addEventListener('mouseenter', () => {
        this._hoveredCardSlot = idx;
        this._syncCardPreview();
      });

      btn.addEventListener('mouseleave', () => {
        if (this._hoveredCardSlot === idx) {
          this._hoveredCardSlot = -1;
          this._syncCardPreview();
        }
      });

      btn.addEventListener('click', () => {
        const res = this._ctx.battleManager.interactWithCardSlot(idx);
        if ((res.action === 'played' || res.action === 'blocked') && !res.ok) {
          this._triggerInvalidSlot(idx);
          if (res.action === 'blocked') {
            this._ctx.audioManager?.playInvalid?.();
          }
          if (res.reason) this._ctx.notify(res.reason, 'warn');
        }
        this._renderCardSlots();
      });

      grid.appendChild(btn);
      this._slotNodes.push({
        root: btn,
        top: btn.querySelector('.tactical-card__top'),
        cost: btn.querySelector('.tactical-card__cost'),
        category: btn.querySelector('.tactical-card__category'),
        tier: btn.querySelector('.tactical-card__tier'),
        art: btn.querySelector('.tactical-card__art'),
        img: btn.querySelector('.tactical-card__img'),
        body: btn.querySelector('.tactical-card__body'),
        name: btn.querySelector('.tactical-card__name'),
        hint: btn.querySelector('.tactical-card__hint'),
        refillWrap: btn.querySelector('.tactical-card__refill'),
        refillTime: btn.querySelector('.tactical-card__refill-time'),
        refillFill: btn.querySelector('.tactical-card__refill-fill'),
        cdWrap: btn.querySelector('.tactical-card__cooldown'),
        cdText: btn.querySelector('.tactical-card__cooldown-text'),
        flash: btn.querySelector('.tactical-card__flash'),
        mergeBadge: btn.querySelector('.tactical-card__merge-badge'),
        levelUp: btn.querySelector('.tactical-card__levelup'),
      });
      this._slotMeta.push({
        instanceId: null,
        tier: 0,
        artAssetId: null,
        isEmpty: true,
      });
    }
  }

  _triggerInvalidSlot(slotIndex) {
    const node = this._slotNodes[slotIndex];
    if (!node) return;
    node.root.classList.remove('is-invalid-shake');
    void node.root.offsetWidth;
    node.root.classList.add('is-invalid-shake');
    setTimeout(() => node.root.classList.remove('is-invalid-shake'), 280);
  }

  _triggerSlotAnimation(slotIndex, className, durationMs, extraClasses = [], onEnd = null) {
    const node = this._slotNodes[slotIndex];
    if (!node) return;
    const prevTimer = this._slotAnimTimers.get(slotIndex);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this._slotAnimTimers.delete(slotIndex);
    }
    const animClasses = [
      'is-newly-drawn',
      'is-just-merged',
      'is-merge-tier-2',
      'is-merge-tier-3',
      'is-merge-departed',
      'is-nonunit-dispatched',
    ];
    node.root.classList.remove(...animClasses);
    if (node.tier) {
      node.tier.classList?.remove('is-tier-evolving');
      node.tier.removeAttribute?.('data-prev-tier');
    }
    if (node.levelUp && className !== 'is-newly-drawn') {
      node.levelUp.classList?.remove('is-visible', 'is-tier-3');
      node.levelUp.hidden = true;
      node.levelUp.innerHTML = '';
    }
    void node.root.offsetWidth;
    const classesToAdd = [className, ...extraClasses].filter(Boolean);
    node.root.classList.add(...classesToAdd);
    const timer = setTimeout(() => {
      this._slotAnimTimers.delete(slotIndex);
      node.root?.classList?.remove(...classesToAdd);
      if (typeof onEnd === 'function') onEnd(node);
    }, durationMs);
    this._slotAnimTimers.set(slotIndex, timer);
  }

  _clearMergeVfx() {
    if (this._slotAnimTimers) {
      for (const timer of this._slotAnimTimers.values()) {
        clearTimeout(timer);
      }
      this._slotAnimTimers.clear();
    }
    if (this._slotNodes) {
      for (const node of this._slotNodes) {
        node.root?.classList?.remove(
          'is-newly-drawn',
          'is-just-merged',
          'is-merge-tier-2',
          'is-merge-tier-3',
          'is-merge-departed',
          'is-nonunit-dispatched',
        );
        if (node.tier) {
          node.tier.classList?.remove('is-tier-evolving');
          node.tier.removeAttribute?.('data-prev-tier');
        }
        if (node.levelUp) {
          node.levelUp.classList?.remove('is-visible', 'is-tier-3');
          node.levelUp.hidden = true;
          node.levelUp.innerHTML = '';
        }
      }
    }
    this._mergeVfxController?.stop?.();
    this._cardPlayVfx?.stop?.();
    this._lastMergedInstanceId = null;
  }

  _playNonUnitCardVfx({ slotIndex, card, vfxAnchor } = {}) {
    if (!isNonUnitCard(card) || !this._cardPlayVfx || !this._container) return;

    const slotNode = Number.isInteger(slotIndex) ? this._slotNodes[slotIndex] : null;
    const slotRect =
      slotNode?.root && typeof slotNode.root.getBoundingClientRect === 'function'
        ? slotNode.root.getBoundingClientRect()
        : null;

    const theaterEl = this._container.querySelector?.('.battle-theater') || this._container;
    const theaterRect =
      theaterEl && typeof theaterEl.getBoundingClientRect === 'function'
        ? theaterEl.getBoundingClientRect()
        : null;

    const energyCoreEl = this._container.querySelector?.('.dock-energy-core');
    const energyCoreRect =
      energyCoreEl && typeof energyCoreEl.getBoundingClientRect === 'function'
        ? energyCoreEl.getBoundingClientRect()
        : null;

    const cmdBtnEl = this._container.querySelector?.('#btn-trigger-ultimate');
    const commanderCardRect =
      cmdBtnEl && typeof cmdBtnEl.getBoundingClientRect === 'function'
        ? cmdBtnEl.getBoundingClientRect()
        : null;

    const canvasEl = this._container.querySelector?.('#battle-canvas');
    const canvasRect =
      canvasEl && typeof canvasEl.getBoundingClientRect === 'function'
        ? canvasEl.getBoundingClientRect()
        : theaterRect;

    const bf = this._ctx.battleManager?.battlefield;
    const dims = this._ctx.battleManager?._renderer?.getDimensions?.() || {
      width: canvasRect?.width || 1200,
      height: canvasRect?.height || 700,
    };

    let targetScreenPos = null;
    if (bf && vfxAnchor && typeof vfxAnchor.x === 'number' && typeof vfxAnchor.y === 'number') {
      const p = bf.worldToScreen(vfxAnchor.x, vfxAnchor.y, dims.width, dims.height, 2);
      const offsetX =
        canvasRect && theaterRect && Number.isFinite(canvasRect.left) && Number.isFinite(theaterRect.left)
          ? canvasRect.left - theaterRect.left
          : 0;
      const offsetY =
        canvasRect && theaterRect && Number.isFinite(canvasRect.top) && Number.isFinite(theaterRect.top)
          ? canvasRect.top - theaterRect.top
          : 0;
      targetScreenPos = { x: p.x + offsetX, y: p.y + offsetY };
    }

    const reducedMotion = Boolean(
      typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );

    if (slotNode?.root) {
      this._triggerSlotAnimation(slotIndex, 'is-nonunit-dispatched', reducedMotion ? 160 : 340);
    }

    this._cardPlayVfx.playNonUnitCard({
      card,
      slotIndex,
      slotRect,
      theaterRect,
      targetScreenPos,
      energyCoreRect,
      commanderCardRect,
      reducedMotion,
    });
  }

  _playMergeSuccessVfx({ sourceIndex, targetIndex, upgradedCard } = {}) {
    const sourceNode = Number.isInteger(sourceIndex) ? this._slotNodes[sourceIndex] : null;
    const targetNode = Number.isInteger(targetIndex) ? this._slotNodes[targetIndex] : null;
    if (!targetNode || !targetNode.root) return;

    const toTier = upgradedCard?.tier >= 3 ? 3 : 2;
    const fromTier = Math.max(1, toTier - 1);
    const prevLabel = fromTier === 2 ? 'Lv.II' : 'Lv.I';
    const nextLabel = toTier >= 3 ? 'Lv.III' : 'Lv.II';
    const rarity = (upgradedCard?.rarity || 'R').toLowerCase();
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (sourceNode?.root && sourceIndex !== targetIndex) {
      const departMs = reducedMotion ? 180 : 320;
      this._triggerSlotAnimation(sourceIndex, 'is-merge-departed', departMs);
    }

    const targetDurMs = reducedMotion ? 320 : toTier >= 3 ? 1280 : 1100;
    this._triggerSlotAnimation(
      targetIndex,
      'is-just-merged',
      targetDurMs,
      [`is-merge-tier-${toTier}`],
      (node) => {
        if (node.tier) {
          node.tier.classList?.remove('is-tier-evolving');
          node.tier.removeAttribute?.('data-prev-tier');
        }
        if (node.levelUp) {
          node.levelUp.classList?.remove('is-visible', 'is-tier-3');
          node.levelUp.hidden = true;
          node.levelUp.innerHTML = '';
        }
      },
    );

    if (targetNode.tier) {
      targetNode.tier.setAttribute?.('data-prev-tier', prevLabel);
      targetNode.tier.classList?.add('is-tier-evolving');
    }

    if (targetNode.levelUp) {
      targetNode.levelUp.innerHTML = `<span class="tactical-card__levelup-main">LEVEL UP</span><span class="tactical-card__levelup-tier">${nextLabel}</span>`;
      if (typeof HTMLElement === 'undefined' || !(targetNode.levelUp instanceof HTMLElement)) {
        targetNode.levelUp.textContent = `LEVEL UP ${nextLabel}`;
      }
      targetNode.levelUp.hidden = false;
      targetNode.levelUp.classList?.add('is-visible');
      if (toTier >= 3) {
        targetNode.levelUp.classList?.add('is-tier-3');
      }
    }

    const canvas = this._hudEls?.mergeVfxCanvas || this._container?.querySelector?.('#merge-vfx-canvas');
    const canvasRect =
      canvas && typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : null;
    const sourceRect =
      sourceNode?.root && typeof sourceNode.root.getBoundingClientRect === 'function'
        ? sourceNode.root.getBoundingClientRect()
        : null;
    const targetRect =
      typeof targetNode.root.getBoundingClientRect === 'function'
        ? targetNode.root.getBoundingClientRect()
        : null;

    this._mergeVfxController?.playMerge({
      sourceIndex,
      targetIndex,
      fromTier,
      toTier,
      rarity,
      sourceRect,
      targetRect,
      canvasRect,
    });
  }

  _refreshCommanderConsole(commander) {
    if (!this._container || !commander) return;
    const avatarEl = this._container.querySelector('#battle-commander-avatar');
    const cutinImg = this._container.querySelector('#cutin-portrait-img');
    const ultBtn = this._container.querySelector('#btn-trigger-ultimate');
    const cmdConsole = this._container.querySelector('#commander-console');
    const cutinEl = this._container.querySelector('#ultimate-cutin');

    if (avatarEl) {
      avatarEl.alt = commander.name;
      this._ctx.assetManager.bindImageElement(avatarEl, commander.portraitAssetId);
    }
    if (cutinImg) {
      cutinImg.alt = commander.name;
      this._ctx.assetManager.bindImageElement(cutinImg, commander.portraitAssetId);
    }
    if (ultBtn) {
      ultBtn.title = `${commander.name} · ${commander.ultimateSkill?.name || 'Ultimate'} [Space]`;
    }
    if (this._hudEls?.ultName) {
      this._hudEls.ultName.textContent = commander.ultimateSkill?.name || 'Ultimate';
    }
    if (this._hudEls?.prepPassive && commander.passiveSkill) {
      this._hudEls.prepPassive.textContent = `· ${commander.name.split(' ')[0]}: ${commander.passiveSkill.name} (${commander.passiveSkill.description})`;
    }

    const themeClass = `theme-${commander.id}`;
    for (const el of [cmdConsole, cutinEl]) {
      if (!el) continue;
      el.classList.remove(...HERO_THEME_CLASSES);
      el.classList.add(themeClass);
    }
    const fxTheme = COMMANDER_FX_THEMES[commander.id] || COMMANDER_FX_THEMES.astra;
    this._ultFxController?.setTheme(fxTheme);
  }

  _syncPrepControls() {
    if (!this._container) return;
    const swapBtn = this._container.querySelector('#btn-prep-swap-class');
    const selectedUnit = this._ctx.battleManager.getSelectedPrepUnit?.();
    if (swapBtn) {
      swapBtn.disabled = !selectedUnit;
    }
    if (this._hudEls?.prepHint) {
      if (selectedUnit) {
        const unitDef = this._ctx.dataRegistry?.unitsById?.get(selectedUnit.unitId);
        const trait = unitDef?.traitLabel ? ` · ${unitDef.traitLabel}` : '';
        this._hudEls.prepHint.textContent = `Selected: ${selectedUnit.name} (${unitDef?.role || selectedUnit.unitClass}${trait}) — Click Ally Zone to reposition or press Swap Class.`;
      } else {
        this._hudEls.prepHint.textContent =
          'Click friendly units on the left to reposition or swap class, then press Start Battle [Enter].';
      }
    }
  }

  _setTextIfChanged(key, el, nextText) {
    if (!el || this._hudCache[key] === nextText) return;
    this._hudCache[key] = nextText;
    el.textContent = nextText;
  }

  _setStyleVar(el, name, value) {
    if (!el?.style) return;
    if (typeof el.style.setProperty === 'function') {
      el.style.setProperty(name, value);
    } else {
      el.style[name] = value;
    }
  }

  _clearUltimateBarFx() {
    if (this._ultPulseTimer) {
      clearTimeout(this._ultPulseTimer);
      this._ultPulseTimer = null;
    }
    if (this._ultCompleteTimer) {
      clearTimeout(this._ultCompleteTimer);
      this._ultCompleteTimer = null;
    }
    this._lastUltPulseMs = 0;
    const wrap = this._hudEls?.ultBarWrap;
    if (wrap) {
      wrap.classList?.remove('is-ult-charging', 'is-ult-just-full', 'is-ult-ready', 'is-ult-full', 'has-ult-energy');
      wrap.setAttribute?.('data-ult-tier', 'empty');
      this._setStyleVar(wrap, '--ult-pct', '0%');
      this._setStyleVar(wrap, '--ult-ratio', '0');
    }
  }

  _triggerUltChargeFeedback(wrap, { isMajorGain = false } = {}) {
    if (!wrap) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isActive = wrap.classList?.contains('is-ult-charging');
    const minInterval = isMajorGain ? 90 : 240;
    if (isActive && now - this._lastUltPulseMs < minInterval) {
      return;
    }
    this._lastUltPulseMs = now;
    if (this._ultPulseTimer) {
      clearTimeout(this._ultPulseTimer);
      this._ultPulseTimer = null;
    }
    wrap.classList?.remove('is-ult-charging');
    void wrap.offsetWidth;
    wrap.classList?.add('is-ult-charging');
    this._ultPulseTimer = setTimeout(() => {
      this._ultPulseTimer = null;
      wrap.classList?.remove('is-ult-charging');
    }, 440);
  }

  _triggerUltCompleteFeedback(wrap) {
    if (!wrap) return;
    if (this._ultPulseTimer) {
      clearTimeout(this._ultPulseTimer);
      this._ultPulseTimer = null;
    }
    wrap.classList?.remove('is-ult-charging');
    if (this._ultCompleteTimer) {
      clearTimeout(this._ultCompleteTimer);
      this._ultCompleteTimer = null;
    }
    wrap.classList?.remove('is-ult-just-full');
    void wrap.offsetWidth;
    wrap.classList?.add('is-ult-just-full');
    this._ultCompleteTimer = setTimeout(() => {
      this._ultCompleteTimer = null;
      wrap.classList?.remove('is-ult-just-full');
    }, 760);
  }

  _syncHud() {
    if (!this._container || !this._hudEls) return;
    const b = this._ctx.gameState.battle;
    const phase = b.phase;
    const h = this._hudEls;

    if (h.stageBtn && b.stageId && !b.isTutorial && this._hudCache.stageId !== b.stageId) {
      const stageDef = this._ctx.dataRegistry?.stagesById?.get?.(b.stageId) || null;
      if (stageDef) {
        this._updateStageIndicator(h.stageBtn, stageDef);
        this._hudCache.stageId = b.stageId;
      }
    }

    this._setTextIfChanged('waveInd', h.waveInd, `Wave ${b.waveIndex} / ${b.totalWaves}`);

    const waveLabelText =
      phase === BATTLE_PHASES.PREPARATION
        ? 'Preparation'
        : b.isBossWave
          ? `Boss · ${b.waveLabel || 'Boss Wave'}`
          : b.waveLabel || `Wave ${b.waveIndex}`;
    this._setTextIfChanged('waveLbl', h.waveLbl, waveLabelText);

    if (h.tacticWrap && h.tacticLbl) {
      if (b.activeTactic && b.activeTactic.remaining > 0) {
        h.tacticWrap.hidden = false;
        this._setTextIfChanged(
          'tacticLbl',
          h.tacticLbl,
          `${b.activeTactic.name} (${b.activeTactic.remaining.toFixed(1)}s)`,
        );
      } else if (!h.tacticWrap.hidden) {
        h.tacticWrap.hidden = true;
      }
    }

    this._setTextIfChanged('allyCount', h.allyCount, `${b.friendlyCount} / ${b.friendlyCap}`);
    this._setTextIfChanged('enemyCount', h.enemyCount, `${b.enemyCount} / ${b.enemyCap}`);
    this._setTextIfChanged('timer', h.timerEl, formatTimer(b.elapsedSec));

    const energyNow = Math.floor(b.energy ?? 0);
    const energyMax = b.maxEnergy ?? 100;
    const prevEnergy = this._hudCache.energyNow;
    if (prevEnergy !== energyNow) {
      if (typeof prevEnergy === 'number' && energyNow <= prevEnergy - 4 && h.energyLabel) {
        h.energyLabel.classList.remove('is-energy-spent');
        void h.energyLabel.offsetWidth;
        h.energyLabel.classList.add('is-energy-spent');
      }
      this._hudCache.energyNow = energyNow;
      if (h.energyLabel) h.energyLabel.textContent = `${energyNow} / ${energyMax}`;
      if (h.energyBar) h.energyBar.style.width = `${(energyNow / Math.max(1, energyMax)) * 100}%`;
    }

    const deckCount = this._ctx.cardSystem?.getDeckSize?.() ?? 6;
    const refillSec = this._ctx.cardSystem?.getRefillIntervalSec?.() ?? 5;
    this._setTextIfChanged('deckRem', h.deckRem, `${deckCount}-Card Pool · ${refillSec}s Refill`);

    const ultMax = Math.max(1, b.ultimateMaxEnergy || 100);
    const ultRaw = Math.max(0, b.ultimateEnergy || 0);
    const ultRatio = Math.max(0, Math.min(1, ultRaw / ultMax));
    const ultPctNum = Math.min(100, Math.floor(ultRatio * 100));
    const ultReady =
      ultRaw >= ultMax &&
      (phase === BATTLE_PHASES.ACTIVE_COMBAT || phase === BATTLE_PHASES.WAVE_TRANSITION);
    const prevUltRaw = this._hudCache.ultRaw;
    const prevUltVal = this._hudCache.ultVal;
    const prevUltReady = this._hudCache.ultReady;
    const ultChanged =
      prevUltRaw !== ultRaw || prevUltVal !== ultPctNum || prevUltReady !== ultReady;

    if (ultChanged) {
      const gainedEnergy = typeof prevUltRaw === 'number' && ultRaw > prevUltRaw + 0.01;
      const spentOrReset = typeof prevUltRaw === 'number' && ultRaw < prevUltRaw - 0.01;
      const justBecameReady = ultReady && !prevUltReady;
      const gainDelta = gainedEnergy ? ultRaw - prevUltRaw : 0;

      this._hudCache.ultRaw = ultRaw;
      this._hudCache.ultVal = ultPctNum;
      this._hudCache.ultReady = ultReady;

      const hasEnergy = ultRatio > 0.001;
      const isFull = ultPctNum >= 100;
      const ultTier = !hasEnergy
        ? 'empty'
        : isFull
          ? 'full'
          : ultPctNum >= 75
            ? 'high'
            : ultPctNum >= 40
              ? 'mid'
              : 'low';

      if (h.ultBar) h.ultBar.style.width = `${ultPctNum}%`;
      if (h.ultBarWrap) {
        this._setStyleVar(h.ultBarWrap, '--ult-pct', `${ultPctNum}%`);
        this._setStyleVar(h.ultBarWrap, '--ult-ratio', ultRatio.toFixed(4));
        h.ultBarWrap.setAttribute?.('data-ult-tier', ultTier);
        h.ultBarWrap.classList?.toggle('has-ult-energy', hasEnergy);
        h.ultBarWrap.classList?.toggle('is-ult-full', isFull);
        h.ultBarWrap.classList?.toggle('is-ult-ready', ultReady);

        if (spentOrReset || !hasEnergy) {
          if (this._ultPulseTimer) {
            clearTimeout(this._ultPulseTimer);
            this._ultPulseTimer = null;
          }
          if (this._ultCompleteTimer) {
            clearTimeout(this._ultCompleteTimer);
            this._ultCompleteTimer = null;
          }
          h.ultBarWrap.classList?.remove('is-ult-charging', 'is-ult-just-full');
        } else if (justBecameReady) {
          this._triggerUltCompleteFeedback(h.ultBarWrap);
        } else if (gainedEnergy && !ultReady) {
          this._triggerUltChargeFeedback(h.ultBarWrap, { isMajorGain: gainDelta >= 8 });
        } else if (!ultReady && this._ultCompleteTimer) {
          clearTimeout(this._ultCompleteTimer);
          this._ultCompleteTimer = null;
          h.ultBarWrap.classList?.remove('is-ult-just-full');
        }
      }

      if (h.ultPct) {
        h.ultPct.textContent = ultReady ? 'READY [SPC]' : `${ultPctNum}%`;
      }
      if (h.ultBtn) {
        h.ultBtn.disabled = !ultReady;
        h.ultBtn.classList.toggle('is-ult-ready', ultReady);
        h.ultBtn.setAttribute('data-ult-ready', String(ultReady));
        const cmd = this._ctx.heroSystem.getActiveCommander();
        const ultName = cmd?.ultimateSkill?.name || 'Ultimate';
        h.ultBtn.setAttribute(
          'aria-label',
          ultReady
            ? `Release ${cmd?.name || 'Commander'} Ultimate: ${ultName}`
            : `${cmd?.name || 'Commander'} Ultimate charging (${ultPctNum}%)`,
        );
      }
      if (h.cmdConsole) {
        h.cmdConsole.classList.toggle('is-ult-ready', ultReady);
        h.cmdConsole.setAttribute('data-ult-ready', String(ultReady));
      }
      if (ultReady) {
        const cmd = this._ctx.heroSystem.getActiveCommander();
        const fxTheme = COMMANDER_FX_THEMES[cmd?.id] || COMMANDER_FX_THEMES.astra;
        this._ultFxController?.setTheme(fxTheme);
        this._ultFxController?.start();
      } else {
        this._ultFxController?.stop();
      }
    }

    const canPause =
      phase === BATTLE_PHASES.ACTIVE_COMBAT ||
      phase === BATTLE_PHASES.WAVE_TRANSITION ||
      phase === BATTLE_PHASES.BATTLE_START;
    if (h.pauseBtn) {
      h.pauseBtn.disabled = !canPause;
      this._setTextIfChanged('pauseText', h.pauseBtn, b.status === 'paused' ? 'Resume' : 'Pause');
    }
    this._setTextIfChanged('speedText', h.speedBtn, `${b.speedMultiplier}x`);

    if (h.prepBar) {
      h.prepBar.hidden = phase !== BATTLE_PHASES.PREPARATION;
    }

    if (h.bossBar) {
      if (b.bossInfo && b.bossInfo.hp > 0) {
        h.bossBar.hidden = false;
        h.bossBar.classList.toggle('is-casting', Boolean(b.bossInfo.castingName));
        this._setTextIfChanged('bossName', h.bossName, `BOSS · ${b.bossInfo.name}`);
        if (h.bossCast) {
          h.bossCast.hidden = !b.bossInfo.castingName;
          if (b.bossInfo.castingName) {
            this._setTextIfChanged('bossCast', h.bossCast, `Casting: ${b.bossInfo.castingName}`);
          }
        }
        const shdText = b.bossInfo.shield > 0 ? ` (+${b.bossInfo.shield} SHD)` : '';
        this._setTextIfChanged('bossHp', h.bossHp, `${b.bossInfo.hp} / ${b.bossInfo.maxHp}${shdText}`);
        if (h.bossFill) {
          const pct = Math.max(0, Math.min(100, (b.bossInfo.hp / Math.max(1, b.bossInfo.maxHp)) * 100));
          h.bossFill.style.width = `${pct}%`;
        }
        if (h.bossShield) {
          const shdPct = Math.max(
            0,
            Math.min(100, ((b.bossInfo.shield || 0) / Math.max(1, b.bossInfo.maxHp)) * 100),
          );
          h.bossShield.style.width = `${shdPct}%`;
        }
      } else if (!h.bossBar.hidden) {
        h.bossBar.hidden = true;
      }
    }

    if (h.bannerEl) {
      const showBanner =
        Boolean(b.bannerText) &&
        phase !== BATTLE_PHASES.PREPARATION &&
        phase !== BATTLE_PHASES.RESULTS;
      h.bannerEl.hidden = !showBanner;
      h.bannerEl.style.top = b.bossInfo && b.bossInfo.hp > 0 ? '114px' : '62px';
      if (showBanner && this._hudCache.bannerText !== b.bannerText) {
        this._hudCache.bannerText = b.bannerText;
        h.bannerEl.textContent = b.bannerText;
        const isBoss = /boss|warning/i.test(b.bannerText);
        h.bannerEl.classList.toggle('is-boss-banner', isBoss);
      }
    }

    if (
      phase === BATTLE_PHASES.RESULTS &&
      b.results &&
      this._resultsShownSessionId !== b.results.sessionId
    ) {
      this._scheduleResultsReveal(b.results);
    }
  }

  _syncRefillIndicators() {
    if (!this._container || this._slotNodes.length !== 6) return;
    const { cardSystem } = this._ctx;
    const slots = cardSystem.getSlots();

    for (let idx = 0; idx < 6; idx += 1) {
      if (slots[idx]) continue;
      const node = this._slotNodes[idx];
      const refill = cardSystem.getRefillState(idx);
      node.root.classList.toggle('is-refilling', refill.active);
      if (node.refillWrap) node.refillWrap.hidden = !refill.active;
      if (node.body) node.body.hidden = refill.active;
      if (refill.active) {
        if (node.refillTime) node.refillTime.textContent = `${refill.remainingSec.toFixed(1)}s`;
        if (node.refillFill) node.refillFill.style.width = `${Math.round(refill.progress * 100)}%`;
        node.root.title = `Slot ${idx + 1} refilling (${refill.remainingSec.toFixed(1)}s remaining)`;
      }
    }
  }

  _renderCardSlots() {
    if (!this._container || this._slotNodes.length !== 6) return;
    this._lastCardRenderMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const { cardSystem, gameState, assetManager, audioManager } = this._ctx;
    const slots = cardSystem.getSlots();
    const b = gameState.battle;
    const selected = b.selectedCardSlot;
    const currentEnergy = Math.floor(b.energy ?? 0);
    const inCombat =
      b.phase === BATTLE_PHASES.ACTIVE_COMBAT || b.phase === BATTLE_PHASES.WAVE_TRANSITION;

    // Precompute all eligible merge pairs across any slot positions so players spot all merge opportunities
    const passiveMergeSlots = inCombat ? cardSystem.getMergeableSlotIndices() : new Set();
    const selectedMergePartners =
      inCombat && selected !== -1 ? new Set(cardSystem.getMergePartners(selected)) : new Set();
    const hasSelectedMergePartners = selectedMergePartners.size > 0;

    let drewNewCard = false;
    let hasMergeOption = false;

    for (let idx = 0; idx < 6; idx += 1) {
      const slot = slots[idx];
      const node = this._slotNodes[idx];
      const meta = this._slotMeta[idx];

      if (!slot) {
        const refill = cardSystem.getRefillState(idx);
        if (node.mergeBadge) {
          node.mergeBadge.hidden = true;
          node.mergeBadge.textContent = '';
          node.mergeBadge.className = 'tactical-card__merge-badge';
        }
        if (!meta.isEmpty) {
          const keepEmptyAnim = node.root.classList.contains('is-merge-departed')
            ? ' is-merge-departed'
            : '';
          node.root.className = `tactical-card tactical-card--empty${keepEmptyAnim}`;
          node.top.hidden = true;
          node.art.hidden = true;
          node.cdWrap.hidden = true;
          node.cdWrap.style.removeProperty('--cd-pct');
          if (node.cdText) node.cdText.textContent = '';
          node.name.textContent = 'Empty';
          node.name.className = 'tactical-card__empty-label';
          node.hint.textContent = 'Refilling...';
          meta.instanceId = null;
          meta.tier = 0;
          meta.artAssetId = null;
          meta.isEmpty = true;
        }
        node.root.classList.toggle('is-refilling', refill.active);
        if (node.refillWrap) node.refillWrap.hidden = !refill.active;
        if (node.body) node.body.hidden = refill.active;
        if (refill.active) {
          if (node.refillTime) node.refillTime.textContent = `${refill.remainingSec.toFixed(1)}s`;
          if (node.refillFill) node.refillFill.style.width = `${Math.round(refill.progress * 100)}%`;
          node.root.title = `Slot ${idx + 1} refilling (${refill.remainingSec.toFixed(1)}s remaining)`;
        } else {
          node.root.title = 'Empty tactical slot';
          node.hint.textContent = 'Waiting';
        }
        continue;
      }

      if (node.refillWrap && !node.refillWrap.hidden) {
        node.refillWrap.hidden = true;
      }
      if (node.body && node.body.hidden) {
        node.body.hidden = false;
      }

      const instanceChanged = meta.instanceId !== slot.instanceId;
      const isMergedHere = instanceChanged && this._pendingMergeSlot === idx;
      const isDrawnHere = instanceChanged && !isMergedHere && !this._isInitialHandSync;

      const isSelected = inCombat && selected === idx;
      const canMergeTarget = inCombat && selectedMergePartners.has(idx);
      const isMergeSource = isSelected && hasSelectedMergePartners;
      const isPassiveMergeReady = inCombat && selected === -1 && passiveMergeSlots.has(idx);
      const isMergeUnrelated =
        inCombat && hasSelectedMergePartners && !isSelected && !canMergeTarget;
      if (canMergeTarget) hasMergeOption = true;

      const cooldown = cardSystem.getCardCooldown(slot.cardId);
      const onCooldown = cooldown > 0.05;
      const affordable = currentEnergy >= slot.cost;
      const capped = slot.category === 'unit' && b.friendlyCount >= b.friendlyCap;
      const usable = inCombat && !onCooldown && affordable && !capped;
      const rarityLower = (slot.rarity || 'R').toLowerCase();

      const keepAnim = [];
      if (node.root.classList.contains('is-newly-drawn')) keepAnim.push('is-newly-drawn');
      if (node.root.classList.contains('is-just-merged')) keepAnim.push('is-just-merged');
      if (node.root.classList.contains('is-merge-tier-2')) keepAnim.push('is-merge-tier-2');
      if (node.root.classList.contains('is-merge-tier-3')) keepAnim.push('is-merge-tier-3');
      if (node.root.classList.contains('is-invalid-shake')) keepAnim.push('is-invalid-shake');

      node.root.className = [
        'tactical-card',
        `tactical-card--${slot.category}`,
        `tactical-card--${rarityLower}`,
        isSelected ? 'is-selected' : '',
        isMergeSource ? 'is-merge-source' : '',
        canMergeTarget ? 'is-merge-target' : '',
        isPassiveMergeReady ? 'is-merge-ready' : '',
        isMergeUnrelated ? 'is-merge-unrelated' : '',
        slot.tier > 1 ? 'is-upgraded' : '',
        slot.tier >= 3 ? 'is-max-tier' : '',
        !usable && !canMergeTarget && !isPassiveMergeReady && !isMergeSource ? 'is-unusable' : '',
        ...keepAnim,
      ]
        .filter(Boolean)
        .join(' ');

      if (node.mergeBadge) {
        if (canMergeTarget || isPassiveMergeReady) {
          const nextRoman = slot.tier + 1 === 3 ? 'III' : 'II';
          node.mergeBadge.textContent = `Merge → ${nextRoman}`;
          node.mergeBadge.className = `tactical-card__merge-badge ${
            canMergeTarget ? 'is-target' : 'is-ready'
          }`;
          node.mergeBadge.hidden = false;
        } else {
          node.mergeBadge.hidden = true;
          node.mergeBadge.textContent = '';
          node.mergeBadge.className = 'tactical-card__merge-badge';
        }
      }

      node.top.hidden = false;
      node.art.hidden = false;
      node.name.className = 'tactical-card__name';

      node.cost.textContent = `${slot.cost}`;
      node.cost.className = `tactical-card__cost tabular-nums ${!affordable && inCombat ? 'is-short' : ''}`;
      node.category.textContent = `${slot.rarity || 'R'} · ${CATEGORY_LABELS[slot.category] || 'Card'}`;
      node.category.className = `tactical-card__category rarity-${rarityLower}`;
      node.tier.textContent = slot.levelLabel;
      node.name.textContent = slot.name;

      let hint = '';
      if (!inCombat) {
        hint = b.phase === BATTLE_PHASES.PREPARATION ? 'Combat ready' : 'Ended';
      } else if (canMergeTarget || isPassiveMergeReady) {
        const nextRoman = slot.tier + 1 === 3 ? 'III' : 'II';
        hint = `Merge → ${nextRoman}`;
      } else if (isSelected) {
        if (onCooldown) hint = `CD ${cooldown.toFixed(1)}s`;
        else if (capped) hint = `Cap ${b.friendlyCap}/${b.friendlyCap}`;
        else if (!affordable) hint = `Need ${slot.cost}E`;
        else hint = slot.category === 'unit' ? 'Deploy Ally' : 'Cast / Click';
      } else if (onCooldown) {
        hint = `CD ${cooldown.toFixed(1)}s`;
      } else if (capped) {
        hint = `Cap ${b.friendlyCap}/${b.friendlyCap}`;
      } else if (!affordable) {
        hint = `Need ${slot.cost}E`;
      } else {
        hint = CATEGORY_LABELS[slot.category] || 'Ready';
      }
      node.hint.textContent = hint;

      if (instanceChanged || meta.isEmpty) {
        const tooltipParts = [
          `${slot.name} (${slot.levelLabel} · ${slot.rarity || 'R'} ${CATEGORY_LABELS[slot.category] || 'Card'})`,
          `Cost: ${slot.cost} Energy · Cooldown: ${slot.cooldownSec}s`,
        ];
        if (slot.description) tooltipParts.push(slot.description);
        if (slot.upgradeSummary) tooltipParts.push(`Merge Scaling: ${slot.upgradeSummary}`);
        node.root.title = tooltipParts.join('\n');

        // Display full unit character art on unit cards, framed sigil art on skills/tactics/supports
        const unitDef =
          slot.category === 'unit' && slot.unitId
            ? this._ctx.dataRegistry?.unitsById?.get(slot.unitId)
            : null;
        const resolvedArtId = unitDef?.spriteAssetId || slot.iconAssetId;
        const isUnitArt = Boolean(unitDef?.spriteAssetId);

        if (meta.artAssetId !== resolvedArtId || meta.isEmpty) {
          node.img.alt = slot.name;
          node.img.className = `tactical-card__img ${isUnitArt ? 'is-unit-art' : 'is-emblem-art'}`;
          assetManager.bindImageElement(node.img, resolvedArtId);
          meta.artAssetId = resolvedArtId;
        }
      }

      if (onCooldown) {
        const cdPct = Math.min(100, Math.max(0, (cooldown / Math.max(0.5, slot.cooldownSec || 2.5)) * 100));
        node.cdWrap.hidden = false;
        node.cdWrap.style.setProperty('--cd-pct', `${cdPct}%`);
        if (node.cdText) node.cdText.textContent = `${cooldown.toFixed(1)}s`;
      } else if (!node.cdWrap.hidden) {
        node.cdWrap.hidden = true;
        node.cdWrap.style.removeProperty('--cd-pct');
        if (node.cdText) node.cdText.textContent = '';
      }

      meta.instanceId = slot.instanceId;
      meta.tier = slot.tier;
      meta.isEmpty = false;

      if (isMergedHere) {
        if (!node.root.classList.contains('is-just-merged')) {
          const mergeTier = slot.tier >= 3 ? 3 : 2;
          this._triggerSlotAnimation(idx, 'is-just-merged', mergeTier === 3 ? 620 : 520, [
            `is-merge-tier-${mergeTier}`,
          ]);
        }
      } else if (isDrawnHere) {
        this._triggerSlotAnimation(idx, 'is-newly-drawn', 260);
        drewNewCard = true;
      }
    }

    // Update contextual hint in left dock core
    if (this._hudEls?.handHint) {
      const nextHint = !inCombat
        ? 'Start battle to play cards'
        : hasMergeOption
          ? 'Click glowing match to merge!'
          : selected !== -1
            ? 'Click again to play · Esc cancels'
            : passiveMergeSlots.size > 0
              ? 'Matching merge pair ready!'
              : 'Keys 1-6 · Merge matching';
      this._setTextIfChanged('handHint', this._hudEls.handHint, nextHint);
    }

    this._syncCardPreview();

    this._pendingMergeSlot = -1;
    if (drewNewCard) {
      audioManager?.playCardDraw?.();
    }
  }

  _syncCardPreview() {
    const h = this._hudEls;
    if (!h?.previewStrip) return;
    const b = this._ctx.gameState.battle;
    const slots = this._ctx.cardSystem.getSlots();
    const activeIdx = this._hoveredCardSlot >= 0 ? this._hoveredCardSlot : b.selectedCardSlot;
    const card = activeIdx >= 0 ? slots[activeIdx] : null;

    if (!card || b.phase === BATTLE_PHASES.RESULTS) {
      h.previewStrip.hidden = true;
      return;
    }

    h.previewStrip.hidden = false;
    h.previewTitle.textContent = `${card.name} (${card.levelLabel} · ${card.cost}E)`;
    h.previewDesc.textContent = card.description || CATEGORY_LABELS[card.category] || 'Tactical instruction';
    h.previewUpgrade.textContent = card.upgradeSummary ? `Merge: ${card.upgradeSummary}` : '';
  }

  _scheduleResultsReveal(results) {
    if (!this._container || !results) return;
    if (this._resultsShownSessionId === results.sessionId) return;
    this._resultsShownSessionId = results.sessionId;

    const splash = this._hudEls?.outcomeSplash || this._container.querySelector('#battle-outcome-splash');
    if (this._resultsRevealTimer) {
      clearTimeout(this._resultsRevealTimer);
      this._resultsRevealTimer = null;
    }

    if (splash) {
      splash.hidden = false;
      splash.className = `battle-outcome-splash ${results.victory ? 'is-victory' : 'is-defeat'}`;
      const kickerText = results.isTutorial
        ? 'Tutorial Complete · Proving Grounds'
        : `Stage ${results.stageCode} · ${results.stageName}`;
      splash.innerHTML = `
        <div class="battle-outcome-splash__band">
          <div class="battle-outcome-splash__kicker">${kickerText}</div>
          <div class="battle-outcome-splash__title">${results.victory ? 'VICTORY' : 'DEFEAT'}</div>
        </div>
      `;
      this._resultsRevealTimer = setTimeout(() => {
        splash.hidden = true;
        this._renderResultsOverlay(results);
      }, 650);
    } else {
      this._renderResultsOverlay(results);
    }
  }

  _renderResultsOverlay(results) {
    if (!this._container || !results) return;
    const overlay = this._container.querySelector('#battle-results-overlay');
    if (!overlay) return;

    const commander = this._ctx.heroSystem.getActiveCommander();
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const r = results.rewards || {};
    const hasNewUnlock =
      (Array.isArray(r.bonusUnits) && r.bonusUnits.length > 0) ||
      (Array.isArray(r.bonusCards) && r.bonusCards.length > 0);
    const materialItems = (r.materials || [])
      .map((m) => `<span>${m.name} ×${m.quantity}</span>`)
      .join('<span class="meta-sep">·</span>');
    const bonusUnitItems = (r.bonusUnits || [])
      .map((uid) => {
        const unitDef = this._ctx.dataRegistry.unitsById.get(uid);
        return `<span>Unlocked Unit: ${unitDef?.name || uid}</span>`;
      })
      .join('<span class="meta-sep">·</span>');
    const bonusCardItems = (r.bonusCards || [])
      .map((cid) => {
        const cardDef = this._ctx.dataRegistry.cardsById.get(cid);
        return `<span>Unlocked Card: ${cardDef?.name || cid}</span>`;
      })
      .join('<span class="meta-sep">·</span>');

    const defeatTip = !results.victory
      ? results.ultimatesUsed === 0
        ? 'Tip: Trigger your Commander Ultimate [Space] once charged to swing critical waves.'
        : 'Tip: Merge any two matching identical cards to Lv.II–III for major power spikes, or upgrade units in Formation.'
      : '';

    const isTutorial = Boolean(results.isTutorial);
    const rewardsSectionMarkup = isTutorial
      ? `
          <div class="tutorial-completion-banner">
            <div class="section-kicker section-kicker--gold">Basic Battle Controls Covered</div>
            <p class="tutorial-completion-banner__text">
              ${
                results.victory
                  ? 'You have mastered battlefield layout, unit deployment, automatic combat, Command Energy, Skill/Tactic/Support cards, Commander Ultimates, and victory conditions.'
                  : 'The tutorial battle ended early before victory was achieved. Retry the tutorial to complete your briefing.'
              }
            </p>
          </div>
        `
      : `
          <div class="results-rewards">
            <div class="section-kicker section-kicker--gold">Battle Rewards</div>
            <div class="meta-line tabular-nums" style="color: var(--text-primary); font-size: 0.88rem;">
              <span>+${formatNumber(r.credits || 0)} Credits</span>
              ${r.astrite > 0 ? `<span class="meta-sep">·</span><span style="color: var(--accent-gold-bright); font-weight: 700;">+${formatNumber(r.astrite)} Astrite</span>` : ''}
              <span class="meta-sep">·</span>
              <span>+${formatNumber(r.playerXp || 0)} Cmdr XP</span>
              <span class="meta-sep">·</span>
              <span>+${formatNumber(r.heroXp || 0)} Hero XP</span>
              ${r.unitXp > 0 ? `<span class="meta-sep">·</span><span>+${formatNumber(r.unitXp)} Unit XP</span>` : ''}
            </div>
            ${materialItems ? `<div class="meta-line">${materialItems}</div>` : ''}
            ${bonusUnitItems ? `<div class="meta-line" style="color: var(--accent-gold-bright); font-weight: 600;">${bonusUnitItems}</div>` : ''}
            ${bonusCardItems ? `<div class="meta-line" style="color: var(--accent-blue-bright); font-weight: 600;">${bonusCardItems}</div>` : ''}
          </div>
        `;

    const actionButtonsMarkup = isTutorial
      ? `
          <button type="button" id="btn-results-home" class="btn btn-ghost">Return Home</button>
          <button type="button" id="btn-tutorial-replay" class="btn btn-secondary">${
            results.victory ? 'Replay Tutorial' : 'Retry Tutorial'
          }</button>
          ${
            results.victory
              ? '<button type="button" id="btn-tutorial-campaign" class="btn btn-gold">Enter Normal Battle</button>'
              : ''
          }
        `
      : `
          <button type="button" id="btn-results-home" class="btn btn-ghost">Home</button>
          ${
            !results.victory
              ? '<button type="button" id="btn-results-formation" class="btn btn-secondary">Upgrade Squad</button>'
              : hasNewUnlock
                ? '<button type="button" id="btn-results-formation" class="btn btn-secondary">Equip Unlock</button>'
                : ''
          }
          <button type="button" id="btn-results-retry" class="btn btn-secondary">Retry Stage</button>
          ${
            results.nextStageId
              ? '<button type="button" id="btn-results-next" class="btn btn-gold">Next Stage</button>'
              : ''
          }
        `;

    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="results-modal ${results.victory ? 'is-victory' : 'is-defeat'} ${themeClass}" role="dialog" aria-modal="true" aria-labelledby="results-heading">
        <div class="results-visual-col">
          <img id="results-commander-bg" class="results-visual-col__bg" alt="${commander?.name || 'Commander'}" />
          <div class="results-visual-col__inner">
            <div>
              <div class="section-kicker ${results.victory ? 'section-kicker--gold' : ''}">
                ${isTutorial ? 'First-Battle Tutorial' : `Stage ${results.stageCode}`}
              </div>
              <h2 id="results-heading" class="results-outcome-title ${results.victory ? 'is-victory' : 'is-defeat'}" style="margin-top: 4px;">
                ${isTutorial && results.victory ? 'TRAINING COMPLETE' : results.victory ? 'VICTORY' : 'DEFEAT'}
              </h2>
              <div class="meta-line" style="margin-top: 6px;">
                <span>${results.stageName}</span>
              </div>
              ${
                results.isFirstClear
                  ? '<div style="margin-top: 8px; font-size: 0.78rem; color: var(--accent-gold-luminous); font-weight: 600;">First Clear Bonus Earned</div>'
                  : ''
              }
            </div>

            <div class="results-grade-box">
              <span class="results-grade-box__label">Tactical Grade</span>
              <span class="results-grade-box__val">${results.rating}</span>
            </div>
          </div>
        </div>

        <div class="results-detail-col">
          <div>
            <div class="section-kicker">Battle Summary</div>
            <div class="results-stats-grid" style="margin-top: 10px;">
              <div class="results-stat">
                <span class="results-stat__label">Duration</span>
                <span class="results-stat__value tabular-nums">${formatTimer(results.durationSec)}</span>
              </div>
              <div class="results-stat">
                <span class="results-stat__label">Enemies Defeated</span>
                <span class="results-stat__value tabular-nums">${results.enemiesDefeated}</span>
              </div>
              <div class="results-stat">
                <span class="results-stat__label">Friendly Survivors</span>
                <span class="results-stat__value tabular-nums">${results.friendlySurvivors} / ${results.totalAlliesDeployed}</span>
              </div>
              <div class="results-stat">
                <span class="results-stat__label">Damage Dealt</span>
                <span class="results-stat__value tabular-nums">${formatNumber(results.damageDealt)}</span>
              </div>
              <div class="results-stat">
                <span class="results-stat__label">Damage Received</span>
                <span class="results-stat__value tabular-nums">${formatNumber(results.damageReceived)}</span>
              </div>
              <div class="results-stat">
                <span class="results-stat__label">Healing Performed</span>
                <span class="results-stat__value tabular-nums">${formatNumber(results.healingPerformed)}</span>
              </div>
            </div>
          </div>

          ${rewardsSectionMarkup}

          ${defeatTip && !isTutorial ? `<div class="results-tip">${defeatTip}</div>` : ''}

          <div class="btn-row" style="margin-top: auto; justify-content: flex-end;">
            ${actionButtonsMarkup}
          </div>
        </div>
      </div>
    `;

    const bgImg = overlay.querySelector('#results-commander-bg');
    if (bgImg && commander) {
      this._ctx.assetManager.bindImageElement(bgImg, commander.portraitAssetId);
    }

    if (results.victory && ((r.credits || 0) > 0 || (r.astrite || 0) > 0)) {
      if (this._rewardTimer) clearTimeout(this._rewardTimer);
      this._rewardTimer = setTimeout(() => {
        this._ctx.audioManager?.playReward?.();
      }, 420);
    }

    overlay.querySelector('#btn-results-home')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      this._ctx.screenManager.navigate('home');
    });

    overlay.querySelector('#btn-tutorial-replay')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      if (this._resultsRevealTimer) {
        clearTimeout(this._resultsRevealTimer);
        this._resultsRevealTimer = null;
      }
      this._resultsShownSessionId = null;
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._ctx.screenManager.navigate('battle', { tutorial: true, replay: true });
    });

    overlay.querySelector('#btn-tutorial-campaign')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      if (this._resultsRevealTimer) {
        clearTimeout(this._resultsRevealTimer);
        this._resultsRevealTimer = null;
      }
      this._resultsShownSessionId = null;
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._ctx.screenManager.navigate('battle', { tutorial: false });
    });

    overlay.querySelector('#btn-results-formation')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      this._ctx.screenManager.navigate('formation');
    });

    overlay.querySelector('#btn-results-retry')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      if (this._resultsRevealTimer) {
        clearTimeout(this._resultsRevealTimer);
        this._resultsRevealTimer = null;
      }
      this._resultsShownSessionId = null;
      this._ultFxController?.stop();
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._hudCache = {};
      this._clearUltimateBarFx();
      this._isInitialHandSync = true;
      this._clearMergeVfx();
      this._cardPlayVfx?.stop();
      const canvas = this._container.querySelector('#battle-canvas');
      this._ctx.battleManager.startSession(canvas, {
        stageId: results.stageId,
        enforceUnlock: true,
      });
      this._renderCardSlots();
      this._isInitialHandSync = false;
      this._syncHud();
    });

    overlay.querySelector('#btn-results-next')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      if (this._resultsRevealTimer) {
        clearTimeout(this._resultsRevealTimer);
        this._resultsRevealTimer = null;
      }
      this._resultsShownSessionId = null;
      this._ctx.progressionSystem.selectStage(results.nextStageId, { explicit: true });
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._ctx.screenManager.navigate('battle', {
        stageId: results.nextStageId,
        preserveSelectedStage: true,
      });
    });
  }

  _showCutin(commander, skill) {
    if (!this._container) return;
    const overlay = this._container.querySelector('#ultimate-cutin');
    const eyebrow = this._container.querySelector('#cutin-commander');
    const title = this._container.querySelector('#cutin-skill');
    const sub = this._container.querySelector('#cutin-sub');
    const portrait = this._container.querySelector('#cutin-portrait-img');
    if (!overlay) return;

    overlay.classList.remove(...HERO_THEME_CLASSES);
    overlay.classList.add(commander?.id ? `theme-${commander.id}` : 'theme-astra');

    if (portrait && commander?.portraitAssetId) {
      portrait.alt = commander.name;
      this._ctx.assetManager.bindImageElement(portrait, commander.portraitAssetId);
    }
    if (eyebrow) {
      eyebrow.textContent = `${commander?.name || 'Commander'} · ${commander?.realm || 'Commander Ultimate'}`;
    }
    if (title) {
      title.textContent = skill?.displayNameZh
        ? `${skill.name} · ${skill.displayNameZh}`
        : skill?.name || 'Starfall Judgment';
    }
    if (sub) {
      sub.textContent = commander?.title || 'Tactical Command Engaged';
    }

    overlay.classList.add('is-visible');
    if (this._cutinTimer) clearTimeout(this._cutinTimer);
    this._cutinTimer = setTimeout(() => {
      overlay.classList.remove('is-visible');
    }, skill?.effect?.cutinDurationMs || 1350);
  }
}
