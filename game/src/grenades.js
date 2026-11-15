// Grenades: one throw, one fuse, one blast. A thrown grenade flies with
// gravity, bounces off walls and the floor with a damped reflection, and
// explodes after two and a half seconds: damage falls with distance, and
// walls block the blast. The player throws with G; bots do not throw —
// their grenades stay in the pouch, which is a fair trade for a bot that
// cannot judge a bounce.
import * as THREE from 'three';
import { pushEvent } from './state.js';

export const GRENADE_FUSE = 2.5;
export const GRENADE_DAMAGE = 110;
export const GRENADE_RADIUS = 6.5;
export const GRENADE_SPEED = 15;
export const GRENADE_GRAVITY = 18;

const sphereGeo = new THREE.SphereGeometry(0.09, 10, 8);
const shellMat = new THREE.MeshStandardMaterial({ color: 0x2e7f7a, roughness: 0.5, metalness: 0.5 });

export function createGrenades(scene, physics, actors) {
  function throwGrenade(state, owner, direction) {
    const mesh = new THREE.Mesh(sphereGeo, shellMat);
    mesh.castShadow = true;
    scene.add(mesh);
    const start = owner.position.clone();
    start.y = owner.eye;
    mesh.position.copy(start);
    const vel = direction.clone().multiplyScalar(GRENADE_SPEED);
    vel.y += 2.5;
    state.grenades.push({ pos: start, vel, fuse: GRENADE_FUSE, mesh, owner });
    pushEvent(state, { type: 'throw', by: owner });
  }

  function step(state, dt) {
    const list = state.grenades;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const g = list[i];
      g.fuse -= dt;
      g.vel.y -= GRENADE_GRAVITY * dt;
      const next = g.pos.clone().addScaledVector(g.vel, dt);
      const hit = physics.overlaps(next.x, next.y, next.z, 0.09, 0.18, 0);
      if (hit || next.y < 0.09) {
        if (next.y < 0.09) {
          next.y = 0.09;
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        } else {
          // Bounce off the wall face we hit: reflect the axis with the
          // smallest penetration.
          const dx = Math.min(Math.abs(next.x - hit.min.x), Math.abs(next.x - hit.max.x));
          const dy = Math.min(Math.abs(next.y - hit.min.y), Math.abs(next.y - hit.max.y));
          const dz = Math.min(Math.abs(next.z - hit.min.z), Math.abs(next.z - hit.max.z));
          if (dx <= dy && dx <= dz) g.vel.x *= -0.45;
          else if (dy <= dx && dy <= dz) g.vel.y *= -0.45;
          else g.vel.z *= -0.45;
          g.vel.multiplyScalar(0.8);
        }
      }
      g.pos.copy(next);
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        list.splice(i, 1);
        explode(state, g);
      }
    }
  }

  function explode(state, g) {
    pushEvent(state, { type: 'explosion', position: g.pos.clone(), owner: g.owner });
    for (const target of actors.actors) {
      if (!target.alive || target === g.owner || target.team === g.owner.team) continue;
      const d = target.position.distanceTo(g.pos);
      if (d > GRENADE_RADIUS) continue;
      // A wall between the blast and the body saves it.
      const blocked = physics.blocked(g.pos.x, g.pos.y, g.pos.z,
        target.position.x, target.position.y + 1, target.position.z);
      if (blocked) continue;
      const amount = GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) + 20;
      const died = actors.damage(target, amount, 'torso', g.owner);
      if (died) {
        pushEvent(state, { type: 'kill', killer: g.owner, victim: target, headshot: false, weapon: 'grenade' });
      }
    }
  }

  function clearAll(state) {
    for (const g of state.grenades) scene.remove(g.mesh);
    state.grenades.length = 0;
  }

  return { throwGrenade, step, clearAll };
}
