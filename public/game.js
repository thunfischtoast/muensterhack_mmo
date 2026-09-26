/**
 * Browser client: login, input (keyboard, click/tap-to-walk, chat), WebSocket
 * networking, local movement with tile collision, camera and canvas rendering.
 */
import {
  TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, GROUND, OBJECTS, SPAWN, BIKES, BIRDS, LOOK_COUNT, RACK_SLOTS, birdAt, isSolid,
} from './map.js';
import {
  buildGroundFrames, getObjectSprite, getCharacterSprite, getRiderSprite, getBirdSprite, getLooseBikeSprite, getCritterSprite,
  CHAR_W, CHAR_H, RIDE_W, RIDE_H, RIDE_LIFT, WATER_FRAMES, ANIMATED_OBJECTS,
} from './sprites.js';
import { findPath } from './path.js';
import { NPCS, npcAt } from './npcs.js';
import { ACHIEVEMENTS, unlock, progress, progressCount, isUnlocked, unlockedCount } from './achievements.js';

const SPEED = 72; // pixels per second
const RIDE_SPEED = 140;
const BIKE_REACH = 24; // max distance in pixels from the feet to a bike to get on
const SEND_MS = 100;
const BUBBLE_MS = 5000;
const BUBBLE_FADE_MS = 500;
const WAVE_MS = 1200;
const SPARK_MS = 400;
const MAX_PARTICLES = 200;
const INFO_REACH = 20; // pixels from the feet to an object's footprint to show its project info
const TOAST_MS = 3500;
const GREET_REACH = 28; // pixels from the own player at which an NPC says hello
const GREET_COOLDOWN_MS = 20000;
const GREET_GAP_MS = 5000; // between hellos of different NPCs, so a group does not greet one after another
/** Dust colors per ground type (see GROUND in map.js). */
const DUST_COLORS = {
  c: ['#8f8a80', '#b5b0a6'], '=': ['#a08058', '#c4a57a'], t: ['#b5ad9e', '#e4ded2'], j: ['#7a5230', '#a0703f'],
  '.': ['#3f8a35', '#6cbf55'],
};
/** Offset from the feet to where dust kicks up behind a walker or the rear wheel of a rider. */
const DUST_BEHIND = { right: [-5, 0], left: [5, 0], down: [0, -2], up: [0, 2] };
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
const waveButton = document.getElementById('wave-button');
const taskStatusEl = document.getElementById('task-status');
const toastEl = document.getElementById('toast');
const infoEl = document.getElementById('info');
const infoNameEl = document.getElementById('info-name');
const infoLabelEl = infoEl.querySelector('.info-label');
const trophyButton = document.getElementById('trophy-button');
const trophyPanel = document.getElementById('trophies');
const trophyList = document.getElementById('trophy-list');
const lookPreview = document.getElementById('look-preview');
const lookCtx = lookPreview.getContext('2d');

const ground = buildGroundFrames();
// Objects never move, so their draw order entries are built once; animated ones keep one sprite per frame.
const objectEntries = OBJECTS.map((o) => {
  const anim = ANIMATED_OBJECTS[o.type];
  const sprites = Array.from({ length: anim ? anim.frames : 1 }, (_, f) => getObjectSprite(o, f));
  return {
    sortY: (o.y + o.h) * TILE,
    sprites,
    anim,
    x: o.x * TILE + (o.w * TILE - sprites[0].width) / 2,
    y: (o.y + o.h) * TILE - sprites[0].height,
  };
});

// References to earlier Münsterhack projects (and local communities, with their own label): footprint for the proximity check and a "?" marker spot.
const infoSpots = OBJECTS.filter((o) => o.info).map((o) => ({
  ...o.info,
  x0: o.x * TILE,
  y0: o.y * TILE,
  x1: (o.x + o.w) * TILE,
  y1: (o.y + o.h) * TILE,
  markX: (o.x + o.w / 2) * TILE,
  markY: (o.y + o.h) * TILE - Math.min(getObjectSprite(o).height, 48) - 12,
}));

