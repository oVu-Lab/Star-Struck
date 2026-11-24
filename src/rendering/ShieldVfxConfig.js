/**
 * ShieldVfxConfig — Data-driven visual catalog for every shield source in Star Struck.
 *
 * Design rules:
 * - Shared technical pipeline, distinct thematic visual identities per source.
 * - No generic flat cyan circles or reused identical bubbles.
 * - Clear center transparency so protected units remain crisp and legible.
 * - Proportional sizing fitted to each unit's model layout & silhouette.
 */

export const SHIELD_THEME_IDS = Object.freeze({
  HERALDIC_BULWARK: 'heraldic_bulwark',
  AEGIS_PRISM: 'aegis_prism',
  SOLAR_FORGE: 'solar_forge',
  CRYO_CRYSTAL: 'cryo_crystal',
  FORTRESS_HULL: 'fortress_hull',
  OBSIDIAN_AEGIS: 'obsidian_aegis',
  CHRONO_TEMPORAL: 'chrono_temporal',
  VOID_SIPHON: 'void_siphon',
  SANCTUARY_VERDANT: 'sanctuary_verdant',
  TACTICAL_PHALANX: 'tactical_phalanx',
  ASTRAL_BLESSING: 'astral_blessing',
  PURIFY_SANCTITY: 'purify_sanctity',
  RADIANT_HYMN: 'radiant_hymn',
  IRONFORGE_BASTION: 'ironforge_bastion',
});

