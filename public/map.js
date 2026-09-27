/**
 * World map shared by the browser client and the Node server.
 *
 * Plain ES module without browser or Node APIs, so both sides import the same
 * tile grid, object list and collision data.
 */

import { YEARS, BOARDS } from './museum.js';

export const TILE = 16;
export const MAP_W = 40;
/** The city fills rows 0-29; the Münsterhack museum below it is only reachable through its door. */
export const MUSEUM_Y = 30;
export const MAP_H = MUSEUM_Y + 40;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Number of character outfits; the server picks one per player, sprites.js defines them. */
export const LOOK_COUNT = 15;

/** Tile rectangle on the plaza (in front of the Münsterhack stand) where players spawn. */
export const SPAWN = { x: 12, y: 11, w: 9, h: 4 };

/**
 * Ground tiles, one character per tile.
 * '.' grass, 'c' cobblestone (Prinzipalmarkt), '=' path, 't' stone terrace steps (Aaseeterrassen),
 * 'j' wooden jetty, '~' water (Aasee, solid), 'x' roofs behind the Prinzipalmarkt (backdrop, solid).
 * Museum: 'f' parquet, 'r' red carpet, 'm' marble, 'd' exit door, 'w' wall and '_' void (both solid).
 */
export const GROUND = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..==..',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..==..',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  '..............==....................==..',
  '..............==....................==..',
  '..====================================..',
  '........................................',
  '....................tttttttttttttttttttt',
  '..................tt~~~~~~~~~~~~~~~~~~j~',
  '................ttt~~~~~~~~~~~~~~~~~~~j~',
  '...............tt~~~~~~~~~~~~~~~~~~~~~j~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............tt~~~~~~~~~~~~~~~~~~~~~~~~',
];

/**
 * Year rooms (tiles): interior rectangle, oldest at the bottom left next to the hall, 2026 at the top right.
 * Five floors with a room left and right of the carpeted corridor (x 19-20); each room holds its projects
 * in two rows along its top and bottom walls, one tile apart, so its width follows the number of projects.
 */
export const MUSEUM_ROOMS = YEARS.map(({ year, projects }, i) => {
  const w = Math.ceil(projects.length / 2) * 2 + 1;
  return { year, count: projects.length, x: i % 2 ? 22 : 18 - w, y: MUSEUM_Y + (4 - Math.floor(i / 2)) * 6 + 1, w, h: 5 };
});

/** Museum rows, appended to GROUND: void, carved into year rooms, corridor and the entrance hall with the exit door. */
const museum = Array.from({ length: MAP_H - MUSEUM_Y }, () => Array(MAP_W).fill('_'));
const carve = (x, y, w, h, c) => {
  for (let ty = y; ty < y + h; ty++) museum[ty].fill(c, x, x + w);
};
for (const r of MUSEUM_ROOMS) {
  const y = r.y - MUSEUM_Y;
  carve(r.x - 1, y - 1, r.w + 2, r.h + 2, 'w');
  carve(r.x, y, r.w, r.h, 'f');
}
carve(8, 30, 24, 10, 'w');
carve(9, 31, 22, 8, 'm');
carve(19, 31, 2, 8, 'r');
carve(18, 0, 4, 30, 'w');
carve(19, 1, 2, 30, 'r');
// Doorways from the corridor into the middle three rows of every room
for (const r of MUSEUM_ROOMS) carve(r.x < 19 ? 18 : 21, r.y - MUSEUM_Y + 1, 1, 3, 'f');
carve(19, 39, 2, 1, 'd');
GROUND.push(...museum.map((row) => row.join('')));

/** Walking onto a door tile moves the player to `to` (feet in pixels): the museum house and the hall exit. */
export const DOORS = [
  { x: 17, y: 4, w: 2, h: 1, to: { x: 20 * TILE, y: (MUSEUM_Y + 37) * TILE + 12, dir: 'up' } },
  { x: 19, y: MUSEUM_Y + 39, w: 2, h: 1, to: { x: 18 * TILE, y: 5 * TILE + 12, dir: 'down' } },
];

/** Info on the museum house, so players standing in front learn that they can go in. */
const MUSEUM_INFO = {
  name: 'Münsterhack-Museum', year: 'Eintritt frei', label: 'Hier geht es rein',
  desc: 'Lauf durch die Tür: alle Münsterhack-Projekte seit 2017, ein Raum pro Jahr.',
};

