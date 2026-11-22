/**
 * SettingsScreen (P4 Structural Redesign) — Compact, Well-Grouped System Console
 * organizing Audio Mixer & Previews, Gameplay & Visual Quality, and Local Save /
 * Asset Diagnostics into two balanced columns with zero bloated panels.
 */

export class SettingsScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._hasRendered = false;
  }

  mount(container) {
    this._container = container;
    this._hasRendered = false;
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
      this._ctx.eventBus.on('asset:batchComplete', () => this.render()),
    );
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._hasRendered = false;
    this._container = null;
  }

  render() {
    if (!this._container) return;
    const { gameState, saveManager, assetManager, audioManager, screenManager } = this._ctx;
    const s = gameState.settings;
    const tutorialState = gameState.tutorial || {};
    const tutorialStatusText = tutorialState.completed
      ? 'Completed'
      : tutorialState.skipped
        ? 'Skipped'
        : 'Not Completed';
    const assetSummary = assetManager.getStatusSummary();
    const isMasterMuted = Boolean(s.muted);
    const isMusicMuted = Boolean(s.musicMuted);
    const isSfxMuted = Boolean(s.sfxMuted);

    const settledClass = this._hasRendered ? ' is-settled' : '';

    this._container.innerHTML = `
      <section class="screen-frame${settledClass}" aria-label="Settings">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Settings</h1>
            <span class="screen-subtitle">
              Audio mixing, default battle speed, graphics density, and local save storage
            </span>
          </div>
        </div>

        <div class="scroll-pane" style="flex: 1;">
          <div class="settings-workspace">
            <div class="surface settings-card">
              <div class="workspace-pane__head">
                <div>
                  <div class="section-kicker">Audio Mixer</div>
                  <h2 class="section-heading" style="margin-top: 2px;">Sound &amp; Music Channels</h2>
                </div>
                <button
                  type="button"
                  id="btn-toggle-master-mute"
                  class="btn btn-sm ${isMasterMuted ? 'btn-danger' : 'btn-secondary'}"
                  aria-pressed="${isMasterMuted}"
                >
                  ${isMasterMuted ? 'Master Muted' : 'Mute All Audio'}
                </button>
              </div>

              <div class="setting-control">
                <div class="setting-control__top">
                  <label for="slider-music" style="font-weight: 500;">Music Volume</label>
                  <div class="setting-control__right">
                    <span id="val-music" class="tabular-nums" style="color: var(--accent-gold-bright);">
                      ${isMasterMuted || isMusicMuted ? 'Muted' : `${Math.round(s.musicVolume * 100)}%`}
                    </span>
                    <button
                      type="button"
                      id="btn-toggle-music-mute"
                      class="btn btn-ghost btn-sm"
                      aria-pressed="${isMusicMuted}"
                    >
                      ${isMusicMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
                <input
                  id="slider-music"
                  class="range-input"
                  type="range"
                  min="0"
                  max="100"
                  value="${Math.round(s.musicVolume * 100)}"
                  ${isMasterMuted || isMusicMuted ? 'disabled' : ''}
                />
              </div>

              <div class="setting-control">
                <div class="setting-control__top">
                  <label for="slider-sfx" style="font-weight: 500;">Sound Effects Volume</label>
                  <div class="setting-control__right">
                    <span id="val-sfx" class="tabular-nums" style="color: var(--accent-gold-bright);">
                      ${isMasterMuted || isSfxMuted ? 'Muted' : `${Math.round(s.sfxVolume * 100)}%`}
                    </span>
                    <button
                      type="button"
                      id="btn-toggle-sfx-mute"
                      class="btn btn-ghost btn-sm"
                      aria-pressed="${isSfxMuted}"
                    >
                      ${isSfxMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
                <input
                  id="slider-sfx"
                  class="range-input"
                  type="range"
                  min="0"
                  max="100"
                  value="${Math.round(s.sfxVolume * 100)}"
                  ${isMasterMuted || isSfxMuted ? 'disabled' : ''}
                />
              </div>

              <div class="hairline"></div>

              <div>
                <div class="section-kicker" style="margin-bottom: 8px;">Quick Sound Previews</div>
                <div class="btn-row">
                  <button type="button" id="btn-test-sfx" class="btn btn-secondary btn-sm">
                    Merge Chime
                  </button>
                  <button type="button" id="btn-test-combat" class="btn btn-ghost btn-sm">
                    Combat Hit
                  </button>
                  <button type="button" id="btn-test-ult" class="btn btn-ghost btn-sm">
                    Commander Ultimate
                  </button>
                </div>
              </div>
            </div>

            <div class="surface settings-card">
              <div>
                <div class="section-kicker">Combat &amp; Rendering</div>
                <h2 class="section-heading" style="margin-top: 2px;">Gameplay Preferences</h2>
              </div>

              <div class="setting-control">
                <div class="setting-control__top">
                  <span style="font-weight: 500;">Default Battle Speed</span>
                  <div class="segmented-bar">
                    ${[1, 2, 3]
                      .map(
                        (spd) => `
                          <button
                            type="button"
                            class="segmented-btn ${s.battleSpeed === spd ? 'is-active' : ''}"
                            data-speed="${spd}"
                          >
                            ${spd}x
                          </button>
                        `,
                      )
                      .join('')}
                  </div>
                </div>
              </div>

              <div class="setting-control">
                <div class="setting-control__top">
                  <div>
                    <div style="font-weight: 500;">Graphics Quality</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Adjusts DPR &amp; particle density</div>
                  </div>
                  <div class="segmented-bar">
                    ${['low', 'medium', 'high']
                      .map(
                        (q) => `
                          <button
                            type="button"
                            class="segmented-btn ${s.graphicsQuality === q ? 'is-active' : ''}"
                            data-quality="${q}"
                          >
                            ${q.charAt(0).toUpperCase() + q.slice(1)}
                          </button>
                        `,
                      )
                      .join('')}
                  </div>
                </div>
              </div>

              <div class="setting-control">
                <div class="setting-control__top">
                  <div>
                    <div style="font-weight: 500;">Battle Tutorial</div>
                    <div id="tutorial-status-label" style="font-size: 0.76rem; color: var(--text-muted);">
                      Status: ${tutorialStatusText}
                    </div>
                  </div>
                  <button type="button" id="btn-replay-tutorial" class="btn btn-secondary btn-sm">
                    Replay Tutorial
                  </button>
                </div>
              </div>

              <div class="hairline"></div>

              <div>
                <div class="section-kicker section-kicker--gold">Storage &amp; Assets</div>
                <h2 class="section-heading" style="margin-top: 2px;">Save Data &amp; Registry</h2>
              </div>

              <div class="kv-list">
                <div class="kv-row">
                  <span class="kv-label">Save Schema &amp; Last Saved</span>
                  <span class="kv-value tabular-nums">
                    v${gameState.persistent.version} · ${new Date(gameState.persistent.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div class="kv-row">
                  <span class="kv-label">Asset Registry (Loaded / Registered / Fallback)</span>
                  <span class="kv-value tabular-nums">
                    ${assetSummary.loaded} / ${assetSummary.registered} / ${assetSummary.fallback}
                  </span>
                </div>
              </div>

              <div class="btn-row">
                <button type="button" id="btn-save-now" class="btn btn-primary btn-sm">
                  Save Now
                </button>
                <button type="button" id="btn-verify-fallback" class="btn btn-secondary btn-sm">
                  Test Asset Fallback
                </button>
                <button type="button" id="btn-reset-save" class="btn btn-danger btn-sm">
                  Reset Save Data
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    const updateSetting = (key, value) => {
      gameState.mutatePersistent('settings', (draft) => {
        draft.settings[key] = value;
      });
      if (key === 'battleSpeed') {
        gameState.setBattle({ speedMultiplier: value });
      }
      audioManager?.syncVolumes?.();
      saveManager.save(gameState.toSerializableSave());
    };

    this._container.querySelector('#btn-toggle-master-mute')?.addEventListener('click', () => {
      const next = !gameState.settings.muted;
      updateSetting('muted', next);
      if (!next) audioManager.playClick();
    });

    this._container.querySelector('#btn-toggle-music-mute')?.addEventListener('click', () => {
      const next = !gameState.settings.musicMuted;
      updateSetting('musicMuted', next);
      audioManager.playClick();
    });

    this._container.querySelector('#btn-toggle-sfx-mute')?.addEventListener('click', () => {
      const next = !gameState.settings.sfxMuted;
      updateSetting('sfxMuted', next);
      if (!next) audioManager.playClick();
    });

    const musicInput = this._container.querySelector('#slider-music');
    const musicLabel = this._container.querySelector('#val-music');
    musicInput?.addEventListener('input', (ev) => {
      const pct = Number(ev.target.value);
      if (musicLabel) musicLabel.textContent = `${pct}%`;
      gameState.persistent.settings.musicVolume = pct / 100;
      audioManager?.syncVolumes?.();
    });
    musicInput?.addEventListener('change', (ev) => {
      updateSetting('musicVolume', Number(ev.target.value) / 100);
    });

    const sfxInput = this._container.querySelector('#slider-sfx');
    const sfxLabel = this._container.querySelector('#val-sfx');
    sfxInput?.addEventListener('input', (ev) => {
      const pct = Number(ev.target.value);
      if (sfxLabel) sfxLabel.textContent = `${pct}%`;
      gameState.persistent.settings.sfxVolume = pct / 100;
      audioManager?.syncVolumes?.();
    });
    sfxInput?.addEventListener('change', (ev) => {
      updateSetting('sfxVolume', Number(ev.target.value) / 100);
      audioManager.playClick();
    });

    this._container.querySelector('#btn-test-sfx')?.addEventListener('click', () => {
      audioManager.playMerge(3);
    });

    this._container.querySelector('#btn-test-combat')?.addEventListener('click', () => {
      audioManager.playHit(true, 'magical');
    });

    this._container.querySelector('#btn-test-ult')?.addEventListener('click', () => {
      audioManager.playUltimate();
    });

    for (const btn of this._container.querySelectorAll('[data-speed]')) {
      btn.addEventListener('click', () => {
        audioManager.playClick();
        updateSetting('battleSpeed', Number(btn.getAttribute('data-speed')));
      });
    }

    for (const btn of this._container.querySelectorAll('[data-quality]')) {
      btn.addEventListener('click', () => {
        audioManager.playClick();
        updateSetting('graphicsQuality', btn.getAttribute('data-quality'));
      });
    }

    this._container.querySelector('#btn-replay-tutorial')?.addEventListener('click', () => {
      audioManager?.playClick?.();
      screenManager?.navigate('battle', { tutorial: true, replay: true });
    });

    this._container.querySelector('#btn-verify-fallback')?.addEventListener('click', async () => {
      audioManager.playClick();
      const record = await assetManager.loadAsset('missing_test_asset_id');
      this._ctx.notify(
        record.isFallback
          ? 'Fallback SVG placeholder generated safely without error.'
          : 'Asset resolved directly.',
      );
      this.render();
    });

    this._container.querySelector('#btn-save-now')?.addEventListener('click', () => {
      audioManager.playClick();
      saveManager.save(gameState.toSerializableSave());
      this._ctx.notify('Progress saved to local storage.', 'success');
      this.render();
    });

    this._container.querySelector('#btn-reset-save')?.addEventListener('click', () => {
      audioManager.playClick();
      this._ctx.confirmDialog({
        title: 'Reset Local Save Data',
        message:
          'This will erase recruited Commanders, formation preferences, pity counters, and settings, restoring default save data.',
        confirmLabel: 'Reset Save',
        onConfirm: () => {
          const fresh = saveManager.reset();
          gameState.replacePersistent(fresh);
          audioManager?.syncVolumes?.();
          this._ctx.notify('Save data restored to defaults.');
        },
      });
    });

    this._hasRendered = true;
  }
}
