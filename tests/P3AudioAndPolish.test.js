import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION, DEFAULT_SAVE_KEY } from '../src/core/SaveManager.js';
import { AudioManager } from '../src/core/AudioManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
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

function createFullHarness() {
  const dataRegistry = loadRegistry();
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const audioManager = new AudioManager(gameState);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({ dataRegistry, gameState, heroSystem, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry,
    gameState,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });

  for (const h of dataRegistry.heroes) heroSystem.grantHero(h.id);
  for (const u of dataRegistry.units) formationSystem.unlockUnit(u.id, cardSystem);
  for (const c of dataRegistry.cards) cardSystem.unlockCard(c.id);

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
    audioManager,
    eventBus,
  });

  return {
    dataRegistry,
    storage,
    eventBus,
    saveManager,
    gameState,
    audioManager,
    heroSystem,
    formationSystem,
    cardSystem,
    unitManager,
    animationManager,
    particleSystem,
    battleManager,
  };
}

test('P3 AudioManager: mute controls, channel volumes, BGM mode switching, and headless safety', () => {
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const audio = new AudioManager(gameState);

  assert.equal(audio.isMusicEnabled(), true);
  assert.equal(audio.isSfxEnabled(), true);
  assert.equal(audio.getBgmMode(), null);
  audio.setBgmMode('menu');
  assert.equal(audio.getBgmMode(), 'menu');

  // Master mute disables both channels
  gameState.mutatePersistent('settings', (p) => {
    p.settings.muted = true;
  });
  assert.equal(audio.isMusicEnabled(), false);
  assert.equal(audio.isSfxEnabled(), false);

  // Independent channel mutes
  gameState.mutatePersistent('settings', (p) => {
    p.settings.muted = false;
    p.settings.musicMuted = true;
    p.settings.sfxMuted = false;
  });
  assert.equal(audio.isMusicEnabled(), false);
  assert.equal(audio.isSfxEnabled(), true);

  gameState.mutatePersistent('settings', (p) => {
    p.settings.musicMuted = false;
    p.settings.sfxMuted = true;
  });
  assert.equal(audio.isMusicEnabled(), true);
  assert.equal(audio.isSfxEnabled(), false);

  // Zero volume disables respective channel
  gameState.mutatePersistent('settings', (p) => {
    p.settings.sfxMuted = false;
    p.settings.musicVolume = 0;
    p.settings.sfxVolume = 0;
  });
  assert.equal(audio.isMusicEnabled(), false);
  assert.equal(audio.isSfxEnabled(), false);

  // BGM mode switching works cleanly
  audio.setBgmMode('battle');
  assert.equal(audio.getBgmMode(), 'battle');
  audio.setBgmMode('boss');
  assert.equal(audio.getBgmMode(), 'boss');
  audio.setBgmMode('invalid_mode');
  assert.equal(audio.getBgmMode(), 'boss');
  audio.stopBgm();

  // Headless invocations of all SFX methods never throw
  assert.doesNotThrow(() => {
    audio.playClick();
    audio.playCardSelect();
    audio.playCardDraw();
    audio.playInvalid();
    audio.playDeploy();
    audio.playMerge(2);
    audio.playMerge(3);
    audio.playProjectile();
    audio.playHit(false, 'physical');
    audio.playHit(true, 'magical');
    audio.playSkill();
    audio.playHeal();
    audio.playShield();
    audio.playUnitDeath(false);
    audio.playUnitDeath(true);
    audio.playWave();
    audio.playBossEntrance();
    audio.playUltimate();
    audio.playVictory();
    audio.playDefeat();
    audio.playSummon('R');
    audio.playSummon('SR');
    audio.playSummon('SSR');
    audio.playReward();
  });
});

