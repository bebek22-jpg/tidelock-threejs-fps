// The arsenal. One table owns every number: damage, headshot multiplier,
// magazine, fire gap, reload, and the spread model. Spread grows with
// movement speed, with crouch it shrinks, and every shot adds bloom that
// decays — stopping to aim and firing in bursts is the only way to stay
// accurate. A weapon instance is just its definition plus its live timers.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'SP-9 Gull', slot: 1, price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48,
    gap: 0.18, auto: false, reload: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, bloomPerShot: 0.004,
    recoil: 0.006, range: 60, kick: 0.03,
  },
  smg: {
    id: 'smg', name: 'HK-7 Squall', slot: 0, price: 1500,
    damage: 26, headMult: 3, mag: 30, reserve: 120,
    gap: 0.085, auto: true, reload: 2.0,
    spreadStill: 0.006, spreadMove: 0.03, bloomPerShot: 0.005,
    recoil: 0.007, range: 45, kick: 0.035,
  },
  rifle: {
    id: 'rifle', name: 'MR-41 Breakwater', slot: 0, price: 2700,
    damage: 33, headMult: 3, mag: 30, reserve: 90,
    gap: 0.096, auto: true, reload: 2.2,
    spreadStill: 0.003, spreadMove: 0.028, bloomPerShot: 0.004,
    recoil: 0.009, range: 70, kick: 0.05,
  },
  dmr: {
    id: 'dmr', name: 'LR-8 Longshore', slot: 0, price: 4500,
    damage: 85, headMult: 3, mag: 10, reserve: 30,
    gap: 0.45, auto: false, reload: 2.6,
    spreadStill: 0.0008, spreadMove: 0.05, bloomPerShot: 0.012,
    recoil: 0.02, range: 90, kick: 0.09,
  },
};

export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2;
export const KEVLAR_PRICE = 650;
export const KEVLAR_ARMOR = 100;

const BLOOM_DECAY = 0.055;
const MOVE_REFERENCE = 5.2;

export function newWeapon(id) {
  const def = WEAPONS[id];
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0,
    flash: 0,
    kick: 0,
  };
}

export function weaponStep(weapon, dt) {
  weapon.cooldown = Math.max(0, weapon.cooldown - dt);
  weapon.flash = Math.max(0, weapon.flash - dt);
  weapon.bloom = Math.max(0, weapon.bloom - BLOOM_DECAY * dt);
  weapon.kick += (0 - weapon.kick) * Math.min(1, dt * 14);
  if (weapon.reloadLeft > 0) {
    weapon.reloadLeft = Math.max(0, weapon.reloadLeft - dt);
    if (weapon.reloadLeft === 0) {
      const need = weapon.def.mag - weapon.mag;
      const take = Math.min(need, weapon.reserve);
      weapon.mag += take;
      weapon.reserve -= take;
    }
  }
}

export function weaponReady(weapon) {
  return weapon.mag > 0 && weapon.cooldown === 0 && weapon.reloadLeft === 0;
}

export function weaponFire(weapon) {
  if (!weaponReady(weapon)) return false;
  weapon.mag -= 1;
  weapon.cooldown = weapon.def.gap;
  weapon.flash = 0.06;
  weapon.kick = weapon.def.kick;
  weapon.bloom = Math.min(0.06, weapon.bloom + weapon.def.bloomPerShot);
  return true;
}

export function weaponReload(weapon) {
  if (weapon.reloadLeft > 0 || weapon.mag === weapon.def.mag || weapon.reserve === 0) return false;
  weapon.reloadLeft = weapon.def.reload;
  return true;
}

// Spread in radians: still base, plus a movement term that reaches full at
// a sprint, plus bloom. Crouching halves the movement term.
export function weaponSpread(weapon, speed, crouching) {
  const def = weapon.def;
  const move = Math.min(1, speed / MOVE_REFERENCE) * def.spreadMove * (crouching ? 0.5 : 1);
  return def.spreadStill + move + weapon.bloom;
}

// Damage falls off past half range, down to 55% at full range.
export function weaponDamage(weapon, distance, headshot) {
  const def = weapon.def;
  const falloff = distance <= def.range * 0.5
    ? 1
    : Math.max(0.55, 1 - 0.45 * ((distance - def.range * 0.5) / (def.range * 0.5)));
  const base = def.damage * falloff;
  return headshot ? base * def.headMult : base;
}