/** Earlier Münsterhack projects referenced in the world (see README). */
const PROJECTS = {
  leihleeze: { name: 'Leihleeze', year: '2017' },
  hackatonne: { name: 'Hack(a)Tonne', year: '2018' },
  krautUndRueben: { name: 'Kraut und Rüben / MüMa', year: '2019 / 2024' },
  leezenflow: { name: 'Grüne Welle / Leezenflow', year: '2019' },
  humiditree: { name: 'Humiditree', year: '2019' },
  givebox: { name: 'Givebox Network / Kiepenkiste', year: '2022 / 2025' },
  reloaded1648: { name: '1648_reloaded', year: '2023' },
  corndex: { name: 'Corndex', year: '2024' },
  nestflix: { name: 'Nestflix', year: '2025' },
};

/**
 * World objects. x/y/w/h is the solid footprint in tiles; the sprite is drawn
 * bottom-aligned and horizontally centered on it and may extend above it.
 * `v` selects a variant (house facade, bike colors, tree kind, stall awning); `info` marks a
 * reference to an earlier Münsterhack project, shown to players who walk up to it.
 */
export const OBJECTS = [
  // Backdrop: the two west towers of St.-Paulus-Dom peeking out behind the gables
  { type: 'dom', x: 7, y: 0, w: 6, h: 2 },
  // Prinzipalmarkt: gabled merchant houses with arcades; v = 5 is the historic town hall, v = 7 the museum
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({
    type: 'house', x: i * 4, y: 3, w: 4, h: 2, v: i === 4 ? 7 : i, info: i === 5 ? PROJECTS.reloaded1648 : i === 4 ? MUSEUM_INFO : undefined,
  })),
  // St. Lamberti: nave behind the tower, Lambertibrunnen in front
  { type: 'church', x: 28, y: 3, w: 6, h: 3 },
  { type: 'tower', x: 30, y: 6, w: 3, h: 2 },
  { type: 'fountain', x: 26, y: 10, w: 2, h: 1 },
  { type: 'stand', x: 15, y: 9, w: 3, h: 1 },
  { type: 'streetsign', x: 13, y: 6, w: 1, h: 1 },
  { type: 'kiepenkerl', x: 6, y: 11, w: 1, h: 1 },
  // Wochenmarkt stalls
  { type: 'stall', x: 1, y: 7, w: 3, h: 1, v: 0 },
  { type: 'stall', x: 5, y: 7, w: 3, h: 1, v: 1 },
  { type: 'stall', x: 19, y: 7, w: 3, h: 1, v: 2 },
  // Empty bike rack for the Leezen-Chaos mini-game
  { type: 'rack', x: 5, y: 15, w: 6, h: 1 },
  // Leezen (bicycles), in racks and parked loosely
  { type: 'bikes', x: 23, y: 14, w: 4, h: 1, v: 2 },
  { type: 'bikes', x: 20, y: 17, w: 3, h: 1, v: 4 },
  { type: 'bikes', x: 12, y: 19, w: 1, h: 1, v: 1 },
  { type: 'bikes', x: 28, y: 19, w: 1, h: 1, v: 3 },
  { type: 'bikes', x: 33, y: 10, w: 1, h: 1, v: 5 },
  { type: 'bench', x: 10, y: 10, w: 2, h: 1 },
  { type: 'bench', x: 21, y: 10, w: 2, h: 1 },
  { type: 'bench', x: 5, y: 19, w: 2, h: 1 },
  { type: 'bench', x: 24, y: 19, w: 2, h: 1 },
  { type: 'lamp', x: 8, y: 8, w: 1, h: 1 },
  { type: 'lamp', x: 25, y: 8, w: 1, h: 1 },
  { type: 'lamp', x: 13, y: 16, w: 1, h: 1 },
  { type: 'lamp', x: 16, y: 16, w: 1, h: 1 },
  { type: 'lamp', x: 33, y: 17, w: 1, h: 1 },
  { type: 'poolballs', x: 15, y: 20, w: 3, h: 2 },
  // Promenade: linden trees on both sides of the bike path, blue bike-path signs, Buddenturm
  // The tree at y 7 carries a Nestflix nest box (Münsterhack 2025)
  ...[1, 4, 7, 10, 13].map((y) => (y === 7
    ? { type: 'tree', x: 38, y, w: 1, h: 1, v: 0, deco: 'nestbox', info: PROJECTS.nestflix }
    : { type: 'tree', x: 38, y, w: 1, h: 1, v: 0 })),
  ...[1, 4, 7, 10].map((y) => ({ type: 'tree', x: 35, y, w: 1, h: 1, v: 0 })),
  // Leezenflow (Münsterhack 2019): counts down the phase of the bike traffic light further along the path
  { type: 'leezenflow', x: 35, y: 13, w: 1, h: 1, info: PROJECTS.leezenflow },
  { type: 'bikelight', x: 35, y: 17, w: 1, h: 1 },
  { type: 'bikesign', x: 34, y: 5, w: 1, h: 1 },
  { type: 'bikesign', x: 34, y: 14, w: 1, h: 1 },
  { type: 'buddenturm', x: 38, y: 17, w: 2, h: 2 },
  // Park by the Aasee
  ...[[2, 21], [9, 21], [5, 23], [12, 24], [3, 26], [8, 27], [11, 28], [4, 17], [27, 17], [30, 17]].map(
    // The first linden wears a Humiditree watering bag (Münsterhack 2019)
    ([x, y], i) => (i === 0
      ? { type: 'tree', x, y, w: 1, h: 1, v: 0, deco: 'bag', info: PROJECTS.humiditree }
      : { type: 'tree', x, y, w: 1, h: 1, v: i % 3 }),
  ),
  ...[[6, 21], [1, 24], [13, 27], [7, 17], [10, 23]].map(([x, y]) => ({ type: 'bush', x, y, w: 1, h: 1 })),
  { type: 'flowers', x: 9, y: 16, w: 2, h: 1 },
  { type: 'flowers', x: 18, y: 16, w: 2, h: 1 },
  // Easter eggs for earlier Münsterhack projects
  { type: 'buoy', x: 16, y: 26, w: 1, h: 1, info: PROJECTS.hackatonne },
  { type: 'givebox', x: 7, y: 19, w: 1, h: 1, info: PROJECTS.givebox },
  { type: 'leihleeze', x: 27, y: 14, w: 1, h: 1, info: PROJECTS.leihleeze },
  { type: 'chalkboard', x: 4, y: 8, w: 1, h: 1, info: PROJECTS.krautUndRueben },
  { type: 'kiosk', x: 34, y: 20, w: 3, h: 1, info: PROJECTS.corndex },
  // SpecOps café with Code for Münster on the bench in front (their people are NPCs, see npcs.js)
  { type: 'specops', x: 0, y: 11, w: 3, h: 2, info: { name: 'Code for Münster', year: 'Hacknight jeden 2. Dienstag', label: 'Community' } },
  { type: 'bench', x: 0, y: 13, w: 3, h: 1 },
  // Aasee: pedal boats moored at the jetty
  { type: 'boat', x: 37, y: 22, w: 1, h: 1, v: 0 },
  { type: 'boat', x: 39, y: 22, w: 1, h: 1, v: 1 },
  // Museum: one exhibit per project, the first half along the top wall of its year room, the rest along the
  // bottom; with an odd count the shorter bottom row is shifted by a tile to stay centered.
  ...YEARS.flatMap(({ year, projects }, i) => projects.map(([name, desc, icon, award], j) => {
    const room = MUSEUM_ROOMS[i];
    const top = Math.ceil(projects.length / 2);
    const col = j < top ? j * 2 : (j - top) * 2 + (top * 2 - projects.length);
    return {
      type: 'exhibit', x: room.x + 1 + col, y: j < top ? room.y : room.y + room.h - 1, w: 1, h: 1,
      deco: icon, v: award ? 1 : 0, info: { name, year, desc, award, label: 'Münsterhack-Museum' },
    };
  })),
  // Entrance hall: boards about the Münsterhack and its people, the anniversary trophy, plants and benches
  ...BOARDS.map(([title, name, desc], i) => ({
    type: 'board', x: [10, 13, 25, 28, 10, 28][i], y: MUSEUM_Y + (i < 4 ? 31 : 35), w: 2, h: 1,
    deco: title, info: { name, desc, label: 'Münsterhack' },
  })),
  {
    type: 'trophy', x: 19, y: MUSEUM_Y + 34, w: 2, h: 1, info: {
      name: '10 Jahre Münsterhack', label: 'Jubiläum',
      desc: 'Von 2017 bis 2026 über 110 Projekte, jedes in zwei Tagen gebaut. Die Räume hinter der Halle zeigen alle, Jahr für Jahr.',
    },
  },
  ...[[17, 31], [22, 31], [9, 38], [30, 38]].map(([x, y]) => ({ type: 'plant', x, y: MUSEUM_Y + y, w: 1, h: 1 })),
  { type: 'bench', x: 13, y: MUSEUM_Y + 37, w: 2, h: 1 },
  { type: 'bench', x: 25, y: MUSEUM_Y + 37, w: 2, h: 1 },
];