const players = new Map();
const keys = new Set();
let myId = null;
let myName = '';
let myLook = Math.floor(Math.random() * LOOK_COUNT);
let ws = null;
let path = [];
let stuckTime = 0;
let marker = null;
let sparks = []; // high-five claps: world position and start time
let particles = [];
const birds = BIRDS.map((b) => ({ ...b, rippleIn: Math.random() }));
// NPCs carry the same fields as players, so drawPlayer and drawOverlay work for them unchanged.
const npcs = NPCS.map((n) => ({
  ...n, bike: n.bike ?? null, x: 0, y: 0, dir: 'down', walkTime: 0, breathPhase: Math.random() * 1400,
  blinkAt: 0, waveUntil: 0, bubble: null, lineNo: null, stopNo: null, greetAt: 0,
}));
let lastSent = '';
let lastSendTime = 0;
let scale = 3;
let dpr = 1;
let version = null; // server build seen on the first connect; a different one means we are outdated
let bikeButtonText = '';
let leezen = null; // Leezen-Chaos state from the server
let leezenAt = 0; // when it arrived, to count down resetIn locally
let myCarry = null; // id of the loose bike the own player carries
let taskText = '';
let toastTimer = 0;
let infoText = '';
let trophyText = '';
let pipeIn = 0; // seconds until the next puff from the Kiepenkerl's pipe
let fishSplash = { n: -1, end: true }; // which fish jump already splashed
let prevRideY = null; // own y in the previous frame, to detect crossing the traffic light
let lastGreenWave = -Infinity;
let lastGreet = -Infinity;

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
    waveUntil: 0,
    dustIn: 0,
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
      applyLeezen(msg.leezen, true);
      updateTrophyButton();
      lastSent = '';
      loginEl.hidden = true;
      noticeEl.hidden = true;
      hudEl.hidden = false;
      chatButton.hidden = false;
      waveButton.hidden = false;
      break;
    }
    case 'join':
      addPlayer(msg.player);
      break;
    case 'leezen':
      applyLeezen(msg, false);
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
    case 'wave': {
      const p = players.get(msg.id);
      const partner = players.get(msg.with);
      if (!p) break;
      const now = performance.now();
      p.waveUntil = now + WAVE_MS;
      if (partner) {
        // High five: both face each other; the own player's new facing is synced via the next move message.
        partner.waveUntil = now + WAVE_MS;
        p.dir = dirFor(partner.x - p.x, partner.y - p.y);
        partner.dir = dirFor(p.x - partner.x, p.y - partner.y);
        sparks.push({ x: (p.x + partner.x) / 2, y: (p.y + partner.y) / 2 - 16, start: now });
        if (msg.id === myId || msg.with === myId) achieve('highfive');
      }
      break;
    }
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
  if (key === 'KeyQ' && !event.repeat) {
    send({ t: 'wave' });
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

trophyButton.addEventListener('click', () => {
  renderTrophies();
  trophyPanel.hidden = false;
  trophyButton.blur();
});
document.getElementById('trophy-close').addEventListener('click', () => { trophyPanel.hidden = true; });
trophyPanel.addEventListener('pointerdown', (event) => {
  if (event.target === trophyPanel) trophyPanel.hidden = true; // click on the dimmed backdrop
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') trophyPanel.hidden = true;
});

window.addEventListener('keyup', (event) => {
  const dir = KEY_DIRS[event.code];
  if (dir) keys.delete(dir);
});

window.addEventListener('blur', () => keys.clear());

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    send({ t: 'chat', text });
    achieve('chat');
  }
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
waveButton.addEventListener('click', () => {
  send({ t: 'wave' });
  waveButton.blur();
});
bikeButton.addEventListener('click', () => {
  toggleBike();
  bikeButton.blur(); // otherwise Space/Enter would keep triggering the focused button
});

