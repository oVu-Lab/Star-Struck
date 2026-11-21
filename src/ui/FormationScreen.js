/**
 * FormationScreen (P4 Structural Redesign) — 3-Tab Tactical Command Workspace
 * eliminating excessive vertical scrolling by organizing Squad & Units,
 * 12-Card Battle Deck Builder, and 12-Stage Campaign Operations into dedicated
 * full-viewport 2-column tactical desks.
 */

import { formatNumber } from '../utils/MathUtils.js';

const CATEGORY_LABELS = {
  all: 'All',
  unit: 'Unit',
  skill: 'Skill',
  tactic: 'Tactic',
  support: 'Support',
};

export class FormationScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._draftDeck = null;
  }

  mount(container) {
    this._container = container;
    this._draftDeck = [...this._ctx.cardSystem.getCustomDeck()];
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
    );
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
    this._draftDeck = null;
  }

  _countInDraft(cardId) {
    if (!Array.isArray(this._draftDeck)) return 0;
    let n = 0;
    for (const id of this._draftDeck) {
      if (id === cardId) n += 1;
    }
    return n;
  }

  render() {
    if (!this._container) return;
    const {
      heroSystem,
      formationSystem,
      cardSystem,
      progressionSystem,
      economySystem,
      dataRegistry,
      gameState,
      assetManager,
      screenManager,
      audioManager,
    } = this._ctx;

    const activeTab = gameState.ui.formationTab || 'squad';
    const selectedStage = progressionSystem.getSelectedStage();
    const stages = progressionSystem.getStages();
    const clearedCount = stages.filter((s) => s.cleared).length;
    const savedDeck = cardSystem.getCustomDeck();
    const deckSize = cardSystem.getDeckSize();

    if (!Array.isArray(this._draftDeck)) {
      this._draftDeck = [...savedDeck];
    }

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Formation Configuration">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Formation &amp; Deck</h1>
            <div class="segmented-bar" role="tablist" aria-label="Formation Workspace Views">
              <button type="button" role="tab" aria-selected="${activeTab === 'squad'}" class="segmented-btn ${activeTab === 'squad' ? 'is-active' : ''}" data-form-tab="squad">
                Squad &amp; Units
              </button>
              <button type="button" role="tab" aria-selected="${activeTab === 'deck'}" class="segmented-btn ${activeTab === 'deck' ? 'is-active' : ''}" data-form-tab="deck">
                12-Card Deck (${this._draftDeck.length}/${deckSize})
              </button>
              <button type="button" role="tab" aria-selected="${activeTab === 'stages'}" class="segmented-btn ${activeTab === 'stages' ? 'is-active' : ''}" data-form-tab="stages">
                Campaign (${clearedCount}/${stages.length})
              </button>
            </div>
          </div>

          <div class="btn-row">
            <span class="meta-line" style="white-space: nowrap;">
              <span>Stage ${selectedStage?.code || '1-1'} · ${selectedStage?.name || 'Outer Bastion'}</span>
            </span>
            <button type="button" id="btn-formation-deploy" class="btn btn-primary btn-sm">
              Deploy to Stage ${selectedStage?.code || '1-1'}
            </button>
          </div>
        </div>

        <div id="formation-workspace-body" style="flex: 1; min-height: 0; display: flex; flex-direction: column;"></div>
      </section>
    `;

    const bodyEl = this._container.querySelector('#formation-workspace-body');
    if (activeTab === 'deck') {
      this._renderDeckTab(bodyEl);
    } else if (activeTab === 'stages') {
      this._renderStagesTab(bodyEl);
    } else {
      this._renderSquadTab(bodyEl);
    }

    for (const tabBtn of this._container.querySelectorAll('[data-form-tab]')) {
      tabBtn.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ formationTab: tabBtn.getAttribute('data-form-tab') });
        this.render();
      });
    }

    this._container.querySelector('#btn-formation-deploy')?.addEventListener('click', () => {
      audioManager.playClick();
      screenManager.navigate('battle');
    });
  }

  _renderSquadTab(bodyEl) {
    const { heroSystem, formationSystem, economySystem, gameState, assetManager, audioManager } =
      this._ctx;
    const ownedCommanders = heroSystem.getOwnedHeroes();
    const activeCommander = heroSystem.getActiveCommander();
    const unitSlots = formationSystem.getUnitSlots();
    const unlockedUnits = formationSystem.getUnlockedUnits();
    const allUnits = formationSystem.getAllUnitsWithProgress();
    const xpChips =
      (gameState.inventory.items || []).find((i) => i.id === 'item_xp_chip')?.quantity || 0;
    const activeTheme = activeCommander?.id ? `theme-${activeCommander.id}` : 'theme-astra';

    bodyEl.innerHTML = `
      <div class="formation-workspace formation-workspace--squad">
        <div class="surface surface--celestial workspace-pane ${activeTheme}">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker section-kicker--gold">Active Commander &amp; Starting Squad</div>
              <h2 class="section-heading" style="margin-top: 2px;">${activeCommander?.name || 'Astra Valen'}</h2>
            </div>
            <span class="meta-line">
              <span>${activeCommander?.passiveSkill?.name || '—'}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span style="color: var(--hero-accent); font-weight: 600;">${activeCommander?.ultimateSkill?.name || '—'}</span>
            </span>
          </div>

          <div class="commander-picker-strip" id="commander-selector-row">
            ${ownedCommanders
              .map(
                (hero) => `
                  <button
                    type="button"
                    class="commander-chip theme-${hero.id} ${hero.id === activeCommander?.id ? 'is-active' : ''}"
                    data-commander-id="${hero.id}"
                  >
                    <img class="commander-chip__img" data-cmd-portrait="${hero.portraitAssetId}" alt="${hero.name}" />
                    <span>${hero.name}</span>
                    <span class="rarity-${(hero.rarity || 'R').toLowerCase()} tabular-nums">Lv.${hero.level}</span>
                  </button>
                `,
              )
              .join('')}
          </div>

          <div class="workspace-pane__head">
            <span class="section-heading" style="font-size: 0.9rem;">4 Tactical Starting Slots</span>
            <span class="meta-line tabular-nums">${unlockedUnits.length} / ${allUnits.length} Unit Classes Unlocked</span>
          </div>

          <div id="formation-unit-slots" class="squad-grid-2x2"></div>
        </div>

        <div class="surface workspace-pane">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker">Barracks Workshop</div>
              <h2 class="section-heading" style="margin-top: 2px;">Unit Roster &amp; Upgrades</h2>
            </div>
            <span class="meta-line tabular-nums">
              <span>${formatNumber(gameState.resources.credits)} Credits</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span style="color: var(--accent-blue-bright);">${formatNumber(xpChips)} XP Chips</span>
            </span>
          </div>

          <div class="scroll-pane">
            <div id="formation-unit-roster" class="roster-grid-compact">
              ${allUnits
                .map((u) => {
                  const canAfford =
                    u.unlocked &&
                    u.level < u.maxLevel &&
                    gameState.resources.credits >= u.upgradeCreditCost &&
                    xpChips >= u.upgradeChipCost;
                  const roleStat =
                    u.scaledStats.healPower > 0
                      ? `HEAL ${u.scaledStats.healPower}`
                      : u.scaledStats.shieldPower > 0
                        ? `SHD ${u.scaledStats.shieldPower}`
                        : `ATK ${u.scaledStats.attack}`;
                  return `
                    <article class="unit-roster-card ${u.unlocked ? '' : 'is-locked'}">
                      <div class="workspace-pane__head">
                        <strong style="font-size: 0.88rem; color: var(--celestial-ivory);">${u.name}</strong>
                        <span class="rarity-${(u.rarity || 'R').toLowerCase()} tabular-nums" style="font-size: 0.78rem;">
                          ${u.unlocked ? `Lv.${u.level}` : 'Locked'}
                        </span>
                      </div>
                      <div class="meta-line" style="font-size: 0.76rem;">
                        <span>${u.role}</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span class="tabular-nums">${u.cost} E</span>
                      </div>
                      <div class="meta-line tabular-nums" style="font-size: 0.76rem; color: var(--celestial-ivory);">
                        <span>HP ${u.scaledStats.maxHp}</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span>${roleStat}</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span>DEF ${u.scaledStats.defense}</span>
                      </div>
                      ${
                        u.unlocked
                          ? `
                            <button
                              type="button"
                              class="btn ${canAfford ? 'btn-primary' : 'btn-secondary'} btn-sm"
                              style="margin-top: 2px; width: 100%;"
                              data-upgrade-unit="${u.id}"
                              ${u.level >= u.maxLevel || !canAfford ? 'disabled' : ''}
                            >
                              ${
                                u.level >= u.maxLevel
                                  ? 'Max Level'
                                  : `Upgrade (${u.upgradeCreditCost} Cr · ${u.upgradeChipCost} Chips)`
                              }
                            </button>
                          `
                          : `<div class="meta-line" style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">Unlock via Campaign or Armory</div>`
                      }
                    </article>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    for (const imgEl of bodyEl.querySelectorAll('[data-cmd-portrait]')) {
      const aid = imgEl.getAttribute('data-cmd-portrait');
      if (aid) assetManager.bindImageElement(imgEl, aid);
    }

    const slotsEl = bodyEl.querySelector('#formation-unit-slots');
    for (const slot of unitSlots) {
      const unit = slot.unit;
      const card = document.createElement('div');
      card.className = 'squad-slot';
      card.innerHTML = `
        <div class="squad-slot__top">
          <div class="squad-slot__art">
            <img alt="${unit?.name || slot.unitId}" />
          </div>
          <div style="min-width: 0; flex: 1;">
            <div class="meta-line tabular-nums" style="font-size: 0.72rem;">
              <span>Slot ${slot.slotIndex + 1}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Lv.${unit?.level ?? 1}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span style="color: var(--accent-blue-bright);">${unit?.cost ?? 20} E</span>
            </div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--celestial-ivory); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${unit?.name || slot.unitId}
            </div>
            <div class="meta-line" style="font-size: 0.74rem;">${unit?.role || ''}</div>
          </div>
        </div>
        <select
          class="squad-slot__select"
          aria-label="Unit type for slot ${slot.slotIndex + 1}"
          data-slot-select="${slot.slotIndex}"
        >
          ${unlockedUnits
            .map(
              (u) => `
                <option value="${u.id}" ${u.id === slot.unitId ? 'selected' : ''}>
                  ${u.name} (Lv.${u.level})
                </option>
              `,
            )
            .join('')}
        </select>
        <div class="btn-row" style="justify-content: space-between;">
          <button type="button" class="btn btn-ghost btn-sm" data-swap-left="${slot.slotIndex}" ${slot.slotIndex === 0 ? 'disabled' : ''}>
            ← Left
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-swap-right="${slot.slotIndex}" ${slot.slotIndex === 3 ? 'disabled' : ''}>
            Right →
          </button>
        </div>
      `;

      const img = card.querySelector('img');
      if (unit) assetManager.bindImageElement(img, unit.spriteAssetId);

      card.querySelector('[data-slot-select]')?.addEventListener('change', (ev) => {
        const res = formationSystem.setUnitSlot(slot.slotIndex, ev.target.value);
        if (!res.ok && res.reason) {
          audioManager.playInvalid();
          this._ctx.notify(res.reason, 'warn');
        } else {
          audioManager.playClick();
        }
      });
      card.querySelector('[data-swap-left]')?.addEventListener('click', () => {
        formationSystem.swapUnitSlots(slot.slotIndex, slot.slotIndex - 1);
        audioManager.playClick();
      });
      card.querySelector('[data-swap-right]')?.addEventListener('click', () => {
        formationSystem.swapUnitSlots(slot.slotIndex, slot.slotIndex + 1);
        audioManager.playClick();
      });

      slotsEl.appendChild(card);
    }

    for (const btn of bodyEl.querySelectorAll('[data-commander-id]')) {
      btn.addEventListener('click', () => {
        const res = formationSystem.setCommander(btn.getAttribute('data-commander-id'));
        if (res.ok) {
          audioManager.playDeploy();
          this._ctx.notify('Active Commander updated.', 'success');
        }
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-upgrade-unit]')) {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-upgrade-unit');
        const res = formationSystem.upgradeUnit(uid, economySystem);
        if (res.ok) {
          audioManager.playReward();
          this._ctx.notify(`${res.unit.name} upgraded to Lv.${res.unit.level}.`, 'success');
        } else if (res.reason) {
          audioManager.playInvalid();
          this._ctx.notify(res.reason, 'warn');
        }
      });
    }
  }

  _renderDeckTab(bodyEl) {
    const { cardSystem, dataRegistry, gameState, assetManager, audioManager } = this._ctx;
    const savedDeck = cardSystem.getCustomDeck();
    const deckSize = cardSystem.getDeckSize();
    const cardCatFilter = gameState.ui.cardCategoryFilter || 'all';
    const unlockedCardSet = new Set(cardSystem.getUnlockedCardIds());
    const unlockedCards = dataRegistry.cards.filter((c) => unlockedCardSet.has(c.id));
    const visibleCards =
      cardCatFilter === 'all'
        ? unlockedCards
        : unlockedCards.filter((c) => (c.category || 'unit') === cardCatFilter);

    const draftCounts = { unit: 0, skill: 0, tactic: 0, support: 0 };
    const groupedDraft = new Map();
    for (const cid of this._draftDeck) {
      const def = dataRegistry.cardsById.get(cid);
      const cat = def?.category || 'unit';
      if (draftCounts[cat] !== undefined) draftCounts[cat] += 1;
      groupedDraft.set(cid, (groupedDraft.get(cid) || 0) + 1);
    }

    bodyEl.innerHTML = `
      <div class="formation-workspace formation-workspace--deck">
        <div class="surface workspace-pane">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker">Unlocked Tactical Pool</div>
              <h2 class="section-heading" style="margin-top: 2px;">Available Cards (${unlockedCards.length})</h2>
            </div>

            <div class="segmented-bar" role="tablist" aria-label="Filter cards by category">
              ${Object.entries(CATEGORY_LABELS)
                .map(
                  ([cat, label]) => `
                    <button
                      type="button"
                      role="tab"
                      aria-selected="${cardCatFilter === cat}"
                      class="segmented-btn ${cardCatFilter === cat ? 'is-active' : ''}"
                      data-deck-cat="${cat}"
                    >
                      ${label}
                    </button>
                  `,
                )
                .join('')}
            </div>
          </div>

          <div class="scroll-pane">
            <div class="deck-builder-grid" id="deck-builder-grid">
              ${visibleCards
                .map((card) => {
                  const count = this._countInDraft(card.id);
                  const canAdd = count < 3 && this._draftDeck.length < deckSize;
                  const cat = card.category || 'unit';
                  return `
                    <div class="deck-card-row deck-card-row--${cat} ${count > 0 ? 'is-in-deck' : ''}" title="${card.description || ''}">
                      <div class="deck-card-row__main">
                        <div class="deck-card-row__icon">
                          <img data-deck-icon="${card.iconAssetId}" alt="${card.name}" />
                        </div>
                        <div style="min-width: 0;">
                          <div style="font-weight: 600; font-size: 0.85rem; color: var(--celestial-ivory); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${card.name}
                          </div>
                          <div class="meta-line tabular-nums" style="font-size: 0.74rem;">
                            <span class="rarity-${(card.rarity || 'R').toLowerCase()}">${card.rarity || 'R'}</span>
                            <span class="meta-sep" aria-hidden="true">·</span>
                            <span class="cat-text-${cat}">${CATEGORY_LABELS[cat]}</span>
                            <span class="meta-sep" aria-hidden="true">·</span>
                            <span>${card.cost} E</span>
                          </div>
                        </div>
                      </div>
                      <div class="deck-stepper">
                        <button
                          type="button"
                          class="btn btn-secondary deck-stepper__btn"
                          aria-label="Remove ${card.name}"
                          data-deck-remove="${card.id}"
                          ${count <= 0 ? 'disabled' : ''}
                        >
                          -
                        </button>
                        <span class="tabular-nums" style="min-width: 16px; text-align: center; font-weight: 700; font-size: 0.85rem;">
                          ${count}
                        </span>
                        <button
                          type="button"
                          class="btn btn-secondary deck-stepper__btn"
                          aria-label="Add ${card.name}"
                          data-deck-add="${card.id}"
                          ${!canAdd ? 'disabled' : ''}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>

        <aside class="surface workspace-pane" aria-label="Active Deck Composition">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker section-kicker--gold">Battle Deck (${this._draftDeck.length} / ${deckSize})</div>
              <h2 class="section-heading" style="margin-top: 2px;">${savedDeck.length === deckSize ? 'Custom Deck Active' : 'Auto-Deck Active'}</h2>
            </div>
          </div>

          <div class="meta-line tabular-nums" style="font-size: 0.78rem;">
            <span class="cat-text-unit">Unit ${draftCounts.unit} (min 4)</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="cat-text-skill">Skill ${draftCounts.skill}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="cat-text-tactic">Tactic ${draftCounts.tactic}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="cat-text-support">Support ${draftCounts.support}</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.min(100, (this._draftDeck.length / deckSize) * 100)}%;"></div>
          </div>

          <div class="deck-draft-list">
            ${
              groupedDraft.size === 0
                ? '<p style="font-size: 0.84rem; color: var(--text-muted); padding: 12px 0;">Draft is empty. Add up to 12 cards (max 3 copies each, min 4 Unit cards) or use Auto-Deck.</p>'
                : Array.from(groupedDraft.entries())
                    .map(([cid, qty]) => {
                      const card = dataRegistry.cardsById.get(cid);
                      const cat = card?.category || 'unit';
                      return `
                        <button type="button" class="deck-draft-pill" data-deck-remove="${cid}" title="Click to remove one copy">
                          <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <span class="cat-text-${cat}" style="margin-right: 6px;">${CATEGORY_LABELS[cat]}</span>
                            <strong style="color: var(--celestial-ivory);">${card?.name || cid}</strong>
                          </span>
                          <span class="tabular-nums" style="color: var(--accent-blue-bright); font-weight: 700; flex-shrink: 0;">×${qty}</span>
                        </button>
                      `;
                    })
                    .join('')
            }
          </div>

          <div class="btn-row" style="margin-top: auto; justify-content: space-between;">
            <button type="button" id="btn-deck-auto" class="btn btn-ghost btn-sm">
              Use Auto-Deck
            </button>
            <button
              type="button"
              id="btn-deck-save"
              class="btn btn-primary btn-sm"
              ${this._draftDeck.length !== deckSize || draftCounts.unit < 4 ? 'disabled' : ''}
            >
              Save 12-Card Deck
            </button>
          </div>
        </aside>
      </div>
    `;

    for (const imgEl of bodyEl.querySelectorAll('[data-deck-icon]')) {
      const assetId = imgEl.getAttribute('data-deck-icon');
      if (assetId) assetManager.bindImageElement(imgEl, assetId);
    }

    for (const btn of bodyEl.querySelectorAll('[data-deck-cat]')) {
      btn.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ cardCategoryFilter: btn.getAttribute('data-deck-cat') });
        this.render();
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-deck-add]')) {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-deck-add');
        if (this._draftDeck.length < deckSize && this._countInDraft(cid) < 3) {
          this._draftDeck.push(cid);
          audioManager.playCardSelect();
          this.render();
        }
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-deck-remove]')) {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-deck-remove');
        const idx = this._draftDeck.lastIndexOf(cid);
        if (idx >= 0) {
          this._draftDeck.splice(idx, 1);
          audioManager.playClick();
          this.render();
        }
      });
    }

    bodyEl.querySelector('#btn-deck-save')?.addEventListener('click', () => {
      const res = cardSystem.setCustomDeck(this._draftDeck);
      if (res.ok) {
        audioManager.playReward();
        this._ctx.notify('Custom 12-card battle deck saved.', 'success');
      } else if (res.reason) {
        audioManager.playInvalid();
        this._ctx.notify(res.reason, 'warn');
      }
    });

    bodyEl.querySelector('#btn-deck-auto')?.addEventListener('click', () => {
      const res = cardSystem.setCustomDeck([]);
      if (res.ok) {
        this._draftDeck = [];
        audioManager.playClick();
        this._ctx.notify('Switched to automatic battle deck.');
        this.render();
      }
    });
  }

  _renderStagesTab(bodyEl) {
    const { progressionSystem, dataRegistry, gameState, audioManager, screenManager } = this._ctx;
    const stages = progressionSystem.getStages();
    const selectedStage = progressionSystem.getSelectedStage();
    const chapterFilter = String(gameState.ui.chapterFilter || 'all').toLowerCase();
    const chapters = Array.from(new Set(stages.map((s) => s.chapter || 1))).sort((a, b) => a - b);
    const visibleStages =
      chapterFilter === 'all'
        ? stages
        : stages.filter((s) => String(s.chapter || 1) === String(chapterFilter));

    const terrainDef = selectedStage?.terrainId
      ? dataRegistry.terrainsById.get(selectedStage.terrainId)
      : null;
    const bonusUnitNames = (selectedStage?.rewards?.bonusUnits || []).map(
      (uid) => dataRegistry.unitsById.get(uid)?.name || uid,
    );
    const bonusCardNames = (selectedStage?.rewards?.bonusCards || []).map(
      (cid) => dataRegistry.cardsById.get(cid)?.name || cid,
    );

    bodyEl.innerHTML = `
      <div class="formation-workspace formation-workspace--stages">
        <div class="surface workspace-pane">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker">Orbital Sector Map</div>
              <h2 class="section-heading" style="margin-top: 2px;">Campaign Operations (${stages.filter((s) => s.cleared).length} / ${stages.length} Cleared)</h2>
            </div>

            <div class="segmented-bar" role="tablist" aria-label="Filter campaign chapters">
              <button type="button" role="tab" aria-selected="${chapterFilter === 'all'}" class="segmented-btn ${chapterFilter === 'all' ? 'is-active' : ''}" data-chapter-filter="all">
                All
              </button>
              ${chapters
                .map(
                  (ch) => `
                    <button type="button" role="tab" aria-selected="${chapterFilter === String(ch)}" class="segmented-btn ${chapterFilter === String(ch) ? 'is-active' : ''}" data-chapter-filter="${ch}">
                      Ch.${ch}
                    </button>
                  `,
                )
                .join('')}
            </div>
          </div>

          <div class="scroll-pane">
            <div class="stage-grid" id="stage-selector-row">
              ${visibleStages
                .map((stage) => {
                  const isSelected = stage.id === selectedStage?.id;
                  const reqStage = stage.unlockAfter
                    ? dataRegistry.stagesById.get(stage.unlockAfter)
                    : null;
                  return `
                    <button
                      type="button"
                      class="stage-card ${isSelected ? 'is-selected' : ''} ${stage.unlocked ? '' : 'is-locked'}"
                      data-stage-id="${stage.id}"
                      ${stage.unlocked ? '' : 'disabled'}
                    >
                      <div class="workspace-pane__head" style="width: 100%;">
                        <strong style="font-size: 0.9rem; color: var(--celestial-ivory);">Stage ${stage.code} · ${stage.name}</strong>
                        <span class="tabular-nums" style="color: ${stage.bestRating ? 'var(--accent-gold-bright)' : 'var(--text-muted)'}; font-weight: 700; font-size: 0.82rem;">
                          ${stage.unlocked ? stage.bestRating || (stage.cleared ? 'Cleared' : 'Ready') : 'Locked'}
                        </span>
                      </div>
                      <div class="meta-line" style="font-size: 0.76rem;">
                        <span>${stage.difficulty || 'Standard'}</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span>${stage.waves?.length || 3} Waves</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span class="tabular-nums">Rec Lv.${stage.recommendedLevel || 1}</span>
                      </div>
                      <div style="font-size: 0.78rem; color: var(--text-secondary);">
                        ${stage.unlocked ? stage.description : `Requires Stage ${reqStage?.code || stage.unlockAfter}`}
                      </div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>

        <aside class="surface surface--celestial workspace-pane" aria-label="Selected Operation Briefing">
          <div>
            <div class="section-kicker section-kicker--gold">Operation Briefing</div>
            <h2 class="section-heading" style="font-size: 1.28rem; margin-top: 4px;">
              Stage ${selectedStage?.code || '1-1'} · ${selectedStage?.name || 'Outer Bastion'}
            </h2>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin-top: 8px;">
              ${selectedStage?.description || ''}
            </p>
          </div>

          <div class="hairline"></div>

          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">Difficulty</span>
              <span class="kv-value">${selectedStage?.difficulty || 'Standard'}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">Enemy Waves</span>
              <span class="kv-value tabular-nums">${selectedStage?.waves?.length || 3} Waves</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">Recommended Level</span>
              <span class="kv-value tabular-nums">Lv.${selectedStage?.recommendedLevel || 1}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">Battlefield Terrain</span>
              <span class="kv-value">${terrainDef?.name || 'Orbital Arena'}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label">Best Rating</span>
              <span class="kv-value tabular-nums" style="color: var(--accent-gold-bright);">${selectedStage?.bestRating || 'Not Cleared'}</span>
            </div>
          </div>

          ${
            bonusUnitNames.length > 0 || bonusCardNames.length > 0
              ? `
                <div class="dossier-skill" style="margin-top: 4px;">
                  <div class="section-kicker">First-Clear Unlocks</div>
                  ${bonusUnitNames.length > 0 ? `<div style="font-size: 0.84rem; color: var(--accent-gold-bright); font-weight: 600;">Units: ${bonusUnitNames.join(', ')}</div>` : ''}
                  ${bonusCardNames.length > 0 ? `<div style="font-size: 0.84rem; color: var(--accent-blue-bright); font-weight: 600;">Cards: ${bonusCardNames.join(', ')}</div>` : ''}
                </div>
              `
              : ''
          }

          <button type="button" id="btn-briefing-deploy" class="btn btn-primary btn-lg" style="margin-top: auto; width: 100%;">
            Deploy to Stage ${selectedStage?.code || '1-1'}
          </button>
        </aside>
      </div>
    `;

    for (const btn of bodyEl.querySelectorAll('[data-chapter-filter]')) {
      btn.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ chapterFilter: btn.getAttribute('data-chapter-filter') });
        this.render();
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-stage-id]')) {
      btn.addEventListener('click', () => {
        const res = progressionSystem.selectStage(btn.getAttribute('data-stage-id'));
        if (res.ok) {
          audioManager.playCardSelect();
        } else if (res.reason) {
          audioManager.playInvalid();
          this._ctx.notify(res.reason, 'warn');
        }
      });
    }

    bodyEl.querySelector('#btn-briefing-deploy')?.addEventListener('click', () => {
      audioManager.playClick();
      screenManager.navigate('battle');
    });
  }
}
