/**
 * BattleScreen (P4 Structural Redesign) — Full-viewport 100vw x 100vh Battle Theater
 * with edge-to-edge Isometric Canvas, slim translucent top HUD, unobtrusive top-center
 * Preparation strip, unified floating bottom Tactical Command Dock (Energy/Deck Core +
 * 6-Card Hand + Commander Ultimate Console), Portrait Cut-In, and 2-Column Results Modal.
 */

import { BATTLE_PHASES } from '../battle/BattleManager.js';
import { formatNumber } from '../utils/MathUtils.js';

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
    this._lastCardRenderMs = 0;
    this._hudEls = null;
    this._hudCache = {};
    this._slotNodes = [];
    this._slotMeta = [];
    this._pendingMergeSlot = -1;
    this._isInitialHandSync = true;
  }

  mount(container) {
    this._container = container;
    this._hudCache = {};
    this._slotNodes = [];
    this._slotMeta = [];
    this._pendingMergeSlot = -1;
    this._isInitialHandSync = true;

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
    } = this._ctx;
    const stage = progressionSystem.getSelectedStage();
    const commander = heroSystem.getActiveCommander();
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const isMuted = Boolean(gameState.settings?.muted);

    container.innerHTML = `
      <section class="battle-theater" aria-label="Isometric Battlefield">
        <canvas id="battle-canvas" class="battle-canvas" aria-label="Isometric tactical battlefield canvas"></canvas>

        <header class="battle-topbar" aria-label="Battle Status Bar">
          <div class="hud-pill-group hud-pill-group--left">
            <span class="hud-stage-name">Stage ${stage?.code || '1-1'} · ${stage?.name || 'Outer Bastion'}</span>
            <span class="meta-sep" aria-hidden="true">|</span>
            <span class="hud-wave-meta">
              <span id="hud-wave-indicator" class="tabular-nums">Wave 1 / ${stage?.waves?.length || 3}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span id="hud-wave-label">${stage?.waves?.[0]?.label || 'Preparation'}</span>
              <span id="hud-tactic-wrap" hidden>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span id="hud-tactic-label" class="hud-tactic-active"></span>
              </span>
            </span>
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
            <button type="button" id="btn-battle-pause" class="hud-ctrl-btn" disabled>Pause</button>
            <button type="button" id="btn-battle-speed" class="hud-ctrl-btn tabular-nums">1x</button>
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
          </div>
        </div>

        <div id="battle-banner" class="battle-banner" aria-live="polite" hidden></div>

        <div id="prep-bar" class="prep-floating-bar">
          <div class="prep-floating-bar__info">
            <span class="prep-floating-bar__title">Preparation Phase</span>
            <span class="prep-floating-bar__hint" id="prep-hint">
              Click friendly units on the left to reposition or swap class before battle begins.
            </span>
          </div>
          <div class="prep-floating-bar__actions">
            <select
              id="prep-commander-select"
              class="prep-select"
              aria-label="Select Commander for battle"
            >
              ${heroSystem
                .getOwnedHeroes()
                .map(
                  (h) => `
                    <option value="${h.id}" ${h.id === commander?.id ? 'selected' : ''}>
                      Cmdr: ${h.name}
                    </option>
                  `,
                )
                .join('')}
            </select>
            <button type="button" id="btn-prep-swap-class" class="btn btn-secondary btn-sm" disabled>
              Swap Class
            </button>
            <button type="button" id="btn-start-battle" class="btn btn-primary btn-sm">
              Start Battle
            </button>
          </div>
        </div>

        <div class="battle-command-dock" aria-label="Tactical Command Dock">
          <div class="dock-energy-core">
            <div>
              <div class="dock-energy-core__kicker">Command Energy</div>
              <div class="dock-energy-core__val tabular-nums" id="hud-energy-label">60 / 100</div>
            </div>
            <div class="progress-track">
              <div id="hud-energy-bar" class="progress-fill" style="width: 60%;"></div>
            </div>
            <div>
              <div class="dock-energy-core__sub tabular-nums" id="hud-deck-remaining">Deck: 6 left</div>
              <div class="dock-energy-core__hint" id="hand-hint-text">Select card · Merge adjacent</div>
            </div>
          </div>

          <div id="tactical-card-slots" class="card-slots-grid" role="group" aria-label="Six tactical card slots"></div>

          <aside id="commander-console" class="dock-commander-module ${themeClass}" aria-label="Commander Ultimate">
            <div class="dock-commander__head">
              <div class="dock-commander__avatar" id="commander-avatar-frame">
                <img id="battle-commander-avatar" alt="${commander?.name || 'Commander'}" />
              </div>
              <div class="dock-commander__meta">
                <div id="battle-commander-name" class="dock-commander__name">${commander?.name || 'Astra Valen'}</div>
                <div id="battle-commander-ult" class="dock-commander__ult-name">${commander?.ultimateSkill?.name || 'Starfall Judgment'}</div>
                <div id="battle-commander-passive" class="meta-line" style="font-size: 0.68rem;">${commander?.passiveSkill?.name || 'Astral Aegis'}</div>
              </div>
            </div>

            <div>
              <div class="setting-control__top" style="font-size: 0.72rem; margin-bottom: 4px;">
                <span style="color: var(--text-muted);">Ultimate</span>
                <span id="hud-ult-pct" class="tabular-nums" style="color: var(--celestial-ivory);">0 / 100</span>
              </div>
              <div class="progress-track">
                <div id="hud-ult-bar" class="progress-fill progress-fill--gold" style="width: 0%;"></div>
              </div>
            </div>

            <button type="button" id="btn-trigger-ultimate" class="btn btn-gold dock-ult-btn" disabled>
              Charging (0%)
            </button>
          </aside>
        </div>

        <div id="ultimate-cutin" class="ultimate-cutin ${themeClass}" aria-live="assertive">
          <div class="ultimate-cutin__band">
            <div class="ultimate-cutin__portrait">
              <img id="cutin-portrait-img" alt="${commander?.name || 'Commander'}" />
            </div>
            <div class="ultimate-cutin__content">
              <div id="cutin-commander" class="ultimate-cutin__eyebrow">COMMANDER ULTIMATE</div>
              <div id="cutin-skill" class="ultimate-cutin__title">Starfall Judgment</div>
              <div id="cutin-sub" class="ultimate-cutin__sub">Orbital Command Override Engaged</div>
            </div>
          </div>
        </div>

        <div id="battle-results-overlay" class="battle-results-overlay" hidden></div>
      </section>
    `;

    this._cacheHudRefs();
    this._initCardSlotElements();

    const avatarEl = container.querySelector('#battle-commander-avatar');
    const cutinPortraitEl = container.querySelector('#cutin-portrait-img');
    if (commander) {
      if (avatarEl) assetManager.bindImageElement(avatarEl, commander.portraitAssetId);
      if (cutinPortraitEl) assetManager.bindImageElement(cutinPortraitEl, commander.portraitAssetId);
    }

    const canvas = container.querySelector('#battle-canvas');
    battleManager.startSession(canvas);

    this._renderCardSlots();
    this._isInitialHandSync = false;
    this._syncHud();

    canvas?.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const selectedBefore = this._ctx.gameState.battle.selectedCardSlot;
      const res = battleManager.handleCanvasPointer(sx, sy);
      if (res?.action === 'prep_moved' && !res.ok && res.reason) {
        this._ctx.audioManager?.playInvalid?.();
        this._ctx.notify(res.reason, 'warn');
      } else if (res?.action === 'played' && !res.ok && res.reason) {
        if (selectedBefore >= 0) this._triggerInvalidSlot(selectedBefore);
        this._ctx.notify(res.reason, 'warn');
      }
      this._syncPrepControls();
    });

    container.querySelector('#btn-start-battle')?.addEventListener('click', () => {
      battleManager.beginBattle();
      this._syncHud();
      this._renderCardSlots();
    });

    container.querySelector('#prep-commander-select')?.addEventListener('change', (ev) => {
      const res = battleManager.setPrepCommander(ev.target.value);
      if (res.ok) {
        const nextCmd = heroSystem.getActiveCommander();
        this._refreshCommanderConsole(nextCmd);
        this._ctx.notify(`Commander switched to ${nextCmd?.name || ev.target.value}.`);
      } else if (res.reason) {
        this._ctx.notify(res.reason, 'warn');
      }
      this._syncPrepControls();
    });

    container.querySelector('#btn-prep-swap-class')?.addEventListener('click', () => {
      const uid = battleManager.getSelectedPrepUnitUid();
      if (!uid) return;
      const res = battleManager.cyclePrepUnitClass(uid);
      if (res.ok && res.unit) {
        this._ctx.notify(`Unit switched to ${res.unit.name}.`);
      }
      this._syncPrepControls();
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
      saveManager?.save(gameState.getPersistent());
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

    this._resizeHandler = () => battleManager.handleResize();
    window.addEventListener('resize', this._resizeHandler);

    // Hidden developer debug toggle via Shift+D (never shown in normal UI)
    this._keyHandler = (ev) => {
      if (ev.shiftKey && ev.code === 'KeyD') {
        battleManager.toggleDebugMode();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    this._unsubs.push(
      eventBus.on('state:changed', () => this._syncMuteBtn()),
      eventBus.on('battle:stateChanged', () => {
        this._syncHud();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this._lastCardRenderMs > 110) {
          this._renderCardSlots();
        }
      }),
      eventBus.on('cards:merged', ({ targetIndex, upgradedCard }) => {
        this._pendingMergeSlot = typeof targetIndex === 'number' ? targetIndex : -1;
        this._ctx.notify(
          `Merged into ${upgradedCard.name} (${upgradedCard.levelLabel})`,
          'success',
        );
      }),
      eventBus.on('cards:updated', () => this._renderCardSlots()),
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
        this._renderResultsOverlay(results);
      }),
    );
  }

  unmount() {
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
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._hudEls = null;
    this._slotNodes = [];
    this._slotMeta = [];
    this._container = null;
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
      ultPct: q('#hud-ult-pct'),
      ultBar: q('#hud-ult-bar'),
      ultBtn: q('#btn-trigger-ultimate'),
      cmdConsole: q('#commander-console'),
      pauseBtn: q('#btn-battle-pause'),
      speedBtn: q('#btn-battle-speed'),
      muteBtn: q('#btn-battle-mute'),
      prepBar: q('#prep-bar'),
      bannerEl: q('#battle-banner'),
      bossBar: q('#boss-hud-bar'),
      bossName: q('#boss-hud-name'),
      bossCast: q('#boss-hud-cast'),
      bossHp: q('#boss-hud-hp'),
      bossFill: q('#boss-hud-fill'),
      resultsOverlay: q('#battle-results-overlay'),
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
        <div class="tactical-card__top">
          <span class="tactical-card__cost tabular-nums"></span>
          <span class="tactical-card__category"></span>
          <span class="tactical-card__tier tabular-nums"></span>
        </div>
        <div class="tactical-card__art">
          <img alt="" />
        </div>
        <div class="tactical-card__body">
          <div class="tactical-card__name"></div>
          <div class="tactical-card__hint"></div>
        </div>
        <div class="tactical-card__cooldown" hidden>
          <span class="tabular-nums"></span>
        </div>
      `;

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
        img: btn.querySelector('img'),
        name: btn.querySelector('.tactical-card__name'),
        hint: btn.querySelector('.tactical-card__hint'),
        cdWrap: btn.querySelector('.tactical-card__cooldown'),
        cdText: btn.querySelector('.tactical-card__cooldown span'),
      });
      this._slotMeta.push({
        instanceId: null,
        tier: 0,
        iconAssetId: null,
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

  _triggerSlotAnimation(slotIndex, className, durationMs) {
    const node = this._slotNodes[slotIndex];
    if (!node) return;
    node.root.classList.remove('is-newly-drawn', 'is-just-merged');
    void node.root.offsetWidth;
    node.root.classList.add(className);
    setTimeout(() => node.root.classList.remove(className), durationMs);
  }

  _refreshCommanderConsole(commander) {
    if (!this._container || !commander) return;
    const avatarEl = this._container.querySelector('#battle-commander-avatar');
    const cutinImg = this._container.querySelector('#cutin-portrait-img');
    const nameEl = this._container.querySelector('#battle-commander-name');
    const ultEl = this._container.querySelector('#battle-commander-ult');
    const passiveEl = this._container.querySelector('#battle-commander-passive');
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
    if (nameEl) nameEl.textContent = commander.name;
    if (ultEl) ultEl.textContent = commander.ultimateSkill?.name || 'Ultimate';
    if (passiveEl) passiveEl.textContent = commander.passiveSkill?.name || 'Passive';

    const themeClass = `theme-${commander.id}`;
    for (const el of [cmdConsole, cutinEl]) {
      if (!el) continue;
      el.classList.remove(...HERO_THEME_CLASSES);
      el.classList.add(themeClass);
    }
  }

  _syncPrepControls() {
    if (!this._container) return;
    const swapBtn = this._container.querySelector('#btn-prep-swap-class');
    const selectedUid = this._ctx.battleManager.getSelectedPrepUnitUid();
    if (swapBtn) {
      swapBtn.disabled = !selectedUid;
    }
  }

  _setTextIfChanged(key, el, nextText) {
    if (!el || this._hudCache[key] === nextText) return;
    this._hudCache[key] = nextText;
    el.textContent = nextText;
  }

  _syncHud() {
    if (!this._container || !this._hudEls) return;
    const b = this._ctx.gameState.battle;
    const phase = b.phase;
    const h = this._hudEls;

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

    const deckText =
      b.remainingDeckCount > 0 ? `Deck: ${b.remainingDeckCount} left` : 'Deck empty';
    this._setTextIfChanged('deckRem', h.deckRem, deckText);

    const ultVal = Math.min(100, Math.floor(b.ultimateEnergy || 0));
    const ultReady =
      ultVal >= 100 &&
      (phase === BATTLE_PHASES.ACTIVE_COMBAT || phase === BATTLE_PHASES.WAVE_TRANSITION);
    if (this._hudCache.ultVal !== ultVal || this._hudCache.ultReady !== ultReady) {
      this._hudCache.ultVal = ultVal;
      this._hudCache.ultReady = ultReady;
      if (h.ultPct) h.ultPct.textContent = `${ultVal} / ${b.ultimateMaxEnergy || 100}`;
      if (h.ultBar) h.ultBar.style.width = `${ultVal}%`;
      if (h.ultBtn) {
        h.ultBtn.disabled = !ultReady;
        h.ultBtn.textContent = ultReady ? 'Activate Ultimate' : `Charging (${ultVal}%)`;
      }
      if (h.cmdConsole) {
        h.cmdConsole.classList.toggle('is-ult-ready', ultReady);
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
        this._setTextIfChanged('bossHp', h.bossHp, `${b.bossInfo.hp} / ${b.bossInfo.maxHp}`);
        if (h.bossFill) {
          const pct = Math.max(0, Math.min(100, (b.bossInfo.hp / Math.max(1, b.bossInfo.maxHp)) * 100));
          h.bossFill.style.width = `${pct}%`;
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

    if (phase === BATTLE_PHASES.RESULTS && b.results && h.resultsOverlay && h.resultsOverlay.hidden) {
      this._renderResultsOverlay(b.results);
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

    let drewNewCard = false;
    let hasMergeOption = false;

    for (let idx = 0; idx < 6; idx += 1) {
      const slot = slots[idx];
      const node = this._slotNodes[idx];
      const meta = this._slotMeta[idx];

      if (!slot) {
        if (!meta.isEmpty) {
          node.root.className = 'tactical-card tactical-card--empty';
          node.root.title = 'Empty tactical slot';
          node.top.hidden = true;
          node.art.hidden = true;
          node.cdWrap.hidden = true;
          node.name.textContent = 'Empty';
          node.name.className = 'tactical-card__empty-label';
          node.hint.textContent = 'Deck empty';
          meta.instanceId = null;
          meta.tier = 0;
          meta.iconAssetId = null;
          meta.isEmpty = true;
        }
        continue;
      }

      const instanceChanged = meta.instanceId !== slot.instanceId;
      const isMergedHere = instanceChanged && this._pendingMergeSlot === idx;
      const isDrawnHere = instanceChanged && !isMergedHere && !this._isInitialHandSync;

      const isSelected = selected === idx;
      const canMergeTarget = selected !== -1 && selected !== idx && cardSystem.canMerge(selected, idx);
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
      if (node.root.classList.contains('is-invalid-shake')) keepAnim.push('is-invalid-shake');

      node.root.className = [
        'tactical-card',
        `tactical-card--${slot.category}`,
        `tactical-card--${rarityLower}`,
        isSelected ? 'is-selected' : '',
        canMergeTarget ? 'is-merge-target' : '',
        slot.tier > 1 ? 'is-upgraded' : '',
        slot.tier >= 3 ? 'is-max-tier' : '',
        !usable && !canMergeTarget ? 'is-unusable' : '',
        ...keepAnim,
      ]
        .filter(Boolean)
        .join(' ');

      node.top.hidden = false;
      node.art.hidden = false;
      node.name.className = 'tactical-card__name';

      node.cost.textContent = `${slot.cost}E`;
      node.cost.className = `tactical-card__cost tabular-nums ${!affordable && inCombat ? 'is-short' : ''}`;
      node.category.textContent = `${slot.rarity || 'R'} · ${CATEGORY_LABELS[slot.category] || 'Card'}`;
      node.category.className = `tactical-card__category rarity-${rarityLower}`;
      node.tier.textContent = slot.levelLabel;
      node.name.textContent = slot.name;

      let hint = '';
      if (!inCombat) {
        hint = b.phase === BATTLE_PHASES.PREPARATION ? 'Ready in combat' : 'Battle ended';
      } else if (canMergeTarget) {
        const nextRoman = slot.tier + 1 === 3 ? 'III' : 'II';
        hint = `Merge → Lv.${nextRoman}`;
      } else if (onCooldown) {
        hint = `CD ${cooldown.toFixed(1)}s`;
      } else if (capped) {
        hint = `Cap ${b.friendlyCap}/${b.friendlyCap}`;
      } else if (!affordable) {
        hint = `Need ${slot.cost} E`;
      } else if (isSelected) {
        hint = slot.category === 'unit' ? 'Click map / card' : 'Click again to cast';
      } else {
        hint = 'Click to select';
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

        if (meta.iconAssetId !== slot.iconAssetId || meta.isEmpty) {
          node.img.alt = slot.name;
          assetManager.bindImageElement(node.img, slot.iconAssetId);
          meta.iconAssetId = slot.iconAssetId;
        }
      }

      if (onCooldown) {
        const cdPct = Math.min(100, (cooldown / Math.max(0.5, slot.cooldownSec || 2.5)) * 100);
        node.cdWrap.hidden = false;
        node.cdWrap.style.height = `${cdPct}%`;
        node.cdText.textContent = `${cooldown.toFixed(1)}s`;
      } else if (!node.cdWrap.hidden) {
        node.cdWrap.hidden = true;
      }

      meta.instanceId = slot.instanceId;
      meta.tier = slot.tier;
      meta.isEmpty = false;

      if (isMergedHere) {
        this._triggerSlotAnimation(idx, 'is-just-merged', 440);
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
          ? 'Gold card can merge!'
          : selected !== -1
            ? 'Click card again or arena'
            : 'Select card · Merge adjacent';
      this._setTextIfChanged('handHint', this._hudEls.handHint, nextHint);
    }

    this._pendingMergeSlot = -1;
    if (drewNewCard) {
      audioManager?.playCardDraw?.();
    }
  }

  _renderResultsOverlay(results) {
    if (!this._container || !results) return;
    const overlay = this._container.querySelector('#battle-results-overlay');
    if (!overlay) return;

    const commander = this._ctx.heroSystem.getActiveCommander();
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const r = results.rewards || {};
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

    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="results-modal ${results.victory ? 'is-victory' : 'is-defeat'} ${themeClass}" role="dialog" aria-modal="true" aria-labelledby="results-heading">
        <div class="results-visual-col">
          <img id="results-commander-bg" class="results-visual-col__bg" alt="${commander?.name || 'Commander'}" />
          <div class="results-visual-col__inner">
            <div>
              <div class="section-kicker ${results.victory ? 'section-kicker--gold' : ''}">
                Stage ${results.stageCode}
              </div>
              <h2 id="results-heading" class="results-outcome-title ${results.victory ? 'is-victory' : 'is-defeat'}" style="margin-top: 4px;">
                ${results.victory ? 'VICTORY' : 'DEFEAT'}
              </h2>
              <div class="meta-line" style="margin-top: 6px;">
                <span>${results.stageName}</span>
              </div>
              ${
                results.isFirstClear
                  ? '<div style="margin-top: 8px; font-size: 0.78rem; color: var(--accent-gold-bright); font-weight: 600;">First Clear Bonus Earned</div>'
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
            <div class="section-kicker">Combat Telemetry</div>
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

          <div class="results-rewards">
            <div class="section-kicker section-kicker--gold">Battle Rewards</div>
            <div class="meta-line tabular-nums" style="color: var(--celestial-ivory); font-size: 0.88rem;">
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

          <div class="btn-row" style="margin-top: auto; justify-content: flex-end;">
            <button type="button" id="btn-results-home" class="btn btn-ghost">Return to Home</button>
            <button type="button" id="btn-results-retry" class="btn btn-secondary">Retry Stage</button>
            ${
              results.nextStageId
                ? '<button type="button" id="btn-results-next" class="btn btn-gold">Next Stage</button>'
                : ''
            }
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

    overlay.querySelector('#btn-results-retry')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._hudCache = {};
      this._isInitialHandSync = true;
      const canvas = this._container.querySelector('#battle-canvas');
      this._ctx.battleManager.startSession(canvas, { stageId: results.stageId });
      this._renderCardSlots();
      this._isInitialHandSync = false;
      this._syncHud();
    });

    overlay.querySelector('#btn-results-next')?.addEventListener('click', () => {
      this._ctx.audioManager.playClick();
      this._ctx.progressionSystem.selectStage(results.nextStageId);
      overlay.hidden = true;
      overlay.innerHTML = '';
      this._ctx.screenManager.navigate('battle');
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
    if (eyebrow) eyebrow.textContent = `${commander?.name || 'Commander'} · Orbital Ultimate`;
    if (title) {
      title.textContent = skill?.displayNameZh
        ? `${skill.name} · ${skill.displayNameZh}`
        : skill?.name || 'Starfall Judgment';
    }
    if (sub) {
      sub.textContent = commander?.title || 'Commander Override Engaged';
    }

    overlay.classList.add('is-visible');
    if (this._cutinTimer) clearTimeout(this._cutinTimer);
    this._cutinTimer = setTimeout(() => {
      overlay.classList.remove('is-visible');
    }, skill?.effect?.cutinDurationMs || 1350);
  }
}
