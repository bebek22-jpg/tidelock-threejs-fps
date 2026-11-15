// The HUD: DOM for text and bars, one canvas for the minimap. The sim
// calls update() every frame with the state it needs; the HUD never reads
// the sim itself, so it can be driven by a replay or a screenshot staging
// just as well. The minimap is drawn from the map data every frame: walls
// as blocks, berths as rings, actors as dots, the player as a heading
// wedge, the charge as a blinking pip.
import { MAP } from './map.js';
import { WEAPONS, GRENADE_PRICE, KEVLAR_PRICE } from './weapons.js';

const MINIMAP_SIZE = 150;
const MAP_SCALE = MINIMAP_SIZE / 60;
const MAP_CX = MINIMAP_SIZE / 2;
const MAP_CY = MINIMAP_SIZE / 2;

function mapX(x) { return MAP_CX + x * MAP_SCALE; }
function mapZ(z) { return MAP_CY + z * MAP_SCALE; }

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthBar: $('health-bar'),
    healthNum: $('health-num'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenadeCount: $('grenade-count'),
    money: $('money'),
    timer: $('timer'),
    scoreCor: $('score-cor'),
    scoreKpr: $('score-kpr'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    buyMenu: $('buy-menu'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    damageFlash: $('damage-flash'),
    hint: $('hint'),
    teams: $('teams'),
    minimap: $('minimap'),
  };
  const mapCtx = el.minimap ? el.minimap.getContext('2d') : null;
  let hitAt = 0;
  let bannerAt = 0;

  function show() { el.root.classList.remove('hidden'); }
  function hide() { el.root.classList.add('hidden'); }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function addKill(killer, victim, headshot) {
    if (!el.killfeed) return;
    const line = document.createElement('div');
    line.className = 'kill-line';
    line.innerHTML = `<span class="killer ${killer.team}">${escapeHtml(killer.name)}</span>`
      + `<span class="kill-weapon">${headshot ? '◉' : '✕'}</span>`
      + `<span class="victim ${victim.team}">${escapeHtml(victim.name)}</span>`;
    el.killfeed.appendChild(line);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.firstChild);
    setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setBanner(text, subtext = '') {
    if (!el.banner) return;
    el.banner.innerHTML = `<div class="banner-main">${text}</div>`
      + (subtext ? `<div class="banner-sub">${subtext}</div>` : '');
    el.banner.classList.remove('hidden');
    bannerAt = performance.now();
  }

  function clearBanner() {
    if (el.banner) el.banner.classList.add('hidden');
  }

  function showHitmarker(kill) {
    if (!el.hitmarker) return;
    el.hitmarker.classList.remove('hidden');
    el.hitmarker.classList.toggle('kill', kill);
    hitAt = performance.now();
  }

  function setHint(text) {
    if (el.hint) el.hint.textContent = text;
  }

  function showBuy() { el.buyMenu.classList.remove('hidden'); }
  function hideBuy() { el.buyMenu.classList.add('hidden'); }

  function updateBuy(money, loadout, grenades, armor) {
    for (const button of el.buyMenu.querySelectorAll('[data-buy]')) {
      const kind = button.dataset.buy;
      let price = 0;
      let owned = false;
      if (kind === 'grenade') {
        price = GRENADE_PRICE;
        owned = grenades >= 2;
      } else if (kind === 'kevlar') {
        price = KEVLAR_PRICE;
        owned = armor >= 100;
      } else {
        price = WEAPONS[kind].price;
        owned = loadout.primary && loadout.primary.def.id === kind;
      }
      button.classList.toggle('afford', money >= price && !owned);
      button.classList.toggle('owned', owned);
      const priceEl = button.querySelector('.buy-price');
      if (priceEl) priceEl.textContent = owned ? 'OWNED' : `$${price}`;
    }
    const moneyEl = el.buyMenu.querySelector('.buy-money');
    if (moneyEl) moneyEl.textContent = `$${money}`;
  }

  function drawMinimap(actors, player, bomb, time) {
    if (!mapCtx) return;
    const ctx = mapCtx;
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = 'rgba(20, 28, 36, 0.85)';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    // Walls and tall cover.
    ctx.fillStyle = 'rgba(180, 190, 200, 0.55)';
    for (const [w, h, d, x, y, z] of MAP.boxes) {
      if (h < 1.5 || y < 0) continue;
      ctx.fillRect(mapX(x - w / 2), mapZ(z - d / 2), w * MAP_SCALE, d * MAP_SCALE);
    }
    // Berth rings.
    ctx.strokeStyle = 'rgba(255, 176, 46, 0.9)';
    ctx.lineWidth = 1.5;
    for (const key of ['A', 'B']) {
      const site = MAP.sites[key];
      ctx.beginPath();
      ctx.arc(mapX(site.center[0]), mapZ(site.center[1]), site.radius * MAP_SCALE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 176, 46, 0.9)';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key, mapX(site.center[0]), mapZ(site.center[1]) + 3);
    }
    // The charge: blinking red when planted, amber when dropped.
    if (bomb.status === 'planted' || bomb.status === 'dropped') {
      const blink = bomb.status === 'planted' ? (Math.sin(time * 10) > 0 ? '#ff4444' : '#881111') : '#ffb02e';
      ctx.fillStyle = blink;
      ctx.beginPath();
      ctx.arc(mapX(bomb.position.x), mapZ(bomb.position.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Actors: team dots, the player a heading wedge.
    for (const actor of actors) {
      if (!actor.alive) continue;
      const x = mapX(actor.position.x);
      const z = mapZ(actor.position.z);
      if (actor.isPlayer) {
        ctx.fillStyle = '#ffffff';
        ctx.save();
        ctx.translate(x, z);
        ctx.rotate(Math.atan2(Math.sin(actor.yaw), Math.cos(actor.yaw)) + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = actor.team === 'cor' ? '#c96a2e' : '#3f7dc9';
        ctx.beginPath();
        ctx.arc(x, z, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function update(state, player, actors, weapon, time) {
    if (!el.root || el.root.classList.contains('hidden')) return;
    const hp = Math.max(0, Math.ceil(player.hp));
    el.healthBar.style.width = `${hp}%`;
    el.healthBar.classList.toggle('low', hp <= 30);
    el.healthNum.textContent = hp;
    el.armorNum.textContent = Math.ceil(player.armor);
    el.ammoMag.textContent = weapon.mag;
    el.ammoReserve.textContent = weapon.reserve;
    el.weaponName.textContent = weapon.def.name + (weapon.reloadLeft > 0 ? ' — reloading' : '');
    el.grenadeCount.textContent = player.grenades;
    el.money.textContent = `$${state.money}`;
    el.timer.textContent = state.bomb.status === 'planted'
      ? formatTime(state.bomb.timer)
      : formatTime(state.roundTime);
    el.timer.classList.toggle('danger', state.bomb.status === 'planted' || state.roundTime < 10);
    el.scoreCor.textContent = state.score.cor;
    el.scoreKpr.textContent = state.score.kpr;
    el.roundNum.textContent = `ROUND ${state.round}`;
    if (state.damageFlash > 0) {
      el.damageFlash.style.opacity = Math.min(0.7, state.damageFlash);
    } else {
      el.damageFlash.style.opacity = 0;
    }
    if (el.hitmarker && !el.hitmarker.classList.contains('hidden') && performance.now() - hitAt > 250) {
      el.hitmarker.classList.add('hidden');
    }
    if (el.banner && !el.banner.classList.contains('hidden') && performance.now() - bannerAt > 3500) {
      clearBanner();
    }
    // Plant / defuse progress.
    const bomb = state.bomb;
    if (bomb.plant > 0 && bomb.status === 'carried') {
      el.progress.classList.remove('hidden');
      el.progressFill.style.width = `${(bomb.plant / 3) * 100}%`;
      el.progressLabel.textContent = 'PLANTING THE CHARGE…';
    } else if (bomb.defuse > 0 && bomb.status === 'planted') {
      el.progress.classList.remove('hidden');
      el.progressFill.style.width = `${(bomb.defuse / 5) * 100}%`;
      el.progressLabel.textContent = 'DEFUSING…';
    } else {
      el.progress.classList.add('hidden');
    }
    // Crosshair opens up with spread: the gap tracks the current weapon.
    const gap = 6 + weapon.bloom * 220;
    el.crosshair.style.setProperty('--gap', `${gap}px`);
    // Team rosters.
    if (el.teams) {
      let html = '';
      for (const team of ['cor', 'kpr']) {
        html += `<div class="team-col ${team}">`;
        for (const actor of actors) {
          if (actor.team !== team) continue;
          html += `<div class="roster-line ${actor.alive ? '' : 'dead'}">`
            + `<span>${escapeHtml(actor.name)}</span><span>${actor.kills}/${actor.deaths}</span></div>`;
        }
        html += '</div>';
      }
      el.teams.innerHTML = html;
    }
    drawMinimap(actors, player, bomb, time);
  }

  return {
    show, hide, addKill, setBanner, clearBanner, showHitmarker, setHint,
    showBuy, hideBuy, updateBuy, update, formatTime,
  };
}
