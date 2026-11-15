// Combatants: the player and the seven bots share one body. A body is a
// torso, a head, a team-coloured vest and a gun, built from boxes and one
// sphere. The torso and the head are the hit meshes a ray tests; the head
// takes the headshot multiplier. Armour absorbs half of every hit until it
// runs out. A dead actor falls over and stays down until the round resets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { newWeapon } from './weapons.js';

export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.6;
export const CROUCH_EYE = 1.02;
export const ACTOR_RADIUS = 0.34;
export const HEALTH = 100;

const FALL_SECONDS = 0.45;

const torsoGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.3);
const vestGeometry = new THREE.BoxGeometry(0.56, 0.4, 0.34);
const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
const visorGeometry = new THREE.BoxGeometry(0.24, 0.08, 0.05);
const legGeometry = new THREE.BoxGeometry(0.2, 0.62, 0.24);
const gunGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.55);

export function createActors(scene) {
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ochre), roughness: 0.7 });
  const corMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cor), roughness: 0.6 });
  const kprMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.kpr), roughness: 0.6 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.4, metalness: 0.6 });

  const actors = [];
  const hitMeshes = [];

  function buildMesh(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, cloth);
    torso.position.y = 1.06;
    torso.userData.part = 'torso';
    const vest = new THREE.Mesh(vestGeometry, team === 'cor' ? corMat : kprMat);
    vest.position.y = 1.1;
    const head = new THREE.Mesh(headGeometry, skin);
    head.position.y = 1.6;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(visorGeometry, team === 'cor' ? corMat : kprMat);
    visor.position.set(0, 1.62, -0.14);
    const legL = new THREE.Mesh(legGeometry, cloth);
    legL.position.set(-0.14, 0.33, 0);
    const legR = new THREE.Mesh(legGeometry, cloth);
    legR.position.set(0.14, 0.33, 0);
    const gun = new THREE.Mesh(gunGeometry, gunMat);
    gun.position.set(0.2, 1.15, -0.4);
    group.add(torso, vest, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head, gun };
  }

  function createActor({ id, name, team, isPlayer }) {
    const parts = buildMesh(team);
    scene.add(parts.group);
    const actor = {
      id,
      name,
      team,
      isPlayer,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      eye: STAND_EYE,
      height: STAND_HEIGHT,
      crouching: false,
      onGround: true,
      hp: HEALTH,
      armor: 0,
      alive: true,
      fall: 0,
      spawnIndex: 0,
      loadout: { primary: null, pistol: newWeapon('pistol') },
      current: 'pistol',
      grenades: 0,
      kills: 0,
      deaths: 0,
      parts,
      brain: null,
    };
    parts.torso.userData.actor = actor;
    parts.head.userData.actor = actor;
    hitMeshes.push(parts.torso, parts.head);
    actors.push(actor);
    return actor;
  }

  function currentWeapon(actor) {
    return actor.current === 'primary' && actor.loadout.primary
      ? actor.loadout.primary
      : actor.loadout.pistol;
  }

  function switchWeapon(actor, slot) {
    if (slot === 'primary' && !actor.loadout.primary) return false;
    actor.current = slot;
    return true;
  }

  // Armour takes half the hit, one armour point per point of damage absorbed.
  function damage(actor, amount, part, attacker) {
    if (!actor.alive) return false;
    let remaining = amount;
    if (actor.armor > 0) {
      const absorbed = Math.min(actor.armor, remaining * 0.5);
      actor.armor -= absorbed;
      remaining -= absorbed;
    }
    actor.hp -= remaining;
    if (actor.hp > 0) return false;
    actor.hp = 0;
    actor.alive = false;
    actor.fall = 0;
    actor.deaths += 1;
    if (attacker) attacker.kills += 1;
    return true;
  }

  function resetActor(actor, x, z, yaw) {
    actor.position.set(x, 0, z);
    actor.velocity.set(0, 0, 0);
    actor.yaw = yaw;
    actor.pitch = 0;
    actor.eye = STAND_EYE;
    actor.height = STAND_HEIGHT;
    actor.crouching = false;
    actor.hp = HEALTH;
    actor.alive = true;
    actor.fall = 0;
    actor.parts.group.rotation.set(0, 0, 0);
    actor.parts.group.position.copy(actor.position);
    actor.parts.group.visible = true;
    actor.parts.gun.visible = true;
  }

  function stepVisuals(actor, dt) {
    const group = actor.parts.group;
    if (actor.alive) {
      group.position.copy(actor.position);
      group.rotation.y = actor.yaw;
      return;
    }
    actor.fall = Math.min(1, actor.fall + dt / FALL_SECONDS);
    group.rotation.x = -actor.fall * 1.5;
    group.position.y = actor.position.y - actor.fall * 0.1;
  }

  function aliveCount(team) {
    let count = 0;
    for (const actor of actors) if (actor.team === team && actor.alive) count += 1;
    return count;
  }

  function aliveActors(team) {
    return actors.filter((actor) => actor.team === team && actor.alive);
  }

  return {
    actors,
    hitMeshes,
    createActor,
    currentWeapon,
    switchWeapon,
    damage,
    resetActor,
    stepVisuals,
    aliveCount,
    aliveActors,
  };
}
