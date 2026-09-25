/**
 * Integration test: WebSocket clients handshake, join, move, ride and chat through a real server instance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server.js';

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
