// hud.js — the on-screen layer: health, district, money, wanted stars,
// objective + timer, hints, ammo, dialogue queue, banners and toasts.
// Pure DOM, updated once per frame with change-caching so it stays cheap.

import { districtAt } from './city.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(G) {
  const els = {
    health: el('health-fill'),
    district: el('district'),
    money: el('money'),
    stars: el('stars'),
    objWrap: el('objective-wrap'),
    objText: el('objective-text'),
    objDist: el('objective-dist'),
    objTimer: el('objective-timer'),
    hint: el('hint'),
    ammo: el('ammo'),
    dialogue: el('dialogue'),
    dlgName: el('dlg-name'),
    dlgText: el('dlg-text'),
    banner: el('banner'),
    toast: el('toast'),
    bustedWrap: el('busted-wrap'),
    bustedFill: el('busted-fill'),
    crosshair: el('crosshair'),
    dmg: el('damage-flash'),
  };
  const cache = {};
  function set(key, node, value, prop) {
    if (cache[key] === value) return;
    cache[key] = value;
    if (prop === 'html') node.innerHTML = value;
    else if (prop === 'width') node.style.width = value;
    else if (prop === 'display') node.style.display = value;
    else node.textContent = value;
  }

  const dialogueQueue = [];
  let dialogueUntil = 0;
  let bannerUntil = 0;
  let toastUntil = 0;
  let dmgUntil = 0;

  const api = {
    showDialogue(name, text, dur = 3.5) {
      dialogueQueue.push({ name, text, dur });
    },
    banner(text) {
      els.banner.textContent = text;
      els.banner.style.opacity = '1';
      bannerUntil = G.state.time + 2.8;
    },
    toast(text) {
      els.toast.textContent = text;
      els.toast.style.opacity = '1';
      toastUntil = G.state.time + 2.6;
    },
    flashDamage() {
      dmgUntil = G.state.time + 0.22;
    },
    update() {
      const t = G.state.time;
      const p = G.player;
      const playing = G.state.screen === 'playing' || G.state.screen === 'paused';
      els.dmg.style.opacity = t < dmgUntil ? '1' : '0';

      set('hp', els.health, Math.max(0, p.health).toFixed(1) + '%', 'width');
      els.health.style.background = p.health > 30 ? '#59d977' : '#e5484d';
      set('district', els.district, districtAt(p.x, p.z));
      set('money', els.money, '$' + Math.floor(G.state.money));
      const stars = G.police ? G.police.stars : 0;
      set('stars', els.stars, '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars), 'html');
      els.stars.style.color = stars > 0 ? '#f2c14e' : 'rgba(255,255,255,0.25)';

      // objective line
      const obj = G.missions ? G.missions.objective : null;
      if (obj && playing) {
        els.objWrap.style.display = 'block';
        set('objText', els.objText, obj.text);
        if (obj.x !== null && obj.x !== undefined) {
          const d = Math.round(Math.hypot(obj.x - p.x, obj.z - p.z));
          set('objDist', els.objDist, ' — ' + d + 'm');
        } else set('objDist', els.objDist, '');
        if (obj.timer !== null && obj.timer !== undefined) {
          set('objTimer', els.objTimer, '⏱ ' + Math.max(0, Math.ceil(obj.timer)) + 's');
        } else set('objTimer', els.objTimer, '');
      } else {
        els.objWrap.style.display = 'none';
      }

      // busted meter
      const bm = G.police ? G.police.bustedMeter : 0;
      els.bustedWrap.style.display = bm > 0.02 && playing ? 'block' : 'none';
      if (bm > 0.02) els.bustedFill.style.width = (bm * 100).toFixed(0) + '%';

      // ammo + crosshair
      const w = G.combat ? G.combat.weapon : null;
      if (w && w.drawn && !p.car) {
        set('ammo', els.ammo, (w.reloadTime > 0 ? 'RELOADING…' : `PISTOL ${w.ammo} / ${w.reserve}`));
        els.ammo.style.display = 'block';
        els.crosshair.style.display = 'block';
      } else {
        els.ammo.style.display = 'none';
        els.crosshair.style.display = 'none';
      }

      // contextual hint
      let hint = '';
      if (playing && G.state.screen === 'playing') {
        if (p.car) hint = 'W A S D drive · Space brake · E exit';
        else if (w && w.drawn) hint = 'Click to shoot · R reload · Q holster';
        else if (p.nearestCar(3.4)) hint = 'E enter car · W A S D move · Shift run · F melee · Q draw pistol';
        else hint = 'W A S D move · Shift run · F melee · Q draw pistol · E enter car';
      }
      set('hint', els.hint, hint);
      els.hint.style.display = hint ? 'block' : 'none';

      // dialogue queue
      if (dialogueQueue.length && t >= dialogueUntil - 0.001 && !api._dlgActive) {
        const d = dialogueQueue.shift();
        api._dlgActive = d;
        dialogueUntil = t + d.dur;
        els.dlgName.textContent = d.name;
        els.dlgText.textContent = d.text;
        els.dialogue.style.display = 'block';
      }
      if (api._dlgActive && t >= dialogueUntil) {
        api._dlgActive = null;
        if (!dialogueQueue.length) els.dialogue.style.display = 'none';
      }
      if (t >= bannerUntil) els.banner.style.opacity = '0';
      if (t >= toastUntil) els.toast.style.opacity = '0';
    },
  };
  return api;
}
