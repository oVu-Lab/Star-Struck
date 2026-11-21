/**
 * CardSystem — 12-card battle deck, 6-slot tactical hand, four card categories
 * (unit, skill, tactic, support), adjacent identical card merging (Level I -> II -> III),
 * Command Energy validation, per-card cooldowns, and deck exhaustion handling.
 */

export const CARD_CATEGORIES = Object.freeze({
  UNIT: 'unit',
  SKILL: 'skill',
  TACTIC: 'tactic',
  SUPPORT: 'support',
});

export class CardSystem {
  constructor({ dataRegistry, gameState, saveManager = null, eventBus }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._save = saveManager;
    this._eventBus = eventBus;
    this._slots = [];
    this._deck = [];
    this._discardCount = 0;
    this._cooldowns = new Map(); // cardId -> remaining seconds
    this._instanceCounter = 1;
  }

  getUnlockedCardIds() {
    const list = this._state.progression?.unlockedCards;
    if (Array.isArray(list) && list.length > 0) {
      return list.filter((id) => this._data.cardsById.has(id));
    }
    return this._data.cards
      .filter((c) => c.unlockedByDefault !== false)
      .map((c) => c.id);
  }

  isCardUnlocked(cardId) {
    return this.getUnlockedCardIds().includes(cardId);
  }

  unlockCard(cardId) {
    if (!this._data.cardsById.has(cardId)) {
      return { ok: false, isNew: false, reason: 'Unknown card ID.' };
    }
    let isNew = false;
    this._state.mutatePersistent('progression', (draft) => {
      if (!Array.isArray(draft.progression.unlockedCards)) {
        draft.progression.unlockedCards = [];
      }
      if (!draft.progression.unlockedCards.includes(cardId)) {
        draft.progression.unlockedCards.push(cardId);
        isNew = true;
      }
    });
    if (isNew) {
      this._save?.save(this._state.toSerializableSave());
      this._eventBus?.emit('cards:unlocked', { cardId, card: this._data.cardsById.get(cardId) });
    }
    return { ok: true, isNew, card: this._data.cardsById.get(cardId) };
  }

  getCustomDeck() {
    const deck = this._state.formation?.battleDeck;
    return Array.isArray(deck) ? [...deck] : [];
  }

  /**
   * Validates and saves a custom 12-card battle deck (or clears it when empty to use auto-deck).
   */
  setCustomDeck(cardIds) {
    if (!Array.isArray(cardIds)) {
      return { ok: false, reason: 'Deck must be an array of card IDs.' };
    }
    if (cardIds.length === 0) {
      this._state.mutatePersistent('formation', (draft) => {
        draft.formation.battleDeck = [];
      });
      this._save?.save(this._state.toSerializableSave());
      this._eventBus?.emit('formation:deckChanged', { battleDeck: [] });
      return { ok: true, battleDeck: [] };
    }

    const deckSize = this.getDeckSize();
    if (cardIds.length !== deckSize) {
      return { ok: false, reason: `Battle deck must contain exactly ${deckSize} cards.` };
    }

    const unlocked = new Set(this.getUnlockedCardIds());
    let unitCardCount = 0;
    const copyCounts = new Map();
    for (const cid of cardIds) {
      const def = this._data.cardsById.get(cid);
      if (!def) return { ok: false, reason: `Unknown card "${cid}".` };
      if (!unlocked.has(cid)) return { ok: false, reason: `Card "${def.name}" is locked.` };
      const count = (copyCounts.get(cid) || 0) + 1;
      if (count > 3) {
        return { ok: false, reason: `Maximum 3 copies of "${def.name}" allowed per deck.` };
      }
      copyCounts.set(cid, count);
      if ((def.category || 'unit') === CARD_CATEGORIES.UNIT) {
        unitCardCount += 1;
      }
    }

    if (unitCardCount < 4) {
      return { ok: false, reason: 'Battle deck must include at least 4 Unit cards for reinforcements.' };
    }

    this._state.mutatePersistent('formation', (draft) => {
      draft.formation.battleDeck = [...cardIds];
    });
    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('formation:deckChanged', { battleDeck: [...cardIds] });
    return { ok: true, battleDeck: [...cardIds] };
  }

