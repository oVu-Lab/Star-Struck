/**
 * EconomySystem — Centralized currency accounting (Credits, Astrite, Stamina).
 */

export class EconomySystem {
  constructor({ gameState, saveManager, eventBus }) {
    this._state = gameState;
    this._save = saveManager;
    this._eventBus = eventBus;
  }

  getBalance(currency) {
    return this._state.resources[currency] ?? 0;
  }

  canAfford(currency, amount) {
    return amount >= 0 && this.getBalance(currency) >= amount;
  }

  spend(currency, amount) {
    if (amount <= 0) return { ok: true };
    if (!this.canAfford(currency, amount)) {
      return { ok: false, reason: `Insufficient ${currency}.` };
    }
    this._state.mutatePersistent('resources', (draft) => {
      draft.resources[currency] = Math.max(0, (draft.resources[currency] ?? 0) - amount);
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('economy:changed', { currency, balance: this.getBalance(currency) });
    return { ok: true, balance: this.getBalance(currency) };
  }

  grant(currency, amount) {
    if (amount <= 0) return { ok: false };
    this._state.mutatePersistent('resources', (draft) => {
      draft.resources[currency] = (draft.resources[currency] ?? 0) + amount;
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('economy:changed', { currency, balance: this.getBalance(currency) });
    return { ok: true, balance: this.getBalance(currency) };
  }
}
