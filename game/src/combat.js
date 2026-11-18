// Coral Bay — combat: mouse-aimed shooting for the player, return fire from
// officers, tracers coloured by who fired them, and the cash pickups that
// violence and good driving sometimes leave behind.

import { CASH_PICKUP, WEAPON } from './config.js';
import { clamp, distance, randRange } from './random.js';
import { damageCar } from './vehicles.js';
import { shootOfficer } from './police.js';
import { shootPedestrian, scarePedestrians } from './pedestrians.js';

/** Try to fire the player's pistol toward a world point. */
export function playerShoot(state, targetX, targetY) {
  const weapon = state.weapon;
  if (state.player.inCar || weapon.reloading > 0 || weapon.cooldown > 0) return;
  if (weapon.ammo <= 0) {
    startReload(state);
    return;
  }
  weapon.ammo -= 1;
  weapon.cooldown = WEAPON.cooldown;
  const px = state.player.x;
  const py = state.player.y;
  const angle = Math.atan2(targetY - py, targetX - px) + randRange(state.rng, -WEAPON.spread, WEAPON.spread);
  fireTracer(state, px, py, angle, 'player');
  state.muzzle = { x: px + Math.cos(angle) * 16, y: py + Math.sin(angle) * 16, life: 0.05 };
  state.sound.gunshot();
  scarePedestrians(state, px, py, 190);
  state.commitCrime(16, px, py, 'Shots fired!');
  if (weapon.ammo === 0) startReload(state);
}

export function startReload(state) {
  if (state.weapon.reloading > 0 || state.weapon.ammo === WEAPON.magSize) return;
  state.weapon.reloading = WEAPON.reloadSeconds;
  state.sound.reloadClick();
}

export function updateWeapon(state, dt) {
  const weapon = state.weapon;
  weapon.cooldown = Math.max(0, weapon.cooldown - dt);
  if (weapon.reloading > 0) {
    weapon.reloading -= dt;
    if (weapon.reloading <= 0) weapon.ammo = WEAPON.magSize;
  }
  if (state.muzzle) {
    state.muzzle.life -= dt;
    if (state.muzzle.life <= 0) state.muzzle = null;
  }
}

/** An officer fires at the player: less accurate, and it hurts. */
export function enemyShoot(state, officer, target) {
  const angle = Math.atan2(target.y - officer.y, target.x - officer.x) + randRange(state.rng, -0.09, 0.09);
  fireTracer(state, officer.x, officer.y, angle, 'police');
  state.sound.enemyGunshot();
  const d = distance(officer.x, officer.y, target.x, target.y);
  if (d < 300 && state.rng() < 0.34) {
    damagePlayer(state, state.player.inCar ? 4 : 8);
  }
}

export function damagePlayer(state, amount) {
  if (state.screen !== 'playing') return;
  state.player.health -= amount;
  state.shake = Math.min(0.6, state.shake + 0.14);
  state.spawnParticles(state.player.x, state.player.y, 4, '#d64541', 60, 0.4);
}

/**
 * Resolve one shot as an instant ray: the nearest pedestrian, officer or
 * car within range and a narrow cone takes the hit; the visible tracer
 * stops at whatever it struck.
 */
function fireTracer(state, fromX, fromY, angle, side) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let bestT = WEAPON.range;
  let hit = null;

  const testPoint = (x, y, radius, payload) => {
    const relX = x - fromX;
    const relY = y - fromY;
    const t = relX * dirX + relY * dirY;
    if (t < 0 || t > bestT) return;
    const perp = Math.abs(relX * dirY - relY * dirX);
    if (perp < radius) {
      bestT = t;
      hit = payload;
    }
  };

  if (side === 'player') {
    for (const ped of state.peds) if (ped.state !== 'down') testPoint(ped.x, ped.y, 11, { type: 'ped', ped });
    for (const officer of state.officers) if (officer.state !== 'down') testPoint(officer.x, officer.y, 11, { type: 'officer', officer });
    for (const car of state.cars) if (!car.dead) testPoint(car.x, car.y, 24, { type: 'car', car });
  }

  state.bullets.push({
    x1: fromX,
    y1: fromY,
    x2: fromX + dirX * bestT,
    y2: fromY + dirY * bestT,
    life: 0.07,
    color: side === 'player' ? '#ffd76a' : '#ff7a5c',
  });

  if (!hit) return;
  if (hit.type === 'ped') {
    shootPedestrian(state, hit.ped, WEAPON.damage);
    state.commitCrime(22, hit.ped.x, hit.ped.y, 'You shot someone!');
  } else if (hit.type === 'officer') {
    shootOfficer(state, hit.officer, WEAPON.damage);
  } else if (hit.type === 'car') {
    damageCar(state, hit.car, WEAPON.damage * 0.6, true);
    state.spawnParticles(hit.car.x, hit.car.y, 4, '#ffd76a', 90, 0.3);
    if (hit.car.kind === 'police') state.commitCrime(14, hit.car.x, hit.car.y, null);
  }
}

export function updateBullets(state, dt) {
  for (const bullet of state.bullets) bullet.life -= dt;
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

/** Drop a glowing cash pickup, by chance, at a world position. */
export function maybeDropCash(state, x, y) {
  if (state.rng() > CASH_PICKUP.dropChance) return;
  state.pickups.push({
    x: x + randRange(state.rng, -14, 14),
    y: y + randRange(state.rng, -14, 14),
    life: CASH_PICKUP.lifeSeconds,
    bob: randRange(state.rng, 0, 6),
  });
}

export function dropCash(state, x, y) {
  state.pickups.push({ x, y, life: CASH_PICKUP.lifeSeconds, bob: 0 });
}

/** Pickups are collected by walking or driving over them: +$25 and a float. */
export function updatePickups(state, dt) {
  const p = state.playerPos();
  for (const pickup of state.pickups) {
    pickup.life -= dt;
    pickup.bob += dt * 3;
    if (distance(p.x, p.y, pickup.x, pickup.y) < CASH_PICKUP.radius + 14) {
      pickup.life = 0;
      state.player.money += CASH_PICKUP.value;
      state.floaters.push({ x: pickup.x, y: pickup.y - 18, text: `+$${CASH_PICKUP.value}`, life: 1.2, color: '#7be382' });
      state.sound.pickup();
    }
  }
  state.pickups = state.pickups.filter((pk) => pk.life > 0);
  for (const floater of state.floaters) {
    floater.life -= dt;
    floater.y -= 26 * dt;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);
}

export { clamp };
