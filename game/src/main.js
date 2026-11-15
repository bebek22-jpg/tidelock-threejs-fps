// TIDELOCK — Pier 9. The entry point wires every module together: the
// fixed-step simulation (60 Hz, decoupled from the render rate), the one
// shared shot resolver both the player and the bots fire through, the round
// state machine, the buy menu, and the deterministic screenshot staging the
// dossier's screenshots are taken from (?shot=start|combat|buy|plant&seed=N
// freezes a staged frame and sets window.__shotReady).
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPhysics } from './physics.js';
import { createActors, STAND_EYE } from './actors.js';
import { createPlayerControl } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createState, resetRoundState, PHASES, BUY_SECONDS, ROUND_SECONDS, BOMB_SECONDS, ROUNDS_TO_WIN, START_MONEY, pushEvent } from './state.js';
import { MAP } from './map.js';
import { weaponStep, weaponFire, weaponReload, weaponSpread, weaponDamage, newWeapon } from './weapons.js';
import { buyWeapon, buyGrenade, buyKevlar, roundRewards, KILL_REWARD } from './economy.js';

const STEP = 1 / 60;
const ROUND_END_SECONDS = 4;
const START_URL = new URLSearchParams(window.location.search);
const SHOT = START_URL.get('shot');
const SEED = Number.parseInt(START_URL.get('seed') || '7', 10);

// Deterministic staging: one mulberry32 replaces Math.random for the whole
// session when a seed is given, so a screenshot setup replays identically.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
if (SHOT) Math.random = mulberry32(SEED);

const canvas = document.getElementById('game');
const world = createWorld(canvas, { fullRes: !!SHOT });
const physics = createPhysics(world.colliders);
const state = createState();
const actorsApi = createActors(world.scene);
const audio = createAudio();
const hud = createHud();
const bombApi = createBomb(world.scene);
const grenadesApi = createGrenades(world.scene, physics, actorsApi);
const input = createInput(canvas, onLockChange);

const COR_NAMES = ['Reef', 'Tide', 'Gale'];
const KPR_NAMES = ['Anchor', 'Beacon', 'Pike', 'Salt'];

const player = actorsApi.createActor({ id: 0, name: 'You', team: 'cor', isPlayer: true });
const botActors = [];
COR_NAMES.forEach((name, i) => {
  botActors.push(actorsApi.createActor({ id: 1 + i, name, team: 'cor', isPlayer: false }));
});
KPR_NAMES.forEach((name, i) => {
  botActors.push(actorsApi.createActor({ id: 4 + i, name, team: 'kpr', isPlayer: false }));
});

const playerControl = createPlayerControl(player, physics);

// The one shot resolver. A ray leaves the shooter's eye along the aim
// direction with the weapon's spread; the nearest of wall, torso and head
// wins. Headshots multiply damage; no friendly fire.
const raycaster = new THREE.Raycaster();
const eyePos = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();

function eyeOf(actor) {
  return eyePos.set(actor.position.x, actor.position.y + actor.eye, actor.position.z);
}

function aimOf(actor, spread) {
  const cp = Math.cos(actor.pitch);
  aimDir.set(-Math.sin(actor.yaw) * cp, Math.sin(actor.pitch), -Math.cos(actor.yaw) * cp);
  if (spread > 0) {
    aimDir.x += (Math.random() - 0.5) * 2 * spread;
    aimDir.y += (Math.random() - 0.5) * 2 * spread;
    aimDir.z += (Math.random() - 0.5) * 2 * spread;
  }
  return aimDir.normalize();
}

