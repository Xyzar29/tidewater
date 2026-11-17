// hud.js — everything the player reads: health, money, wanted stars, the
// objective card with its distance and countdown, dialogue lines, hints,
// notifications, ammo, the BUSTED meter and the damage flash. The DOM lives
// in index.html; this class just drives it.

export class HUD {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.root = el('hud');
    this.healthFill = el('hud-health-fill');
    this.district = el('hud-district');
    this.money = el('hud-money');
    this.stars = el('hud-stars');
    this.objCard = el('hud-objective');
    this.objText = el('obj-text');
    this.objDist = el('obj-dist');
    this.objTimer = el('obj-timer');
    this.dlg = el('hud-dialogue');
    this.dlgSpeaker = el('dlg-speaker');
    this.dlgText = el('dlg-text');
    this.ammo = el('hud-ammo');
    this.hint = el('hud-hint');
    this.notifyBox = el('hud-notify');
    this.bustedWrap = el('busted-wrap');
    this.bustedFill = el('busted-fill');
    this.damageFlash = el('damage-flash');
    this.crosshair = el('crosshair');
    this.dlgT = 0;
    this.notifyT = 0;
    this.flashT = 0;
    this.lastStars = -1;
  }

  setHealth(hp, max) {
    const f = Math.max(0, Math.min(1, hp / max));
    this.healthFill.style.width = `${Math.round(f * 100)}%`;
    this.healthFill.style.background = f < 0.3 ? '#ff5147' : f < 0.6 ? '#ffb84d' : '#59d977';
  }

  setMoney(n) {
    this.money.textContent = `$${Math.floor(n)}`;
  }

  setDistrict(name) {
    if (this.district.textContent !== name) this.district.textContent = name;
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.stars.textContent = s;
    this.stars.style.opacity = n > 0 ? '1' : '0.35';
  }

  setObjective(text, distM, timerSec) {
    if (!text) {
      this.objCard.style.display = 'none';
      return;
    }
    this.objCard.style.display = 'block';
    this.objText.textContent = text;
    this.objDist.textContent = distM != null ? ` — ${Math.round(distM)}m` : '';
    if (timerSec != null && timerSec >= 0) {
      this.objTimer.style.display = 'block';
      this.objTimer.textContent = `⏱ ${Math.ceil(timerSec)}s`;
      this.objTimer.style.color = timerSec < 15 ? '#ff5147' : '#ffd94d';
    } else {
      this.objTimer.style.display = 'none';
    }
  }

  dialogue(speaker, text, dur = 4) {
    this.dlgSpeaker.textContent = speaker;
    this.dlgText.textContent = text;
    this.dlg.style.display = 'block';
    this.dlgT = dur;
  }

  notify(text, dur = 3.2) {
    this.notifyBox.textContent = text;
    this.notifyBox.style.display = 'block';
    this.notifyT = dur;
  }

  setAmmo(mag, reserve, drawn) {
    if (!drawn) {
      this.ammo.style.display = 'none';
      this.crosshair.style.display = 'none';
      return;
    }
    this.ammo.style.display = 'block';
    this.crosshair.style.display = 'block';
    this.ammo.textContent = `PISTOL ${mag} / ${reserve}`;
  }

  setHint(text) {
    if (!text) {
      this.hint.style.display = 'none';
      return;
    }
    this.hint.style.display = 'block';
    this.hint.textContent = text;
  }

  setBusted(frac) {
    if (frac == null || frac <= 0) {
      this.bustedWrap.style.display = 'none';
      return;
    }
    this.bustedWrap.style.display = 'block';
    this.bustedFill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  }

  flashDamage() {
    this.flashT = 0.35;
    this.damageFlash.style.opacity = '0.55';
  }

  update(dt) {
    if (this.dlgT > 0) {
      this.dlgT -= dt;
      if (this.dlgT <= 0) this.dlg.style.display = 'none';
    }
    if (this.notifyT > 0) {
      this.notifyT -= dt;
      if (this.notifyT <= 0) this.notifyBox.style.display = 'none';
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.damageFlash.style.opacity = '0';
    }
  }
}

// Show exactly one full-screen card (or none, for gameplay).
export function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.style.display = 'none';
  if (name) {
    const el = document.getElementById(`screen-${name}`);
    if (el) el.style.display = 'flex';
  }
  // The HUD belongs to gameplay, not the title screen.
  document.getElementById('hud').style.display = name === 'title' ? 'none' : 'block';
}
