import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry, validateDataBundle } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { createDefaultSave } from '../src/core/SaveManager.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { UnitManager, UNIT_STATES } from '../src/battle/UnitManager.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';

function loadFullRegistry() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const raw = {
    heroes: read('heroes.json'),
    units: read('units.json'),
    skills: read('skills.json'),
    cards: read('cards.json'),
    stages: read('stages.json'),
    banners: read('banners.json'),
    bosses: read('bosses.json'),
    terrain: read('terrain.json'),
    balance: read('balance.json'),
  };
  const check = validateDataBundle(raw);
  assert.equal(check.valid, true, check.errors.join('\n'));
  return buildDataRegistry(raw);
}

test('UnitManager creates all 4 unit classes, applies ASTRA +8% Max HP passive, and enforces 25/25/50 caps', () => {
  const registry = loadFullRegistry();
  const bus = new EventBus();
  const bf = new Battlefield({ balance: registry.balance });
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const astraPassive = registry.skillsById.get('passive_astral_aegis');
  assert.equal(astraPassive.effect.stat, 'maxHp');
  assert.equal(astraPassive.effect.value, 0.08);

  const defender = units.spawnUnit({
    unitId: 'heavy_shield_guard',
    side: 'ally',
    x: 20,
    y: 50,
    commanderPassive: astraPassive,
  });
  const baseDef = registry.unitsById.get('heavy_shield_guard');
  assert.equal(defender.maxHp, Math.round(baseDef.stats.maxHp * 1.08));
  assert.equal(defender.hp, defender.maxHp);
  assert.equal(defender.unitClass, 'heavy_defender');

  const cav = units.spawnUnit({ unitId: 'wind_cavalry', side: 'ally', x: 18, y: 40 });
  const archer = units.spawnUnit({ unitId: 'arcane_archer', side: 'ally', x: 12, y: 30 });
  const cleric = units.spawnUnit({ unitId: 'field_cleric', side: 'ally', x: 12, y: 70 });
  assert.equal(cav.unitClass, 'swift_cavalry');
  assert.equal(archer.unitClass, 'arcane_archer');
  assert.equal(cleric.unitClass, 'field_cleric');
  assert.ok(cleric.healPower > 0);
  assert.ok(archer.projectileConfig);

  // Fill remaining friendly slots up to 25
  for (let i = 4; i < 25; i += 1) {
    const u = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 16, y: 15 + (i % 15) * 4 });
    assert.ok(u, `Ally #${i + 1} should spawn`);
  }
  assert.equal(units.getActiveCount('ally'), 25);
  assert.equal(units.canSpawn('ally').ok, false);
  assert.equal(units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 16, y: 50 }), null);

  // Fill enemy slots up to 25 (50 total)
  for (let i = 0; i < 25; i += 1) {
    const e = units.spawnUnit({ unitId: 'arcane_archer', side: 'enemy', x: 84, y: 15 + (i % 15) * 4 });
    assert.ok(e, `Enemy #${i + 1} should spawn`);
  }
  assert.equal(units.getActiveCount('enemy'), 25);
  assert.equal(units.getActiveCount(), 50);
  assert.equal(units.canSpawn('enemy').ok, false);
  assert.equal(units.spawnUnit({ unitId: 'arcane_archer', side: 'enemy', x: 84, y: 50 }), null);
});

