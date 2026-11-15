// The seven bots. Each one is a small state machine: route along the nav
// graph to its task, hold and scan when it arrives, engage when it sees an
// enemy, hunt the last sound it heard, plant the charge or retake a planted
// berth. Perception is a sight cone plus a line-of-sight test, with a
// human reaction delay before the first shot; aim error starts wide and
// tightens the longer the target stays visible. Bots fire in bursts and
// reload, exactly like the player, through the same resolveShot in main.
import * as THREE from 'three';
import { MAP, findPath, nearestWaypoint } from './map.js';
import { ACTOR_RADIUS } from './actors.js';
import { weaponStep, weaponReload, weaponReady } from './weapons.js';
import { botBuy } from './economy.js';

const SIGHT_RANGE = 32;
const SIGHT_HALF_ANGLE = 0.96; // ~55 degrees each way
const HEAR_RANGE = 26;
const BOT_SPEED = 4.6;
const TURN_RATE = 5;
const GRAVITY = 20;

const SITE_NODE = { A: 17, B: 18 };
// One approach route per Corsair, per berth: the long quay, the mid gap,
// and the east connector gap.
const VIAS = {
  A: [5, 23, 31],
  B: [7, 24, 32],
};
// Keeper holds: berth A, berth B, mid-yard north-east corner, east
// corridor. The mid hold sits off the z=0 sightline on purpose: a keeper
// on the mid door line would farm every Corsair crossing the west door
// from 28 m away, and the yard would be a shooting gallery.
const HOLDS = [17, 18, 31, 19];