/** Nearest item (with x/y in pixels) within `reach` of the local player's feet, or null. */
function nearest(items, me, reach) {
  let best = null;
  let bestDist = reach;
  for (const item of items) {
    const d = Math.hypot(item.x - me.x, item.y - me.y);
    if (d <= bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

/** Leezen-Chaos rack slots that are still empty, with their index. */
function freeSlots() {
  return leezen ? RACK_SLOTS.map((slot, i) => ({ ...slot, i })).filter((slot) => leezen.slots[slot.i] === null) : [];
}

/** Knocked-over bikes nobody carries right now. */
function lyingBikes() {
  return leezen ? leezen.loose.filter((b) => b.carriedBy === null) : [];
}

/**
 * What the bike button and E do right now, by priority: park or drop a carried Leeze,
 * get off the own bike, pick up a knocked-over Leeze, get on a parked bike.
 */
function bikeAction(me) {
  if (myCarry !== null) {
    const slot = nearest(freeSlots(), me, BIKE_REACH);
    return slot
      ? { label: 'Einparken', run: () => send({ t: 'park', slot: slot.i }) }
      : { label: 'Absteigen', run: () => send({ t: 'drop' }) };
  }
  if (me.bike !== null) return { label: 'Absteigen', run: () => { me.bike = null; } };
  const loose = nearest(lyingBikes(), me, BIKE_REACH);
  if (loose) return { label: 'Aufheben', run: () => send({ t: 'pickup', id: loose.id }) };
  const bike = nearest(BIKES, me, BIKE_REACH);
  if (bike) return { label: 'Aufsteigen', run: () => { me.bike = bike.color; } };
  return null;
}

/** Run the current bike action (button or E). Parked bikes stay where they are when you ride them. */
function toggleBike() {
  const me = players.get(myId);
  const action = me && bikeAction(me);
  if (action) action.run();
}

/** Take over the Leezen-Chaos state from the server and tell the player what changed. */
function applyLeezen(state, initial) {
  const prev = leezen;
  leezen = state;
  leezenAt = performance.now();
  const me = players.get(myId);
  const carried = state.loose.find((b) => b.carriedBy === myId);
  if (carried && myCarry !== carried.id) {
    if (me) me.bike = carried.color;
    showToast('Bring die Leeze zum Fahrradständer!');
  } else if (!carried && myCarry !== null) {
    // Parked or dropped: the carried bike is gone, so the own player walks again
    if (me) me.bike = null;
    const count = (slots) => slots.filter((c) => c !== null).length;
    const left = state.slots.length - count(state.slots);
    if (prev && count(state.slots) > count(prev.slots)) achieve('parker');
    if (prev && count(state.slots) > count(prev.slots) && left > 0) {
      showToast(`Geparkt! Noch ${left} ${left === 1 ? 'Leeze' : 'Leezen'}.`);
    }
  }
  myCarry = carried ? carried.id : null;
  if (initial || !prev) return;
  if (state.round > prev.round) showToast('Windböe! Die Leezen sind umgefallen.');
  else if (state.cleared && !prev.cleared) celebrate();
}

/** Round complete: banner for everyone and confetti over the rack. */
function celebrate() {
  showToast('Münster ist aufgeräumt! Danke!', 6000);
  achieve('cleared');
  const cx = (RACK_SLOTS[0].x + RACK_SLOTS[RACK_SLOTS.length - 1].x) / 2;
  const colors = ['#DA121A', '#FCDD09', '#FFFFFF'];
  for (let i = 0; i < 90; i++) {
    const vx = (Math.random() - 0.5) * 90;
    const vy = -40 - Math.random() * 70;
    emit(cx + (Math.random() - 0.5) * 60, RACK_SLOTS[0].y - 8, vx, vy, 1.5 + Math.random(), colors[i % 3], 2, 90);
  }
}

/** Show a short hint at the bottom of the screen. */
function showToast(text, ms = TOAST_MS) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

/** Task panel: progress, or the countdown to the next round; touch the DOM only on changes. */
function updateTask() {
  if (!leezen) return;
  const parked = leezen.slots.filter((c) => c !== null).length;
  const text = leezen.cleared
    ? `Aufgeräumt! Neue Runde in ${Math.max(0, Math.ceil((leezen.resetIn - (performance.now() - leezenAt)) / 1000))} s`
    : `${parked}/${leezen.slots.length} im Ständer`;
  if (text === taskText) return;
  taskText = text;
  taskStatusEl.textContent = text;
}

/** Show name and year of a referenced project while standing next to it; touch the DOM only on changes. */
function updateInfo(me) {
  const sq = squirrelAt(wallTime());
  const spot = sq && Math.hypot(me.x - sq.x, me.y - sq.y) <= INFO_REACH + 8 ? AICHHOERNCHEN : infoSpots.find((s) => {
    const dx = me.x - Math.min(s.x1, Math.max(s.x0, me.x));
    const dy = me.y - Math.min(s.y1, Math.max(s.y0, me.y));
    return Math.hypot(dx, dy) <= INFO_REACH;
  });
  if (spot) {
    if (!spot.label) achieve('history', spot.name);
    if (spot === AICHHOERNCHEN) achieve('squirrel');
    if (spot.name === 'Corndex') achieve('kiosk');
  }
  const text = spot ? spot.name + ' · ' + spot.year : '';
  if (text === infoText) return;
  infoText = text;
  infoNameEl.textContent = text;
  if (spot) infoLabelEl.textContent = spot.label ?? 'Münsterhack-Projekt';
  infoEl.hidden = !text;
}

/** Add a fading pixel particle (optionally falling with gravity g); the oldest is dropped at the cap. */
function emit(x, y, vx, vy, life, color, size = 1, g = 0) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ x, y, vx, vy, life, max: life, color, size, g });
}

