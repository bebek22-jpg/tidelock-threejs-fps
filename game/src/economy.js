// The money game. Kills pay, round wins pay, and a losing streak adds a
// bonus so a broke team can still buy back into the next round. Bots buy
// with the same table: rifle when they can afford it, SMG on a middle
// budget, pistol only when broke, grenades and kevlar when there is money
// left over. One buy per round per weapon — no stockpiling.
import { WEAPONS, GRENADE_PRICE, GRENADE_MAX, KEVLAR_PRICE, KEVLAR_ARMOR, newWeapon } from './weapons.js';

export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1400;
export const STREAK_BONUS = 500;
export const STREAK_CAP = 2900;

export function buyWeapon(actor, money, id) {
  const def = WEAPONS[id];
  if (!def || def.price === 0) return { ok: false, money, reason: 'not for sale' };
  if (actor.loadout.primary && actor.loadout.primary.def.id === id) {
    return { ok: false, money, reason: 'already owned' };
  }
  if (money < def.price) return { ok: false, money, reason: 'not enough money' };
  const weapon = newWeapon(id);
  actor.loadout.primary = weapon;
  actor.current = 'primary';
  return { ok: true, money: money - def.price, reason: '' };
}

export function buyGrenade(actor, money) {
  if (actor.grenades >= GRENADE_MAX) return { ok: false, money, reason: 'grenade pouch full' };
  if (money < GRENADE_PRICE) return { ok: false, money, reason: 'not enough money' };
  actor.grenades += 1;
  return { ok: true, money: money - GRENADE_PRICE, reason: '' };
}

export function buyKevlar(actor, money) {
  if (actor.armor >= KEVLAR_ARMOR) return { ok: false, money, reason: 'vest already full' };
  if (money < KEVLAR_PRICE) return { ok: false, money, reason: 'not enough money' };
  actor.armor = KEVLAR_ARMOR;
  return { ok: true, money: money - KEVLAR_PRICE, reason: '' };
}

export function roundRewards(state, winner) {
  const loser = winner === 'cor' ? 'kpr' : 'cor';
  state.lossStreak = winner === 'cor' ? 0 : state.lossStreak + 1;
  const lossBonus = Math.min(STREAK_CAP, LOSS_REWARD + STREAK_BONUS * state.lossStreak);
  if (winner === 'cor') state.money += WIN_REWARD;
  else state.money += lossBonus;
  return { winner, loser, lossBonus };
}

export function botBuy(actor, money) {
  let left = money;
  let picked = null;
  if (left >= WEAPONS.dmr.price && Math.random() < 0.25) picked = 'dmr';
  else if (left >= WEAPONS.rifle.price) picked = 'rifle';
  else if (left >= WEAPONS.smg.price) picked = 'smg';
  if (picked) {
    actor.loadout.primary = newWeapon(picked);
    actor.current = 'primary';
    left -= WEAPONS[picked].price;
  } else {
    actor.loadout.primary = null;
    actor.current = 'pistol';
  }
  if (left >= KEVLAR_PRICE && Math.random() < 0.6) {
    actor.armor = KEVLAR_ARMOR;
    left -= KEVLAR_PRICE;
  }
  if (left >= GRENADE_PRICE && Math.random() < 0.5) {
    actor.grenades = 1;
    left -= GRENADE_PRICE;
  }
  return left;
}
