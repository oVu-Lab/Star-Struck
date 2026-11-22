/**
 * TutorialBattleConfig — Dedicated beginner-friendly encounter configuration for
 * Star Struck's interactive first-battle tutorial. Never alters normal campaign
 * stage definitions, player deck saves, or global balance.json values.
 */

export const TUTORIAL_STAGE_ID = 'stage_tutorial';

export const TUTORIAL_DECK_IDS = Object.freeze([
  'card_shield_guard',
  'card_arcane_archer',
  'card_wind_cavalry',
  'card_skill_astral_nova',
  'card_tactic_full_assault',
  'card_support_aegis_blessing',
]);

export const TUTORIAL_INITIAL_SLOTS = Object.freeze([
  'card_arcane_archer',
  'card_shield_guard',
  'card_shield_guard',
  'card_shield_guard',
  'card_shield_guard',
  'card_skill_astral_nova',
]);

export const TUTORIAL_REFILL_SEQUENCE = Object.freeze([
  'card_wind_cavalry',
  'card_tactic_full_assault',
  'card_support_aegis_blessing',
  'card_arcane_archer',
  'card_shield_guard',
  'card_skill_astral_nova',
]);

export const TUTORIAL_ENERGY_CONFIG = Object.freeze({
  starting: 90,
  max: 100,
  regenPerSecond: 6.0,
});

export function createTutorialStageConfig() {
  return {
    id: TUTORIAL_STAGE_ID,
    code: 'TUTORIAL',
    name: 'Tactical Proving Grounds',
    chapter: 0,
    chapterName: 'First Command Briefing',
    difficulty: 'Tutorial',
    encounterType: 'Guided Onboarding',
    recommendedLevel: 1,
    unlockAfter: null,
    isTutorial: true,
    terrainId: 'terrain_outer_bastion',
    backgroundAssetId: 'bg_battle_orbital_ridge',
    energyConfig: { ...TUTORIAL_ENERGY_CONFIG },
    tutorialDeckIds: [...TUTORIAL_DECK_IDS],
    tutorialInitialSlots: [...TUTORIAL_INITIAL_SLOTS],
    tutorialRefillSequence: [...TUTORIAL_REFILL_SEQUENCE],
    tutorialScaling: {
      enemyHpScale: 0.42,
      enemyAttackScale: 0.35,
      bossHpScale: 0.22,
      bossAttackScale: 0.3,
    },
    initialAllies: [
      { unitId: 'heavy_shield_guard', x: 22, y: 40 },
      { unitId: 'heavy_shield_guard', x: 22, y: 60 },
      { unitId: 'field_cleric', x: 12, y: 50 },
    ],
    waves: [
      {
        wave: 1,
        label: 'Vanguard Scouts',
        delaySec: 0.5,
        enemyLevel: 1,
        units: [
          { unitId: 'heavy_shield_guard', count: 2 },
        ],
      },
      {
        wave: 2,
        label: 'Final Garrison',
        delaySec: 0.6,
        enemyLevel: 1,
        isBossWave: true,
        units: [
          { unitId: 'heavy_shield_guard', count: 1 },
          { unitId: 'arcane_archer', count: 1 },
        ],
        boss: { bossId: 'boss_bastion_warden' },
      },
    ],
    description: 'Guided briefing covering the 6-card pool, timed automatic slot refill, Level I–III merging, combat, skills, and Ultimates.',
  };
}