/** Move birds, emit dust behind moving players and wakes behind birds, age particles. */
function updateEffects(dt) {
  const t = Date.now() / 1000;
  for (const b of birds) {
    Object.assign(b, birdAt(b, t));
    b.rippleIn -= dt;
    if (b.rippleIn <= 0) {
      b.rippleIn = 0.3;
      const back = b.left ? 5 : -5;
      for (const vy of [-5, 5]) emit(b.x + back, b.y - 1, back * 0.8, vy, 0.9, '#d8ecff');
    }
  }
  for (const p of players.values()) {
    if (p.walkTime <= 0) continue;
    p.dustIn -= dt;
    if (p.dustIn > 0) continue;
    const riding = p.bike !== null;
    p.dustIn = riding ? 0.05 : 0.15;
    const colors = DUST_COLORS[GROUND[Math.floor(p.y / TILE)]?.[Math.floor(p.x / TILE)]] || DUST_COLORS.c;
    const color = colors[Math.floor(Math.random() * 2)];
    const [ox, oy] = DUST_BEHIND[p.dir];
    emit(p.x + ox + (Math.random() - 0.5) * 4, p.y - 1 + oy, ox * 1.5, -3 - Math.random() * 5, riding ? 0.5 : 0.4, color, 2);
  }
  for (const q of particles) {
    q.vy += q.g * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.life -= dt;
  }
  updateAmbient(dt);
  particles = particles.filter((q) => q.life > 0);
}

/** Label the bike button with the current bike action, hide it when there is none; touch the DOM only on changes. */
function updateBikeButton(me) {
  const text = bikeAction(me)?.label ?? '';
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
  updateTask();
  updateInfo(me);
  checkGreenWave(me, now);
  checkAchievements(me);

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
  const wave = now < p.waveUntil ? 1 + (Math.floor(now / 150) % 2) : 0;
  const riding = p.bike !== null;
  const { canvas: sprite, flip } = riding
    ? getRiderSprite(p.look, p.dir, frame, breath, blink, p.bike, wave)
    : getCharacterSprite(p.look, p.dir, frame, breath, blink, wave);
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

/** Draw a bird with its waterline at (x, y), mirrored when swimming left. */
function drawBird(b, now) {
  const sprite = getBirdSprite(b.kind, Math.floor((now + b.phase * 1000) / 400) % 2);
  const x = Math.round(b.x);
  const y = Math.round(b.y) - sprite.height + 2;
  if (b.left) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, -Math.floor(sprite.width / 2), y);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x - Math.floor(sprite.width / 2), y);
  }
}

/**
 * Leezen-Chaos guidance on top of the world: a bobbing "!" over every knocked-over bike and,
 * while carrying one, pulsing free rack slots plus an arrow at the own player pointing to the nearest.
 */
function drawLeezenHints(now) {
  const bob = Math.round(Math.sin(now / 200) * 1.5);
  for (const b of lyingBikes()) {
    const x = Math.round(b.x);
    const y = Math.round(b.y) - 20 + bob;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 2, y - 1, 4, 11);
    ctx.fillStyle = '#FCDD09';
    ctx.fillRect(x - 1, y, 2, 6);
    ctx.fillRect(x - 1, y + 7, 2, 2);
  }
  const me = players.get(myId);
  if (myCarry === null || !me) return;
  const slots = freeSlots();
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 150);
  ctx.fillStyle = '#FCDD09';
  for (const sl of slots) {
    ctx.fillRect(sl.x - 8, sl.y - 8, 16, 1);
    ctx.fillRect(sl.x - 8, sl.y + 7, 16, 1);
    ctx.fillRect(sl.x - 8, sl.y - 8, 1, 16);
    ctx.fillRect(sl.x + 7, sl.y - 8, 1, 16);
  }
  ctx.globalAlpha = 1;
  const target = nearest(slots, me, Infinity);
  if (!target || Math.hypot(target.x - me.x, target.y - me.y) < 40) return;
  const a = Math.atan2(target.y - me.y, target.x - me.x);
  const cx = me.x + Math.cos(a) * 16;
  const cy = me.y - 8 + Math.sin(a) * 16;
  const tri = (size, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    ctx.lineTo(cx + Math.cos(a + 2.4) * size, cy + Math.sin(a + 2.4) * size);
    ctx.lineTo(cx + Math.cos(a - 2.4) * size, cy + Math.sin(a - 2.4) * size);
    ctx.fill();
  };
  tri(6, '#000');
  tri(4, '#FCDD09');
}

/** Unlock or advance an achievement; the first time it completes, celebrate with a banner and confetti. */
function achieve(id, step) {
  const done = step === undefined ? unlock(id) : progress(id, step);
  if (!done) return;
  updateTrophyButton();
  if (!trophyPanel.hidden) renderTrophies();
  // Let a toast that is already showing (e.g. "Grüne Welle!") be read first
  setTimeout(() => showToast('🏆 Erfolg freigeschaltet: ' + done.name, 4500), toastEl.hidden ? 0 : 1800);
  const me = players.get(myId);
  if (!me) return;
  for (let i = 0; i < 24; i++) {
    emit(me.x, me.y - 24, (Math.random() - 0.5) * 60, -30 - Math.random() * 40, 1, i % 2 ? '#FCDD09' : '#FFFFFF', 2, 90);
  }
}