function fireShot(shooter) {
  const weapon = actorsApi.currentWeapon(shooter);
  if (!weaponFire(weapon)) return false;
  const speed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
  const spread = weaponSpread(weapon, speed, shooter.crouching);
  const origin = eyeOf(shooter).clone();
  const dir = aimOf(shooter, spread).clone();
  const wallD = physics.rayDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, weapon.def.range);

  raycaster.set(origin, dir);
  raycaster.far = Math.min(wallD, weapon.def.range);
  const hits = raycaster.intersectObjects(actorsApi.hitMeshes, false);
  let hit = null;
  for (const candidate of hits) {
    if (candidate.object.userData.actor === shooter) continue;
    hit = candidate;
    break;
  }

  let endD = wallD;
  if (hit) {
    endD = hit.distance;
    const victim = hit.object.userData.actor;
    // No friendly fire: a teammate's body stops the bullet, but the bullet
    // does no damage and scores no hit.
    if (victim.team === shooter.team) {
      hitPoint.copy(origin).addScaledVector(dir, endD);
      muzzlePos.copy(origin).addScaledVector(dir, 0.6);
      world.setTracer(muzzlePos, hitPoint);
      world.flashMuzzle(muzzlePos);
      audio.shot(origin.x, origin.y, origin.z, weapon.def.id === 'dmr');
      botsApi.onShot(origin, shooter);
      return true;
    }
    const part = hit.object.userData.part;
    const died = actorsApi.damage(victim, weaponDamage(weapon, hit.distance, part === 'head'), part, shooter);
    if (shooter.isPlayer) {
      hud.showHitmarker(died);
      if (died) audio.kill();
      else audio.hit();
    }
    if (victim.isPlayer) {
      state.damageFlash = 1;
      state.shake = 0.35;
    }
    if (died) pushEvent(state, { type: 'kill', killer: shooter, victim, headshot: part === 'head', weapon: weapon.def.id });
  }
  hitPoint.copy(origin).addScaledVector(dir, endD);
  muzzlePos.copy(origin).addScaledVector(dir, 0.6);
  world.setTracer(muzzlePos, hitPoint);
  world.flashMuzzle(muzzlePos);
  audio.shot(origin.x, origin.y, origin.z, weapon.def.id === 'dmr');
  botsApi.onShot(origin, shooter);
  if (shooter.isPlayer) {
    playerControl.recoil(weapon.def.recoil * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * weapon.def.recoil);
  }
  return true;
}

const botsApi = createBots({ actors: actorsApi, physics, state, fireShot });
botActors.forEach((actor, i) => botsApi.createBrain(actor, i));

// ---------------- Round flow ----------------

function spawnAll() {
  const corSpawns = MAP.spawns.cor;
  const kprSpawns = MAP.spawns.kpr;
  actorsApi.resetActor(player, corSpawns[0][0], corSpawns[0][1], -Math.PI / 2);
  player.carrying = true;
  state.bomb.holder = player;
  botActors.forEach((actor) => {
    const list = actor.team === 'cor' ? corSpawns : kprSpawns;
    const index = actor.team === 'cor'
      ? COR_NAMES.indexOf(actor.name) + 1
      : KPR_NAMES.indexOf(actor.name);
    const [x, z] = list[index];
    actorsApi.resetActor(actor, x, z, actor.team === 'cor' ? -Math.PI / 2 : Math.PI / 2);
    actor.carrying = false;
    actor.loadout.primary = null;
    actor.loadout.pistol = newWeapon('pistol');
    actor.current = 'pistol';
    actor.grenades = 0;
    actor.armor = 0;
  });
  player.loadout.primary = null;
  player.loadout.pistol = newWeapon('pistol');
  player.current = 'pistol';
  player.grenades = 0;
  player.armor = 0;
  grenadesApi.clearAll(state);
}

function startRound() {
  resetRoundState(state);
  state.attackSite = Math.random() < 0.5 ? 'A' : 'B';
  spawnAll();
  botsApi.buyPhase();
  botsApi.assignRoles();
  state.phase = PHASES.BUY;
  state.phaseTime = 0;
  hud.show();
  hud.setBanner(`ROUND ${state.round}`, `Plan: Berth ${state.attackSite} — the charge is yours. Hold E on a berth to plant.`);
  hud.setHint('B — buy · the round starts when the clock runs out');
  openBuy();
}

function startMatch() {
  state.score.cor = 0;
  state.score.kpr = 0;
  state.money = START_MONEY;
  state.kills = 0;
  state.deaths = 0;
  state.lossStreak = 0;
  state.round = 1;
  state.matchWinner = null;
  for (const actor of actorsApi.actors) {
    actor.kills = 0;
    actor.deaths = 0;
    actor.money = START_MONEY;
  }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  startRound();
}

