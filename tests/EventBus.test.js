import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';

test('EventBus subscribes, emits payloads, and unsubscribes cleanly', () => {
  const bus = new EventBus();
  const received = [];

  const unsub = bus.on('battle:unitSpawned', (payload) => received.push(payload));
  bus.emit('battle:unitSpawned', { id: 'u1' });
  assert.equal(received.length, 1);
  assert.equal(received[0].id, 'u1');
  assert.equal(bus.listenerCount('battle:unitSpawned'), 1);

  unsub();
  bus.emit('battle:unitSpawned', { id: 'u2' });
  assert.equal(received.length, 1);
  assert.equal(bus.listenerCount('battle:unitSpawned'), 0);
});

test('EventBus once fires only a single time', () => {
  const bus = new EventBus();
  let count = 0;

  bus.once('save:written', () => {
    count += 1;
  });

  bus.emit('save:written');
  bus.emit('save:written');
  assert.equal(count, 1);
});

test('EventBus isolates listener exceptions so remaining listeners execute', () => {
  const bus = new EventBus();
  let secondCalled = false;
  const origError = console.error;
  console.error = () => {};

  try {
    bus.on('test:error', () => {
      throw new Error('Intentional failure');
    });
    bus.on('test:error', () => {
      secondCalled = true;
    });

    bus.emit('test:error');
    assert.equal(secondCalled, true);
  } finally {
    console.error = origError;
  }
});
