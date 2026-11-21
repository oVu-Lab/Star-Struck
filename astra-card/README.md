# AstraCard — Star Struck Collectible Commander Card Component

Reusable, framework-free Vanilla ES Module WebGL component preserving the original **Astra** holographic card design (3D relief ray-marching, foil speculars, brushed metallic edge stack, glass sweep, 4-point star flares, micro-sparkles, additive floating dust particles, celestial title lettering, ambient glow, and dynamic floor shadow).

> **For AI Coding Agents & Integrators:** See **[INTEGRATION.md](./INTEGRATION.md)** for the complete Star Struck integration specification. Unless a task explicitly requests animated cards, always use **`ASTRA_CARD_STATIC_OPTIONS`** for collectible cards displayed in normal game UI.

---

## Directory Structure

```text
astra-card/
├── AstraCard.js       # Reusable ES Module component (Three.js r128 WebGL)
├── AstraCard.css      # Scoped component styles (.astra-card*)
├── demo.html          # Standalone static-mode verification page
├── README.md          # Usage instructions & component API
├── INTEGRATION.md     # Standardized integration guide for AI coding agents
└── assets/
    ├── bg.jpeg        # 1152×1744 celestial astrolabe background (RGB)
    ├── character.png  # 1152×1744 Astra character art (RGBA with alpha)
    ├── frame.jpeg     # 1152×1744 ornate gold frame (RGB, auto-keyed)
    └── depth.jpeg     # 1152×1744 grayscale height/depth map (RGB)
```

---

## Quick Start (Verify Locally)

ES Modules and WebGL image textures require serving over HTTP (browsers block module imports and cross-origin canvas reads under `file://`).

```bash
cd astra-card
python3 -m http.server 8000
```

Then open `http://localhost:8000/demo.html`.

---

## Static Card Integration (Recommended for Game UI)

### What Static Mode Does
Static mode locks the **card body itself** at its neutral 0° front-facing pose (`rx = 0`, `ry = 0`, `rz = 0`, `fy = 0`)—no 3D rotation, no sway, no floating bob, and no pointer tilt—while **keeping all internal holographic material effects dynamically animated** (sparkles/glitter, flowing dust layers, 4-point star flares, diagonal glass sweep, moving spotlight, foil shimmer, and foreground/background floating particles). Click, selection, hover, and keyboard callbacks remain fully functional.

### Why These Settings Are Used
`ASTRA_CARD_STATIC_OPTIONS` is a frozen exported preset containing:

```js
export const ASTRA_CARD_STATIC_OPTIONS = Object.freeze({
  autoplay: false,
  interactive: false,
  tilt: 0,
  animateEffects: true
});
```

- **`autoplay: false`** — Stops the card body's 3D figure-8 sway and floating motion.
- **`interactive: false`** — Disables pointer hover and drag 3D tilt input so moving the cursor across a roster or grid never rotates the card.
- **`tilt: 0`** — Zeroes the tilt angle multiplier as a hard guarantee against any rotational offset.
- **`animateEffects: true`** — Keeps the shader phase (`uP`) advancing continuously so sparkles, flowing dust, 4-point star flares, glass sweep, spotlight, and floating particles remain alive. *(Pass `animateEffects: false` or call `card.pause()` only if you explicitly want a completely frozen frame.)*

### Recommended Import & Initialization (Copy-Paste Ready)

```js
import { AstraCard, ASTRA_CARD_STATIC_OPTIONS } from './AstraCard.js';

const container = document.getElementById('commander-card-slot');

// Mount a completely stationary AstraCard in normal game UI
const card = new AstraCard(container, {
  ...ASTRA_CARD_STATIC_OPTIONS,
  // Optional: set studio: true only if you want the dark radial card backdrop
  studio: false,
  // Optional: override default asset paths if assets live elsewhere in your app
  assets: {
    bg: './assets/bg.jpeg',
    character: './assets/character.png',
    frame: './assets/frame.jpeg',
    depth: './assets/depth.jpeg'
  },
  // Pass your game's Commander data object (arbitrary fields are preserved)
  data: {
    id: 'commander-astra',
    name: 'ASTRA',
    rarity: 'SSR',
    level: 80,
    stars: 5
  },
  // Click callback (fires on primary click/tap or Enter/Space when selectable)
  onClick: (data, instance) => {
    console.log('Clicked Commander:', data.id);
  },
  // Selection callback (controlled: call setSelected() to reflect game state)
  onSelect: (data, instance) => {
    const nextSelected = !instance.isSelected();
    instance.setSelected(nextSelected);
    console.log('Selected state:', data.id, nextSelected);
  },
  onReady: (data) => {
    console.log('Card ready:', data.id);
  },
  onError: (err) => {
    console.error('AstraCard failed to initialize:', err);
  }
});

// Update Commander data later without recreating the WebGL context:
// card.update({ name: 'ASTRA', level: 85 });

// Clean up when the screen, modal, or drawer is closed:
function onScreenClose() {
  card.destroy();
}
```

