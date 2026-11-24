/**
 * UnitAnimationProfiles — Complete 33-unit bespoke motion specifications and
 * leak-free WeakMap-based per-unit animation state integrator.
 *
 * Every unit has its own distinct idle, movement, 3-phase attack (preparation,
 * action/release, recovery), and skill animation identity derived directly from
 * its physical object design.
 *
 * Smooth phase integration guarantees rotating components (clock hands, gears,
 * solar rings, sawblades, pinwheels, carriage wheels) accelerate and decelerate
 * seamlessly without ever jumping backwards.
 */

import { UNIT_STATES } from '../battle/UnitManager.js';
import { clamp01 } from './NonUnitVfxGeometry.js';

export function isReducedMotionPreferred() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Complete 33-unit motion specification registry.
 * Keys match UNIT_OBJECT_ROSTER_IDS 1-to-1.
 */
export const UNIT_ANIMATION_PROFILES = Object.freeze({
  // =========================================================================
  // GROUP A: 10 PLAYABLE ALLY UNITS
  // =========================================================================
  heavy_shield_guard: {
    id: 'heavy_shield_guard',
    motionIdentity: 'Winged Heraldic Shield Brace & Counter-Hover Bucklers',
    idle: { style: 'shield_wing_hover', bobAmp: 1.5, bobFreq: 2.2, wingAmp: 2.8, sheenSpeed: 0.7 },
    move: { style: 'fortress_march_brace', bobAmp: 3.0, bobFreq: 7.4, tiltAmp: 0.08, wingSweep: 4.5 },
    attack: { style: 'winged_bulwark_ram', prepWindow: 0.28, pullbackX: -4.8, lungeX: 10.5, tiltPrep: -0.14, tiltRelease: 0.22 },
    skill: { style: 'aegis_wing_flare', hasDedicatedSkill: true, releaseBurstDur: 0.45 },
    spinBase: 0.5,
  },

  wind_cavalry: {
    id: 'wind_cavalry',
    motionIdentity: 'Spinning Emerald Pinwheel Turbine & Banking Gale Lance',
    idle: { style: 'gale_pinwheel_idle', bobAmp: 2.2, bobFreq: 3.8, tiltAmp: 0.05 },
    move: { style: 'banking_slipstream_glide', bobAmp: 2.0, bobFreq: 7.2, bankTilt: 0.19, spinBoost: 3.4 },
    attack: { style: 'gale_lance_thrust', prepWindow: 0.22, pullbackX: -6.2, lungeX: 13.0, tiltPrep: -0.10, tiltRelease: 0.24 },
    skill: { style: 'cyclone_turbine_overdrive', hasDedicatedSkill: true, releaseBurstDur: 0.42 },
    spinBase: 2.3,
  },

  arcane_archer: {
    id: 'arcane_archer',
    motionIdentity: 'Levitation Recurve Bowstring Draw & Orbiting Amethyst Shards',
    idle: { style: 'bow_shard_hover', bobAmp: 2.0, bobFreq: 2.9, shardOrbit: 1.4 },
    move: { style: 'agile_recurve_glide', bobAmp: 2.2, bobFreq: 6.2, bankTilt: 0.11 },
    attack: { style: 'starlight_draw_snap', prepWindow: 0.28, pullbackX: -3.2, lungeX: -5.2, tiltPrep: -0.07, tiltRelease: -0.18, isRecoil: true },
    skill: { style: 'starlight_prism_volley', hasDedicatedSkill: true, releaseBurstDur: 0.44 },
    spinBase: 1.1,
  },

  field_cleric: {
    id: 'field_cleric',
    motionIdentity: 'Top-Pivoted Cathedral Lantern Pendulum & Flickering Sanctum Flame',
    idle: { style: 'censer_pendulum_flame', bobAmp: 1.4, bobFreq: 2.5, swingAmp: 0.095 },
    move: { style: 'sacred_pendulum_glide', bobAmp: 1.8, bobFreq: 5.0, swingAmp: 0.145 },
    attack: { style: 'censer_blessing_swing', prepWindow: 0.30, pullbackX: -3.5, lungeX: 6.5, tiltPrep: -0.16, tiltRelease: 0.22 },
    skill: { style: 'sanctum_halo_bloom', hasDedicatedSkill: true, releaseBurstDur: 0.48 },
    spinBase: 0.85,
  },

  vanguard_breaker: {
    id: 'vanguard_breaker',
    motionIdentity: 'Heavy Pommel-Pivoted Forge Anvil, Puffing Chimneys & Fierce Furnace Eyes',
    idle: { style: 'forge_furnace_breathe', bobAmp: 0.9, bobFreq: 2.6, chimneyRate: 1.2 },
    move: { style: 'seismic_anvil_stomp', bobAmp: 3.4, bobFreq: 7.2, tiltAmp: 0.10 },
    attack: { style: 'molten_overhead_cleave', prepWindow: 0.32, pullbackX: -5.5, lungeX: 11.5, tiltPrep: -0.28, tiltRelease: 0.34 },
    skill: { style: 'superheated_horn_eruption', hasDedicatedSkill: true, releaseBurstDur: 0.46 },
    spinBase: 0.7,
  },

  pulse_skirmisher: {
    id: 'pulse_skirmisher',
    motionIdentity: 'Zippy Volt-Turbine Pod, Alternating Twin Barrels & Copper Coil Arcs',
    idle: { style: 'volt_coil_hum', bobAmp: 1.6, bobFreq: 6.2, tiltAmp: 0.04 },
    move: { style: 'ion_thruster_dart', bobAmp: 1.8, bobFreq: 10.5, bankTilt: 0.16 },
    attack: { style: 'alternating_barrel_burst', prepWindow: 0.18, pullbackX: -1.8, lungeX: -4.8, tiltPrep: -0.05, tiltRelease: -0.14, isRecoil: true },
    skill: { style: 'capacitor_overcharge_arc', hasDedicatedSkill: true, releaseBurstDur: 0.40 },
    spinBase: 2.8,
  },

  solar_pyromancer: {
    id: 'solar_pyromancer',
    motionIdentity: 'Three-Layer Celestial Sun — Rotating Corona Rings, Flowing Plasma & Prominences',
    idle: { style: 'celestial_sun_corona', bobAmp: 1.9, bobFreq: 2.3, coreBreath: 0.045 },
    move: { style: 'radiant_comet_drift', bobAmp: 2.2, bobFreq: 4.8, bankTilt: 0.08, trailRate: 1.4 },
    attack: { style: 'corona_contract_solar_flare', prepWindow: 0.32, pullbackX: -3.2, lungeX: 6.5, tiltPrep: -0.05, tiltRelease: 0.09 },
    skill: { style: 'twin_corona_solar_eruption', hasDedicatedSkill: true, releaseBurstDur: 0.52 },
    spinBase: 0.95,
  },

  aegis_sentinel: {
    id: 'aegis_sentinel',
    motionIdentity: '3D Depth-Orbiting Hardlight Hex Tiles & Levitating Sapphire Prism Crown',
    idle: { style: 'hex_matrix_orbit', bobAmp: 1.8, bobFreq: 2.7, orbitSpeed: 1.15 },
    move: { style: 'hardlight_formation_glide', bobAmp: 2.0, bobFreq: 5.4, bankTilt: 0.09 },
    attack: { style: 'hex_interlock_projection', prepWindow: 0.28, pullbackX: -2.8, lungeX: 6.2, tiltPrep: -0.08, tiltRelease: 0.12 },
    skill: { style: 'six_node_aegis_matrix', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 1.15,
  },

  chrono_weaver: {
    id: 'chrono_weaver',
    motionIdentity: 'Live Meshing Brass Clockwork Gears, Dual-Speed Hands & Temporal Astrolabe Rings',
    idle: { style: 'chronometer_escapement', bobAmp: 1.7, bobFreq: 2.4, swingAmp: 0.055 },
    move: { style: 'astrolabe_pendulum_glide', bobAmp: 2.1, bobFreq: 4.9, swingAmp: 0.095, spinBoost: 1.8 },
    attack: { style: 'clockwork_accel_temporal_snap', prepWindow: 0.30, pullbackX: -2.6, lungeX: 5.8, tiltPrep: -0.08, tiltRelease: 0.11 },
    skill: { style: 'layered_clockwork_snare', hasDedicatedSkill: true, releaseBurstDur: 0.54 },
    spinBase: 1.0,
  },

  astral_construct: {
    id: 'astral_construct',
    motionIdentity: 'Monumental Counter-Rotating Brass Gimbal Orrery & Boiling Star Core',
    idle: { style: 'orrery_gimbal_levitation', bobAmp: 2.4, bobFreq: 1.8, scaleBreath: 0.02 },
    move: { style: 'monolith_inertial_glide', bobAmp: 2.6, bobFreq: 3.1, bankTilt: 0.05 },
    attack: { style: 'gimbal_align_star_sweep', prepWindow: 0.34, pullbackX: -4.2, lungeX: 9.2, tiltPrep: -0.10, tiltRelease: 0.16 },
    skill: { style: 'orrery_overdrive_alignment', hasDedicatedSkill: true, releaseBurstDur: 0.52 },
    spinBase: 0.8,
  },

  // =========================================================================
  // GROUP B: 10 DEDICATED ENEMY UNITS
  // =========================================================================
  enemy_void_vanguard: {
    id: 'enemy_void_vanguard',
    motionIdentity: 'Braced Iron Portcullis with Rattling Side Chains & Glaring Crimson Eyes',
    idle: { style: 'portcullis_chain_sway', bobAmp: 0.8, bobFreq: 2.3, chainAmp: 0.16 },
    move: { style: 'iron_gate_stomp', bobAmp: 3.1, bobFreq: 7.6, tiltAmp: 0.09, chainAmp: 0.34 },
    attack: { style: 'spiked_portcullis_ram', prepWindow: 0.28, pullbackX: -5.2, lungeX: 10.2, tiltPrep: -0.15, tiltRelease: 0.22 },
    skill: { style: 'void_gate_lockdown', hasDedicatedSkill: false, releaseBurstDur: 0.42 },
    spinBase: 0.6,
  },

  enemy_rift_stalker: {
    id: 'enemy_rift_stalker',
    motionIdentity: 'Lunar Void Crescent, Orbiting Rift Shards, Celestial Rings & Pulsing Moon Orb',
    idle: { style: 'lunar_crescent_orbit', bobAmp: 2.1, bobFreq: 3.4, tiltAmp: 0.07 },
    move: { style: 'crescent_predator_bank', bobAmp: 1.9, bobFreq: 6.8, bankTilt: 0.21, spinBoost: 2.2 },
    attack: { style: 'crescent_void_slash', prepWindow: 0.22, pullbackX: -6.4, lungeX: 13.5, tiltPrep: -0.22, tiltRelease: 0.36 },
    skill: { style: 'lunar_rift_crescent_wave', hasDedicatedSkill: false, releaseBurstDur: 0.46 },
    spinBase: 1.45,
  },

  enemy_obsidian_marksman: {
    id: 'enemy_obsidian_marksman',
    motionIdentity: 'Floating Ruby Focusing Prism, Traveling Magnetic Rail Rings & Recoil Kick',
    idle: { style: 'rail_prism_hum', bobAmp: 1.5, bobFreq: 3.6, prismFloat: 2.2 },
    move: { style: 'sniper_prism_glide', bobAmp: 1.8, bobFreq: 5.8, bankTilt: 0.10 },
    attack: { style: 'magnetic_rail_discharge', prepWindow: 0.30, pullbackX: -2.0, lungeX: -6.2, tiltPrep: -0.04, tiltRelease: -0.16, isRecoil: true },
    skill: { style: 'rail_overlock_beam', hasDedicatedSkill: false, releaseBurstDur: 0.44 },
    spinBase: 1.3,
  },

  enemy_corrupted_acolyte: {
    id: 'enemy_corrupted_acolyte',
    motionIdentity: 'Tolling Amethyst Ritual Bell, Counter-Swinging Clapper & Floating Talisman Seals',
    idle: { style: 'ritual_bell_chime', bobAmp: 1.6, bobFreq: 2.7, swingAmp: 0.105 },
    move: { style: 'occult_bell_procession', bobAmp: 2.1, bobFreq: 5.2, swingAmp: 0.16 },
    attack: { style: 'cursed_bell_toll', prepWindow: 0.30, pullbackX: -3.2, lungeX: 5.8, tiltPrep: -0.20, tiltRelease: 0.26 },
    skill: { style: 'talisman_seal_whirl', hasDedicatedSkill: false, releaseBurstDur: 0.48 },
    spinBase: 1.0,
  },

  enemy_siege_juggernaut: {
    id: 'enemy_siege_juggernaut',
    motionIdentity: 'Bubbling Volcanic Magma Cauldron, Rising Embers & Seismic Slam Rock',
    idle: { style: 'magma_cauldron_simmer', bobAmp: 0.9, bobFreq: 2.1, bubbleRate: 1.4 },
    move: { style: 'cauldron_heavy_trudge', bobAmp: 3.3, bobFreq: 6.4, tiltAmp: 0.095 },
    attack: { style: 'magma_boilover_slam', prepWindow: 0.34, pullbackX: -4.2, lungeX: 9.8, tiltPrep: -0.18, tiltRelease: 0.26 },
    skill: { style: 'volcanic_tremor_eruption', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 0.65,
  },

  enemy_stasis_weaver: {
    id: 'enemy_stasis_weaver',
    motionIdentity: 'Multifaceted Indigo Crystal — Orbiting Depth Shards, Shifting Facets & Caustic Light',
    idle: { style: 'crystal_facet_orbit', bobAmp: 2.0, bobFreq: 2.5, tiltAmp: 0.055 },
    move: { style: 'crystalline_bank_shift', bobAmp: 2.2, bobFreq: 5.0, bankTilt: 0.13, spinBoost: 1.9 },
    attack: { style: 'shard_converge_facet_flash', prepWindow: 0.30, pullbackX: -2.8, lungeX: 6.4, tiltPrep: -0.09, tiltRelease: 0.12 },
    skill: { style: 'hexagonal_stasis_lattice', hasDedicatedSkill: true, releaseBurstDur: 0.52 },
    spinBase: 1.15,
  },

  enemy_inferno_bombardier: {
    id: 'enemy_inferno_bombardier',
    motionIdentity: 'Rolling Spoked Golden Carriage Wheel, Sputtering Fuse & Diagonal Mortar Recoil',
    idle: { style: 'mortar_fuse_sputter', bobAmp: 0.7, bobFreq: 2.8, fuseRate: 1.6 },
    move: { style: 'spoked_wheel_roll', bobAmp: 1.5, bobFreq: 7.0, wheelSpeed: 5.8 },
    attack: { style: 'diagonal_mortar_recoil', prepWindow: 0.32, pullbackX: 2.2, lungeX: -7.0, tiltPrep: 0.06, tiltRelease: -0.22, isRecoil: true },
    skill: { style: 'bombard_barrage_salvo', hasDedicatedSkill: true, releaseBurstDur: 0.48 },
    spinBase: 0.35,
  },

  enemy_dread_bannerman: {
    id: 'enemy_dread_bannerman',
    motionIdentity: 'Living Multi-Tongue Brazier Flame, Rising Embers & Rippling Crimson War-Silk',
    idle: { style: 'war_banner_billow_flame', bobAmp: 1.5, bobFreq: 2.6, clothWave: 5.2 },
    move: { style: 'war_standard_march_stream', bobAmp: 2.2, bobFreq: 5.4, clothWave: 9.5, bankTilt: 0.11 },
    attack: { style: 'standard_flame_surge', prepWindow: 0.28, pullbackX: -3.6, lungeX: 7.6, tiltPrep: -0.14, tiltRelease: 0.20 },
    skill: { style: 'dread_war_beacon_blaze', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 1.0,
  },

  enemy_cryo_warden: {
    id: 'enemy_cryo_warden',
    motionIdentity: 'Rotating 6-Fold Sculpted Glacial Snowflake around Poised Diamond Lantern Core',
    idle: { style: 'glacial_snowflake_turn', bobAmp: 1.8, bobFreq: 2.4, frostDrift: 1.1 },
    move: { style: 'glacial_wind_glide', bobAmp: 2.0, bobFreq: 5.0, bankTilt: 0.09, spinBoost: 2.2 },
    attack: { style: 'frost_spire_burst', prepWindow: 0.28, pullbackX: -2.6, lungeX: 5.8, tiltPrep: -0.07, tiltRelease: 0.11 },
    skill: { style: 'polar_mandala_aegis', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 0.65,
  },

  enemy_abyssal_ravager: {
    id: 'enemy_abyssal_ravager',
    motionIdentity: 'Continuously Spinning Crimson Sawblade Rim with Sparks around Level Furnace Hub',
    idle: { style: 'sawblade_idle_rev', bobAmp: 1.5, bobFreq: 5.5, tiltAmp: 0.03 },
    move: { style: 'buzzsaw_high_rev_charge', bobAmp: 1.6, bobFreq: 9.5, bankTilt: 0.16, spinBoost: 3.8 },
    attack: { style: 'sawblade_overdrive_rend', prepWindow: 0.24, pullbackX: -5.8, lungeX: 12.8, tiltPrep: -0.12, tiltRelease: 0.22 },
    skill: { style: 'abyssal_grind_cyclone', hasDedicatedSkill: true, releaseBurstDur: 0.46 },
    spinBase: 3.4,
  },

  // =========================================================================
  // GROUP C: 8 ELITE VARIANTS
  // =========================================================================
  elite_iron_bulwark: {
    id: 'elite_iron_bulwark',
    motionIdentity: 'Fortified Twin-Turret Castle Gate with Shimmering Portcullis Barrier',
    idle: { style: 'bastion_gate_pulse', bobAmp: 0.9, bobFreq: 1.9, gateShimmer: 1.3 },
    move: { style: 'citadel_fortress_march', bobAmp: 3.1, bobFreq: 6.2, tiltAmp: 0.065 },
    attack: { style: 'bastion_gate_ram', prepWindow: 0.30, pullbackX: -4.8, lungeX: 10.2, tiltPrep: -0.12, tiltRelease: 0.19 },
    skill: { style: 'linked_turret_aegis_arch', hasDedicatedSkill: true, releaseBurstDur: 0.52 },
    spinBase: 0.6,
  },

  elite_storm_lancer: {
    id: 'elite_storm_lancer',
    motionIdentity: 'High-Voltage Fulgurite Spear, Billowing Storm Cloud & Snapping Lightning Arcs',
    idle: { style: 'storm_coil_crackle', bobAmp: 1.9, bobFreq: 5.6, tiltAmp: 0.045 },
    move: { style: 'tempest_bolt_streak', bobAmp: 1.8, bobFreq: 9.8, bankTilt: 0.20, spinBoost: 2.6 },
    attack: { style: 'fulgurite_lightning_thrust', prepWindow: 0.22, pullbackX: -6.8, lungeX: 14.5, tiltPrep: -0.14, tiltRelease: 0.26 },
    skill: { style: 'tempest_coil_overload', hasDedicatedSkill: true, releaseBurstDur: 0.48 },
    spinBase: 2.0,
  },

  elite_astral_sniper: {
    id: 'elite_astral_sniper',
    motionIdentity: 'Sweeping Celestial Brass Sextant Arc, Refracting Prisms & Laser Lock-On',
    idle: { style: 'sextant_elevation_sweep', bobAmp: 1.7, bobFreq: 2.3, sweepAmp: 0.085 },
    move: { style: 'astrolabe_sniper_drift', bobAmp: 1.9, bobFreq: 4.9, bankTilt: 0.09 },
    attack: { style: 'sextant_laser_lock_snap', prepWindow: 0.32, pullbackX: -1.8, lungeX: -5.8, tiltPrep: -0.05, tiltRelease: -0.16, isRecoil: true },
    skill: { style: 'holographic_sextant_calibration', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 0.9,
  },

  elite_siege_colossus: {
    id: 'elite_siege_colossus',
    motionIdentity: 'Volcanic Bronze Ram-Bell with Inertial Floating Molten Halo & Magma Fissures',
    idle: { style: 'colossus_bell_rumble', bobAmp: 0.9, bobFreq: 2.0, haloFloat: 3.4 },
    move: { style: 'tectonic_bell_stomp', bobAmp: 3.6, bobFreq: 5.8, tiltAmp: 0.09 },
    attack: { style: 'halo_rise_tectonic_slam', prepWindow: 0.34, pullbackX: -5.2, lungeX: 11.4, tiltPrep: -0.22, tiltRelease: 0.28 },
    skill: { style: 'molten_crown_seismic_ring', hasDedicatedSkill: true, releaseBurstDur: 0.54 },
    spinBase: 0.85,
  },

  elite_chrono_enforcer: {
    id: 'elite_chrono_enforcer',
    motionIdentity: 'Twin-Bulb Stasis Hourglass — Flowing Luminous Sand, Freeze-Halt & 180° Skill Flip',
    idle: { style: 'hourglass_sand_stream', bobAmp: 1.8, bobFreq: 2.4, swingAmp: 0.065 },
    move: { style: 'hourglass_pendulum_drift', bobAmp: 2.1, bobFreq: 4.8, swingAmp: 0.11 },
    attack: { style: 'stasis_sand_halt_pulse', prepWindow: 0.30, pullbackX: -2.4, lungeX: 5.8, tiltPrep: -0.10, tiltRelease: 0.14 },
    skill: { style: 'meridian_hourglass_invert', hasDedicatedSkill: true, releaseBurstDur: 0.56 },
    spinBase: 1.0,
  },

  elite_inferno_captain: {
    id: 'elite_inferno_captain',
    motionIdentity: 'Triple-Pipe Brass Flame Organ with 1-2-3 Rhythmic Fire Plumes & Boisterous Furnace Eyes',
    idle: { style: 'triple_pipe_flame_rhythm', bobAmp: 0.9, bobFreq: 2.6, pipeCycle: 3.2 },
    move: { style: 'boiler_battery_stomp', bobAmp: 2.8, bobFreq: 6.4, tiltAmp: 0.085 },
    attack: { style: 'staggered_triple_volley', prepWindow: 0.30, pullbackX: 1.8, lungeX: -6.2, tiltPrep: 0.05, tiltRelease: -0.19, isRecoil: true },
    skill: { style: 'flame_organ_crescendo', hasDedicatedSkill: true, releaseBurstDur: 0.52 },
    spinBase: 1.2,
  },

  elite_abyssal_executioner: {
    id: 'elite_abyssal_executioner',
    motionIdentity: 'Revolving Double-Crescent Guillotine Blades around Floating Upright Blood-Ruby',
    idle: { style: 'guillotine_menace_oscillate', bobAmp: 1.8, bobFreq: 3.6, bladeAmp: 0.32 },
    move: { style: 'guillotine_slice_glide', bobAmp: 1.8, bobFreq: 7.4, bankTilt: 0.15, spinBoost: 2.8 },
    attack: { style: 'full_360_guillotine_cleave', prepWindow: 0.26, pullbackX: -6.0, lungeX: 13.0, tiltPrep: -0.15, tiltRelease: 0.22 },
    skill: { style: 'crimson_execution_whirl', hasDedicatedSkill: true, releaseBurstDur: 0.50 },
    spinBase: 1.5,
  },

  elite_cryo_archwarden: {
    id: 'elite_cryo_archwarden',
    motionIdentity: 'Regal Glacial Chandelier with Cascading Aurora Icicle Shimmer & Polar Rings',
    idle: { style: 'chandelier_aurora_cascade', bobAmp: 2.1, bobFreq: 2.0, swingAmp: 0.055 },
    move: { style: 'cathedral_frost_levitation', bobAmp: 2.4, bobFreq: 3.8, swingAmp: 0.09 },
    attack: { style: 'icicle_prism_projection', prepWindow: 0.28, pullbackX: -2.8, lungeX: 6.4, tiltPrep: -0.07, tiltRelease: 0.11 },
    skill: { style: 'polar_cathedral_bloom', hasDedicatedSkill: true, releaseBurstDur: 0.54 },
    spinBase: 0.85,
  },

  // =========================================================================
  // GROUP D: 5 BOSS UNITS
  // =========================================================================
  boss_bastion_warden: {
    id: 'boss_bastion_warden',
    motionIdentity: 'Imperial Floating Citadel with Patrolling Golden Bastion Plates & Sun-Dome',
    idle: { style: 'citadel_plates_patrol', bobAmp: 2.4, bobFreq: 1.7, plateAmp: 4.5 },
    move: { style: 'imperial_citadel_advance', bobAmp: 2.6, bobFreq: 3.2, bankTilt: 0.05 },
    attack: { style: 'bastion_plates_sweep_ram', prepWindow: 0.34, pullbackX: -5.4, lungeX: 11.2, tiltPrep: -0.10, tiltRelease: 0.16 },
    skill: { style: 'imperial_crown_wall_array', hasDedicatedSkill: true, releaseBurstDur: 0.60 },
    spinBase: 0.7,
  },

  boss_relay_archon: {
    id: 'boss_relay_archon',
    motionIdentity: 'Celestial Harp-Mirror with Fanning Crystal Prism Feathers & Vibrating Strings',
    idle: { style: 'harp_feather_fan_resonance', bobAmp: 2.4, bobFreq: 1.9, featherAmp: 0.14 },
    move: { style: 'prism_archon_glide', bobAmp: 2.5, bobFreq: 3.6, bankTilt: 0.07 },
    attack: { style: 'harmonic_string_pluck_flare', prepWindow: 0.32, pullbackX: -3.2, lungeX: 7.4, tiltPrep: -0.08, tiltRelease: 0.12 },
    skill: { style: 'radiant_prism_mandala_bloom', hasDedicatedSkill: true, releaseBurstDur: 0.62 },
    spinBase: 0.9,
  },

  boss_obsidian_sovereign: {
    id: 'boss_obsidian_sovereign',
    motionIdentity: 'Eclipsed Sovereign Crown, Undulating Blood Corona, Piercing Eyes & Ascending Monoliths',
    idle: { style: 'blood_eclipse_monoliths', bobAmp: 2.2, bobFreq: 1.7, monolithAmp: 5.0 },
    move: { style: 'eclipse_sovereign_procession', bobAmp: 2.4, bobFreq: 3.2, bankTilt: 0.055 },
    attack: { style: 'monolith_eclipse_verdict', prepWindow: 0.34, pullbackX: -4.8, lungeX: 10.6, tiltPrep: -0.11, tiltRelease: 0.18 },
    skill: { style: 'total_eclipse_monolith_ascension', hasDedicatedSkill: true, releaseBurstDur: 0.64 },
    spinBase: 0.75,
  },

  boss_chrono_arbiter: {
    id: 'boss_chrono_arbiter',
    motionIdentity: 'Grand Triple-Ring Armillary Sphere with Live Central Clock Hands & Orbiting Planets',
    idle: { style: 'grand_armillary_clockwork', bobAmp: 2.3, bobFreq: 1.8, scaleBreath: 0.02 },
    move: { style: 'celestial_armillary_glide', bobAmp: 2.5, bobFreq: 3.4, bankTilt: 0.05, spinBoost: 1.8 },
    attack: { style: 'armillary_alignment_snap', prepWindow: 0.34, pullbackX: -3.4, lungeX: 7.8, tiltPrep: -0.08, tiltRelease: 0.12 },
    skill: { style: 'grand_temporal_collapse_array', hasDedicatedSkill: true, releaseBurstDur: 0.65 },
    spinBase: 0.95,
  },

  boss_astral_leviathan: {
    id: 'boss_astral_leviathan',
    motionIdentity: 'Orbital Dyson Star-Forge — Breathing Anvil Plates, Flowing Star Plasma & Containment Rings',
    idle: { style: 'dyson_star_forge_breathe', bobAmp: 2.5, bobFreq: 1.6, petalPulse: 0.055 },
    move: { style: 'star_forge_dreadnought_drift', bobAmp: 2.7, bobFreq: 3.0, bankTilt: 0.045, spinBoost: 1.6 },
    attack: { style: 'dyson_anvil_solar_crush', prepWindow: 0.36, pullbackX: -5.6, lungeX: 11.8, tiltPrep: -0.12, tiltRelease: 0.19 },
    skill: { style: 'orbital_dyson_cataclysm', hasDedicatedSkill: true, releaseBurstDur: 0.68 },
    spinBase: 0.85,
  },
});

export function getUnitAnimationProfile(unitId) {
  return UNIT_ANIMATION_PROFILES[unitId] || UNIT_ANIMATION_PROFILES.heavy_shield_guard;
}

// ============================================================================
// WeakMap-backed Per-Unit Animation State Integrator (zero memory leaks)
// ============================================================================
const _unitAnimStates = new WeakMap();

/**
 * Evaluates and smoothly integrates per-unit animation state (including
 * continuous angle accumulation, 3-phase attack envelopes, and synchronized
 * skill-release bursts). Automatically GC'd when dead units are removed.
 */
export function evaluateUnitAnimationState(unit, elapsed, design, options = null) {
  const profile = getUnitAnimationProfile(design?.id);
  const reducedMotion = Boolean(options?.reducedMotion ?? isReducedMotionPreferred());
  const motionScale = reducedMotion ? 0.32 : 1.0;

  const state = unit?.state || UNIT_STATES.IDLE;
  const isDead = state === UNIT_STATES.DEAD;
  const isMoving = state === UNIT_STATES.MOVING;
  const isCasting = state === UNIT_STATES.CASTING;
  const isStunned = state === UNIT_STATES.STUNNED;
  const isAttackingState = state === UNIT_STATES.ATTACKING || state === UNIT_STATES.HEALING;
  const isHealing = state === UNIT_STATES.HEALING || (unit?.healAnim || 0) > 0;
  const phase = unit?.phase || 0;
  const facing = unit?.facing || 1;
  const t = elapsed + phase;

  // Retrieve or initialize WeakMap state for real runtime unit objects
  let tracker = null;
  if (unit && typeof unit === 'object') {
    tracker = _unitAnimStates.get(unit);
    if (!tracker) {
      tracker = {
        lastElapsed: elapsed,
        spinAngle: phase * 1.7 + elapsed * profile.spinBase * motionScale,
        secondaryAngle: -phase * 1.1 - elapsed * profile.spinBase * 0.62 * motionScale,
        gearAngle: phase * 2.1 + elapsed * 1.4 * motionScale,
        wheelAngle: phase * 0.8,
        wasCasting: isCasting,
        skillReleaseRemaining: 0,
        skillReleaseDuration: profile.skill.releaseBurstDur || 0.48,
        wasAttackAnim: (unit.attackAnim || 0) > 0,
        recoveryTailRemaining: 0,
        attackCounter: 0,
      };
      _unitAnimStates.set(unit, tracker);
    }
  }

  let dt = 0;
  if (tracker) {
    const rawDt = elapsed - tracker.lastElapsed;
    if (rawDt < -0.0001) {
      // Deterministic time scrub / reset
      tracker.spinAngle = phase * 1.7 + elapsed * profile.spinBase * motionScale;
      tracker.secondaryAngle = -phase * 1.1 - elapsed * profile.spinBase * 0.62 * motionScale;
      tracker.gearAngle = phase * 2.1 + elapsed * 1.4 * motionScale;
      tracker.wheelAngle = phase * 0.8 + (isMoving ? elapsed * (profile.move.wheelSpeed || 4.0) * motionScale : 0);
      tracker.skillReleaseRemaining = 0;
      tracker.recoveryTailRemaining = 0;
      dt = 0;
    } else {
      dt = Math.min(0.1, Math.max(0, rawDt));
    }
    tracker.lastElapsed = elapsed;
  }

  // ---- 3-Phase Attack Envelope (Preparation -> Action/Release -> Recovery) ----
  const attackAnim = unit?.attackAnim || 0;
  const prepWindow = Math.min(
    profile.attack.prepWindow || 0.28,
    (unit?.attackInterval || 1.2) * 0.34,
  );

  // Explicit test/showcase override support OR real runtime cooldown-based anticipation
  let attackPrep = 0;
  if (typeof unit?.attackPrepOverride === 'number') {
    attackPrep = clamp01(unit.attackPrepOverride);
  } else if (
    !isDead &&
    !isCasting &&
    isAttackingState &&
    attackAnim <= 0.001 &&
    typeof unit?.attackCooldown === 'number' &&
    unit.attackCooldown > 0 &&
    unit.attackCooldown <= prepWindow
  ) {
    attackPrep = clamp01(1 - unit.attackCooldown / Math.max(0.05, prepWindow));
  }

  let attackRelease = 0;
  let attackRecovery = 0;
  if (!isDead && attackAnim > 0) {
    // attackAnim starts at 0.24 and counts down to 0
    // 0.24 -> 0.11 = sharp Action/Release impulse; 0.11 -> 0 = Recovery settle
    if (attackAnim > 0.11) {
      const u = clamp01((0.24 - attackAnim) / 0.13);
      // Fast rise to peak (u=0.25) then sustain through release
      attackRelease = u < 0.28 ? u / 0.28 : 1 - (u - 0.28) * 0.35;
    } else {
      const r = clamp01(attackAnim / 0.11);
      attackRelease = r * 0.25;
      attackRecovery = Math.sin(r * Math.PI);
    }
  }

  // Smooth recovery tail after attackAnim hits 0, plus toggle counter for alternating barrels
  if (tracker) {
    const nowAttackAnim = attackAnim > 0.18;
    if (nowAttackAnim && !tracker.wasAttackAnim) {
      tracker.attackCounter += 1;
    }
    if (tracker.wasAttackAnim && attackAnim <= 0.001) {
      tracker.recoveryTailRemaining = 0.14;
    }
    tracker.wasAttackAnim = attackAnim > 0.001;
    if (tracker.recoveryTailRemaining > 0 && dt > 0) {
      tracker.recoveryTailRemaining = Math.max(0, tracker.recoveryTailRemaining - dt);
    }
    if (attackRecovery < 0.01 && tracker.recoveryTailRemaining > 0) {
      attackRecovery = clamp01(tracker.recoveryTailRemaining / 0.14) * 0.65;
    }
  }

  const attackRatio = attackAnim > 0
    ? Math.sin(clamp01(attackAnim / 0.24) * Math.PI)
    : 0;

  let attackPhase = 'none';
  if (attackRelease >= 0.28) attackPhase = 'release';
  else if (attackRecovery > 0.05) attackPhase = 'recovery';
  else if (attackPrep > 0.04) attackPhase = 'prep';

  // ---- Synchronized Skill Charge & Release Burst ----
  let castProgress = 0;
  if (isCasting && !isDead) {
    if (unit?.castingAbility) {
      const dur = Math.max(0.1, unit.castingAbility.duration || 0.6);
      castProgress = clamp01(1 - (unit.castingAbility.remaining || 0) / dur);
    } else {
      castProgress = 0.5 + 0.5 * Math.sin(t * 6.5);
    }
  }

  let skillRelease = 0;
  if (typeof unit?.skillReleaseProgress === 'number') {
    skillRelease = clamp01(unit.skillReleaseProgress);
  } else if (tracker) {
    if (tracker.wasCasting && !isCasting && !isDead) {
      tracker.skillReleaseRemaining = tracker.skillReleaseDuration;
    }
    tracker.wasCasting = isCasting;
    if (tracker.skillReleaseRemaining > 0) {
      skillRelease = clamp01(tracker.skillReleaseRemaining / tracker.skillReleaseDuration);
      if (dt > 0) {
        tracker.skillReleaseRemaining = Math.max(0, tracker.skillReleaseRemaining - dt);
      }
    }
  }

  // ---- Smooth Integrated Angular Velocities ----
  const speedBoost = isMoving ? (profile.move.spinBoost || 1.45) : 1.0;
  const combatBoost =
    1.0 +
    attackPrep * 2.2 +
    attackRelease * 3.4 +
    castProgress * 3.2 +
    skillRelease * 4.0;
  const spinRate = profile.spinBase * speedBoost * combatBoost * motionScale;
  const secondaryRate = -profile.spinBase * 0.65 * (0.9 + castProgress * 2.8 + attackPrep * 1.5 + skillRelease * 3.2) * motionScale;
  const gearRate = (1.35 + (isMoving ? 0.8 : 0) + attackPrep * 3.8 + attackRelease * 4.5 + castProgress * 4.6 + skillRelease * 5.2) * motionScale;
  const wheelRate = isMoving ? (profile.move.wheelSpeed || 4.8) * motionScale : (attackRelease * 1.4 * motionScale);

  let spinAngle;
  let secondaryAngle;
  let gearAngle;
  let wheelAngle;
  let attackIndex = 0;

  if (tracker) {
    tracker.spinAngle += spinRate * dt;
    tracker.secondaryAngle += secondaryRate * dt;
    tracker.gearAngle += gearRate * dt;
    tracker.wheelAngle += wheelRate * dt;
    spinAngle = tracker.spinAngle;
    secondaryAngle = tracker.secondaryAngle;
    gearAngle = tracker.gearAngle;
    wheelAngle = tracker.wheelAngle;
    attackIndex = tracker.attackCounter;
  } else {
    spinAngle = phase * 1.7 + elapsed * spinRate;
    secondaryAngle = -phase * 1.1 + elapsed * secondaryRate;
    gearAngle = phase * 2.1 + elapsed * gearRate;
    wheelAngle = phase * 0.8 + elapsed * wheelRate;
  }

  // ---- Compute Distinct Per-Unit Body Transforms ----
  let bobY = 0;
  let tilt = 0;
  let scaleX = 1;
  let scaleY = 1;
  let lungeX = 0;

  if (!isDead) {
    const idleCfg = profile.idle;
    const moveCfg = profile.move;

    if (isMoving) {
      const f = moveCfg.bobFreq || 5.5;
      const a = (moveCfg.bobAmp || 2.0) * motionScale;
      if (design?.animProfile?.locomotion === 'heavy_march') {
        const stride = Math.abs(Math.sin(t * f));
        bobY = stride * a;
        tilt = Math.sin(t * f) * (moveCfg.tiltAmp || 0.08) * facing * motionScale;
        scaleY = 1 - stride * 0.045 * motionScale;
        scaleX = 1 + stride * 0.032 * motionScale;
      } else if (moveCfg.swingAmp) {
        bobY = 1.8 * motionScale + Math.sin(t * f) * a;
        tilt = Math.sin(t * f) * moveCfg.swingAmp * facing * motionScale;
      } else if (moveCfg.wheelSpeed) {
        // Rolling artillery carriage has subtle road rumble instead of floating bounce
        bobY = Math.abs(Math.sin(t * f * 1.4)) * a * 0.7;
        tilt = Math.sin(t * f) * 0.035 * facing * motionScale;
      } else {
        bobY = 2.2 * motionScale + Math.sin(t * f) * a;
        tilt =
          ((moveCfg.bankTilt || 0.08) * facing + Math.sin(t * f * 1.25) * 0.032) *
          motionScale;
      }
    } else {
      const f = idleCfg.bobFreq || 2.6;
      const a = (idleCfg.bobAmp || 1.6) * motionScale;
      if (idleCfg.swingAmp) {
        bobY = 1.6 * motionScale + Math.cos(t * f) * a * 0.7;
        tilt = Math.sin(t * f) * idleCfg.swingAmp * motionScale;
      } else if (idleCfg.sweepAmp) {
        bobY = 1.8 * motionScale + Math.sin(t * f) * a;
        tilt = Math.sin(t * f * 0.7) * idleCfg.sweepAmp * motionScale;
      } else if (design?.animProfile?.locomotion === 'heavy_march') {
        const breath = Math.sin(t * f);
        bobY = breath * a * 0.55;
        scaleY = 1 + breath * 0.022 * motionScale;
        scaleX = 1 - breath * 0.012 * motionScale;
      } else {
        const wave = Math.sin(t * f);
        bobY = 2.0 * motionScale + wave * a;
        if (idleCfg.tiltAmp) {
          tilt = Math.sin(t * f * 0.85) * idleCfg.tiltAmp * motionScale;
        }
        if (idleCfg.coreBreath || idleCfg.scaleBreath || idleCfg.petalPulse) {
          const bAmp = (idleCfg.coreBreath || idleCfg.scaleBreath || idleCfg.petalPulse) * 0.45 * motionScale;
          scaleX = 1 + wave * bAmp;
          scaleY = 1 + wave * bAmp;
        }
      }
    }

    // Apply 3-phase attack body choreography
    const atk = profile.attack;
    if (attackPrep > 0.01) {
      const easePrep = attackPrep * attackPrep;
      lungeX += (atk.pullbackX || -3.5) * easePrep * facing * motionScale;
      tilt += (atk.tiltPrep || -0.1) * easePrep * facing * motionScale;
      // Subtle coil squash during wind-up
      scaleX *= 1 - 0.045 * easePrep * motionScale;
      scaleY *= 1 + 0.045 * easePrep * motionScale;
      if (atk.style === 'corona_contract_solar_flare') {
        scaleX *= 1 - 0.06 * easePrep * motionScale;
        scaleY *= 1 - 0.06 * easePrep * motionScale;
      }
    }
    if (attackRelease > 0.01) {
      lungeX += (atk.lungeX || 8.0) * attackRelease * facing * motionScale;
      tilt += (atk.tiltRelease || 0.16) * attackRelease * facing * motionScale;
      if (atk.style === 'molten_overhead_cleave' || atk.style === 'halo_rise_tectonic_slam' || atk.style === 'magma_boilover_slam') {
        bobY += attackRelease * 5.2 * motionScale;
      }
      if (atk.isRecoil) {
        scaleX *= 1 - 0.07 * attackRelease * motionScale;
        scaleY *= 1 + 0.06 * attackRelease * motionScale;
      } else {
        scaleX *= 1 + 0.07 * attackRelease * motionScale;
        scaleY *= 1 - 0.045 * attackRelease * motionScale;
      }
    }
    if (attackRecovery > 0.01) {
      // Gentle damped settle back to neutral
      lungeX += (atk.isRecoil ? 1.4 : -1.5) * attackRecovery * facing * motionScale;
      tilt += (atk.isRecoil ? 0.04 : -0.05) * attackRecovery * facing * motionScale;
    }

    // Apply Skill Cast & Skill Release choreography
    if (isCasting) {
      bobY += (2.8 + castProgress * 3.6) * motionScale;
      const chargePulse = Math.sin(t * (reducedMotion ? 5 : 14)) * 0.04 * motionScale;
      scaleX *= 1 + castProgress * 0.06 * motionScale + chargePulse;
      scaleY *= 1 + castProgress * 0.06 * motionScale - chargePulse * 0.6;
      // Chrono Enforcer executes a dramatic 180-degree meridian flip during skill cast
      if (profile.skill.style === 'meridian_hourglass_invert') {
        const flipEase = castProgress < 0.5
          ? 2 * castProgress * castProgress
          : 1 - Math.pow(-2 * castProgress + 2, 2) / 2;
        tilt += Math.PI * flipEase * (reducedMotion ? 0.25 : 1.0);
      }
    }
    if (skillRelease > 0.01) {
      const burst = Math.sin(skillRelease * Math.PI);
      bobY += burst * 3.5 * motionScale;
      scaleX *= 1 + burst * 0.10 * motionScale;
      scaleY *= 1 + burst * 0.08 * motionScale;
    }
  }

  // Deterministic blink every ~4.2s
  const blinkCycle = (elapsed + phase * 1.7) % 4.2;
  const blink = blinkCycle > 4.04 && !isCasting && attackRelease < 0.1;

  let mood = 'normal';
  if (isDead || isStunned || (unit?.hitFlash || 0) > 0.04) mood = 'hurt';
  else if (isCasting || skillRelease > 0.1 || attackRelease > 0.18 || attackPrep > 0.45) mood = 'focused';
  else if (isHealing) mood = 'happy';

  return {
    bobY,
    tilt,
    scaleX,
    scaleY,
    lungeX,
    castProgress,
    skillRelease,
    attackRatio,
    attackPhase,
    attackPrep,
    attackRelease,
    attackRecovery,
    attackIndex,
    spinAngle,
    secondaryAngle,
    gearAngle,
    wheelAngle,
    motionScale,
    reducedMotion,
    blink,
    mood,
    facing,
    isMoving,
    isCasting,
    isDead,
    profile,
  };
}
