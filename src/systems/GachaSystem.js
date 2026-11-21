/**
 * GachaSystem — Banner configuration reader, pity state tracker, and recruitment contract.
 * Supports single pulls, ten pulls with SR-or-higher guarantee, and persistent history.
 */

import { pickWeighted } from '../utils/MathUtils.js';

export class GachaSystem {
  constructor({
    dataRegistry,
    gameState,
    economySystem,
    heroSystem,
    formationSystem = null,
    cardSystem = null,
    saveManager,
    eventBus,
  }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._economy = economySystem;
    this._heroes = heroSystem;
    this._formation = formationSystem;
    this._cards = cardSystem;
    this._save = saveManager;
    this._eventBus = eventBus;
  }

  getBanners() {
    return this._data.banners || [];
  }

  setActiveBanner(bannerId) {
    if (!this._data.bannersById?.has(bannerId)) {
      return { ok: false, reason: 'Unknown banner.' };
    }
    this._state.setUI({ selectedBannerId: bannerId });
    return { ok: true, banner: this._data.bannersById.get(bannerId) };
  }

  getActiveBanner(bannerId = null) {
    const id = bannerId || this._state.ui?.selectedBannerId;
    if (id && this._data.bannersById?.has(id)) {
      return this._data.bannersById.get(id);
    }
    return this._data.banners[0] || null;
  }

  getPityStatus(bannerId = null) {
    const banner = this.getActiveBanner(bannerId);
    return {
      ssrPity: this._state.gacha.ssrPity,
      ssrHardPity: banner?.pityConfig?.ssrHardPity ?? 80,
      totalPulls: this._state.gacha.totalPulls,
      history: this._state.gacha.history,
    };
  }

  _unlockCardAndUnit(cardId) {
    const cardDef = this._data.cardsById?.get(cardId);
    if (!cardDef) return { isNew: false, card: null, unitUnlocked: null };

    const alreadyUnlocked = (this._state.progression?.unlockedCards || []).includes(cardId);
    if (this._cards?.unlockCard) {
      this._cards.unlockCard(cardId);
    } else {
      this._state.mutatePersistent('progression', (draft) => {
        if (!Array.isArray(draft.progression.unlockedCards)) draft.progression.unlockedCards = [];
        if (!draft.progression.unlockedCards.includes(cardId)) {
          draft.progression.unlockedCards.push(cardId);
        }
      });
    }

    let unitUnlocked = null;
    if (cardDef.category === 'unit' && cardDef.unitId) {
      if (this._formation?.unlockUnit) {
        const res = this._formation.unlockUnit(cardDef.unitId, this._cards);
        if (res.isNew) unitUnlocked = cardDef.unitId;
      } else {
        this._state.mutatePersistent('units', (draft) => {
          if (!draft.units) draft.units = { owned: {} };
          if (!draft.units.owned) draft.units.owned = {};
          if (!draft.units.owned[cardDef.unitId]) {
            draft.units.owned[cardDef.unitId] = { id: cardDef.unitId, level: 1, xp: 0 };
            unitUnlocked = cardDef.unitId;
          }
        });
      }
    }

    return { isNew: !alreadyUnlocked, card: cardDef, unitUnlocked };
  }

