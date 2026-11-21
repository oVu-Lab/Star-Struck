import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenManager } from '../src/core/ScreenManager.js';
import { EventBus } from '../src/core/EventBus.js';

function createMockViewport() {
  const classes = new Set();
  return {
    innerHTML: '',
    classList: {
      toggle(cls, force) {
        if (force) classes.add(cls);
        else classes.delete(cls);
      },
      contains(cls) {
        return classes.has(cls);
      },
    },
  };
}

test('ScreenManager mounts, unmounts, tracks history, and emits transitions across all 7 screens', () => {
  const bus = new EventBus();
  const viewport = createMockViewport();
  const manager = new ScreenManager({ viewportEl: viewport, eventBus: bus });
  const lifecycle = [];
  const events = [];

  bus.on('screen:changed', (ev) => events.push(`${ev.from}->${ev.to}`));

  const ids = ['home', 'battle', 'heroes', 'formation', 'summon', 'inventory', 'settings'];
  for (const id of ids) {
    manager.register(id, {
      mount() {
        lifecycle.push(`mount:${id}`);
      },
      unmount() {
        lifecycle.push(`unmount:${id}`);
      },
    });
  }

  for (const id of ids) {
    assert.equal(manager.navigate(id), true);
    assert.equal(manager.getActiveScreenId(), id);
  }

  assert.equal(viewport.classList.contains('is-battle-mode'), false);
  manager.navigate('battle');
  assert.equal(viewport.classList.contains('is-battle-mode'), true);

  assert.equal(lifecycle.includes('unmount:home'), true);
  assert.equal(lifecycle.includes('mount:settings'), true);
  assert.equal(events[0], 'null->home');

  manager.back();
  assert.equal(manager.getActiveScreenId(), 'settings');
});

test('ScreenManager rejects unknown screens gracefully without crashing', () => {
  const viewport = createMockViewport();
  const manager = new ScreenManager({ viewportEl: viewport });
  manager.register('home', { mount() {}, unmount() {} });
  manager.navigate('home');

  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(manager.navigate('nonexistent'), false);
    assert.equal(manager.getActiveScreenId(), 'home');
  } finally {
    console.warn = origWarn;
  }
});
