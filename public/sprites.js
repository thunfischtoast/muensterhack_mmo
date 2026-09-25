/**
 * Procedural pixel-art sprites: characters, ground tiles and world objects.
 *
 * Everything is drawn once at native resolution (16px tiles) into offscreen
 * canvases and cached; game.js scales them up with smoothing disabled.
 */
import { TILE, MAP_W, MAP_H, GROUND, BIKE_COLOR_COUNT, bikeColor } from './map.js';

const RED = '#DA121A';
const YELLOW = '#FCDD09';
const BLACK = '#000';
const WHITE = '#FFF';
const NAVY = '#2C3E50';

/**
 * Character outfits in the Münsterhack palette, inspired by the event mascots.
 * hairStyle: short | long | bow | cap; pattern: plain | vstripes | hstripe | S.
 */
export const LOOKS = [
  // Mascot with the yellow bow: brown hair, yellow shirt with red stripes, red shorts
  { skin: '#f3c9a4', hair: '#6b3e1f', hairStyle: 'bow', shirt: YELLOW, pattern: 'vstripes', accent: RED, pants: RED, shortPants: true, shoes: '#222' },
  // Superhero student: black hair, yellow mask, red shirt with yellow "S", red shoes
  { skin: '#f3c9a4', hair: '#1c1c1c', hairStyle: 'short', mask: true, shirt: RED, pattern: 'S', accent: YELLOW, pants: '#2a2a2a', shoes: RED },
  { skin: '#e2aa7c', hair: '#e8c85a', hairStyle: 'long', shirt: RED, pattern: 'plain', accent: YELLOW, pants: NAVY, shoes: WHITE },
  { skin: '#8d5a3b', hair: '#1c1c1c', hairStyle: 'short', shirt: YELLOW, pattern: 'hstripe', accent: BLACK, pants: '#2a2a2a', shoes: RED },
  { skin: '#f3c9a4', hair: '#c2562a', hairStyle: 'short', shirt: WHITE, pattern: 'hstripe', accent: RED, pants: NAVY, shoes: '#222' },
  // Like the "OB" mascot: grey hair, glasses, black shirt
  { skin: '#f0c4a0', hair: '#9a9a9a', hairStyle: 'short', glasses: true, shirt: '#2a2a2a', pattern: 'plain', accent: RED, pants: '#555', shoes: '#222' },
  { skin: '#b5774f', hair: '#2a1a10', hairStyle: 'long', shirt: RED, pattern: 'vstripes', accent: YELLOW, pants: '#3b5a80', shoes: YELLOW },
  { skin: '#e2aa7c', hair: '#3a2414', hairStyle: 'cap', cap: RED, shirt: NAVY, pattern: 'hstripe', accent: YELLOW, pants: RED, shortPants: true, shoes: WHITE },
];

/** 3x5 (M: 5x5) pixel glyphs for the few words drawn into sprites. */
const GLYPHS = {
  M: ['10001', '11011', '10101', '10001', '10001'],
  S: ['111', '100', '111', '001', '111'],
  H: ['101', '101', '111', '101', '101'],
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  K: ['101', '101', '110', '101', '101'],
  0: ['111', '101', '101', '101', '111'],
  2: ['111', '001', '111', '100', '111'],
  6: ['111', '100', '111', '101', '111'],
  ' ': ['0', '0', '0', '0', '0'],
};

/** Create an offscreen canvas and its 2D context. */
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

/** Fill a pixel rectangle. */
function rect(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Deterministic pseudo-random number in [0, 1) for a tile coordinate, so the map looks the same for everyone. */
function hash(x, y, seed = 0) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Paint every transparent pixel that touches an opaque one black: the mascot-style outline. */
function addOutline(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) edge.push(x, y);
    }
  }
  for (let i = 0; i < edge.length; i += 2) rect(ctx, BLACK, edge[i], edge[i + 1]);
}

/** Draw text with the pixel glyphs; returns the width in pixels. */
function pixelText(ctx, text, x, y, color) {
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') rect(ctx, color, cx + gx, y + gy);
    });
    cx += glyph[0].length + 1;
  }
  return cx - x - 1;
}

/** Width of pixel text without drawing it. */
function pixelTextWidth(text) {
  return [...text].reduce((w, ch) => w + GLYPHS[ch][0].length + 1, -1);
}

