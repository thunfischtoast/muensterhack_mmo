/**
 * World map shared by the browser client and the Node server.
 *
 * Plain ES module without browser or Node APIs, so both sides import the same
 * tile grid, object list and collision data.
 */

export const TILE = 16;
export const MAP_W = 40;
export const MAP_H = 30;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Number of character outfits; the server picks one per player, sprites.js defines them. */
export const LOOK_COUNT = 8;

/** Tile rectangle on the plaza (in front of the Münsterhack stand) where players spawn. */
export const SPAWN = { x: 12, y: 11, w: 9, h: 4 };

/**
 * Ground tiles, one character per tile.
 * '.' grass, 'c' cobblestone (Prinzipalmarkt), '=' path, 's' sand, '~' water (Aasee, solid).
 */
export const GROUND = [
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
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  'cccccccccccccccccccccccccccccccccc..==..',
  '..............==....................==..',
  '..............==....................==..',
  '..====================================..',
  '........................................',
  '....................ssssssssssssssssssss',
  '..................ss~~~~~~~~~~~~~~~~~~~~',
  '................sss~~~~~~~~~~~~~~~~~~~~~',
  '...............ss~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
  '..............ss~~~~~~~~~~~~~~~~~~~~~~~~',
];

/**
 * World objects. x/y/w/h is the solid footprint in tiles; the sprite is drawn
 * bottom-aligned and horizontally centered on it and may extend above it.
 * `v` selects a variant (house facade, bike colors).
 */
export const OBJECTS = [
  // Prinzipalmarkt: row of gabled merchant houses with arcades
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ type: 'house', x: i * 4, y: 0, w: 4, h: 5, v: i })),
  { type: 'tower', x: 30, y: 6, w: 3, h: 2 },
  { type: 'stand', x: 15, y: 9, w: 3, h: 1 },
  // Leezen (bicycles), in racks and parked loosely
  { type: 'bikes', x: 2, y: 13, w: 5, h: 1, v: 0 },
  { type: 'bikes', x: 23, y: 14, w: 4, h: 1, v: 2 },
  { type: 'bikes', x: 20, y: 17, w: 3, h: 1, v: 4 },
  { type: 'bikes', x: 12, y: 19, w: 1, h: 1, v: 1 },
  { type: 'bikes', x: 28, y: 19, w: 1, h: 1, v: 3 },
  { type: 'bikes', x: 33, y: 4, w: 1, h: 1, v: 5 },
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
  // Promenade: linden trees on both sides of the path
  ...[1, 4, 7, 10, 13, 16].flatMap((y) => [
    { type: 'tree', x: 35, y, w: 1, h: 1 },
    { type: 'tree', x: 38, y, w: 1, h: 1 },
  ]),
  // Park by the Aasee
  ...[[2, 21], [9, 21], [5, 23], [12, 24], [3, 26], [8, 27], [11, 28], [4, 17], [26, 16], [30, 17]].map(
    ([x, y]) => ({ type: 'tree', x, y, w: 1, h: 1 }),
  ),
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

const solid = new Uint8Array(MAP_W * MAP_H);
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (GROUND[y][x] === '~') solid[y * MAP_W + x] = 1;
  }
}
for (const o of OBJECTS) {
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) solid[y * MAP_W + x] = 1;
  }
}

/** Return true if the tile blocks movement; everything outside the map counts as solid. */
export function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return solid[ty * MAP_W + tx] === 1;
}
