// Coral Bay — world rendering: the camera, the city, the sea, every car and
// citizen, and the light of the hour. The palette shifts from dawn gold to
// noon glare to sunset coral to night blue, streetlights glow after dark,
// and headlights throw cones in front of every moving car.

import { BEACH, CITY, PALETTE, VIEW, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { headlightsOn } from './vehicles.js';

/** Interpolate the sky-light tint and darkness for a game-clock hour. */
export function lightingForHour(hour) {
  // keyframes: [hour, darkness 0..1, warm tint strength]
  const keys = [
    [0, 0.62, 0],
    [5.5, 0.62, 0],
    [7, 0.1, 0.35],
    [10, 0, 0.05],
    [16, 0.02, 0.1],
    [18.5, 0.22, 0.55],
    [20, 0.45, 0.2],
    [21.5, 0.62, 0],
    [24, 0.62, 0],
  ];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [h0, d0, w0] = keys[i];
    const [h1, d1, w1] = keys[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = (hour - h0) / Math.max(0.001, h1 - h0);
      return { darkness: lerp(d0, d1, t), warmth: lerp(w0, w1, t) };
    }
  }
  return { darkness: 0, warmth: 0 };
}

export function updateCamera(state, dt) {
  const p = state.playerPos();
  const lookAhead = state.player.inCar && state.player.car ? 0.22 : 0.08;
  const tx = p.x + (state.player.car ? Math.cos(state.player.car.angle) * state.player.car.speed * lookAhead : 0);
  const ty = p.y + (state.player.car ? Math.sin(state.player.car.angle) * state.player.car.speed * lookAhead : 0);
  const k = clamp(dt * 4.5, 0, 1);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
  state.camera.x = clamp(state.camera.x, VIEW.width / 2 - 240, WORLD.width - VIEW.width / 2 + 240);
  state.camera.y = clamp(state.camera.y, VIEW.height / 2 - 160, WORLD.height - VIEW.height / 2 + 160);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, state) {
  const camX = state.camera.x - VIEW.width / 2;
  const camY = state.camera.y - VIEW.height / 2;
  // Fill the whole frame first, so the camera can centre on the player even
  // near the world edge without showing empty canvas.
  ctx.fillStyle = '#b7ad97';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  ctx.translate(-camX, -camY);

  drawGround(ctx, state);
  drawRoads(ctx, state);
  drawBlocks(ctx, state);
  drawBeach(ctx, state);
  for (const mark of state.skidMarks) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  drawObjectiveRing(ctx, state);
  drawSprintRings(ctx, state);
  for (const car of state.cars) if (car.kind !== 'player') drawCar(ctx, state, car);
  if (state.player.inCar && state.player.car) drawCar(ctx, state, state.player.car);
  for (const ped of state.peds) drawPedestrian(ctx, ped);
  for (const officer of state.officers) drawOfficer(ctx, officer);
  if (!state.player.inCar) drawPlayer(ctx, state);
  drawPickupsAndFloaters(ctx, state);
  drawBullets(ctx, state);
  drawParticles(ctx, state);
  drawMaraMarker(ctx, state);
  ctx.restore();

  // The light of the hour, laid over the whole frame.
  const light = lightingForHour(state.clockHour);
  if (light.darkness > 0.01) {
    ctx.fillStyle = `rgba(10,16,48,${(light.darkness * 0.52).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (light.warmth > 0.01) {
    ctx.fillStyle = `rgba(255,138,60,${(light.warmth * 0.13).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (light.darkness > 0.25) drawNightGlows(ctx, state, camX, camY);
}

function drawGround(ctx, state) {
  ctx.fillStyle = PALETTE.blockBase;
  ctx.fillRect(0, 0, CITY.edgeX, WORLD.height);
  // Sea, with a lighter surf band against the sand.
  ctx.fillStyle = PALETTE.seaDeep;
  ctx.fillRect(BEACH.sandTo, 0, WORLD.width - BEACH.sandTo, WORLD.height);
  ctx.fillStyle = PALETTE.sea;
  const wave = Math.sin(state.time * 1.4) * 6;
  ctx.fillRect(BEACH.sandTo + 16 + wave, 0, WORLD.width - BEACH.sandTo, WORLD.height);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(BEACH.sandFrom, 0, BEACH.sandTo - BEACH.sandFrom, WORLD.height);
  ctx.fillStyle = PALETTE.promenade;
  ctx.fillRect(BEACH.promenadeX - 34, 0, 68, WORLD.height);
}

function drawRoads(ctx, state) {
  ctx.fillStyle = PALETTE.asphalt;
  for (let col = 0; col < CITY.cols; col += 1) {
    const cx = CITY.firstRoadX + col * CITY.pitchX;
    ctx.fillRect(cx - CITY.roadWidth / 2, 0, CITY.roadWidth, WORLD.height);
  }
  for (let row = 0; row < CITY.rows; row += 1) {
    const cy = CITY.firstRoadY + row * CITY.pitchY;
    ctx.fillRect(0, cy - CITY.roadWidth / 2, CITY.edgeX, CITY.roadWidth);
  }
  // Dashed centre lines.
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (let col = 0; col < CITY.cols; col += 1) {
    const cx = CITY.firstRoadX + col * CITY.pitchX;
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, WORLD.height);
  }
  for (let row = 0; row < CITY.rows; row += 1) {
    const cy = CITY.firstRoadY + row * CITY.pitchY;
    ctx.moveTo(0, cy);
    ctx.lineTo(CITY.edgeX, cy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawBlocks(ctx, state) {
  for (const block of state.city.blocks) {
    if (block.kind === 'park') {
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = PALETTE.parkPath;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(block.x, block.y + block.h / 2);
      ctx.lineTo(block.x + block.w, block.y + block.h / 2);
      ctx.moveTo(block.x + block.w / 2, block.y);
      ctx.lineTo(block.x + block.w / 2, block.y + block.h);
      ctx.stroke();
    } else if (block.kind === 'lot') {
      ctx.fillStyle = '#a9a294';
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const x = block.x + 14 + i * 36;
        ctx.strokeRect(x, block.y + 16, 28, 52);
      }
    } else {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
    }
  }
  for (const b of state.city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, b.x + 5, b.y + 7, b.w, b.h, 5);
    ctx.fill();
    ctx.fillStyle = b.roof;
    roundRect(ctx, b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.fillStyle = b.color;
    roundRect(ctx, b.x + 5, b.y + 5, b.w - 10, b.h - 10, 4);
    ctx.fill();
    // Window grid on the towers.
    if (b.tower) {
      ctx.fillStyle = 'rgba(255,244,190,0.5)';
      const cols = Math.floor(b.w / 17);
      const rows = Math.floor(b.h / 17);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 3 + b.floors) % 3 !== 0) ctx.fillRect(b.x + 10 + i * 17, b.y + 10 + j * 17, 8, 8);
        }
      }
    }
    // The shop sign, readable from the street.
    ctx.fillStyle = 'rgba(10,12,16,0.82)';
    const label = b.sign;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 14;
    const sx = b.x + b.w / 2 - tw / 2;
    const sy = b.y + b.h - 22;
    roundRect(ctx, sx, sy, tw, 17, 4);
    ctx.fill();
    ctx.fillStyle = '#ffe9b8';
    ctx.textAlign = 'center';
    ctx.fillText(label, b.x + b.w / 2, sy + 13);
  }
  for (const tree of state.city.trees) drawTree(ctx, tree);
}