const tmpDir = new THREE.Vector3();

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createBots({ actors, physics, state, fireShot }) {
  const bots = [];

  function createBrain(actor, index) {
    const brain = {
      actor,
      index,
      money: 800,
      destination: null,
      via: null,
      path: [],
      pathIndex: 0,
      mode: 'route',
      target: null,
      reaction: 0,
      aimError: 0.12,
      aimYaw: 0,
      aimPitch: 0,
      burstLeft: 0,
      burstPause: 0,
      lastKnown: null,
      lastKnownAt: 0,
      perceiveAt: Math.random() * 0.1,
      holdYaw: 0,
      scanDir: 1,
      stuckAt: 0,
      stuckPos: new THREE.Vector3(),
      planting: false,
      repathAt: 0,
    };
    actor.brain = brain;
    bots.push(brain);
    return brain;
  }

  function setDestination(brain, node, via = null) {
    brain.destination = node;
    brain.via = via;
    brain.mode = 'route';
    repath(brain);
  }

  function repath(brain) {
    const actor = brain.actor;
    const from = nearestWaypoint(actor.position.x, actor.position.z);
    let path = [];
    if (brain.via !== null && brain.via !== from) {
      path = findPath(from, brain.via);
      const tail = findPath(brain.via, brain.destination);
      path = path.concat(tail.slice(1));
    } else {
      path = findPath(from, brain.destination);
    }
    brain.path = path;
    brain.pathIndex = path.length > 0 && path[0] === from ? 1 : 0;
    if (brain.pathIndex >= brain.path.length) brain.pathIndex = Math.max(0, brain.path.length - 1);
  }

  function assignRoles() {
    const site = state.attackSite;
    const siteNode = SITE_NODE[site];
    let corIndex = 0;
    let kprIndex = 0;
    for (const brain of bots) {
      const actor = brain.actor;
      brain.target = null;
      brain.lastKnown = null;
      brain.planting = false;
      brain.burstLeft = 0;
      brain.burstPause = 0;
      if (actor.team === 'cor') {
        setDestination(brain, siteNode, VIAS[site][corIndex % VIAS[site].length]);
        corIndex += 1;
      } else {
        setDestination(brain, HOLDS[kprIndex % HOLDS.length]);
        kprIndex += 1;
      }
    }
  }

  function buyPhase() {
    for (const brain of bots) {
      brain.money = botBuy(brain.actor, brain.money);
    }
  }

  function roundEnd(winner) {
    for (const brain of bots) {
      brain.money += brain.actor.team === winner ? 3250 : 1400;
    }
  }

  // Gunfire is information: every enemy shot inside hearing range leaves a
  // last-known position the bot will hunt when it has nothing better to do.
  function onShot(position, shooter) {
    for (const brain of bots) {
      const actor = brain.actor;
      if (!actor.alive || actor === shooter || actor.team === shooter.team) continue;
      if (actor.position.distanceTo(position) > HEAR_RANGE) continue;
      brain.lastKnown = position.clone();
      brain.lastKnownAt = state.time;
    }
  }

  function perceive(brain, dt) {
    const actor = brain.actor;
    brain.perceiveAt -= dt;
    if (brain.perceiveAt > 0) return;
    brain.perceiveAt = 0.1;
    const eye = new THREE.Vector3(actor.position.x, actor.position.y + actor.eye, actor.position.z);
    let best = null;
    let bestD = Infinity;
    for (const enemy of actors.actors) {
      if (!enemy.alive || enemy.team === actor.team) continue;
      const dx = enemy.position.x - actor.position.x;
      const dz = enemy.position.z - actor.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SIGHT_RANGE || dist >= bestD) continue;
      const angle = Math.atan2(-dx, -dz);
      if (Math.abs(angleDiff(angle, actor.yaw)) > SIGHT_HALF_ANGLE) continue;
      const chestY = enemy.position.y + 1.2;
      if (physics.blocked(eye.x, eye.y, eye.z, enemy.position.x, chestY, enemy.position.z)) continue;
      best = enemy;
      bestD = dist;
    }
    if (best) {
      if (brain.target !== best) {
        brain.target = best;
        brain.reaction = 0.35 + Math.random() * 0.3;
        brain.aimError = 0.1 + Math.random() * 0.06;
        brain.burstLeft = 0;
        brain.burstPause = 0;
      }
      brain.lastKnown = best.position.clone();
      brain.lastKnownAt = state.time;
    } else if (brain.target) {
      // Lost sight: keep the last-known position, drop the lock after half
      // a second of nothing.
      if (state.time - brain.lastKnownAt > 0.5) brain.target = null;
    }
  }

  function faceToward(actor, yaw, pitch, dt) {
    const dyaw = angleDiff(yaw, actor.yaw);
    const step = TURN_RATE * dt;
    actor.yaw += Math.max(-step, Math.min(step, dyaw));
    const dpitch = pitch - actor.pitch;
    actor.pitch += Math.max(-step, Math.min(step, dpitch));
  }

  function moveToward(brain, tx, tz, dt) {
    const actor = brain.actor;
    const dx = tx - actor.position.x;
    const dz = tz - actor.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    actor.velocity.x = (dx / dist) * BOT_SPEED;
    actor.velocity.z = (dz / dist) * BOT_SPEED;
    actor.velocity.y -= GRAVITY * dt;
    actor.onGround = physics.move(actor.position, actor.velocity, dt, ACTOR_RADIUS, actor.height);
    if (!brain.target) faceToward(actor, Math.atan2(-dx, -dz), 0, dt);
    return dist < 0.6;
  }

  function followPath(brain, dt) {
    const actor = brain.actor;
    if (brain.pathIndex >= brain.path.length) {
      actor.velocity.x = 0;
      actor.velocity.z = 0;
      return true;
    }
    const node = MAP.waypoints[brain.path[brain.pathIndex]];
    const arrived = moveToward(brain, node.p[0], node.p[1], dt);
    if (arrived) brain.pathIndex += 1;

    // Stuck: no progress for a second and a half means the next node is
    // unreachable from here — skip it and repath from the current spot.
    if (actor.position.distanceTo(brain.stuckPos) > 0.4) {
      brain.stuckPos.copy(actor.position);
      brain.stuckAt = state.time;
    } else if (state.time - brain.stuckAt > 1.5) {
      brain.pathIndex += 1;
      brain.stuckAt = state.time;
      brain.stuckPos.copy(actor.position);
      if (brain.pathIndex >= brain.path.length) repath(brain);
    }
    return false;
  }

  function engage(brain, dt) {
    const actor = brain.actor;
    const target = brain.target;
    if (!target || !target.alive) {
      brain.target = null;
      return;
    }
    brain.reaction -= dt;
    // Aim error tightens the longer the target stays in sight.
    brain.aimError = Math.max(0.02, brain.aimError - dt * 0.08);
    const chest = tmpDir.set(
      target.position.x - actor.position.x,
      target.position.y + 1.25 - (actor.position.y + actor.eye),
      target.position.z - actor.position.z,
    );
    const dist = Math.hypot(chest.x, chest.z);
    const errYaw = (Math.random() - 0.5) * brain.aimError;
    const errPitch = (Math.random() - 0.5) * brain.aimError * 0.6;
    const wantYaw = Math.atan2(-chest.x, -chest.z) + errYaw;
    const wantPitch = Math.atan2(chest.y, dist) + errPitch;
    faceToward(actor, wantYaw, wantPitch, dt);
    // Plant a foot and shoot: bots stop to fire, which is what makes them
    // hittable and fair.
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    actor.velocity.y -= GRAVITY * dt;
    actor.onGround = physics.move(actor.position, actor.velocity, dt, ACTOR_RADIUS, actor.height);

    if (brain.reaction > 0) return;
    const aimed = Math.abs(angleDiff(wantYaw, actor.yaw)) < 0.06
      && Math.abs(wantPitch - actor.pitch) < 0.06;
    if (!aimed) return;
    const weapon = actors.currentWeapon(actor);
    // The weapon timer already stepped in stepBot; firing only reads it.
    if (weapon.mag === 0) {
      if (weapon.reserve > 0) weaponReload(weapon);
      else if (actor.loadout.primary && actor.current === 'primary') actors.switchWeapon(actor, 'pistol');
      return;
    }
    if (brain.burstPause > 0) {
      brain.burstPause -= dt;
      if (brain.burstPause <= 0) brain.burstLeft = 3 + Math.floor(Math.random() * 3);
      return;
    }
    if (brain.burstLeft <= 0) {
      brain.burstLeft = 3 + Math.floor(Math.random() * 3);
    }
    if (weaponReady(weapon)) {
      if (fireShot(actor)) {
        brain.burstLeft -= 1;
        brain.aimError = Math.min(0.12, brain.aimError + 0.012);
        if (brain.burstLeft <= 0) brain.burstPause = 0.4 + Math.random() * 0.4;
      }
    }
  }

  function stepBot(brain, dt) {
    const actor = brain.actor;
    if (!actor.alive) {
      brain.planting = false;
      return;
    }
    const weapon = actors.currentWeapon(actor);
    weaponStep(weapon, dt);
    perceive(brain, dt);

    // A visible enemy interrupts everything else.
    if (brain.target) {
      brain.planting = false;
      engage(brain, dt);
      return;
    }

    const bomb = state.bomb;
    // The charge is planted: Keepers retake, Corsairs defend the berth.
    if (bomb.status === 'planted') {
      const siteNode = SITE_NODE[bomb.site];
      if (brain.destination !== siteNode) setDestination(brain, siteNode);
      if (actor.team === 'kpr') {
        const near = actor.position.distanceTo(bomb.position) < 1.4;
        if (near) {
          actor.velocity.set(0, actor.velocity.y, 0);
          return;
        }
        // Follow the nav path to the berth first; steer straight to the
        // charge only once the path is done, or a wall gets in the way.
        if (brain.pathIndex >= brain.path.length) {
          moveToward(brain, bomb.position.x, bomb.position.z, dt);
        } else {
          followPath(brain, dt);
        }
        return;
      }
      if (followPath(brain, dt)) holdScan(brain, dt);
      return;
    }

    // The charge is on the ground: the nearest Corsair goes and gets it.
    if (bomb.status === 'dropped' && actor.team === 'cor') {
      const nearest = nearestCarrier(actors.actors, bomb.position);
      if (nearest === actor) {
        const node = nearestWaypoint(bomb.position.x, bomb.position.z);
        if (brain.destination !== node) setDestination(brain, node);
        if (followPath(brain, dt)) {
          moveToward(brain, bomb.position.x, bomb.position.z, dt);
        }
        return;
      }
    }

    // The carrier plants on the berth.
    if (actor.carrying) {
      const site = bomb.status === 'carried' ? state.attackSite : null;
      if (site) {
        const node = SITE_NODE[site];
        if (brain.destination !== node) setDestination(brain, node);
        const siteBox = MAP.sites[site];
        const sdx = actor.position.x - siteBox.center[0];
        const sdz = actor.position.z - siteBox.center[1];
        const atSite = sdx * sdx + sdz * sdz < siteBox.radius * siteBox.radius;
        if (atSite) {
          brain.planting = true;
          actor.velocity.set(0, actor.velocity.y, 0);
          return;
        }
        brain.planting = false;
        followPath(brain, dt);
        return;
      }
    }

    // A fresh sound is worth investigating when there is no better task.
    if (brain.lastKnown && state.time - brain.lastKnownAt < 4 && brain.mode !== 'hunt') {
      brain.mode = 'hunt';
      setDestination(brain, nearestWaypoint(brain.lastKnown.x, brain.lastKnown.z));
    }
    if (brain.mode === 'hunt') {
      if (followPath(brain, dt) || state.time - brain.lastKnownAt > 4) {
        brain.lastKnown = null;
        brain.mode = 'route';
        assignDestination(brain);
      }
      return;
    }

    if (followPath(brain, dt)) holdScan(brain, dt);
  }

  function assignDestination(brain) {
    const actor = brain.actor;
    if (actor.team === 'cor') {
      const siteNode = SITE_NODE[state.attackSite];
      setDestination(brain, siteNode, VIAS[state.attackSite][brain.index % VIAS[state.attackSite].length]);
    } else {
      setDestination(brain, HOLDS[brain.index % HOLDS.length]);
    }
  }

  function holdScan(brain, dt) {
    const actor = brain.actor;
    // Sweep the yaw slowly across the approach, like a player checking
    // corners, and stop dead otherwise.
    actor.velocity.set(0, actor.velocity.y, 0);
    actor.velocity.y -= GRAVITY * dt;
    actor.onGround = physics.move(actor.position, actor.velocity, dt, ACTOR_RADIUS, actor.height);
    brain.holdYaw += brain.scanDir * dt * 0.5;
    if (brain.holdYaw > 0.8 || brain.holdYaw < -0.8) brain.scanDir *= -1;
    faceToward(actor, brain.holdYaw + baseYaw(actor), 0, dt);
  }

  // The direction a holder faces: toward the enemy half of the map.
  function baseYaw(actor) {
    return actor.team === 'cor' ? -Math.PI / 2 : Math.PI / 2;
  }

  function nearestCarrier(list, position) {
    let best = null;
    let bestD = Infinity;
    for (const a of list) {
      if (!a.alive || a.team !== 'cor' || a.isPlayer) continue;
      const d = a.position.distanceTo(position);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  function step(dt) {
    for (const brain of bots) stepBot(brain, dt);
  }

  return { bots, createBrain, assignRoles, buyPhase, roundEnd, onShot, step };
}