test('P3 SaveManager: persists mute flags and migrates legacy saves safely', () => {
  const storage = createMemoryStorage();
  const sm = new SaveManager({ storage });

  // Simulate legacy v2 save without mute flags
  const legacySave = {
    version: 2,
    settings: {
      musicVolume: 0.45,
      sfxVolume: 0.72,
      battleSpeed: 2,
      graphicsQuality: 'high',
    },
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(legacySave));

  const loaded = sm.load();
  assert.equal(loaded.data.version, SAVE_VERSION);
  assert.equal(loaded.data.settings.musicVolume, 0.45);
  assert.equal(loaded.data.settings.sfxVolume, 0.72);
  assert.equal(loaded.data.settings.muted, false);
  assert.equal(loaded.data.settings.musicMuted, false);
  assert.equal(loaded.data.settings.sfxMuted, false);

  // Save updated mute flags and verify persistence
  loaded.data.settings.muted = true;
  loaded.data.settings.musicMuted = true;
  loaded.data.settings.sfxMuted = false;
  sm.save(loaded.data);

  const reloaded = sm.load();
  assert.equal(reloaded.data.settings.muted, true);
  assert.equal(reloaded.data.settings.musicMuted, true);
  assert.equal(reloaded.data.settings.sfxMuted, false);
});

test('P3 CardSystem: preserves 6-slot hand, merge rules, and exposes card rarity across all categories', () => {
  const { cardSystem, dataRegistry } = createFullHarness();

  const customDeck = [
    'card_shield_guard',
    'card_shield_guard',
    'card_wind_cavalry',
    'card_arcane_archer',
    'card_skill_astral_nova',
    'card_tactic_full_assault',
    'card_support_aegis_blessing',
    'card_field_cleric',
    'card_vanguard_breaker',
    'card_pulse_skirmisher',
    'card_skill_sanctuary_wave',
    'card_support_overclock_core',
  ];

  const slots = cardSystem.initHand({ customDeckIds: customDeck });
  assert.equal(slots.length, 6);
  for (const slot of slots) {
    assert.ok(slot, 'Initial 6 slots should be populated');
    assert.ok(['R', 'SR', 'SSR'].includes(slot.rarity), `Card ${slot.cardId} should have valid rarity`);
    assert.ok(['unit', 'skill', 'tactic', 'support'].includes(slot.category));
  }

  // Verify every card in registry has rarity
  for (const def of dataRegistry.cards) {
    assert.ok(['R', 'SR', 'SSR'].includes(def.rarity));
  }
});

test('P3 VFX & Pooling: ParticleSystem and AnimationManager stay bounded under high bursts', () => {
  const particles = new ParticleSystem();
  particles.seedAmbient(1280, 520, 'medium');
  for (let i = 0; i < 60; i += 1) {
    particles.spawnBurst(400, 240, '#38bdf8', 15);
    particles.spawnRising(320, 240, '#34d399', 8);
  }
  assert.ok(particles.getActiveCount() <= 160, 'Particle active pool must stay strictly bounded');
  particles.update(0.5, 1280, 520);
  particles.update(2.0, 1280, 520);
  assert.equal(particles.getActiveCount(), 24, 'Expired burst particles must return to pool leaving only medium-quality ambient motes');
  particles.clear();
  assert.equal(particles.getActiveCount(), 0, 'clear() must release all particles');

  const anim = new AnimationManager();
  anim.triggerScreenFlash('#e2b75b', 0.4, 0.25);
  const flashBefore = anim.getScreenFlash();
  assert.ok(flashBefore && flashBefore.alpha > 0);
  anim.update(0.5);
  assert.equal(anim.getScreenFlash(), null);

  for (let i = 0; i < 120; i += 1) {
    anim.spawnWorldEffect({ kind: 'slash', x: 50, y: 50, angle: 0.4, duration: 0.25 });
    anim.spawnFloatingText({ x: 50, y: 50, text: '-120', kind: 'damage' });
  }
  assert.ok(anim.getWorldEffects().length <= 56, 'World effects pool must be bounded');
  assert.ok(anim.getFloatingTexts().length <= 72, 'Floating texts pool must be bounded');
});