// ---------------------------------------------------------------------------
// Characters (16x24, feet at the bottom center)
// ---------------------------------------------------------------------------

export const CHAR_W = 16;
export const CHAR_H = 24;
const charCache = new Map();

/**
 * Return a cached character frame.
 * @param {number} look index into LOOKS
 * @param {'down'|'up'|'left'|'right'} dir facing; left is the mirrored right frame
 * @param {number} frame walk frame 0-3 (0 when standing)
 * @param {number} breath 0/1 idle breathing offset
 * @param {boolean} blink eyes closed
 * @returns {{canvas: HTMLCanvasElement, flip: boolean}}
 */
export function getCharacterSprite(look, dir, frame, breath, blink) {
  const flip = dir === 'left';
  const view = flip ? 'right' : dir;
  const key = `${look}|${view}|${frame}|${breath}|${blink ? 1 : 0}`;
  let canvas = charCache.get(key);
  if (!canvas) {
    let ctx;
    [canvas, ctx] = makeCanvas(CHAR_W, CHAR_H);
    drawCharacter(ctx, LOOKS[look % LOOKS.length], view, frame, breath, blink);
    charCache.set(key, canvas);
  }
  return { canvas, flip };
}

/**
 * Draw one character frame; the outline is added automatically around the silhouette.
 * When riding, only the hips are drawn (legs belong to the bike sprite) and the arms reach for the handlebar.
 */