/** Trophy button label: unlocked / total; touch the DOM only on changes. */
function updateTrophyButton() {
  const text = '🏆 ' + unlockedCount() + '/' + ACHIEVEMENTS.length;
  if (text === trophyText) return;
  trophyText = text;
  trophyButton.textContent = text;
}

/** Fill the achievements panel: unlocked ones with description, locked ones with a hint (and progress). */
function renderTrophies() {
  trophyList.replaceChildren(...ACHIEVEMENTS.map((a) => {
    const li = document.createElement('li');
    const done = isUnlocked(a.id);
    const name = document.createElement('div');
    name.className = 'trophy-name';
    name.textContent = done ? '🏆 ' + a.name : '🔒 ???';
    const desc = document.createElement('div');
    desc.textContent = (done ? a.desc : a.hint) + (a.goal && !done ? ' (' + progressCount(a.id) + '/' + a.goal + ')' : '');
    if (!done) li.className = 'locked';
    li.append(name, desc);
    return li;
  }));
}

/** Named area of a tile for "Stadtbummel", or null. */
function areaAt(tx, ty) {
  const g = GROUND[ty]?.[tx];
  if (g === 't' || g === 'j') return 'aasee';
  if (tx >= 34) return ty <= 18 ? 'promenade' : null;
  if (g === 'c') return tx >= 24 && ty <= 12 ? 'lamberti' : 'prinzipalmarkt';
  if (ty >= 19 && tx <= 13) return 'park';
  return null;
}

/** Per-frame achievement checks that depend on where the own player stands and what is happening there. */
function checkAchievements(me) {
  const tx = Math.floor(me.x / TILE);
  const ty = Math.floor((me.y - 1) / TILE);
  const area = areaAt(tx, ty);
  if (area) achieve('stroll', area);
  if (me.bike !== null) achieve('bike');
  if (GROUND[ty]?.[tx] === 'j' && GROUND[ty + 1]?.[tx] === '~') achieve('jetty');
  if (Math.hypot(me.x - (CAT.x + 7), me.y - CAT.y) < 40) achieve('cat');
  const t = wallTime();
  if (t % 90 < 8 && Math.hypot(me.x - (TOWER_X + 24), me.y - (TOWER.y + TOWER.h) * TILE) < 112) achieve('keeper');
  const houseX = BANNER_HOUSE.x * TILE;
  if ((t + 30) % 60 < 6 && me.x > houseX - 8 && me.x < houseX + BANNER_HOUSE.w * TILE + 8 && me.y < 8 * TILE) {
    achieve('mascot');
  }
}