> **Container sizing:** If the host `container` has an explicit height, `.astra-card` fills `100% × 100%`. If the host container has no height (height `< 2px`), `.astra-card--aspect` is added automatically to preserve a `2 / 3` card aspect ratio.

---

## Animated Showcase Mode (Optional)

Default constructor options (`ASTRA_CARD_DEFAULTS`) keep animated mode enabled (`autoplay: true`, `interactive: true`, `tilt: 1`). Omit `...ASTRA_CARD_STATIC_OPTIONS` only when a screen explicitly requires animated showcase cards (for example, a summon reveal or dedicated hero inspection view):

```js
import { AstraCard } from './AstraCard.js';

const showcaseCard = new AstraCard(document.getElementById('showcase-slot'), {
  studio: true,
  data: { id: 'commander-astra', name: 'ASTRA' }
});
```

---

## Component API

### Constructor

```js
new AstraCard(container, options?)
```

- **`container`** (`HTMLElement`, required): DOM element into which `.astra-card` will be mounted.
- **`options`** (`object`, optional):

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `data` | `object` | `{ name: 'ASTRA' }` | Commander/card data payload (see **Data Fields** below). |
| `assets` | `object` | `./assets/*` | Default asset URL overrides (`{ bg, character, frame, depth }`). |
| `frame` | `object` | Astra default | `{ crop: [x, y, w, h], clear: [[x0, y0, x1, y1], ...] }` frame mask/crop config. |
| `tilt` | `number` | `1` | Tilt angle multiplier (`0` in `ASTRA_CARD_STATIC_OPTIONS`). |
| `autoplay` | `boolean` | `true` | Continuous 3D figure-8 card sway and floating bob (`false` in `ASTRA_CARD_STATIC_OPTIONS`). Respects `prefers-reduced-motion`. |
| `animateEffects` | `boolean` | `true` | Keeps shader sparkles, flowing dust, star flares, glass sweep, spotlight, and floating particles animating even when the card body is stationary (`true` in `ASTRA_CARD_STATIC_OPTIONS`). Respects `prefers-reduced-motion`. |
| `interactive` | `boolean` | `true` | Pointer hover/drag 3D tilt response (`false` in `ASTRA_CARD_STATIC_OPTIONS`). |
| `selectable` | `boolean` | `true` | Enables `role="button"`, keyboard focus (`Enter`/`Space`), and `onSelect` / `astra:select`. |
| `selected` | `boolean` | `false` | Initial controlled selection state (`.is-selected`). |
| `studio` | `boolean` | `false` | Adds the dark radial celestial studio backdrop (`.astra-card--studio`). Leave `false` for transparent embedding in game UI. |
| `glow` | `string \| null` | `null` | Optional CSS color override for `--astra-glow` (default `#c9a24a`). |
| `css` | `boolean` | `true` | Auto-injects `AstraCard.css` once if not already linked in `<head>`. |
| `fontUrl` | `string \| null` | Cinzel Decorative | Stylesheet URL for title lettering font. Pass `null` when self-hosting fonts offline. |
| `onReady` | `(data, card) => void` | `undefined` | Called once WebGL scene and textures finish initializing. |
| `onClick` | `(data, card) => void` | `undefined` | Called on primary click/tap (drag `< 8px`, duration `< 600ms`) or `Enter`/`Space` when selectable. |
| `onSelect` | `(data, card) => void` | `undefined` | Called on click/tap or keyboard activation when `selectable: true`. Selection state is controlled via `setSelected()`. |
| `onHoverStart` | `(data, card) => void` | `undefined` | Called on `pointerenter`. |
| `onHoverEnd` | `(data, card) => void` | `undefined` | Called on `pointerleave`. |
| `onError` | `(error, card) => void` | `undefined` | Called if asset loading or WebGL initialization fails. |

### Data Fields (`options.data` & `card.update(nextData)`)

All custom Star Struck fields (e.g., `id`, `rarity`, `level`, `stars`, `element`, `role`, `power`) are preserved verbatim and returned by `getData()`, callbacks, and DOM events.

| Field | Type | Required | Effect on Component |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Optional (defaults to `'ASTRA'`) | Rendered as holographic gold lettering in the top title band. Auto-scales down if wider than 560px; pass `''` to omit lettering. |
| `assets` | `{ bg?, character?, frame?, depth? }` | Optional | Overrides artwork URLs for this instance (takes precedence over `options.assets` and defaults). |
| `glow` | `string` | Optional | Overrides the ambient aura color (`--astra-glow`) for this card. |
| `id` / custom fields | `any` | Optional | Stored and echoed in `getData()`, callbacks, and `CustomEvent.detail.data`. |

### Instance Methods & Getters