function drawCharacter(ctx, L, view, frame, breath, blink, riding = false) {
  const stride = frame % 2 === 1;
  // The upper body dips 1px on stride frames and while breathing out.
  const u = stride || breath ? 1 : 0;
  const pantsColor = L.pants;
  const legColor = L.shortPants ? L.skin : L.pants;

  // Legs and shoes
  if (riding) {
    rect(ctx, pantsColor, view === 'right' ? 5 : 4, 16, view === 'right' ? 6 : 8, 2);
  } else if (view === 'right') {
    rect(ctx, pantsColor, 5, 16, 6, 2);
    if (stride) {
      rect(ctx, legColor, 9, 18, 2, 2);
      rect(ctx, legColor, 10, 19, 2, 2);
      rect(ctx, L.shoes, 10, 21, 3, 1);
      rect(ctx, legColor, 5, 18, 2, 3);
      rect(ctx, L.shoes, 4, 21, 3, 1);
    } else {
      rect(ctx, legColor, 6, 18, 4, 3);
      rect(ctx, L.shoes, 6, 21, 5, 2);
    }
  } else {
    rect(ctx, pantsColor, 4, 16, 8, 2);
    const lift = (side) => (frame === 1 && side === 0) || (frame === 3 && side === 1) ? 1 : 0;
    [5, 9].forEach((lx, side) => {
      const l = lift(side);
      rect(ctx, legColor, lx, 18, 2, 3 - l);
      rect(ctx, L.shoes, lx - (side ? 0 : 1), 21 - l, 3, 2);
    });
  }

  // Torso
  const tx = view === 'right' ? 5 : 4;
  const tw = view === 'right' ? 6 : 8;
  rect(ctx, L.shirt, tx, 10 + u, tw, 6);
  if (L.pattern === 'vstripes') {
    for (let x = tx + 1; x < tx + tw; x += 2) rect(ctx, L.accent, x, 12 + u, 1, 4);
  } else if (L.pattern === 'hstripe') {
    rect(ctx, L.accent, tx, 13 + u, tw, 1);
  } else if (L.pattern === 'S' && view === 'down') {
    pixelText(ctx, 'S', 6, 10 + u, L.accent);
  }

  // Arms swing opposite to each other while walking.
  const swing = riding ? 0 : frame === 1 ? 1 : frame === 3 ? -1 : 0;
  if (view === 'right' && riding) {
    line(ctx, L.skin, 8, 13 + u, 11, 14 + u);
  } else if (view === 'right') {
    rect(ctx, L.skin, 7 + swing * 2, 13 + u, 2, 2);
  } else {
    [[3, swing], [12, -swing]].forEach(([ax, s]) => {
      rect(ctx, L.shirt, ax, 10 + u + s, 1, 3);
      rect(ctx, L.skin, ax, 13 + u + s, 1, 2);
    });
  }

  // Head
  const hy = 2 + u;
  rect(ctx, L.skin, 4, hy, 8, 8);
  if (view === 'up') {
    rect(ctx, L.hair, 4, hy, 8, 7);
    if (L.hairStyle === 'long') rect(ctx, L.hair, 3, hy + 2, 10, 8);
  } else if (view === 'down') {
    rect(ctx, L.hair, 4, hy, 8, 2);
    rect(ctx, L.hair, 4, hy + 2, 1, 2);
    rect(ctx, L.hair, 11, hy + 2, 1, 2);
    if (L.hairStyle === 'long') {
      rect(ctx, L.hair, 3, hy + 1, 1, 8);
      rect(ctx, L.hair, 12, hy + 1, 1, 8);
    }
  } else {
    rect(ctx, L.hair, 4, hy, 8, 2);
    rect(ctx, L.hair, 4, hy + 2, 3, 3);
    if (L.hairStyle === 'long') rect(ctx, L.hair, 3, hy + 1, 3, 9);
  }
  if (L.mask) rect(ctx, YELLOW, view === 'right' ? 6 : 4, hy + 3, view === 'right' ? 6 : 8, 2);
  if (L.hairStyle === 'bow') {
    rect(ctx, YELLOW, 5, hy - 1, 2, 2);
    rect(ctx, YELLOW, 9, hy - 1, 2, 2);
    rect(ctx, '#d9a800', 7, hy, 2, 1);
  }
  if (L.hairStyle === 'cap') {
    rect(ctx, L.cap, 4, hy - 1, 8, 3);
    if (view === 'down') rect(ctx, '#8e0b10', 4, hy + 2, 8, 1);
    if (view === 'right') rect(ctx, L.cap, 11, hy + 1, 2, 1);
  }

  // Face
  if (view !== 'up') {
    const eyes = view === 'down' ? [6, 9] : [9];
    for (const ex of eyes) {
      if (blink) rect(ctx, BLACK, ex, hy + 5);
      else rect(ctx, BLACK, ex, hy + 4, 1, 2);
    }
    if (L.glasses) {
      for (const ex of eyes) {
        rect(ctx, BLACK, ex - 1, hy + 3, 3, 3);
        rect(ctx, WHITE, ex, hy + 4);
      }
    }
    if (view === 'down') rect(ctx, '#b05a48', 7, hy + 7, 2, 1);
    else rect(ctx, '#b05a48', 10, hy + 7, 1, 1);
  }

  addOutline(ctx.canvas);
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

export const WATER_FRAMES = 4;

/** Ground type at a tile; outside the map repeats the nearest edge. */
function groundAt(x, y) {
  const cx = Math.min(MAP_W - 1, Math.max(0, x));
  const cy = Math.min(MAP_H - 1, Math.max(0, y));
  return GROUND[cy][cx];
}

/** Draw a grass tile with blades and the occasional flower. */
function drawGrass(ctx, tx, ty, x, y) {
  rect(ctx, '#5ca342', x, y, TILE, TILE);
  for (let i = 0; i < 6; i++) {
    const bx = x + Math.floor(hash(tx, ty, i) * 15);
    const by = y + Math.floor(hash(tx, ty, i + 10) * 14);
    rect(ctx, '#468a34', bx, by, 1, 2);
    rect(ctx, '#7cc05a', x + Math.floor(hash(tx, ty, i + 20) * 16), y + Math.floor(hash(tx, ty, i + 30) * 16));
  }
  if (hash(tx, ty, 99) < 0.1) {
    const fx = x + 3 + Math.floor(hash(tx, ty, 98) * 9);
    const fy = y + 3 + Math.floor(hash(tx, ty, 97) * 9);
    const petal = [RED, YELLOW, WHITE][Math.floor(hash(tx, ty, 96) * 3)];
    rect(ctx, petal, fx - 1, fy);
    rect(ctx, petal, fx + 1, fy);
    rect(ctx, petal, fx, fy - 1);
    rect(ctx, petal, fx, fy + 1);
    rect(ctx, petal === YELLOW ? '#c86a00' : YELLOW, fx, fy);
  }
}

/** Draw a cobblestone tile (offset rows of small stones) with curbs towards non-plaza tiles. */
function drawCobble(ctx, tx, ty, x, y) {
  rect(ctx, '#8a7c64', x, y, TILE, TILE);
  const stones = ['#c4b494', '#bcac8c', '#cfc0a0', '#b4a282'];
  for (let r = 0; r < 4; r++) {
    // Offset every other row using the global pixel row so stones line up across tiles.
    const off = ((ty * 4 + r) % 2) * 3;
    for (let sx = -off; sx < TILE; sx += 6) {
      const color = stones[Math.floor(hash(tx * 4 + sx, ty * 4 + r, 3) * stones.length)];
      const left = Math.max(sx, 0);
      const right = Math.min(sx + 5, TILE);
      if (right <= left) continue;
      rect(ctx, color, x + left, y + r * 4, right - left, 3);
      if (sx >= 0) rect(ctx, '#ddd0b4', x + sx, y + r * 4);
    }
  }
  const curb = '#6e624e';
  if (groundAt(tx, ty - 1) !== 'c') rect(ctx, curb, x, y, TILE, 1);
  if (groundAt(tx, ty + 1) !== 'c') rect(ctx, curb, x, y + TILE - 1, TILE, 1);
  if (groundAt(tx - 1, ty) !== 'c') rect(ctx, curb, x, y, 1, TILE);
  if (groundAt(tx + 1, ty) !== 'c') rect(ctx, curb, x + TILE - 1, y, 1, TILE);
}

/** Draw a speckled tile (path or sand). */
function drawSpeckled(ctx, tx, ty, x, y, base, dark, light) {
  rect(ctx, base, x, y, TILE, TILE);
  for (let i = 0; i < 7; i++) {
    rect(ctx, dark, x + Math.floor(hash(tx, ty, i) * 16), y + Math.floor(hash(tx, ty, i + 7) * 16));
    rect(ctx, light, x + Math.floor(hash(tx, ty, i + 14) * 16), y + Math.floor(hash(tx, ty, i + 21) * 16));
  }
}

/** Draw a water tile for animation frame f: moving glints plus foam along the shore. */
function drawWater(ctx, tx, ty, x, y, f) {
  rect(ctx, '#2f6fc4', x, y, TILE, TILE);
  rect(ctx, '#2a62b2', x, y + 5 + Math.floor(hash(tx, ty, 1) * 6), TILE, 2);
  for (let k = 0; k < 3; k++) {
    const sx = x + Math.floor(hash(tx, ty, k + 2) * 12);
    const sy = y + 2 + Math.floor(hash(tx, ty, k + 12) * 12);
    const phase = (f + Math.floor(hash(tx, ty, k + 22) * WATER_FRAMES)) % WATER_FRAMES;
    if (phase === 0) rect(ctx, '#7fb4f0', sx, sy, 3, 1);
    else if (phase === 1) rect(ctx, '#d4ecff', sx + 1, sy, 2, 1);
    else if (phase === 2) rect(ctx, '#7fb4f0', sx + 1, sy, 3, 1);
  }
  const foam = '#e4f2ff';
  if (groundAt(tx, ty - 1) !== '~') {
    rect(ctx, '#5a94dc', x, y + 1, TILE, 1);
    for (let i = 0; i < TILE; i++) if ((i + f + tx * 16) % 4 !== 0) rect(ctx, foam, x + i, y);
  }
  if (groundAt(tx - 1, ty) !== '~') {
    rect(ctx, '#5a94dc', x + 1, y, 1, TILE);
    for (let i = 0; i < TILE; i++) if ((i + f + ty * 16) % 4 !== 0) rect(ctx, foam, x, y + i);
  }
}

/**
 * Pre-render the whole ground layer once per water animation frame.
 * @returns {HTMLCanvasElement[]}
 */
export function buildGroundFrames() {
  const frames = [];
  for (let f = 0; f < WATER_FRAMES; f++) {
    const [canvas, ctx] = makeCanvas(MAP_W * TILE, MAP_H * TILE);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const x = tx * TILE;
        const y = ty * TILE;
        switch (GROUND[ty][tx]) {
          case 'c': drawCobble(ctx, tx, ty, x, y); break;
          case '=': drawSpeckled(ctx, tx, ty, x, y, '#d6bc84', '#c2a66e', '#e6d09c'); break;
          case 's': drawSpeckled(ctx, tx, ty, x, y, '#ecd9a0', '#d8c086', '#fff0c0'); break;
          case '~': drawWater(ctx, tx, ty, x, y, f); break;
          default: drawGrass(ctx, tx, ty, x, y);
        }
      }
    }
    frames.push(canvas);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// World objects
// ---------------------------------------------------------------------------

const HOUSE_WALLS = ['#e8d2a8', '#d9bc92', '#e4c8a0', '#d2ae86', '#ead9ba', '#dab690', '#e0c49c'];

/** Window with white frame and cross bars. */
function drawWindow(ctx, x, y, w, h) {
  rect(ctx, WHITE, x, y, w, h);
  rect(ctx, NAVY, x + 1, y + 1, w - 2, h - 2);
  rect(ctx, '#6f8faf', x + 1, y + 1, 1, 2);
  rect(ctx, WHITE, x + Math.floor(w / 2), y, 1, h);
  rect(ctx, WHITE, x, y + Math.floor(h / 2), w, 1);
}

/** Prinzipalmarkt merchant house: stepped gable, windows and arcade (Bogengang), 64x80. */
function drawHouse(ctx, v) {
  const wall = HOUSE_WALLS[v % HOUSE_WALLS.length];
  const trim = '#a88a5e';
  const bodyTop = 22;
  for (let i = 0; i < 5; i++) {
    const inset = 1 + (i + 1) * 5;
    rect(ctx, wall, inset, bodyTop - (i + 1) * 4, 64 - inset * 2, 5);
  }
  rect(ctx, wall, 1, bodyTop, 62, 80 - bodyTop);
  addOutline(ctx.canvas);
  for (let i = 0; i < 5; i++) {
    const inset = 1 + (i + 1) * 5;
    rect(ctx, trim, inset, bodyTop - (i + 1) * 4, 64 - inset * 2, 1);
  }
  // Round gable window
  rect(ctx, WHITE, 29, 9, 6, 6);
  rect(ctx, NAVY, 30, 10, 4, 4);
  rect(ctx, wall, 29, 9);
  rect(ctx, wall, 34, 9);
  rect(ctx, wall, 29, 14);
  rect(ctx, wall, 34, 14);
  rect(ctx, trim, 1, bodyTop, 62, 2);

  if (v === 3) {
    // Münsterhack banner instead of the middle windows
    drawWindow(ctx, 8, 27, 9, 11);
    drawWindow(ctx, 47, 27, 9, 11);
    drawWindow(ctx, 8, 42, 9, 11);
    drawWindow(ctx, 47, 42, 9, 11);
    rect(ctx, BLACK, 23, 25, 18, 31);
    rect(ctx, RED, 24, 26, 16, 29);
    rect(ctx, YELLOW, 24, 26, 16, 1);
    pixelText(ctx, 'MS', 25, 31, WHITE);
    pixelText(ctx, '2026', 25, 45, YELLOW);
    rect(ctx, YELLOW, 24, 54, 16, 1);
  } else {
    for (const wy of [27, 42]) for (const wx of [8, 27, 47]) drawWindow(ctx, wx, wy, 9, 11);
  }

  // Arcade: three arches open to the ground
  rect(ctx, trim, 1, 57, 62, 2);
  for (const ax of [5, 25, 45]) {
    rect(ctx, '#3a2a20', ax + 2, 60, 10, 1);
    rect(ctx, '#3a2a20', ax + 1, 61, 12, 1);
    rect(ctx, '#3a2a20', ax, 62, 14, 18);
    rect(ctx, '#261a12', ax, 62, 14, 2);
  }
  // A shop display in one arch per house for a bit of life
  rect(ctx, [RED, YELLOW][v % 2], [45, 25, 5][v % 3] + 4, 72, 6, 8);
}

/** St. Lamberti church tower with spire, clock and the three iron cages, 48x128. */
function drawTower(ctx) {
  const stone = '#c8ae84';
  const dark = '#a88e66';
  const light = '#dcc49c';
  // Spire
  for (let y = 2; y < 24; y++) {
    const half = Math.round(((y - 2) / 22) * 13) + 1;
    rect(ctx, '#7f8f86', 24 - half, y, half * 2, 1);
  }
  rect(ctx, stone, 10, 24, 28, 20);
  rect(ctx, stone, 6, 44, 36, 84);
  addOutline(ctx.canvas);
  rect(ctx, YELLOW, 23, 0, 2, 2);
  for (let y = 6; y < 24; y += 4) rect(ctx, '#5c6b63', 23, y, 2, 2);
  rect(ctx, '#a4b4aa', 20, 14, 1, 8);
  // Belfry with pointed openings
  rect(ctx, dark, 10, 24, 28, 2);
  for (const bx of [14, 29]) {
    rect(ctx, '#2a1e16', bx + 1, 28, 3, 1);
    rect(ctx, '#2a1e16', bx, 29, 5, 11);
  }
  rect(ctx, dark, 6, 44, 36, 2);
  // Corner buttresses
  rect(ctx, dark, 6, 46, 3, 82);
  rect(ctx, dark, 39, 46, 3, 82);
  rect(ctx, light, 9, 46, 1, 82);
  // The three cages (Täuferkäfige) hanging from the tower
  for (const cx of [13, 22, 31]) {
    rect(ctx, BLACK, cx + 1, 47, 1, 2);
    rect(ctx, BLACK, cx, 49, 4, 6);
    rect(ctx, dark, cx + 1, 50, 2, 4);
    rect(ctx, BLACK, cx + 1, 52, 2, 1);
  }
  // Clock
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y;
      if (d <= 30) rect(ctx, d > 20 ? BLACK : WHITE, 24 + x, 64 + y);
    }
  }
  rect(ctx, BLACK, 24, 60, 1, 5);
  rect(ctx, BLACK, 24, 64, 3, 1);
  // Tall gothic window
  rect(ctx, NAVY, 21, 76, 6, 1);
  rect(ctx, NAVY, 20, 77, 8, 22);
  rect(ctx, WHITE, 23, 77, 2, 22);
  rect(ctx, light, 20, 99, 8, 1);
  // Portal
  rect(ctx, BLACK, 18, 109, 12, 19);
  rect(ctx, BLACK, 20, 107, 8, 2);
  rect(ctx, '#5a3a22', 19, 111, 10, 17);
  rect(ctx, '#5a3a22', 21, 109, 6, 2);
  rect(ctx, '#3e2616', 24, 110, 1, 18);
}