/** Number of bike colors; sprites.js defines them, the server validates the ridden bike against it. */
export const BIKE_COLOR_COUNT = 7;

/** Color index of the i-th bike in a `bikes` object with variant v. */
export function bikeColor(v, i) {
  return (v + i * 3) % BIKE_COLOR_COUNT;
}

/** Every rideable bike: tile center in pixels and its color index. */
export const BIKES = OBJECTS.filter((o) => o.type === 'bikes').flatMap((o) =>
  Array.from({ length: o.w }, (_, i) => ({
    x: (o.x + i) * TILE + TILE / 2,
    y: o.y * TILE + TILE / 2,
    color: bikeColor(o.v ?? 0, i),
  })),
);

/**
 * Ducks and a swan on the Aasee, each swimming an elliptical loop (center and radii in tiles).
 * Position is a function of the wall clock, so all clients show roughly the same scene.
 */
const duckLoop = { cx: 28, cy: 25.5, rx: 6, ry: 2.5, period: 60 };
export const BIRDS = [
  { kind: 'duck', ...duckLoop, phase: 0 },
  { kind: 'duckling', ...duckLoop, phase: -0.03 },
  { kind: 'duckling', ...duckLoop, phase: -0.05 },
  { kind: 'duck', cx: 32.5, cy: 24.5, rx: 3.5, ry: 1.5, period: 45, phase: 0.5 },
  { kind: 'swan', cx: 30, cy: 26.5, rx: 7, ry: 2.5, period: -90, phase: 0.2 },
];

