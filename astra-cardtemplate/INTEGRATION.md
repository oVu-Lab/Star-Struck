# AstraCard — AI Agent Integration Guide (Star Struck)

This document is the authoritative integration specification for AI coding agents (Gemini, Claude, Antigravity, Codex, etc.) and engineers integrating `AstraCard` into **Star Struck**.

> **MANDATORY RULE:**
> **Unless a task explicitly requests animated cards, use `ASTRA_CARD_STATIC_OPTIONS` for collectible cards displayed in normal game UI.**

---

## 1. Component Files & Folder Structure

Keep the component directory intact so relative URLs (`./AstraCard.css` and `./assets-astra/*`, resolved via `import.meta.url`) work without extra configuration:

```text
astra-cardtemplate/
├── AstraCard.js       # Vanilla ES Module component (exports AstraCard, ASTRA_CARD_STATIC_OPTIONS, ASTRA_CARD_DEFAULTS)
├── AstraCard.css      # Scoped component styles (all rules under .astra-card)
├── demo.html          # Standalone verification page (static mode)
├── README.md          # Full API reference
├── INTEGRATION.md     # This AI integration specification
└── assets-astra/
    ├── bg.jpeg        # 1152×1744 celestial astrolabe background (RGB JPEG)
    ├── character.png  # 1152×1744 Astra character art (RGBA PNG — MUST keep alpha channel)
    ├── frame.png      # 1152×1744 ornate gold border frame (RGBA PNG)
    └── depth.jpeg     # 1152×1744 grayscale relief height map (RGB JPEG)
```

---

## 2. Required Assets & Paths

`AstraCard.js` resolves default assets relative to itself using `new URL('./assets-astra/<file>', import.meta.url).href`:

| Key | Default File | Resolution | Format & Requirement |
| :--- | :--- | :--- | :--- |
| `bg` | `./assets-astra/bg.jpeg` | `1152×1744` | RGB JPEG background texture |
| `character` | `./assets-astra/character.png` | `1152×1744` | **RGBA PNG with alpha transparency** (do not convert to JPEG) |
| `frame` | `./assets-astra/frame.png` | `1152×1744` | RGBA PNG frame (with automatic fallback keying if alpha is absent) |
| `depth` | `./assets-astra/depth.jpeg` | `1152×1744` | Grayscale depth map used for relief ray-marching & lighting normals |

- **Custom asset locations:** If Star Struck stores assets in a different directory, pass explicit URLs in `options.assets` or `data.assets` (`data.assets` takes precedence over `options.assets`, which takes precedence over defaults).
- **Shared caching:** Identical `[assets, frame]` sets are pre-processed once in a module-level cache and shared across all `AstraCard` instances.
- **HTTP required:** The app must be served over `http://` or `https://` (not `file://`), because ES Modules and WebGL `CanvasTexture` uploads require a valid HTTP origin.

---

## 3. Three.js & Font Dependencies

- **Three.js r128:** Line 3 of `AstraCard.js` imports Three.js as a pinned ES Module:
  ```js
  import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
  ```
  - **No build step needed** when online.
  - **Offline / bundled builds:** Vendor `three.module.js` (r128) into the project and either update line 3 of `AstraCard.js` to the local path or map the specifier via `<script type="importmap">`. Do not upgrade Three.js major versions without testing the custom `ShaderMaterial` `extensions: { derivatives: true }` block.
- **Title Font (`Cinzel Decorative` 700):** Loaded automatically once from Google Fonts via `options.fontUrl`. If Star Struck self-hosts fonts, load `Cinzel Decorative` in the game's stylesheet and pass `fontUrl: null`.
- **Stylesheet:** `AstraCard.js` auto-injects `AstraCard.css` once if not already linked. Linking `<link rel="stylesheet" href=".../AstraCard.css">` in the HTML `<head>` is recommended to avoid FOUC; `ensureCss()` detects existing links and will not duplicate them.

---

## 4. Required HTML Container Structure & Sizing

Provide a dedicated empty DOM container (`<div>`) for each card instance:

