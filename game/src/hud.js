// hud.js — the DOM heads-up display: health, district, money, wanted stars,
// the objective pill with distance and countdown, ammo, hints, the BUSTED
// meter, notifications and the dialogue box. Written only when values change.
import { S, districtAt } from './config.js';
import { CS } from './combat.js';

const el = (id) => document.getElementById(id);

export function createHud(g) {
  const H = {
    health: el('hud-health'), money: el('hud-money'), stars: el('hud-stars'),
    district: el('hud-district'), objText: el('obj-text'), objDist: el('obj-dist'),
    objTimer: el('obj-timer'), ammo: el('ammo'), hint: el('hint'), notify: el('notify'),
    dlg: el('dialogue'), dlgName: el('dlg-name'), dlgText: el('dlg-text'),
    bustedWrap: el('busted-wrap'), bustedFill: el('busted-fill'),
    crosshair: el('crosshair'), dmg: el('dmg'),
  };
  const queue = [];
  let current = null, currentUntil = 0, notifyUntil = -1, dmgUntil = -1;
  const cache = {};
  function set(key, node, value, prop) {
    if (cache[key] === value) return;
    cache[key] = value;
    if (prop === 'html') node.innerHTML = value;
    else if (prop === 'width') node.style.width = value;
    else node.textContent = value;
  }

  const api = {
    showDialogue(speaker, text, dur) { queue.push({ speaker, text, dur: dur || 4 }); },
    clearDialogue() { queue.length = 0; current = null; H.dlg.classList.add('hidden'); },
    notify(text, dur) {
      H.notify.textContent = text;
      H.notify.classList.remove('hidden');
      notifyUntil = S.time + (dur || 2.6);
    },
    flashDamage() { dmgUntil = S.time + 0.3; H.dmg.classList.remove('hidden'); },
    update() {
      const pp = g.player.pos();
      set('hp', H.health, Math.max(0, S.hp) + '%', 'width');
      set('money', H.money, '$' + S.money);
      set('stars', H.stars,
        '<span class="on">' + '★'.repeat(S.wanted) + '</span><span class="off">' + '☆'.repeat(5 - S.wanted) + '</span>', 'html');
      set('district', H.district, districtAt(pp.x, pp.z));
      const o = g.missions.currentObjective();
      set('obj', H.objText, o.text || '');
      let distText = '';
      if (o.x !== null && o.x !== undefined) {
        distText = '— ' + Math.round(Math.hypot(pp.x - o.x, pp.z - o.z)) + 'm';
      }
      set('objd', H.objDist, distText);
      set('objt', H.objTimer, o.timer !== null && o.timer !== undefined ? '⏱ ' + Math.ceil(o.timer) + 's' : '');
      set('ammo', H.ammo, CS.drawn
        ? 'PISTOL ' + CS.mag + ' / ' + CS.reserve + (CS.reloading ? ' — RELOADING' : '')
        : '');
      let hint = '';
      if (S.screen === 'playing') {
        if (S.inCar) hint = 'W A S D drive · Space brake · E exit';
        else if (g.player.nearestCar()) hint = 'E — enter car';
        else if (CS.drawn) hint = 'Click shoot · R reload · Q holster';
        else hint = 'W A S D move · Shift run · Q draw pistol · P pause';
      }
      set('hint', H.hint, hint);
      const bust = S.bustedMeter > 0.02 && S.screen === 'playing';
      H.bustedWrap.classList.toggle('hidden', !bust);
      if (bust) set('bust', H.bustedFill, (S.bustedMeter * 100) + '%', 'width');
      H.crosshair.classList.toggle('hidden', !(CS.drawn && S.screen === 'playing'));
      // dialogue queue
      if (!current && queue.length) {
        current = queue.shift();
        currentUntil = S.time + current.dur;
        H.dlgName.textContent = current.speaker;
        H.dlgText.textContent = current.text;
        H.dlg.classList.remove('hidden');
      } else if (current && S.time > currentUntil) {
        current = null;
        H.dlg.classList.add('hidden');
      }
      if (notifyUntil > 0 && S.time > notifyUntil) {
        notifyUntil = -1;
        H.notify.classList.add('hidden');
      }
      if (dmgUntil > 0) {
        if (S.time > dmgUntil) { dmgUntil = -1; H.dmg.classList.add('hidden'); }
      }
    },
  };
  return api;
}
