// The demolition charge. One Corsair carries it; on a berth, holding the
// plant key for three seconds arms it, and the round clock stops while the
// thirty-second fuse runs. A Keeper standing on the armed charge can defuse
// it in five seconds. If the carrier dies the charge drops and any Corsair
// can pick it up; if the round clock runs out with the charge unplanted the
// defenders win. The charge itself is a box with a blinking lamp.
import * as THREE from 'three';
import { MAP } from './map.js';
import { PLANT_SECONDS, DEFUSE_SECONDS, BOMB_SECONDS, pushEvent } from './state.js';

const PICKUP_RADIUS = 1.2;

function insideSite(siteKey, x, z) {
  const site = MAP.sites[siteKey];
  const dx = x - site.center[0];
  const dz = z - site.center[1];
  return dx * dx + dz * dz <= site.radius * site.radius;
}

export function createBomb(scene) {
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 0.5, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 1 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.28), caseMat);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), lampMat);
  lamp.position.set(0.12, 0.14, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  const siteA = MAP.sites.A;
  const siteB = MAP.sites.B;

  function siteAt(x, z) {
    if (insideSite('A', x, z)) return 'A';
    if (insideSite('B', x, z)) return 'B';
    return null;
  }

  function findCarrier(actors) {
    return actors.find((a) => a.alive && a.team === 'cor' && a.carrying);
  }

  // One step of the charge logic. `plantHeld` is true while the player
  // holds the plant key; `defuseHeld` the same for defuse. Bots call
  // startPlant/startDefuse directly and hold by staying in range.
  function step(state, actors, player, dt, plantHeld, defuseHeld) {
    const bomb = state.bomb;
    if (bomb.status === 'planted') {
      bomb.timer -= dt;
      if (bomb.timer <= 0) {
        bomb.status = 'exploded';
        pushEvent(state, { type: 'exploded' });
        return;
      }
      const defuser = actors.find((a) => a.alive && a.team === 'kpr'
        && a.position.distanceTo(bomb.position) < 1.6);
      if (defuser) {
        if (defuser.isPlayer && !defuseHeld) {
          bomb.defuse = 0;
        } else {
          bomb.defuse += dt;
          if (bomb.defuse >= DEFUSE_SECONDS) {
            bomb.status = 'defused';
            pushEvent(state, { type: 'defused', by: defuser });
            return;
          }
        }
      } else {
        bomb.defuse = 0;
      }
      const interval = bomb.timer < 10 ? 0.25 : bomb.timer < 20 ? 0.5 : 1;
      if (state.time - bomb.beepAt >= interval) {
        bomb.beepAt = state.time;
        pushEvent(state, { type: 'beep', position: bomb.position });
      }
      lampMat.emissiveIntensity = 1 + Math.sin(state.time * 12) * 0.8;
      return;
    }

    if (bomb.status === 'dropped') {
      const taker = actors.find((a) => a.alive && a.team === 'cor'
        && a.position.distanceTo(bomb.position) < PICKUP_RADIUS);
      if (taker) {
        bomb.status = 'carried';
        bomb.holder = taker;
        taker.carrying = true;
        pushEvent(state, { type: 'picked', by: taker });
      }
      group.visible = true;
      group.position.copy(bomb.position);
      group.position.y = 0.1;
      return;
    }

    if (bomb.status === 'carried') {
      const holder = bomb.holder || findCarrier(actors);
      if (!holder || !holder.alive) {
        if (holder) holder.carrying = false;
        bomb.status = 'dropped';
        bomb.holder = null;
        bomb.position.copy(holder ? holder.position : player.position);
        pushEvent(state, { type: 'dropped' });
        return;
      }
      group.visible = false;
      const site = siteAt(holder.position.x, holder.position.z);
      const holding = holder.isPlayer ? plantHeld : holder.brain?.planting;
      if (site && holding) {
        bomb.plant += dt;
        if (bomb.plant >= PLANT_SECONDS) {
          bomb.status = 'planted';
          bomb.site = site;
          bomb.timer = BOMB_SECONDS;
          bomb.beepAt = state.time;
          bomb.position.copy(holder.position);
          holder.carrying = false;
          bomb.holder = null;
          group.visible = true;
          group.position.copy(bomb.position);
          group.position.y = 0.1;
          pushEvent(state, { type: 'planted', site, by: holder });
        }
      } else {
        bomb.plant = 0;
      }
    }
  }

  return { group, siteAt, step, siteA, siteB };
}
