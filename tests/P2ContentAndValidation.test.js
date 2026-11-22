import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateDataBundle, buildDataRegistry } from '../src/utils/DataLoader.js';
import { ASSETS_CONFIG } from '../src/rendering/AssetManager.js';

function loadFullBundle() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  return {
    heroes: read('heroes.json'),
    units: read('units.json'),
    enemies: read('enemies.json'),
    skills: read('skills.json'),
    cards: read('cards.json'),
    stages: read('stages.json'),
    banners: read('banners.json'),
    bosses: read('bosses.json'),
    terrain: read('terrain.json'),
    balance: read('balance.json'),
  };
}

test('P2 Data Schema Validation: all 10 JSON configs pass strict cross-reference checks', () => {
  const raw = loadFullBundle();
  const res = validateDataBundle(raw);
  assert.equal(res.valid, true, res.errors.join('\n'));
});

test('P2 Roster Targets: 10 playable units, 10 enemies, 28 cards, 5 commanders, 6 elite modifiers, 5 bosses, 12 stages, 6 terrains', () => {
  const registry = buildDataRegistry(loadFullBundle());

  assert.equal(registry.units.length, 10);
  assert.equal(registry.enemies.length, 10);
  assert.equal(registry.cards.length, 28);
  assert.equal(registry.heroes.length, 5);
  assert.equal(registry.eliteModifiers.length, 6);
  assert.equal(registry.elites.length, 8);
  assert.equal(registry.bosses.length, 5);
  assert.equal(registry.stages.length, 12);
  assert.equal(registry.terrains.length, 6);
  assert.equal(registry.banners.length, 2);

  // Verify 4 core classes preserved
  for (const id of ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric']) {
    assert.ok(registry.unitsById.has(id), `Core unit ${id} missing`);
  }

  // Verify card distribution across all 4 categories and Lv.I-III scaling
  const byCat = { unit: 0, skill: 0, tactic: 0, support: 0 };
  for (const card of registry.cards) {
    byCat[card.category] = (byCat[card.category] || 0) + 1;
    assert.ok(card.cost > 0, `Card ${card.id} missing positive cost`);
    assert.ok(card.upgradedName && card.maxName, `Card ${card.id} missing Lv.II/III names`);
    if (card.category === 'unit') {
      assert.ok(
        card.statMultiplierByTier?.['1'] &&
          card.statMultiplierByTier?.['2'] &&
          card.statMultiplierByTier?.['3'],
        `Unit card ${card.id} missing statMultiplierByTier 1/2/3`,
      );
    } else {
      const hasTierTable = Object.values(card.effect || {}).some(
        (v) => v && typeof v === 'object' && v['1'] !== undefined && v['2'] !== undefined && v['3'] !== undefined,
      );
      assert.ok(hasTierTable, `Tactical card ${card.id} missing Lv.I/II/III scaling table in effect`);
    }
    assert.ok(ASSETS_CONFIG[card.iconAssetId], `Card ${card.id} iconAssetId ${card.iconAssetId} not registered in AssetManager`);
  }
  assert.equal(byCat.unit, 10);
  assert.equal(byCat.skill, 6);
  assert.equal(byCat.tactic, 6);
  assert.equal(byCat.support, 6);

  // Verify every playable unit's sprite asset exists in AssetManager and on disk
  for (const u of registry.units) {
    const assetEntry = ASSETS_CONFIG[u.spriteAssetId];
    assert.ok(assetEntry, `Unit ${u.id} spriteAssetId ${u.spriteAssetId} not registered`);
    const diskPath = path.resolve(process.cwd(), assetEntry.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Asset file missing on disk: ${diskPath}`);
  }

  // Verify ASTRA preserved exactly (+8% Max HP passive + Starfall Judgment damage + heal)
  const astra = registry.heroesById.get('astra');
  assert.ok(astra);
  const astraPassive = registry.skillsById.get(astra.passiveSkillId);
  const astraUlt = registry.skillsById.get(astra.ultimateSkillId);
  assert.equal(astraPassive.effect.stat, 'maxHp');
  assert.equal(astraPassive.effect.value, 0.08);
  assert.equal(astraUlt.name, 'Starfall Judgment');
  assert.ok(astraUlt.effect.damage > 0 && astraUlt.effect.healAmount > 0);

  // Verify all 5 bosses have >= 2 distinct valid abilities
  for (const boss of registry.bosses) {
    assert.ok(Array.isArray(boss.abilities) && boss.abilities.length >= 2, `Boss ${boss.id} needs >= 2 abilities`);
    for (const abId of boss.abilities) {
      assert.ok(registry.bossAbilitiesById.has(abId), `Boss ${boss.id} references unknown ability ${abId}`);
    }
  }

  // Verify banner_starlight_command (Character Gacha Banner) uses updated costs & 30-pull SSR pity while preserving rates
  const cmdBanner = registry.bannersById.get('banner_starlight_command');
  assert.ok(cmdBanner);
  assert.equal(cmdBanner.rates.SSR, 0.03);
  assert.equal(cmdBanner.rates.SR, 0.17);
  assert.equal(cmdBanner.rates.R, 0.8);
  assert.equal(cmdBanner.currency, 'astrite');
  assert.equal(cmdBanner.singleCost, 100);
  assert.equal(cmdBanner.tenCost, 1000);
  assert.equal(cmdBanner.pityConfig.ssrHardPity, 30);

  // Verify tactical banner remains unmodified
  const tacBanner = registry.bannersById.get('banner_tactical_requisition');
  assert.ok(tacBanner);
  assert.equal(tacBanner.singleCost, 160);
  assert.equal(tacBanner.tenCost, 1600);
  assert.equal(tacBanner.pityConfig.ssrHardPity, 80);
  assert.equal(tacBanner.rates.SSR, 0.03);
  assert.equal(tacBanner.rates.SR, 0.17);
  assert.equal(tacBanner.rates.R, 0.8);

  // Verify stages span 3 chapters and cover all 5 bosses
  const chapters = new Set(registry.stages.map((s) => s.chapter));
  assert.deepEqual([...chapters].sort(), [1, 2, 3]);
  const spawnedBossIds = new Set();
  for (const s of registry.stages) {
    for (const w of s.waves) {
      if (w.boss?.bossId) spawnedBossIds.add(w.boss.bossId);
    }
  }
  assert.equal(spawnedBossIds.size, 5, 'All 5 bosses should appear in campaign stages');
});