  getSlotCount() {
    return this._data.handConfig?.slotCount ?? 6;
  }

  getDeckSize() {
    return this._data.handConfig?.deckSize ?? this._data.balance?.deck?.deckSize ?? 12;
  }

  getMaxTier() {
    return this._data.handConfig?.maxTier ?? 3;
  }

  getRemainingDeckCount() {
    return this._deck.length;
  }

  getSlots() {
    return this._slots.map((slot, index) => (slot ? { ...slot, index } : null));
  }

  getCardCooldown(cardId) {
    return Math.max(0, this._cooldowns.get(cardId) || 0);
  }

  /**
   * Builds a 12-card battle deck combining the player's custom deck (if configured)
   * or formation unit cards with unlocked Skill, Tactic, and Support cards,
   * then deals 6 cards into the tactical hand.
   * For the default auto-deck, ensures slots 0 and 1 start as an adjacent identical
   * Level I pair and slot 2 differs so merging is immediately available and testable.
   */
  initHand({ customDeckIds = null } = {}) {
    const slotCount = this.getSlotCount();
    const deckIds = this._buildTwelveCardDeckIds(customDeckIds);

    this._slots = new Array(slotCount).fill(null);
    this._cooldowns.clear();
    this._discardCount = 0;

    // Deal first 6 cards into the 6 tactical slots; remaining 6 stay in the draw deck
    const drawPool = [...deckIds];
    for (let i = 0; i < slotCount; i += 1) {
      const cardId = drawPool.shift();
      const def = cardId ? this._data.cardsById.get(cardId) : null;
      this._slots[i] = def ? this._createCardInstance(def, 1) : null;
    }

    this._deck = drawPool
      .map((id) => this._data.cardsById.get(id))
      .filter(Boolean);

    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      remainingDeck: this._deck.length,
    });
    return this.getSlots();
  }

  _buildTwelveCardDeckIds(customDeckIds) {
    const deckSize = this.getDeckSize();
    if (Array.isArray(customDeckIds) && customDeckIds.length > 0) {
      return customDeckIds.filter((id) => this._data.cardsById.has(id)).slice(0, deckSize);
    }

    // Use saved custom 12-card deck if configured and valid
    const savedDeck = this._state.formation?.battleDeck;
    if (Array.isArray(savedDeck) && savedDeck.length === deckSize) {
      const validSaved = savedDeck.filter((id) => this._data.cardsById.has(id));
      if (validSaved.length === deckSize) {
        return validSaved;
      }
    }

    const unlockedSet = new Set(this.getUnlockedCardIds());
    const formationUnitCards = this._resolveFormationUnitCards();
    const primaryCard = formationUnitCards[0] || this._data.cards[0];
    const secondaryCard =
      formationUnitCards.find((c) => c.id !== primaryCard?.id) ||
      this._data.cards.find((c) => c.id !== primaryCard?.id) ||
      primaryCard;

    const availableNonUnit = this._data.cards.filter(
      (c) => (c.category || 'unit') !== 'unit' && (unlockedSet.size === 0 || unlockedSet.has(c.id)),
    );
    const nonUnitCards =
      availableNonUnit.length > 0
        ? availableNonUnit
        : this._data.cards.filter((c) => (c.category || 'unit') !== 'unit');
    const skillCards = nonUnitCards.filter((c) => c.category === 'skill');
    const tacticCards = nonUnitCards.filter((c) => c.category === 'tactic');
    const supportCards = nonUnitCards.filter((c) => c.category === 'support');

    // Hand (first 6):
    // [0, 1] identical primary unit cards (ready to merge!),
    // [2] different unit card, [3] skill, [4] tactic, [5] support (or remaining formation units)
    const ordered = [];
    if (primaryCard) {
      ordered.push(primaryCard.id, primaryCard.id);
    }
    if (secondaryCard) {
      ordered.push(secondaryCard.id);
    }

    const unit3 = formationUnitCards[2] || formationUnitCards[0];
    const unit4 = formationUnitCards[3] || secondaryCard;

    if (skillCards[0]) ordered.push(skillCards[0].id);
    else if (unit3) ordered.push(unit3.id);

    if (tacticCards[0]) ordered.push(tacticCards[0].id);
    else if (unit4) ordered.push(unit4.id);

    if (supportCards[0]) ordered.push(supportCards[0].id);
    else if (primaryCard) ordered.push(primaryCard.id);

    // Remaining 6 cards in draw deck: balanced mix of unit reinforcements + tactical cards
    const reserveCandidates = [
      unit3?.id,
      unit4?.id,
      skillCards[1]?.id || skillCards[0]?.id,
      tacticCards[1]?.id || tacticCards[0]?.id,
      supportCards[1]?.id || supportCards[0]?.id,
      secondaryCard?.id,
      primaryCard?.id,
      skillCards[2]?.id,
      tacticCards[2]?.id,
      supportCards[2]?.id,
    ].filter(Boolean);

    let cursor = 0;
    while (ordered.length < deckSize && reserveCandidates.length > 0) {
      ordered.push(reserveCandidates[cursor % reserveCandidates.length]);
      cursor += 1;
    }

    return ordered.slice(0, deckSize);
  }

  _resolveFormationUnitCards() {
    const unitIds = this._state.formation?.unitSlots || [];
    const matched = [];
    for (const unitId of unitIds) {
      const card = this._data.cards.find(
        (c) => (c.category || 'unit') === 'unit' && c.unitId === unitId,
      );
      if (card) matched.push(card);
    }
    if (matched.length > 0) return matched;
    return this._data.cards.filter((c) => (c.category || 'unit') === 'unit');
  }

  _drawNextCardDef() {
    if (this._deck.length === 0) return null;
    return this._deck.shift();
  }

  _createCardInstance(def, tier = 1) {
    const category = def.category || 'unit';
    const name =
      tier >= 3 && def.maxName
        ? def.maxName
        : tier >= 2 && def.upgradedName
          ? def.upgradedName
          : def.name;
    const roman = tier === 3 ? 'III' : tier === 2 ? 'II' : 'I';

    return {
      instanceId: `${def.id}_${this._instanceCounter++}`,
      cardId: def.id,
      category,
      rarity: def.rarity || 'R',
      unitId: def.unitId || null,
      name,
      baseName: def.name,
      iconAssetId: def.iconAssetId,
      cost: def.cost,
      cooldownSec: def.cooldownSec ?? 2.5,
      tier,
      level: tier,
      levelLabel: `Lv.${roman}`,
      spawnCount: def.spawnCountByTier?.[String(tier)] ?? 1,
      statMultiplier: def.statMultiplierByTier?.[String(tier)] ?? (1 + (tier - 1) * 0.45),
      unitLevel: def.unitLevelByTier?.[String(tier)] ?? (tier === 3 ? 5 : tier === 2 ? 3 : 1),
      effect: def.effect || null,
      description: def.description || '',
      upgradeSummary: def.upgradeSummary || '',
    };
  }

  updateCooldowns(dt) {
    if (this._cooldowns.size === 0) return;
    let changed = false;
    for (const [cardId, remaining] of this._cooldowns.entries()) {
      const next = Math.max(0, remaining - dt);
      if (next <= 0) {
        this._cooldowns.delete(cardId);
      } else {
        this._cooldowns.set(cardId, next);
      }
      changed = true;
    }
    if (changed) {
      this._eventBus?.emit('cards:cooldownTick', { cooldowns: this._cooldowns });
    }
  }

  /**
   * Two cards can merge strictly when:
   * - Adjacent slots (|indexA - indexB| === 1)
   * - Both slots are occupied
   * - Same cardId and same category
   * - Same level/tier
   * - Below maxTier (Level III cannot merge)
   */
  canMerge(indexA, indexB) {
    if (Math.abs(indexA - indexB) !== 1) return false;
    const cardA = this._slots[indexA];
    const cardB = this._slots[indexB];
    if (!cardA || !cardB) return false;
    if (cardA.cardId !== cardB.cardId) return false;
    if (cardA.category !== cardB.category) return false;
    if (cardA.tier !== cardB.tier) return false;
    return cardA.tier < this.getMaxTier();
  }

  mergeAdjacent(sourceIndex, targetIndex) {
    if (!this.canMerge(sourceIndex, targetIndex)) {
      const cardA = this._slots[sourceIndex];
      const cardB = this._slots[targetIndex];
      if (cardA && cardB && cardA.cardId === cardB.cardId && cardA.tier >= this.getMaxTier()) {
        return { ok: false, reason: 'Card is already at maximum Level III.' };
      }
      return { ok: false, reason: 'Only adjacent identical cards of the same level below Level III can merge.' };
    }

    const baseCard = this._slots[targetIndex];
    const def = this._data.cardsById.get(baseCard.cardId);
    const nextTier = baseCard.tier + 1;

    this._slots[targetIndex] = this._createCardInstance(def, nextTier);

    // Refill vacated source slot from remaining deck if available; otherwise leave empty
    const nextDef = this._drawNextCardDef();
    this._slots[sourceIndex] = nextDef ? this._createCardInstance(nextDef, 1) : null;

    this._eventBus?.emit('cards:merged', {
      sourceIndex,
      targetIndex,
      upgradedCard: this._slots[targetIndex],
      remainingDeck: this._deck.length,
    });
    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      remainingDeck: this._deck.length,
    });
    return { ok: true, upgradedCard: this._slots[targetIndex] };
  }

  /**
   * Validates whether a card slot can be played right now without mutating state.
   */
  canPlayCard(slotIndex, { unitManager = null } = {}) {
    const card = this._slots[slotIndex];
    if (!card) return { ok: false, reason: 'Empty card slot.' };

    const cd = this.getCardCooldown(card.cardId);
    if (cd > 0.01) {
      return { ok: false, reason: `${card.name} is on cooldown (${cd.toFixed(1)}s).` };
    }

    const energy = this._state.battle.energy ?? this._state.battle.dp ?? 0;
    if (energy < card.cost) {
      return { ok: false, reason: `Insufficient Command Energy (need ${card.cost}, have ${Math.floor(energy)}).` };
    }

    if (card.category === CARD_CATEGORIES.UNIT && unitManager) {
      const capCheck = unitManager.canSpawn('ally');
      if (!capCheck.ok) {
        return { ok: false, reason: capCheck.reason };
      }
    }

    return { ok: true, card };
  }

  /**
   * Plays a card from the 6-slot hand: deducts Command Energy, starts cooldown,
   * removes card from hand, and draws the next card if the 12-card deck is not exhausted.
   */
  playCard(slotIndex, { unitManager = null } = {}) {
    const check = this.canPlayCard(slotIndex, { unitManager });
    if (!check.ok) {
      return { ok: false, reason: check.reason };
    }

    const card = check.card;
    const currentEnergy = this._state.battle.energy ?? this._state.battle.dp ?? 0;
    const nextEnergy = Math.max(0, currentEnergy - card.cost);
    this._state.setBattle({ energy: nextEnergy, dp: nextEnergy });

    if (card.cooldownSec > 0) {
      this._cooldowns.set(card.cardId, card.cooldownSec);
    }

    this._discardCount += 1;
    const nextDef = this._drawNextCardDef();
    this._slots[slotIndex] = nextDef ? this._createCardInstance(nextDef, 1) : null;

    this._eventBus?.emit('cards:played', {
      slotIndex,
      card,
      remainingDeck: this._deck.length,
    });
    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      remainingDeck: this._deck.length,
    });
    return { ok: true, card };
  }

  /**
   * Returns true if at least one playable unit card remains in hand or draw deck.
   * Used by defeat condition: when all friendly units are defeated, defeat triggers
   * only if no valid reinforcement method remains.
   */
  hasRemainingUnitCards() {
    const inHand = this._slots.some((s) => s && s.category === CARD_CATEGORIES.UNIT);
    if (inHand) return true;
    return this._deck.some((d) => (d.category || 'unit') === CARD_CATEGORIES.UNIT);
  }
}
