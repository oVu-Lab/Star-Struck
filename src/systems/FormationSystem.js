/**
 * FormationSystem — Manages active Commander assignment, unit roster unlocking & upgrades,
 * and tactical squad slots with unlock validation.
 */

export class FormationSystem {
  constructor({ dataRegistry, gameState, heroSystem, saveManager, eventBus }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._heroes = heroSystem;
    this._save = saveManager;
    this._eventBus = eventBus;
  }

  getCommanderId() {
    return this._state.formation.commanderId;
  }

  setCommander(heroId) {
    if (!this._heroes.isOwned(heroId)) {
      return { ok: false, reason: 'Commander is not yet recruited.' };
    }
    this._state.mutatePersistent('formation', (draft) => {
      draft.formation.commanderId = heroId;
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('formation:commanderChanged', { commanderId: heroId });
    return { ok: true };
  }

  _ensureOwnedUnits() {
    if (!this._state.persistent.units || !this._state.persistent.units.owned) {
      this._state.mutatePersistent('units', (draft) => {
        draft.units = { owned: {} };
        for (const u of this._data.units) {
          if (u.unlockedByDefault !== false) {
            draft.units.owned[u.id] = { id: u.id, level: 1, xp: 0 };
          }
        }
      });
    }
    return this._state.persistent.units.owned;
  }

  isUnitUnlocked(unitId) {
    if (!this._data.unitsById.has(unitId)) return false;
    const owned = this._ensureOwnedUnits();
    return Boolean(owned[unitId]);
  }

  getUnitProgress(unitId) {
    const def = this._data.unitsById.get(unitId);
    if (!def) return null;
    const owned = this._ensureOwnedUnits();
    const record = owned[unitId] || null;
    const level = record?.level || 1;
    const bonusPerLv = this._data.balance?.progression?.unitLevelStatBonus ?? 0.08;
    const scale = 1 + Math.max(0, level - 1) * bonusPerLv;
    const progCfg = this._data.balance?.progression || {};
    const upgradeCreditCost = Math.round((progCfg.unitUpgradeCreditBase ?? 250) * (1 + (level - 1) * 0.45));
    const upgradeChipCost = progCfg.unitUpgradeXpChipCost ?? 2;
    const maxLevel = progCfg.maxUnitLevel ?? 20;

    return {
      ...def,
      unlocked: Boolean(record),
      level,
      xp: record?.xp || 0,
      xpToNext: level * 80,
      maxLevel,
      upgradeCreditCost,
      upgradeChipCost,
      scaledStats: {
        maxHp: Math.round(def.stats.maxHp * scale),
        attack: Math.round(def.stats.attack * scale),
        defense: Math.round(def.stats.defense * scale),
        healPower: Math.round((def.stats.healPower || 0) * scale),
        shieldPower: Math.round((def.stats.shieldPower || 0) * scale),
      },
    };
  }

  getAllUnitsWithProgress() {
    return this._data.units.map((u) => this.getUnitProgress(u.id));
  }

  getUnlockedUnits() {
    return this.getAllUnitsWithProgress().filter((u) => u.unlocked);
  }

  unlockUnit(unitId, cardSystem = null) {
    const def = this._data.unitsById.get(unitId);
    if (!def) return { ok: false, isNew: false, reason: 'Unknown unit type.' };

    let isNew = false;
    this._state.mutatePersistent('units', (draft) => {
      if (!draft.units) draft.units = { owned: {} };
      if (!draft.units.owned) draft.units.owned = {};
      if (!draft.units.owned[unitId]) {
        draft.units.owned[unitId] = { id: unitId, level: 1, xp: 0 };
        isNew = true;
      }
      if (def.cardId && Array.isArray(draft.progression?.unlockedCards)) {
        if (!draft.progression.unlockedCards.includes(def.cardId)) {
          draft.progression.unlockedCards.push(def.cardId);
        }
      }
    });

    if (def.cardId && cardSystem?.unlockCard) {
      cardSystem.unlockCard(def.cardId);
    }

    if (isNew) {
      this._save.save(this._state.toSerializableSave());
      this._eventBus?.emit('formation:unitUnlocked', { unitId, unit: def });
    }
    return { ok: true, isNew, unit: this.getUnitProgress(unitId) };
  }

  grantUnitXp(unitId, xpAmount) {
    if (!xpAmount || xpAmount <= 0 || !this.isUnitUnlocked(unitId)) return { ok: false };
    const maxLevel = this._data.balance?.progression?.maxUnitLevel ?? 20;
    let leveledUp = false;
    this._state.mutatePersistent('units', (draft) => {
      const entry = draft.units?.owned?.[unitId];
      if (!entry || entry.level >= maxLevel) return;
      entry.xp += xpAmount;
      while (entry.level < maxLevel && entry.xp >= entry.level * 80) {
        entry.xp -= entry.level * 80;
        entry.level += 1;
        leveledUp = true;
      }
    });
    this._save.save(this._state.toSerializableSave());
    return { ok: true, leveledUp, unit: this.getUnitProgress(unitId) };
  }

  upgradeUnit(unitId, economySystem) {
    const info = this.getUnitProgress(unitId);
    if (!info || !info.unlocked) {
      return { ok: false, reason: 'Unit is locked.' };
    }
    if (info.level >= info.maxLevel) {
      return { ok: false, reason: `${info.name} is already at max level (${info.maxLevel}).` };
    }

    const chipItem = (this._state.inventory?.items || []).find((i) => i.id === 'item_xp_chip');
    if (!chipItem || chipItem.quantity < info.upgradeChipCost) {
      return {
        ok: false,
        reason: `Need ${info.upgradeChipCost} Tactical XP Chips (have ${chipItem?.quantity || 0}).`,
      };
    }

    if (this._state.resources.credits < info.upgradeCreditCost) {
      return {
        ok: false,
        reason: `Need ${info.upgradeCreditCost} Credits to upgrade ${info.name}.`,
      };
    }

    if (economySystem?.spend) {
      const spendRes = economySystem.spend('credits', info.upgradeCreditCost);
      if (!spendRes.ok) return spendRes;
    } else {
      this._state.mutatePersistent('resources', (draft) => {
        draft.resources.credits -= info.upgradeCreditCost;
      });
    }

    this._state.mutatePersistent('units', (draft) => {
      const chips = draft.inventory.items.find((i) => i.id === 'item_xp_chip');
      if (chips) chips.quantity = Math.max(0, chips.quantity - info.upgradeChipCost);
      const entry = draft.units.owned[unitId];
      if (entry) {
        entry.level = Math.min(info.maxLevel, entry.level + 1);
      }
    });

    this._save.save(this._state.toSerializableSave());
    const updated = this.getUnitProgress(unitId);
    this._eventBus?.emit('formation:unitUpgraded', { unitId, level: updated.level });
    return { ok: true, unit: updated };
  }

  getUnitSlots() {
    return this._state.formation.unitSlots.map((unitId, slotIndex) => ({
      slotIndex,
      unitId,
      unit: this.getUnitProgress(unitId) || this._data.unitsById.get(unitId) || null,
    }));
  }

  setUnitSlot(slotIndex, unitId) {
    if (slotIndex < 0 || slotIndex >= 4) return { ok: false, reason: 'Invalid slot index.' };
    if (!this._data.unitsById.has(unitId)) return { ok: false, reason: 'Unknown unit type.' };
    if (!this.isUnitUnlocked(unitId)) {
      return { ok: false, reason: 'Unit is not unlocked yet.' };
    }

    this._state.mutatePersistent('formation', (draft) => {
      draft.formation.unitSlots[slotIndex] = unitId;
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('formation:slotsChanged', {
      unitSlots: [...this._state.formation.unitSlots],
    });
    return { ok: true };
  }

  swapUnitSlots(indexA, indexB) {
    if (indexA === indexB || indexA < 0 || indexB < 0 || indexA >= 4 || indexB >= 4) {
      return { ok: false };
    }
    this._state.mutatePersistent('formation', (draft) => {
      const slots = draft.formation.unitSlots;
      const tmp = slots[indexA];
      slots[indexA] = slots[indexB];
      slots[indexB] = tmp;
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('formation:slotsChanged', {
      unitSlots: [...this._state.formation.unitSlots],
    });
    return { ok: true };
  }
}