function drawTree(ctx, tree) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.arc(tree.x + 3, tree.y + 4, tree.r, 0, Math.PI * 2);
  ctx.fill();
  if (tree.palm) {
    ctx.strokeStyle = '#3f9142';
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(tree.x, tree.y);
      ctx.quadraticCurveTo(
        tree.x + Math.cos(a) * tree.r * 0.8,
        tree.y + Math.sin(a) * tree.r * 0.8 - 5,
        tree.x + Math.cos(a) * tree.r * 1.25,
        tree.y + Math.sin(a) * tree.r * 1.25 + 4,
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#8a6b45';
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#4e9b47';
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#63b558';
    ctx.beginPath();
    ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBeach(ctx, state) {
  // The pier: planks out over the water with a rail.
  ctx.fillStyle = PALETTE.pier;
  ctx.fillRect(BEACH.sandTo - 8, BEACH.pierY - 17, BEACH.pierTo - BEACH.sandTo + 16, 34);
  ctx.strokeStyle = 'rgba(60,40,20,0.6)';
  ctx.lineWidth = 2;
  for (let x = BEACH.sandTo; x < BEACH.pierTo; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, BEACH.pierY - 17);
    ctx.lineTo(x, BEACH.pierY + 17);
    ctx.stroke();
  }
  // Beach umbrellas.
  const spots = [[1780, 220], [1835, 430], [1768, 830], [1844, 1060]];
  for (const [x, y] of spots) {
    ctx.fillStyle = '#e2703a';
    ctx.beginPath();
    ctx.arc(x, y, 13, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#7a5230';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
  }
}

function drawObjectiveRing(ctx, state) {
  const target = state.missionTargetPos;
  if (!target || state.screen !== 'playing') return;
  const pulse = 20 + Math.sin(state.time * 4) * 4;
  ctx.strokeStyle = '#37c8d9';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(55,200,217,0.16)';
  ctx.beginPath();
  ctx.arc(target.x, target.y, pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawSprintRings(ctx, state) {
  const sprint = state.missions.sprint;
  if (!sprint) return;
  sprint.rings.forEach((ring, i) => {
    if (i < sprint.next) return;
    ctx.strokeStyle = i === sprint.next ? '#ffb03a' : 'rgba(255,176,58,0.4)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, 30, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function drawCar(ctx, state, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (headlightsOn(state, car) && (car.speed !== 0 || car.kind === 'police')) {
    const grad = ctx.createLinearGradient(20, 0, 150, 0);
    grad.addColorStop(0, 'rgba(255,240,180,0.34)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(20, -9);
    ctx.lineTo(150, -34);
    ctx.lineTo(150, 34);
    ctx.lineTo(20, 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -20, -8, 44, 22, 6);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#3c4043' : car.color;
  roundRect(ctx, -22, -11, 44, 22, 6);
  ctx.fill();
  ctx.fillStyle = car.kind === 'police' ? '#20242a' : 'rgba(20,30,44,0.85)';
  roundRect(ctx, -7, -8.5, 15, 17, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.75)';
  roundRect(ctx, 9, -8, 4.5, 16, 2);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = '#20242a';
    roundRect(ctx, -14, -10, 9, 20, 2);
    ctx.fill();
    const flash = Math.sin(state.time * 11) > 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    ctx.beginPath();
    ctx.arc(-2, -5, 3.4, 0, Math.PI * 2);
    ctx.arc(-2, 5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#4060ff' : '#ff4040';
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car === state.fixerCar) {
    ctx.fillStyle = '#ffb03a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIXER', 0, -20);
  }
  ctx.restore();
}

function drawPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(13, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.wobble) * 1.6;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(1.5, 2.5, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.hat) {
    ctx.fillStyle = ped.hat;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 5.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOfficer(ctx, officer) {
  ctx.save();
  ctx.translate(officer.x, officer.y);
  if (officer.state === 'down') {
    ctx.rotate(officer.angle);
    ctx.fillStyle = '#2b3a67';
    roundRect(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(1.5, 2.5, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b3a67';
  ctx.beginPath();
  ctx.arc(0, 0, 7.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(3.5, -3.5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(2, 3, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // The pistol points where the mouse is.
  ctx.fillStyle = '#22262b';
  roundRect(ctx, 6, -1.8, 13, 3.6, 1.5);
  ctx.fill();
  ctx.rotate(-p.angle);
  const bob = Math.sin(p.wobble) * 1.4;
  ctx.fillStyle = '#ffb03a';
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 8.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8d5524';
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12212e';
  ctx.beginPath();
  ctx.arc(0, bob * 0.3 - 1, 5.4, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickupsAndFloaters(ctx, state) {
  for (const pickup of state.pickups) {
    const bobY = Math.sin(pickup.bob) * 3;
    ctx.fillStyle = 'rgba(123,227,130,0.25)';
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y + bobY, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f9e44';
    roundRect(ctx, pickup.x - 9, pickup.y - 6 + bobY, 18, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#eaffea';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pickup.x, pickup.y + 4 + bobY);
  }
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const floater of state.floaters) {
    ctx.globalAlpha = clamp(floater.life, 0, 1);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx, state) {
  ctx.lineWidth = 2.4;
  for (const bullet of state.bullets) {
    ctx.strokeStyle = bullet.color;
    ctx.beginPath();
    ctx.moveTo(bullet.x1, bullet.y1);
    ctx.lineTo(bullet.x2, bullet.y2);
    ctx.stroke();
  }
  if (state.muzzle) {
    ctx.fillStyle = '#ffdf6b';
    ctx.beginPath();
    ctx.arc(state.muzzle.x, state.muzzle.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx, state) {
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMaraMarker(ctx, state) {
  const m = state.missions;
  if (m.freeRoam || state.screen !== 'playing') return;
  const bobY = Math.sin(state.time * 3) * 4;
  ctx.fillStyle = '#37c8d9';
  ctx.beginPath();
  ctx.arc(430, 352, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('M', 430, 357);
  ctx.fillStyle = '#37c8d9';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('MARA', 430, 334 + bobY);
}

function drawNightGlows(ctx, state, camX, camY) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of state.city.lamps) {
    const sx = lamp.x - camX;
    const sy = lamp.y - camY;
    if (sx < -60 || sy < -60 || sx > VIEW.width + 60 || sy > VIEW.height + 60) continue;
    const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, 44);
    grad.addColorStop(0, 'rgba(255,214,130,0.20)');
    grad.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, 44, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