/** Münsterhack stand with banner, spawn point on the plaza, 48x40. */
function drawStand(ctx) {
  rect(ctx, '#5a3a22', 2, 2, 2, 38);
  rect(ctx, '#5a3a22', 44, 2, 2, 38);
  rect(ctx, RED, 4, 3, 40, 16);
  rect(ctx, '#f0f0f0', 6, 25, 36, 3);
  rect(ctx, RED, 6, 28, 36, 12);
  addOutline(ctx.canvas);
  rect(ctx, YELLOW, 4, 3, 40, 1);
  rect(ctx, YELLOW, 4, 18, 40, 1);
  pixelText(ctx, 'MS HACK', 4 + Math.floor((40 - pixelTextWidth('MS HACK')) / 2), 5, WHITE);
  pixelText(ctx, '2026', 4 + Math.floor((40 - pixelTextWidth('2026')) / 2), 12, YELLOW);
  rect(ctx, YELLOW, 6, 31, 36, 2);
  // Laptop and a mug on the table
  rect(ctx, BLACK, 11, 19, 10, 7);
  rect(ctx, '#8aa0b4', 12, 20, 8, 5);
  rect(ctx, '#bbb', 10, 25, 12, 1);
  rect(ctx, BLACK, 32, 21, 5, 5);
  rect(ctx, YELLOW, 33, 22, 3, 4);
}