```html
<!-- Option A: Explicit container dimensions (recommended for grids & detail panels) -->
<div class="commander-card-slot" style="width: 180px; height: 270px;"></div>

<!-- Option B: Width-only container (AstraCard automatically applies .astra-card--aspect for 2:3 ratio) -->
<div class="commander-card-slot" style="width: 180px;"></div>
```

- **Aspect ratio:** Keep containers at or near **`2:3`** (`1152×1744`) to preserve the original proportions without excess letterboxing.
- **Transparent vs. studio backdrop:**
  - Leave `studio: false` (default) when embedding the card directly over Star Struck UI panels.
  - Pass `studio: true` only when you want the dark radial celestial backdrop behind the card.
- **Hidden containers / tabs / modals:** If a card is mounted while its container is `display: none` or transitioning size, call `card.resize()` once the container becomes visible.

---

## 5. How to Initialize a Static `AstraCard`

Always import `ASTRA_CARD_STATIC_OPTIONS` alongside `AstraCard` and spread it into the options object:

```js
import { AstraCard, ASTRA_CARD_STATIC_OPTIONS } from './path/to/astra-cardtemplate/AstraCard.js';

const card = new AstraCard(slotElement, {
  ...ASTRA_CARD_STATIC_OPTIONS,
  data: {
    id: commander.id,
    name: commander.name
  },
  onClick: (data, instance) => handleCommanderClick(data, instance),
  onSelect: (data, instance) => handleCommanderSelect(data, instance)
});
```

`ASTRA_CARD_STATIC_OPTIONS` sets:
- `autoplay: false` (card body does not sway, rotate, or bob)
- `interactive: false` (no pointer hover/drag tilt reaction)
- `tilt: 0` (zero tilt angle — locked at 0°)
- `animateEffects: true` (sparkles, flowing dust, 4-point star flares, glass sweep, spotlight, and floating particles stay dynamically animated)

---

## 6. How to Connect Game Data

Pass Star Struck's Commander data into `options.data`. The component reads only `name`, `assets`, and `glow`, and preserves all other game fields untouched:

```js
const card = new AstraCard(slotElement, {
  ...ASTRA_CARD_STATIC_OPTIONS,
  data: {
    id: commander.id,         // preserved & returned in callbacks/events
    name: commander.name,     // rendered in top gold celestial title band (pass '' to hide)
    rarity: commander.rarity, // preserved
    level: commander.level,   // preserved
    // Optional per-instance overrides:
    // glow: '#c9a24a',
    // assets: { bg, character, frame, depth }
  }
});
```

- Read back a shallow copy anytime with `card.getData()`.
- Do **not** overlay custom HTML inside `.astra-card` unless positioned in a sibling wrapper outside `card.element`; keep badges (level, stars, formation slot) in your host container's overlay layer so `card.destroy()` cleanly removes only the card DOM.

---

## 7. How to Connect Game Click & Selection Systems

`AstraCard` uses a **controlled selection model**—it does not mutate your game's selection state by itself.

### Option A: Direct Callbacks
```js
const card = new AstraCard(slotElement, {
  ...ASTRA_CARD_STATIC_OPTIONS,
  selected: commander.id === activeCommanderId,
  data: commander,
  onClick: (data, instance) => {
    // Fires on primary click/tap (drag < 8px, < 600ms) or Enter/Space
  },
  onSelect: (data, instance) => {
    // Update your game state, then sync visual selection on mounted cards:
    selectCommander(data.id);
    for (const [id, c] of mountedCards) {
      c.setSelected(id === data.id);
    }
  }
});
```

### Option B: Event Delegation on a Parent Container
All component events bubble from `card.element` as `CustomEvent`s:
- `astra:click` (`e.detail = { data, card, selected, originalEvent }`)
- `astra:select` (`e.detail = { data, card, selected, originalEvent }`)
- `astra:hoverstart` / `astra:hoverend` (`e.detail = { data, card, selected }`)
- `astra:ready` / `astra:error`

