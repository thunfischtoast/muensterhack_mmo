/**
 * Integration test: WebSocket clients handshake, join, move, ride and chat through a real server instance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server.js';
import { RACK_SLOTS } from '../public/map.js';

/** Connect a client whose `next(pred)` resolves with the first (buffered or future) message matching `pred`. */
function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  ws.next = (pred) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ pred, resolve }));
  };
  ws.sendJson = (msg) => ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

test('join, move and chat are relayed between players', { timeout: 5000 }, async () => {
  const server = await startServer(0);
  const a = await connect(server.port);
  const b = await connect(server.port);
  const stale = await connect(server.port);
  try {
    const { version } = await a.next((m) => m.t === 'hello');
    assert.match(version, /^[0-9a-f]{12}$/);

    // A join from an outdated client (wrong or missing version) is refused.
    stale.sendJson({ t: 'join', name: 'Old' });
    await new Promise((resolve) => stale.once('close', resolve));

    a.sendJson({ t: 'chat', text: 'before join is ignored' });
    a.sendJson({ t: 'join', version, name: '  Abcdefghijklmnopqrstuvwxyz  ' });
    const welcomeA = await a.next((m) => m.t === 'welcome');
    const me = welcomeA.players.find((p) => p.id === welcomeA.id);
    assert.equal(me.name, 'Abcdefghijklmnop');

    b.sendJson({ t: 'join', version, name: '   ' });
    const welcomeB = await b.next((m) => m.t === 'welcome');
    assert.equal(welcomeB.players.length, 2);
    const joined = await a.next((m) => m.t === 'join');
    assert.equal(joined.player.name, 'Gast');
    assert.equal(joined.player.id, welcomeB.id);

    a.sendJson({ t: 'move', x: 100, y: -50, dir: 'left', moving: true, bike: 3 });
    const state = await b.next((m) => m.t === 'state' && m.players.some((p) => p.id === welcomeA.id && p.x === 100));
    const moved = state.players.find((p) => p.id === welcomeA.id);
    assert.deepEqual(moved, { id: welcomeA.id, x: 100, y: 0, dir: 'left', moving: true, bike: 3 });

    a.sendJson({ t: 'move', x: 110, y: 0, dir: 'left', moving: true, bike: 99 });
    const walked = await b.next((m) => m.t === 'state' && m.players.some((p) => p.id === welcomeA.id && p.x === 110));
    assert.equal(walked.players.find((p) => p.id === welcomeA.id).bike, null);

    a.send('not json');
    a.sendJson({ t: 'chat', text: `  ${'x'.repeat(200)}  ` });
    const chat = await b.next((m) => m.t === 'chat');
    assert.equal(chat.id, welcomeA.id);
    assert.equal(chat.text, 'x'.repeat(120));

    // An oversized frame must only drop that client, not crash the server.
    b.on('error', () => {});
    b.send('x'.repeat(5000));
    const left = await a.next((m) => m.t === 'leave');
    assert.equal(left.id, welcomeB.id);
    await new Promise((resolve) => setTimeout(resolve, 600)); // chat cooldown
    a.sendJson({ t: 'chat', text: 'still alive' });
    await a.next((m) => m.t === 'chat' && m.text === 'still alive');
  } finally {
    a.close();
    b.close();
    stale.close();
    await server.close();
  }
});

test('Leezen-Chaos: pick up only nearby, park, drop on disconnect, clear the round', { timeout: 5000 }, async () => {
  const server = await startServer(0);
  const a = await connect(server.port);
  const b = await connect(server.port);
  try {
    const { version } = await a.next((m) => m.t === 'hello');
    a.sendJson({ t: 'join', version, name: 'A' });
    const { leezen } = await a.next((m) => m.t === 'welcome');
    assert.equal(leezen.loose.length, RACK_SLOTS.length);
    const [first, second, ...rest] = leezen.loose;
    const moveTo = (ws, { x, y }) => ws.sendJson({ t: 'move', x, y, dir: 'down', moving: false });
    const nextLeezen = () => a.next((m) => m.t === 'leezen');

    // Far away from `second`: refused. Next to `first`: carried.
    moveTo(a, { x: second.x + 100, y: second.y + 100 });
    a.sendJson({ t: 'pickup', id: second.id });
    moveTo(a, first);
    a.sendJson({ t: 'pickup', id: first.id });
    let state = await nextLeezen();
    assert.equal(state.loose.find((l) => l.id === first.id).carriedBy !== null, true);
    assert.equal(state.loose.find((l) => l.id === second.id).carriedBy, null);

    moveTo(a, RACK_SLOTS[0]);
    a.sendJson({ t: 'park', slot: 0 });
    state = await nextLeezen();
    assert.equal(state.slots[0], first.color);
    assert.equal(state.loose.length, RACK_SLOTS.length - 1);

    // A carrier who disconnects drops the bike where they stood.
    const { version: vb } = await b.next((m) => m.t === 'hello');
    b.sendJson({ t: 'join', version: vb, name: 'B' });
    await b.next((m) => m.t === 'welcome');
    moveTo(b, second);
    b.sendJson({ t: 'pickup', id: second.id });
    await nextLeezen();
    b.close();
    state = await nextLeezen();
    assert.equal(state.loose.find((l) => l.id === second.id).carriedBy, null);

    for (const [i, bike] of [second, ...rest].entries()) {
      moveTo(a, bike);
      a.sendJson({ t: 'pickup', id: bike.id });
      await nextLeezen();
      moveTo(a, RACK_SLOTS[i + 1]);
      a.sendJson({ t: 'park', slot: i + 1 });
      state = await nextLeezen();
    }
    assert.equal(state.cleared, true);
    assert.equal(state.slots.every((c) => c !== null), true);
  } finally {
    a.close();
    b.close();
    await server.close();
  }
});