test('P3 BattleManager: Commander-specific ultimate VFX, boss entrance VFX, and 50-unit stress simulation', () => {
  const h = createFullHarness();

  // Start boss stage (1-3 has a boss wave)
  h.battleManager.startSession(null, { stageId: 'stage_1_3' });
  h.battleManager.beginBattle();

  // Advance past battle start intro
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);
  assert.equal(h.audioManager.getBgmMode(), 'battle');

  // Test Commander-specific ultimate effect mapping for Astra & Kael
  h.gameState.setBattle({ ultimateEnergy: 100 });
  const ultRes = h.battleManager.triggerUltimate();
  assert.equal(ultRes.ok, true);
  assert.ok(
    h.animationManager.getWorldEffects().some((fx) => fx.kind === 'starfall'),
    'Astra ultimate should spawn starfall world effect',
  );
  assert.ok(h.animationManager.getScreenFlash() !== null, 'Ultimate should trigger screen flash');

  // Emit boss spawn and verify boss entrance VFX & BGM transition
  const fakeBoss = { uid: 'boss_test', x: 84, y: 50, auraColor: '#ef4444', isBoss: true };
  h.eventBus.emit('battle:bossSpawned', { boss: fakeBoss });
  assert.ok(
    h.animationManager.getWorldEffects().some((fx) => fx.kind === 'boss_entrance'),
    'Boss spawn should trigger boss_entrance world effect',
  );
  assert.equal(h.audioManager.getBgmMode(), 'boss', 'Boss spawn should switch BGM mode to boss');

  // 50-unit stress test: fill battlefield to 25 friendly + 25 enemy cap
  const allyIds = ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'];
  const enemyIds = ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer'];
  while (h.unitManager.canSpawn('ally').ok) {
    const idx = h.unitManager.getActiveCount('ally');
    h.unitManager.spawnUnit({
      unitId: allyIds[idx % allyIds.length],
      side: 'ally',
      x: 10 + (idx % 5) * 4,
      y: 16 + Math.floor(idx / 5) * 14,
      level: 3,
      restrictToRegion: true,
    });
  }
  while (h.unitManager.canSpawn('enemy').ok) {
    const idx = h.unitManager.getActiveCount('enemy');
    h.unitManager.spawnUnit({
      unitId: enemyIds[idx % enemyIds.length],
      side: 'enemy',
      x: 74 + (idx % 5) * 4,
      y: 16 + Math.floor(idx / 5) * 14,
      level: 2,
      restrictToRegion: true,
    });
  }

  assert.equal(h.unitManager.getActiveCount('ally'), 25);
  assert.equal(h.unitManager.getActiveCount('enemy'), 25);

  // Step 180 ticks (3 full seconds of 50-unit combat) and measure execution time & integrity
  const t0 = performance.now();
  for (let tick = 0; tick < 180; tick += 1) {
    h.battleManager.stepSimulation(1 / 60);
    h.particleSystem.update(1 / 60, 1280, 520);
  }
  const elapsedMs = performance.now() - t0;

  // Verify no NaN coordinates or HP across all units
  for (const unit of h.unitManager.getAll()) {
    assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y), 'Unit coordinates must remain finite');
    assert.ok(Number.isFinite(unit.hp), 'Unit HP must remain finite');
  }
  assert.ok(elapsedMs < 2000, `180 simulation ticks at 50 units should complete well within budget (took ${elapsedMs.toFixed(1)}ms)`);
});