| Member | Signature / Type | Description |
| :--- | :--- | :--- |
| `card.update(next)` | `(next: object) => void` | Merges new data. Redraws title texture only if `name` changed; reloads GPU textures only if resolved asset URLs changed. |
| `card.setOptions(next)` | `(next: object) => void` | Updates runtime options (`tilt`, `autoplay`, `interactive`, `selectable`, `selected`, `studio`, `glow`, callbacks) without recreating WebGL. |
| `card.setSelected(on)` | `(on: boolean) => void` | Controlled selection toggle (updates `.is-selected` and `aria-pressed`). |
| `card.isSelected()` | `() => boolean` | Returns current selection state. |
| `card.getData()` | `() => object` | Returns a shallow copy of the card's current data object. |
| `card.pause()` | `() => void` | Pauses both WebGL rendering and CSS glow animation without losing animation phase. |
| `card.resume()` | `() => void` | Resumes rendering seamlessly from the paused phase. |
| `card.resize()` | `() => void` | Manually re-syncs canvas size and camera aspect (useful after CSS modal/tab transitions). |
| `card.whenReady()` | `() => Promise<AstraCard>` | Resolves with `card` when ready; rejects if initialization fails or the card is destroyed first. |
| `card.destroy()` | `() => void` | Stops RAF, disconnects observers, removes DOM & `window`/`document` listeners, disposes WebGL geometries/materials/textures/context, and removes the root element. Idempotent (safe to call twice). |
| `card.element` | `HTMLElement` (getter) | Root `.astra-card` element. |
| `card.ready` | `boolean` (getter) | `true` after WebGL initialization completes. |
| `card.selected` | `boolean` (getter) | Current controlled selection state. |
| `card.paused` | `boolean` (getter) | `true` while paused via `pause()`. |
| `card.hovering` | `boolean` (getter) | `true` while pointer is over the card. |
| `card.destroyed` | `boolean` (getter) | `true` after `destroy()` has been called. |

### Static Methods & Exports

- `AstraCard` (named & default export) — Component class.
- `ASTRA_CARD_STATIC_OPTIONS` — Frozen static-pose preset (`{ autoplay: false, interactive: false, tilt: 0, animateEffects: true }`) recommended for normal game UI (0° stationary card body + live sparkles/lighting).
- `ASTRA_CARD_DEFAULTS` — Frozen default options object (preserves animated mode defaults).
- `AstraCard.clearCache()` — Clears the shared module-level pre-processed canvas cache (~40 MB per unique asset set). Existing live instances remain unaffected.

### Bubbling DOM Events

All events bubble from `card.element` so parent game containers can use event delegation:

- `astra:ready` — `detail: { data, card, selected }`
- `astra:click` — `detail: { data, card, selected, originalEvent }`
- `astra:select` — `detail: { data, card, selected, originalEvent }`
- `astra:hoverstart` — `detail: { data, card, selected }`
- `astra:hoverend` — `detail: { data, card, selected }`
- `astra:error` — `detail: { data, card, selected, error }`

---

## CSS Custom Properties & Scoped Classes

Override variables on any wrapper element or directly on `card.element`:

- `--astra-glow` (default `#c9a24a`): ambient aura color.
- `--astra-selected-color` (default `#f6dc8b`): selection ring & focus outline color.
- `--astra-a`, `--astra-b`: studio backdrop radial gradient colors (auto-sampled from `bg`).

Scoped state classes managed by the component:

- `.astra-card--loading`, `.astra-card--ready`, `.astra-card--error`
- `.astra-card--studio`, `.astra-card--aspect`, `.astra-card--noninteractive`
- `.astra-card--hovered`, `.astra-card--paused`, `.is-selected`

---

## Integration & Production Notes

1. **Three.js Dependency (Offline / Bundled Builds):**
   `AstraCard.js` imports Three.js r128 from jsDelivr (`https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js`) so it works with zero build step. For offline/production builds in Star Struck, download `three.module.js` (r128) into your project and change line 3 of `AstraCard.js` (or use an HTML `<script type="importmap">`).
2. **Font Hosting:**
   By default, `Cinzel Decorative` (700) is loaded from Google Fonts. If Star Struck self-hosts fonts, load the font via your app's CSS and pass `fontUrl: null`.
3. **WebGL Context Budget on Large Grids:**
   Each live `AstraCard` owns one WebGL context; browsers typically allow **8–16 simultaneous active WebGL contexts** per tab. Offscreen cards automatically pause via `IntersectionObserver` and tab-hidden checks, but keeping too many mounted instances in the DOM will still hit the browser context limit—virtualize large grids and always call `destroy()` when screens close.
4. **Asset Fidelity:**
   `assets/character.png` must remain an **RGBA PNG with transparency** (1152×1744) to preserve Astra's soft wing/hair edges and dark interior armor. All four assets in `assets/` are full-resolution 1152×1744 originals extracted losslessly from the source card.
5. **Reusing for Future Commanders:**
   Pass another Commander's `{ bg, character, frame, depth }` in `data.assets` and their name in `data.name` (plus optional `frame: { crop, clear }` if a different frame template is used). Identical asset sets automatically share pre-processed canvases via the module cache.
