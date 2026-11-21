import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { Pathfinder } from '../src/battle/Pathfinder.js';
import { UnitManager, UNIT_STATES } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';

function loadRegistry() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return buildDataRegistry({
    heroes: read('heroes.json'),
    units: read('units.json'),
    skills: read('skills.json'),
    cards: read('cards.json'),
    stages: read('stages.json'),
    banners: read('banners.json'),
    bosses: read('bosses.json'),
    terrain: read('terrain.json'),
    balance: read('balance.json'),
  });
}

test('Battlefield isometric projection round-trips cleanly and places friendly left, enemy right', () => {
  const registry = loadRegistry();
  const bf = new Battlefield({
    balance: registry.balance,
    terrainConfig: registry.terrainsById.get('terrain_outer_bastion'),
  });

  const allyScreen = bf.worldToScreen(15, 50, 1200, 500);
  const enemyScreen = bf.worldToScreen(85, 50, 1200, 500);
  assert.ok(allyScreen.x < enemyScreen.x, 'Friendly region must project to the LEFT of enemy region');

  // Exact analytical inverse round-trip
  const back = bf.screenToWorld(allyScreen.x, allyScreen.y, 1200, 500);
  assert.ok(Math.abs(back.x - 15) < 0.01);
  assert.ok(Math.abs(back.y - 50) < 0.01);

  // Depth sort orders foreground > background
  assert.ok(bf.getDepth(50, 80) > bf.getDepth(50, 20));

  // Decorative terrain does not block movement, obstacle does
  assert.equal(bf.isWorldWalkable(50, 50), true); // decorative sigil at (50,50)
  assert.equal(bf.isWorldWalkable(48, 28), false); // obstacle bastion_pillar_n at x:44..52, y:24..32
});

test('MovementSystem navigates around obstacles, respects boundaries, separates overlapping units, and handles unreachable targets', () => {
  const registry = loadRegistry();
  const bus = new EventBus();
  const bf = new Battlefield({
    balance: registry.balance,
    terrainConfig: {
      id: 'test_wall',
      worldWidth: 100,
      worldHeight: 100,
      features: [
        // Vertical wall blocking direct horizontal line at x=48..54, y=20..80
        { id: 'wall', type: 'obstacle', shape: 'rect', x: 48, y: 20, width: 6, height: 60, blocksMovement: true },
      ],
    },
  });
  const pf = new Pathfinder(bf);
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const targeting = new TargetingSystem({ balance: registry.balance });
  const movement = new MovementSystem({ battlefield: bf, pathfinder: pf, balance: registry.balance });

  const pathRes = pf.findPath(25, 50, 75, 50);
  assert.equal(pathRes.reachable, true);
  assert.ok(pathRes.waypoints.length >= 2, 'A* must route around the central wall');

  // Spawn ally and enemy across the wall and verify ally moves around obstacle without crossing inside it
  const ally = units.spawnUnit({ unitId: 'wind_cavalry', side: 'ally', x: 24, y: 50 });
  const enemy = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'enemy', x: 76, y: 50 });
  const startX = ally.x;

  for (let i = 0; i < 180; i += 1) {
    targeting.tick(1 / 60);
    movement.update(1 / 60, units, targeting);
    assert.ok(ally.x >= 2 && ally.x <= 98 && ally.y >= 2 && ally.y <= 98, 'Must remain within world boundaries');
  }
  assert.ok(Math.hypot(ally.x - startX, ally.y - 50) > 10, 'Unit must advance along path around wall');
  assert.ok(enemy.x < 76 || Math.abs(enemy.y - 50) > 1, 'Enemy must also advance');

  // Collision separation pushes stacked units apart
  const u1 = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 16, y: 50 });
  const u2 = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 16, y: 50 });
  u1.x = 16;
  u1.y = 50;
  u2.x = 16.05;
  u2.y = 50;
  for (let i = 0; i < 40; i += 1) {
    movement.update(1 / 60, units, targeting);
  }
  assert.ok(Math.hypot(u1.x - u2.x, u1.y - u2.y) > 0.5, 'Overlapping units must separate');

  // Completely walled-off unreachable target detection
  const walledBf = new Battlefield({
    balance: registry.balance,
    terrainConfig: {
      id: 'split_arena',
      worldWidth: 100,
      worldHeight: 100,
      features: [
        { id: 'full_chasm', type: 'blocked', shape: 'rect', x: 46, y: 0, width: 8, height: 100, blocksMovement: true },
      ],
    },
  });
  const walledPf = new Pathfinder(walledBf);
  assert.equal(walledPf.isReachable(20, 50, 80, 50), false);
});

test('TargetingSystem obeys class priorities, Field Cleric healing/combat fallback, target death switch, and hysteresis stability', () => {
  const registry = loadRegistry();
  const bus = new EventBus();
  const bf = new Battlefield({ balance: registry.balance });
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const targeting = new TargetingSystem({ balance: registry.balance });

  const cav = units.spawnUnit({ unitId: 'wind_cavalry', side: 'ally', x: 25, y: 50 });
  const cleric = units.spawnUnit({ unitId: 'field_cleric', side: 'ally', x: 18, y: 50 });
  const allyTank = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 24, y: 52 });

  const enemyTank = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'enemy', x: 48, y: 50 });
  const enemyArcher = units.spawnUnit({ unitId: 'arcane_archer', side: 'enemy', x: 52, y: 50 });

  // Swift Cavalry prioritizes enemy ranged backliner over frontline tank at similar distance
  const cavTarget = targeting.acquireTarget(cav, units);
  assert.equal(cavTarget.mode, 'attack');
  assert.equal(cavTarget.target.uid, enemyArcher.uid);

  // Field Cleric targets enemy when all allies are at full HP
  const clericAttackPick = targeting.acquireTarget(cleric, units);
  assert.equal(clericAttackPick.mode, 'attack');
  assert.equal(clericAttackPick.target.side, 'enemy');

  // Once an ally is injured, Field Cleric switches to healing that ally
  allyTank.hp = Math.round(allyTank.maxHp * 0.4);
  const clericHealPick = targeting.acquireTarget(cleric, units);
  assert.equal(clericHealPick.mode, 'heal');
  assert.equal(clericHealPick.target.uid, allyTank.uid);

  // Dead target immediately triggers switch to remaining living enemy
  cav.targetUid = enemyArcher.uid;
  cav.targetMode = 'attack';
  enemyArcher.hp = 0;
  enemyArcher.state = UNIT_STATES.DEAD;
  const retarget = targeting.acquireTarget(cav, units);
  assert.equal(retarget.target.uid, enemyTank.uid);

  // Hysteresis prevents jittery switching between two nearly equal enemies
  const enemyTank2 = units.spawnUnit({ unitId: 'heavy_shield_guard', side: 'enemy', x: 47.5, y: 50 });
  cav.targetUid = enemyTank.uid;
  cav.targetMode = 'attack';
  const stablePick = targeting.acquireTarget(cav, units);
  assert.equal(stablePick.target.uid, enemyTank.uid, 'Hysteresis must retain existing target for minor score differences');
  assert.ok(enemyTank2.uid);
});
