// hud.js — everything drawn over the 3D view.
//
// Reads game state, writes DOM — but only when something actually changed,
// so the HUD costs nothing on a quiet frame. Owns the notification stack
// (top-centre toasts), the dialogue box (a small queue of lines, each held
// for a few seconds), the BUSTED meter, the damage vignette and the
// contextual control hint at the bottom of the screen.

import { districtAt } from './city.js';

export function initHUD(G) {
  const el = (id) => document.getElementById(id);
  G.hud = {
    health: el('health-fill'), district: el('district'), money: el('money'),
    stars: el('stars'), objective: el('objective'), timer: el('objective-timer'),
    notifyBox: el('notify'), dialogue: el('dialogue'),
    dlgSpeaker: el('dialogue-speaker'), dlgText: el('dialogue-text'),
    hint: el('hint'), ammo: el('ammo'), busted: el('busted'),
    bustedFill: el('busted-fill'), dmg: el('dmg'), crosshair: el('crosshair'),
    lastMoney: -1, lastStars: -1, lastHealth: -1, lastDistrict: '',
    lastObjective: '', lastHint: '', lastAmmo: '',
    notes: [], dlgQueue: [], dlgUntil: 0,
  };

  G.notify = (text) => {
    const h = G.hud;
    const div = document.createElement('div');
    div.className = 'note';
    div.textContent = text;
    h.notifyBox.appendChild(div);
    h.notes.push({ div, until: G.time + 3.8 });
    while (h.notes.length > 4) {
      const old = h.notes.shift();
      old.div.remove();
    }
  };

  // Queue a conversation: lines of [speaker, text], each held ~3.6 s.
  G.showDialogue = (lines) => {
    for (const [speaker, text] of lines) G.hud.dlgQueue.push({ speaker, text });
  };
}

export function updateHUD(G) {
  const h = G.hud;
  if (!h.health) return;
  const p = G.player;

  const hp = Math.max(0, Math.round(p.hp));
  if (hp !== h.lastHealth) {
    h.lastHealth = hp;
    h.health.style.width = hp + '%';
    h.health.style.background = hp > 50 ? '#58d977' : hp > 25 ? '#ffb84d' : '#ff5a5a';
  }

  if (G.money !== h.lastMoney) {
    h.lastMoney = G.money;
    h.money.textContent = '$' + G.money.toLocaleString('en-US');
  }

  const stars = G.wanted.stars;
  if (stars !== h.lastStars) {
    h.lastStars = stars;
    h.stars.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
    h.stars.style.opacity = stars > 0 ? '1' : '0.28';
  }

  const d = districtAt(G.playerPos.x, G.playerPos.z);
  if (d !== h.lastDistrict) {
    h.lastDistrict = d;
    h.district.textContent = d;
  }

  if (G.objectiveText !== h.lastObjective) {
    h.lastObjective = G.objectiveText;
    h.objective.textContent = G.objectiveText;
  }
  if (G.objectiveTimer !== null && G.objectiveTimer !== undefined) {
    const s = Math.max(0, Math.ceil(G.objectiveTimer));
    h.timer.textContent = '⏱ ' + s + 's';
    h.timer.style.color = s < 15 ? '#ff7b7b' : '#ffd166';
    h.timer.style.display = '';
  } else h.timer.style.display = 'none';

  // Notifications expire.
  for (let i = h.notes.length - 1; i >= 0; i--) {
    if (G.time > h.notes[i].until) {
      h.notes[i].div.remove();
      h.notes.splice(i, 1);
    }
  }

  // Dialogue queue.
  if (G.time > h.dlgUntil && h.dlgQueue.length > 0) {
    const line = h.dlgQueue.shift();
    h.dlgSpeaker.textContent = line.speaker;
    h.dlgText.textContent = line.text;
    h.dialogue.style.display = '';
    h.dlgUntil = G.time + 3.6;
  } else if (G.time > h.dlgUntil && h.dlgQueue.length === 0) {
    h.dialogue.style.display = 'none';
  }

  // Ammo, only while the pistol is out.
  let ammoText = '';
  if (G.combat.drawn && !p.inCar) {
    ammoText = G.combat.reloadingUntil ? 'PISTOL — RELOADING…'
      : `PISTOL ${G.combat.mag} / ${G.combat.reserve}`;
  }
  if (ammoText !== h.lastAmmo) {
    h.lastAmmo = ammoText;
    h.ammo.textContent = ammoText;
    h.ammo.style.display = ammoText ? '' : 'none';
  }
  h.crosshair.style.display = (G.state === 'playing' && !p.inCar) ? '' : 'none';

  // BUSTED meter.
  const b = G.wanted.busted;
  h.busted.style.display = b > 0.02 ? '' : 'none';
  if (b > 0.02) h.bustedFill.style.width = Math.round(b * 100) + '%';

  // Damage vignette follows the flash timer set by combat.
  h.dmg.style.opacity = p.flash > 0 ? String(Math.min(0.55, p.flash)) : '0';

  // Contextual hint.
  let hint = '';
  if (G.state === 'playing') {
    if (p.inCar) hint = 'W A S D drive · Space brake · E exit';
    else if (G.nearCar) hint = 'E — get in the ' + G.nearCar.type;
    else if (G.combat.drawn) hint = 'Click to shoot · R reload · Q holster';
    else hint = 'W A S D move · Shift run · F melee · Q draw pistol · E enter car';
  }
  if (hint !== h.lastHint) {
    h.lastHint = hint;
    h.hint.textContent = hint;
    h.hint.style.display = hint ? '' : 'none';
  }
}
