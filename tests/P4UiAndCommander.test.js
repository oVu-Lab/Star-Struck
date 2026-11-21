import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { BattleManager, BATTLE_PHASES } from '../src/battle/BattleManager.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleRenderer } from '../src/rendering/BattleRenderer.js';

function loadRegistry() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return buildDataRegistry({
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
  });
}

test('P4 UI Standards: zero native <select> dropdowns across all UI screens', () => {
  const uiDir = path.resolve(process.cwd(), 'src', 'ui');
  const files = fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 7, 'Expected all 7 UI screen controllers');

  for (const file of files) {
    const content = fs.readFileSync(path.join(uiDir, file), 'utf8');
    assert.equal(
      /<select\b/i.test(content),
      false,
      `Native <select> element should not be used in ${file}`,
    );
  }
});

test('P4 UI Standards: mute handlers use toSerializableSave() instead of nonexistent getPersistent()', () => {
  for (const relPath of ['src/core/Game.js', 'src/ui/BattleScreen.js']) {
    const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
    assert.equal(
      content.includes('getPersistent('),
      false,
      `${relPath} must not call nonexistent getPersistent()`,
    );
  }
});

test('P4 BattleRenderer: renders prominent Commander Orbital Dais in both charging and ready states across desktop resolutions', () => {
  const dataRegistry = loadRegistry();
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({ dataRegistry, gameState, heroSystem, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, saveManager, eventBus });
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry,
    gameState,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });

  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: dataRegistry.balance });
  const movementSystem = new MovementSystem({ balance: dataRegistry.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry });
  const waveManager = new WaveManager({ eventBus, balance: dataRegistry.balance });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();

  const battleManager = new BattleManager({
    dataRegistry,
    gameState,
    heroSystem,
    cardSystem,
    progressionSystem,
    economySystem,
    unitManager,
    targetingSystem,
    movementSystem,
    combatSystem,
    projectileSystem,
    skillSystem,
    waveManager,
    battleRenderer: null,
    animationManager,
    particleSystem,
    audioManager: null,
    eventBus,
  });

  const renderedTexts = [];
  const makeMockCtx = () => ({
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    roundRect() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    drawImage() {},
    fillText(text) { renderedTexts.push(String(text)); },
    strokeText() {},
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  });

  const mockAssetManager = {
    getImageElement: () => null,
    getStatusSummary: () => ({ registered: 10, loaded: 10, fallback: 0 }),
  };

  const renderer = new BattleRenderer({
    assetManager: mockAssetManager,
    animationManager,
    particleSystem,
    gameState,
  });

  battleManager.startSession(null, { stageId: 'stage_1_1' });
  const commander = heroSystem.getActiveCommander();

  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ];

  for (const vp of viewports) {
    renderedTexts.length = 0;
    const mockCanvas = {
      width: vp.width,
      height: vp.height,
      getBoundingClientRect: () => vp,
      getContext: () => makeMockCtx(),
    };
    renderer.attach(mockCanvas);

    // Charging state
    assert.doesNotThrow(() => {
      renderer.render({
        stage: dataRegistry.stagesById.get('stage_1_1'),
        battlefield: battleManager.battlefield,
        phase: BATTLE_PHASES.ACTIVE_COMBAT,
        units: unitManager.getAll(),
        projectiles: [],
        telegraphs: [],
        commander,
        ultimateEnergy: 45,
      });
    });
    assert.ok(renderedTexts.includes('COMMANDER'), `Expected COMMANDER label at ${vp.width}x${vp.height}`);

    // Ultimate ready state
    renderedTexts.length = 0;
    assert.doesNotThrow(() => {
      renderer.render({
        stage: dataRegistry.stagesById.get('stage_1_1'),
        battlefield: battleManager.battlefield,
        phase: BATTLE_PHASES.ACTIVE_COMBAT,
        units: unitManager.getAll(),
        projectiles: [],
        telegraphs: [],
        commander,
        ultimateEnergy: 100,
      });
    });
    assert.ok(renderedTexts.includes('ULT READY'), `Expected ULT READY label at ${vp.width}x${vp.height}`);
    renderer.detach();
  }
});