function endRound(winner, reason) {
  if (state.phase === PHASES.ROUND_END || state.phase === PHASES.MATCH_END) return;
  state.phase = PHASES.ROUND_END;
  state.phaseTime = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  roundRewards(state, winner);
  botsApi.roundEnd(winner);
  audio.round();
  closeBuy();
  const winnerName = winner === 'cor' ? 'CORSAIRS TAKE THE ROUND' : 'KEEPERS TAKE THE ROUND';
  hud.setBanner(winnerName, reason);
  hud.setHint('');
  if (state.score[winner] >= ROUNDS_TO_WIN) {
    state.matchWinner = winner;
  }
}

function checkRoundEnd() {
  if (state.phase !== PHASES.LIVE) return;
  const bomb = state.bomb;
  if (bomb.status === 'exploded') {
    endRound('cor', 'The charge blew Berth ' + bomb.site + '.');
    return;
  }
  if (bomb.status === 'defused') {
    endRound('kpr', 'The charge was defused.');
    return;
  }
  const corAlive = actorsApi.aliveCount('cor');
  const kprAlive = actorsApi.aliveCount('kpr');
  if (bomb.status === 'planted') {
    // With the charge armed, wiping the Corsairs does not end the round:
    // someone still has to defuse it. Wiping the Keepers does.
    if (kprAlive === 0) endRound('cor', 'No Keeper left to defuse the charge.');
    return;
  }
  if (corAlive === 0) {
    endRound('kpr', 'All Corsairs are down.');
    return;
  }
  if (kprAlive === 0) {
    endRound('cor', 'All Keepers are down.');
    return;
  }
  if (state.roundTime <= 0) {
    endRound('kpr', 'Time expired — the charge never went off.');
  }
}

// ---------------- Buy menu ----------------

let buyOpen = false;
function openBuy() {
  if (state.phase !== PHASES.BUY) return;
  buyOpen = true;
  hud.showBuy();
  hud.updateBuy(state.money, player.loadout, player.grenades, player.armor);
  input.releaseLock();
}
function closeBuy() {
  if (!buyOpen) return;
  buyOpen = false;
  hud.hideBuy();
  if (state.phase === PHASES.BUY || state.phase === PHASES.LIVE) input.requestLock();
}
function tryBuy(kind) {
  if (!buyOpen) return;
  let result;
  if (kind === 'grenade') result = buyGrenade(player, state.money);
  else if (kind === 'kevlar') result = buyKevlar(player, state.money);
  else result = buyWeapon(player, state.money, kind);
  if (result.ok) {
    state.money = result.money;
    audio.buy();
  } else {
    audio.denied();
    hud.setHint(result.reason);
  }
  hud.updateBuy(state.money, player.loadout, player.grenades, player.armor);
}

document.querySelectorAll('#buy-menu [data-buy]').forEach((button) => {
  button.addEventListener('click', () => tryBuy(button.dataset.buy));
});

// ---------------- Input ----------------

let prevFiring = false;
let stepSoundAt = 0;

function onLockChange(locked) {
  const hint = document.getElementById('lock-hint');
  if (hint) {
    hint.classList.toggle('hidden', locked || state.phase === PHASES.MENU || state.phase === PHASES.MATCH_END || buyOpen);
  }
}

canvas.addEventListener('click', () => {
  if (state.phase !== PHASES.MENU && state.phase !== PHASES.MATCH_END && !buyOpen) input.requestLock();
});