export const SHIELD_THEMES = Object.freeze({
  // 1. Heavy Defender — Bulwark Guard (unit_bulwark_guard)
  [SHIELD_THEME_IDS.HERALDIC_BULWARK]: Object.freeze({
    id: SHIELD_THEME_IDS.HERALDIC_BULWARK,
    label: 'Heraldic Bulwark',
    sourceSummary: 'Heavy Defender · Bulwark Guard',
    shellShape: 'curved_kite',
    patternStyle: 'chevron_plates',
    hitStyle: 'plate_shock',
    formationStyle: 'plate_converge',
    particleStyle: 'kite_sparks',
    fragmentShape: 'kite_plate',
    palette: Object.freeze({
      primary: '#4ea8ff',
      secondary: '#f0c96b',
      rim: '#cde9ff',
      core: '#fff9e6',
      innerTint: '#0e356a',
      crack: '#ffe79e',
      barColor: '#60b6ff',
      fragments: Object.freeze(['#4ea8ff', '#f0c96b', '#cfeaff']),
    }),
    rxFactor: 0.47,
    ryFactor: 0.50,
    yOffsetFactor: 0.01,
    frontBias: 0.06,
    thickness: 4.4,
    rimAlpha: 0.90,
    centerAlpha: 0.025,
    flowSpeed: 0.85,
    pulseSpeed: 1.9,
    particleCount: 5,
    fragmentCount: 16,
  }),

  // 2. Aegis Sentinel — Shield Orb & Aegis Pulse (aegis_sentinel, unit_aegis_pulse)
  [SHIELD_THEME_IDS.AEGIS_PRISM]: Object.freeze({
    id: SHIELD_THEME_IDS.AEGIS_PRISM,
    label: 'Aegis Prism',
    sourceSummary: 'Aegis Sentinel · Shield Orb & Pulse',
    shellShape: 'hex_geodesic',
    patternStyle: 'hex_lattice',
    hitStyle: 'hex_cascade',
    formationStyle: 'hex_assemble',
    particleStyle: 'prism_beacons',
    fragmentShape: 'hex_tile',
    palette: Object.freeze({
      primary: '#38bdf8',
      secondary: '#67e8f9',
      rim: '#dcf8ff',
      core: '#f4feff',
      innerTint: '#0b3857',
      crack: '#e0f7ff',
      barColor: '#38bdf8',
      fragments: Object.freeze(['#38bdf8', '#67e8f9', '#d6f7ff']),
    }),
    rxFactor: 0.46,
    ryFactor: 0.48,
    yOffsetFactor: 0.0,
    frontBias: 0.0,
    thickness: 4.1,
    rimAlpha: 0.88,
    centerAlpha: 0.02,
    flowSpeed: 1.05,
    pulseSpeed: 2.2,
    particleCount: 6,
    fragmentCount: 18,
  }),

  // 3. Astral Automaton — Overdrive Carapace (unit_construct_overdrive)
  [SHIELD_THEME_IDS.SOLAR_FORGE]: Object.freeze({
    id: SHIELD_THEME_IDS.SOLAR_FORGE,
    label: 'Solar Overdrive',
    sourceSummary: 'Astral Automaton · Solar Overdrive',
    shellShape: 'solar_corona',
    patternStyle: 'solar_streams',
    hitStyle: 'solar_flare',
    formationStyle: 'corona_ignite',
    particleStyle: 'solar_embers',
    fragmentShape: 'solar_arc',
    palette: Object.freeze({
      primary: '#f59e0b',
      secondary: '#fde047',
      rim: '#fff0c2',
      core: '#fffef2',
      innerTint: '#592708',
      crack: '#fff3b0',
      barColor: '#fbbf24',
      fragments: Object.freeze(['#f59e0b', '#fbbf24', '#fef08a']),
    }),
    rxFactor: 0.50,
    ryFactor: 0.50,
    yOffsetFactor: -0.01,
    frontBias: 0.02,
    thickness: 4.5,
    rimAlpha: 0.92,
    centerAlpha: 0.03,
    flowSpeed: 1.3,
    pulseSpeed: 2.6,
    particleCount: 7,
    fragmentCount: 18,
  }),

  // 4. Cryo Warden & Cryo Archwarden — Frost Crystal Ward
  [SHIELD_THEME_IDS.CRYO_CRYSTAL]: Object.freeze({
    id: SHIELD_THEME_IDS.CRYO_CRYSTAL,
    label: 'Cryo Crystal',
    sourceSummary: 'Cryo Warden & Archwarden · Frost Ward',
    shellShape: 'faceted_crystal',
    patternStyle: 'crystal_facets',
    hitStyle: 'crystal_refract',
    formationStyle: 'crystal_crystallize',
    particleStyle: 'frost_diamonds',
    fragmentShape: 'crystal_shard',
    palette: Object.freeze({
      primary: '#22d3ee',
      secondary: '#a5f3fc',
      rim: '#ebfeff',
      core: '#ffffff',
      innerTint: '#0d3f52',
      crack: '#f0fdff',
      barColor: '#67e8f9',
      fragments: Object.freeze(['#22d3ee', '#a5f3fc', '#e0f2fe']),
    }),
    rxFactor: 0.47,
    ryFactor: 0.51,
    yOffsetFactor: -0.01,
    frontBias: 0.0,
    thickness: 4.3,
    rimAlpha: 0.91,
    centerAlpha: 0.03,
    flowSpeed: 0.72,
    pulseSpeed: 1.75,
    particleCount: 6,
    fragmentCount: 20,
  }),

  // 5. Elite Modifiers — Fortified Hull & Bulwark Aura
  [SHIELD_THEME_IDS.FORTRESS_HULL]: Object.freeze({
    id: SHIELD_THEME_IDS.FORTRESS_HULL,
    label: 'Fortified Hull',
    sourceSummary: 'Elite Modifier · Fortified Hull & Bulwark Aura',
    shellShape: 'chamfered_hull',
    patternStyle: 'armored_ribs',
    hitStyle: 'plate_shock',
    formationStyle: 'plate_converge',
    particleStyle: 'flux_bolts',
    fragmentShape: 'armor_plate',
    palette: Object.freeze({
      primary: '#60a5fa',
      secondary: '#cbd5e1',
      rim: '#e2efff',
      core: '#f8fafc',
      innerTint: '#162642',
      crack: '#bfdbfe',
      barColor: '#93c5fd',
      fragments: Object.freeze(['#60a5fa', '#94a3b8', '#dbeafe']),
    }),
    rxFactor: 0.49,
    ryFactor: 0.49,
    yOffsetFactor: 0.0,
    frontBias: 0.03,
    thickness: 4.6,
    rimAlpha: 0.89,
    centerAlpha: 0.025,
    flowSpeed: 0.8,
    pulseSpeed: 1.85,
    particleCount: 5,
    fragmentCount: 16,
  }),

  // 6. Boss / Elite — Obsidian Aegis Shell (boss_aegis_shell)
  [SHIELD_THEME_IDS.OBSIDIAN_AEGIS]: Object.freeze({
    id: SHIELD_THEME_IDS.OBSIDIAN_AEGIS,
    label: 'Obsidian Aegis',
    sourceSummary: 'Bastion Warden / Obsidian Sovereign · Aegis Shell',
    shellShape: 'obsidian_carapace',
    patternStyle: 'magma_veins',
    hitStyle: 'obsidian_surge',
    formationStyle: 'plate_converge',
    particleStyle: 'cinder_flecks',
    fragmentShape: 'obsidian_shard',
    palette: Object.freeze({
      primary: '#ef4444',
      secondary: '#e6be60',
      rim: '#fecaca',
      core: '#fff2e8',
      innerTint: '#3b0c16',
      crack: '#fde047',
      barColor: '#f87171',
      fragments: Object.freeze(['#dc2626', '#e6be60', '#fca5a5']),
    }),
    rxFactor: 0.51,
    ryFactor: 0.51,
    yOffsetFactor: 0.0,
    frontBias: 0.02,
    thickness: 5.0,
    rimAlpha: 0.93,
    centerAlpha: 0.04,
    flowSpeed: 0.95,
    pulseSpeed: 2.1,
    particleCount: 7,
    fragmentCount: 20,
  }),

  // 7. Chrono Arbiter Vael & Chrono Enforcer — Temporal Phase Shell
  [SHIELD_THEME_IDS.CHRONO_TEMPORAL]: Object.freeze({
    id: SHIELD_THEME_IDS.CHRONO_TEMPORAL,
    label: 'Chrono Temporal',
    sourceSummary: 'Chrono Arbiter Vael & Chrono Enforcer · Temporal Shell',
    shellShape: 'chrono_dial',
    patternStyle: 'clockwork_layers',
    hitStyle: 'chrono_warp',
    formationStyle: 'clockwork_wind',
    particleStyle: 'chrono_ticks',
    fragmentShape: 'gear_arc',
    palette: Object.freeze({
      primary: '#a78bfa',
      secondary: '#e8c468',
      rim: '#ede9fe',
      core: '#fefce8',
      innerTint: '#2a164c',
      crack: '#fde68a',
      barColor: '#c4b5fd',
      fragments: Object.freeze(['#a78bfa', '#e8c468', '#ddd6fe']),
    }),
    rxFactor: 0.49,
    ryFactor: 0.50,
    yOffsetFactor: 0.0,
    frontBias: 0.0,
    thickness: 4.3,
    rimAlpha: 0.91,
    centerAlpha: 0.025,
    flowSpeed: 0.9,
    pulseSpeed: 1.95,
    particleCount: 6,
    fragmentCount: 18,
  }),

  // 8. Astral Dreadnought Hyperion — Void Siphon Barrier
  [SHIELD_THEME_IDS.VOID_SIPHON]: Object.freeze({
    id: SHIELD_THEME_IDS.VOID_SIPHON,
    label: 'Void Siphon',
    sourceSummary: 'Astral Dreadnought Hyperion · Void Siphon',
    shellShape: 'void_membrane',
    patternStyle: 'void_tendrils',
    hitStyle: 'void_ripple',
    formationStyle: 'siphon_draw',
    particleStyle: 'void_wisps',
    fragmentShape: 'plasma_splinter',
    palette: Object.freeze({
      primary: '#e879f9',
      secondary: '#f43f5e',
      rim: '#fae8ff',
      core: '#fff1f8',
      innerTint: '#360b3d',
      crack: '#fda4af',
      barColor: '#e879f9',
      fragments: Object.freeze(['#d946ef', '#f43f5e', '#f5d0fe']),
    }),
    rxFactor: 0.51,
    ryFactor: 0.50,
    yOffsetFactor: 0.0,
    frontBias: 0.0,
    thickness: 4.7,
    rimAlpha: 0.92,
    centerAlpha: 0.035,
    flowSpeed: 1.25,
    pulseSpeed: 2.55,
    particleCount: 8,
    fragmentCount: 20,
  }),

  // 9. Skill Card — Sanctuary Wave / Radiant Tide / Divine Revival
  [SHIELD_THEME_IDS.SANCTUARY_VERDANT]: Object.freeze({
    id: SHIELD_THEME_IDS.SANCTUARY_VERDANT,
    label: 'Sanctuary Verdant',
    sourceSummary: 'Skill Card · Sanctuary Wave',
    shellShape: 'petal_dome',
    patternStyle: 'verdant_caustics',
    hitStyle: 'petal_ripple',
    formationStyle: 'bloom_expand',
    particleStyle: 'leaf_motes',
    fragmentShape: 'petal_shard',
    palette: Object.freeze({
      primary: '#34d399',
      secondary: '#f0d384',
      rim: '#d1fae5',
      core: '#f7fff9',
      innerTint: '#0b3d2d',
      crack: '#fef3c7',
      barColor: '#34d399',
      fragments: Object.freeze(['#34d399', '#6ee7b7', '#f0d384']),
    }),
    rxFactor: 0.45,
    ryFactor: 0.47,
    yOffsetFactor: 0.0,
    frontBias: 0.0,
    thickness: 3.8,
    rimAlpha: 0.87,
    centerAlpha: 0.02,
    flowSpeed: 0.9,
    pulseSpeed: 1.9,
    particleCount: 6,
    fragmentCount: 16,
  }),

  // 10. Tactic Card — Emergency Defense / Iron Formation / Impenetrable Line
  [SHIELD_THEME_IDS.TACTICAL_PHALANX]: Object.freeze({
    id: SHIELD_THEME_IDS.TACTICAL_PHALANX,
    label: 'Tactical Phalanx',
    sourceSummary: 'Tactic Card · Emergency Defense',
    shellShape: 'phalanx_wall',
    patternStyle: 'tactical_grid',
    hitStyle: 'phalanx_deflect',
    formationStyle: 'wall_lock',
    particleStyle: 'tactical_chevrons',
    fragmentShape: 'armor_plate',
    palette: Object.freeze({
      primary: '#3b82f6',
      secondary: '#38bdf8',
      rim: '#e0f2fe',
      core: '#ffffff',
      innerTint: '#0d295c',
      crack: '#bae6fd',
      barColor: '#60a5fa',
      fragments: Object.freeze(['#3b82f6', '#38bdf8', '#e0f2fe']),
    }),
    rxFactor: 0.48,
    ryFactor: 0.48,
    yOffsetFactor: 0.01,
    frontBias: 0.14,
    thickness: 4.6,
    rimAlpha: 0.91,
    centerAlpha: 0.022,
    flowSpeed: 1.1,
    pulseSpeed: 2.0,
    particleCount: 5,
    fragmentCount: 16,
  }),

  // 11. Support Card — Aegis Blessing / Bastion Ward / Astral Bulwark
  [SHIELD_THEME_IDS.ASTRAL_BLESSING]: Object.freeze({
    id: SHIELD_THEME_IDS.ASTRAL_BLESSING,
    label: 'Astral Blessing',
    sourceSummary: 'Support Card · Aegis Blessing',
    shellShape: 'lunar_celestial',
    patternStyle: 'lunar_crescents',
    hitStyle: 'lunar_chime',
    formationStyle: 'celestial_coalesce',
    particleStyle: 'star_pearls',
    fragmentShape: 'crescent_shard',
    palette: Object.freeze({
      primary: '#7dd3fc',
      secondary: '#f3dd9e',
      rim: '#eef8ff',
      core: '#fffef7',
      innerTint: '#142a54',
      crack: '#fef08a',
      barColor: '#7dd3fc',
      fragments: Object.freeze(['#7dd3fc', '#f3dd9e', '#e0f2fe']),
    }),
    rxFactor: 0.46,
    ryFactor: 0.48,
    yOffsetFactor: -0.01,
    frontBias: 0.0,
    thickness: 4.0,
    rimAlpha: 0.89,
    centerAlpha: 0.022,
    flowSpeed: 0.82,
    pulseSpeed: 1.85,
    particleCount: 6,
    fragmentCount: 16,
  }),

  // 12. Support Card — Purify Beacon / Sanctity Field / Aegis Absolution
  [SHIELD_THEME_IDS.PURIFY_SANCTITY]: Object.freeze({
    id: SHIELD_THEME_IDS.PURIFY_SANCTITY,
    label: 'Purify Sanctity',
    sourceSummary: 'Support Card · Purify Beacon',
    shellShape: 'sanctity_veil',
    patternStyle: 'ascending_ribbons',
    hitStyle: 'prism_wave',
    formationStyle: 'bloom_expand',
    particleStyle: 'pure_sparks',
    fragmentShape: 'petal_shard',
    palette: Object.freeze({
      primary: '#5eead4',
      secondary: '#fef08a',
      rim: '#f0fdfa',
      core: '#ffffff',
      innerTint: '#113c3a',
      crack: '#fef9c3',
      barColor: '#5eead4',
      fragments: Object.freeze(['#5eead4', '#ccfbf1', '#fef08a']),
    }),
    rxFactor: 0.45,
    ryFactor: 0.48,
    yOffsetFactor: -0.01,
    frontBias: 0.0,
    thickness: 3.7,
    rimAlpha: 0.88,
    centerAlpha: 0.018,
    flowSpeed: 1.0,
    pulseSpeed: 2.0,
    particleCount: 6,
    fragmentCount: 16,
  }),

  // 13. Commander Ultimate — Lyra Solis (ult_sanctuary_pulse)
  [SHIELD_THEME_IDS.RADIANT_HYMN]: Object.freeze({
    id: SHIELD_THEME_IDS.RADIANT_HYMN,
    label: 'Radiant Hymn',
    sourceSummary: 'Commander Lyra Solis · Sanctuary Pulse',
    shellShape: 'cathedral_arch',
    patternStyle: 'solar_streams',
    hitStyle: 'solar_flare',
    formationStyle: 'corona_ignite',
    particleStyle: 'solar_embers',
    fragmentShape: 'solar_arc',
    palette: Object.freeze({
      primary: '#4ade80',
      secondary: '#f6cf67',
      rim: '#fef3c7',
      core: '#ffffff',
      innerTint: '#143d28',
      crack: '#fde68a',
      barColor: '#86efac',
      fragments: Object.freeze(['#4ade80', '#f6cf67', '#dcfce7']),
    }),
    rxFactor: 0.47,
    ryFactor: 0.50,
    yOffsetFactor: -0.01,
    frontBias: 0.0,
    thickness: 4.3,
    rimAlpha: 0.92,
    centerAlpha: 0.025,
    flowSpeed: 1.05,
    pulseSpeed: 2.15,
    particleCount: 7,
    fragmentCount: 18,
  }),

  // 14. Commander Ultimate — Orin Vance (ult_fortified_line)
  [SHIELD_THEME_IDS.IRONFORGE_BASTION]: Object.freeze({
    id: SHIELD_THEME_IDS.IRONFORGE_BASTION,
    label: 'Ironforge Bastion',
    sourceSummary: 'Commander Orin Vance · Fortified Line',
    shellShape: 'bastion_plates',
    patternStyle: 'armored_ribs',
    hitStyle: 'plate_shock',
    formationStyle: 'wall_lock',
    particleStyle: 'forge_sparks',
    fragmentShape: 'gear_arc',
    palette: Object.freeze({
      primary: '#ea8d48',
      secondary: '#f2c265',
      rim: '#fde68a',
      core: '#fffbeb',
      innerTint: '#3d1e0c',
      crack: '#fed7aa',
      barColor: '#f59e0b',
      fragments: Object.freeze(['#ea8d48', '#f2c265', '#fde68a']),
    }),
    rxFactor: 0.49,
    ryFactor: 0.49,
    yOffsetFactor: 0.0,
    frontBias: 0.06,
    thickness: 4.7,
    rimAlpha: 0.92,
    centerAlpha: 0.028,
    flowSpeed: 0.92,
    pulseSpeed: 2.0,
    particleCount: 6,
    fragmentCount: 18,
  }),
});

