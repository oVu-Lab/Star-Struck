import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateDataBundle, buildDataRegistry } from '../src/utils/DataLoader.js';
import { GameState } from '../src/core/GameState.js';
import { createDefaultSave } from '../src/core/SaveManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { CardSystem } from '../src/systems/CardSystem.js';

function readDataBundleFromDisk() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const load = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  return {
    heroes: load('heroes.json'),
    units: load('units.json'),
    enemies: load('enemies.json'),
    skills: load('skills.json'),
    cards: load('cards.json'),
    stages: load('stages.json'),
    banners: load('banners.json'),
    bosses: load('bosses.json'),
    terrain: load('terrain.json'),
    balance: load('balance.json'),
  };
}

test('All /data/*.json configuration files pass cross-reference schema validation', () => {
  const raw = readDataBundleFromDisk();
  const validation = validateDataBundle(raw);
  assert.equal(validation.valid, true, validation.errors.join('\n'));

  const registry = buildDataRegistry(raw);
  assert.ok(registry.units.length >= 4);
  for (const coreId of ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric']) {
    assert.ok(registry.unitsById.has(coreId), `Missing core unit ${coreId}`);
  }
  assert.equal(registry.handConfig.deckSize, 6);
  assert.equal(registry.handConfig.slotCount, 6);
  assert.equal(registry.handConfig.refillIntervalSec, 5);
  assert.equal(registry.handConfig.mergeRule, 'any_identical_pair');
});

test('CardSystem enforces 6-slot hand and identical card merging across any slot positions', () => {
  const registry = buildDataRegistry(readDataBundleFromDisk());
  const bus = new EventBus();
  const state = new GameState(createDefaultSave(), bus);
  const cards = new CardSystem({ dataRegistry: registry, gameState: state, eventBus: bus });

  // Deterministic RNG yielding index 0 in slot 0 & slot 5, distinct cards in slots 1..4
  const rolls = [0.0, 0.2, 0.4, 0.6, 0.8, 0.0];
  let rIdx = 0;
  const slots = cards.initHand({
    randomSource: () => rolls[rIdx++ % rolls.length],
  });
  assert.equal(slots.length, 6);

  // Non-adjacent identical cards in slots 0 and 5 can merge
  assert.equal(cards.canMerge(0, 5), true);
  // Same card cannot merge with itself
  assert.equal(cards.canMerge(0, 0), false);
  // Different card types cannot merge
  assert.equal(cards.canMerge(0, 1), false);

  const merged = cards.mergeAdjacent(0, 5);
  assert.equal(merged.ok, true);
  assert.equal(merged.upgradedCard.tier, 2);
  assert.equal(cards.getSlots().length, 6);
  assert.equal(cards.getSlots()[0], null);
  assert.equal(cards.getSlots()[5].tier, 2);
  assert.equal(cards.getRefillState(0).active, true);
});
