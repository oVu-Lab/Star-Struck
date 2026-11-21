import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssetManager,
  ASSETS_CONFIG,
  PORTRAIT_CANVAS,
  createFallbackDataUri,
} from '../src/rendering/AssetManager.js';
import { EventBus } from '../src/core/EventBus.js';

test('AssetManager portrait entries use 1152x1744 canvas metadata', () => {
  const portraitEntries = Object.values(ASSETS_CONFIG).filter(
    (entry) => entry.category === 'hero_portrait',
  );
  assert.ok(portraitEntries.length >= 4);
  for (const entry of portraitEntries) {
    assert.deepEqual(entry.canvasSize, PORTRAIT_CANVAS);
  }
});

test('AssetManager loads registered assets via injected loader and tracks status', async () => {
  const bus = new EventBus();
  const manager = new AssetManager({
    eventBus: bus,
    imageLoader: async (src) => ({ src, complete: true, naturalWidth: 128 }),
  });

  const rec = await manager.loadAsset('hero_portrait_astra');
  assert.equal(rec.status, 'loaded');
  assert.equal(rec.isFallback, false);
  assert.equal(manager.getState('hero_portrait_astra'), 'loaded');
});

test('AssetManager provides inline SVG fallback on load failure and unknown IDs', async () => {
  const bus = new EventBus();
  const fallbacks = [];
  bus.on('asset:fallback', (ev) => fallbacks.push(ev.assetId));

  const manager = new AssetManager({
    eventBus: bus,
    imageLoader: async () => {
      throw new Error('404 Not Found');
    },
  });

  const failed = await manager.loadAsset('hero_portrait_kael');
  assert.equal(failed.status, 'fallback');
  assert.equal(failed.isFallback, true);
  assert.ok(failed.src.startsWith('data:image/svg+xml'));

  const unknown = await manager.loadAsset('totally_unknown_asset');
  assert.equal(unknown.status, 'fallback');
  assert.equal(unknown.isFallback, true);
  assert.ok(unknown.src.startsWith('data:image/svg+xml'));

  assert.deepEqual(fallbacks, ['hero_portrait_kael', 'totally_unknown_asset']);
  assert.ok(createFallbackDataUri('sample').startsWith('data:image/svg+xml'));
});