/** Small bobbing red "?" over every object (and the squirrel) that references an earlier Münsterhack project. */
function drawInfoMarkers(now) {
  const bob = Math.round(Math.sin(now / 250 + 1) * 1.5);
  const sq = squirrelAt(wallTime());
  const spots = sq ? [...infoSpots, { markX: sq.x, markY: sq.y - 24 }] : infoSpots;
  for (const s of spots) {
    const x = Math.round(s.markX) - 3;
    const y = Math.round(s.markY) + bob;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, 9, 11);
    ctx.fillStyle = '#DA121A';
    ctx.fillRect(x, y, 7, 9);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(x + 2, y + 1, 3, 1);
    ctx.fillRect(x + 4, y + 2, 1, 2);
    ctx.fillRect(x + 3, y + 4, 1, 2);
    ctx.fillRect(x + 3, y + 7, 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Ambient easter eggs, timed by the wall clock so every player sees them at the same moment
// ---------------------------------------------------------------------------

const TOWER = OBJECTS.find((o) => o.type === 'tower');
const TOWER_X = TOWER.x * TILE; // the tower sprite is exactly as wide as its footprint
const LIGHT = OBJECTS.find((o) => o.type === 'bikelight');
const KIEPENKERL = OBJECTS.find((o) => o.type === 'kiepenkerl');
const BANNER_HOUSE = OBJECTS.find((o) => o.type === 'house' && o.v === 3);
const CAT_HOUSE = OBJECTS.find((o) => o.type === 'house' && o.v === 1);
/** Cat curled up in the left arch of the second house: sprite left edge and the arcade floor. */
const CAT = { x: CAT_HOUSE.x * TILE + 5, y: (CAT_HOUSE.y + CAT_HOUSE.h) * TILE };
const AICHHOERNCHEN = { name: 'AIchhörnchen', year: '2025' };
const SQUIRREL_ROWS = [1, 4, 7, 10]; // Promenade rows with lindens on both sides of the path

/** Open-water tiles (all eight neighbours water too) where fish may jump. */
const FISH_TILES = [];
for (let ty = 1; ty < MAP_H - 1; ty++) {
  for (let tx = 1; tx < MAP_W - 1; tx++) {
    let open = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (GROUND[ty + dy][tx + dx] !== '~') open = false;
    if (open) FISH_TILES.push([tx, ty]);
  }
}

/** Seconds since the epoch; shared timeline for all clients. */
function wallTime() {
  return Date.now() / 1000;
}

/** Deterministic pseudo-random number in [0, 1) for an event number, identical on every client. */
function eventRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Squirrel scurrying across the Promenade for 3.5 s of every 30 s, or null. */
function squirrelAt(t) {
  const p = t % 30;
  if (p >= 3.5) return null;
  const n = Math.floor(t / 30);
  const k = p / 3.5;
  const right = n % 2 === 0;
  const x0 = 35 * TILE + 12;
  const x1 = 38 * TILE + 4;
  return {
    x: right ? x0 + (x1 - x0) * k : x1 - (x1 - x0) * k,
    y: SQUIRREL_ROWS[n % SQUIRREL_ROWS.length] * TILE + 15,
    flip: !right,
    frame: Math.floor(p * 8) % 2,
  };
}

/** Fish jumping in an arc for 1.2 s of every 23 s at a random open-water spot, or null. */
function fishAt(t) {
  const p = t % 23;
  if (p >= 1.2) return null;
  const n = Math.floor(t / 23);
  const [tx, ty] = FISH_TILES[Math.floor(eventRandom(n) * FISH_TILES.length)];
  const dir = n % 2 ? 1 : -1;
  const k = p / 1.2;
  const baseY = ty * TILE + 10;
  return { n, k, baseY, x: tx * TILE + 8 + (k - 0.5) * 20 * dir, y: baseY - Math.sin(Math.PI * k) * 10, flip: dir < 0 };
}

/** Whether the bike traffic light (and the Leezenflow before it) currently shows green. */
function lightIsGreen() {
  const anim = ANIMATED_OBJECTS.bikelight;
  return Math.floor(Date.now() / anim.ms) % anim.frames < anim.frames / 2;
}

/** A few droplets flying up where the fish leaves or re-enters the water. */
function splash(x, y) {
  for (let i = 0; i < 6; i++) emit(x, y, (Math.random() - 0.5) * 30, -20 - Math.random() * 20, 0.5, '#e4f2ff', 1, 80);
}

/** Emit pipe smoke and fish splashes; called every frame from updateEffects. */
function updateAmbient(dt) {
  pipeIn -= dt;
  if (pipeIn <= 0) {
    pipeIn = 1.2 + Math.random();
    // The Kiepenkerl's pipe bowl sits at (11, 7) in his 16x32 sprite
    emit(KIEPENKERL.x * TILE + 12, (KIEPENKERL.y + KIEPENKERL.h) * TILE - 27, 2 + Math.random() * 2, -5, 2.2, '#d8d8d8', 2);
  }
  const fish = fishAt(wallTime());
  if (fish && fish.n !== fishSplash.n) {
    fishSplash = { n: fish.n, end: false };
    splash(fish.x, fish.baseY);
  }
  if (fish && fish.k > 0.9 && !fishSplash.end) {
    fishSplash.end = true;
    splash(fish.x, fish.baseY);
  }
}

/** Show a toast when the own player rides across the traffic light's line while it is green. */
function checkGreenWave(me, now) {
  const lineY = (LIGHT.y + 0.5) * TILE;
  const onPath = me.x >= (LIGHT.x + 1) * TILE && me.x <= (LIGHT.x + 3) * TILE;
  const crossed = prevRideY !== null && (prevRideY < lineY) !== (me.y < lineY);
  if (me.bike !== null && onPath && crossed && lightIsGreen() && now - lastGreenWave > 10000) {
    lastGreenWave = now;
    showToast('Grüne Welle! 🚲');
    achieve('greenwave');
  }
  prevRideY = me.y;
}

/** Y-sorted draw entries for the cat, the squirrel and a jumping fish. */
function critterEntries(now) {
  const t = wallTime();
  const me = players.get(myId);
  const awake = me && Math.hypot(me.x - (CAT.x + 7), me.y - CAT.y) < 40;
  const catFrame = awake ? 2 : Math.floor(now / 300) % 14 === 0 ? 1 : 0;
  const entries = [{ sortY: CAT.y + 0.5, critter: { sprite: getCritterSprite('cat', catFrame), x: CAT.x, y: CAT.y - 11 } }];
  const sq = squirrelAt(t);
  if (sq) entries.push({ sortY: sq.y, critter: { sprite: getCritterSprite('squirrel', sq.frame), x: sq.x - 6, y: sq.y - 10, flip: sq.flip } });
  const fish = fishAt(t);
  if (fish) entries.push({ sortY: fish.baseY, critter: { sprite: getCritterSprite('fish'), x: fish.x - 4, y: fish.y - 5, flip: fish.flip } });
  return entries;
}

/** Draw a critter sprite, mirrored when it faces left. */
function drawCritter(c) {
  const x = Math.round(c.x);
  const y = Math.round(c.y);
  if (c.flip) {
    ctx.save();
    ctx.translate(x + c.sprite.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(c.sprite, 0, y);
    ctx.restore();
  } else {
    ctx.drawImage(c.sprite, x, y);
  }
}

/**
 * Details on buildings that players can never stand in front of: live clock hands on St. Lamberti,
 * the tower keeper blowing her horn now and then, and the mascot waving from a window.
 */
function drawBuildingEggs(now) {
  const t = wallTime();
  const d = new Date();
  const minutes = d.getMinutes() + d.getSeconds() / 60;
  const hours = (d.getHours() % 12) + minutes / 60;
  const cx = TOWER_X + 24;
  const cy = 88;
  ctx.fillStyle = '#000';
  for (const [turn, len] of [[hours / 12, 2.5], [minutes / 60, 4]]) {
    const a = turn * 2 * Math.PI;
    for (let r = 0; r <= len; r += 0.5) ctx.fillRect(Math.round(cx + Math.sin(a) * r), Math.round(cy - Math.cos(a) * r), 1, 1);
  }
  if (t % 90 < 8) {
    // Tower keeper in the middle belfry opening, music notes rising from her horn
    ctx.drawImage(getCritterSprite('keeper'), TOWER_X + 20, 49);
    for (let i = 0; i < 3; i++) {
      const age = (t * 0.8 + i / 3) % 1;
      const nx = Math.round(TOWER_X + 30 + age * 6 + i * 2);
      const ny = Math.round(48 - age * 16);
      ctx.fillRect(nx, ny, 1, 3);
      ctx.fillRect(nx - 1, ny + 2, 1, 1);
      ctx.fillRect(nx + 1, ny, 1, 1);
    }
  }
  if ((t + 30) % 60 < 6) {
    const houseTop = (BANNER_HOUSE.y + BANNER_HOUSE.h) * TILE - 80;
    ctx.drawImage(getCritterSprite('mascot', Math.floor(now / 250) % 2), BANNER_HOUSE.x * TILE + 48, houseTop + 28);
  }
}

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

/** Move NPCs along their routes and let them talk: route stops, their lines in turn, and a hello for the own player. */
function updateNpcs(now) {
  const t = wallTime();
  const me = players.get(myId);
  let greeter = null; // only the nearest NPC says hello, so groups do not talk over each other
  let greetDist = GREET_REACH;
  for (const n of npcs) {
    const pos = npcAt(n, t);
    n.x = pos.x;
    n.y = pos.y;
    n.dir = pos.dir;
    // Scaled so the walk cycle matches the speed, like for players
    n.walkTime = pos.moving ? t * (n.speed / SPEED) : 0;
    let say = null;
    if (pos.stop !== n.stopNo) {
      n.stopNo = pos.stop;
      if (pos.stop !== null && !n.offset) say = n.route[pos.stop][3]; // only the guide explains, the group listens
    }
    if (n.lines) {
      const lineNo = Math.floor((t + n.shift) / n.every);
      // Skip the line that is due right at page load, so NPCs do not all talk at once.
      if (n.lineNo !== null && lineNo !== n.lineNo) say = n.lines[lineNo % n.lines.length];
      n.lineNo = lineNo;
    }
    if (say) n.bubble = { text: say, start: now };
    const dist = me ? Math.hypot(me.x - n.x, me.y - n.y) : Infinity;
    if (dist < greetDist) {
      greeter = n;
      greetDist = dist;
    }
  }
  if (greeter && now > greeter.greetAt && now > lastGreet + GREET_GAP_MS) {
    greeter.bubble = { text: greeter.greet, start: now };
    lastGreet = now;
  }
  // Stay quiet while the player lingers nearby; the cooldown starts again once they walk off.
  if (greeter) greeter.greetAt = now + GREET_COOLDOWN_MS;
}

/** Draw an NPC: like a player, sitting ones cut off at the hips, plus the guide's umbrella or a laptop. */
function drawNpc(n, now) {
  const x = Math.round(n.x);
  const y = Math.round(n.y);
  if (!n.sit) {
    drawPlayer(n, now);
    if (n.prop === 'umbrella') {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(x + 5, y - 28, 1, 17);
      ctx.drawImage(getCritterSprite('umbrella'), x - 1, y - 34);
    }
    return;
  }
  // Seated on the bench: y is the bench's bottom edge, the seat is 6px above it.
  if (now > n.blinkAt + 140) n.blinkAt = now + 2000 + Math.random() * 4000;
  const breath = Math.floor((now + n.breathPhase) / 700) % 2;
  const { canvas: sprite } = getCharacterSprite(n.look, 'down', 0, breath, now > n.blinkAt);
  ctx.drawImage(sprite, 0, 0, CHAR_W, 18, x - CHAR_W / 2, y - 23, CHAR_W, 18);
  ctx.drawImage(getCritterSprite('laptop', Math.floor((now + n.breathPhase) / 180) % 2), x - 6, y - 12);
}

/** High-five clap: yellow pixel rays bursting outward. */
function drawSparks(now) {
  sparks = sparks.filter((s) => now - s.start < SPARK_MS);
  for (const s of sparks) {
    const r = 2 + Math.round(((now - s.start) / SPARK_MS) * 6);
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x + dx * r - 1, y + dy * r - 1, 3, 3);
      ctx.fillStyle = '#FCDD09';
      ctx.fillRect(x + dx * r, y + dy * r, 1, 1);
    }
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

/** Draw the name label (players only, NPCs stay anonymous) and the speech bubble above a player or NPC (screen space). */
function drawOverlay(p, now, camX, camY, fontPx, named = true) {
  const sx = Math.round((p.x - camX) * scale);
  // Riders sit higher; the guide's bubble goes above her umbrella.
  const lift = p.bike !== null ? RIDE_LIFT : p.prop === 'umbrella' ? 12 : 0;
  const headY = Math.round((p.y - CHAR_H - 1 - lift - camY) * scale);
  const o = Math.max(1, Math.round(dpr));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  if (named) outlinedText(p.name, sx, headY, o);

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
  const y = headY - (named ? fontPx : 0) - 4 * u - h;
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
  const waterFrame = Math.floor(now / 350) % WATER_FRAMES;
  ctx.drawImage(ground[waterFrame], 0, 0);
  drawMarker(now);

  const sortedPlayers = [...players.values()].sort((a, b) => a.y - b.y);
  const drawList = [
    ...objectEntries,
    ...sortedPlayers.map((p) => ({ sortY: p.y, player: p })),
    ...birds.map((b) => ({ sortY: b.y, bird: b })),
    ...lyingBikes().map((b) => ({ sortY: b.y, lying: b })),
    ...critterEntries(now),
    // Sitting NPCs sort just after their bench, so they sit on it rather than behind it.
    ...npcs.map((n) => ({ sortY: n.y + (n.sit ? 0.5 : 0), npc: n })),
    // Parked Leezen stand in front of the rack stands, so they sort just after the rack.
    ...RACK_SLOTS.map((slot, i) => ({ slot, color: leezen ? leezen.slots[i] : null }))
      .filter((e) => e.color !== null)
      .map((e) => ({ sortY: e.slot.y + TILE / 2 + 0.5, parked: e })),
  ].sort((a, b) => a.sortY - b.sortY);
  for (const item of drawList) {
    if (item.player) drawPlayer(item.player, now);
    else if (item.npc) drawNpc(item.npc, now);
    else if (item.bird) drawBird(item.bird, now);
    else if (item.critter) drawCritter(item.critter);
    else if (item.lying) {
      ctx.drawImage(getLooseBikeSprite(item.lying.color, true), Math.round(item.lying.x) - 8, Math.round(item.lying.y) - 7);
    } else if (item.parked) {
      ctx.drawImage(getLooseBikeSprite(item.parked.color, false), item.parked.slot.x - 8, item.parked.slot.y - 8);
    }
    else ctx.drawImage(item.sprites[item.anim ? Math.floor(Date.now() / item.anim.ms) % item.anim.frames : 0], item.x, item.y);
  }
  drawBuildingEggs(now);
  // Particles on top: they are tiny and short-lived, and under the sprites they would be hidden.
  for (const q of particles) {
    ctx.globalAlpha = q.life / q.max;
    ctx.fillStyle = q.color;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
  }
  ctx.globalAlpha = 1;
  drawSparks(now);
  drawLeezenHints(now);
  drawInfoMarkers(now);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fontPx = Math.max(Math.round(11 * dpr), Math.round(scale * 3.5));
  ctx.font = `${fontPx}px "Share Tech Mono", monospace`;
  for (const n of npcs) drawOverlay(n, now, camX, camY, fontPx, false);
  for (const p of sortedPlayers) drawOverlay(p, now, camX, camY, fontPx);
}

let lastFrame = performance.now();

/** Main loop. The world renders behind the login screen too, as a backdrop. */
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (players.has(myId)) update(dt, now);
  updateEffects(dt);
  updateNpcs(now);
  render(now);
  if (!loginEl.hidden) drawLookPreview(now);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);
