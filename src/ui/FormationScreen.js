/**
 * FormationScreen (P4 Structural Redesign) — 3-Tab Tactical Command Workspace
 * organizing Squad & Units, 6-Card Unique Battle Deck Builder, and 12-Stage
 * Campaign Operations into dedicated full-viewport 2-column tactical desks.
 *
 * Squad tab: a single formation board (Commander + Rearline + Frontline lanes)
 * beside the unit collection. Deck tab: card pool beside the deck panel, with
 * an explicit Saved / Unsaved / Incomplete status.
 */

import { formatNumber } from '../utils/MathUtils.js';
import { AstraCardRegistry, isAstraHero } from './AstraCardMount.js';

const CATEGORY_LABELS = {
  all: 'All',
  unit: 'Unit',
  skill: 'Skill',
  tactic: 'Tactic',
  support: 'Support',
};

const escAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

export class FormationScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._draftDeck = null;
    this._astraCards = new AstraCardRegistry({ CardClass: ctx?.AstraCardClass });
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
    this._astraCards.destroyAll();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
    this._draftDeck = null;
  }

  _hasInDraft(cardId) {
    return Array.isArray(this._draftDeck) && this._draftDeck.includes(cardId);
  }

  _getDraftCardNames() {
    const names = new Set();
    if (!Array.isArray(this._draftDeck)) return names;
    const { dataRegistry } = this._ctx;
    for (const cid of this._draftDeck) {
      const def = dataRegistry.cardsById.get(cid);
      const norm = def?.name ? String(def.name).trim().toLowerCase() : '';
      if (norm) names.add(norm);
    }
    return names;
  }

  render() {
    if (!this._container) return;
    this._astraCards.destroyAll();
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
    const deckReady = cardSystem.isDeckReadyForBattle();

    if (!Array.isArray(this._draftDeck)) {
      this._draftDeck = [...savedDeck];
    }
    const deckDirty = !(
      savedDeck.length === this._draftDeck.length &&
      savedDeck.every((id, idx) => id === this._draftDeck[idx])
    );

    this._container.innerHTML = `
      <section class="screen-frame screen-frame--formation" aria-label="Formation Configuration">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Formation &amp; Deck</h1>
            <div class="segmented-bar" role="tablist" aria-label="Formation Workspace Views">
              <button type="button" role="tab" aria-selected="${activeTab === 'squad'}" class="segmented-btn ${activeTab === 'squad' ? 'is-active' : ''}" data-form-tab="squad">
                Squad &amp; Units
              </button>
              <button type="button" role="tab" aria-selected="${activeTab === 'deck'}" class="segmented-btn ${activeTab === 'deck' ? 'is-active' : ''}" data-form-tab="deck">
                Battle Deck (${this._draftDeck.length}/${deckSize})${deckDirty ? '<span class="segmented-btn__dot" title="Unsaved deck changes" aria-label="Unsaved deck changes"></span>' : ''}
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
            <button type="button" id="btn-formation-deploy" class="btn btn-primary btn-sm" ${!deckReady.ok ? `title="${String(deckReady.reason || '').replace(/"/g, '&quot;')}"` : ''}>
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
      const check = cardSystem.isDeckReadyForBattle();
      if (!check.ok) {
        audioManager.playInvalid();
        this._ctx.notify(check.reason, 'warn');
        gameState.setUI({ formationTab: 'deck' });
        this.render();
        return;
      }
      audioManager.playClick();
      screenManager.navigate('battle');
    });
  }

  _renderSquadTab(bodyEl) {
    const {
      heroSystem,
      formationSystem,
      economySystem,
      dataRegistry,
      gameState,
      assetManager,
      audioManager,
    } = this._ctx;
    const ownedCommanders = heroSystem.getOwnedHeroes();
    const activeCommander = heroSystem.getActiveCommander();
    const unitSlots = formationSystem.getUnitSlots();
    const unlockedUnits = formationSystem.getUnlockedUnits();
    const allUnits = formationSystem.getAllUnitsWithProgress();
    const xpChips =
      (gameState.inventory.items || []).find((i) => i.id === 'item_xp_chip')?.quantity || 0;
    const activeTheme = activeCommander?.id ? `theme-${activeCommander.id}` : 'theme-astra';

    const selectedSlotIdx = Math.max(
      0,
      Math.min(3, Number(gameState.ui.selectedSquadSlot ?? 0)),
    );
    const activeSlot = unitSlots[selectedSlotIdx] || unitSlots[0];
    const selectedUnit =
      allUnits.find((u) => u.id === gameState.ui.selectedRosterUnitId) ||
      allUnits.find((u) => u.id === activeSlot?.unitId) ||
      allUnits[0];
    const inSquadIds = new Set(unitSlots.map((s) => s.unitId));

    const slotMeta = [
      { pos: 'Frontline · Top', shortPos: 'Front 1', col: 'front', row: 'top' },
      { pos: 'Frontline · Bot', shortPos: 'Front 2', col: 'front', row: 'bot' },
      { pos: 'Rearline · Top', shortPos: 'Rear 3', col: 'rear', row: 'top' },
      { pos: 'Rearline · Bot', shortPos: 'Rear 4', col: 'rear', row: 'bot' },
    ];

    const bonusPerLv = dataRegistry?.balance?.progression?.unitLevelStatBonus ?? 0.08;
    const nextScale = selectedUnit ? 1 + Math.max(0, selectedUnit.level) * bonusPerLv : 1;

    const detailRoleStat = selectedUnit
      ? selectedUnit.scaledStats.healPower > 0
        ? {
            label: 'HEAL',
            val: selectedUnit.scaledStats.healPower,
            nextVal: Math.round((selectedUnit.stats?.healPower || 0) * nextScale),
          }
        : selectedUnit.scaledStats.shieldPower > 0
          ? {
              label: 'SHIELD',
              val: selectedUnit.scaledStats.shieldPower,
              nextVal: Math.round((selectedUnit.stats?.shieldPower || 0) * nextScale),
            }
          : {
              label: 'ATK',
              val: selectedUnit.scaledStats.attack,
              nextVal: Math.round((selectedUnit.stats?.attack || 0) * nextScale),
            }
      : { label: 'ATK', val: 0, nextVal: 0 };

    const nextHp = selectedUnit ? Math.round((selectedUnit.stats?.maxHp || 0) * nextScale) : 0;
    const nextDef = selectedUnit ? Math.round((selectedUnit.stats?.defense || 0) * nextScale) : 0;

    const canUpgradeSelected =
      selectedUnit &&
      selectedUnit.unlocked &&
      selectedUnit.level < selectedUnit.maxLevel &&
      gameState.resources.credits >= selectedUnit.upgradeCreditCost &&
      xpChips >= selectedUnit.upgradeChipCost;
    const isAlreadyInSelectedSlot = activeSlot?.unitId === selectedUnit?.id;

    const isAstraActive = isAstraHero(activeCommander);

    const slotNumbersByUnit = new Map();
    for (const s of unitSlots) {
      if (!slotNumbersByUnit.has(s.unitId)) slotNumbersByUnit.set(s.unitId, []);
      slotNumbersByUnit.get(s.unitId).push(s.slotIndex + 1);
    }
    const canPreviewNext =
      selectedUnit && selectedUnit.unlocked && selectedUnit.level < selectedUnit.maxLevel;
    const unitStatCells = selectedUnit
      ? [
          { label: 'HP', val: selectedUnit.scaledStats.maxHp, next: nextHp },
          { label: detailRoleStat.label, val: detailRoleStat.val, next: detailRoleStat.nextVal },
          { label: 'DEF', val: selectedUnit.scaledStats.defense, next: nextDef },
          { label: 'RNG', val: selectedUnit.stats?.attackRange ?? 48, next: null },
          { label: 'SPD', val: selectedUnit.stats?.moveSpeed ?? 85, next: null },
        ]
      : [];
    const replacedUnitName = activeSlot?.unit?.name || activeSlot?.unitId || '';

    const renderSlot = (idx) => {
      const slot = unitSlots[idx];
      const u = slot?.unit;
      const isSel = idx === selectedSlotIdx;
      const meta = slotMeta[idx] || { pos: `Slot ${idx + 1}` };
      const rLower = (u?.rarity || 'R').toLowerCase();
      const unitName = u?.name || slot?.unitId || 'Empty';
      return `
        <div
          class="squad-slot ${isSel ? 'is-selected' : ''}"
          data-select-slot="${idx}"
          role="button"
          tabindex="0"
          aria-pressed="${isSel}"
          aria-label="Slot ${idx + 1}, ${meta.pos}: ${escAttr(unitName)}"
        >
          <div class="squad-slot__art">
            <span class="squad-slot__index tabular-nums" aria-hidden="true">${idx + 1}</span>
            <img data-unit-art="${u?.spriteAssetId || ''}" alt="${escAttr(unitName)}" />
          </div>
          <div class="squad-slot__body">
            <div class="squad-slot__title">
              <span class="squad-slot__name">${unitName}</span>
              ${isSel ? '<span class="squad-slot__tag">Editing</span>' : ''}
            </div>
            <div class="squad-slot__meta tabular-nums">
              <span class="rarity-${rLower}">${u?.rarity || 'R'}</span>
              <span>Lv.${u?.level ?? 1}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="squad-slot__role">${u?.role || ''}</span>
            </div>
            <div class="squad-slot__foot">
              <span class="squad-slot__cost tabular-nums">${u?.cost ?? 20} E</span>
              <span class="squad-slot__swap">
                ${
                  idx > 0
                    ? `<button type="button" class="squad-swap-btn tabular-nums" data-swap-left="${idx}" title="Swap with Slot ${idx}" aria-label="Swap with Slot ${idx}">⇄ ${idx}</button>`
                    : ''
                }
                ${
                  idx < 3
                    ? `<button type="button" class="squad-swap-btn tabular-nums" data-swap-right="${idx}" title="Swap with Slot ${idx + 2}" aria-label="Swap with Slot ${idx + 2}">⇄ ${idx + 2}</button>`
                    : ''
                }
              </span>
            </div>
          </div>
        </div>
      `;
    };

    bodyEl.innerHTML = `
      <div class="formation-workspace formation-workspace--squad">
        <section class="surface surface--celestial workspace-pane formation-pane formation-board-pane ${activeTheme}" aria-label="Starting Formation">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker section-kicker--gold">Starting Formation</div>
              <h2 class="section-heading">Squad Lineup</h2>
            </div>
            <span class="formation-pane__hint">
              Editing <strong class="tabular-nums">Slot ${selectedSlotIdx + 1}</strong> · pick a unit from the collection
            </span>
          </div>

          <div class="formation-board" aria-label="Starting Battlefield Formation Preview">
            <aside class="formation-board__commander" aria-label="Active Commander and Selection">
              <div class="formation-commander-display">
                <div class="formation-commander-card-wrap">
                  ${
                    isAstraActive
                      ? `<div id="formation-astra-card-slot" class="formation-commander-card-slot" data-astra-card-slot="formation-commander" title="Inspect ${escAttr(activeCommander?.name || 'Astra Valen')} in Commanders"></div>`
                      : `
                        <button
                          type="button"
                          class="formation-commander-card-fallback"
                          data-inspect-active-commander="${activeCommander?.id || ''}"
                          title="Inspect ${escAttr(activeCommander?.name || 'Active Commander')} in Commanders"
                        >
                          <img data-cmd-portrait="${activeCommander?.portraitAssetId || ''}" alt="${escAttr(activeCommander?.name || 'Active Commander')}" />
                        </button>
                      `
                  }
                </div>
                <div class="formation-commander-meta">
                  <span class="formation-lane__label">Commander</span>
                  <strong class="formation-commander-meta__name">${activeCommander?.name || 'Astra Valen'}</strong>
                  <span class="formation-commander-meta__skill">
                    <span class="formation-commander-meta__skill-label">Passive</span>
                    ${activeCommander?.passiveSkill?.name || '—'}
                  </span>
                  <span class="formation-commander-meta__skill is-ultimate">
                    <span class="formation-commander-meta__skill-label">Ultimate</span>
                    ${activeCommander?.ultimateSkill?.name || '—'}
                  </span>
                </div>
              </div>

              <div class="formation-commander-picker">
                <span class="formation-pane__label">Select Commander</span>
                <div class="commander-picker-list" id="commander-selector-row" role="listbox" aria-label="Owned Commanders">
                  ${ownedCommanders
                    .map(
                      (hero) => `
                        <button
                          type="button"
                          role="option"
                          class="commander-option theme-${hero.id} ${hero.id === activeCommander?.id ? 'is-active' : ''}"
                          data-commander-id="${hero.id}"
                          aria-selected="${hero.id === activeCommander?.id}"
                          aria-pressed="${hero.id === activeCommander?.id}"
                        >
                          <span class="commander-option__indicator" aria-hidden="true"></span>
                          <span class="commander-option__name">${hero.name}</span>
                          <span class="commander-option__level rarity-${(hero.rarity || 'R').toLowerCase()} tabular-nums">Lv.${hero.level}</span>
                        </button>
                      `,
                    )
                    .join('')}
                </div>
              </div>
            </aside>

            <div id="formation-unit-slots" class="formation-lanes">
              <div class="formation-lane">
                <div class="formation-lane__label">Rearline <small class="tabular-nums">Slots 3–4</small></div>
                ${renderSlot(2)}
                ${renderSlot(3)}
              </div>
              <div class="formation-lane formation-lane--front">
                <div class="formation-lane__label">Frontline <small class="tabular-nums">Slots 1–2</small></div>
                ${renderSlot(0)}
                ${renderSlot(1)}
              </div>
            </div>
          </div>
        </section>

        <section class="surface workspace-pane formation-pane" aria-label="Unit Collection">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker">Unit Collection</div>
              <h2 class="section-heading tabular-nums">${unlockedUnits.length} / ${allUnits.length} Unlocked</h2>
            </div>
            <span class="formation-pane__meta tabular-nums">
              <span>${formatNumber(gameState.resources.credits)} Cr</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span style="color: var(--accent-blue-bright);">${formatNumber(xpChips)} XP Chips</span>
            </span>
          </div>

          <div class="scroll-pane formation-pane__scroll">
            <div id="formation-unit-roster" class="unit-collection-grid">
              ${allUnits
                .map((u) => {
                  const isSel = selectedUnit?.id === u.id;
                  const squadSlots = slotNumbersByUnit.get(u.id) || [];
                  const inSquad = inSquadIds.has(u.id);
                  const rLower = (u.rarity || 'R').toLowerCase();
                  return `
                    <button
                      type="button"
                      class="unit-tile unit-tile--${rLower} ${isSel ? 'is-selected' : ''} ${u.unlocked ? '' : 'is-locked'}"
                      data-select-unit="${u.id}"
                      aria-pressed="${isSel}"
                    >
                      <div class="unit-tile__top">
                        <span class="rarity-${rLower} tabular-nums">
                          ${u.unlocked ? `${u.rarity} · Lv.${u.level}` : 'Locked'}
                        </span>
                        ${
                          inSquad
                            ? `<span class="unit-tile__deployed tabular-nums" title="In starting squad">Slot ${squadSlots.join(', ')}</span>`
                            : ''
                        }
                      </div>
                      <div class="unit-tile__art">
                        <img data-unit-art="${u.spriteAssetId}" alt="${escAttr(u.name)}" />
                      </div>
                      <div class="unit-tile__name">${u.name}</div>
                      <div class="unit-tile__role">${u.role}</div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          ${
            selectedUnit
              ? `
                <div class="unit-detail-dock" aria-label="Selected Unit Details">
                  <div class="unit-detail-dock__head">
                    <div class="unit-detail-dock__art">
                      <img data-unit-art="${selectedUnit.spriteAssetId}" alt="${escAttr(selectedUnit.name)}" />
                    </div>
                    <div class="unit-detail-dock__identity">
                      <div class="unit-detail-dock__title">
                        <strong>${selectedUnit.name}</strong>
                        <span class="rarity-${(selectedUnit.rarity || 'R').toLowerCase()}">${selectedUnit.rarity}</span>
                      </div>
                      <div class="meta-line tabular-nums unit-detail-dock__meta">
                        <span>${selectedUnit.unlocked ? `Lv.${selectedUnit.level}/${selectedUnit.maxLevel}` : 'Locked'}</span>
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span>${selectedUnit.role}</span>
                        ${
                          selectedUnit.realm
                            ? `<span class="meta-sep" aria-hidden="true">·</span><span>${selectedUnit.realm}</span>`
                            : ''
                        }
                        ${
                          selectedUnit.traitLabel
                            ? `<span class="meta-sep" aria-hidden="true">·</span><span style="color: var(--accent-gold-bright);">${selectedUnit.traitLabel}</span>`
                            : ''
                        }
                        <span class="meta-sep" aria-hidden="true">·</span>
                        <span style="color: var(--accent-blue-bright);">${selectedUnit.cost} E</span>
                      </div>
                    </div>
                  </div>

                  <div class="unit-stat-row tabular-nums">
                    ${unitStatCells
                      .map(
                        (cell) => `
                          <div class="unit-stat">
                            <span class="unit-stat__label">${cell.label}</span>
                            <span class="unit-stat__value">${cell.val}</span>
                            ${
                              canPreviewNext && cell.next !== null
                                ? `<span class="unit-stat__next" title="At Lv.${selectedUnit.level + 1}">→ ${cell.next}</span>`
                                : ''
                            }
                          </div>
                        `,
                      )
                      .join('')}
                  </div>

                  ${
                    selectedUnit.description
                      ? `<p class="unit-detail-dock__desc" title="${escAttr(selectedUnit.description)}">${selectedUnit.description}</p>`
                      : ''
                  }

                  <div class="unit-detail-dock__actions">
                    ${
                      selectedUnit.unlocked
                        ? `
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            data-assign-unit="${selectedUnit.id}"
                            ${isAlreadyInSelectedSlot ? 'disabled' : ''}
                          >
                            ${isAlreadyInSelectedSlot ? `Assigned to Slot ${selectedSlotIdx + 1}` : `Assign to Slot ${selectedSlotIdx + 1}`}
                          </button>
                          <button
                            type="button"
                            class="btn ${canUpgradeSelected ? 'btn-gold' : 'btn-secondary'} btn-sm"
                            data-upgrade-unit="${selectedUnit.id}"
                            ${selectedUnit.level >= selectedUnit.maxLevel || !canUpgradeSelected ? 'disabled' : ''}
                          >
                            ${
                              selectedUnit.level >= selectedUnit.maxLevel
                                ? 'Max Level'
                                : `Upgrade → Lv.${selectedUnit.level + 1} (${selectedUnit.upgradeCreditCost} Cr · ${selectedUnit.upgradeChipCost} Chips)`
                            }
                          </button>
                          ${
                            !isAlreadyInSelectedSlot && replacedUnitName
                              ? `<span class="unit-detail-dock__hint">Replaces ${replacedUnitName} · or double-click a unit</span>`
                              : ''
                          }
                        `
                        : `<span class="unit-detail-dock__hint">Unlock this unit via Campaign milestones or Armory Requisition.</span>`
                    }
                  </div>
                </div>
              `
              : ''
          }
        </section>
      </div>
    `;

    for (const imgEl of bodyEl.querySelectorAll('[data-cmd-portrait]')) {
      const aid = imgEl.getAttribute('data-cmd-portrait');
      if (aid) assetManager.bindImageElement(imgEl, aid);
    }
    for (const imgEl of bodyEl.querySelectorAll('[data-unit-art]')) {
      const aid = imgEl.getAttribute('data-unit-art');
      if (aid) assetManager.bindImageElement(imgEl, aid);
    }

    const inspectActiveCommander = () => {
      if (!activeCommander?.id) return;
      audioManager.playClick();
      gameState.setUI({ selectedHeroId: activeCommander.id });
      this._ctx.screenManager.navigate('heroes');
    };

    if (isAstraActive && activeCommander) {
      const astraSlot = bodyEl.querySelector('#formation-astra-card-slot');
      this._astraCards.mount(astraSlot, {
        hero: activeCommander,
        extraData: { activeCommander: true },
        selectable: true,
        selected: false,
        studio: false,
        onClick: inspectActiveCommander,
        assetManager,
        fallbackAssetId: activeCommander.portraitAssetId,
      });
    } else {
      bodyEl
        .querySelector('[data-inspect-active-commander]')
        ?.addEventListener('click', inspectActiveCommander);
    }

    for (const el of bodyEl.querySelectorAll('[data-select-slot]')) {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-swap-left], [data-swap-right]')) return;
        const idx = Number(el.getAttribute('data-select-slot'));
        const slot = unitSlots[idx];
        audioManager.playClick();
        gameState.setUI({
          selectedSquadSlot: idx,
          selectedRosterUnitId: slot?.unitId || gameState.ui.selectedRosterUnitId,
        });
        this.render();
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          el.click();
        }
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-swap-left]')) {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = Number(btn.getAttribute('data-swap-left'));
        formationSystem.swapUnitSlots(idx, idx - 1);
        gameState.setUI({ selectedSquadSlot: Math.max(0, idx - 1) });
        audioManager.playClick();
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-swap-right]')) {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = Number(btn.getAttribute('data-swap-right'));
        formationSystem.swapUnitSlots(idx, idx + 1);
        gameState.setUI({ selectedSquadSlot: Math.min(3, idx + 1) });
        audioManager.playClick();
      });
    }

    for (const tile of bodyEl.querySelectorAll('[data-select-unit]')) {
      tile.addEventListener('click', () => {
        const uid = tile.getAttribute('data-select-unit');
        audioManager.playClick();
        gameState.setUI({ selectedRosterUnitId: uid });
        this.render();
      });
      tile.addEventListener('dblclick', () => {
        const uid = tile.getAttribute('data-select-unit');
        const res = formationSystem.setUnitSlot(selectedSlotIdx, uid);
        if (res.ok) {
          audioManager.playDeploy();
          const unitDef = formationSystem.getUnitProgress(uid);
          this._ctx.notify(`${unitDef?.name || uid} assigned to Slot ${selectedSlotIdx + 1}.`, 'success');
        } else if (res.reason) {
          audioManager.playInvalid();
          this._ctx.notify(res.reason, 'warn');
        }
      });
    }

    bodyEl.querySelector('[data-assign-unit]')?.addEventListener('click', (ev) => {
      const uid = ev.currentTarget.getAttribute('data-assign-unit');
      const res = formationSystem.setUnitSlot(selectedSlotIdx, uid);
      if (res.ok) {
        audioManager.playDeploy();
        const unitDef = formationSystem.getUnitProgress(uid);
        this._ctx.notify(`${unitDef?.name || uid} assigned to Slot ${selectedSlotIdx + 1}.`, 'success');
      } else if (res.reason) {
        audioManager.playInvalid();
        this._ctx.notify(res.reason, 'warn');
      }
    });

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
    const refillSec = cardSystem.getRefillIntervalSec();
    const cardCatFilter = gameState.ui.cardCategoryFilter || 'all';
    const unlockedCardSet = new Set(cardSystem.getUnlockedCardIds());
    const unlockedCards = dataRegistry.cards.filter((c) => unlockedCardSet.has(c.id));
    const visibleCards =
      cardCatFilter === 'all'
        ? unlockedCards
        : unlockedCards.filter((c) => (c.category || 'unit') === cardCatFilter);

    const draftCounts = { unit: 0, skill: 0, tactic: 0, support: 0 };
    const draftNames = new Set();
    for (const cid of this._draftDeck) {
      const def = dataRegistry.cardsById.get(cid);
      const cat = def?.category || 'unit';
      if (draftCounts[cat] !== undefined) draftCounts[cat] += 1;
      const normName = def?.name ? String(def.name).trim().toLowerCase() : '';
      if (normName) draftNames.add(normName);
    }

    const draftValidation = cardSystem.validateDeck(this._draftDeck, { requireUnlocked: true });
    const savedValidation = cardSystem.validateDeck(savedDeck, { requireUnlocked: true });
    const isDraftMatchesSaved =
      draftValidation.ok &&
      savedDeck.length === this._draftDeck.length &&
      savedDeck.every((id, idx) => id === this._draftDeck[idx]);
    const deckStatusMessage =
      unlockedCards.length < deckSize
        ? `Unlock at least ${deckSize} unique cards (${unlockedCards.length}/${deckSize} owned) to enter battle.`
        : draftValidation.ok
          ? isDraftMatchesSaved
            ? `Saved and ready · Battle slots draw randomly with replacement (${refillSec}s refill).`
            : `Deck complete (${deckSize}/${deckSize}) · Save Deck to apply your changes.`
          : draftValidation.reason;

    const categoryCounts = { all: unlockedCards.length, unit: 0, skill: 0, tactic: 0, support: 0 };
    for (const c of unlockedCards) {
      const cat = c.category || 'unit';
      if (categoryCounts[cat] !== undefined) categoryCounts[cat] += 1;
    }
    const deckStatus = !draftValidation.ok
      ? { key: 'incomplete', label: 'Incomplete' }
      : isDraftMatchesSaved
        ? { key: 'saved', label: 'Saved' }
        : { key: 'dirty', label: 'Unsaved changes' };

    bodyEl.innerHTML = `
      <div class="formation-workspace formation-workspace--deck">
        <section class="surface workspace-pane formation-pane" aria-label="Card Pool">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker">Card Pool</div>
              <h2 class="section-heading">Available Cards</h2>
              <div class="formation-pane__hint tabular-nums">${unlockedCards.length} unlocked · choose ${deckSize} unique cards</div>
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
                      ${label}<span class="segmented-btn__count tabular-nums">${categoryCounts[cat] ?? 0}</span>
                    </button>
                  `,
                )
                .join('')}
            </div>
          </div>

          <div class="scroll-pane formation-pane__scroll">
            <div class="deck-builder-grid" id="deck-builder-grid">
              ${visibleCards
                .map((card) => {
                  const isSelected = this._hasInDraft(card.id);
                  const normName = String(card.name || '').trim().toLowerCase();
                  const duplicateName = !isSelected && normName && draftNames.has(normName);
                  const isFull = this._draftDeck.length >= deckSize;
                  const canAdd = !isSelected && !duplicateName && !isFull;
                  const cat = card.category || 'unit';
                  return `
                    <div
                      class="deck-card-row deck-card-row--${cat} ${isSelected ? 'is-in-deck' : ''} ${!isSelected && !canAdd ? 'is-unavailable' : ''}"
                      data-card-id="${card.id}"
                      title="${escAttr([card.description, card.upgradeSummary].filter(Boolean).join(' · '))}"
                    >
                      <div class="deck-card-row__icon">
                        <img data-deck-icon="${card.iconAssetId}" alt="${escAttr(card.name)}" />
                      </div>
                      <div class="deck-card-row__body">
                        <div class="deck-card-row__name">${card.name}</div>
                        <div class="deck-card-row__meta tabular-nums">
                          <span class="rarity-${(card.rarity || 'R').toLowerCase()}">${card.rarity || 'R'}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span class="cat-text-${cat}">${CATEGORY_LABELS[cat]}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span>${card.cost} E</span>
                        </div>
                        ${card.description ? `<div class="deck-card-row__desc">${card.description}</div>` : ''}
                      </div>
                      <div class="deck-stepper">
                        ${
                          isSelected
                            ? `
                              <span class="deck-selected-badge">✓ In Deck</span>
                              <button
                                type="button"
                                class="btn btn-secondary deck-stepper__btn"
                                aria-label="Remove ${escAttr(card.name)}"
                                data-deck-remove="${card.id}"
                              >
                                Remove
                              </button>
                            `
                            : `
                              <button
                                type="button"
                                class="btn btn-primary deck-stepper__btn"
                                aria-label="Add ${escAttr(card.name)}"
                                data-deck-add="${card.id}"
                                ${!canAdd ? 'disabled' : ''}
                              >
                                ${duplicateName ? 'Duplicate' : isFull ? 'Full' : 'Add'}
                              </button>
                            `
                        }
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </section>

        <aside class="surface surface--celestial workspace-pane formation-pane deck-panel" aria-label="Active Deck Composition">
          <div class="workspace-pane__head">
            <div>
              <div class="section-kicker section-kicker--gold">Battle Deck</div>
              <h2 class="section-heading tabular-nums">${this._draftDeck.length} / ${deckSize} Cards</h2>
            </div>
            <span class="deck-panel__status is-${deckStatus.key}">${deckStatus.label}</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill progress-fill--gold" style="width: ${Math.min(100, (this._draftDeck.length / deckSize) * 100)}%;"></div>
          </div>

          <div class="deck-mix tabular-nums" aria-label="Deck composition by category">
            ${['unit', 'skill', 'tactic', 'support']
              .map(
                (cat) => `
                  <div class="deck-mix__item deck-mix__item--${cat}">
                    <span class="deck-mix__label">${CATEGORY_LABELS[cat]}</span>
                    <span class="deck-mix__value">${draftCounts[cat]}</span>
                  </div>
                `,
              )
              .join('')}
          </div>

          <div class="deck-draft-list" id="deck-draft-slots">
            ${Array.from({ length: deckSize }, (_, idx) => {
              const cid = this._draftDeck[idx];
              if (!cid) {
                return `
                  <div class="deck-slot deck-slot--empty">
                    <span class="tabular-nums">Slot ${idx + 1}</span>
                    <span>Empty</span>
                  </div>
                `;
              }
              const card = dataRegistry.cardsById.get(cid);
              const cat = card?.category || 'unit';
              return `
                <button type="button" class="deck-slot deck-slot--${cat}" data-deck-remove="${cid}" title="Remove ${escAttr(card?.name || cid)}">
                  <span class="deck-slot__icon">
                    <img data-deck-icon="${card?.iconAssetId || ''}" alt="" />
                  </span>
                  <span class="deck-slot__body">
                    <span class="deck-slot__name">${card?.name || cid}</span>
                    <span class="deck-slot__meta tabular-nums">
                      <span class="cat-text-${cat}">${CATEGORY_LABELS[cat]}</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span>${card?.cost ?? 0} E</span>
                    </span>
                  </span>
                  <span class="deck-slot__remove" aria-hidden="true">×</span>
                </button>
              `;
            }).join('')}
          </div>

          <p id="deck-validation-message" class="deck-validation-msg ${draftValidation.ok ? 'is-valid' : 'is-warn'}">
            ${deckStatusMessage}
          </p>

          <div class="deck-panel__actions">
            <button type="button" id="btn-deck-auto" class="btn btn-ghost btn-sm" title="Fill with a recommended ${deckSize}-card deck and save it">
              Auto-Fill
            </button>
            <button
              type="button"
              id="btn-deck-save"
              class="btn btn-primary btn-sm"
              ${!draftValidation.ok ? 'disabled' : ''}
            >
              Save Deck
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
        const def = dataRegistry.cardsById.get(cid);
        if (!def) return;
        const normName = String(def.name || '').trim().toLowerCase();
        const currentNames = this._getDraftCardNames();
        if (this._hasInDraft(cid) || (normName && currentNames.has(normName))) {
          audioManager.playInvalid();
          this._ctx.notify(`"${def.name}" is already in your deck.`, 'warn');
          return;
        }
        if (this._draftDeck.length >= deckSize) {
          audioManager.playInvalid();
          this._ctx.notify(`Deck already has ${deckSize} unique cards. Remove one first.`, 'warn');
          return;
        }
        this._draftDeck.push(cid);
        audioManager.playCardSelect();
        this.render();
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
        this._draftDeck = [...res.battleDeck];
        audioManager.playReward();
        this._ctx.notify('6-card unique battle deck saved.', 'success');
        this.render();
      } else if (res.reason) {
        audioManager.playInvalid();
        this._ctx.notify(res.reason, 'warn');
      }
    });

    bodyEl.querySelector('#btn-deck-auto')?.addEventListener('click', () => {
      const defaultIds = cardSystem.buildDefaultDeckIds();
      this._draftDeck = [...defaultIds];
      if (defaultIds.length === deckSize) {
        const res = cardSystem.setCustomDeck(defaultIds);
        if (res.ok) {
          audioManager.playReward();
          this._ctx.notify('Loaded and saved 6-card tactical deck.', 'success');
          this.render();
          return;
        }
      }
      audioManager.playInvalid();
      this._ctx.notify(`Need at least ${deckSize} unlocked cards to complete a deck.`, 'warn');
      this.render();
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
    const bossWave = (selectedStage?.waves || []).find((w) => w.boss?.bossId);
    const bossDef = bossWave ? dataRegistry.bossesById?.get(bossWave.boss.bossId) : null;
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
              <div class="section-kicker">Realm Campaign Map</div>
              <h2 class="section-heading" style="margin-top: 2px;">Campaign Stages (${stages.filter((s) => s.cleared).length} / ${stages.length} Cleared)</h2>
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
                  const stageBossWave = (stage.waves || []).find((w) => w.boss?.bossId);
                  return `
                    <button
                      type="button"
                      class="stage-card ${isSelected ? 'is-selected' : ''} ${stage.unlocked ? '' : 'is-locked'}"
                      data-stage-id="${stage.id}"
                      ${stage.unlocked ? '' : 'disabled'}
                    >
                      <div class="workspace-pane__head" style="width: 100%;">
                        <strong style="font-size: 0.9rem; color: var(--text-primary);">Stage ${stage.code} · ${stage.name}</strong>
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
                        ${
                          stageBossWave
                            ? '<span class="meta-sep" aria-hidden="true">·</span><span style="color: var(--state-enemy); font-weight: 700;">Boss</span>'
                            : ''
                        }
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

        <aside class="surface surface--celestial workspace-pane" aria-label="Selected Stage Briefing">
          <div>
            <div class="section-kicker section-kicker--gold">Battle Briefing</div>
            <h2 class="section-heading" style="font-size: 1.28rem; margin-top: 4px;">
              Stage ${selectedStage?.code || '1-1'} · ${selectedStage?.name || 'Outer Bastion'}
            </h2>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin-top: 8px;">
              ${selectedStage?.description || ''}
            </p>
            ${
              terrainDef?.atmosphere
                ? `<p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px;">${terrainDef.atmosphere}</p>`
                : ''
            }
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
              <span class="kv-label">Battlefield Realm</span>
              <span class="kv-value">${terrainDef?.realmTitle || terrainDef?.name || 'Celestial Bastion'}</span>
            </div>
            ${
              bossDef
                ? `
                  <div class="kv-row">
                    <span class="kv-label">Boss Threat</span>
                    <span class="kv-value boss-threat-value">${bossDef.name}</span>
                  </div>
                `
                : ''
            }
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
      const check = this._ctx.cardSystem.isDeckReadyForBattle();
      if (!check.ok) {
        audioManager.playInvalid();
        this._ctx.notify(check.reason, 'warn');
        gameState.setUI({ formationTab: 'deck' });
        this.render();
        return;
      }
      audioManager.playClick();
      screenManager.navigate('battle');
    });
  }
}
