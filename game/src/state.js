// The single state store. One object holds the whole match: phase, round,
// score, money, the charge and the event queue the HUD and the audio drain
// each frame. Modules read it and write it; nothing keeps a second copy of
// a number that matters, so a bug in one place shows up in one place.
import * as THREE from 'three';

export const PHASES = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 30;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const ROUNDS_TO_WIN = 5;
export const START_MONEY = 800;

export function createState() {
  return {
    time: 0,
    phase: PHASES.MENU,
    phaseTime: 0,
    round: 1,
    roundTime: ROUND_SECONDS,
    score: { cor: 0, kpr: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    lossStreak: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    // Charge: carried (by holder) | dropped | planted | exploded | defused.
    bomb: {
      status: 'carried',
      holder: null,
      site: null,
      position: new THREE.Vector3(),
      plant: 0,
      defuse: 0,
      timer: BOMB_SECONDS,
      beepAt: 0,
    },
    // Thrown grenades in flight: { pos, vel, fuse, bounced, mesh, owner }.
    grenades: [],
    // Events this frame: { type, ... }. Drained by main after each step.
    events: [],
    // One-shot flags the HUD reads.
    damageFlash: 0,
    shake: 0,
    // The player is a Corsair; the carrier starts as the player.
    playerIsCarrier: true,
    // Which site the Corsairs chose this round ('A' | 'B').
    attackSite: 'A',
  };
}

// Per-round reset: clocks, charge and one-shot flags back to their starts.
// Scores, money and the loss streak live across rounds and stay untouched.
export function resetRoundState(state) {
  state.phaseTime = 0;
  state.roundTime = ROUND_SECONDS;
  state.roundWinner = null;
  state.roundReason = '';
  state.bomb.status = 'carried';
  state.bomb.holder = null;
  state.bomb.site = null;
  state.bomb.plant = 0;
  state.bomb.defuse = 0;
  state.bomb.timer = BOMB_SECONDS;
  state.bomb.beepAt = 0;
  state.grenades.length = 0;
  state.events.length = 0;
  state.damageFlash = 0;
  state.shake = 0;
  state.playerIsCarrier = true;
}

export function pushEvent(state, event) {
  state.events.push(event);
}