  pull(count = 1, { bannerId = null } = {}) {
    const banner = this.getActiveBanner(bannerId);
    if (!banner) return { ok: false, reason: 'No active banner configured.', results: [] };
    if (count !== 1 && count !== 10) {
      return { ok: false, reason: 'Only 1x or 10x pulls are supported.', results: [] };
    }

    const cost = count === 10 ? banner.tenCost : banner.singleCost;
    const spendRes = this._economy.spend(banner.currency, cost);
    if (!spendRes.ok) {
      return { ok: false, reason: `Need ${cost} ${banner.currency} to recruit.`, results: [] };
    }

    const results = [];
    let hasSrOrHigher = false;
    const hardPity = banner.pityConfig?.ssrHardPity ?? 80;
    const isTacticalBanner = banner.bannerType === 'tactical';

    for (let i = 0; i < count; i += 1) {
      const nextPity = this._state.gacha.ssrPity + 1;
      let rarity;

      if (nextPity >= hardPity) {
        rarity = 'SSR';
      } else if (count === 10 && i === 9 && !hasSrOrHigher) {
        rarity = Math.random() < banner.rates.SSR ? 'SSR' : 'SR';
      } else {
        rarity = pickWeighted([
          { value: 'SSR', weight: banner.rates.SSR },
          { value: 'SR', weight: banner.rates.SR },
          { value: 'R', weight: banner.rates.R },
        ]);
      }

      if (rarity === 'SSR' || rarity === 'SR') hasSrOrHigher = true;

      if (isTacticalBanner) {
        const pool = banner.pool[rarity] || banner.pool.R || [];
        const cardId = pool[Math.floor(Math.random() * pool.length)];
        const unlockRes = this._unlockCardAndUnit(cardId);

        let duplicateReward = null;
        if (!unlockRes.isNew) {
          const bonusCredits = rarity === 'SSR' ? 400 : rarity === 'SR' ? 220 : 120;
          const bonusChips = rarity === 'SSR' ? 5 : rarity === 'SR' ? 3 : 2;
          this._economy.grant('credits', bonusCredits);
          this._state.mutatePersistent('inventory', (draft) => {
            const chip = draft.inventory.items.find((it) => it.id === 'item_xp_chip');
            if (chip) chip.quantity += bonusChips;
          });
          duplicateReward = { credits: bonusCredits, xpChips: bonusChips };
        }

        this._state.mutatePersistent('gacha', (draft) => {
          draft.gacha.totalPulls += 1;
          draft.gacha.ssrPity = rarity === 'SSR' ? 0 : draft.gacha.ssrPity + 1;
          draft.gacha.history.unshift({
            itemType: 'card',
            cardId,
            rarity,
            isNew: unlockRes.isNew,
            bannerId: banner.id,
            timestamp: new Date().toISOString(),
          });
          draft.gacha.history = draft.gacha.history.slice(0, 50);
        });

        results.push({
          itemType: 'card',
          cardId,
          rarity,
          isNew: unlockRes.isNew,
          card: unlockRes.card,
          unitUnlocked: unlockRes.unitUnlocked,
          duplicateReward,
        });
      } else {
        // Commander recruitment banner (preserves exact P0/P1 probabilities & pity)
        const pool = banner.pool[rarity] || banner.pool.R || ['vanguard_zero'];
        const heroId = pool[Math.floor(Math.random() * pool.length)];
        const grant = this._heroes.grantHero(heroId);

        // On duplicate commander pulls, unlock 1 locked bonus tactical card if available
        let bonusCard = null;
        if (!grant.isNew && Array.isArray(banner.duplicateBonusCards)) {
          const unlockedSet = new Set(this._state.progression?.unlockedCards || []);
          const lockedCandidate = banner.duplicateBonusCards.find((cid) => !unlockedSet.has(cid));
          if (lockedCandidate) {
            const bonusUnlock = this._unlockCardAndUnit(lockedCandidate);
            if (bonusUnlock.isNew) {
              bonusCard = bonusUnlock.card;
            }
          }
        }

        this._state.mutatePersistent('gacha', (draft) => {
          draft.gacha.totalPulls += 1;
          draft.gacha.ssrPity = rarity === 'SSR' ? 0 : draft.gacha.ssrPity + 1;
          draft.gacha.history.unshift({
            itemType: 'hero',
            heroId,
            rarity,
            isNew: grant.isNew,
            bonusCardId: bonusCard?.id || null,
            bannerId: banner.id,
            timestamp: new Date().toISOString(),
          });
          draft.gacha.history = draft.gacha.history.slice(0, 50);
        });

        results.push({
          itemType: 'hero',
          heroId,
          rarity,
          isNew: grant.isNew,
          hero: grant.hero,
          bonusCard,
        });
      }
    }

    this._state.setUI({ lastSummonResults: results });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('gacha:pulled', { bannerId: banner.id, count, results });
    return { ok: true, banner, results };
  }
}
