/**
 * Game server: serves the static client from public/ over HTTP and relays
 * player positions and chat messages over a WebSocket on the same port.
 *
 * Movement is client-authoritative; the server only sanitizes and clamps input.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  TILE, WORLD_W, WORLD_H, GROUND, SPAWN, LOOK_COUNT, BIKE_COLOR_COUNT, RACK_SLOTS, isSolid,
} from './public/map.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};
const DIRS = new Set(['down', 'up', 'left', 'right']);
const MAX_NAME = 16;
const MAX_CHAT = 120;
const CHAT_COOLDOWN_MS = 500;
const WAVE_COOLDOWN_MS = 1000;
const HIGH_FIVE_RANGE = 20; // pixels between feet for a wave to become a high five
const LEEZEN_REACH = 32; // pixels; a bit more generous than the client's button range to absorb latency
const LEEZEN_RESET_MS = 60000;
const TICK_MS = 100;
const HEARTBEAT_MS = 30000;
const MAX_PAYLOAD = 1024;

/**
 * Hash of all client files. Clients get it on connect and reload when it differs from the
 * one they started with, so a deploy never leaves an outdated client talking to a new server.
 */
const VERSION = (() => {
  const hash = crypto.createHash('sha1');
  const files = readdirSync(PUBLIC_DIR, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => path.join(f.parentPath, f.name))
    .sort();
  for (const file of files) hash.update(path.relative(PUBLIC_DIR, file)).update(readFileSync(file));
  return hash.digest('hex').slice(0, 12);
})();

/** Serve a file from public/, refusing anything that resolves outside of it. */
async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

/** Remove control characters, trim and cut to `max` code points. */
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return [...text].slice(0, max).join('').trim();
}

