/**
 * Browser client: login, input (keyboard, click/tap-to-walk, chat), WebSocket
 * networking, local movement with tile collision, camera and canvas rendering.
 */
import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, OBJECTS, SPAWN, BIKES, LOOK_COUNT, isSolid } from './map.js';
import {
  buildGroundFrames, getObjectSprite, getCharacterSprite, getRiderSprite,
  CHAR_W, CHAR_H, RIDE_W, RIDE_H, RIDE_LIFT, WATER_FRAMES,
} from './sprites.js';
import { findPath } from './path.js';

const SPEED = 72; // pixels per second
const RIDE_SPEED = 140;
const BIKE_REACH = 24; // max distance in pixels from the feet to a bike to get on
const SEND_MS = 100;
const BUBBLE_MS = 5000;
const BUBBLE_FADE_MS = 500;
const RECONNECT_MS = 2000;
const FOOT_W = 5; // half width of the collision box around the feet
const FOOT_H = 4; // height of the collision box above the feet
const KEY_DIRS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const loginEl = document.getElementById('login');
const loginForm = document.getElementById('login-form');
const nameInput = document.getElementById('name-input');
const joinButton = document.getElementById('join-button');
const hudEl = document.getElementById('hud');
const countEl = document.getElementById('count');
const noticeEl = document.getElementById('notice');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatButton = document.getElementById('chat-button');
const bikeButton = document.getElementById('bike-button');
const lookPreview = document.getElementById('look-preview');
const lookCtx = lookPreview.getContext('2d');

const ground = buildGroundFrames();
// Objects never move, so their draw order entries are built once.
const objectEntries = OBJECTS.map((o) => {
  const sprite = getObjectSprite(o);
  return {
    sortY: (o.y + o.h) * TILE,
    sprite,
    x: o.x * TILE + (o.w * TILE - sprite.width) / 2,
    y: (o.y + o.h) * TILE - sprite.height,
  };
});

const players = new Map();
const keys = new Set();
let myId = null;
let myName = '';
let myLook = Math.floor(Math.random() * LOOK_COUNT);
let ws = null;
let path = [];
let stuckTime = 0;
let marker = null;
let lastSent = '';
let lastSendTime = 0;
let scale = 3;
let dpr = 1;
let version = null; // server build seen on the first connect; a different one means we are outdated
let bikeButtonText = '';

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

/** Open the WebSocket (ws/wss derived from the page URL); joining happens after the server's hello. */
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleMessage(msg);
  };
  ws.onclose = () => {
    noticeEl.hidden = false;
    setTimeout(connect, RECONNECT_MS);
  };
}

/** Send a JSON message if the socket is open. */
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Create the local state for a player announced by the server. */
function addPlayer(p) {
  players.set(p.id, {
    id: p.id,
    name: p.name,
    look: p.look,
    x: p.x,
    y: p.y,
    targetX: p.x,
    targetY: p.y,
    dir: p.dir,
    moving: p.moving,
    bike: p.bike ?? null,
    walkTime: 0,
    breathPhase: Math.random() * 1400,
    blinkAt: performance.now() + 1000 + Math.random() * 3000,
    bubble: null,
  });
}