/** Round-ish linden tree with trunk and soft ground shadow, 32x40. */
function drawTree(ctx) {
  rect(ctx, '#6b4a2a', 14, 26, 4, 11);
  rect(ctx, '#4e341c', 16, 26, 2, 11);
  rect(ctx, '#6b4a2a', 13, 35, 6, 2);
  const blobs = [[16, 14, 12], [9, 18, 7], [23, 18, 7], [16, 7, 8]];
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 32; x++) {
      if (!blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 < r * r)) continue;
      let color = '#3f8a3a';
      if ((x - 12) ** 2 + (y - 9) ** 2 < 40) color = '#5aa84a';
      else if (y > 20 || (x - 20) ** 2 + (y - 20) ** 2 < 30) color = '#2e6b2e';
      if (hash(x, y, 5) < 0.12) color = color === '#2e6b2e' ? '#3f8a3a' : '#2e6b2e';
      rect(ctx, color, x, y);
    }
  }
  addOutline(ctx.canvas);
  ctx.globalCompositeOperation = 'destination-over';
  rect(ctx, 'rgba(0,0,0,0.25)', 8, 36, 16, 3);
  rect(ctx, 'rgba(0,0,0,0.25)', 10, 35, 12, 5);
  ctx.globalCompositeOperation = 'source-over';
}