/** Clamp a number into [min, max] and round to one decimal. */
function clamp(value, min, max) {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

/** Pick a random walkable tile in the spawn area and return its center (feet position) in pixels. */
function spawnPoint() {
  for (let i = 0; i < 50; i++) {
    const tx = SPAWN.x + Math.floor(Math.random() * SPAWN.w);
    const ty = SPAWN.y + Math.floor(Math.random() * SPAWN.h);
    if (!isSolid(tx, ty)) return { x: tx * TILE + TILE / 2, y: ty * TILE + 12 };
  }
  return { x: (SPAWN.x + 0.5) * TILE, y: SPAWN.y * TILE + 12 };
}

/** Bike color index if valid, otherwise null (walking). */
function cleanBike(value) {
  return Number.isInteger(value) && value >= 0 && value < BIKE_COLOR_COUNT ? value : null;
}

/** Public view of a player as sent in welcome/join messages. */
function publicPlayer(p) {
  return { id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, moving: p.moving, bike: p.bike };
}

/**
 * Start the HTTP + WebSocket server.
 * @param {number} port Port to listen on; 0 picks a free one.
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
export function startServer(port = 3000) {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
  const players = new Map();
  let nextId = 1;
  let dirty = false;

  // Leezen-Chaos: loose bikes on the plaza that players carry into the rack slots.
  const leezen = { round: 0, slots: [], loose: [], clearedAt: 0 };
  let nextBikeId = 1;
  let resetTimer = null;

  /** Start a new round: empty rack, one knocked-over bike per slot on random free plaza tiles. */
  function scatterLeezen() {
    const tiles = [];
    for (let ty = 6; ty < 15; ty++) {
      for (let tx = 0; tx < GROUND[ty].length; tx++) if (GROUND[ty][tx] === 'c' && !isSolid(tx, ty)) tiles.push([tx, ty]);
    }
    leezen.round++;
    leezen.slots = RACK_SLOTS.map(() => null);
    leezen.loose = RACK_SLOTS.map(() => {
      const [tx, ty] = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
      const color = Math.floor(Math.random() * BIKE_COLOR_COUNT);
      return { id: nextBikeId++, x: tx * TILE + TILE / 2, y: ty * TILE + 12, color, carriedBy: null };
    });
    leezen.clearedAt = 0;
  }

  /** Game state as sent to clients; resetIn avoids depending on synchronized clocks. */
  function leezenState() {
    const resetIn = leezen.clearedAt ? Math.max(0, leezen.clearedAt + LEEZEN_RESET_MS - Date.now()) : 0;
    return { round: leezen.round, slots: leezen.slots, loose: leezen.loose, cleared: leezen.clearedAt > 0, resetIn };
  }

  /** Put a carried bike back on the ground where its carrier stands. */
  function dropBike(p) {
    const bike = leezen.loose.find((b) => b.carriedBy === p.id);
    if (!bike) return false;
    bike.carriedBy = null;
    bike.x = p.x;
    bike.y = p.y;
    return true;
  }

  scatterLeezen();

  /** Send a message to all joined players, optionally skipping one socket. */
  function broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client !== except && client.player && client.readyState === client.OPEN) client.send(data);
    }
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // Oversized or malformed frames emit 'error'; unhandled, it would crash the whole process.
    ws.on('error', () => ws.terminate());
    ws.send(JSON.stringify({ t: 'hello', version: VERSION }));

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const p = ws.player;

      if (!p) {
        if (msg.t !== 'join') return;
        // Outdated clients (including ones from before the version check) must reload first.
        if (msg.version !== VERSION) {
          ws.close();
          return;
        }
        // A reconnecting client passes its previous look and position so it doesn't change or jump.
        const rejoin = Number.isFinite(msg.x) && Number.isFinite(msg.y);
        const player = {
          id: nextId++,
          name: cleanText(msg.name, MAX_NAME) || 'Gast',
          look: Number.isInteger(msg.look) && msg.look >= 0 && msg.look < LOOK_COUNT
            ? msg.look : Math.floor(Math.random() * LOOK_COUNT),
          ...(rejoin ? { x: clamp(msg.x, 0, WORLD_W), y: clamp(msg.y, 0, WORLD_H) } : spawnPoint()),
          dir: 'down',
          moving: false,
          bike: null,
          lastChat: 0,
          lastWave: 0,
        };
        ws.player = player;
        players.set(player.id, player);
        ws.send(JSON.stringify({
          t: 'welcome', id: player.id, players: [...players.values()].map(publicPlayer), leezen: leezenState(),
        }));
        broadcast({ t: 'join', player: publicPlayer(player) }, ws);
        return;
      }

      if (msg.t === 'move') {
        if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
        p.x = clamp(msg.x, 0, WORLD_W);
        p.y = clamp(msg.y, 0, WORLD_H);
        p.dir = DIRS.has(msg.dir) ? msg.dir : 'down';
        p.moving = msg.moving === true;
        p.bike = cleanBike(msg.bike);
        dirty = true;
      } else if (msg.t === 'chat') {
        const now = Date.now();
        if (now - p.lastChat < CHAT_COOLDOWN_MS) return;
        const text = cleanText(msg.text, MAX_CHAT);
        if (!text) return;
        p.lastChat = now;
        broadcast({ t: 'chat', id: p.id, text });
      } else if (msg.t === 'wave') {
        const now = Date.now();
        if (now - p.lastWave < WAVE_COOLDOWN_MS) return;
        p.lastWave = now;
        let partner = null;
        let best = HIGH_FIVE_RANGE;
        for (const other of players.values()) {
          const d = Math.hypot(other.x - p.x, other.y - p.y);
          if (other !== p && d <= best) {
            partner = other;
            best = d;
          }
        }
        broadcast({ t: 'wave', id: p.id, with: partner ? partner.id : null });
      } else if (msg.t === 'pickup') {
        const bike = leezen.loose.find((b) => b.id === msg.id);
        const carrying = leezen.loose.some((b) => b.carriedBy === p.id);
        if (!bike || bike.carriedBy !== null || carrying || Math.hypot(bike.x - p.x, bike.y - p.y) > LEEZEN_REACH) return;
        bike.carriedBy = p.id;
        broadcast({ t: 'leezen', ...leezenState() });
      } else if (msg.t === 'park') {
        const bike = leezen.loose.find((b) => b.carriedBy === p.id);
        const slot = Number.isInteger(msg.slot) ? RACK_SLOTS[msg.slot] : undefined;
        if (!bike || !slot || leezen.slots[msg.slot] !== null || Math.hypot(slot.x - p.x, slot.y - p.y) > LEEZEN_REACH) return;
        leezen.slots[msg.slot] = bike.color;
        leezen.loose = leezen.loose.filter((b) => b !== bike);
        if (leezen.slots.every((c) => c !== null)) {
          leezen.clearedAt = Date.now();
          resetTimer = setTimeout(() => {
            scatterLeezen();
            broadcast({ t: 'leezen', ...leezenState() });
          }, LEEZEN_RESET_MS);
        }
        broadcast({ t: 'leezen', ...leezenState() });
      } else if (msg.t === 'drop') {
        if (dropBike(p)) broadcast({ t: 'leezen', ...leezenState() });
      }
    });

    ws.on('close', () => {
      if (!ws.player) return;
      players.delete(ws.player.id);
      broadcast({ t: 'leave', id: ws.player.id });
      if (dropBike(ws.player)) broadcast({ t: 'leezen', ...leezenState() });
    });
  });

  const tick = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    const list = [...players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, dir: p.dir, moving: p.moving, bike: p.bike }));
    broadcast({ t: 'state', players: list });
  }, TICK_MS);

  // Drop connections that stopped answering pings (e.g. phones that went to sleep).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  /** Stop timers, disconnect all clients and close the server. */
  function close() {
    clearInterval(tick);
    clearInterval(heartbeat);
    clearTimeout(resetTimer);
    for (const ws of wss.clients) ws.terminate();
    return new Promise((resolve) => wss.close(() => server.close(() => resolve())));
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ port: server.address().port, close }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  startServer(port).then(() => console.log(`Server listening on http://localhost:${port}`));
}
