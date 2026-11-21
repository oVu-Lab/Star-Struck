/**
 * HeroSystem — Manages Commander hero definitions, ownership state, and skill lookups.
 * Commanders never deploy as battlefield units; they grant army passives and ultimates.
 */

export class HeroSystem {
  constructor({ dataRegistry, gameState, saveManager, eventBus }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._save = saveManager;
    this._eventBus = eventBus;
  }

  getAllHeroes() {
    const ownedMap = this._state.heroes.owned;
    return this._data.heroes.map((def) => {
      const owned = ownedMap[def.id] || null;
      return {
        ...def,
        owned: Boolean(owned),
        level: owned?.level ?? 1,
        copies: owned?.copies ?? 0,
        passiveSkill: this._data.skillsById.get(def.passiveSkillId) || null,
        ultimateSkill: this._data.skillsById.get(def.ultimateSkillId) || null,
      };
    });
  }

  getOwnedHeroes() {
    return this.getAllHeroes().filter((hero) => hero.owned);
  }

  getHeroById(heroId) {
    const def = this._data.heroesById.get(heroId);
    if (!def) return null;
    const owned = this._state.heroes.owned[heroId] || null;
    return {
      ...def,
      owned: Boolean(owned),
      level: owned?.level ?? 1,
      copies: owned?.copies ?? 0,
      passiveSkill: this._data.skillsById.get(def.passiveSkillId) || null,
      ultimateSkill: this._data.skillsById.get(def.ultimateSkillId) || null,
    };
  }

  getActiveCommander() {
    const cid = this._state.formation.commanderId;
    return this.getHeroById(cid) || this.getOwnedHeroes()[0] || this.getAllHeroes()[0] || null;
  }

  isOwned(heroId) {
    return Boolean(this._state.heroes.owned[heroId]);
  }

  grantHero(heroId) {
    const def = this._data.heroesById.get(heroId);
    if (!def) return { ok: false, isNew: false };

    let isNew = false;
    this._state.mutatePersistent('heroes', (draft) => {
      if (draft.heroes.owned[heroId]) {
        draft.heroes.owned[heroId].copies += 1;
      } else {
        isNew = true;
        draft.heroes.owned[heroId] = {
          id: heroId,
          level: 1,
          xp: 0,
          copies: 1,
        };
      }
    });

    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('hero:acquired', { heroId, isNew });
    return { ok: true, isNew, hero: this.getHeroById(heroId) };
  }

  grantCommanderXp(heroId, amount) {
    if (!heroId || !amount || amount <= 0 || !this._state.heroes.owned[heroId]) {
      return { ok: false };
    }
    this._state.mutatePersistent('heroes', (draft) => {
      const entry = draft.heroes.owned[heroId];
      if (!entry) return;
      entry.xp = (entry.xp || 0) + amount;
      let xpNeeded = 100 * entry.level;
      while (entry.xp >= xpNeeded && entry.level < 99) {
        entry.xp -= xpNeeded;
        entry.level += 1;
        xpNeeded = 100 * entry.level;
      }
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('hero:xpGained', { heroId, amount });
    return { ok: true, hero: this.getHeroById(heroId) };
  }
}