/** Wooden bench, 32x16. */
function drawBench(ctx) {
  rect(ctx, '#5a3a22', 3, 2, 2, 13);
  rect(ctx, '#5a3a22', 27, 2, 2, 13);
  rect(ctx, '#9a6a3a', 1, 2, 30, 2);
  rect(ctx, '#9a6a3a', 1, 5, 30, 2);
  rect(ctx, '#b8844a', 1, 9, 30, 2);
  addOutline(ctx.canvas);
}

/** Old-town street lamp, 16x40. */
function drawLamp(ctx) {
  rect(ctx, '#2a2a2a', 7, 12, 2, 26);
  rect(ctx, '#2a2a2a', 6, 36, 4, 3);
  rect(ctx, '#2a2a2a', 5, 3, 6, 9);
  rect(ctx, '#2a2a2a', 7, 1, 2, 2);
  addOutline(ctx.canvas);
  rect(ctx, YELLOW, 6, 5, 4, 5);
  rect(ctx, '#fff6b0', 6, 5, 2, 2);
}

const BIKE_COLORS = [RED, YELLOW, NAVY, '#3a9a3a', '#e8e8e8', '#1a1a1a', '#e07020'];
if (BIKE_COLORS.length !== BIKE_COLOR_COUNT) throw new Error('BIKE_COLORS must match BIKE_COLOR_COUNT in map.js');

