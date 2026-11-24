/**
 * AssetManager — Centralized configuration-driven asset registry and loader.
 *
 * Asset Independence Contract:
 * Gameplay logic references heroes, units, and effects strictly by stable IDs.
 * Portrait assets declare the 1152 x 1744 standard canvas where applicable,
 * while battle sprites and UI icons use dimensions suited to their formats.
 */

export const PORTRAIT_CANVAS = Object.freeze({ width: 1152, height: 1744 });

export const ASSETS_CONFIG = {
  // Commander Hero Portraits (1152 x 1744 portrait canvas)
  hero_portrait_astra: {
    id: 'hero_portrait_astra',
    category: 'hero_portrait',
    type: 'image',
    format: 'png',
    src: './astra-cardtemplate/assets-astra/character.png',
    label: 'Astra Valen',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_astra_home: {
    id: 'hero_portrait_astra_home',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/astra.svg',
    label: 'Astra Valen',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_bg_astra: {
    id: 'hero_bg_astra',
    category: 'hero_background',
    type: 'image',
    format: 'jpeg',
    src: './astra-cardtemplate/assets-astra/bg.jpeg',
    label: 'Astra Celestial Backdrop',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_kael: {
    id: 'hero_portrait_kael',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/kael.svg',
    label: 'Kael Virel',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_lyra: {
    id: 'hero_portrait_lyra',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/lyra.svg',
    label: 'Lyra Solis',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_seraphina: {
    id: 'hero_portrait_seraphina',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/seraphina.svg',
    label: 'Seraphina Kuros',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_vanguard_zero: {
    id: 'hero_portrait_vanguard_zero',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/vanguard_zero.svg',
    label: 'Orin Vance',
    canvasSize: PORTRAIT_CANVAS,
  },

  // Battlefield Unit Sprites (native sprite format)
  unit_heavy_shield_guard: {
    id: 'unit_heavy_shield_guard',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/heavy_shield_guard.webp',
    label: 'Heavy Shield Guard',
    canvasSize: { width: 256, height: 256 },
  },
  unit_wind_cavalry: {
    id: 'unit_wind_cavalry',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/wind_cavalry.webp',
    label: 'Wind Cavalry',
    canvasSize: { width: 256, height: 256 },
  },
  unit_arcane_archer: {
    id: 'unit_arcane_archer',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/arcane_archer.webp',
    label: 'Arcane Archer',
    canvasSize: { width: 256, height: 256 },
  },
  unit_field_cleric: {
    id: 'unit_field_cleric',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/field_cleric.webp',
    label: 'Field Cleric',
    canvasSize: { width: 256, height: 256 },
  },
  unit_vanguard_breaker: {
    id: 'unit_vanguard_breaker',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/vanguard_breaker.webp',
    label: 'Vanguard Breaker',
    canvasSize: { width: 256, height: 256 },
  },
  unit_pulse_skirmisher: {
    id: 'unit_pulse_skirmisher',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/pulse_skirmisher.webp',
    label: 'Pulse Skirmisher',
    canvasSize: { width: 256, height: 256 },
  },
  unit_solar_pyromancer: {
    id: 'unit_solar_pyromancer',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/solar_pyromancer.webp',
    label: 'Solar Pyromancer',
    canvasSize: { width: 256, height: 256 },
  },
  unit_aegis_sentinel: {
    id: 'unit_aegis_sentinel',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/aegis_sentinel.webp',
    label: 'Aegis Sentinel',
    canvasSize: { width: 256, height: 256 },
  },
  unit_chrono_weaver: {
    id: 'unit_chrono_weaver',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/chrono_weaver.webp',
    label: 'Chrono Weaver',
    canvasSize: { width: 256, height: 256 },
  },
  unit_astral_construct: {
    id: 'unit_astral_construct',
    category: 'unit_sprite',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/astral_construct.webp',
    label: 'Astral Automaton',
    canvasSize: { width: 256, height: 256 },
  },

  // Dedicated Enemy, Elite & Boss Object Models (10 Enemies @ 256px, 8 Elites @ 320px, 5 Bosses @ 384px)
  unit_model_enemy_void_vanguard: {
    id: 'unit_model_enemy_void_vanguard',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_void_vanguard.webp',
    label: 'Void Vanguard',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_rift_stalker: {
    id: 'unit_model_enemy_rift_stalker',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_rift_stalker.webp',
    label: 'Rift Stalker',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_obsidian_marksman: {
    id: 'unit_model_enemy_obsidian_marksman',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_obsidian_marksman.webp',
    label: 'Obsidian Marksman',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_corrupted_acolyte: {
    id: 'unit_model_enemy_corrupted_acolyte',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_corrupted_acolyte.webp',
    label: 'Corrupted Acolyte',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_siege_juggernaut: {
    id: 'unit_model_enemy_siege_juggernaut',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_siege_juggernaut.webp',
    label: 'Siege Juggernaut',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_stasis_weaver: {
    id: 'unit_model_enemy_stasis_weaver',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_stasis_weaver.webp',
    label: 'Stasis Weaver',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_inferno_bombardier: {
    id: 'unit_model_enemy_inferno_bombardier',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_inferno_bombardier.webp',
    label: 'Inferno Bombardier',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_dread_bannerman: {
    id: 'unit_model_enemy_dread_bannerman',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_dread_bannerman.webp',
    label: 'Dread Bannerman',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_cryo_warden: {
    id: 'unit_model_enemy_cryo_warden',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_cryo_warden.webp',
    label: 'Cryo Warden',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_enemy_abyssal_ravager: {
    id: 'unit_model_enemy_abyssal_ravager',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/enemy_abyssal_ravager.webp',
    label: 'Abyssal Ravager',
    canvasSize: { width: 256, height: 256 },
  },
  unit_model_elite_iron_bulwark: {
    id: 'unit_model_elite_iron_bulwark',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_iron_bulwark.webp',
    label: 'Iron Bulwark Captain',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_storm_lancer: {
    id: 'unit_model_elite_storm_lancer',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_storm_lancer.webp',
    label: 'Storm Lancer Elite',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_astral_sniper: {
    id: 'unit_model_elite_astral_sniper',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_astral_sniper.webp',
    label: 'Astral Arcanist Elite',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_siege_colossus: {
    id: 'unit_model_elite_siege_colossus',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_siege_colossus.webp',
    label: 'Siege Colossus Alpha',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_chrono_enforcer: {
    id: 'unit_model_elite_chrono_enforcer',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_chrono_enforcer.webp',
    label: 'Chrono Enforcer Elite',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_inferno_captain: {
    id: 'unit_model_elite_inferno_captain',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_inferno_captain.webp',
    label: 'Inferno Battery Captain',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_abyssal_executioner: {
    id: 'unit_model_elite_abyssal_executioner',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_abyssal_executioner.webp',
    label: 'Abyssal Executioner',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_elite_cryo_archwarden: {
    id: 'unit_model_elite_cryo_archwarden',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/elite_cryo_archwarden.webp',
    label: 'Cryo Archwarden',
    canvasSize: { width: 320, height: 320 },
  },
  unit_model_boss_bastion_warden: {
    id: 'unit_model_boss_bastion_warden',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/boss_bastion_warden.webp',
    label: 'Bastion Warden Vex',
    canvasSize: { width: 384, height: 384 },
  },
  unit_model_boss_relay_archon: {
    id: 'unit_model_boss_relay_archon',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/boss_relay_archon.webp',
    label: 'Azure Archon Kaelis',
    canvasSize: { width: 384, height: 384 },
  },
  unit_model_boss_obsidian_sovereign: {
    id: 'unit_model_boss_obsidian_sovereign',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/boss_obsidian_sovereign.webp',
    label: 'Obsidian Sovereign Malakor',
    canvasSize: { width: 384, height: 384 },
  },
  unit_model_boss_chrono_arbiter: {
    id: 'unit_model_boss_chrono_arbiter',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/boss_chrono_arbiter.webp',
    label: 'Chrono Arbiter Vael',
    canvasSize: { width: 384, height: 384 },
  },
  unit_model_boss_astral_leviathan: {
    id: 'unit_model_boss_astral_leviathan',
    category: 'unit_model',
    type: 'image',
    format: 'webp',
    src: './assets/units/models/boss_astral_leviathan.webp',
    label: 'Astral Dreadnought Hyperion',
    canvasSize: { width: 384, height: 384 },
  },

  // Tactical Card Emblems
  card_emblem_shield: {
    id: 'card_emblem_shield',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_shield.svg',
    label: 'Shield Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_cavalry: {
    id: 'card_emblem_cavalry',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_cavalry.svg',
    label: 'Cavalry Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_archer: {
    id: 'card_emblem_archer',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_archer.svg',
    label: 'Archer Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_cleric: {
    id: 'card_emblem_cleric',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_cleric.svg',
    label: 'Cleric Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_breaker: {
    id: 'card_emblem_breaker',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_breaker.svg',
    label: 'Breaker Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_pyro: {
    id: 'card_emblem_pyro',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_pyro.svg',
    label: 'Pyro Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_chrono: {
    id: 'card_emblem_chrono',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_chrono.svg',
    label: 'Chrono Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_construct: {
    id: 'card_emblem_construct',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_construct.svg',
    label: 'Construct Card',
    canvasSize: { width: 64, height: 64 },
  },

  // Non-Unit Tactical Card Illustrations (512 x 512 two-layer Star Struck anime fantasy artwork)
  card_art_astral_nova: {
    id: 'card_art_astral_nova',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/astral_nova.png',
    label: 'Astral Nova',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_astral_nova: {
    id: 'card_bg_astral_nova',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/astral_nova.webp',
    label: 'Astral Nova Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_sanctuary_wave: {
    id: 'card_art_sanctuary_wave',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/sanctuary_wave.png',
    label: 'Sanctuary Wave',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_sanctuary_wave: {
    id: 'card_bg_sanctuary_wave',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/sanctuary_wave.webp',
    label: 'Sanctuary Wave Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_stasis_pulse: {
    id: 'card_art_stasis_pulse',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/stasis_pulse.png',
    label: 'Stasis Pulse',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_stasis_pulse: {
    id: 'card_bg_stasis_pulse',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/stasis_pulse.webp',
    label: 'Stasis Pulse Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_orbital_lance: {
    id: 'card_art_orbital_lance',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/orbital_lance.png',
    label: 'Orbital Lance',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_orbital_lance: {
    id: 'card_bg_orbital_lance',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/orbital_lance.webp',
    label: 'Orbital Lance Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_gravity_vortex: {
    id: 'card_art_gravity_vortex',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/gravity_vortex.png',
    label: 'Gravity Vortex',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_gravity_vortex: {
    id: 'card_bg_gravity_vortex',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/gravity_vortex.webp',
    label: 'Gravity Vortex Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_chain_lightning: {
    id: 'card_art_chain_lightning',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/chain_lightning.png',
    label: 'Arc Surge',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_chain_lightning: {
    id: 'card_bg_chain_lightning',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/chain_lightning.webp',
    label: 'Arc Surge Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_full_assault: {
    id: 'card_art_full_assault',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/full_assault.png',
    label: 'Full Assault',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_full_assault: {
    id: 'card_bg_full_assault',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/full_assault.webp',
    label: 'Full Assault Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_focus_fire: {
    id: 'card_art_focus_fire',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/focus_fire.png',
    label: 'Focus Fire',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_focus_fire: {
    id: 'card_bg_focus_fire',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/focus_fire.webp',
    label: 'Focus Fire Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_emergency_defense: {
    id: 'card_art_emergency_defense',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/emergency_defense.png',
    label: 'Emergency Defense',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_emergency_defense: {
    id: 'card_bg_emergency_defense',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/emergency_defense.webp',
    label: 'Emergency Defense Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_flank_maneuver: {
    id: 'card_art_flank_maneuver',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/flank_maneuver.png',
    label: 'Flank Directive',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_flank_maneuver: {
    id: 'card_bg_flank_maneuver',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/flank_maneuver.webp',
    label: 'Flank Directive Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_siege_formation: {
    id: 'card_art_siege_formation',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/siege_formation.png',
    label: 'Siege Protocol',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_siege_formation: {
    id: 'card_bg_siege_formation',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/siege_formation.webp',
    label: 'Siege Protocol Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_suppressive_volley: {
    id: 'card_art_suppressive_volley',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/suppressive_volley.png',
    label: 'Suppressive Volley',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_suppressive_volley: {
    id: 'card_bg_suppressive_volley',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/suppressive_volley.webp',
    label: 'Suppressive Volley Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_aegis_blessing: {
    id: 'card_art_aegis_blessing',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/aegis_blessing.png',
    label: 'Aegis Blessing',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_overclock_core: {
    id: 'card_art_overclock_core',
    category: 'card_art',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/overclock_core.webp',
    label: 'Overclock Core',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_overclock_core: {
    id: 'card_bg_overclock_core',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/overclock_core.webp',
    label: 'Overclock Core Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_mending_aura: {
    id: 'card_art_mending_aura',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/mending_aura.png',
    label: 'Mending Aura',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_mending_aura: {
    id: 'card_bg_mending_aura',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/mending_aura.webp',
    label: 'Mending Aura Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_starlight_catalyst: {
    id: 'card_art_starlight_catalyst',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/starlight_catalyst.png',
    label: 'Starlight Catalyst',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_starlight_catalyst: {
    id: 'card_bg_starlight_catalyst',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/starlight_catalyst.webp',
    label: 'Starlight Catalyst Backdrop',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_cleanse_beacon: {
    id: 'card_art_cleanse_beacon',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/cleanse_beacon.png',
    label: 'Purify Beacon',
    canvasSize: { width: 512, height: 512 },
  },
  card_art_haste_relay: {
    id: 'card_art_haste_relay',
    category: 'card_art',
    type: 'image',
    format: 'png',
    src: './assets/cards/art/fg/haste_relay.png',
    label: 'Haste Relay',
    canvasSize: { width: 512, height: 512 },
  },
  card_bg_haste_relay: {
    id: 'card_bg_haste_relay',
    category: 'card_bg',
    type: 'image',
    format: 'webp',
    src: './assets/cards/art/bg/haste_relay.webp',
    label: 'Haste Relay Backdrop',
    canvasSize: { width: 512, height: 512 },
  },

  // Battlefield Backgrounds & Effects
  bg_battle_orbital_ridge: {
    id: 'bg_battle_orbital_ridge',
    category: 'background',
    type: 'image',
    format: 'svg',
    src: './assets/backgrounds/orbital_ridge.svg',
    label: 'Orbital Ridge',
    canvasSize: { width: 1600, height: 620 },
  },
  effect_astral_burst: {
    id: 'effect_astral_burst',
    category: 'effect',
    type: 'image',
    format: 'svg',
    src: './assets/effects/astral_burst.svg',
    label: 'Astral Burst',
    canvasSize: { width: 64, height: 64 },
  },
  ui_emblem: {
    id: 'ui_emblem',
    category: 'ui',
    type: 'image',
    format: 'svg',
    src: './assets/ui/astral_emblem.svg',
    label: 'Astral Emblem',
    canvasSize: { width: 64, height: 64 },
  },
};

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates an inline SVG placeholder Data URI so missing or failed assets
 * never render broken image icons or crash rendering pipelines.
 */
export function createFallbackDataUri(assetId, entry = null) {
  const width = entry?.canvasSize?.width || 256;
  const height = entry?.canvasSize?.height || 256;
  const label = escapeXml(entry?.label || assetId || 'Asset');
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.085));
  const subSize = Math.max(10, Math.round(fontSize * 0.65));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#101a2f"/>`,
    `<rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="10 6"/>`,
    `<line x1="12" y1="12" x2="${width - 12}" y2="${height - 12}" stroke="#38bdf8" stroke-opacity="0.16" stroke-width="1.5"/>`,
    `<line x1="${width - 12}" y1="12" x2="12" y2="${height - 12}" stroke="#38bdf8" stroke-opacity="0.16" stroke-width="1.5"/>`,
    `<text x="50%" y="48%" text-anchor="middle" fill="#e2b75b" font-family="sans-serif" font-size="${subSize}" letter-spacing="2">FALLBACK ASSET</text>`,
    `<text x="50%" y="56%" text-anchor="middle" fill="#edf2fa" font-family="sans-serif" font-weight="600" font-size="${fontSize}">${label}</text>`,
    `</svg>`,
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class AssetManager {
  constructor({ config = ASSETS_CONFIG, eventBus = null, imageLoader = null } = {}) {
    this._config = { ...config };
    this._eventBus = eventBus;
    this._imageLoader = imageLoader;
    /** @type {Map<string, { status: string, src: string, element: any, isFallback: boolean }>} */
    this._cache = new Map();
  }

  registerAsset(assetId, descriptor) {
    this._config[assetId] = { id: assetId, ...descriptor };
  }

  getConfig(assetId) {
    return this._config[assetId] || null;
  }

  getState(assetId) {
    return this._cache.get(assetId)?.status || 'idle';
  }

  /**
   * Returns a safe image URL immediately (resolved asset path or fallback Data URI).
   */
  getImageSrc(assetId) {
    const cached = this._cache.get(assetId);
    if (cached) return cached.src;
    const entry = this._config[assetId];
    if (!entry || !entry.src) {
      return createFallbackDataUri(assetId, entry);
    }
    return entry.src;
  }

  /**
   * Returns a loaded HTMLImageElement (or null if not yet loaded).
   */
  getImageElement(assetId) {
    return this._cache.get(assetId)?.element || null;
  }

  /**
   * Binds resilient error fallback directly to an <img> element so broken icons never appear.
   */
  bindImageElement(imgEl, assetId) {
    if (!imgEl) return;
    const entry = this._config[assetId];
    const fallbackUri = createFallbackDataUri(assetId, entry);

    imgEl.alt = entry?.label || assetId;
    imgEl.referrerPolicy = 'no-referrer';
    imgEl.onerror = () => {
      if (imgEl.dataset.fallbackApplied === '1') return;
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = fallbackUri;
      this._cache.set(assetId, {
        status: 'fallback',
        src: fallbackUri,
        element: imgEl,
        isFallback: true,
      });
      this._eventBus?.emit('asset:fallback', { assetId });
    };
    imgEl.src = this.getImageSrc(assetId);
  }

  async loadAsset(assetId) {
    const existing = this._cache.get(assetId);
    if (existing && (existing.status === 'loaded' || existing.status === 'fallback')) {
      return existing;
    }

    const entry = this._config[assetId];
    if (!entry) {
      const fallbackUri = createFallbackDataUri(assetId, null);
      const record = { status: 'fallback', src: fallbackUri, element: null, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', { assetId, reason: 'unregistered' });
      return record;
    }

    this._cache.set(assetId, { status: 'loading', src: entry.src, element: null, isFallback: false });

    if (entry.type === 'audio') {
      return this._loadAudio(assetId, entry);
    }
    return this._loadImage(assetId, entry);
  }

  async _loadImage(assetId, entry) {
    const fallbackUri = createFallbackDataUri(assetId, entry);
    const loadImpl =
      this._imageLoader ||
      ((src) =>
        new Promise((resolve, reject) => {
          if (typeof Image === 'undefined') {
            reject(new Error('Image constructor unavailable in non-DOM environment'));
            return;
          }
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
          img.src = src;
        }));

    try {
      const element = await loadImpl(entry.src);
      const record = { status: 'loaded', src: entry.src, element, isFallback: false };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:loaded', { assetId });
      return record;
    } catch (error) {
      let fallbackEl = null;
      if (typeof Image !== 'undefined' && !this._imageLoader) {
        try {
          fallbackEl = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = fallbackUri;
          });
        } catch {
          fallbackEl = null;
        }
      }
      const record = { status: 'fallback', src: fallbackUri, element: fallbackEl, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', {
        assetId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return record;
    }
  }

  async _loadAudio(assetId, entry) {
    try {
      if (typeof fetch !== 'function') {
        throw new Error('fetch unavailable');
      }
      const res = await fetch(entry.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const record = { status: 'loaded', src: entry.src, element: buffer, isFallback: false };
      this._cache.set(assetId, record);
      return record;
    } catch {
      const record = { status: 'fallback', src: '', element: null, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', { assetId, reason: 'audio_unavailable' });
      return record;
    }
  }

  async preloadGroup(assetIds) {
    const ids = Array.isArray(assetIds) ? assetIds : Object.keys(this._config);
    const results = await Promise.all(ids.map((id) => this.loadAsset(id)));
    this._eventBus?.emit('asset:batchComplete', this.getStatusSummary());
    return results;
  }

  getStatusSummary() {
    let loaded = 0;
    let fallback = 0;
    let loading = 0;
    for (const entry of this._cache.values()) {
      if (entry.status === 'loaded') loaded += 1;
      else if (entry.status === 'fallback') fallback += 1;
      else if (entry.status === 'loading') loading += 1;
    }
    return {
      registered: Object.keys(this._config).length,
      cached: this._cache.size,
      loaded,
      fallback,
      loading,
    };
  }
}
