// TIDEWATER — HUD: health, money, stars, objective, dialogue, notifications.

export class HUD {
  constructor() {
    this.el = {};
    ['healthFill', 'money', 'stars', 'objective', 'notify', 'dialogue', 'dialogueName', 'dialogueText', 'timer', 'bustedFill', 'ammo', 'prompt'].forEach(id => { this.el[id] = document.getElementById(id); });
    this.notifyT = null;
  }
  update(state) {
    if (this.el.healthFill) this.el.healthFill.style.width = Math.max(0, state.health) + '%';
    if (this.el.healthFill) this.el.healthFill.style.background = state.health > 30 ? '#59d977' : '#e5484d';
    if (this.el.money) this.el.money.textContent = '$' + Math.floor(state.money).toLocaleString('en-US');
    if (this.el.stars) {
      this.el.stars.textContent = '★'.repeat(state.stars) + '☆'.repeat(5 - state.stars);
      this.el.stars.style.opacity = state.stars > 0 ? '1' : '0.25';
    }
    if (this.el.objective) this.el.objective.textContent = state.objective || '';
    if (this.el.timer) this.el.timer.textContent = state.timerText || '';
    if (this.el.bustedFill) this.el.bustedFill.style.width = Math.round((state.busted || 0) * 100) + '%';
    if (this.el.ammo) this.el.ammo.textContent = state.gunOut ? 'PISTOL  ' + state.ammo : '';
    if (this.el.prompt) this.el.prompt.textContent = state.prompt || '';
  }
  notify(text, ms) {
    if (!this.el.notify) return;
    this.el.notify.textContent = text; this.el.notify.style.opacity = '1';
    clearTimeout(this.notifyT);
    this.notifyT = setTimeout(() => { this.el.notify.style.opacity = '0'; }, ms || 3200);
  }
  showDialogue(name, text) {
    if (!this.el.dialogue) return;
    this.el.dialogue.style.display = 'block';
    this.el.dialogueName.textContent = name; this.el.dialogueText.textContent = text;
  }
  hideDialogue() { if (this.el.dialogue) this.el.dialogue.style.display = 'none'; }
}