/** Apply a server message to the local world state. */
function handleMessage(msg) {
  switch (msg.t) {
    case 'hello': {
      // The server was updated while this page was open: load the new client instead of rejoining.
      if (version && msg.version !== version) {
        location.reload();
        return;
      }
      version = msg.version;
      const me = players.get(myId);
      const join = { t: 'join', version, name: myName, look: myLook };
      send(me ? { ...join, look: me.look, x: me.x, y: me.y } : join);
      break;
    }
    case 'welcome': {
      const previous = players.get(myId);
      players.clear();
      myId = msg.id;
      msg.players.forEach(addPlayer);
      // After a reconnect keep standing where we were instead of jumping back to the spawn.
      if (previous) {
        const me = players.get(myId);
        me.x = previous.x;
        me.y = previous.y;
        me.dir = previous.dir;
        me.bike = previous.bike;
      }
      lastSent = '';
      loginEl.hidden = true;
      noticeEl.hidden = true;
      hudEl.hidden = false;
      chatButton.hidden = false;
      break;
    }
    case 'join':
      addPlayer(msg.player);
      break;
    case 'leave':
      players.delete(msg.id);
      break;
    case 'state':
      for (const s of msg.players) {
        const p = players.get(s.id);
        if (!p || s.id === myId) continue;
        p.targetX = s.x;
        p.targetY = s.y;
        p.dir = s.dir;
        p.moving = s.moving;
        p.bike = s.bike ?? null;
      }
      break;
    case 'chat': {
      const p = players.get(msg.id);
      if (p) p.bubble = { text: msg.text, start: performance.now(), lines: null, font: '' };
      break;
    }
  }
  countEl.textContent = `${players.size} online`;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Show the chat input and focus it (a real input so mobile keyboards open). */
function openChat() {
  if (myId === null) return;
  keys.clear();
  chatForm.hidden = false;
  chatInput.focus();
}

/** Hide the chat input without sending. */
function closeChat() {
  chatForm.hidden = true;
  chatInput.blur();
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  myName = nameInput.value.trim() || 'Gast';
  try {
    localStorage.setItem('mh-name', myName);
    localStorage.setItem('mh-look', String(myLook));
  } catch {
    // Storage may be unavailable (private mode); the name is only a convenience.
  }
  joinButton.disabled = true;
  joinButton.textContent = 'Verbinde…';
  connect();
});

try {
  nameInput.value = localStorage.getItem('mh-name') || '';
  const look = Number(localStorage.getItem('mh-look') ?? NaN);
  if (Number.isInteger(look) && look >= 0 && look < LOOK_COUNT) myLook = look;
} catch {
  // See above.
}

window.addEventListener('keydown', (event) => {
  if (myId === null || !chatForm.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.code;
  if (event.key === 'Enter') {
    // preventDefault keeps this Enter from also submitting the freshly focused chat input.
    event.preventDefault();
    openChat();
    return;
  }
  if (key === 'KeyE' && !event.repeat) {
    toggleBike();
    return;
  }
  if (KEY_DIRS[key]) {
    event.preventDefault();
    keys.add(KEY_DIRS[key]);
  }
});

window.addEventListener('keyup', (event) => {
  const dir = KEY_DIRS[event.code];
  if (dir) keys.delete(dir);
});

window.addEventListener('blur', () => keys.clear());

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (text) send({ t: 'chat', text });
  chatInput.value = '';
  closeChat();
});

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeChat();
});

chatInput.addEventListener('blur', () => {
  chatForm.hidden = true;
});

chatButton.addEventListener('click', openChat);
document.getElementById('look-prev').addEventListener('click', () => { myLook = (myLook + LOOK_COUNT - 1) % LOOK_COUNT; });
document.getElementById('look-next').addEventListener('click', () => { myLook = (myLook + 1) % LOOK_COUNT; });

/** Animated preview of the chosen look on the login screen (idle breathing and blinking). */
function drawLookPreview(now) {
  const breath = Math.floor(now / 700) % 2;
  const blink = now % 3000 < 140;
  lookCtx.clearRect(0, 0, CHAR_W, CHAR_H);
  lookCtx.drawImage(getCharacterSprite(myLook, 'down', 0, breath, blink).canvas, 0, 0);
}
bikeButton.addEventListener('click', () => {
  toggleBike();
  bikeButton.blur(); // otherwise Space/Enter would keep triggering the focused button
});

