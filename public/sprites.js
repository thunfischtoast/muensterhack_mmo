/**
 * Procedural pixel-art sprites: characters, ground tiles and world objects.
 *
 * Everything is drawn once at native resolution (16px tiles) into offscreen
 * canvases and cached; game.js scales them up with smoothing disabled.
 */
import { TILE, MAP_W, MAP_H, GROUND, BIKE_COLOR_COUNT, LOOK_COUNT, bikeColor } from './map.js';

const RED = '#DA121A';
const YELLOW = '#FCDD09';
const BLACK = '#000';
const WHITE = '#FFF';
const NAVY = '#2C3E50';

/**
 * Character outfits in the Münsterhack palette, inspired by the event mascots.
 * hairStyle: short | long | bow | cap | ponytail | bun | curly | bob | beanie | scarf (cap = hat/scarf color);
 * pattern: plain | vstripes | hstripe | S; skirt: skirt in the pants color over bare legs.
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
  { skin: '#f3c9a4', hair: '#c2562a', hairStyle: 'ponytail', shirt: YELLOW, pattern: 'plain', accent: RED, pants: RED, skirt: true, shortPants: true, shoes: BLACK },
  { skin: '#c68e64', hair: NAVY, hairStyle: 'scarf', cap: NAVY, shirt: RED, pattern: 'hstripe', accent: YELLOW, pants: '#2a2a2a', shoes: WHITE },
  { skin: '#8d5a3b', hair: '#1c1c1c', hairStyle: 'bun', glasses: true, shirt: WHITE, pattern: 'vstripes', accent: RED, pants: NAVY, skirt: true, shortPants: true, shoes: RED },
  { skin: '#6b4228', hair: '#1c1c1c', hairStyle: 'curly', shirt: YELLOW, pattern: 'hstripe', accent: NAVY, pants: '#555', shoes: YELLOW },
  { skin: '#e2aa7c', hair: '#6b3e1f', hairStyle: 'beanie', cap: YELLOW, shirt: RED, pattern: 'plain', accent: YELLOW, pants: '#2a2a2a', shoes: '#222' },
  { skin: '#f0c4a0', hair: '#7ecfc4', hairStyle: 'bob', shirt: '#2a2a2a', pattern: 'hstripe', accent: YELLOW, pants: RED, shortPants: true, shoes: WHITE },
  { skin: '#8d5a3b', hair: '#2a1a10', hairStyle: 'ponytail', shirt: RED, pattern: 'vstripes', accent: YELLOW, pants: '#3b5a80', shoes: WHITE },
];
if (LOOKS.length !== LOOK_COUNT) throw new Error('LOOKS must match LOOK_COUNT in map.js');

/** 3x5 (M: 5x5, N: 4x5, '.': 1x5) pixel glyphs for the few words drawn into sprites. */
const GLYPHS = {
  M: ['10001', '11011', '10101', '10001', '10001'],
  S: ['111', '100', '111', '001', '111'],
  H: ['101', '101', '111', '101', '101'],
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  K: ['101', '101', '110', '101', '101'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  Z: ['111', '001', '010', '100', '111'],
  L: ['100', '100', '100', '100', '111'],
  T: ['111', '010', '010', '010', '010'],
  O: ['111', '101', '101', '101', '111'],
  U: ['101', '101', '101', '101', '111'],
  'Ü': ['101', '000', '101', '101', '111'],
  B: ['110', '101', '110', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  '.': ['0', '0', '0', '0', '1'],
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
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
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < edge.length; i += 2) rect(ctx, BLACK, edge[i], edge[i + 1]);
  ctx.restore();
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
 * @param {number} wave 0 = arms down, 1/2 = waving frames
 * @returns {{canvas: HTMLCanvasElement, flip: boolean}}
 */
export function getCharacterSprite(look, dir, frame, breath, blink, wave = 0) {
  const flip = dir === 'left';
  const view = flip ? 'right' : dir;
  const key = `${look}|${view}|${frame}|${breath}|${blink ? 1 : 0}|${wave}`;
  let canvas = charCache.get(key);
  if (!canvas) {
    let ctx;
    [canvas, ctx] = makeCanvas(CHAR_W, CHAR_H);
    drawCharacter(ctx, LOOKS[look % LOOKS.length], view, frame, breath, blink, false, wave);
    charCache.set(key, canvas);
  }
  return { canvas, flip };
}

/**
 * Draw one character frame; the outline is added automatically around the silhouette.
 * When riding, only the hips are drawn (legs belong to the bike sprite) and the arms reach for the handlebar.
 */
function drawCharacter(ctx, L, view, frame, breath, blink, riding = false, wave = 0) {
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
  if (L.skirt && !riding) rect(ctx, pantsColor, view === 'right' ? 4 : 3, 15, view === 'right' ? 8 : 10, 3);

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
  if (wave) {
    // One arm raised above the head, the hand moving back and forth
    rect(ctx, L.shirt, 12, 5 + u, 1, 6);
    rect(ctx, L.skin, 12 + wave - 1, 2 + u, 2, 3);
    if (view !== 'right') {
      rect(ctx, L.shirt, 3, 10 + u, 1, 3);
      rect(ctx, L.skin, 3, 13 + u, 1, 2);
    }
  } else if (view === 'right' && riding) {
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
  drawHairStyle(ctx, L, view, hy);
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

/** Hair styles and headwear drawn on top of the basic short haircut. */
function drawHairStyle(ctx, L, view, hy) {
  const side = view === 'right';
  switch (L.hairStyle) {
    case 'ponytail':
      if (view === 'up') rect(ctx, L.hair, 7, hy + 7, 2, 4);
      else if (side) rect(ctx, L.hair, 2, hy + 2, 2, 5);
      else rect(ctx, L.hair, 12, hy + 2, 1, 4);
      break;
    case 'bun':
      rect(ctx, L.hair, 6, hy - 1, 4, 1);
      break;
    case 'curly':
      rect(ctx, L.hair, 3, hy - 1, side ? 9 : 10, 3);
      if (view === 'up') rect(ctx, L.hair, 3, hy, 10, 7);
      else if (side) rect(ctx, L.hair, 3, hy + 2, 4, 4);
      else {
        rect(ctx, L.hair, 3, hy + 2, 1, 4);
        rect(ctx, L.hair, 12, hy + 2, 1, 4);
      }
      break;
    case 'bob':
      if (view === 'up') rect(ctx, L.hair, 3, hy, 10, 7);
      else if (side) rect(ctx, L.hair, 3, hy + 1, 4, 6);
      else {
        rect(ctx, L.hair, 3, hy + 1, 2, 6);
        rect(ctx, L.hair, 11, hy + 1, 2, 6);
      }
      break;
    case 'beanie':
      rect(ctx, L.cap, 4, hy - 1, 8, 3);
      rect(ctx, WHITE, 7, hy - 1, 2, 1);
      break;
    case 'scarf':
      // Headscarf covering hair and neck, face left open
      rect(ctx, L.cap, 3, hy - 1, 10, 10);
      if (view === 'down') rect(ctx, L.skin, 5, hy + 2, 6, 6);
      else if (side) rect(ctx, L.skin, 7, hy + 2, 5, 6);
      break;
  }
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

/** Draw a grass tile with blades, darker tufts and the occasional flower. */
function drawGrass(ctx, tx, ty, x, y) {
  rect(ctx, '#5ca342', x, y, TILE, TILE);
  for (let i = 0; i < 6; i++) {
    const bx = x + Math.floor(hash(tx, ty, i) * 15);
    const by = y + Math.floor(hash(tx, ty, i + 10) * 14);
    rect(ctx, '#468a34', bx, by, 1, 2);
    rect(ctx, '#7cc05a', x + Math.floor(hash(tx, ty, i + 20) * 16), y + Math.floor(hash(tx, ty, i + 30) * 16));
  }
  if (hash(tx, ty, 50) < 0.35) {
    // Tuft: a small "v" of dark blades
    const gx = x + 2 + Math.floor(hash(tx, ty, 51) * 11);
    const gy = y + 3 + Math.floor(hash(tx, ty, 52) * 10);
    rect(ctx, '#3a7a2c', gx, gy, 1, 2);
    rect(ctx, '#3a7a2c', gx + 2, gy, 1, 2);
    rect(ctx, '#3a7a2c', gx + 1, gy + 1, 1, 2);
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

/** Draw a cobblestone tile: offset rows of stones, granite gutter along the arcades, curbs to other ground. */
function drawCobble(ctx, tx, ty, x, y) {
  rect(ctx, '#8a7c64', x, y, TILE, TILE);
  const stones = ['#c4b494', '#bcac8c', '#cfc0a0', '#b4a282'];
  for (let r = 0; r < 4; r++) {
    // Offset every other row using the global pixel row so stones line up across tiles.
    const off = ((ty * 4 + r) % 2) * 3;
    for (let sx = -off; sx < TILE; sx += 6) {
      let color = stones[Math.floor(hash(tx * 4 + sx, ty * 4 + r, 3) * stones.length)];
      // Occasional darker patches so the plaza does not look like wallpaper
      if (hash(Math.floor(tx / 3), Math.floor(ty / 3), 8) < 0.3 && hash(tx * 4 + sx, ty * 4 + r, 9) < 0.5) color = '#a8987a';
      const left = Math.max(sx, 0);
      const right = Math.min(sx + 5, TILE);
      if (right <= left) continue;
      rect(ctx, color, x + left, y + r * 4, right - left, 3);
      if (sx >= 0) rect(ctx, '#ddd0b4', x + sx, y + r * 4);
    }
  }
  if (groundAt(tx, ty - 3) === 'x') {
    // Walkway under and in front of the arcades: large sandstone slabs
    rect(ctx, '#cbbd9c', x, y, TILE, TILE);
    rect(ctx, '#a8987a', x, y + 7, TILE, 1);
    rect(ctx, '#a8987a', x + ((tx % 2) * 8), y, 1, 7);
    rect(ctx, '#a8987a', x + (((tx + 1) % 2) * 8), y + 8, 1, 8);
  }
  if (groundAt(tx, ty - 4) === 'x' && groundAt(tx, ty - 3) !== 'x') {
    // Granite gutter (Rinne) between the arcade walkway and the plaza
    rect(ctx, '#6f685c', x, y + 1, TILE, 3);
    rect(ctx, '#8f887c', x, y + 2, TILE, 1);
  }
  if (hash(tx, ty, 61) < 0.012) {
    // Manhole cover
    rect(ctx, '#4a4a48', x + 5, y + 5, 6, 6);
    rect(ctx, '#4a4a48', x + 4, y + 6, 8, 4);
    rect(ctx, '#6a6a66', x + 6, y + 7, 4, 1);
    rect(ctx, '#6a6a66', x + 6, y + 9, 4, 1);
  }
  // Two-tone curb towards grass and paths
  const curbs = [[0, -1, x, y, TILE, 2], [0, 1, x, y + TILE - 2, TILE, 2], [-1, 0, x, y, 2, TILE], [1, 0, x + TILE - 2, y, 2, TILE]];
  for (const [dx, dy, cx, cy, cw, ch] of curbs) {
    const n = groundAt(tx + dx, ty + dy);
    if (n === 'c' || n === 'x') continue;
    rect(ctx, '#6e624e', cx, cy, cw, ch);
    rect(ctx, '#b9ae98', cx, cy, cw === TILE ? TILE : 1, ch === TILE ? TILE : 1);
  }
}

/** Draw a path tile with speckles; grass creeps in at the edges. */
function drawPath(ctx, tx, ty, x, y) {
  rect(ctx, '#d6bc84', x, y, TILE, TILE);
  for (let i = 0; i < 7; i++) {
    rect(ctx, '#c2a66e', x + Math.floor(hash(tx, ty, i) * 16), y + Math.floor(hash(tx, ty, i + 7) * 16));
    rect(ctx, '#e6d09c', x + Math.floor(hash(tx, ty, i + 14) * 16), y + Math.floor(hash(tx, ty, i + 21) * 16));
  }
  const edges = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  edges.forEach(([dx, dy], e) => {
    if (groundAt(tx + dx, ty + dy) !== '.') return;
    for (let i = 0; i < TILE; i++) {
      const depth = hash(tx * 16 + i, ty * 16 + e, 40) < 0.5 ? 1 : hash(tx * 16 + i, ty * 16 + e, 41) < 0.3 ? 2 : 0;
      if (!depth) continue;
      const px = dx === 0 ? x + i : dx < 0 ? x : x + TILE - depth;
      const py = dy === 0 ? y + i : dy < 0 ? y : y + TILE - depth;
      rect(ctx, '#5ca342', px, py, dx === 0 ? 1 : depth, dy === 0 ? 1 : depth);
    }
  });
}

/** Aaseeterrassen: light stone steps descending towards the water. */
function drawTerrace(ctx, tx, ty, x, y) {
  rect(ctx, '#cfc8b8', x, y, TILE, TILE);
  for (let r = 0; r < TILE; r += 4) {
    rect(ctx, '#e4ded2', x, y + r, TILE, 1);
    rect(ctx, '#a39b8c', x, y + r + 3, TILE, 1);
    // Joints between slabs, staggered per step
    rect(ctx, '#b5ad9e', x + ((r / 4 + tx) % 2) * 8 + 3, y + r + 1, 1, 2);
  }
  for (let i = 0; i < 3; i++) rect(ctx, '#bdb5a6', x + Math.floor(hash(tx, ty, i) * 16), y + Math.floor(hash(tx, ty, i + 5) * 16));
}

/** Wooden jetty planks with darker edge beams. */
function drawJetty(ctx, tx, ty, x, y) {
  rect(ctx, '#a0703f', x, y, TILE, TILE);
  for (let r = 2; r < TILE; r += 3) rect(ctx, '#7a5230', x + 1, y + r, TILE - 2, 1);
  rect(ctx, '#5a3a22', x, y, 2, TILE);
  rect(ctx, '#5a3a22', x + TILE - 2, y, 2, TILE);
  rect(ctx, '#3e2616', x, y + 14, 2, 2);
  rect(ctx, '#3e2616', x + TILE - 2, y + 14, 2, 2);
}

/** Roofscape behind the Prinzipalmarkt: red clay tiles, the odd chimney and dormer. */
function drawRoofs(ctx, tx, ty, x, y) {
  rect(ctx, '#8a3a2a', x, y, TILE, TILE);
  for (let r = 1; r < TILE; r += 3) {
    rect(ctx, '#6e2a1e', x, y + r, TILE, 1);
    for (let c = (r % 2) * 2; c < TILE; c += 4) rect(ctx, '#6e2a1e', x + c, y + r - 1, 1, 1);
  }
  rect(ctx, '#a24a38', x + Math.floor(hash(tx, ty, 1) * 10), y + 2, 5, 1);
  if (hash(tx, ty, 2) < 0.25) {
    rect(ctx, '#5a4a40', x + 5, y + 4, 4, 6);
    rect(ctx, '#3a2e28', x + 5, y + 4, 4, 1);
  } else if (hash(tx, ty, 3) < 0.2) {
    rect(ctx, '#d8c8a8', x + 4, y + 6, 7, 6);
    rect(ctx, NAVY, x + 6, y + 8, 3, 3);
    rect(ctx, '#6e2a1e', x + 3, y + 5, 9, 1);
  }
}

/** Draw a water tile for animation frame f: moving glints, foam along the shore, reeds and lily pads. */
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
  const top = groundAt(tx, ty - 1);
  const left = groundAt(tx - 1, ty);
  if (top !== '~') {
    rect(ctx, '#5a94dc', x, y + 1, TILE, 1);
    for (let i = 0; i < TILE; i++) if ((i + f + tx * 16) % 4 !== 0) rect(ctx, foam, x + i, y);
  }
  if (left !== '~') {
    rect(ctx, '#5a94dc', x + 1, y, 1, TILE);
    for (let i = 0; i < TILE; i++) if ((i + f + ty * 16) % 4 !== 0) rect(ctx, foam, x, y + i);
  }
  if ((top === 't' || left === 't') && hash(tx, ty, 70) < 0.45) {
    // Reeds with cattails along the terraces
    for (let i = 0; i < 4; i++) {
      const rx = x + 2 + Math.floor(hash(tx, ty, 71 + i) * 11);
      const h = 4 + Math.floor(hash(tx, ty, 75 + i) * 5);
      const sway = (f + i) % 4 === 0 ? 1 : 0;
      rect(ctx, '#3f7a2a', rx, y + 13 - h, 1, h);
      rect(ctx, '#5a9a3a', rx + sway, y + 13 - h, 1, 1);
      if (i % 2 === 0) rect(ctx, '#6b4a2a', rx + sway, y + 12 - h, 1, 2);
    }
  } else if (top === '~' && left === '~' && hash(tx, ty, 80) < 0.07) {
    // Lily pad, sometimes flowering
    const px = x + 4 + Math.floor(hash(tx, ty, 81) * 6);
    const py = y + 4 + Math.floor(hash(tx, ty, 82) * 6);
    rect(ctx, '#3f8a3a', px, py + 1, 6, 3);
    rect(ctx, '#3f8a3a', px + 1, py, 4, 5);
    rect(ctx, '#2f6fc4', px + 3, py, 1, 2);
    rect(ctx, '#5aa84a', px + 1, py + 1, 2, 1);
    if (hash(tx, ty, 83) < 0.5) {
      rect(ctx, '#f4a0c0', px + 1, py + 2, 2, 1);
      rect(ctx, '#f4a0c0', px + 2, py + 1, 1, 1);
      rect(ctx, YELLOW, px + 2, py + 2);
    }
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
          case '=': drawPath(ctx, tx, ty, x, y); break;
          case 't': drawTerrace(ctx, tx, ty, x, y); break;
          case 'j': drawJetty(ctx, tx, ty, x, y); break;
          case 'x': drawRoofs(ctx, tx, ty, x, y); break;
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

/**
 * Prinzipalmarkt facades by house index: gable shape and sandstone tone.
 * 'townhall' is the Historic Town Hall (Friedenssaal) with its pinnacled gothic gable.
 */
const HOUSE_STYLES = [
  { gable: 'stepped', wall: '#e8d2a8', sign: RED },
  { gable: 'curved', wall: '#d9bc92', sign: NAVY },
  { gable: 'pointed', wall: '#e4c8a0', sign: YELLOW },
  { gable: 'stepped', wall: '#d2ae86', banner: true },
  { gable: 'curved', wall: '#ead9ba', sign: RED },
  { gable: 'townhall', wall: '#d6ceb8' },
  { gable: 'pointed', wall: '#dab690', sign: YELLOW },
];

/** Window with white frame and cross bars. */
function drawWindow(ctx, x, y, w, h) {
  rect(ctx, WHITE, x, y, w, h);
  rect(ctx, NAVY, x + 1, y + 1, w - 2, h - 2);
  rect(ctx, '#6f8faf', x + 1, y + 1, 1, 2);
  rect(ctx, WHITE, x + Math.floor(w / 2), y, 1, h);
  rect(ctx, WHITE, x, y + Math.floor(h / 2), w, 1);
}

/** Tall gothic window with pointed top and a mullion, framed in `frame`. */
function drawGothicWindow(ctx, x, y, w, h, frame) {
  const half = Math.floor(w / 2);
  for (let i = 0; i < half; i++) rect(ctx, frame, x + half - i - 1, y + i, (i + 1) * 2 + (w % 2), 1);
  rect(ctx, frame, x, y + half, w, h - half);
  for (let i = 1; i < half; i++) rect(ctx, NAVY, x + half - i, y + i + 1, i * 2 - 1 + (w % 2), 1);
  rect(ctx, NAVY, x + 1, y + half + 1, w - 2, h - half - 2);
  rect(ctx, frame, x + half, y + 2, 1, h - 3);
  rect(ctx, '#6f8faf', x + 1, y + half + 1, 1, 3);
}

/** Half width of a gable at row y (2..21) for the given shape; houses are 64 px wide. */
function gableHalf(shape, y) {
  if (shape === 'pointed') return Math.round(3 + ((y - 2) * 28) / 19);
  if (shape === 'curved') return y < 6 ? 5 : Math.round(5 + 25 * Math.sin(((y - 6) / 15) * (Math.PI / 2)));
  return 26 - 5 * Math.floor((21 - y) / 4); // stepped and townhall
}

/** Prinzipalmarkt house: gable, windows and arcade (Bogengang), 64x80. */
function drawHouse(ctx, v) {
  const style = HOUSE_STYLES[v % HOUSE_STYLES.length];
  const { wall, gable } = style;
  const townhall = gable === 'townhall';
  const trim = townhall ? '#aea58e' : '#a88a5e';
  for (let y = 2; y < 22; y++) {
    const half = gableHalf(gable, y);
    rect(ctx, wall, 32 - half, y, half * 2, 1);
  }
  rect(ctx, wall, 1, 22, 62, 58);
  if (gable === 'curved' || townhall) rect(ctx, wall, 31, 0, 2, 2); // finial
  if (townhall) {
    // A pinnacle on the outer corner of every step
    for (let i = 0; i < 5; i++) {
      const top = 22 - (i + 1) * 4;
      const half = 26 - 5 * i;
      rect(ctx, wall, 32 - half, top - 3, 1, 3);
      rect(ctx, wall, 31 + half, top - 3, 1, 3);
    }
  }
  addOutline(ctx.canvas);

  if (gable === 'stepped' || townhall) {
    for (let i = 0; i < 5; i++) rect(ctx, trim, 32 - (26 - 5 * i), 22 - (i + 1) * 4, (26 - 5 * i) * 2, 1);
  }
  rect(ctx, trim, 1, 22, 62, 2);

  if (townhall) {
    // Tracery ribs on the gable, rose-like top window, two rows of tall pointed windows
    for (const lx of [12, 20, 44, 52]) {
      for (let y = 2; y < 22; y++) if (gableHalf('townhall', y) >= Math.abs(lx - 32) + 2) rect(ctx, '#eee8d8', lx, y);
    }
    drawGothicWindow(ctx, 27, 6, 10, 13, WHITE);
    for (const wx of [5, 20, 35, 50]) {
      drawGothicWindow(ctx, wx, 26, 9, 14, WHITE);
      drawGothicWindow(ctx, wx, 42, 9, 12, WHITE);
    }
  } else {
    // Round gable window
    rect(ctx, WHITE, 29, 9, 6, 6);
    rect(ctx, NAVY, 30, 10, 4, 4);
    for (const [cx, cy] of [[29, 9], [34, 9], [29, 14], [34, 14]]) rect(ctx, wall, cx, cy);
    if (gable === 'curved') rect(ctx, trim, 32 - gableHalf('curved', 17), 17, gableHalf('curved', 17) * 2, 1);
    if (style.banner) {
      // Münsterhack banner instead of the middle windows
      for (const [wx, wy] of [[8, 27], [47, 27], [8, 42], [47, 42]]) drawWindow(ctx, wx, wy, 9, 11);
      rect(ctx, BLACK, 23, 25, 18, 31);
      rect(ctx, RED, 24, 26, 16, 29);
      rect(ctx, YELLOW, 24, 26, 16, 1);
      pixelText(ctx, 'MS', 25, 31, WHITE);
      pixelText(ctx, '2026', 25, 45, YELLOW);
      rect(ctx, YELLOW, 24, 54, 16, 1);
    } else {
      for (const wy of [27, 42]) for (const wx of [8, 27, 47]) drawWindow(ctx, wx, wy, 9, 11);
    }
  }

  // Arcade: round arches (pointed at the town hall) open to the ground
  rect(ctx, trim, 1, 57, 62, 2);
  const arches = townhall ? [3, 18, 33, 48].map((x) => [x, 12]) : [5, 25, 45].map((x) => [x, 14]);
  const rise = townhall ? 5 : 2;
  for (const [ax, aw] of arches) {
    for (let i = 0; i < rise; i++) {
      const inset = Math.min(Math.floor(aw / 2) - 1, rise - i);
      rect(ctx, '#3a2a20', ax + inset, 62 - rise + i, aw - inset * 2, 1);
    }
    rect(ctx, '#3a2a20', ax, 62, aw, 18);
    rect(ctx, '#261a12', ax, 62, aw, 2);
  }
  if (townhall) {
    // Gilded "1648" cartouche under the gable: Peace of Westphalia (1648_reloaded, Münsterhack 2023)
    rect(ctx, YELLOW, 23, 19, 18, 7);
    rect(ctx, '#c8a810', 23, 25, 18, 1);
    pixelText(ctx, '1648', 32 - Math.ceil(pixelTextWidth('1648') / 2), 20, '#5a3a10');
  } else {
    // Shop display in one arch and a hanging shop sign on a bracket
    rect(ctx, [RED, YELLOW][v % 2], [45, 25, 5][v % 3] + 4, 72, 6, 8);
    if (style.sign) {
      const sx = [19, 39][v % 2];
      rect(ctx, BLACK, sx, 60, 6, 1);
      rect(ctx, BLACK, sx + 1, 61, 4, 6);
      rect(ctx, style.sign, sx + 2, 62, 2, 4);
    }
  }
}

/** St. Lamberti nave behind the tower: steep slate roof, buttresses, gothic windows, 96x96. */
function drawChurch(ctx) {
  const stone = '#c8ae84';
  const dark = '#a88e66';
  rect(ctx, '#4a5560', 2, 12, 92, 36);
  rect(ctx, stone, 2, 48, 92, 48);
  addOutline(ctx.canvas);
  for (let y = 15; y < 48; y += 4) rect(ctx, '#3a444e', 2, y, 92, 1);
  for (let y = 13; y < 48; y += 8) for (let x = 6 + ((y - 13) / 8) % 2 * 6; x < 92; x += 12) rect(ctx, '#56626e', x, y, 3, 1);
  rect(ctx, '#6a7682', 2, 12, 92, 1);
  rect(ctx, dark, 2, 48, 92, 2);
  // Only the parts left and right of the tower are visible
  for (const bx of [3, 26, 81, 90]) rect(ctx, dark, bx, 50, 3, 46);
  drawGothicWindow(ctx, 11, 56, 10, 30, '#e6d6b4');
  drawGothicWindow(ctx, 84, 56, 5, 30, '#e6d6b4');
}

/** St. Lamberti church tower: openwork spire, belfry, the three iron cages, clock and portal, 48x128. */
function drawTower(ctx) {
  const stone = '#c8ae84';
  const dark = '#a88e66';
  const light = '#dcc49c';
  const spire = '#bca27a';
  const gap = '#2a1e16';
  const half = (y) => 1 + Math.round(((y - 3) / 41) * 13);
  for (let y = 3; y < 44; y++) rect(ctx, spire, 24 - half(y), y, half(y) * 2, 1);
  rect(ctx, stone, 8, 44, 32, 18);
  rect(ctx, stone, 6, 62, 36, 66);
  addOutline(ctx.canvas);
  // Openwork: dark openings between the stone ribs, crockets on the edges
  for (let y = 8; y < 42; y += 4) {
    const h = half(y);
    if (h > 3) {
      rect(ctx, gap, 25 - h, y, h - 3, 2);
      rect(ctx, gap, 26, y, h - 3, 2);
    }
    rect(ctx, light, 23 - h, y, 1, 1);
    rect(ctx, light, 24 + h, y, 1, 1);
  }
  rect(ctx, YELLOW, 23, 0, 2, 3);
  rect(ctx, YELLOW, 22, 1, 4, 1);
  // Belfry with pointed sound openings
  rect(ctx, dark, 8, 44, 32, 2);
  for (const bx of [12, 21, 30]) {
    rect(ctx, gap, bx + 2, 48, 2, 1);
    rect(ctx, gap, bx + 1, 49, 4, 1);
    rect(ctx, gap, bx, 50, 6, 9);
    rect(ctx, dark, bx + 2, 50, 2, 9);
  }
  rect(ctx, dark, 6, 62, 36, 2);
  rect(ctx, dark, 6, 64, 3, 64);
  rect(ctx, dark, 39, 64, 3, 64);
  rect(ctx, light, 9, 64, 1, 64);
  // The three cages (Täuferkäfige), hanging on chains below the belfry
  for (const cx of [12, 21, 30]) {
    rect(ctx, BLACK, cx + 3, 64, 1, 3);
    rect(ctx, BLACK, cx + 1, 67, 5, 1);
    rect(ctx, BLACK, cx, 68, 7, 10);
    rect(ctx, '#7a6446', cx + 1, 69, 5, 8);
    rect(ctx, BLACK, cx + 3, 69, 1, 8);
    rect(ctx, BLACK, cx + 1, 72, 5, 1);
  }
  // Clock
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y;
      if (d <= 30) rect(ctx, d > 20 ? BLACK : WHITE, 24 + x, 88 + y);
    }
  }
  drawGothicWindow(ctx, 20, 96, 8, 14, WHITE);
  // Portal
  rect(ctx, BLACK, 18, 113, 12, 15);
  rect(ctx, BLACK, 20, 111, 8, 2);
  rect(ctx, '#5a3a22', 19, 115, 10, 13);
  rect(ctx, '#5a3a22', 21, 113, 6, 2);
  rect(ctx, '#3e2616', 24, 114, 1, 14);
}

/** The two west towers of St.-Paulus-Dom with green copper roofs, peeking out behind the gables, 96x32. */
function drawDom(ctx) {
  for (const cx of [16, 80]) {
    for (let y = 0; y < 17; y++) {
      const h = Math.round((y / 16) * 8);
      rect(ctx, '#5f9e8a', cx - h, y, h * 2 + 1, 1);
    }
    rect(ctx, '#b0a48c', cx - 8, 17, 17, 15);
  }
  addOutline(ctx.canvas);
  for (const cx of [16, 80]) {
    rect(ctx, YELLOW, cx, 0, 1, 1);
    for (let y = 3; y < 17; y++) rect(ctx, '#8fcfb8', cx - Math.round((y / 16) * 8) + 1, y, 1, 1);
    rect(ctx, '#8e826c', cx - 8, 17, 17, 1);
    for (const ox of [-5, 2]) {
      rect(ctx, '#3a2e24', ox + cx, 20, 4, 7);
      rect(ctx, '#b0a48c', ox + cx, 20, 1, 1);
      rect(ctx, '#b0a48c', ox + cx + 3, 20, 1, 1);
    }
  }
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

/** Lambertibrunnen: stone basin with a column and splashing water, animation frame f, 32x32. */
function drawFountain(ctx, f) {
  const stone = '#b8b0a0';
  rect(ctx, stone, 3, 18, 26, 13);
  rect(ctx, stone, 1, 20, 30, 9);
  rect(ctx, '#a09888', 13, 4, 6, 18);
  rect(ctx, '#a09888', 11, 5, 10, 2);
  rect(ctx, '#6a5434', 15, 0, 2, 5);
  addOutline(ctx.canvas);
  // Water surface inside the rim, front wall below it
  rect(ctx, '#4f8fd8', 4, 20, 24, 5);
  rect(ctx, '#4f8fd8', 3, 21, 26, 3);
  rect(ctx, '#8e8676', 1, 26, 30, 1);
  rect(ctx, '#d0c8b8', 2, 19, 28, 1);
  rect(ctx, '#c4bcac', 15, 7, 1, 14);
  for (let k = 0; k < 4; k++) {
    const gx = 5 + ((k * 7 + f * 3) % 20);
    rect(ctx, '#cfe8ff', gx, 21 + (k % 3), 2, 1);
  }
  // Four jets arcing out of the column; droplets move along them per frame
  for (let k = 0; k < 6; k++) {
    const t = ((k + f * 1.5) % 6) / 6;
    const dx = Math.round(2 + t * 8);
    const dy = Math.round(8 + t * t * 12 - t * 3);
    rect(ctx, '#e4f2ff', 13 - dx, dy, 1, 1);
    rect(ctx, '#e4f2ff', 18 + dx, dy, 1, 1);
  }
  rect(ctx, '#e4f2ff', 15, 5 - (f % 2), 2, 1);
}

/** Wochenmarkt stall with striped awning and crates of produce, 48x40. */
function drawStall(ctx, v) {
  const [a, b] = [[RED, WHITE], [YELLOW, RED], [RED, YELLOW]][v % 3];
  rect(ctx, '#5a3a22', 3, 10, 2, 30);
  rect(ctx, '#5a3a22', 43, 10, 2, 30);
  rect(ctx, a, 1, 4, 46, 10);
  rect(ctx, '#9a6a3a', 2, 26, 44, 5);
  rect(ctx, '#7a5230', 4, 31, 40, 7);
  addOutline(ctx.canvas);
  for (let x = 1; x < 47; x += 8) rect(ctx, b, x, 4, 4, 10);
  // Scalloped awning edge
  for (let x = 1; x < 47; x += 4) rect(ctx, (x - 1) % 8 < 4 ? a : b, x, 14, 3, 1);
  rect(ctx, '#b8844a', 2, 26, 44, 1);
  // Crates on the table, filled with vegetables and fruit
  const produce = [['#d8202a', '#ff5a4a'], ['#e07020', '#ffa040'], ['#3f8a3a', '#7cc05a'], ['#9a7040', '#c09060']];
  for (let i = 0; i < 4; i++) {
    const cx = 5 + i * 10;
    rect(ctx, '#c49a5a', cx, 21, 9, 5);
    rect(ctx, '#8a6030', cx, 23, 9, 1);
    const [dark, light] = produce[(i + v) % produce.length];
    for (let j = 0; j < 4; j++) {
      rect(ctx, dark, cx + 1 + j * 2, 19 + (j % 2), 2, 2);
      rect(ctx, light, cx + 1 + j * 2, 19 + (j % 2));
    }
  }
  // Price sign
  rect(ctx, WHITE, 20, 32, 8, 4);
  rect(ctx, BLACK, 21, 33, 6, 1);
}

/** Kiepenkerl: bronze peddler with his basket (Kiepe) and pipe on a stone plinth, 16x32. */
function drawKiepenkerl(ctx) {
  const bronze = '#6a5434';
  const dark = '#4a3a22';
  const light = '#8e7248';
  rect(ctx, '#9a9a92', 2, 24, 12, 8);
  rect(ctx, bronze, 6, 18, 2, 6);
  rect(ctx, bronze, 9, 18, 2, 6);
  rect(ctx, bronze, 5, 10, 7, 9);
  rect(ctx, dark, 1, 7, 4, 11);
  rect(ctx, bronze, 6, 5, 4, 5);
  rect(ctx, dark, 4, 3, 8, 1);
  rect(ctx, dark, 6, 1, 4, 2);
  rect(ctx, bronze, 12, 10, 1, 14);
  addOutline(ctx.canvas);
  rect(ctx, '#b4b4ac', 2, 24, 12, 1);
  rect(ctx, '#7a7a72', 2, 30, 12, 2);
  rect(ctx, light, 6, 11, 1, 7);
  rect(ctx, light, 7, 6, 1, 3);
  rect(ctx, dark, 5, 14, 7, 1);
  for (let y = 8; y < 18; y += 2) rect(ctx, '#5a4a30', 1, y, 4, 1);
  rect(ctx, BLACK, 10, 8, 2, 1);
  rect(ctx, BLACK, 11, 7, 1, 1);
}

/** Old white street sign reading "PRINZIPALMARKT" on a post, 70x26. */
function drawStreetSign(ctx) {
  rect(ctx, '#555', 34, 12, 2, 14);
  rect(ctx, WHITE, 1, 1, 68, 11);
  addOutline(ctx.canvas);
  // Thin black frame inset from the edge, with a white gap around the lettering
  rect(ctx, BLACK, 2, 2, 66, 1);
  rect(ctx, BLACK, 2, 10, 66, 1);
  rect(ctx, BLACK, 2, 2, 1, 9);
  rect(ctx, BLACK, 67, 2, 1, 9);
  pixelText(ctx, 'PRINZIPALMARKT', 35 - Math.floor(pixelTextWidth('PRINZIPALMARKT') / 2), 4, BLACK);
}

/** Round blue bike-path sign (Radweg) on a post, 16x32. */
function drawBikeSign(ctx) {
  rect(ctx, '#666', 7, 12, 2, 20);
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) rect(ctx, '#1f5fbf', 8 + x, 7 + y);
  }
  addOutline(ctx.canvas);
  // Tiny white bicycle pictogram
  for (const wx of [4, 10]) {
    rect(ctx, WHITE, wx, 8, 3, 1);
    rect(ctx, WHITE, wx, 10, 3, 1);
    rect(ctx, WHITE, wx - 1, 9, 1, 1);
    rect(ctx, WHITE, wx + 3, 9, 1, 1);
  }
  rect(ctx, WHITE, 6, 6, 5, 1);
  rect(ctx, WHITE, 7, 7, 1, 2);
  rect(ctx, WHITE, 10, 5, 1, 2);
  rect(ctx, WHITE, 9, 7, 1, 2);
}

/** Buddenturm: round medieval brick tower with a conical slate roof, 32x64. */
function drawBuddenturm(ctx) {
  for (let y = 4; y < 20; y++) {
    const h = Math.round(((y - 4) / 15) * 14);
    rect(ctx, '#4a5560', 16 - h, y, h * 2, 1);
  }
  rect(ctx, '#9a4a32', 3, 20, 26, 44);
  addOutline(ctx.canvas);
  rect(ctx, '#6a7682', 16, 5, 1, 14);
  rect(ctx, '#6a7682', 18, 12, 1, 7);
  // Bricks with shading for the round shape
  for (let y = 20; y < 64; y++) {
    rect(ctx, '#7a3422', 3, y, 5, 1);
    rect(ctx, '#b25a3e', 18, y, 6, 1);
    rect(ctx, '#7a3422', 26, y, 3, 1);
    if (y % 3 === 0) rect(ctx, '#6e2e1e', 3, y, 26, 1);
    else for (let x = 4 + ((Math.floor(y / 3) % 2) * 3); x < 29; x += 6) rect(ctx, '#6e2e1e', x, y, 1, 1);
  }
  rect(ctx, '#b8ac94', 3, 20, 26, 2);
  for (const [sx, sy] of [[14, 28], [10, 42], [19, 42]]) {
    rect(ctx, BLACK, sx, sy, 2, 6);
  }
  rect(ctx, BLACK, 12, 54, 8, 10);
  rect(ctx, BLACK, 13, 53, 6, 1);
  rect(ctx, '#5a3a22', 13, 55, 6, 9);
}

/** Tree variants: 0 linden (Promenade), 1 round dark beech, 2 conifer; 32x40 with a soft ground shadow. */
function drawTree(ctx, v, deco) {
  rect(ctx, '#6b4a2a', 14, 26, 4, 11);
  rect(ctx, '#4e341c', 16, 26, 2, 11);
  rect(ctx, '#6b4a2a', 13, 35, 6, 2);
  if (v === 2) {
    for (let y = 2; y < 32; y++) {
      const tier = (y - 2) % 10;
      const h = Math.min(13, 2 + Math.floor((y - 2) / 3) + tier);
      rect(ctx, tier < 2 ? '#2a6a3e' : '#1f5a33', 16 - h, y, h * 2, 1);
    }
  } else {
    const blobs = v === 1 ? [[16, 15, 13], [8, 20, 6], [24, 20, 6]] : [[16, 14, 12], [9, 18, 7], [23, 18, 7], [16, 7, 8]];
    const [base, lit, shade] = v === 1 ? ['#2f7a3a', '#4a9a4a', '#1f5a2e'] : ['#3f8a3a', '#5aa84a', '#2e6b2e'];
    for (let y = 0; y < 31; y++) {
      for (let x = 0; x < 32; x++) {
        if (!blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 < r * r)) continue;
        let color = base;
        if ((x - 12) ** 2 + (y - 9) ** 2 < 40) color = lit;
        else if (y > 20 || (x - 20) ** 2 + (y - 20) ** 2 < 30) color = shade;
        if (hash(x, y, 5 + v) < 0.12) color = color === shade ? base : shade;
        rect(ctx, color, x, y);
      }
    }
  }
  addOutline(ctx.canvas);
  if (v === 2) for (let y = 6; y < 30; y += 5) rect(ctx, '#3a8a50', 16 - Math.floor(y / 4), y, 3, 1);
  drawTreeDeco(ctx, deco);
  ctx.globalCompositeOperation = 'destination-over';
  rect(ctx, 'rgba(0,0,0,0.25)', 8, 36, 16, 3);
  rect(ctx, 'rgba(0,0,0,0.25)', 10, 35, 12, 5);
  ctx.globalCompositeOperation = 'source-over';
}

/** Round shrub with a few red berries, 16x16. */
function drawBush(ctx) {
  for (let y = 3; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      if ((x - 7.5) ** 2 / 49 + (y - 9) ** 2 / 36 > 1) continue;
      rect(ctx, y < 8 && x < 9 ? '#5aa84a' : hash(x, y, 31) < 0.2 ? '#2e6b2e' : '#3f8a3a', x, y);
    }
  }
  addOutline(ctx.canvas);
  for (const [bx, by] of [[5, 8], [10, 10], [8, 5]]) rect(ctx, RED, bx, by);
}

/** Flower bed with a stone border, 32x16. */
function drawFlowers(ctx) {
  rect(ctx, '#9a9486', 0, 4, 32, 12);
  rect(ctx, '#6b4a2a', 2, 6, 28, 8);
  addOutline(ctx.canvas);
  const colors = [RED, YELLOW, WHITE, '#e07020'];
  for (let i = 0; i < 18; i++) {
    const fx = 3 + (i % 9) * 3;
    const fy = 7 + Math.floor(i / 9) * 4 - (i % 2);
    rect(ctx, '#3f8a3a', fx, fy + 1, 1, 2);
    rect(ctx, colors[(i * 7) % colors.length], fx, fy, 2, 2);
  }
}

/** Pedal boat (Tretboot) bobbing on the Aasee; v 1 is the swan-shaped one, 16x16. */
function drawBoat(ctx, v, f) {
  ctx.translate(0, f % 2);
  const hull = v === 1 ? WHITE : RED;
  rect(ctx, hull, 1, 8, 14, 5);
  rect(ctx, hull, 2, 13, 12, 1);
  if (v === 1) {
    rect(ctx, WHITE, 11, 2, 2, 7);
    rect(ctx, WHITE, 12, 1, 3, 2);
  }
  addOutline(ctx.canvas);
  if (v === 1) {
    rect(ctx, '#e07020', 15, 2, 1, 1);
    rect(ctx, BLACK, 13, 1, 1, 1);
    rect(ctx, '#dcdcdc', 2, 11, 9, 1);
  } else {
    rect(ctx, WHITE, 1, 11, 14, 1);
  }
  rect(ctx, YELLOW, 4, 9, 3, 2);
  rect(ctx, YELLOW, 8, 9, 3, 2);
  rect(ctx, '#2a62b2', 0, 14, 16, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Leezenflow (born at Münsterhack 2019): LED panel on a pole before the bike traffic light,
 * its bar shrinking with the time left in the current green or red phase, 16x40.
 */
function drawLeezenflow(ctx, f) {
  const half = SIGNAL_FRAMES / 2;
  const green = f < half;
  const left = half - (f % half); // LEDs still lit, one goes out per frame
  rect(ctx, '#666', 7, 18, 2, 22);
  rect(ctx, '#1c1c1c', 1, 2, 14, 16);
  addOutline(ctx.canvas);
  rect(ctx, '#333', 1, 2, 14, 1);
  // Bicycle icon above the LED bar
  rect(ctx, WHITE, 4, 7, 2, 1);
  rect(ctx, WHITE, 10, 7, 2, 1);
  rect(ctx, WHITE, 6, 5, 4, 1);
  rect(ctx, WHITE, 7, 6, 1, 1);
  rect(ctx, WHITE, 9, 4, 1, 2);
  // LED bar: 10 columns, lit from the left
  for (let i = 0; i < 10; i++) {
    const on = i < left;
    rect(ctx, on ? (green ? '#3cf06a' : '#ff3a3a') : '#3a3a3a', 3 + i, 10, 1, 4);
  }
  rect(ctx, '#1c1c1c', 3, 12, 10, 1);
  // Münsterhack sticker on the pole
  rect(ctx, RED, 7, 24, 2, 3);
  rect(ctx, YELLOW, 7, 24, 2, 1);
}

/** Bike traffic light the Leezenflow counts down to: red on top, green below, 16x40. */
function drawBikeLight(ctx, f) {
  const green = f < SIGNAL_FRAMES / 2;
  rect(ctx, '#666', 7, 18, 2, 22);
  rect(ctx, '#1c1c1c', 4, 2, 8, 16);
  addOutline(ctx.canvas);
  rect(ctx, YELLOW, 4, 18, 8, 1);
  for (const [y, lit, on, off] of [[4, !green, '#ff3a3a', '#5a1a1a'], [11, green, '#3cf06a', '#1a4a24']]) {
    rect(ctx, lit ? on : off, 5, y + 1, 6, 4);
    rect(ctx, lit ? on : off, 6, y, 4, 6);
    if (lit) rect(ctx, WHITE, 6, y + 1, 1, 1);
  }
}

/**
 * Tree decorations: 'bag' is a Humiditree watering bag (Münsterhack 2019) around the trunk,
 * 'nestbox' a Nestflix smart nest box (Münsterhack 2025) with its red recording light.
 */
function drawTreeDeco(ctx, deco) {
  if (deco === 'bag') {
    rect(ctx, BLACK, 10, 29, 12, 8);
    rect(ctx, '#2e8b3a', 11, 30, 10, 6);
    rect(ctx, '#1f6a2a', 11, 32, 10, 1);
    rect(ctx, '#4fb85a', 12, 30, 3, 1);
    rect(ctx, WHITE, 18, 33, 2, 2);
  } else if (deco === 'nestbox') {
    rect(ctx, BLACK, 11, 21, 10, 12);
    rect(ctx, '#8a5a2a', 12, 24, 8, 8);
    rect(ctx, '#5a3a1a', 11, 22, 10, 2);
    rect(ctx, BLACK, 15, 26, 2, 2);
    rect(ctx, RED, 18, 25, 1, 1);
  }
}

/** Hack(a)Tonne (Münsterhack 2018): floating water-quality probe with antenna and blinking LED, 16x16. */
function drawBuoy(ctx, f) {
  ctx.translate(0, f % 2);
  rect(ctx, YELLOW, 4, 6, 8, 7);
  rect(ctx, YELLOW, 5, 5, 6, 1);
  rect(ctx, '#555', 7, 1, 1, 4);
  addOutline(ctx.canvas);
  rect(ctx, RED, 4, 9, 8, 2);
  rect(ctx, '#fff6b0', 5, 6, 2, 2);
  rect(ctx, f < 2 ? '#3cf06a' : '#2a5a34', 6, 0, 3, 2);
  rect(ctx, '#d4ecff', 2, 13, 12, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Givebox / Kiepenkiste (Münsterhack 2022 / 2025): little wooden sharing cabinet with books and cups, 16x32. */
function drawGivebox(ctx) {
  rect(ctx, '#8a5a2a', 2, 8, 12, 22);
  rect(ctx, '#5a3a1a', 1, 6, 14, 2);
  rect(ctx, '#5a3a1a', 3, 4, 10, 2);
  rect(ctx, '#5a3a1a', 5, 2, 6, 2);
  rect(ctx, '#5a3a1a', 3, 30, 2, 2);
  rect(ctx, '#5a3a1a', 11, 30, 2, 2);
  addOutline(ctx.canvas);
  rect(ctx, '#3a2616', 3, 10, 10, 18);
  rect(ctx, '#8a5a2a', 3, 16, 10, 1);
  rect(ctx, '#8a5a2a', 3, 22, 10, 1);
  rect(ctx, RED, 4, 12, 2, 4);
  rect(ctx, YELLOW, 6, 13, 1, 3);
  rect(ctx, NAVY, 7, 12, 2, 4);
  rect(ctx, WHITE, 10, 14, 2, 2);
  rect(ctx, '#3a9a3a', 4, 18, 3, 4);
  rect(ctx, WHITE, 8, 19, 2, 3);
  rect(ctx, RED, 11, 20, 1, 2);
  rect(ctx, YELLOW, 5, 24, 4, 3);
  // Heart on the gable
  rect(ctx, RED, 6, 4, 1, 1);
  rect(ctx, RED, 9, 4, 1, 1);
  rect(ctx, RED, 6, 5, 4, 1);
  rect(ctx, RED, 7, 6, 2, 1);
}

/** Leihleeze (Münsterhack 2017) sign for the bike lending at the rack, 44x26. */
function drawLeihleezeSign(ctx) {
  rect(ctx, '#555', 21, 12, 2, 14);
  rect(ctx, '#2e8b3a', 1, 1, 42, 11);
  addOutline(ctx.canvas);
  rect(ctx, WHITE, 2, 2, 40, 1);
  rect(ctx, WHITE, 2, 10, 40, 1);
  pixelText(ctx, 'LEIHLEEZE', 22 - Math.floor(pixelTextWidth('LEIHLEEZE') / 2), 4, WHITE);
}

/** Kraut und Rüben (Münsterhack 2019) chalkboard at the Wochenmarkt, 28x28. */
function drawChalkboard(ctx) {
  rect(ctx, '#8a5a2a', 4, 22, 2, 6);
  rect(ctx, '#8a5a2a', 22, 22, 2, 6);
  rect(ctx, '#8a5a2a', 1, 1, 26, 21);
  addOutline(ctx.canvas);
  rect(ctx, '#2a4a3a', 2, 2, 24, 19);
  for (const [word, y] of [['KRAUT', 4], ['UND', 10], ['RÜBEN', 16]]) {
    pixelText(ctx, word, 14 - Math.ceil(pixelTextWidth(word) / 2), y, '#f0f0e8');
  }
}

/** Corndex noise levels the kiosk display cycles through; the beer price rises by 30 ct per level. */
const KIOSK_LEVELS = [0, 1, 2, 3, 4, 3, 2, 1];

/** Kiosk (Büdchen) at the Aasee with a Corndex display (Münsterhack 2024): louder means pricier beer, 48x48. */
function drawKiosk(ctx, f) {
  const level = KIOSK_LEVELS[f];
  rect(ctx, '#e8e2d0', 2, 14, 44, 34);
  rect(ctx, '#3a6ea8', 0, 6, 48, 8);
  addOutline(ctx.canvas);
  pixelText(ctx, 'KIOSK', 24 - Math.ceil(pixelTextWidth('KIOSK') / 2), 8, WHITE);
  // Serving hatch with bottles on the shelf and a counter
  rect(ctx, BLACK, 5, 18, 22, 15);
  rect(ctx, '#5a4a3a', 6, 19, 20, 13);
  for (let i = 0; i < 6; i++) rect(ctx, ['#3a7a2a', '#8a5a2a', YELLOW][i % 3], 8 + i * 3, 22, 2, 5);
  rect(ctx, '#b8844a', 4, 32, 24, 2);
  // Door
  rect(ctx, BLACK, 33, 29, 10, 19);
  rect(ctx, '#6a4a2a', 34, 30, 8, 18);
  rect(ctx, YELLOW, 40, 39, 1, 1);
  // Corndex display: current beer price and the noise meter driving it
  rect(ctx, BLACK, 30, 15, 16, 12);
  const price = (1.5 + level * 0.3).toFixed(2);
  pixelText(ctx, price, 38 - Math.ceil(pixelTextWidth(price) / 2), 16, YELLOW);
  const meter = ['#3cf06a', '#9cf03a', '#f0e03a', '#f0a03a', '#ff3a3a'];
  for (let i = 0; i < 5; i++) rect(ctx, i <= level ? meter[i] : '#333', 32 + i * 3, 23, 2, 2);
  // Beer crate by the wall
  rect(ctx, BLACK, 5, 40, 10, 8);
  rect(ctx, '#c49a5a', 6, 41, 8, 6);
  for (let i = 0; i < 4; i++) rect(ctx, '#3a7a2a', 6 + i * 2, 39, 1, 2);
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
export function getRiderSprite(look, dir, frame, breath, blink, bike, wave = 0) {
  const flip = dir === 'left';
  const view = flip ? 'right' : dir;
  const key = `${look}|${view}|${frame}|${breath}|${blink ? 1 : 0}|${bike}|${wave}`;
  let canvas = riderCache.get(key);
  if (!canvas) {
    let ctx;
    [canvas, ctx] = makeCanvas(RIDE_W, RIDE_H);
    drawRider(ctx, LOOKS[look % LOOKS.length], view, frame, breath, blink, BIKE_COLORS[bike % BIKE_COLORS.length], wave);
    riderCache.set(key, canvas);
  }
  return { canvas, flip };
}

/** Compose bike, pedaling legs and the (leg-less) character into one rider frame. */
function drawRider(ctx, L, view, frame, breath, blink, color, wave) {
  const [body, bodyCtx] = makeCanvas(CHAR_W, CHAR_H);
  drawCharacter(bodyCtx, L, view, frame, breath, blink, true, wave);
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

// ---------------------------------------------------------------------------
// Birds on the Aasee (facing right; game.js mirrors them)
// ---------------------------------------------------------------------------

const birdCache = new Map();

/**
 * Return a cached bird frame; frame 1 bobs 1px down (paddling).
 * @param {'duck'|'duckling'|'swan'} kind
 */
export function getBirdSprite(kind, frame) {
  const key = `${kind}|${frame}`;
  let canvas = birdCache.get(key);
  if (canvas) return canvas;
  const size = { duck: [14, 11], duckling: [9, 8], swan: [18, 15] }[kind];
  let ctx;
  [canvas, ctx] = makeCanvas(...size);
  ctx.translate(0, frame);
  if (kind === 'duck') {
    // Mallard: brown body, green head, white collar, yellow bill
    rect(ctx, '#8a6a4a', 2, 5, 9, 3);
    rect(ctx, '#5a4030', 1, 4, 2, 2);
    rect(ctx, '#6b4f35', 4, 5, 4, 1);
    rect(ctx, WHITE, 8, 4, 2, 1);
    rect(ctx, '#2e7d32', 8, 1, 3, 3);
    rect(ctx, BLACK, 9, 2);
    rect(ctx, '#f0b000', 11, 2, 2, 1);
  } else if (kind === 'duckling') {
    rect(ctx, YELLOW, 1, 3, 5, 2);
    rect(ctx, YELLOW, 4, 1, 2, 2);
    rect(ctx, BLACK, 5, 1);
    rect(ctx, '#e07020', 6, 2);
  } else {
    // Mute swan: white body, S-shaped neck, orange bill with black knob
    rect(ctx, WHITE, 2, 8, 11, 4);
    rect(ctx, WHITE, 1, 7, 3, 2);
    rect(ctx, '#dcdcdc', 4, 9, 7, 1);
    rect(ctx, WHITE, 11, 4, 2, 5);
    rect(ctx, WHITE, 12, 2, 3, 2);
    rect(ctx, BLACK, 13, 3);
    rect(ctx, '#e07020', 15, 3, 2, 1);
  }
  addOutline(canvas);
  birdCache.set(key, canvas);
  return canvas;
}

/** Empty bike rack: one bent-steel stand per slot, yellow ground marking, 16 px per slot. */
function drawRack(ctx, count) {
  rect(ctx, '#e0c020', 0, 14, count * TILE, 1);
  for (let i = 0; i < count; i++) {
    const x = i * TILE;
    rect(ctx, '#8a8a8a', x + 3, 6, 1, 10);
    rect(ctx, '#8a8a8a', x + 12, 6, 1, 10);
    rect(ctx, '#8a8a8a', x + 4, 5, 8, 1);
    rect(ctx, '#bdbdbd', x + 4, 5, 3, 1);
  }
  addOutline(ctx.canvas);
}

const looseBikeCache = new Map();

/**
 * Leezen-Chaos bike in a color: standing in a rack slot, or knocked over (flattened) on the ground.
 * @param {number} color bike color index
 * @param {boolean} lying knocked over
 */
export function getLooseBikeSprite(color, lying) {
  const key = `${color}|${lying}`;
  let canvas = looseBikeCache.get(key);
  if (canvas) return canvas;
  const [upright, uctx] = makeCanvas(TILE, TILE);
  drawBike(uctx, 0, BIKE_COLORS[color % BIKE_COLORS.length]);
  if (lying) {
    let ctx;
    [canvas, ctx] = makeCanvas(TILE, 9);
    ctx.imageSmoothingEnabled = false;
    rect(ctx, 'rgba(0,0,0,0.25)', 1, 5, 14, 3);
    ctx.drawImage(upright, 0, 4, TILE, 12, 0, 1, TILE, 7);
  } else {
    canvas = upright;
  }
  looseBikeCache.set(key, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Ambient easter eggs (squirrel, cat, fish, tower keeper, mascot at the window) and NPC props
// ---------------------------------------------------------------------------

const critterCache = new Map();

/**
 * Return a cached sprite for a small ambient creature. Sprites face right; game.js mirrors them.
 * @param {'squirrel'|'cat'|'fish'|'keeper'|'mascot'|'umbrella'|'laptop'} kind
 * @param {number} frame squirrel: hop 0/1; cat: 0 asleep, 1 tail twitch, 2 awake; mascot: wave 0/1; laptop: typing 0/1
 */
export function getCritterSprite(kind, frame = 0) {
  const key = `${kind}|${frame}`;
  let canvas = critterCache.get(key);
  if (canvas) return canvas;
  const size = { squirrel: [12, 10], cat: [14, 11], fish: [8, 5], keeper: [9, 10], mascot: [7, 9], umbrella: [13, 7], laptop: [12, 7] }[kind];
  let ctx;
  [canvas, ctx] = makeCanvas(...size);
  switch (kind) {
    case 'squirrel': {
      const hop = frame === 1 ? -1 : 0;
      rect(ctx, '#c86a3a', 1, 1 + hop, 3, 5);
      rect(ctx, '#c86a3a', 2, 0 + hop, 2, 1);
      rect(ctx, '#b5562a', 4, 4 + hop, 4, 3);
      rect(ctx, '#b5562a', 7, 3 + hop, 3, 3);
      rect(ctx, '#b5562a', 8, 2 + hop, 1, 1);
      rect(ctx, '#b5562a', frame === 1 ? 5 : 4, 7 + hop, 1, 1);
      rect(ctx, '#b5562a', frame === 1 ? 6 : 7, 7 + hop, 1, 1);
      addOutline(canvas);
      rect(ctx, BLACK, 9, 4 + hop, 1, 1);
      rect(ctx, '#e8a070', 5, 5 + hop, 2, 1);
      break;
    }
    case 'cat': {
      // Orange tabby, curled up; awake it lifts its head and opens its eyes
      const headY = frame === 2 ? 2 : 4;
      rect(ctx, '#e08a3a', 2, 5, 8, 4);
      rect(ctx, '#e08a3a', 3, 4, 6, 1);
      rect(ctx, '#e08a3a', 8, headY, 4, 3);
      rect(ctx, '#e08a3a', 8, headY - 1, 1, 1);
      rect(ctx, '#e08a3a', 11, headY - 1, 1, 1);
      rect(ctx, '#c86a2a', 2, 9, 7, 1);
      if (frame === 1) rect(ctx, '#c86a2a', 1, 7, 1, 2);
      addOutline(canvas);
      for (const sx of [4, 6]) rect(ctx, '#c86a2a', sx, 5, 1, 3);
      if (frame === 2) {
        rect(ctx, '#3a9a3a', 9, headY + 1, 1, 1);
        rect(ctx, '#3a9a3a', 11, headY + 1, 1, 1);
      } else {
        rect(ctx, '#7a4a1a', 9, headY + 1, 3, 1);
      }
      rect(ctx, '#f0b0a0', 10, headY + 2, 1, 1);
      break;
    }
    case 'fish':
      rect(ctx, '#c8d0d8', 2, 1, 5, 2);
      rect(ctx, '#c8d0d8', 1, 0, 1, 1);
      rect(ctx, '#c8d0d8', 1, 3, 1, 1);
      rect(ctx, '#e8f0f8', 3, 1, 3, 1);
      rect(ctx, BLACK, 6, 1, 1, 1);
      break;
    case 'keeper':
      // Tower keeper (Türmerin) of St. Lamberti with her copper horn
      rect(ctx, '#f0c4a0', 2, 1, 3, 3);
      rect(ctx, '#2a2a2a', 2, 0, 3, 1);
      rect(ctx, '#7a1a1a', 1, 4, 5, 6);
      rect(ctx, '#c87533', 5, 2, 2, 1);
      rect(ctx, '#e0954a', 7, 1, 2, 3);
      break;
    case 'mascot':
      // The Münsterhack mascot with the yellow bow, waving from a window
      rect(ctx, '#3a4a5a', 0, 0, 7, 9);
      rect(ctx, '#f3c9a4', 2, 2, 3, 3);
      rect(ctx, '#6b3e1f', 2, 1, 3, 1);
      rect(ctx, '#6b3e1f', 1, 2, 1, 3);
      rect(ctx, YELLOW, 1, 0, 2, 1);
      rect(ctx, YELLOW, 4, 0, 2, 1);
      rect(ctx, BLACK, 3, 3, 1, 1);
      rect(ctx, YELLOW, 1, 5, 5, 4);
      rect(ctx, RED, 2, 6, 1, 3);
      rect(ctx, RED, 4, 6, 1, 3);
      rect(ctx, '#f3c9a4', frame === 1 ? 6 : 5, 1, 1, 3);
      break;
    case 'umbrella':
      // The tour guide's raised umbrella, so the group can find her
      rect(ctx, RED, 2, 2, 9, 2);
      rect(ctx, RED, 1, 4, 11, 1);
      rect(ctx, RED, 4, 1, 5, 1);
      rect(ctx, YELLOW, 6, 2, 1, 3);
      rect(ctx, YELLOW, 6, 0, 1, 1);
      addOutline(canvas);
      break;
    case 'laptop':
      // Back of an open laptop with a Münsterhack sticker, hands typing at the sides
      rect(ctx, '#b8bcc4', 2, 1, 8, 5);
      rect(ctx, '#8a8e96', 2, 5, 8, 1);
      addOutline(canvas);
      rect(ctx, RED, 5, 2, 2, 2);
      rect(ctx, '#f3c9a4', 0, frame ? 4 : 5, 1, 1);
      rect(ctx, '#f3c9a4', 11, frame ? 5 : 4, 1, 1);
      break;
  }
  critterCache.set(key, canvas);
  return canvas;
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

/** Leezenflow and its bike traffic light: green for the first half of the cycle, red for the second. */
const SIGNAL_FRAMES = 20;

/**
 * Animated object types: frame count and frame duration in ms. Frames follow the wall clock,
 * so Leezenflow and the traffic light show the same phase for every player.
 */
export const ANIMATED_OBJECTS = {
  fountain: { frames: WATER_FRAMES, ms: 350 },
  boat: { frames: WATER_FRAMES, ms: 350 },
  leezenflow: { frames: SIGNAL_FRAMES, ms: 1000 },
  bikelight: { frames: SIGNAL_FRAMES, ms: 1000 },
  buoy: { frames: WATER_FRAMES, ms: 350 },
  kiosk: { frames: KIOSK_LEVELS.length, ms: 700 },
};

/**
 * Return the cached sprite canvas for a map object.
 * @param {{type: string, w: number, v?: number}} obj
 * @param {number} frame animation frame, only used by ANIMATED_OBJECTS
 * @returns {HTMLCanvasElement}
 */
export function getObjectSprite(obj, frame = 0) {
  const v = obj.v ?? 0;
  const key = [obj.type, obj.w, v, frame, obj.deco ?? ''].join('|');
  let canvas = objectCache.get(key);
  if (canvas) return canvas;
  const sizes = {
    house: [64, 80], tower: [48, 128], church: [96, 96], dom: [96, 32], stand: [48, 40], tree: [32, 40],
    bench: [32, 16], lamp: [16, 40], bikes: [obj.w * TILE, 16], poolballs: [48, 34], fountain: [32, 32],
    stall: [48, 40], kiepenkerl: [16, 32], streetsign: [70, 26], bikesign: [16, 32], buddenturm: [32, 64],
    bush: [16, 16], flowers: [32, 16], boat: [16, 16], rack: [obj.w * TILE, 16], leezenflow: [16, 40], bikelight: [16, 40],
    buoy: [16, 16], givebox: [16, 32], leihleeze: [44, 26], chalkboard: [28, 28], kiosk: [48, 48],
  };
  let ctx;
  [canvas, ctx] = makeCanvas(...sizes[obj.type]);
  switch (obj.type) {
    case 'house': drawHouse(ctx, v); break;
    case 'tower': drawTower(ctx); break;
    case 'church': drawChurch(ctx); break;
    case 'dom': drawDom(ctx); break;
    case 'stand': drawStand(ctx); break;
    case 'tree': drawTree(ctx, v, obj.deco); break;
    case 'bench': drawBench(ctx); break;
    case 'lamp': drawLamp(ctx); break;
    case 'bikes': drawBikes(ctx, obj.w, v); break;
    case 'poolballs': drawPoolBalls(ctx); break;
    case 'fountain': drawFountain(ctx, frame); break;
    case 'stall': drawStall(ctx, v); break;
    case 'kiepenkerl': drawKiepenkerl(ctx); break;
    case 'streetsign': drawStreetSign(ctx); break;
    case 'bikesign': drawBikeSign(ctx); break;
    case 'buddenturm': drawBuddenturm(ctx); break;
    case 'bush': drawBush(ctx); break;
    case 'flowers': drawFlowers(ctx); break;
    case 'boat': drawBoat(ctx, v, frame); break;
    case 'rack': drawRack(ctx, obj.w); break;
    case 'leezenflow': drawLeezenflow(ctx, frame); break;
    case 'bikelight': drawBikeLight(ctx, frame); break;
    case 'buoy': drawBuoy(ctx, frame); break;
    case 'givebox': drawGivebox(ctx); break;
    case 'leihleeze': drawLeihleezeSign(ctx); break;
    case 'chalkboard': drawChalkboard(ctx); break;
    case 'kiosk': drawKiosk(ctx, frame); break;
  }
  objectCache.set(key, canvas);
  return canvas;
}