/** Pixel line (Bresenham). */
function line(ctx, color, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    rect(ctx, color, x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** One side-view bicycle (Leeze) in a 16x16 cell at offset (ox, oy). */
function drawBike(ctx, ox, color, oy = 0) {
  ctx.save();
  ctx.translate(0, oy);
  for (const cx of [4, 12]) {
    for (let y = 6; y < 16; y++) {
      for (let x = cx - 5; x <= cx + 5; x++) {
        const d = Math.hypot(x - cx, y - 11.5);
        if (d > 2.6 && d < 4.2) rect(ctx, '#151515', ox + x, y);
      }
    }
    rect(ctx, '#888', ox + cx, 11);
  }
  line(ctx, color, ox + 4, 11, ox + 7, 6);
  line(ctx, color, ox + 7, 6, ox + 8, 11);
  line(ctx, color, ox + 4, 11, ox + 8, 11);
  line(ctx, color, ox + 8, 11, ox + 11, 6);
  line(ctx, color, ox + 7, 7, ox + 11, 7);
  line(ctx, color, ox + 11, 6, ox + 12, 11);
  rect(ctx, BLACK, ox + 5, 5, 4, 1);
  rect(ctx, '#555', ox + 10, 4, 1, 3);
  rect(ctx, BLACK, ox + 10, 4, 3, 1);
  ctx.restore();
}

/** Row of bikes; more than one bike stands in a rack. */
function drawBikes(ctx, count, v) {
  if (count > 1) {
    rect(ctx, '#6a6a6a', 1, 9, count * 16 - 2, 1);
    for (let i = 0; i < count; i++) rect(ctx, '#6a6a6a', i * 16 + 7, 9, 1, 7);
  }
  for (let i = 0; i < count; i++) drawBike(ctx, i * 16, BIKE_COLORS[bikeColor(v, i)]);
}

// ---------------------------------------------------------------------------
// Riders (20x27, wheels touching the bottom row)
// ---------------------------------------------------------------------------

export const RIDE_W = 20;
export const RIDE_H = 27;
/** How much higher a rider's head is than a walking character's. */
export const RIDE_LIFT = 4;
const riderCache = new Map();

/**
 * Return a cached frame of a character riding a bike; same conventions as getCharacterSprite.
 * @param {number} bike color index of the bike
 * @param {number} frame pedal frame 0-3
 */
export function getRiderSprite(look, dir, frame, breath, blink, bike) {
  const flip = dir === 'left';
  const view = flip ? 'right' : dir;
  const key = `${look}|${view}|${frame}|${breath}|${blink ? 1 : 0}|${bike}`;
  let canvas = riderCache.get(key);
  if (!canvas) {
    let ctx;
    [canvas, ctx] = makeCanvas(RIDE_W, RIDE_H);
    drawRider(ctx, LOOKS[look % LOOKS.length], view, frame, breath, blink, BIKE_COLORS[bike % BIKE_COLORS.length]);
    riderCache.set(key, canvas);
  }
  return { canvas, flip };
}

/** Compose bike, pedaling legs and the (leg-less) character into one rider frame. */
function drawRider(ctx, L, view, frame, breath, blink, color) {
  const [body, bodyCtx] = makeCanvas(CHAR_W, CHAR_H);
  drawCharacter(bodyCtx, L, view, frame, breath, blink, true);
  const legColor = L.shortPants ? L.skin : L.pants;

  if (view === 'right') {
    drawBike(ctx, 2, color, 11);
    // Near-side leg from the hip to the pedal circling around the bottom bracket at (10, 22).
    const [px, py] = [[10, 20], [12, 22], [10, 24], [8, 22]][frame];
    line(ctx, legColor, 9, 17, px, py);
    rect(ctx, L.shoes, px - 1, py, 3, 1);
    ctx.drawImage(body, 1, -1);
    rect(ctx, '#555', 12, 14, 1, 2);
    return;
  }

  const handlebar = () => rect(ctx, BLACK, 4, 13, 12, 1);
  if (view === 'up') handlebar();
  // Legs pedal alternately: one knee up while the other is down.
  [7, 11].forEach((lx, side) => {
    const lift = (frame + side * 2) % 4 < 2 ? 1 : 0;
    rect(ctx, legColor, lx, 17, 2, 3 - lift);
    rect(ctx, L.shoes, lx, 20 - lift, 2, 1);
  });
  ctx.drawImage(body, 2, -1);
  rect(ctx, '#151515', 9, 20, 2, 7);
  if (view === 'down') {
    // Front wheel with fork, headlight and handlebar in front of the body
    rect(ctx, color, 8, 18, 4, 1);
    rect(ctx, color, 8, 19, 1, 3);
    rect(ctx, color, 11, 19, 1, 3);
    rect(ctx, '#555', 9, 14, 2, 4);
    rect(ctx, YELLOW, 9, 17, 2, 1);
    handlebar();
  } else {
    // Rear wheel with mudguard, rack and reflector
    rect(ctx, BLACK, 8, 17, 4, 1);
    rect(ctx, color, 8, 18, 4, 2);
    rect(ctx, RED, 9, 19, 2, 1);
  }
}

/** Draw a shaded ball with outline. */
function drawBall(ctx, cx, cy, r) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 1) continue;
      let color = BLACK;
      if (d <= r) {
        color = '#ece4d0';
        if (x + y > r * 0.5) color = '#d2c8b0';
        if (Math.hypot(x + r / 3, y + r / 3) < r / 4) color = '#fffaf0';
      }
      rect(ctx, color, cx + x, cy + y);
    }
  }
}

