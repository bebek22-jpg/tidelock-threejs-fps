// Collision and line of sight, shared by the player and the bots. Bodies
// are axis-aligned boxes resolved one axis at a time, so a wall never
// swallows an actor and sliding along a wall feels right. Line of sight is
// a segment against the same boxes with the slab method. Module-level
// scratch only; nothing here allocates per call.
import * as THREE from 'three';

const probe = new THREE.Box3();
const EPS = 0.001;

export function createPhysics(colliders) {
  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move a body by its velocity for dt. Returns true when standing on
  // something. Horizontal axes resolve separately; vertical resolves after,
  // landing on the top face of whatever is underfoot.
  function move(position, velocity, dt, radius, height) {
    const nextX = position.x + velocity.x * dt;
    if (!overlaps(nextX, position.y, position.z, radius, height, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nextZ, radius, height, 0.04)) position.z = nextZ;
    else velocity.z = 0;

    position.y += velocity.y * dt;
    let onGround = false;
    const hit = overlaps(position.x, position.y, position.z, radius, height, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      onGround = true;
    } else if (hit) {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      onGround = true;
    }
    return onGround;
  }

  // True when the segment a->b crosses any collider. The slab test per axis
  // keeps it cheap enough to run for every bot's perception tick.
  function blocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      let tmin = 0;
      let tmax = 1;
      if (Math.abs(dx) < EPS) {
        if (ax < c.min.x || ax > c.max.x) continue;
      } else {
        let t1 = (c.min.x - ax) / dx;
        let t2 = (c.max.x - ax) / dx;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dy) < EPS) {
        if (ay < c.min.y || ay > c.max.y) continue;
      } else {
        let t1 = (c.min.y - ay) / dy;
        let t2 = (c.max.y - ay) / dy;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < EPS) {
        if (az < c.min.z || az > c.max.z) continue;
      } else {
        let t1 = (c.min.z - az) / dz;
        let t2 = (c.max.z - az) / dz;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      return true;
    }
    return false;
  }

  // Distance to the nearest collider along a ray, or maxDist when nothing
  // is hit. The shot resolver compares this with the nearest actor hit so
  // a wall always stops a bullet.
  function rayDistance(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      let tmin = 0;
      let tmax = best;
      if (Math.abs(dx) < EPS) {
        if (ox < c.min.x || ox > c.max.x) continue;
      } else {
        let t1 = (c.min.x - ox) / dx;
        let t2 = (c.max.x - ox) / dx;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dy) < EPS) {
        if (oy < c.min.y || oy > c.max.y) continue;
      } else {
        let t1 = (c.min.y - oy) / dy;
        let t2 = (c.max.y - oy) / dy;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < EPS) {
        if (oz < c.min.z || oz > c.max.z) continue;
      } else {
        let t1 = (c.min.z - oz) / dz;
        let t2 = (c.max.z - oz) / dz;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin < best) best = tmin;
    }
    return best;
  }

  return { move, overlaps, blocked, rayDistance };
}
