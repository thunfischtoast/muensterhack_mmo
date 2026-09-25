/**
 * Game server: serves the static client from public/ over HTTP and relays
 * player positions and chat messages over a WebSocket on the same port.
 *
 * Movement is client-authoritative; the server only sanitizes and clamps input.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { TILE, WORLD_W, WORLD_H, SPAWN, LOOK_COUNT, isSolid } from './public/map.js';

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
const TICK_MS = 100;
const HEARTBEAT_MS = 30000;
const MAX_PAYLOAD = 1024;

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

/** Public view of a player as sent in welcome/join messages. */
function publicPlayer(p) {
  return { id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, moving: p.moving };
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
          lastChat: 0,
        };
        ws.player = player;
        players.set(player.id, player);
        ws.send(JSON.stringify({ t: 'welcome', id: player.id, players: [...players.values()].map(publicPlayer) }));
        broadcast({ t: 'join', player: publicPlayer(player) }, ws);
        return;
      }

      if (msg.t === 'move') {
        if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
        p.x = clamp(msg.x, 0, WORLD_W);
        p.y = clamp(msg.y, 0, WORLD_H);
        p.dir = DIRS.has(msg.dir) ? msg.dir : 'down';
        p.moving = msg.moving === true;
        dirty = true;
      } else if (msg.t === 'chat') {
        const now = Date.now();
        if (now - p.lastChat < CHAT_COOLDOWN_MS) return;
        const text = cleanText(msg.text, MAX_CHAT);
        if (!text) return;
        p.lastChat = now;
        broadcast({ t: 'chat', id: p.id, text });
      }
    });

    ws.on('close', () => {
      if (!ws.player) return;
      players.delete(ws.player.id);
      broadcast({ t: 'leave', id: ws.player.id });
    });
  });

  const tick = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    const list = [...players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, dir: p.dir, moving: p.moving }));
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