export const ALL_SHIELD_THEMES = Object.freeze(Object.values(SHIELD_THEMES));

/**
 * Returns the ShieldTheme config for a themeId, falling back safely to Aegis Prism.
 */
export function getShieldTheme(themeId) {
  if (themeId && SHIELD_THEMES[themeId]) {
    return SHIELD_THEMES[themeId];
  }
  return SHIELD_THEMES[SHIELD_THEME_IDS.AEGIS_PRISM];
}

/**
 * Deterministically resolves the visual shield theme from any gameplay shield source
 * (unit ability, projectile, card, commander ultimate, elite modifier, or boss skill).
 */
export function resolveShieldTheme({
  themeId = null,
  effectId = '',
  cardId = '',
  abilityId = '',
  ultimateId = '',
  modifierId = '',
  sourceUnit = null,
  sourceUnitId = '',
  sourceEliteId = '',
  sourceBossId = '',
  targetUnit = null,
} = {}) {
  if (themeId && SHIELD_THEMES[themeId]) {
    return SHIELD_THEMES[themeId];
  }

  const eff = String(effectId || '').toLowerCase();
  const card = String(cardId || '').toLowerCase();
  const ab = String(abilityId || '').toLowerCase();
  const ult = String(ultimateId || '').toLowerCase();
  const mod = String(modifierId || '').toLowerCase();
  const sUnit = String(sourceUnitId || sourceUnit?.unitId || '').toLowerCase();
  const sElite = String(sourceEliteId || sourceUnit?.eliteId || '').toLowerCase();
  const sBoss = String(sourceBossId || sourceUnit?.bossId || '').toLowerCase();

  // Commander Ultimates
  if (ult === 'ult_sanctuary_pulse' || eff.startsWith('ult_sanctuary_pulse')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.RADIANT_HYMN];
  }
  if (ult === 'ult_fortified_line' || eff.startsWith('ult_fortified_line')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.IRONFORGE_BASTION];
  }

  // Cards (Skill / Tactic / Support)
  if (card === 'card_skill_sanctuary_wave' || eff.startsWith('card_skill_sanctuary_wave')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.SANCTUARY_VERDANT];
  }
  if (
    card === 'card_tactic_emergency_defense' ||
    eff === 'tactic_def_shield' ||
    eff.includes('emergency_defense')
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.TACTICAL_PHALANX];
  }
  if (card === 'card_support_aegis_blessing' || eff.startsWith('card_support_aegis_blessing')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.ASTRAL_BLESSING];
  }
  if (card === 'card_support_cleanse_beacon' || eff.startsWith('card_support_cleanse_beacon')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.PURIFY_SANCTITY];
  }

  // Boss & Elite Abilities
  if (
    ab === 'boss_void_siphon' ||
    eff.startsWith('boss_void_siphon') ||
    sBoss === 'boss_astral_leviathan' ||
    sBoss === 'boss_astral_dreadnought'
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.VOID_SIPHON];
  }
  if (
    ab === 'boss_phase_mend' ||
    eff.startsWith('boss_phase_mend') ||
    sBoss === 'boss_chrono_arbiter' ||
    sElite === 'elite_chrono_enforcer'
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.CHRONO_TEMPORAL];
  }
  if (ab === 'boss_aegis_shell' || eff.startsWith('boss_aegis_shell')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.OBSIDIAN_AEGIS];
  }
  if (
    mod === 'mod_fortified_hull' ||
    ab === 'mod_ability_bulwark_aura' ||
    eff.startsWith('mod_ability_bulwark_aura') ||
    eff === 'mod_fortified_hull'
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.FORTRESS_HULL];
  }

  // Unit Abilities
  if (ab === 'unit_bulwark_guard' || eff.startsWith('unit_bulwark_guard')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.HERALDIC_BULWARK];
  }
  if (ab === 'unit_construct_overdrive' || eff.startsWith('unit_construct_overdrive')) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.SOLAR_FORGE];
  }

  // Cryo Warden / Archwarden shield orbs & pulses
  if (
    sUnit === 'enemy_cryo_warden' ||
    sElite === 'elite_cryo_archwarden' ||
    eff.includes('cryo')
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.CRYO_CRYSTAL];
  }

  // Aegis Sentinel shield orbs & pulses
  if (
    ab === 'unit_aegis_pulse' ||
    eff.startsWith('unit_aegis_pulse') ||
    sUnit === 'aegis_sentinel' ||
    eff.startsWith('proj_shield_') ||
    eff.startsWith('sup_shield_')
  ) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.AEGIS_PRISM];
  }

  // Fallback by target unit traits (e.g. direct test setup with unit.shield > 0)
  if (targetUnit?.shieldThemeId && SHIELD_THEMES[targetUnit.shieldThemeId]) {
    return SHIELD_THEMES[targetUnit.shieldThemeId];
  }
  if (targetUnit?.unitId === 'heavy_shield_guard') {
    return SHIELD_THEMES[SHIELD_THEME_IDS.HERALDIC_BULWARK];
  }
  if (targetUnit?.unitId === 'astral_construct') {
    return SHIELD_THEMES[SHIELD_THEME_IDS.SOLAR_FORGE];
  }
  if (targetUnit?.unitId === 'enemy_cryo_warden' || targetUnit?.eliteId === 'elite_cryo_archwarden') {
    return SHIELD_THEMES[SHIELD_THEME_IDS.CRYO_CRYSTAL];
  }
  if (targetUnit?.bossId === 'boss_chrono_arbiter' || targetUnit?.eliteId === 'elite_chrono_enforcer') {
    return SHIELD_THEMES[SHIELD_THEME_IDS.CHRONO_TEMPORAL];
  }
  if (targetUnit?.bossId === 'boss_astral_leviathan' || targetUnit?.bossId === 'boss_astral_dreadnought') {
    return SHIELD_THEMES[SHIELD_THEME_IDS.VOID_SIPHON];
  }
  if (targetUnit?.isBoss) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.OBSIDIAN_AEGIS];
  }
  if (targetUnit?.isElite) {
    return SHIELD_THEMES[SHIELD_THEME_IDS.FORTRESS_HULL];
  }
  return SHIELD_THEMES[SHIELD_THEME_IDS.AEGIS_PRISM];
}