If a card is purely decorative (e.g., a static preview that should not be focusable or selectable), pass `selectable: false`.

---

## 8. How to Update Card Data

Use `card.update(nextData)` instead of destroying and recreating the card when only data changes:

```js
card.update({
  name: updatedCommander.name,
  level: updatedCommander.level
});
```

- `update()` merges fields shallowly (and merges `assets` if provided).
- Title lettering is redrawn **only** if `name` changed.
- GPU textures are reloaded **only** if resolved asset URLs changed.
- If `animateEffects: false` is set, updating triggers a single WebGL redraw and returns to idle; with default `animateEffects: true`, dynamic sparkles and lighting continue seamlessly.
- To change runtime behavior flags (e.g., `studio`, `selectable`, `selected`, `glow`), call `card.setOptions(nextOptions)`.

---

## 9. How to Clean Up Instances

Always call `card.destroy()` when closing a screen, switching tabs, closing a modal, or removing a card slot from the DOM:

```js
function unmountScreen(mountedCards) {
  for (const card of mountedCards) {
    card.destroy();
  }
  mountedCards.length = 0;
}
```

`destroy()` is idempotent (safe to call twice) and cleans up:
- `requestAnimationFrame` loop
- `ResizeObserver` and `IntersectionObserver`
- All `root`, `window`, `document`, and `canvas` event listeners
- Three.js geometries, shader materials, textures, and the WebGL renderer/context
- The `.astra-card` DOM node

Optional: call `AstraCard.clearCache()` only if you explicitly want to release the ~40 MB shared CPU canvas cache (e.g., after leaving card screens entirely).

---

## 10. Avoiding Too Many Simultaneous WebGL Contexts

Browsers enforce a hard limit of roughly **8 to 16 active WebGL contexts per tab**. Exceeding this causes the browser to silently evict the oldest WebGL contexts (blank canvases).

- **Important:** Offscreen cards automatically pause via `IntersectionObserver`, **but each mounted `AstraCard` still owns 1 WebGL context** until `destroy()` is called.
- **Rules for Star Struck screens:**
  1. **Always `destroy()`** cards belonging to inactive/closed screens or modals—do not hide old screens with `display: none` while leaving their `AstraCard` instances alive.
  2. **Keep simultaneous mounted instances ≤ 8** whenever possible (e.g., Formation screen, Commander Details, Summon Result, small rosters).
  3. **For large Collection / Inventory grids (> 8 cards):** Use pagination or viewport virtualization so only visible cards are mounted as `AstraCard` instances, calling `destroy()` on cards scrolled far out of view.

---

## 11. Preserving the Original Card Appearance

Do **not**:
- Modify or simplify the 6 GLSL shaders (`VS`, `COM`, `FS`, `SFS`, `PVS`, `PFS`) in `AstraCard.js`.
- Remove the 8-slice metallic edge stack, relief ray-marching, foil speculars, star flares, or `mkTitle()` lettering.
- Replace `assets-astra/character.png` with a JPEG or flatten its alpha channel.
- Add global CSS rules that target `canvas`, `.astra-card__canvas`, `.astra-card__glow`, or `.astra-card__shadow` in ways that clip or distort the card.
- Stretch the container far away from the `2:3` aspect ratio.

---

## 12. AI Agent Pre-Completion Checklist

Before concluding any Star Struck integration task involving `AstraCard`, verify:
- [ ] Imported `{ AstraCard, ASTRA_CARD_STATIC_OPTIONS }` and spread `...ASTRA_CARD_STATIC_OPTIONS` (unless animation was explicitly requested).
- [ ] Asset URLs resolve over HTTP and `character.png` preserves alpha transparency.
- [ ] Container has `2:3` proportions (explicit height or width-only auto-aspect).
- [ ] Game click/selection handlers are wired via `onClick` / `onSelect` + `setSelected()`.
- [ ] Every mounted instance is tracked and cleaned up with `card.destroy()` on screen/modal close.
- [ ] Simultaneous active WebGL instances stay within the browser budget (≤ 8 recommended).
