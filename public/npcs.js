/**
 * Non-player characters: Münster locals who walk fixed routes and chat now and then.
 *
 * Positions and chatter are functions of the wall clock, so every client shows the same
 * scene without any server state. NPCs are purely visual and never block anyone.
 */
import { TILE, isSolid } from './map.js';

/** Stops of the city tour on the Prinzipalmarkt: [x, y (tiles, feet), wait (s), what the guide says there]. */
const TOUR = [
  [10.5, 5.4, 6, 'In Münster regnet es oder die Glocken läuten.'],
  [21.5, 5.4, 6, 'Im Rathaus wurde 1648 der Westfälische Frieden geschlossen.'],
  [24, 5.4, 6, 'Abends bläst die Türmerin von Lamberti ins Horn.'],
  [24, 12.5],
  [28, 12.5, 6, 'Oben am Turm hängen die drei Täuferkäfige.'],
  [10.5, 12.5, 6, 'Der Kiepenkerl trug früher Waren übers Land.'],
  [13.5, 12.5],
  [13.5, 8.5, 6, 'Münster hat mehr Leezen als Einwohner:innen!'],
  [10.5, 8.5],
];

/**
 * All NPCs. Walkers have a closed `route` of [x, y, wait?, say?] points in tiles and a `speed` in px/s;
 * `lag` (s) and `offset` (px) let followers trail a shared route. Others stand (`at`) or sit on a bench (`sit`).
 * `lines` are said in turn every `every` seconds (shifted by `shift`), `greet` when the own player comes close.
 */
export const NPCS = [
  {
    name: 'Pendlerin Jule', look: 12, bike: 2, speed: 80,
    route: [[37, 0.8], [37, 18.5], [22, 18.5], [37, 18.5]],
    lines: ['Pling pling!', 'Vorsicht, Radweg!', 'Pling!'], every: 15, shift: 3, greet: 'Pling! Moin!',
  },
  { name: 'Stadtführerin Gisela', look: 5, speed: 28, route: TOUR, prop: 'umbrella', greet: 'Moin! Kommen Sie mit?' },
  {
    name: 'Kees', look: 7, speed: 28, route: TOUR, lag: 0.9, offset: [-10, 9],
    lines: ['Mooi!', 'Foto!', 'Gezellig!'], every: 23, shift: 5, greet: 'Hoi!',
  },
  {
    name: 'Anouk', look: 13, speed: 28, route: TOUR, lag: 1.6, offset: [10, 8],
    lines: ['Wie schön!', 'Wo gibt es Pommes?', 'Noch ein Foto!'], every: 23, shift: 16, greet: 'Hallo!',
  },
  {
    name: 'Jogger:in Sam', look: 14, speed: 56,
    route: [[0.5, 20.5], [14.5, 20.5], [14.5, 29.4], [0.5, 29.4]],
    lines: ['Puh …', 'Noch eine Runde!', 'Gleich geschafft …'], every: 13, shift: 7, greet: 'Moin! *schnauf*',
  },
  {
    name: 'Marktfrau Anni', look: 10, at: [4.5, 7.7], dir: 'down',
    lines: ['Frische Äpfel!', 'Töttchen gefällig?', 'Spargel aus dem Münsterland!', 'Pumpernickel, ganz frisch!'],
    every: 14, shift: 0, greet: "Moin! Was darf's sein?",
  },
  {
    name: 'Ada', look: 3, at: [21.55, 11], sit: true, prop: 'laptop',
    lines: ['Deploy läuft …', 'Wer hat das WLAN-Passwort?', 'Nur noch ein Bug!', 'Die Mate ist alle!'],
    every: 16, shift: 0, greet: 'Moin! Willst du mitmachen?',
  },
  {
    name: 'Linus', look: 11, at: [22.45, 11], sit: true, prop: 'laptop',
    lines: ['Bei mir läuft es.', 'Hat wer ein USB-C-Kabel?', 'Pitch in 10 Minuten?!', 'Ups, force-push …'],
    every: 16, shift: 8, greet: 'Moin! Kaffee ist da drüben.',
  },
];

/** Precomputed legs of each route: pixel start/end, walking duration and the stop at its end. */
for (const n of NPCS) {
  if (!n.route) continue;
  n.legs = n.route.map((a, i) => {
    const b = n.route[(i + 1) % n.route.length];
    const [ax, ay, bx, by] = [a[0] * TILE, a[1] * TILE, b[0] * TILE, b[1] * TILE];
    return { ax, ay, bx, by, walk: Math.hypot(bx - ax, by - ay) / n.speed, wait: b[2] ?? 0, stop: (i + 1) % n.route.length };
  });
  n.cycle = n.legs.reduce((sum, l) => sum + l.walk + l.wait, 0);
}

/**
 * Position of an NPC at wall time `t` (s): feet in pixels, facing, whether it walks and,
 * while waiting at a route point, the index of that point.
 */
export function npcAt(n, t) {
  if (!n.route) return { x: n.at[0] * TILE, y: n.at[1] * TILE, dir: n.dir ?? 'down', moving: false, stop: null };
  const [ox, oy] = n.offset ?? [0, 0];
  let u = (((t - (n.lag ?? 0)) % n.cycle) + n.cycle) % n.cycle;
  for (const l of n.legs) {
    if (u < l.walk) {
      const k = u / l.walk;
      const dx = l.bx - l.ax;
      const dy = l.by - l.ay;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      return { x: l.ax + dx * k + ox, y: l.ay + dy * k + oy, dir, moving: true, stop: null };
    }
    u -= l.walk;
    if (u < l.wait) {
      // Followers stand below the guide and look up at her.
      return { x: l.bx + ox, y: l.by + oy, dir: n.offset ? 'up' : 'down', moving: false, stop: l.stop };
    }
    u -= l.wait;
  }
  const l = n.legs[0];
  return { x: l.ax + ox, y: l.ay + oy, dir: 'down', moving: false, stop: null };
}

// Fail fast if a route crosses anything solid (feet checked with a small margin).
for (const n of NPCS) {
  if (!n.route) continue;
  for (let t = 0; t < n.cycle; t += 0.05) {
    const { x, y } = npcAt(n, t);
    for (const dx of [-4, 4]) {
      if (isSolid(Math.floor((x + dx) / TILE), Math.floor((y - 1) / TILE))) {
        throw new Error(`NPC ${n.name} walks into something at ${x.toFixed(0)}, ${y.toFixed(0)}`);
      }
    }
  }
}