/**
 * Computes unit-fitted shield geometry from the unit's rendered model layout.
 * Keeps shields proportional to small, standard, bulky, elite, and boss silhouettes
 * while preserving unit details and preventing battlefield visual bloat.
 */
export function computeShieldGeometry(unit, layout, theme, scale = 1) {
  const spriteSize = Math.max(24, Number(layout?.spriteSize) || 44 * scale);
  const drawX = Number(layout?.drawX) || 0;
  const drawY = Number(layout?.drawY) || 0;
  const groundY = Number(layout?.y) || drawY + spriteSize * 0.92;
  const facing = (unit?.facing ?? (unit?.side === 'enemy' ? -1 : 1)) >= 0 ? 1 : -1;

  // Adjust aspect fit for naturally wider/heavier unit classes
  let widthMod = 1.0;
  let heightMod = 1.0;
  const uClass = unit?.unitClass || unit?.unitId || '';
  if (
    uClass === 'heavy_defender' ||
    uClass === 'heavy_shield_guard' ||
    uClass === 'astral_construct' ||
    uClass === 'siege_juggernaut' ||
    uClass === 'bastion_tank'
  ) {
    widthMod = 1.06;
    heightMod = 1.02;
  } else if (uClass === 'swift_cavalry' || uClass === 'wind_cavalry' || uClass === 'enemy_raider') {
    widthMod = 1.05;
    heightMod = 0.96;
  } else if (unit?.isBoss) {
    widthMod = 1.04;
    heightMod = 1.01;
  }

  const rx = spriteSize * (theme?.rxFactor ?? 0.46) * widthMod;
  const ry = spriteSize * (theme?.ryFactor ?? 0.48) * heightMod;
  const frontShift = facing * rx * (theme?.frontBias ?? 0);
  const cx = drawX + frontShift;
  const cy = drawY + spriteSize * (0.48 + (theme?.yOffsetFactor ?? 0));
  const thickness = Math.max(2.2, (theme?.thickness ?? 4.0) * Math.max(0.72, Math.min(1.38, spriteSize / 46)));

  return {
    cx,
    cy,
    rx,
    ry,
    groundY,
    facing,
    thickness,
    spriteSize,
    scale: Math.max(0.6, Math.min(2.2, spriteSize / 46)),
  };
}
