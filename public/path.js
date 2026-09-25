/**
 * A* pathfinding on the tile grid (8 directions, no cutting past solid corners).
 */

const STEPS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Find a path between two tiles.
 * @param {number} sx start tile x
 * @param {number} sy start tile y
 * @param {number} gx goal tile x
 * @param {number} gy goal tile y
 * @param {number} width grid width in tiles
 * @param {number} height grid height in tiles
 * @param {(x: number, y: number) => boolean} isBlocked returns true for solid tiles
 * @returns {{x: number, y: number}[] | null} tiles after the start up to the goal, or null if unreachable
 */
export function findPath(sx, sy, gx, gy, width, height, isBlocked) {
  if (isBlocked(gx, gy)) return null;
  const size = width * height;
  const g = new Float64Array(size).fill(Infinity);
  const f = new Float64Array(size).fill(Infinity);
  const from = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heuristic = (x, y) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const start = sy * width + sx;
  const goal = gy * width + gx;
  g[start] = 0;
  f[start] = heuristic(sx, sy);
  const open = [start];

  while (open.length) {
    // A linear scan for the best node is fast enough on a 40x30 grid.
    let best = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i;
    const cur = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy, cost] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isBlocked(nx, ny)) continue;
      if (dx && dy && (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy))) continue;
      const n = ny * width + nx;
      const ng = g[cur] + cost;
      if (ng >= g[n]) continue;
      g[n] = ng;
      f[n] = ng + heuristic(nx, ny);
      from[n] = cur;
      open.push(n);
    }
  }

  if (goal !== start && from[goal] === -1) return null;
  const path = [];
  for (let n = goal; n !== start; n = from[n]) path.push({ x: n % width, y: Math.floor(n / width) });
  return path.reverse();
}
