import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_CONFIG, AssetManager } from '../src/rendering/AssetManager.js';
import { NonUnitCardPlayVfx } from '../src/rendering/NonUnitCardPlayVfx.js';

const ROOT = process.cwd();
const cardsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const unitsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'units.json'), 'utf8'));

const EXPECTED_UNIT_CARD_EMBLEMS = {
  card_shield_guard: 'card_emblem_shield',
  card_wind_cavalry: 'card_emblem_cavalry',
  card_arcane_archer: 'card_emblem_archer',
  card_field_cleric: 'card_emblem_cleric',
  card_vanguard_breaker: 'card_emblem_breaker',
  card_pulse_skirmisher: 'card_emblem_archer',
  card_solar_pyromancer: 'card_emblem_pyro',
  card_aegis_sentinel: 'card_emblem_shield',
  card_chrono_weaver: 'card_emblem_chrono',
  card_astral_construct: 'card_emblem_construct',
};

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertValidPngRgba512(diskPath) {
  const buf = fs.readFileSync(diskPath);
  assert.ok(buf.length > 5000, `PNG file unexpectedly tiny (${buf.length} bytes): ${diskPath}`);
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), `Invalid PNG signature in ${diskPath}`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `Missing IHDR chunk in ${diskPath}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  assert.equal(width, 512, `Expected 512px width in ${diskPath}, got ${width}`);
  assert.equal(height, 512, `Expected 512px height in ${diskPath}, got ${height}`);
  assert.equal(colorType, 6, `Expected RGBA (colorType 6) in ${diskPath}, got ${colorType}`);
}

function assertValidWebp(diskPath) {
  const buf = fs.readFileSync(diskPath);
  assert.ok(buf.length > 5000, `WebP file unexpectedly tiny (${buf.length} bytes): ${diskPath}`);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `Invalid RIFF header in ${diskPath}`);
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', `Invalid WEBP signature in ${diskPath}`);
}

test('All 18 non-Unit cards have valid, unique AssetManager registrations with redesigned RGBA PNG foregrounds and WebP backgrounds', () => {
  const nonUnitCards = cardsData.cards.filter((c) => c.category !== 'unit');
  assert.equal(nonUnitCards.length, 18, 'Expected exactly 18 non-Unit cards (6 skill, 6 tactic, 6 support)');

  const seenAssetIds = new Set();
  const seenSrcPaths = new Set();
  const seenBgIds = new Set();
  const seenBgPaths = new Set();

  let transparentFgCount = 0;
  let pairedBgCount = 0;

  for (const card of nonUnitCards) {
    assert.ok(
      card.iconAssetId && card.iconAssetId.startsWith('card_art_'),
      `Non-Unit card ${card.id} must use a dedicated card_art_* asset ID (found ${card.iconAssetId})`,
    );
    assert.equal(seenAssetIds.has(card.iconAssetId), false, `Duplicate asset ID ${card.iconAssetId} on card ${card.id}`);
    seenAssetIds.add(card.iconAssetId);

    const entry = ASSETS_CONFIG[card.iconAssetId];
    assert.ok(entry, `Asset ${card.iconAssetId} missing from ASSETS_CONFIG`);
    assert.equal(entry.category, 'card_art');
    assert.deepEqual(entry.canvasSize, { width: 512, height: 512 });

    assert.equal(seenSrcPaths.has(entry.src), false, `Duplicate asset path ${entry.src} on card ${card.id}`);
    seenSrcPaths.add(entry.src);

    const diskPath = path.resolve(ROOT, entry.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(diskPath), `Artwork file missing on disk: ${diskPath}`);

    if (entry.format === 'png') {
      assert.ok(entry.src.startsWith('./assets/cards/art/fg/'), `Redesigned FG must live under assets/cards/art/fg/: ${entry.src}`);
      assertValidPngRgba512(diskPath);
      transparentFgCount += 1;
    } else {
      assert.equal(entry.format, 'webp');
      assertValidWebp(diskPath);
    }

    if (card.backgroundAssetId) {
      assert.ok(
        card.backgroundAssetId.startsWith('card_bg_'),
        `Non-Unit card ${card.id} backgroundAssetId must start with card_bg_ (found ${card.backgroundAssetId})`,
      );
      assert.equal(seenBgIds.has(card.backgroundAssetId), false, `Duplicate BG asset ID ${card.backgroundAssetId}`);
      seenBgIds.add(card.backgroundAssetId);

      const bgEntry = ASSETS_CONFIG[card.backgroundAssetId];
      assert.ok(bgEntry, `Background asset ${card.backgroundAssetId} missing from ASSETS_CONFIG`);
      assert.equal(bgEntry.category, 'card_bg');
      assert.equal(bgEntry.format, 'webp');
      assert.ok(bgEntry.src.startsWith('./assets/cards/art/bg/'), `BG must live under assets/cards/art/bg/: ${bgEntry.src}`);
      assert.deepEqual(bgEntry.canvasSize, { width: 512, height: 512 });
      assert.equal(seenBgPaths.has(bgEntry.src), false, `Duplicate BG path ${bgEntry.src}`);
      seenBgPaths.add(bgEntry.src);

      const bgDiskPath = path.resolve(ROOT, bgEntry.src.replace(/^\.\//, ''));
      assert.ok(fs.existsSync(bgDiskPath), `Background file missing on disk: ${bgDiskPath}`);
      assertValidWebp(bgDiskPath);
      pairedBgCount += 1;
    }
  }

  assert.equal(transparentFgCount, 17, 'Expected 17 redesigned RGBA PNG foregrounds (1 pending quota reset)');
  assert.equal(pairedBgCount, 15, 'Expected 15 fully paired two-layer non-Unit cards');

  // Verify Overclock Core backdrop is also valid on disk and registered for future FG pairing
  const ocBg = ASSETS_CONFIG.card_bg_overclock_core;
  assert.ok(ocBg, 'card_bg_overclock_core should be registered');
  assertValidWebp(path.resolve(ROOT, ocBg.src.replace(/^\.\//, '')));
});

test('No depth maps exist for non-Unit cards', () => {
  const depthKeys = Object.keys(ASSETS_CONFIG).filter(
    (k) => k.startsWith('card_') && k.toLowerCase().includes('depth'),
  );
  assert.equal(depthKeys.length, 0, `Unexpected non-Unit depth map keys: ${depthKeys.join(', ')}`);

  const artDir = path.join(ROOT, 'assets', 'cards', 'art');
  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  const depthFiles = walk(artDir).filter((f) => path.basename(f).toLowerCase().includes('depth'));
  assert.equal(depthFiles.length, 0, `Unexpected depth files in assets/cards/art: ${depthFiles.join(', ')}`);
});

test('All 10 Unit cards and their unit sprites remain completely unchanged', () => {
  const unitCards = cardsData.cards.filter((c) => c.category === 'unit');
  assert.equal(unitCards.length, 10, 'Expected exactly 10 Unit cards');

  for (const card of unitCards) {
    assert.equal(
      card.iconAssetId,
      EXPECTED_UNIT_CARD_EMBLEMS[card.id],
      `Unit card ${card.id} emblem unexpectedly modified`,
    );
    assert.equal(card.backgroundAssetId, undefined, `Unit card ${card.id} must not have backgroundAssetId`);
    const entry = ASSETS_CONFIG[card.iconAssetId];
    assert.ok(entry, `Unit card emblem ${card.iconAssetId} missing`);
    const diskPath = path.resolve(ROOT, entry.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(diskPath), `Unit emblem SVG missing: ${diskPath}`);
  }

  for (const unit of unitsData.units) {
    const entry = ASSETS_CONFIG[unit.spriteAssetId];
    assert.ok(entry, `Unit sprite ${unit.spriteAssetId} missing`);
    const diskPath = path.resolve(ROOT, entry.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(diskPath), `Unit sprite missing: ${diskPath}`);
  }
});

test('NonUnitCardPlayVfx binds both backgroundAssetId and iconAssetId for layered cards', () => {
  const bound = [];
  const mockAssetManager = {
    getConfig(id) {
      return ASSETS_CONFIG[id] || null;
    },
    bindImageElement(el, assetId) {
      bound.push({ el, assetId });
    },
  };

  const origDoc = globalThis.document;
  try {
    const makeEl = () => {
      let inner = '';
      const bgStub = { className: 'card-play-ghost__bg' };
      const imgStub = { className: 'card-play-ghost__img' };
      return {
        className: '',
        children: [],
        style: { setProperty() {} },
        setAttribute() {},
        get innerHTML() { return inner; },
        set innerHTML(v) { inner = v; },
        querySelector(sel) {
          if (sel === '.card-play-ghost__bg') return bgStub;
          if (sel === '.card-play-ghost__img') return imgStub;
          return null;
        },
        appendChild(child) { this.children.push(child); },
        remove() {},
      };
    };
    globalThis.document = { createElement: () => makeEl() };
    const ghostLayer = makeEl();
    const vfx = new NonUnitCardPlayVfx(null, ghostLayer, { assetManager: mockAssetManager });
    vfx._spawnGhostCard({
      card: {
        cardId: 'card_skill_astral_nova',
        category: 'skill',
        name: 'Astral Nova',
        cost: 22,
        iconAssetId: 'card_art_astral_nova',
        backgroundAssetId: 'card_bg_astral_nova',
      },
      profile: {
        palette: { primary: '#38bdf8', secondary: '#fb923c', accent: '#f5d37a', core: '#fff' },
        playMotion: { scalePeak: 1.15, tiltX: 12, tiltZ: -3, sweepAngle: 120 },
      },
      tier: 1,
      left: 0,
      top: 0,
      width: 102,
      height: 150,
      liftY: -60,
      reduced: true,
    });
    vfx.stop();
  } finally {
    globalThis.document = origDoc;
  }

  assert.equal(bound.length, 2);
  assert.equal(bound[0].assetId, 'card_bg_astral_nova');
  assert.equal(bound[1].assetId, 'card_art_astral_nova');
});

test('AssetManager gracefully falls back to inline SVG if a card_art or card_bg asset fails to load', async () => {
  const manager = new AssetManager({
    imageLoader: async () => {
      throw new Error('Simulated missing file');
    },
  });
  const fgRes = await manager.loadAsset('card_art_astral_nova');
  assert.equal(fgRes.status, 'fallback');
  assert.equal(fgRes.isFallback, true);
  assert.ok(fgRes.src.startsWith('data:image/svg+xml'));

  const bgRes = await manager.loadAsset('card_bg_astral_nova');
  assert.equal(bgRes.status, 'fallback');
  assert.equal(bgRes.isFallback, true);
  assert.ok(bgRes.src.startsWith('data:image/svg+xml'));
});