function handleKeys(pressed) {
  for (const code of pressed) {
    if (code === 'KeyB' && state.phase === PHASES.BUY) {
      if (buyOpen) closeBuy();
      else openBuy();
      continue;
    }
    if (buyOpen) {
      const buyKeys = { Digit1: 'smg', Digit2: 'rifle', Digit3: 'dmr', Digit4: 'grenade', Digit5: 'kevlar' };
      if (buyKeys[code]) {
        tryBuy(buyKeys[code]);
        continue;
      }
    }
    if (code === 'Digit1') actorsApi.switchWeapon(player, 'primary');
    if (code === 'Digit2') actorsApi.switchWeapon(player, 'pistol');
    if (code === 'KeyR' && player.alive) {
      if (weaponReload(actorsApi.currentWeapon(player))) {
        audio.reload(player.position.x, player.position.y, player.position.z);
      }
    }
    if (code === 'KeyG' && player.alive && player.grenades > 0 && state.phase === PHASES.LIVE) {
      player.grenades -= 1;
      const dir = aimOf(player, 0).clone();
      grenadesApi.throwGrenade(state, player, dir);
    }
  }
}

// ---------------- Events ----------------

function drainEvents() {
  for (const event of state.events) {
    if (event.type === 'kill') {
      hud.addKill(event.killer, event.victim, event.headshot);
      if (event.killer.isPlayer) {
        state.money += KILL_REWARD;
        state.kills += 1;
      } else if (event.killer.brain) {
        event.killer.brain.money += KILL_REWARD;
      }
      if (event.victim.isPlayer) {
        state.deaths += 1;
        hud.setHint('You are down — your team fights on.');
      }
    } else if (event.type === 'planted') {
      hud.setBanner('CHARGE PLANTED', `Berth ${event.site} — ${BOMB_SECONDS}s on the fuse.`);
      audio.plant(event.by.position.x, event.by.position.y, event.by.position.z);
    } else if (event.type === 'defused') {
      audio.defuse(event.by.position.x, event.by.position.y, event.by.position.z);
    } else if (event.type === 'exploded') {
      world.flashExplosion(state.bomb.position);
      audio.explosion(state.bomb.position.x, state.bomb.position.y, state.bomb.position.z);
      state.shake = 1;
    } else if (event.type === 'explosion') {
      world.flashExplosion(event.position);
      audio.explosion(event.position.x, event.position.y, event.position.z);
      if (event.position.distanceTo(player.position) < 10) state.shake = 0.6;
    } else if (event.type === 'beep') {
      audio.beep(event.position.x, event.position.y, event.position.z);
    } else if (event.type === 'picked') {
      if (event.by.isPlayer) hud.setHint('Charge picked up — plant it on a berth.');
    } else if (event.type === 'dropped') {
      hud.setHint('The charge is down — a Corsair must pick it up.');
    }
  }
  state.events.length = 0;
}

// ---------------- Simulation ----------------