test('P3 BattleRenderer: renders 50 units, floor cache, status effects, and all new VFX kinds without error', async () => {
  const { BattleRenderer } = await import('../src/rendering/BattleRenderer.js');
  const h = createFullHarness();

  // Minimal 2D canvas mock tracking draw calls
  let drawCalls = 0;
  const makeMockCtx = () => ({
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() { drawCalls += 1; },
    strokeRect() { drawCalls += 1; },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    roundRect() {},
    quadraticCurveTo() {},
    fill() { drawCalls += 1; },
    stroke() { drawCalls += 1; },
    drawImage() { drawCalls += 1; },
    fillText() { drawCalls += 1; },
    strokeText() { drawCalls += 1; },
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    measureText: (t) => ({ width: String(t || '').length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  });

  const mockCanvas = {
    width: 1200,
    height: 520,
    getBoundingClientRect: () => ({ width: 1200, height: 520 }),
    getContext: () => makeMockCtx(),
  };

  const mockAssetManager = {
    getDrawable: () => null,
    getImageElement: () => null,
    getStatusSummary: () => ({ registered: 10, loaded: 10, fallback: 0 }),
  };

  const renderer = new BattleRenderer({
    assetManager: mockAssetManager,
    animationManager: h.animationManager,
    particleSystem: h.particleSystem,
    gameState: h.gameState,
  });

  renderer.attach(mockCanvas);
  h.battleManager.startSession(null, { stageId: 'stage_1_3' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  // Trigger every new P3 effect kind + screen flash + particle bursts
  const effectKinds = [
    'ring',
    'starfall',
    'volley',
    'tempest',
    'sanctuary',
    'bastion',
    'heal_wave',
    'deploy',
    'death',
    'slash',
    'lightning',
    'boss_entrance',
    'tactic_pulse',
    'lance',
  ];
  for (const kind of effectKinds) {
    h.animationManager.spawnWorldEffect({
      kind,
      x: 42,
      y: 48,
      x2: 68,
      y2: 52,
      angle: 0.35,
      radius: 16,
      color: '#e2b75b',
      duration: 0.8,
    });
  }
  h.animationManager.triggerScreenFlash('#e2b75b', 0.35, 0.25);
  h.particleSystem.spawnBurst(600, 260, '#38bdf8', 12);
  h.particleSystem.spawnRising(540, 260, '#34d399', 8);

  // Add status effects to an active unit so status indicator paths execute
  const anyUnit = h.unitManager.getAll()[0];
  if (anyUnit) {
    h.unitManager.applyStatusEffect(anyUnit, { id: 't_burn', type: 'burn', value: 10, durationSec: 3 });
    h.unitManager.applyStatusEffect(anyUnit, { id: 't_slow', type: 'debuff_slow', value: 0.3, durationSec: 3 });
    h.unitManager.applyStatusEffect(anyUnit, { id: 't_buff', type: 'buff_attack', value: 0.2, durationSec: 3 });
    h.unitManager.applyStatusEffect(anyUnit, { id: 't_shred', type: 'debuff_defense', value: 0.2, durationSec: 3 });
    h.unitManager.applyStatusEffect(anyUnit, { id: 't_stun', type: 'stun', value: 1, durationSec: 1.5 });
  }

  assert.doesNotThrow(() => {
    renderer.render({
      stage: h.dataRegistry.stagesById.get('stage_1_3'),
      battlefield: h.battleManager.battlefield,
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      units: h.unitManager.getAll(),
      projectiles: [
        {
          uid: 'p1',
          kind: 'arrow',
          x: 45,
          y: 50,
          vx: 24,
          vy: 2,
          color: '#38bdf8',
          side: 'ally',
        },
        {
          uid: 'p2',
          kind: 'magic',
          x: 60,
          y: 46,
          vx: -18,
          vy: 1,
          color: '#a78bfa',
          side: 'enemy',
        },
      ],
      telegraphs: [{ x: 64, y: 50, radius: 14, progress: 0.65, color: '#ef4444', label: 'Void Nova' }],
      selectedPrepUnitUid: null,
      activeTactic: { mode: 'full_assault', name: 'Full Assault', remaining: 5, duration: 7, color: '#f59e0b' },
    });
  });

  assert.ok(drawCalls > 40, `Expected substantial canvas draw calls, got ${drawCalls}`);
  renderer.detach();
});