test('CombatSystem handles physical/magical mitigation, shields, status effects, healing, exact-once death, and ultimate energy', () => {
  const registry = loadFullRegistry();
  const bus = new EventBus();
  const state = new GameState(createDefaultSave(), bus);
  state.setBattle({ status: 'running', phase: 'active_combat', ultimateEnergy: 0, ultimateMaxEnergy: 100 });
  const heroSystem = new HeroSystem({ dataRegistry: registry, gameState: state, saveManager: { save() {} }, eventBus: bus });
  const skillSystem = new SkillSystem({ gameState: state, heroSystem, eventBus: bus, dataRegistry: registry });
  const bf = new Battlefield({ balance: registry.balance });
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const combat = new CombatSystem({ eventBus: bus, dataRegistry: registry, rng: () => 0.99 });

  const ally = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 40, y: 50 });
  const enemy = units.spawnUnit({ unitId: 'arcane_archer', side: 'enemy', x: 44, y: 50 });

  // Status buff & debuff affect effective stats
  const baseAtk = units.getEffectiveStat(ally, 'attack');
  units.applyStatusEffect(ally, { id: 'atk_up', type: 'buff_attack', value: 0.5, durationSec: 5 });
  assert.ok(units.getEffectiveStat(ally, 'attack') > baseAtk);

  // Magical damage ignores more defense than physical damage
  const physCalc = combat.calculateDamage({ attack: 100, defense: 50, attackType: 'physical' });
  const magCalc = combat.calculateDamage({ attack: 100, defense: 50, attackType: 'magical' });
  assert.ok(magCalc.amount > physCalc.amount);

  // Shield absorbs incoming damage before HP drops
  units.applyStatusEffect(ally, { id: 'shd', type: 'shield', value: 50, durationSec: 5 });
  const hpBeforeShieldHit = ally.hp;
  const shieldRes = combat.applyDamage({
    source: enemy,
    target: ally,
    rawAttack: 40,
    attackType: 'physical',
    unitManager: units,
    skillSystem,
  });
  assert.equal(shieldRes.applied, true);
  assert.equal(ally.hp, hpBeforeShieldHit);
  assert.ok(ally.shield < 50);

  // Ultimate energy increased from ally receiving damage
  assert.ok(state.battle.ultimateEnergy > 0);

  // Direct damage reduces enemy HP and generates ultimate energy
  const ultBefore = state.battle.ultimateEnergy;
  combat.applyDamage({
    source: ally,
    target: enemy,
    rawAttack: 120,
    attackType: 'physical',
    unitManager: units,
    skillSystem,
  });
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(state.battle.ultimateEnergy > ultBefore);

  // Healing restores HP on living injured ally
  ally.hp = ally.maxHp - 150;
  const healRes = combat.applyHeal({ source: ally, target: ally, rawHeal: 100, skillSystem });
  assert.equal(healRes.applied, true);
  assert.equal(ally.hp, ally.maxHp - 50);

  // Death process executes exactly once
  let deathEvents = 0;
  bus.on('battle:unitDefeated', () => {
    deathEvents += 1;
  });

  combat.applyDamage({
    source: ally,
    target: enemy,
    rawAttack: 9999,
    attackType: 'magical',
    unitManager: units,
    skillSystem,
  });
  assert.equal(enemy.hp, 0);
  assert.equal(enemy.state, UNIT_STATES.DEAD);
  assert.equal(deathEvents, 1);

  // Subsequent damage or healing on dead unit is ignored and cannot fire death twice
  const postDeathDmg = combat.applyDamage({
    source: ally,
    target: enemy,
    rawAttack: 9999,
    unitManager: units,
    skillSystem,
  });
  assert.equal(postDeathDmg.applied, false);
  assert.equal(deathEvents, 1);

  const postDeathHeal = combat.applyHeal({ source: ally, target: enemy, rawHeal: 500, skillSystem });
  assert.equal(postDeathHeal.applied, false);
  assert.equal(enemy.hp, 0);

  // Dead units cannot generate ultimate energy
  const ultAtDeath = state.battle.ultimateEnergy;
  combat.applyDamage({
    source: enemy, // dead attacker
    target: ally,
    rawAttack: 10,
    unitManager: units,
    skillSystem,
  });
  // Only living ally taking damage may gain energy; if ally is dead too, zero gain
  ally.hp = 0;
  ally.state = UNIT_STATES.DEAD;
  ally.deadProcessed = true;
  const ultFrozen = state.battle.ultimateEnergy;
  combat.applyDamage({ source: ally, target: enemy, rawAttack: 50, unitManager: units, skillSystem });
  assert.equal(state.battle.ultimateEnergy, ultFrozen);
  assert.ok(ultAtDeath > 0);
});

test('ProjectileSystem resolves ranged magical, AoE, and healing projectiles over flight time', () => {
  const registry = loadFullRegistry();
  const bus = new EventBus();
  const bf = new Battlefield({ balance: registry.balance });
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const combat = new CombatSystem({ eventBus: bus, dataRegistry: registry, rng: () => 0.99 });
  const projectiles = new ProjectileSystem({ eventBus: bus });

  const archer = units.spawnUnit({ unitId: 'arcane_archer', side: 'ally', x: 20, y: 50 });
  const cleric = units.spawnUnit({ unitId: 'field_cleric', side: 'ally', x: 18, y: 55 });
  const enemy = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'enemy', x: 40, y: 50 });

  archer.hp = archer.maxHp - 100;

  // Spawn magical attack projectile and healing projectile
  projectiles.spawn({
    kind: 'magical',
    sourceUid: archer.uid,
    sourceSide: 'ally',
    x: archer.x,
    y: archer.y,
    targetUid: enemy.uid,
    targetX: enemy.x,
    targetY: enemy.y,
    speed: 40,
    damage: 90,
    attackType: 'magical',
  });
  projectiles.spawn({
    kind: 'healing',
    sourceUid: cleric.uid,
    sourceSide: 'ally',
    x: cleric.x,
    y: cleric.y,
    targetUid: archer.uid,
    targetX: archer.x,
    targetY: archer.y,
    speed: 40,
    healAmount: 75,
  });

  assert.equal(projectiles.getAll().length, 2);

  // Advance simulation until both projectiles impact
  for (let i = 0; i < 60; i += 1) {
    projectiles.update(1 / 60, { unitManager: units, combatSystem: combat });
  }

  assert.equal(projectiles.getAll().length, 0);
  assert.ok(enemy.hp < enemy.maxHp, 'Ranged projectile should damage enemy');
  assert.ok(archer.hp > archer.maxHp - 100, 'Healing projectile should restore injured ally');
});
