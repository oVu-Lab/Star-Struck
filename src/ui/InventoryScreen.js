/**
 * InventoryScreen (P4 Structural Redesign) — Master-Detail Logistics & Card Armory
 * pairing high-density category-filtered supply/card grids with a persistent
 * right-hand Detail Inspector displaying enlarged emblems, stats, and Lv.I–III scaling.
 */

import { formatNumber } from '../utils/MathUtils.js';

const CATEGORY_TITLES = {
  all: 'All',
  unit: 'Unit',
  skill: 'Skill',
  tactic: 'Tactic',
  support: 'Support',
};

export class InventoryScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
  }

  mount(container) {
    this._container = container;
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
    );
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  render() {
    if (!this._container) return;
    const { gameState, cardSystem, dataRegistry, assetManager, audioManager } = this._ctx;
    const filter = gameState.ui.inventoryFilter || 'all';
    const cardSubCat = gameState.ui.inventoryCardCat || 'all';
    const res = gameState.resources;

    const currencyEntries = [
      {
        id: 'currency_credits',
        name: 'Credits',
        category: 'currencies',
        quantity: res.credits,
        description: 'Standard tactical currency used for unit and commander upgrades.',
      },
      {
        id: 'currency_astrite',
        name: 'Astrite',
        category: 'currencies',
        quantity: res.astrite,
        description: 'Premium resonance crystal used for Commander and Tactical Armory recruitment.',
      },
      {
        id: 'currency_stamina',
        name: 'Deployment Stamina',
        category: 'currencies',
        quantity: res.stamina,
        description: `Operational energy for campaign stages (Cap: ${res.maxStamina}).`,
      },
    ];

    const allItems = [...currencyEntries, ...gameState.inventory.items];
    const unlockedCardSet = new Set(cardSystem.getUnlockedCardIds());
    const allCards = dataRegistry.cards || [];
    const unlockedCount = allCards.filter((c) => unlockedCardSet.has(c.id)).length;

    const visibleItems =
      filter === 'all' ? allItems : allItems.filter((item) => item.category === filter);
    const visibleCards =
      cardSubCat === 'all'
        ? allCards
        : allCards.filter((c) => (c.category || 'unit') === cardSubCat);

    const isCardsView = filter === 'cards';
    const selectedId = gameState.ui.selectedInventoryId;
    const selectedCard = isCardsView
      ? visibleCards.find((c) => c.id === selectedId) || visibleCards[0] || null
      : null;
    const selectedItem = !isCardsView
      ? visibleItems.find((i) => i.id === selectedId) || visibleItems[0] || null
      : null;

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Inventory and Card Collection">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Inventory &amp; Armory</h1>
            <span class="meta-line tabular-nums">
              <span>${unlockedCount} / ${allCards.length} Tactical Cards</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>${allItems.length} Supply Entries</span>
            </span>
          </div>

          <div class="segmented-bar" role="tablist" aria-label="Filter inventory category">
            ${[
              { id: 'all', label: 'All Supplies' },
              { id: 'currencies', label: 'Currencies' },
              { id: 'materials', label: 'Materials' },
              { id: 'consumables', label: 'Consumables' },
              { id: 'cards', label: `Cards (${unlockedCount}/${allCards.length})` },
            ]
              .map(
                (tab) => `
                  <button
                    type="button"
                    role="tab"
                    aria-selected="${filter === tab.id}"
                    class="segmented-btn ${filter === tab.id ? 'is-active' : ''}"
                    data-inv-filter="${tab.id}"
                  >
                    ${tab.label}
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>

        <div class="inventory-workspace">
          <div class="surface workspace-pane">
            <div class="workspace-pane__head">
              <div>
                <div class="section-kicker">${isCardsView ? 'Collectible Tactical Armory' : 'Orbital Logistics Depot'}</div>
                <h2 class="section-heading" style="margin-top: 2px;">
                  ${isCardsView ? `Tactical Cards (${visibleCards.length})` : `Supplies (${visibleItems.length})`}
                </h2>
              </div>

              ${
                isCardsView
                  ? `
                    <div class="segmented-bar" role="tablist" aria-label="Filter tactical cards by type">
                      ${Object.entries(CATEGORY_TITLES)
                        .map(
                          ([cat, label]) => `
                            <button
                              type="button"
                              role="tab"
                              aria-selected="${cardSubCat === cat}"
                              class="segmented-btn ${cardSubCat === cat ? 'is-active' : ''}"
                              data-card-subcat="${cat}"
                            >
                              ${label}
                            </button>
                          `,
                        )
                        .join('')}
                    </div>
                  `
                  : ''
              }
            </div>

            <div class="scroll-pane" style="flex: 1;">
              ${
                isCardsView
                  ? `
                    <div class="armory-card-grid">
                      ${visibleCards
                        .map((card) => {
                          const unlocked = unlockedCardSet.has(card.id);
                          const cat = card.category || 'unit';
                          const rarity = card.rarity || 'R';
                          const rarityLower = rarity.toLowerCase();
                          const isSelected = selectedCard?.id === card.id;
                          return `
                            <button
                              type="button"
                              class="armory-card-tile armory-card-tile--${cat} armory-card-tile--${rarityLower} ${unlocked ? '' : 'is-locked'} ${isSelected ? 'is-selected' : ''}"
                              data-select-entry="${card.id}"
                            >
                              <div class="armory-card-tile__emblem">
                                <img data-card-emblem="${card.iconAssetId}" alt="${card.name}" />
                              </div>
                              <div style="min-width: 0; flex: 1;">
                                <div style="font-family: var(--font-display); font-size: 0.86rem; font-weight: 600; color: var(--celestial-ivory); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                  ${card.name}
                                </div>
                                <div class="meta-line tabular-nums" style="font-size: 0.72rem; margin-top: 2px;">
                                  <span class="rarity-${rarityLower}">${unlocked ? rarity : 'Locked'}</span>
                                  <span class="meta-sep" aria-hidden="true">·</span>
                                  <span class="cat-text-${cat}">${CATEGORY_TITLES[cat]}</span>
                                  <span class="meta-sep" aria-hidden="true">·</span>
                                  <span>${card.cost}E</span>
                                </div>
                              </div>
                            </button>
                          `;
                        })
                        .join('')}
                    </div>
                  `
                  : `
                    <div class="inventory-grid">
                      ${visibleItems
                        .map((item) => {
                          const isSelected = selectedItem?.id === item.id;
                          return `
                            <button
                              type="button"
                              class="item-tile ${isSelected ? 'is-selected' : ''}"
                              data-select-entry="${item.id}"
                            >
                              <div class="workspace-pane__head" style="width: 100%;">
                                <strong style="font-size: 0.92rem; color: var(--celestial-ivory);">${item.name}</strong>
                                <span class="item-tile__qty tabular-nums" style="${item.id === 'currency_astrite' ? 'color: var(--accent-gold-bright);' : ''}">
                                  ${formatNumber(item.quantity)}
                                </span>
                              </div>
                              <div class="meta-line" style="font-size: 0.74rem;">
                                <span>${item.category.charAt(0).toUpperCase() + item.category.slice(1)}</span>
                              </div>
                              <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">
                                ${item.description}
                              </p>
                            </button>
                          `;
                        })
                        .join('')}
                    </div>
                  `
              }
            </div>
          </div>

          <aside class="surface workspace-pane" aria-label="Selected Item Inspector">
            ${
              isCardsView && selectedCard
                ? (() => {
                    const unlocked = unlockedCardSet.has(selectedCard.id);
                    const cat = selectedCard.category || 'unit';
                    const rarity = selectedCard.rarity || 'R';
                    const rarityLower = rarity.toLowerCase();
                    return `
                      <div>
                        <div class="section-kicker">${CATEGORY_TITLES[cat]} Tactical Instruction</div>
                        <h2 class="section-heading" style="font-size: 1.26rem; margin-top: 3px;">${selectedCard.name}</h2>
                        <div class="meta-line tabular-nums" style="margin-top: 5px;">
                          <span class="rarity-${rarityLower}">${rarity}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span class="cat-text-${cat}">${CATEGORY_TITLES[cat]}</span>
                          <span class="meta-sep" aria-hidden="true">·</span>
                          <span>${unlocked ? 'Unlocked' : 'Locked'}</span>
                        </div>
                      </div>

                      <div class="inspector-emblem-stage">
                        <img id="inspector-card-img" alt="${selectedCard.name}" />
                      </div>

                      <p style="font-size: 0.86rem; color: var(--text-secondary); line-height: 1.55;">
                        ${selectedCard.description}
                      </p>

                      <div class="kv-list">
                        <div class="kv-row">
                          <span class="kv-label">Command Energy Cost</span>
                          <span class="kv-value tabular-nums">${selectedCard.cost} Energy</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">Slot Cooldown</span>
                          <span class="kv-value tabular-nums">${selectedCard.cooldownSec}s</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">Max Deck Copies</span>
                          <span class="kv-value tabular-nums">3</span>
                        </div>
                      </div>

                      <div class="dossier-skill" style="margin-top: auto;">
                        <div class="section-kicker section-kicker--gold">Merge Evolution (Lv.I → Lv.III)</div>
                        <p class="dossier-skill__desc" style="color: var(--celestial-ivory);">
                          ${selectedCard.upgradeSummary || 'Merge adjacent identical cards in battle to amplify potency.'}
                        </p>
                      </div>
                    `;
                  })()
                : selectedItem
                  ? `
                    <div>
                      <div class="section-kicker">${selectedItem.category}</div>
                      <h2 class="section-heading" style="font-size: 1.26rem; margin-top: 3px;">${selectedItem.name}</h2>
                    </div>

                    <div class="hairline"></div>

                    <div class="kv-list">
                      <div class="kv-row">
                        <span class="kv-label">Available Quantity</span>
                        <span class="kv-value tabular-nums" style="font-size: 1.15rem; color: ${selectedItem.id === 'currency_astrite' ? 'var(--accent-gold-bright)' : 'var(--accent-blue-bright)'};">
                          ${formatNumber(selectedItem.quantity)}
                        </span>
                      </div>
                      <div class="kv-row">
                        <span class="kv-label">Category</span>
                        <span class="kv-value">${selectedItem.category.charAt(0).toUpperCase() + selectedItem.category.slice(1)}</span>
                      </div>
                    </div>

                    <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55;">
                      ${selectedItem.description}
                    </p>
                  `
                  : '<p style="color: var(--text-muted);">Select an item to inspect details.</p>'
            }
          </aside>
        </div>
      </section>
    `;

    if (isCardsView) {
      for (const imgEl of this._container.querySelectorAll('[data-card-emblem]')) {
        const assetId = imgEl.getAttribute('data-card-emblem');
        if (assetId) assetManager.bindImageElement(imgEl, assetId);
      }
      const inspImg = this._container.querySelector('#inspector-card-img');
      if (inspImg && selectedCard) {
        assetManager.bindImageElement(inspImg, selectedCard.iconAssetId);
      }
    }

    for (const tab of this._container.querySelectorAll('[data-inv-filter]')) {
      tab.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({
          inventoryFilter: tab.getAttribute('data-inv-filter'),
          selectedInventoryId: null,
        });
        this.render();
      });
    }

    for (const sub of this._container.querySelectorAll('[data-card-subcat]')) {
      sub.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({
          inventoryCardCat: sub.getAttribute('data-card-subcat'),
          selectedInventoryId: null,
        });
        this.render();
      });
    }

    for (const entry of this._container.querySelectorAll('[data-select-entry]')) {
      entry.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ selectedInventoryId: entry.getAttribute('data-select-entry') });
        this.render();
      });
    }
  }
}
