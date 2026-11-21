import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry, validateDataBundle } from '../src/utils/DataLoader.js';
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
import { Battlefield } from '../src/battle/Battlefield.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleRenderer, TERRAIN_THEMES } from '../src/rendering/BattleRenderer.js';

function readBundle() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
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

function makeMockCtx(renderedTexts = []) {
  return {
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
    fillText(text) {
      renderedTexts.push(String(text));
    },
    strokeText() {},
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
}

function createHarness(attachRenderer = true) {
  const bundle = readBundle();
  const dataRegistry = buildDataRegistry(bundle);
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({
    dataRegistry,
    gameState,
    heroSystem,
    saveManager,
    eventBus,
  });
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
  const renderedTexts = [];

  const mockAssetManager = {
    getImageElement: () => null,
    getStatusSummary: () => ({ registered: 10, loaded: 10, fallback: 0 }),
  };

  const battleRenderer = new BattleRenderer({
    assetManager: mockAssetManager,
    animationManager,
    particleSystem,
    gameState,
  });

  if (attachRenderer) {
    battleRenderer.attach({
      width: 1280,
      height: 720,
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
      getContext: () => makeMockCtx(renderedTexts),
    });
  }

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
    battleRenderer,
    animationManager,
    particleSystem,
    audioManager: null,
    eventBus,
  });

  return {
    bundle,
    dataRegistry,
    gameState,
    heroSystem,
    cardSystem,
    unitManager,
    animationManager,
    particleSystem,
    battleRenderer,
    battleManager,
    renderedTexts,
  };
}

test('P5 Identity: multi-realm metadata on heroes, units, and terrains validates cleanly with distinct themes', () => {
  const bundle = readBundle();
  const validation = validateDataBundle(bundle);
  assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);

  assert.equal(bundle.heroes.heroes.length, 5);
  const heroRealms = new Set();
  for (const h of bundle.heroes.heroes) {
    assert.ok(typeof h.realm === 'string' && h.realm.length > 0, `Hero ${h.id} missing realm`);
    assert.ok(typeof h.motif === 'string' && h.motif.length > 0, `Hero ${h.id} missing motif`);
    assert.ok(
      typeof h.synergyHint === 'string' && h.synergyHint.length > 0,
      `Hero ${h.id} missing synergyHint`,
    );
    heroRealms.add(h.realm);
  }
  assert.equal(heroRealms.size, 5, 'Each of the 5 commanders should represent a distinct realm');

  assert.equal(bundle.units.units.length, 10);
  for (const u of bundle.units.units) {
    assert.ok(typeof u.realm === 'string' && u.realm.length > 0, `Unit ${u.id} missing realm`);
    assert.ok(
      typeof u.traitLabel === 'string' && u.traitLabel.length > 0,
      `Unit ${u.id} missing traitLabel`,
    );
  }

  assert.equal(bundle.terrain.terrains.length, 6);
  const sigils = new Set();
  for (const t of bundle.terrain.terrains) {
    assert.ok(t.realmTitle, `Terrain ${t.id} missing realmTitle`);
    assert.ok(t.atmosphere, `Terrain ${t.id} missing atmosphere`);
    assert.ok(TERRAIN_THEMES[t.theme], `Missing TERRAIN_THEMES entry for ${t.theme}`);
    sigils.add(TERRAIN_THEMES[t.theme].sigilStyle);
  }
  assert.equal(sigils.size, 6, 'All 6 battlefield themes should have unique centerpiece sigils');
});

test('P5 BattleRenderer: renders all 6 realm themes, targeting reticles, and interactive Commander Dais hit-testing', () => {
  const { dataRegistry, battleRenderer, heroSystem, renderedTexts } = createHarness(true);
  const commander = heroSystem.getActiveCommander();

  for (const terrainDef of dataRegistry.terrains) {
    const bf = new Battlefield({ balance: dataRegistry.balance, terrainConfig: terrainDef });
    battleRenderer.setBattlefield(bf);
    renderedTexts.length = 0;

    assert.doesNotThrow(() => {
      battleRenderer.render({
        stage: dataRegistry.stages[0],
        battlefield: bf,
        phase: BATTLE_PHASES.PREPARATION,
        units: [],
        projectiles: [],
        telegraphs: [],
        commander,
        ultimateEnergy: 100,
        selectedPrepUnitUid: 'prep_unit_1',
        hoverDais: true,
        pointerWorld: { x: 16, y: 50 },
        selectedCard: null,
      });
    }, `Failed rendering terrain theme ${terrainDef.theme}`);

    assert.ok(
      renderedTexts.includes('PLACE HERE'),
      `Expected prep reticle PLACE HERE in ${terrainDef.theme}`,
    );
    assert.ok(
      renderedTexts.includes('CLICK TO CAST'),
      `Expected CLICK TO CAST when hovering ready Commander Dais in ${terrainDef.theme}`,
    );
  }

  // Test Dais hit-test bounds
  const dais = battleRenderer._lastDaisRect;
  assert.ok(dais && dais.width > 0 && dais.height > 0, 'Expected recorded dais rect after render');
  assert.equal(
    battleRenderer.hitTestCommanderDais(dais.x + dais.width * 0.5, dais.y + dais.height * 0.5),
    true,
  );
  assert.equal(battleRenderer.hitTestCommanderDais(0, 0), false);

  // Test AoE Skill reticle rendering
  renderedTexts.length = 0;
  const skillCard = dataRegistry.cards.find(
    (c) => c.category === 'skill' && c.effect?.kind === 'aoe_damage',
  );
  assert.ok(skillCard, 'Expected an aoe_damage skill card in data');
  const bf0 = new Battlefield({ balance: dataRegistry.balance, terrainConfig: dataRegistry.terrains[0] });
  battleRenderer.render({
    stage: dataRegistry.stages[0],
    battlefield: bf0,
    phase: BATTLE_PHASES.ACTIVE_COMBAT,
    units: [],
    projectiles: [],
    telegraphs: [],
    commander,
    ultimateEnergy: 50,
    hoverDais: false,
    pointerWorld: { x: 52, y: 50 },
    selectedCard: { ...skillCard, tier: 1 },
  });
  assert.ok(
    renderedTexts.some((t) => t.startsWith('CAST')),
    'Expected CAST reticle label for AoE skill card preview',
  );
});