/** Position (pixels) and horizontal heading of a bird at time `t` (seconds). */
export function birdAt(b, t) {
  const a = 2 * Math.PI * (t / b.period + b.phase);
  return {
    x: (b.cx + b.rx * Math.cos(a)) * TILE,
    y: (b.cy + b.ry * Math.sin(a)) * TILE,
    left: Math.sin(a) * Math.sign(b.period) > 0,
  };
}

// Fail fast if a loop leaves the water (checked with a sprite-sized margin).
for (const b of BIRDS) {
  for (let i = 0; i < 64; i++) {
    const { x, y } = birdAt(b, (i / 64) * Math.abs(b.period));
    for (const dx of [-8, 8]) {
      if (GROUND[Math.floor(y / TILE)]?.[Math.floor((x + dx) / TILE)] !== '~') {
        throw new Error(`Bird loop leaves the water at ${x}, ${y}`);
      }
    }
  }
}

/** Leezen-Chaos rack slots: tile centers in pixels, one per rack tile. */
const rack = OBJECTS.find((o) => o.type === 'rack');
export const RACK_SLOTS = Array.from({ length: rack.w }, (_, i) => ({
  x: (rack.x + i) * TILE + TILE / 2,
  y: rack.y * TILE + TILE / 2,
}));

const solid = new Uint8Array(MAP_W * MAP_H);
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if ('~xw_'.includes(GROUND[y][x])) solid[y * MAP_W + x] = 1;
  }
}
for (const o of OBJECTS) {
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) solid[y * MAP_W + x] = 1;
  }
}

// Doors are walkable, even where they are cut into a house.
for (const d of DOORS) for (let x = d.x; x < d.x + d.w; x++) solid[d.y * MAP_W + x] = 0;

/** Door whose tiles contain the pixel position, or undefined. */
export function doorAt(px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  return DOORS.find((d) => tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h);
}

/** Return true if the tile blocks movement; everything outside the map counts as solid. */
export function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return solid[ty * MAP_W + tx] === 1;
}
