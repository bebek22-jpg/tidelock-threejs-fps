// Pier 9: an original container dock at blue hour. Attackers (Corsairs)
// spawn west, defenders (Keepers) east. Two berths: A in the north-east
// under the gantry crane, B in the south-east by the silo. Three routes to
// each berth: its long quay lane, the mid container yard through a divider
// gap, and the far connector gap past the east door. Boxes are [width,
// height, depth, x, y, z, material]; every box is a collider and a bullet
// stop. Waypoints are the bots' nav graph: [x, z] nodes with links. Cover
// sits beside the waypoint lines, never on them: bots steer straight
// between nodes and cannot step over a box.
export const MAP = {
  name: 'Pier 9',
  bounds: { x: 28, z: 20 },
  sites: {
    A: { center: [21, -14], radius: 4.5 },
    B: { center: [21, 14], radius: 4.5 },
  },
  spawns: {
    cor: [[-25, 0], [-25, -3], [-25, 3], [-26.5, 0]],
    kpr: [[24, -17], [22.5, 13.5], [25, 0], [24, -6]],
  },
  boxes: [
    // Floor.
    [57, 0.4, 41, 0, -0.2, 0, 'asphalt'],
    // Perimeter walls, 4.5 m.
    [57, 4.5, 0.6, 0, 2.25, -20, 'concrete'],
    [57, 4.5, 0.6, 0, 2.25, 20, 'concrete'],
    [0.6, 4.5, 41, -28, 2.25, 0, 'concrete'],
    [0.6, 4.5, 41, 28, 2.25, 0, 'concrete'],
    // North divider (z=-8): gaps at x -4..+2 (mid connector) and x 11..15
    // (east connector).
    [24, 4.5, 0.6, -16, 2.25, -8, 'concrete'],
    [9, 4.5, 0.6, 6.5, 2.25, -8, 'concrete'],
    [13, 4.5, 0.6, 21.5, 2.25, -8, 'concrete'],
    // South divider (z=+8), mirrored gaps.
    [24, 4.5, 0.6, -16, 2.25, 8, 'concrete'],
    [9, 4.5, 0.6, 6.5, 2.25, 8, 'concrete'],
    [13, 4.5, 0.6, 21.5, 2.25, 8, 'concrete'],
    // West mid wall (x=-14): door at z -1..+1.
    [0.6, 4.5, 7, -14, 2.25, -4.5, 'concrete'],
    [0.6, 4.5, 7, -14, 2.25, 4.5, 'concrete'],
    // East mid wall (x=+14): door at z -1..+1.
    [0.6, 4.5, 7, 14, 2.25, -4.5, 'concrete'],
    [0.6, 4.5, 7, 14, 2.25, 4.5, 'concrete'],
    // Mid yard containers and crates.
    [6, 2.4, 2.4, 0, 1.2, -4, 'rust'],
    [6, 2.4, 2.4, -10, 1.2, 5, 'teal'],
    [1.2, 1.1, 1.2, 4, 0.55, 3, 'ochre'],
    [1.2, 1.1, 1.2, -1, 0.55, -6, 'ochre'],
    [1.2, 1.1, 1.2, 5, 0.55, -2, 'rust'],
    [1.2, 1.1, 1.2, 5, 1.65, -2, 'rust'],
    // North quay cover, against the wall off the lane line.
    [6, 2.4, 2.4, -18, 1.2, -17.5, 'signalBlue'],
    [1.2, 1.1, 1.2, -8, 0.55, -17.5, 'ochre'],
    [1.2, 1.1, 1.2, 6, 0.55, -17, 'rust'],
    [3, 1.1, 0.6, 10, 0.55, -11.5, 'concreteDark'],
    // South alley cover, mirrored.
    [6, 2.4, 2.4, -18, 1.2, 17.5, 'teal'],
    [1.2, 1.1, 1.2, -8, 0.55, 17.5, 'ochre'],
    [1.2, 1.1, 1.2, 6, 0.55, 17, 'rust'],
    [3, 1.1, 0.6, 10, 0.55, 11.5, 'concreteDark'],
    // Berth A: gantry crane legs, a container, crates, a low wall.
    [0.8, 5, 0.8, 18.5, 2.5, -18, 'steelDark'],
    [0.8, 5, 0.8, 23.5, 2.5, -18, 'steelDark'],
    [6, 2.4, 2.4, 24, 1.2, -11, 'rust'],
    [1.2, 1.1, 1.2, 18, 0.55, -16.5, 'ochre'],
    [1.2, 1.1, 1.2, 23.5, 0.55, -18.5, 'ochre'],
    [4, 1.1, 0.5, 19.5, 0.55, -10, 'concreteDark'],
    // Berth B: a container, crates, a low wall. The silo is a cylinder
    // mesh in world.js with its collider below, in collidersOnly.
    [6, 2.4, 2.4, 24, 1.2, 11, 'teal'],
    [1.2, 1.1, 1.2, 18, 0.55, 16.5, 'ochre'],
    [1.2, 1.1, 1.2, 19.5, 0.55, 11.5, 'rust'],
    [4, 1.1, 0.5, 19.5, 0.55, 10, 'concreteDark'],
    // East corridor cover.
    [1.2, 1.1, 1.2, 17, 0.55, -4, 'ochre'],
    [1.2, 1.1, 1.2, 17, 0.55, 4, 'ochre'],
    // Spawn cover.
    [1.2, 1.1, 1.2, -26.5, 0.55, -6, 'ochre'],
    [1.2, 1.1, 1.2, -26.5, 0.55, 6, 'ochre'],
    [1.2, 1.1, 1.2, 26.5, 0.55, -6, 'ochre'],
    [1.2, 1.1, 1.2, 26.5, 0.55, 6, 'ochre'],
  ],
  // Colliders with no box mesh: the silo's cylinder is drawn in world.js.
  collidersOnly: [
    [3.4, 5, 3.4, 25.5, 2.5, 18],
  ],
  // Nav graph: node [x, z], links by index. Bots path with BFS over this.
  waypoints: [
    { p: [-25, 0], links: [2, 29, 30] }, // 0 attacker spawn
    { p: [-20, -14], links: [29, 5] }, // 1 north lane west
    { p: [-20, 0], links: [0, 4] }, // 2 mid west
    { p: [-20, 14], links: [30, 7] }, // 3 south lane west
    { p: [-14, 0], links: [2, 6] }, // 4 west mid door
    { p: [-8, -14], links: [1, 8] }, // 5 north lane mid-west
    { p: [-8, 0], links: [4, 9, 23, 24] }, // 6 mid yard west-center
    { p: [-8, 14], links: [3, 10] }, // 7 south lane mid-west
    { p: [0, -14], links: [5, 11, 23] }, // 8 north lane center
    { p: [0, 0], links: [6, 12] }, // 9 mid yard center
    { p: [0, 14], links: [7, 13, 24] }, // 10 south lane center
    { p: [8, -14], links: [8, 15] }, // 11 north lane mid-east
    { p: [8, 0], links: [9, 14, 31, 32] }, // 12 mid yard east-center
    { p: [8, 14], links: [10, 16] }, // 13 south lane mid-east
    { p: [14, 0], links: [12, 19] }, // 14 east mid door
    { p: [14, -14], links: [11, 17, 25] }, // 15 north lane east
    { p: [14, 14], links: [13, 18, 26] }, // 16 south lane east
    { p: [20, -14], links: [15, 20, 27] }, // 17 site A
    { p: [20, 14], links: [16, 21, 28] }, // 18 site B
    { p: [20, 0], links: [14, 22] }, // 19 east corridor
    { p: [25, -17], links: [17] }, // 20 keeper spawn north
    { p: [24, 14.5], links: [18] }, // 21 keeper spawn south
    { p: [25, 0], links: [19] }, // 22 keeper spawn mid
    { p: [-2, -8], links: [6, 8] }, // 23 north divider mid gap
    { p: [-2, 8], links: [6, 10] }, // 24 south divider mid gap
    { p: [13, -9], links: [15, 31] }, // 25 north divider east gap
    { p: [13, 9], links: [16, 32] }, // 26 south divider east gap
    { p: [17, -11], links: [17, 25] }, // 27 site A approach
    { p: [17, 11], links: [18, 26] }, // 28 site B approach
    { p: [-25, -14], links: [0, 1] }, // 29 north-west corner
    { p: [-25, 14], links: [0, 3] }, // 30 south-west corner
    { p: [12, -6], links: [12, 25] }, // 31 mid yard north-east
    { p: [12, 6], links: [12, 26] }, // 32 mid yard south-east
  ],
};

// BFS over the waypoint graph. Returns node indices from `from` to `to`
// (inclusive), or [] when unreachable. No allocation in the hot path beyond
// the returned path: the queue and parent table are module-level scratch.
const bfsQueue = new Int32Array(64);
const bfsParent = new Int32Array(64);
export function findPath(from, to) {
  const nodes = MAP.waypoints;
  if (from === to) return [from];
  bfsParent.fill(-1, 0, nodes.length);
  let head = 0;
  let tail = 0;
  bfsQueue[tail++] = from;
  bfsParent[from] = from;
  while (head < tail) {
    const current = bfsQueue[head++];
    for (const next of nodes[current].links) {
      if (bfsParent[next] !== -1) continue;
      bfsParent[next] = current;
      if (next === to) {
        const path = [to];
        let at = current;
        while (at !== from) {
          path.push(at);
          at = bfsParent[at];
        }
        path.push(from);
        path.reverse();
        return path;
      }
      bfsQueue[tail++] = next;
    }
  }
  return [];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  const nodes = MAP.waypoints;
  for (let i = 0; i < nodes.length; i += 1) {
    const dx = nodes[i].p[0] - x;
    const dz = nodes[i].p[1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