test('P5 BattleManager: clicking Commander Dais triggers Ultimate and Support/Merged cards emit world feedback', () => {
  const {
    dataRegistry,
    gameState,
    battleManager,
    battleRenderer,
    animationManager,
    particleSystem,
    cardSystem,
  } = createHarness(true);

  battleManager.startSession(null, { stageId: 'stage_1_1' });
  battleRenderer.attach({
    width: 1280,
    height: 720,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    getContext: () => makeMockCtx(),
  });
  battleRenderer.setBattlefield(battleManager.battlefield);
  battleManager.beginBattle();
  // Step past BATTLE_START countdown into ACTIVE_COMBAT
  battleManager.stepSimulation(1.2);

  // Fill ultimate energy and render dais so _lastDaisRect is populated
  gameState.setBattle({ ultimateEnergy: 100, energy: 100 });
  battleRenderer.render({
    stage: dataRegistry.stagesById.get('stage_1_1'),
    battlefield: battleManager.battlefield,
    phase: BATTLE_PHASES.ACTIVE_COMBAT,
    units: battleManager._units.getAll(),
    projectiles: [],
    telegraphs: [],
    commander: battleManager._heroes.getActiveCommander(),
    ultimateEnergy: 100,
  });
  const dais = battleRenderer._lastDaisRect;
  assert.ok(dais, 'Commander dais rect should be available after render');

  const daisRes = battleManager.handleCanvasPointer(
    dais.x + dais.width * 0.5,
    dais.y + dais.height * 0.5,
  );
  assert.equal(daisRes.action, 'commander_dais');
  assert.equal(daisRes.ok, true);
  assert.equal(gameState.battle.ultimateEnergy, 0, 'Ultimate energy should be spent on dais cast');

  // Test Support card world feedback
  animationManager.reset();
  particleSystem._active.length = 0;
  const energySurge = dataRegistry.cards.find(
    (c) => c.category === 'support' && c.effect?.kind === 'energy_and_buff',
  );
  assert.ok(energySurge, 'Expected an energy_and_buff support card in dataRegistry');
  cardSystem._slots[0] = cardSystem._createCardInstance(energySurge, 1);
  gameState.setBattle({ energy: 100 });

  const playRes = battleManager.playCardSlot(0);
  assert.equal(playRes.ok, true, `Expected support card play to succeed: ${playRes.reason}`);
  assert.ok(
    animationManager.getFloatingTexts().some((ft) => ft.text.includes('ENERGY')),
    'Expected ENERGY floating callout when playing energy_and_buff support card',
  );
  assert.ok(particleSystem._active.length > 0, 'Expected particle burst on support card play');

  // Test merged Lv.II Unit deployment callout
  animationManager.reset();
  const defenderCard = dataRegistry.cards.find((c) => c.category === 'unit' && c.unitId);
  assert.ok(defenderCard, 'Expected a unit card in dataRegistry');
  cardSystem._slots[1] = cardSystem._createCardInstance(defenderCard, 2);
  gameState.setBattle({ energy: 100 });
  const unitPlay = battleManager.playCardSlot(1, { x: 18, y: 50 });
  assert.equal(unitPlay.ok, true, `Expected Lv.II unit play to succeed: ${unitPlay.reason}`);
  assert.ok(
    animationManager.getFloatingTexts().some((ft) => ft.text.includes('Lv.II')),
    'Expected Lv.II floating callout when deploying a merged unit card',
  );
});

test('P5 Branding & Onboarding: Star Struck header, Tactical Guide wiring, and clean UI standards', () => {
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('Star Struck'), 'index.html should display Star Struck branding');
  assert.ok(indexHtml.includes('id="hdr-guide-btn"'), 'index.html should include #hdr-guide-btn');

  const gameJs = fs.readFileSync(path.resolve(process.cwd(), 'src/core/Game.js'), 'utf8');
  assert.ok(gameJs.includes('openGuide('), 'Game.js should implement openGuide()');
  assert.equal(gameJs.includes('getPersistent('), false, 'Game.js must not call getPersistent()');

  const uiDir = path.resolve(process.cwd(), 'src/ui');
  for (const file of fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'))) {
    const content = fs.readFileSync(path.join(uiDir, file), 'utf8');
    assert.equal(/<select\b/i.test(content), false, `Native <select> found in ${file}`);
  }
});
