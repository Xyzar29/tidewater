// DOM HUD: health bar, cash, wanted stars, the objective panel with its
// countdown, centre banners for mission titles, toast notifications, the
// dialogue box, the BUSTED meter and the crosshair. Missions and systems
// talk to this module; it owns all of the DOM ids from index.html.

export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const dom = {
    health: el('health-fill'), money: el('money'), stars: el('stars'),
    objective: el('objective'), objText: el('obj-text'), objTimer: el('obj-timer'),
    banner: el('banner'), hint: el('hint'), ammo: el('ammo'),
    dialogue: el('dialogue'), dlgName: el('dlg-name'), dlgText: el('dlg-text'),
    notify: el('notify'), bustedWrap: el('busted-wrap'), bustedFill: el('busted-fill'),
    crosshair: el('crosshair'), district: el('district'),
  };
  let notifyT = 0, bannerT = 0, dialogueT = 0, hintT = 0;
  let lastMoney = null, lastStars = -1, lastHealth = -1, lastAmmo = '';

  const hud = {
    dom,
    objectiveText: '',
    objectiveTime: null, // seconds remaining, or null for no countdown

    setObjective(text, timeLeft) {
      this.objectiveText = text;
      this.objectiveTime = timeLeft;
    },
    notify(text) {
      dom.notify.textContent = text;
      dom.notify.style.opacity = '1';
      notifyT = 3.2;
    },
    banner(text, seconds = 2.6) {
      dom.banner.textContent = text;
      dom.banner.style.opacity = '1';
      bannerT = seconds;
    },
    dialogue(name, text, seconds = 4.5) {
      dom.dlgName.textContent = name;
      dom.dlgText.textContent = text;
      dom.dialogue.style.opacity = '1';
      dialogueT = seconds;
    },
    hint(text, seconds = 0) {
      dom.hint.textContent = text;
      dom.hint.style.opacity = text ? '1' : '0';
      hintT = seconds;
    },
    setDistrict(name) {
      if (dom.district.textContent !== name) dom.district.textContent = name;
    },

    update(dt) {
      const p = G.player;
      // Health / money / stars only touch the DOM when they change.
      const hp = Math.max(0, Math.round(p.health));
      if (hp !== lastHealth) {
        lastHealth = hp;
        dom.health.style.width = hp + '%';
        dom.health.style.background = hp > 35 ? '#57d95e' : '#e0483e';
      }
      if (G.money !== lastMoney) {
        lastMoney = G.money;
        dom.money.textContent = '$' + G.money.toLocaleString('en-US');
      }
      const stars = G.police ? G.police.stars : 0;
      if (stars !== lastStars) {
        lastStars = stars;
        dom.stars.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
        dom.stars.style.opacity = stars > 0 ? '1' : '0.25';
      }
      // Objective panel.
      if (this.objectiveText) {
        dom.objective.style.opacity = '1';
        if (dom.objText.textContent !== this.objectiveText) dom.objText.textContent = this.objectiveText;
        if (this.objectiveTime !== null && this.objectiveTime !== undefined) {
          const s = Math.max(0, Math.ceil(this.objectiveTime));
          dom.objTimer.textContent = '⏱ ' + s + 's';
          dom.objTimer.style.color = s <= 10 ? '#ff7a6b' : '#ffd75e';
        } else dom.objTimer.textContent = '';
      } else dom.objective.style.opacity = '0';
      // Ammo readout while the pistol is out.
      const c = G.combat;
      if (c && c.drawn && !p.driving) {
        const label = c.reloadT > 0 ? 'RELOADING' : `PISTOL ${c.ammo} / ${c.reserve}`;
        if (label !== lastAmmo) { lastAmmo = label; dom.ammo.textContent = label; }
        dom.ammo.style.opacity = '1';
        dom.crosshair.style.opacity = '1';
      } else {
        dom.ammo.style.opacity = '0';
        dom.crosshair.style.opacity = '0';
        lastAmmo = '';
      }
      // BUSTED meter.
      const bm = G.police ? G.police.bustedMeter : 0;
      dom.bustedWrap.style.opacity = bm > 0.02 ? '1' : '0';
      if (bm > 0.02) dom.bustedFill.style.width = Math.round(bm * 100) + '%';
      // Timed elements fade themselves out.
      if (notifyT > 0) { notifyT -= dt; if (notifyT <= 0) dom.notify.style.opacity = '0'; }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) dom.banner.style.opacity = '0'; }
      if (dialogueT > 0) { dialogueT -= dt; if (dialogueT <= 0) dom.dialogue.style.opacity = '0'; }
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) dom.hint.style.opacity = '0'; }
    },
  };
  G.hud = hud;
  return hud;
}
