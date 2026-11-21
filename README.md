# Astral Command

Browser-based anime tactical card battler built with HTML5, CSS3, Vanilla JavaScript ES Modules, Canvas 2D, Web Audio API, and versioned `localStorage` persistence.

## Core Design Contracts

- **Horizontal Side-Scrolling Battlefield**: Allied and enemy squads advance toward each other on one shared horizontal lane between opposing bases.
- **Six-Slot Tactical Hand & Adjacent Merging**: Six simultaneous card slots remain the central tactical interface. Only adjacent identical cards can merge into an upgraded command card; different card types never merge.
- **Off-Field Commanders**: Heroes act strictly as Commanders (army passives, buffs, and ultimate skills with cut-ins) rather than spawning as battlefield units.
- **Asset Independence**: Gameplay logic references heroes, units, cards, and stages by stable IDs (`astra`, `heavy_shield_guard`, etc.) resolved through `AssetManager` and `ASSETS_CONFIG`. Standard hero portrait canvases use `1152 × 1744` pixels where applicable, while battle sprites and UI icons use native dimensions.

## Project Structure

```text
astral-command/
├── index.html
├── styles/
│   ├── main.css          # Design tokens, dark navy/cyber blue/gold theme, reset
│   ├── layout.css        # App shell, top command bar, responsive screen grids
│   ├── components.css    # Panels, buttons, portrait frames, modals, toasts
│   └── battle.css        # Battlefield HUD, Canvas viewport, 6-slot card dock
├── src/
│   ├── main.js           # ES Module entry point & global error handlers
│   ├── core/             # Game, GameState, EventBus, ScreenManager, SaveManager, AudioManager
│   ├── battle/           # BattleManager, UnitManager, MovementSystem, CombatSystem,
│   │                     # TargetingSystem, ProjectileSystem, SkillSystem, WaveManager
│   ├── systems/          # CardSystem, HeroSystem, GachaSystem, FormationSystem,
│   │                     # EconomySystem, ProgressionSystem
│   ├── rendering/        # BattleRenderer, AnimationManager, ParticleSystem, AssetManager
│   ├── ui/               # Home, Battle, Heroes, Formation, Summon, Inventory, Settings screens
│   └── utils/            # MathUtils, StorageUtils, DataLoader
├── data/                 # JSON balance & content configs (heroes, units, skills, cards, stages, banners)
├── assets/               # Modular placeholder SVG assets organized by category
└── tests/                # Node.js built-in test runner suites (zero external test dependencies)
```

## Running Locally

### Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in a modern browser.

### Production Build

```bash
npm run build
```

Vite bundles the ES modules and stylesheets into `dist/` and copies `data/` and `assets/` alongside them.

### Running Tests

```bash
npm test
```

Executes unit tests covering `EventBus`, `SaveManager` (validation, corrupted JSON recovery, missing field recovery, migrations, reset), `ScreenManager`, `AssetManager` (loading & SVG fallback), `DataLoader` cross-reference schema validation, and `CardSystem` adjacent merging rules.

## P0 Status & Next Phase (P1)

P0 establishes the complete modular architecture, all seven navigable screens, configuration-driven data loading, resilient asset fallbacks, and versioned persistence.

**Recommended P1 Next Task**: Implement full P1 horizontal battlefield combat simulation inside `src/battle/` (`CombatSystem` damage/healing/death & floating damage numbers, `ProjectileSystem` ranged attacks, `WaveManager` timed enemy wave spawning, `BattleManager` base destruction victory/defeat modal & stage rewards via `ProgressionSystem` and `EconomySystem`).