/** Claes Oldenburg's "Giant Pool Balls" at the Aasee, 48x34. */
function drawPoolBalls(ctx) {
  drawBall(ctx, 14, 20, 12);
  drawBall(ctx, 35, 18, 10);
  drawBall(ctx, 27, 26, 6);
}

const objectCache = new Map();

/**
 * Return the cached sprite canvas for a map object.
 * @param {{type: string, w: number, v?: number}} obj
 * @returns {HTMLCanvasElement}
 */
export function getObjectSprite(obj) {
  const key = `${obj.type}|${obj.w}|${obj.v ?? 0}`;
  let canvas = objectCache.get(key);
  if (canvas) return canvas;
  const sizes = {
    house: [64, 80], tower: [48, 128], stand: [48, 40], tree: [32, 40],
    bench: [32, 16], lamp: [16, 40], bikes: [obj.w * TILE, 16], poolballs: [48, 34],
  };
  let ctx;
  [canvas, ctx] = makeCanvas(...sizes[obj.type]);
  switch (obj.type) {
    case 'house': drawHouse(ctx, obj.v ?? 0); break;
    case 'tower': drawTower(ctx); break;
    case 'stand': drawStand(ctx); break;
    case 'tree': drawTree(ctx); break;
    case 'bench': drawBench(ctx); break;
    case 'lamp': drawLamp(ctx); break;
    case 'bikes': drawBikes(ctx, obj.w, obj.v ?? 0); break;
    case 'poolballs': drawPoolBalls(ctx); break;
  }
  objectCache.set(key, canvas);
  return canvas;
}