/** Nearest bike within reach of the local player's feet, or null. */
function nearestBike(me) {
  let best = null;
  let bestDist = BIKE_REACH;
  for (const b of BIKES) {
    const d = Math.hypot(b.x - me.x, b.y - me.y);
    if (d <= bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Get on the nearest bike, or off the current one. The bike in the world stays where it is. */
function toggleBike() {
  const me = players.get(myId);
  if (!me) return;
  if (me.bike !== null) {
    me.bike = null;
  } else {
    const bike = nearestBike(me);
    if (bike) me.bike = bike.color;
  }
}

/** Show "Aufsteigen" near a bike and "Absteigen" while riding; touch the DOM only on changes. */
function updateBikeButton(me) {
  const text = me.bike !== null ? 'Absteigen' : nearestBike(me) ? 'Aufsteigen' : '';
  if (text === bikeButtonText) return;
  bikeButtonText = text;
  bikeButton.textContent = text;
  bikeButton.hidden = !text;
}

canvas.addEventListener('pointerdown', (event) => {
  if (myId === null || event.button !== 0) return;
  if (!chatForm.hidden) closeChat();
  const { camX, camY } = camera();
  walkTo(event.clientX * dpr / scale + camX, event.clientY * dpr / scale + camY);
});

/** Plan a path to a clicked world position and show the destination marker. */
function walkTo(wx, wy) {
  const me = players.get(myId);
  const gx = Math.floor(wx / TILE);
  const gy = Math.floor(wy / TILE);
  if (isSolid(gx, gy)) return;
  const tiles = findPath(Math.floor(me.x / TILE), Math.floor((me.y - 2) / TILE), gx, gy, MAP_W, MAP_H, isSolid);
  if (!tiles) return;
  path = tiles.map((t) => ({ x: t.x * TILE + TILE / 2, y: t.y * TILE + 10 }));
  // The last waypoint is the clicked point itself, kept far enough inside its tile for the feet box.
  const end = {
    x: Math.min(gx * TILE + TILE - FOOT_W, Math.max(gx * TILE + FOOT_W, wx)),
    y: Math.min(gy * TILE + TILE - 1, Math.max(gy * TILE + FOOT_H, wy)),
  };
  if (path.length) path[path.length - 1] = end;
  else path = [end];
  stuckTime = 0;
  marker = { x: end.x, y: end.y, start: performance.now() };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** True if the feet collision box at (x, y) overlaps a solid tile or leaves the world. */
function blockedAt(x, y) {
  if (x - FOOT_W < 0 || x + FOOT_W > WORLD_W || y - FOOT_H < 0 || y > WORLD_H) return true;
  const x0 = Math.floor((x - FOOT_W) / TILE);
  const x1 = Math.floor((x + FOOT_W - 0.01) / TILE);
  const y0 = Math.floor((y - FOOT_H) / TILE);
  const y1 = Math.floor((y - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
  }
  return false;
}

/** Move the local player by (dx, dy), axis by axis so it slides along walls. Returns the distance moved. */
function moveBy(me, dx, dy) {
  const startX = me.x;
  const startY = me.y;
  if (dx && !blockedAt(me.x + dx, me.y)) me.x += dx;
  if (dy && !blockedAt(me.x, me.y + dy)) me.y += dy;
  return Math.hypot(me.x - startX, me.y - startY);
}

/** Facing direction for a movement vector. */
function dirFor(vx, vy) {
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? 'left' : 'right';
  return vy < 0 ? 'up' : 'down';
}

/** Advance the local player (keys or path) and interpolate remote players. */
function update(dt, now) {
  const me = players.get(myId);
  let vx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  let vy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  let step = (me.bike !== null ? RIDE_SPEED : SPEED) * dt;
  if (vx || vy) {
    path = [];
    marker = null;
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;
  } else if (path.length) {
    const wp = path[0];
    const dist = Math.hypot(wp.x - me.x, wp.y - me.y);
    if (dist < 0.5) {
      path.shift();
    } else {
      vx = (wp.x - me.x) / dist;
      vy = (wp.y - me.y) / dist;
      step = Math.min(step, dist);
    }
  }

  const moved = vx || vy ? moveBy(me, vx * step, vy * step) : 0;
  if (path.length && moved < step * 0.3) {
    // Give up on a path that is blocked (e.g. squeezed at a corner) instead of pushing forever.
    stuckTime += dt;
    if (stuckTime > 0.3) path = [];
  } else {
    stuckTime = 0;
  }
  me.moving = moved > 0;
  if (me.moving) me.dir = dirFor(vx, vy);
  me.walkTime = me.moving ? me.walkTime + dt : 0;
  updateBikeButton(me);

  for (const p of players.values()) {
    if (p.id === myId) continue;
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    if (Math.hypot(dx, dy) > 64) {
      p.x = p.targetX;
      p.y = p.targetY;
    } else {
      const k = Math.min(1, dt * 10);
      p.x += dx * k;
      p.y += dy * k;
    }
    p.walkTime = p.moving ? p.walkTime + dt : 0;
  }

  if (now - lastSendTime >= SEND_MS) {
    lastSendTime = now;
    const msg = JSON.stringify({ t: 'move', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dir: me.dir, moving: me.moving, bike: me.bike });
    if (msg !== lastSent && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      lastSent = msg;
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Resize the canvas to the viewport and pick an integer pixel scale. */
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  // Aim for roughly 18x12 visible tiles, zoomed 2x-4x in CSS pixels.
  const cssScale = Math.min(4, Math.max(2, Math.floor(Math.min(w / (TILE * 18), h / (TILE * 12)))));
  scale = Math.max(1, Math.round(cssScale * dpr));
}

/** Camera top-left in world pixels: follows the own player, clamped to the map, centered if the map is smaller. */
function camera() {
  const viewW = canvas.width / scale;
  const viewH = canvas.height / scale;
  const me = players.get(myId);
  const fx = me ? me.x : (SPAWN.x + SPAWN.w / 2) * TILE;
  const fy = me ? me.y - 12 : (SPAWN.y + SPAWN.h / 2) * TILE;
  const axis = (focus, view, world) => (view >= world ? (world - view) / 2 : Math.min(world - view, Math.max(0, focus - view / 2)));
  return { camX: axis(fx, viewW, WORLD_W), camY: axis(fy, viewH, WORLD_H) };
}

/** Draw a player (walking or riding) with a small shadow; feet at (x, y). */
function drawPlayer(p, now) {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const walking = p.walkTime > 0;
  const frame = walking ? Math.floor(p.walkTime * 8) % 4 : 0;
  const breath = walking ? 0 : Math.floor((now + p.breathPhase) / 700) % 2;
  if (now > p.blinkAt + 140) p.blinkAt = now + 2000 + Math.random() * 4000;
  const blink = now > p.blinkAt;
  const riding = p.bike !== null;
  const { canvas: sprite, flip } = riding
    ? getRiderSprite(p.look, p.dir, frame, breath, blink, p.bike)
    : getCharacterSprite(p.look, p.dir, frame, breath, blink);
  const w = riding ? RIDE_W : CHAR_W;
  const h = riding ? RIDE_H : CHAR_H;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 5, y - 1, 10, 2);
  ctx.fillRect(x - 4, y - 2, 8, 4);
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, -w / 2, y - h + 1);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x - w / 2, y - h + 1);
  }
}

/** Destination marker: four yellow corner brackets closing in on the target. */
function drawMarker(now) {
  if (!marker) return;
  const t = (now - marker.start) / 600;
  if (t >= 1) {
    marker = null;
    return;
  }
  const r = Math.round(7 - t * 4);
  const x = Math.round(marker.x);
  const y = Math.round(marker.y) - 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x + sx * r;
    const cy = y + sy * r;
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - (sx > 0 ? 3 : 0) - 1, cy - 1, 5, 3);
    ctx.fillRect(cx - 1, cy - (sy > 0 ? 3 : 0) - 1, 3, 5);
    ctx.fillStyle = '#FCDD09';
    ctx.fillRect(cx - (sx > 0 ? 2 : 0), cy, 3, 1);
    ctx.fillRect(cx, cy - (sy > 0 ? 2 : 0), 1, 3);
  }
}

/** Draw text with a hard black outline (pixel look) in screen space. */
function outlinedText(text, x, y, o) {
  ctx.fillStyle = '#000';
  for (let dx = -o; dx <= o; dx += o) {
    for (let dy = -o; dy <= o; dy += o) if (dx || dy) ctx.fillText(text, x + dx, y + dy);
  }
  ctx.fillStyle = '#FFF';
  ctx.fillText(text, x, y);
}

/** Word-wrap text to a pixel width with the current font, at most three lines. */
function wrapText(text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    let rest = word;
    // Break words that are wider than a whole line; cut by code points so emoji stay intact.
    while (ctx.measureText(rest).width > maxWidth) {
      const chars = [...rest];
      let cut = chars.length - 1;
      while (cut > 1 && ctx.measureText(chars.slice(0, cut).join('')).width > maxWidth) cut--;
      if (line) lines.push(line);
      lines.push(chars.slice(0, cut).join(''));
      line = '';
      rest = chars.slice(cut).join('');
    }
    const candidate = line ? `${line} ${rest}` : rest;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${[...lines[2]].slice(0, -1).join('')}…`;
  }
  return lines;
}

/** Draw the name label and the speech bubble above a player (screen space). */
function drawOverlay(p, now, camX, camY, fontPx) {
  const sx = Math.round((p.x - camX) * scale);
  const lift = p.bike !== null ? RIDE_LIFT : 0;
  const headY = Math.round((p.y - CHAR_H - 1 - lift - camY) * scale);
  const o = Math.max(1, Math.round(dpr));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  outlinedText(p.name, sx, headY, o);

  const b = p.bubble;
  if (!b) return;
  const age = now - b.start;
  if (age > BUBBLE_MS) {
    p.bubble = null;
    return;
  }
  const font = ctx.font;
  if (b.font !== font) {
    b.lines = wrapText(b.text, fontPx * 12);
    b.font = font;
  }
  const u = Math.max(2, Math.round(scale / 2)); // one "bubble pixel"
  const pad = u * 2;
  const lineH = Math.round(fontPx * 1.15);
  const w = Math.ceil(Math.max(...b.lines.map((l) => ctx.measureText(l).width))) + pad * 2 + u * 2;
  const h = b.lines.length * lineH + pad * 2;
  // Keep bubbles of players near the screen edge readable.
  const x = Math.max(u, Math.min(canvas.width - w - u, sx - Math.round(w / 2)));
  const y = headY - fontPx - 4 * u - h;
  ctx.globalAlpha = age > BUBBLE_MS - BUBBLE_FADE_MS ? (BUBBLE_MS - age) / BUBBLE_FADE_MS : 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#FFF';
  ctx.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
  // Stepped tail pointing down at the speaker
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - (3 - i) * u, y + h - u + i * u, (3 - i) * 2 * u, u);
    ctx.fillStyle = '#FFF';
    if (i < 2) ctx.fillRect(sx - (2 - i) * u, y + h - u + i * u, (2 - i) * 2 * u, u);
  }
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  b.lines.forEach((line, i) => ctx.fillText(line, x + u + pad, y + pad + i * lineH));
  ctx.globalAlpha = 1;
}

/** Render one frame: ground, marker, y-sorted objects and players, then labels and bubbles. */
function render(now) {
  const { camX, camY } = camera();
  const ox = Math.round(camX * scale);
  const oy = Math.round(camY * scale);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a252f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, -ox, -oy);
  ctx.drawImage(ground[Math.floor(now / 350) % WATER_FRAMES], 0, 0);
  drawMarker(now);

  const sortedPlayers = [...players.values()].sort((a, b) => a.y - b.y);
  const drawList = [
    ...objectEntries,
    ...sortedPlayers.map((p) => ({ sortY: p.y, player: p })),
  ].sort((a, b) => a.sortY - b.sortY);
  for (const item of drawList) {
    if (item.player) drawPlayer(item.player, now);
    else ctx.drawImage(item.sprite, item.x, item.y);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fontPx = Math.max(Math.round(11 * dpr), Math.round(scale * 3.5));
  ctx.font = `${fontPx}px "Share Tech Mono", monospace`;
  for (const p of sortedPlayers) drawOverlay(p, now, camX, camY, fontPx);
}

let lastFrame = performance.now();

/** Main loop. The world renders behind the login screen too, as a backdrop. */
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (players.has(myId)) update(dt, now);
  render(now);
  if (!loginEl.hidden) drawLookPreview(now);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);
