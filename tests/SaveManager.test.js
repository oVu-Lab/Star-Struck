import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, SAVE_VERSION, createDefaultSave } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';

test('SaveManager creates valid default save when storage is empty', () => {
  const storage = createMemoryStorage();
  const manager = new SaveManager({ storage });

  const result = manager.load();
  assert.equal(result.status, 'created');
  assert.equal(result.data.version, SAVE_VERSION);
  assert.equal(result.data.formation.commanderId, 'astra');
  assert.equal(result.data.formation.unitSlots.length, 4);
  assert.equal(manager.validate(result.data).valid, true);
});

test('SaveManager persists and reloads changes while stripping transient properties', () => {
  const storage = createMemoryStorage();
  const manager = new SaveManager({ storage });

  const state = createDefaultSave();
  state.resources.astrite = 4800;
  state.transientBattleCanvas = { shouldNotPersist: true };
  manager.save(state);

  const loaded = manager.load();
  assert.equal(loaded.status, 'loaded');
  assert.equal(loaded.data.resources.astrite, 4800);
  assert.equal('transientBattleCanvas' in loaded.data, false);
});

test('SaveManager recovers gracefully from corrupted JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem('astral_command_save_v1', '{broken-json');
  const manager = new SaveManager({ storage });

  const result = manager.load();
  assert.equal(result.status, 'recovered');
  assert.equal(result.data.version, SAVE_VERSION);
  assert.equal(result.data.formation.commanderId, 'astra');
});

test('SaveManager recovers missing fields and reassigns invalid commander IDs', () => {
  const storage = createMemoryStorage();
  const partialSave = {
    version: 1,
    player: { name: 'Tactician', level: 5 },
    heroes: { owned: { kael: { id: 'kael', level: 3, xp: 0, copies: 1 } } },
    formation: { commanderId: 'non_existent_hero' },
  };
  storage.setItem('astral_command_save_v1', JSON.stringify(partialSave));

  const manager = new SaveManager({ storage });
  const result = manager.load();
  assert.equal(result.status, 'recovered');
  assert.equal(result.data.player.level, 5);
  assert.equal(result.data.formation.commanderId, 'kael');
  assert.equal(result.data.settings.battleSpeed, 1);
});

test('SaveManager runs registered migration functions forward', () => {
  const storage = createMemoryStorage();
  const manager = new SaveManager({ storage });
  manager.registerMigration(0, (oldData) => ({
    ...oldData,
    player: { name: oldData.legacyName || 'Commander', level: 2, xp: 10, xpToNext: 100 },
  }));

  const migrated = manager.migrate({ version: 0, legacyName: 'Vanguard' });
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.player.name, 'Vanguard');
  assert.equal(migrated.player.level, 2);
});

test('SaveManager reset restores clean default data', () => {
  const storage = createMemoryStorage();
  const manager = new SaveManager({ storage });
  const modified = createDefaultSave();
  modified.resources.credits = 99999;
  manager.save(modified);

  const resetData = manager.reset();
  assert.equal(resetData.resources.credits, 2400);
  assert.equal(manager.load().data.resources.credits, 2400);
});