function stepSim(dt) {
  state.time += dt;
  state.damageFlash = Math.max(0, state.damageFlash - dt * 1.5);
  state.shake = Math.max(0, state.shake - dt * 2);

  if (state.phase === PHASES.MENU || state.phase === PHASES.MATCH_END) return;

  const look = input.takeLook();
  if (player.alive && input.state.locked) playerControl.look(look.x, look.y);
  handleKeys(input.drainPressed());

  if (state.phase === PHASES.BUY) {
    state.phaseTime += dt;
    if (player.alive) playerControl.step(dt, input.state.keys);
    if (state.phaseTime >= BUY_SECONDS) {
      state.phase = PHASES.LIVE;
      state.phaseTime = 0;
      closeBuy();
      hud.setHint(state.playerIsCarrier || player.carrying
        ? `Plant the charge on Berth ${state.attackSite} — or clear the Keepers out.`
        : 'Clear the Keepers out — or back the carrier up.');
      hud.clearBanner();
    }
  } else if (state.phase === PHASES.LIVE) {
    if (state.bomb.status !== 'planted') {
      state.roundTime = Math.max(0, state.roundTime - dt);
    }
    // Player.
    if (player.alive) {
      playerControl.step(dt, input.state.keys);
      const weapon = actorsApi.currentWeapon(player);
      weaponStep(weapon, dt);
      const firing = input.state.firing && input.state.locked;
      const triggerEdge = firing && !prevFiring;
      if ((weapon.def.auto && firing) || (!weapon.def.auto && triggerEdge)) {
        if (weapon.mag === 0 && weapon.reserve > 0) weaponReload(weapon);
        else fireShot(player);
      }
      prevFiring = firing;
      // Footsteps, quiet and regular.
      const speed = playerControl.groundSpeed();
      if (speed > 1 && player.onGround && state.time - stepSoundAt > 0.38) {
        stepSoundAt = state.time;
        audio.step(player.position.x, player.position.y, player.position.z);
      }
      // Plant / defuse: hold E.
      const plantHeld = input.state.keys.has('KeyE');
      bombApi.step(state, actorsApi.actors, player, dt, plantHeld, plantHeld);
      const site = bombApi.siteAt(player.position.x, player.position.z);
      if (player.carrying && site && state.bomb.status === 'carried') {
        hud.setHint(`Hold E to plant the charge on Berth ${site}.`);
      } else if (state.bomb.status === 'planted' && player.alive) {
        hud.setHint('The charge is armed — hold the berth.');
      }
    } else {
      bombApi.step(state, actorsApi.actors, player, dt, false, false);
    }
    botsApi.step(dt);
    grenadesApi.step(state, dt);
    drainEvents();
    checkRoundEnd();
  } else if (state.phase === PHASES.ROUND_END) {
    state.phaseTime += dt;
    // The world keeps moving for a beat after the round ends.
    botsApi.step(dt);
    grenadesApi.step(state, dt);
    drainEvents();
    if (state.phaseTime >= ROUND_END_SECONDS) {
      if (state.matchWinner) {
        state.phase = PHASES.MATCH_END;
        const won = state.matchWinner === 'cor';
        document.getElementById('end-title').textContent = won ? 'VICTORY' : 'DEFEAT';
        document.getElementById('end-sub').textContent = won
          ? `The pier is yours — ${state.score.cor} to ${state.score.kpr}.`
          : `The Keepers held the pier — ${state.score.kpr} to ${state.score.cor}.`;
        document.getElementById('end').classList.remove('hidden');
        input.releaseLock();
      } else {
        state.round += 1;
        startRound();
      }
    }
  }

  for (const actor of actorsApi.actors) actorsApi.stepVisuals(actor, dt);
  world.stepFx(dt);
  const weapon = actorsApi.currentWeapon(player);
  world.setViewmodelKick(weapon.kick);
}

// ---------------- Render ----------------

function render() {
  const camera = world.camera;
  camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
  let shakeYaw = 0;
  let shakePitch = 0;
  if (state.shake > 0) {
    shakeYaw = (Math.random() - 0.5) * 0.03 * state.shake;
    shakePitch = (Math.random() - 0.5) * 0.03 * state.shake;
  }
  camera.rotation.y = player.yaw + shakeYaw;
  camera.rotation.x = player.pitch + shakePitch;
  camera.rotation.z = 0;
  world.renderer.render(world.scene, camera);
  audio.setListener(player.position.x, player.position.y + player.eye, player.position.z);
  hud.update(state, player, actorsApi.actors, actorsApi.currentWeapon(player), state.time);
}

let last = performance.now();
let accumulator = 0;
let frozen = false;
let frameCount = 0;
let slowFrames = 0;
let qualityLevel = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.phase === PHASES.MENU) {
    player.yaw = -Math.PI / 2 + Math.sin(now / 4000) * 0.15;
  }
  if (frozen) {
    render();
    return;
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 8) {
    stepSim(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 8) accumulator = 0;
  render();
  // Adaptive quality: a slow renderer drops pixel ratio, then shadows,
  // then resolution. Checked often so a struggling machine recovers fast.
  frameCount += 1;
  if (dt > 0.04) slowFrames += 1;
  if (frameCount >= 120) {
    if (slowFrames > 40 && qualityLevel < 3) {
      qualityLevel += 1;
      world.adaptQuality(qualityLevel);
    }
    frameCount = 0;
    slowFrames = 0;
  }
}

// ---------------- Menu ----------------

document.getElementById('start-btn').addEventListener('click', () => {
  audio.unlock();
  startMatch();
  // No pointer lock here: the buy menu opens at once and needs the cursor.
  // Closing the menu (B, or the buy clock) requests the lock.
});
document.getElementById('again-btn').addEventListener('click', () => {
  audio.unlock();
  startMatch();
});

