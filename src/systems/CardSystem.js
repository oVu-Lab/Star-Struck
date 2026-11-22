/**
 * CardSystem — 6-card unique battle deck, 6-slot tactical hand with replacement-based
 * random generation, independent 5s timed automatic slot refills, identical
 * card merging across any slots (Lv.I -> Lv.II -> Lv.III), Command Energy validation,
 * and per-card cooldowns.
 */

import { DEFAULT_BATTLE_DECK, migrateBattleDeck } from '../core/SaveManager.js';

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

    const slotCount = this.getSlotCount();
    this._slots = new Array(slotCount).fill(null);
    this._refillTimers = new Array(slotCount).fill(null);
    this._activeDeckPool = [];
    this._cooldowns = new Map(); // cardId -> remaining seconds
    this._instanceCounter = 1;
    this._battleToken = 0;
    this._battleActive = false;
    this._randomFn = () => Math.random();
    this._cardGenerator = null;
  }

  getSlotCount() {
    return this._data.handConfig?.slotCount ?? this._data.balance?.deck?.handSlots ?? 6;
  }

  getDeckSize() {
    return this._data.handConfig?.deckSize ?? this._data.balance?.deck?.deckSize ?? 6;
  }

  getMaxTier() {
    return this._data.handConfig?.maxTier ?? this._data.balance?.deck?.maxCardLevel ?? 3;
  }

  getRefillIntervalSec() {
    const val =
      this._data.balance?.deck?.refillIntervalSec ??
      this._data.handConfig?.refillIntervalSec ??
      5;
    return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : 5;
  }

  getUnlockedCardIds() {
    const list = this._state.progression?.unlockedCards;
    if (Array.isArray(list)) {
      return Array.from(new Set(list.filter((id) => this._data.cardsById.has(id))));
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

  getDeck() {
    return this.getCustomDeck();
  }

  buildDefaultDeckIds() {
    const deckSize = this.getDeckSize();
    const unlockedIds = this.getUnlockedCardIds();
    const unlockedSet = new Set(unlockedIds);
    const seedOrder = Array.isArray(this._data.defaultBattleDeck)
      ? this._data.defaultBattleDeck
      : DEFAULT_BATTLE_DECK;

    const chosen = [];
    const seenIds = new Set();
    const seenNames = new Set();

    const tryPush = (cid) => {
      if (chosen.length >= deckSize) return;
      const def = this._data.cardsById.get(cid);
      if (!def || !unlockedSet.has(cid)) return;
      const normName = String(def.name || '').trim().toLowerCase();
      if (seenIds.has(cid) || (normName && seenNames.has(normName))) return;
      seenIds.add(cid);
      if (normName) seenNames.add(normName);
      chosen.push(cid);
    };

    for (const cid of seedOrder) tryPush(cid);
    for (const cid of unlockedIds) tryPush(cid);
    return chosen;
  }

  validateDeck(cardIds, { requireUnlocked = true } = {}) {
    if (!Array.isArray(cardIds)) {
      return { ok: false, reason: 'Battle deck must be a list of card IDs.' };
    }
    const deckSize = this.getDeckSize();
    if (cardIds.length !== deckSize) {
      return {
        ok: false,
        reason: `Battle deck must contain exactly ${deckSize} unique cards (${cardIds.length}/${deckSize}).`,
      };
    }

    const unlocked = new Set(this.getUnlockedCardIds());
    const seenIds = new Set();
    const seenNames = new Set();

    for (const cid of cardIds) {
      if (typeof cid !== 'string' || !cid.trim()) {
        return { ok: false, reason: 'Deck contains an invalid card entry.' };
      }
      const def = this._data.cardsById.get(cid);
      if (!def) {
        return { ok: false, reason: `Unknown card "${cid}".` };
      }
      if (requireUnlocked && !unlocked.has(cid)) {
        return { ok: false, reason: `Card "${def.name}" is not unlocked yet.` };
      }
      if (seenIds.has(cid)) {
        return { ok: false, reason: `Duplicate card "${def.name}" is not allowed in the 6-card deck.` };
      }
      const normName = String(def.name || '').trim().toLowerCase();
      if (normName && seenNames.has(normName)) {
        return { ok: false, reason: `Duplicate card name "${def.name}" is not allowed.` };
      }
      seenIds.add(cid);
      if (normName) seenNames.add(normName);
    }

    return { ok: true, cardIds: [...cardIds] };
  }

  isDeckReadyForBattle() {
    return this.validateDeck(this.getCustomDeck(), { requireUnlocked: true });
  }

  /**
   * Validates and saves the player's 6-card unique battle deck.
   */
  setCustomDeck(cardIds) {
    const check = this.validateDeck(cardIds, { requireUnlocked: true });
    if (!check.ok) {
      return check;
    }

    this._state.mutatePersistent('formation', (draft) => {
      draft.formation.battleDeck = [...check.cardIds];
    });
    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('formation:deckChanged', { battleDeck: [...check.cardIds] });
    return { ok: true, battleDeck: [...check.cardIds] };
  }

  setDeck(cardIds) {
    return this.setCustomDeck(cardIds);
  }

  /**
   * Validates and migrates a saved deck against the live card registry without
   * altering the player's unlocked card collection.
   */
  migrateSavedDeck() {
    const saved = this.getCustomDeck();
    const unlocked = this.getUnlockedCardIds();
    const migrated = migrateBattleDeck(saved, unlocked, this._data.cardsById);
    const sameLength = migrated.length === saved.length;
    const identical = sameLength && migrated.every((id, idx) => id === saved[idx]);
    if (!identical) {
      this._state.mutatePersistent('formation', (draft) => {
        draft.formation.battleDeck = [...migrated];
      });
      this._save?.save(this._state.toSerializableSave());
    }
    return migrated;
  }

  setRandomSource(fn) {
    this._randomFn = typeof fn === 'function' ? fn : () => Math.random();
  }

  setCardGenerator(fn) {
    this._cardGenerator = typeof fn === 'function' ? fn : null;
  }

  getActiveDeckIds() {
    return this._activeDeckPool.map((d) => d.id);
  }

  getBattleToken() {
    return this._battleToken;
  }

  getSlots() {
    return this._slots.map((slot, index) => (slot ? { ...slot, index } : null));
  }

  getRefillState(slotIndex) {
    const defaultDuration = this.getRefillIntervalSec();
    const timer = this._refillTimers[slotIndex];
    if (!timer || !this._battleActive || timer.battleToken !== this._battleToken) {
      return {
        active: false,
        remainingSec: 0,
        durationSec: defaultDuration,
        progress: 0,
      };
    }
    const durationSec = Math.max(0.001, timer.durationSec || defaultDuration);
    const remainingSec = Math.max(0, timer.remainingSec);
    const progress = Math.min(1, Math.max(0, 1 - remainingSec / durationSec));
    return {
      active: true,
      remainingSec,
      durationSec,
      progress,
    };
  }

  getRefillStates() {
    const count = this.getSlotCount();
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.getRefillState(i));
    }
    return list;
  }

  getCardCooldown(cardId) {
    return Math.max(0, this._cooldowns.get(cardId) || 0);
  }

  /**
   * Selects a random card definition from the active 6-card deck pool using replacement.
   */
  pickRandomDeckCardDef(deckPool = this._activeDeckPool, rng = this._randomFn) {
    if (!Array.isArray(deckPool) || deckPool.length === 0) return null;
    const raw = typeof rng === 'function' ? Number(rng()) : Math.random();
    const safe = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0;
    const idx = Math.floor(safe * deckPool.length);
    return deckPool[idx] || deckPool[0];
  }

  _resolveDeckPool(customDeckIds) {
    const deckSize = this.getDeckSize();
    const buildDefsFromIds = (ids) => {
      const defs = [];
      const seenIds = new Set();
      const seenNames = new Set();
      for (const id of ids) {
        if (defs.length >= deckSize) break;
        const def = this._data.cardsById.get(id);
        if (!def) continue;
        const normName = String(def.name || '').trim().toLowerCase();
        if (seenIds.has(def.id) || (normName && seenNames.has(normName))) continue;
        seenIds.add(def.id);
        if (normName) seenNames.add(normName);
        defs.push(def);
      }
      return defs;
    };

    if (Array.isArray(customDeckIds) && customDeckIds.length > 0) {
      const explicitPool = buildDefsFromIds(customDeckIds);
      if (explicitPool.length > 0) return explicitPool;
    }

    const saved = this.getCustomDeck();
    const savedCheck = this.validateDeck(saved, { requireUnlocked: false });
    if (savedCheck.ok) {
      return buildDefsFromIds(savedCheck.cardIds);
    }

    return buildDefsFromIds(this.buildDefaultDeckIds());
  }

  _generateCardDefForSlot(slotIndex, reason = 'refill') {
    if (this._activeDeckPool.length === 0) return null;

    if (this._cardGenerator) {
      const chosen = this._cardGenerator({
        slotIndex,
        reason,
        deckPool: [...this._activeDeckPool],
        slots: this.getSlots(),
      });
      const chosenId = typeof chosen === 'string' ? chosen : chosen?.id;
      if (chosenId) {
        const match = this._activeDeckPool.find((d) => d.id === chosenId);
        if (match) return match;
      }
    }

    return this.pickRandomDeckCardDef(this._activeDeckPool, this._randomFn);
  }

  /**
   * Initializes the 6 battle slots from the active 6-card unique deck using
   * random selection with replacement (or deterministic slots for tutorial/tests).
   */
  initHand({
    customDeckIds = null,
    initialSlots = null,
    randomSource = null,
    cardGenerator = null,
  } = {}) {
    const slotCount = this.getSlotCount();
    this._battleToken += 1;
    this._battleActive = true;
    this._slots = new Array(slotCount).fill(null);
    this._refillTimers = new Array(slotCount).fill(null);
    this._cooldowns.clear();

    if (typeof randomSource === 'function') {
      this._randomFn = randomSource;
    }
    if (typeof cardGenerator === 'function') {
      this._cardGenerator = cardGenerator;
    }

    this._activeDeckPool = this._resolveDeckPool(customDeckIds);

    for (let i = 0; i < slotCount; i += 1) {
      let def = null;
      let tier = 1;

      if (Array.isArray(initialSlots) && initialSlots[i]) {
        const entry = initialSlots[i];
        const cardId = typeof entry === 'string' ? entry : entry.cardId;
        tier = typeof entry === 'object' && Number.isInteger(entry.tier) ? entry.tier : 1;
        def = this._activeDeckPool.find((d) => d.id === cardId) || this._data.cardsById.get(cardId) || null;
      } else {
        def = this._generateCardDefForSlot(i, 'init');
      }

      this._slots[i] = def ? this._createCardInstance(def, tier) : null;
    }

    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      refillStates: this.getRefillStates(),
      deckPool: this.getActiveDeckIds(),
    });
    return this.getSlots();
  }

  clearBattleTimers() {
    this._battleActive = false;
    this._battleToken += 1;
    this._refillTimers = new Array(this.getSlotCount()).fill(null);
    this._cooldowns.clear();
  }

  endBattleSession() {
    this.clearBattleTimers();
  }

  _startRefillTimer(slotIndex) {
    if (!this._battleActive) return false;
    const slotCount = this.getSlotCount();
    if (slotIndex < 0 || slotIndex >= slotCount) return false;
    if (this._slots[slotIndex] !== null) return false;
    if (this._refillTimers[slotIndex]) return false;

    const durationSec = this.getRefillIntervalSec();
    this._refillTimers[slotIndex] = {
      remainingSec: durationSec,
      durationSec,
      battleToken: this._battleToken,
    };
    return true;
  }

  updateRefills(dt, expectedToken = this._battleToken) {
    if (!this._battleActive || expectedToken !== this._battleToken) {
      return { refilled: [], changed: false };
    }
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      return { refilled: [], changed: false };
    }

    const slotCount = this.getSlotCount();
    const refilled = [];
    let changed = false;

    for (let i = 0; i < slotCount; i += 1) {
      const timer = this._refillTimers[i];
      if (!timer) continue;
      if (timer.battleToken !== this._battleToken || this._slots[i] !== null) {
        this._refillTimers[i] = null;
        continue;
      }

      timer.remainingSec = Math.max(0, timer.remainingSec - dt);
      changed = true;

      if (timer.remainingSec <= 0) {
        // Clear timer first so a single refill timer can never generate multiple cards
        this._refillTimers[i] = null;
        const nextDef = this._generateCardDefForSlot(i, 'refill');
        if (nextDef) {
          const instance = this._createCardInstance(nextDef, 1);
          this._slots[i] = instance;
          refilled.push({
            slotIndex: i,
            card: { ...instance, index: i },
            battleToken: this._battleToken,
          });
        }
      }
    }

    if (changed) {
      this._eventBus?.emit('cards:refillTick', {
        refillStates: this.getRefillStates(),
        battleToken: this._battleToken,
      });
    }

    for (const item of refilled) {
      this._eventBus?.emit('cards:refilled', item);
    }

    if (refilled.length > 0) {
      this._eventBus?.emit('cards:updated', {
        slots: this.getSlots(),
        refillStates: this.getRefillStates(),
        deckPool: this.getActiveDeckIds(),
      });
    }

    return { refilled, changed };
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
      statMultiplier: def.statMultiplierByTier?.[String(tier)] ?? 1 + (tier - 1) * 0.45,
      unitLevel: def.unitLevelByTier?.[String(tier)] ?? (tier === 3 ? 5 : tier === 2 ? 3 : 1),
      effect: def.effect ? { ...def.effect } : null,
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
   * - Both slot indices are valid distinct slots within the 6-slot hand
   * - Both slots are occupied
   * - Same cardId, baseName, and category
   * - Same level/tier
   * - Below maxTier (Level III cannot merge)
   */
  canMerge(indexA, indexB) {
    const slotCount = this.getSlotCount();
    if (!Number.isInteger(indexA) || !Number.isInteger(indexB)) return false;
    if (indexA < 0 || indexA >= slotCount || indexB < 0 || indexB >= slotCount) return false;
    if (indexA === indexB) return false;
    const cardA = this._slots[indexA];
    const cardB = this._slots[indexB];
    if (!cardA || !cardB) return false;
    if (cardA.cardId !== cardB.cardId) return false;
    if (cardA.baseName !== cardB.baseName) return false;
    if (cardA.category !== cardB.category) return false;
    if (cardA.tier !== cardB.tier) return false;
    return cardA.tier < this.getMaxTier();
  }

  /**
   * Returns all valid merge partner slot indices for the given slot.
   */
  getMergePartners(slotIndex) {
    const slotCount = this.getSlotCount();
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
      return [];
    }
    const partners = [];
    for (let j = 0; j < slotCount; j += 1) {
      if (this.canMerge(slotIndex, j)) {
        partners.push(j);
      }
    }
    return partners;
  }

  /**
   * Returns a Set of all slot indices that have at least one valid merge partner.
   */
  getMergeableSlotIndices() {
    const slotCount = this.getSlotCount();
    const mergeable = new Set();
    for (let i = 0; i < slotCount; i += 1) {
      for (let j = i + 1; j < slotCount; j += 1) {
        if (this.canMerge(i, j)) {
          mergeable.add(i);
          mergeable.add(j);
        }
      }
    }
    return mergeable;
  }

  mergeAdjacent(sourceIndex, targetIndex) {
    const slotCount = this.getSlotCount();
    if (
      !Number.isInteger(sourceIndex) ||
      !Number.isInteger(targetIndex) ||
      sourceIndex < 0 ||
      sourceIndex >= slotCount ||
      targetIndex < 0 ||
      targetIndex >= slotCount
    ) {
      return { ok: false, reason: 'Invalid card slot indices for merge.' };
    }
    if (sourceIndex === targetIndex) {
      return { ok: false, reason: 'A card cannot merge with itself.' };
    }
    if (!this.canMerge(sourceIndex, targetIndex)) {
      const cardA = this._slots[sourceIndex];
      const cardB = this._slots[targetIndex];
      if (cardA && cardB && cardA.cardId === cardB.cardId && cardA.tier >= this.getMaxTier()) {
        return { ok: false, reason: 'Card is already at maximum Level III.' };
      }
      return {
        ok: false,
        reason: 'Only two identical cards of the same level below Level III can merge.',
      };
    }

    const baseCard = this._slots[targetIndex];
    const def = this._data.cardsById.get(baseCard.cardId);
    const nextTier = baseCard.tier + 1;
    const upgraded = this._createCardInstance(def, nextTier);

    this._slots[targetIndex] = upgraded;
    this._slots[sourceIndex] = null;
    this._startRefillTimer(sourceIndex);

    const upgradedWithIndex = { ...upgraded, index: targetIndex };
    const refillDurationSec = this.getRefillIntervalSec();

    this._eventBus?.emit('cards:merged', {
      sourceIndex,
      targetIndex,
      emptySlotIndex: sourceIndex,
      upgradedCard: upgradedWithIndex,
      refillDurationSec,
    });
    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      refillStates: this.getRefillStates(),
      deckPool: this.getActiveDeckIds(),
    });
    return {
      ok: true,
      upgradedCard: upgradedWithIndex,
      emptySlotIndex: sourceIndex,
      refillDurationSec,
    };
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
      return {
        ok: false,
        reason: `Insufficient Command Energy (need ${card.cost}, have ${Math.floor(energy)}).`,
      };
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
   * Authoritative card consumption point: deducts Command Energy, starts cooldown,
   * removes the card from its slot, and starts that slot's timed refill timer.
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

    this._slots[slotIndex] = null;
    this._startRefillTimer(slotIndex);

    const refillDurationSec = this.getRefillIntervalSec();
    this._eventBus?.emit('cards:played', {
      slotIndex,
      card,
      refillDurationSec,
    });
    this._eventBus?.emit('cards:updated', {
      slots: this.getSlots(),
      refillStates: this.getRefillStates(),
      deckPool: this.getActiveDeckIds(),
    });
    return { ok: true, card, slotIndex, refillDurationSec };
  }

  /**
   * Returns true if at least one unit card is currently in hand or in the active 6-card deck pool
   * (since slots continuously refill from the active deck pool).
   */
  hasRemainingUnitCards() {
    if (this._slots.some((s) => s && s.category === CARD_CATEGORIES.UNIT)) {
      return true;
    }
    return this._activeDeckPool.some((d) => (d.category || 'unit') === CARD_CATEGORIES.UNIT);
  }
}
