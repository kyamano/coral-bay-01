// Coral Bay — the HUD and the screens around the game: health, cash, wanted
// stars, the clock, the objective, toasts, dialogue, the arrest meter, and
// the minimap. Plus the title, pause, busted and wasted screens.

import { PALETTE, VIEW, WORLD } from './config.js';
import { clamp } from './random.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
}

export function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function drawHud(ctx, state) {
  drawStatusPanel(ctx, state);
  drawObjectiveBar(ctx, state);
  drawMinimap(ctx, state);
  if (state.missions.phase !== 'dialogue') {
    if (state.player.inCar && state.player.car) drawSpeedometer(ctx, state);
    else drawWeaponPanel(ctx, state);
  }
  if (state.arrestProgress > 0.02) drawArrestMeter(ctx, state);
  if (state.toast) drawToast(ctx, state);
  if (state.missions.phase === 'dialogue') drawDialogue(ctx, state);
  if (state.promptText && state.missions.phase !== 'dialogue') drawPrompt(ctx, state);
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(255,40,30,${(state.damageFlash * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

function drawStatusPanel(ctx, state) {
  panel(ctx, 16, 14, 252, 86);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('CORAL BAY', 30, 40);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244,241,232,0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(state.clockHour), 254, 40);
  ctx.textAlign = 'left';
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, 30, 50, 150, 11, 5);
  ctx.fill();
  const healthFrac = clamp(state.player.health / 100, 0, 1);
  ctx.fillStyle = healthFrac > 0.3 ? PALETTE.good : PALETTE.danger;
  if (healthFrac > 0) {
    roundRect(ctx, 30, 50, 150 * healthFrac, 11, 5);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(String(Math.ceil(state.player.health)), 188, 60);
  // Cash and stars.
  ctx.fillStyle = PALETTE.good;
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(`$${state.player.money}`, 30, 88);
  drawStars(ctx, 118, 74, state.wanted.stars, state.wanted.seen);
}

function drawStars(ctx, x, y, stars, seen) {
  ctx.font = '19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    if (i < stars) {
      ctx.fillStyle = seen && Math.sin(performance.now() / 140) > 0.4 ? '#ffffff' : PALETTE.accent;
      ctx.fillText('★', x + i * 23, y + 15);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillText('★', x + i * 23, y + 15);
    }
  }
}

function drawObjectiveBar(ctx, state) {
  if (!state.objectiveText) return;
  ctx.font = 'bold 15px system-ui, sans-serif';
  const text = `▶ ${state.objectiveText}`;
  const w = Math.min(620, ctx.measureText(text).width + 44);
  const x = VIEW.width / 2 - w / 2;
  panel(ctx, x, 14, w, 40);
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'center';
  ctx.fillText(text, VIEW.width / 2, 40);
  if (state.missions.stepTimer !== null && state.missions.phase === 'active') {
    ctx.fillStyle = state.missions.stepTimer < 15 ? PALETTE.danger : PALETTE.accent;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(state.missions.stepTimer)}s`, VIEW.width / 2, 76);
  }
  if (state.missions.sprint) {
    ctx.fillStyle = state.missions.sprint.timeLeft < 12 ? PALETTE.danger : PALETTE.accent;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(`SPRINT ${Math.ceil(state.missions.sprint.timeLeft)}s — ring ${state.missions.sprint.next + 1}/4`, VIEW.width / 2, 76);
  }
}

const MAP = { x: 986, y: 14, w: 278, h: 158 };

function drawMinimap(ctx, state) {
  panel(ctx, MAP.x - 6, MAP.y - 6, MAP.w + 12, MAP.h + 26);
  const sx = MAP.w / WORLD.width;
  const sy = MAP.h / WORLD.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();
  ctx.fillStyle = '#8f9a7d';
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.fillStyle = '#2f6d80';
  ctx.fillRect(MAP.x + 1900 * sx, MAP.y, (WORLD.width - 1900) * sx, MAP.h);
  ctx.fillStyle = '#e6cf92';
  ctx.fillRect(MAP.x + 1600 * sx, MAP.y, 300 * sx, MAP.h);
  ctx.fillStyle = PALETTE.asphaltDark;
  for (let col = 0; col < 6; col += 1) {
    const cx = 140 + col * 264;
    ctx.fillRect(MAP.x + (cx - 48) * sx, MAP.y, 96 * sx, MAP.h);
  }
  for (let row = 0; row < 5; row += 1) {
    const cy = 140 + row * 248;
    ctx.fillRect(MAP.x, MAP.y + (cy - 48) * sy, 1600 * sx, 96 * sy);
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(MAP.x + x * sx, MAP.y + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const car of state.cars) {
    if (car.kind === 'traffic') dot(car.x, car.y, 'rgba(255,255,255,0.65)', 1.8);
  }
  for (const pickup of state.pickups) dot(pickup.x, pickup.y, '#7be382', 2.6);
  const flash = Math.sin(state.time * 9) > 0;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead) dot(car.x, car.y, flash ? '#ff4040' : '#4060ff', 3);
  }
  for (const officer of state.officers) {
    if (officer.state !== 'down') dot(officer.x, officer.y, flash ? '#4060ff' : '#ff4040', 2.4);
  }
  const target = state.missionTargetPos;
  if (target) {
    ctx.strokeStyle = PALETTE.info;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(MAP.x + target.x * sx, MAP.y + target.y * sy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The player arrow.
  const p = state.playerPos();
  const angle = state.player.inCar && state.player.car ? state.player.car.angle : state.player.angle;
  ctx.translate(MAP.x + p.x * sx, MAP.y + p.y * sy);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.6);
  ctx.lineTo(-5, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(244,241,232,0.8)';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('● traffic   ● police   $ cash   ◎ objective', MAP.x - 2, MAP.y + MAP.h + 17);
}

function drawSpeedometer(ctx, state) {
  const car = state.player.car;
  panel(ctx, VIEW.width - 216, VIEW.height - 92, 200, 76);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(car.model, VIEW.width - 200, VIEW.height - 62);
  ctx.fillStyle = PALETTE.accent;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`${Math.round(Math.abs(car.speed) * 0.36)} mph`, VIEW.width - 200, VIEW.height - 30);
  // Damage bar.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, VIEW.width - 92, VIEW.height - 66, 70, 8, 4);
  ctx.fill();
  ctx.fillStyle = car.health > 40 ? PALETTE.good : PALETTE.danger;
  if (car.health > 0) {
    roundRect(ctx, VIEW.width - 92, VIEW.height - 66, 70 * clamp(car.health / 100, 0, 1), 8, 4);
    ctx.fill();
  }
}

function drawWeaponPanel(ctx, state) {
  panel(ctx, VIEW.width - 216, VIEW.height - 92, 200, 76);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(state.weapon.name, VIEW.width - 200, VIEW.height - 58);
  ctx.fillStyle = PALETTE.accent;
  ctx.font = 'bold 22px system-ui, sans-serif';
  const ammo = state.weapon.reloading > 0 ? 'RELOADING…' : `${state.weapon.ammo} / 12`;
  ctx.fillText(ammo, VIEW.width - 200, VIEW.height - 28);
}

function drawArrestMeter(ctx, state) {
  const w = 300;
  const x = VIEW.width / 2 - w / 2;
  panel(ctx, x, VIEW.height - 130, w, 52);
  ctx.fillStyle = PALETTE.danger;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ARRESTING…', VIEW.width / 2, VIEW.height - 104);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, x + 20, VIEW.height - 96, w - 40, 9, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.danger;
  roundRect(ctx, x + 20, VIEW.height - 96, (w - 40) * clamp(state.arrestProgress, 0, 1), 9, 4);
  ctx.fill();
}

function drawToast(ctx, state) {
  const toast = state.toast;
  const alpha = clamp(toast.life, 0, 1);
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const w = Math.max(ctx.measureText(toast.title).width, ctx.measureText(toast.body).width) + 48;
  const x = VIEW.width / 2 - w / 2;
  panel(ctx, x, 96, w, 58);
  ctx.fillStyle = toast.color;
  ctx.textAlign = 'center';
  ctx.fillText(toast.title, VIEW.width / 2, 120);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '13.5px system-ui, sans-serif';
  ctx.fillText(toast.body, VIEW.width / 2, 142);
  ctx.globalAlpha = 1;
}

function drawDialogue(ctx, state) {
  const line = state.missions.dialogue[state.missions.dialogueIndex];
  if (!line) return;
  panel(ctx, 190, VIEW.height - 148, VIEW.width - 380, 96);
  ctx.fillStyle = PALETTE.info;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MARA VOSS — Coral Diner', 214, VIEW.height - 118);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '16.5px system-ui, sans-serif';
  wrapText(ctx, line.replace(/^Mara: /, ''), 214, VIEW.height - 92, VIEW.width - 428, 21);
  ctx.fillStyle = 'rgba(244,241,232,0.65)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('E — continue', VIEW.width - 214, VIEW.height - 62);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function drawPrompt(ctx, state) {
  ctx.font = 'bold 14.5px system-ui, sans-serif';
  const w = ctx.measureText(state.promptText).width + 36;
  const x = VIEW.width / 2 - w / 2;
  panel(ctx, x, VIEW.height - 56, w, 38);
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'center';
  ctx.fillText(state.promptText, VIEW.width / 2, VIEW.height - 31);
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function drawButton(ctx, rect, label, enabled) {
  ctx.fillStyle = enabled ? 'rgba(255,176,58,0.92)' : 'rgba(90,96,106,0.7)';
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.fillStyle = enabled ? '#1c1408' : 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 7);
}

export function drawTitleScreen(ctx, state, buttons) {
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb03a';
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.fillText('CORAL BAY', VIEW.width / 2, 168);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillText('An open-world crime story on a sun-soaked bay', VIEW.width / 2, 208);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244,241,232,0.88)';
  wrapTextCentered(ctx, 'Mara Voss runs the Coral Diner — and half the debts on this bay. Steal the cars, run the ledger, dodge the CBPD, and make the Tide Ledger yours.', VIEW.width / 2, 258, 640, 23);
  ctx.fillStyle = 'rgba(244,241,232,0.75)';
  ctx.font = '14.5px system-ui, sans-serif';
  wrapTextCentered(ctx, 'WASD move · Shift run · E/F enter car · Mouse aim, click shoot · R reload · H horn · B Beach Sprint · M mute · P pause', VIEW.width / 2, 348, 700, 21);
  drawButton(ctx, buttons.newGame, 'NEW GAME', true);
  drawButton(ctx, buttons.continueGame, 'CONTINUE', Boolean(state.hasSave));
  if (!state.hasSave) {
    ctx.fillStyle = 'rgba(244,241,232,0.5)';
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.fillText('no save yet', VIEW.width / 2, 566);
  }
}

function wrapTextCentered(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, cx, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, cx, cy);
}

export function drawPauseScreen(ctx, state, buttons) {
  ctx.fillStyle = 'rgba(8,10,18,0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW.width / 2, 268);
  drawButton(ctx, buttons.resume, 'RESUME', true);
  drawButton(ctx, buttons.saveQuit, 'SAVE & TITLE', true);
}

export function drawEndScreen(ctx, state, buttons) {
  ctx.fillStyle = state.screen === 'busted' ? 'rgba(20,26,60,0.62)' : 'rgba(60,10,10,0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.screen === 'busted' ? '#7fa8ff' : '#ff5147';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(state.screen === 'busted' ? 'BUSTED' : 'WASTED', VIEW.width / 2, 268);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(
    state.screen === 'busted'
      ? 'The CBPD got you. Bail and fines cost you 20% of your cash.'
      : 'You went down in the bay. The clinic patched you up for 15% of your cash.',
    VIEW.width / 2,
    312,
  );
  drawButton(ctx, buttons.respawn, 'RESPAWN AT SAFEHOUSE', true);
}