window.addEventListener('resize', world.resize);

// ---------------- Screenshot staging ----------------

function stageShot(kind) {
  // Every staged frame starts from a fresh match so the HUD numbers are
  // real: money, ammo, score and timer all come from the sim.
  startMatch();
  closeBuy();
  if (kind === 'start') {
    // Menu over the pier: the player stands at the west spawn looking down
    // the mid lane toward the yard.
    document.getElementById('menu').classList.remove('hidden');
    hud.hide();
    player.position.set(-24, 0, 0);
    player.yaw = -Math.PI / 2;
    player.pitch = 0.02;
    return;
  }
  if (kind === 'combat') {
    // Mid-round firefight: the player holds the mid yard with two Keepers
    // in view and one kill already in the feed.
    state.phase = PHASES.LIVE;
    state.roundTime = 61;
    hud.clearBanner();
    hud.setHint(`Plant the charge on Berth ${state.attackSite} — or clear the Keepers out.`);
    player.position.set(-4, 0, 2);
    player.yaw = -Math.PI / 2;
    player.pitch = 0;
    const anchor = botActors[3];
    const beacon = botActors[4];
    anchor.position.set(10, 0, -5);
    anchor.yaw = Math.PI / 2;
    beacon.position.set(12, 0, 3);
    beacon.yaw = Math.PI / 2;
    // A scripted kill for the feed: the player drops Pike.
    const pike = botActors[5];
    pike.position.set(8, 0, 0);
    actorsApi.damage(pike, 200, 'head', player);
    pushEvent(state, { type: 'kill', killer: player, victim: pike, headshot: true, weapon: 'rifle' });
    drainEvents();
    player.loadout.primary = newWeapon('rifle');
    player.current = 'primary';
    player.loadout.primary.mag = 24;
    state.money = 3250;
    return;
  }
  if (kind === 'buy') {
    // Buy phase with a fat wallet and the rifle already bought.
    state.money = 4750;
    hud.clearBanner();
    tryBuySilent('rifle');
    hud.showBuy();
    hud.updateBuy(state.money, player.loadout, player.grenades, player.armor);
    buyOpen = true;
    player.position.set(-24, 0, 0);
    player.yaw = -Math.PI / 2;
    return;
  }
  if (kind === 'plant') {
    // The charge is armed on Berth A; the player covers it while two
    // Keepers push the retake.
    state.phase = PHASES.LIVE;
    state.roundTime = 0;
    state.bomb.status = 'planted';
    state.bomb.site = 'A';
    state.bomb.timer = 24;
    state.bomb.position.set(20, 0, -14);
    state.bomb.holder = null;
    player.carrying = false;
    player.position.set(16, 0, -11);
    player.yaw = -Math.PI / 4;
    player.pitch = 0;
    bombApi.group.visible = true;
    bombApi.group.position.set(20, 0.1, -14);
    const anchor = botActors[3];
    const salt = botActors[6];
    anchor.position.set(14, 0, -8);
    anchor.yaw = Math.PI;
    salt.position.set(17, 0, -4);
    salt.yaw = Math.PI / 2;
    hud.setBanner('CHARGE PLANTED', 'Berth A — hold it.');
    hud.setHint('The charge is armed — hold the berth.');
    state.money = 1400;
  }
}

function tryBuySilent(kind) {
  const result = buyWeapon(player, state.money, kind);
  if (result.ok) state.money = result.money;
}

// Debug hook for playtesting: inspect the live sim from the console.
window.__tidelock = { state, player, actors: actorsApi.actors };

if (SHOT) {
  stageShot(SHOT);
  // Two renders so the first frame is fully drawn, then freeze the sim.
  render();
  render();
  frozen = true;
  window.__shotReady = true;
} else {
  // Menu backdrop: the camera drifts at the west spawn while the loop runs
  // behind the menu, so the pier is alive before the first click.
  player.position.set(-24, 0, 0);
  player.yaw = -Math.PI / 2;
  requestAnimationFrame(loop);
}
