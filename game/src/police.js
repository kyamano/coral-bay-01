// Coral Bay — the law: a five-star wanted system. Witnessed crimes add
// heat; heat makes stars; stars bring cruisers that chase and ram, foot
// officers who shoot from three stars, and roadblocks at four. Break line
// of sight and stay clean and the heat bleeds away. Get cornered by an
// officer and the arrest meter fills — BUSTED.

import { WANTED } from './config.js';
import { angleLerp, clamp, distance, randRange } from './random.js';
import { collideWithBuildings, horizontalRoadCentres, verticalRoadCentres } from './city.js';
import { makeCar, moveCar } from './vehicles.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (const threshold of WANTED.starThresholds) {
    if (heat >= threshold) stars += 1;
  }
  return stars;
}

function playerPosition(state) {
  return state.playerPos();
}

function canSeePlayer(state, x, y, range) {
  const p = playerPosition(state);
  if (distance(x, y, p.x, p.y) > range) return false;
  // Buildings block sight in steps along the line.
  const steps = 8;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const sx = x + (p.x - x) * t;
    const sy = y + (p.y - y) * t;
    for (const b of state.city.buildings) {
      if (sx > b.x && sx < b.x + b.w && sy > b.y && sy < b.y + b.h) return false;
    }
  }
  return true;
}

export function spawnPoliceCar(state) {
  const p = playerPosition(state);
  // Enter from a road a few blocks away, never on top of the player.
  const vertical = state.rng() < 0.5;
  let x;
  let y;
  if (vertical) {
    const cx = verticalRoadCentres()[Math.floor(state.rng() * 6)];
    x = cx;
    y = clamp(p.y + (state.rng() < 0.5 ? -560 : 560), 70, 1200);
  } else {
    const cy = horizontalRoadCentres()[Math.floor(state.rng() * 5)];
    x = clamp(p.x + (state.rng() < 0.5 ? -560 : 560), 70, 1560);
    y = cy;
  }
  const car = makeCar(x, y, Math.atan2(p.y - y, p.x - x), 'police', state.rng);
  car.color = '#eef1f5';
  car.model = 'CBPD Cruiser';
  car.cruiseSpeed = 305;
  state.cars.push(car);
  return car;
}

export function spawnOfficer(state, nearCar) {
  const x = nearCar ? nearCar.x + randRange(state.rng, -30, 30) : playerPosition(state).x + 200;
  const y = nearCar ? nearCar.y + randRange(state.rng, -30, 30) : playerPosition(state).y;
  const officer = {
    id: state.officers.length + 1 + Math.floor(state.rng() * 10000),
    x,
    y,
    angle: 0,
    health: 70,
    state: 'chase', // chase | down
    shootCooldown: randRange(state.rng, 0.6, 1.6),
    wobble: randRange(state.rng, 0, 6),
  };
  state.officers.push(officer);
  return officer;
}

function spawnRoadblock(state) {
  const p = playerPosition(state);
  // Two cruisers parked across the road ahead of the player's heading.
  const heading = state.player.inCar && state.player.car ? state.player.car.angle : state.player.angle;
  const bx = p.x + Math.cos(heading) * 330;
  const by = p.y + Math.sin(heading) * 330;
  for (let i = 0; i < 2; i += 1) {
    const car = makeCar(bx + (i - 0.5) * 34 * Math.cos(heading + Math.PI / 2), by + (i - 0.5) * 34 * Math.sin(heading + Math.PI / 2), heading + Math.PI / 2, 'police', state.rng);
    car.color = '#eef1f5';
    car.model = 'CBPD Cruiser';
    car.roadblock = true;
    car.speed = 0;
    state.cars.push(car);
  }
  state.showToast('ROADBLOCK', 'Police are blocking the road ahead!', '#ff5147');
}

export function updatePolice(state, dt) {
  const wanted = state.wanted;
  const p = playerPosition(state);

  // Sight: any police unit or officer who can see the player refreshes it.
  let seen = false;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead && canSeePlayer(state, car.x, car.y, 330)) seen = true;
  }
  for (const officer of state.officers) {
    if (officer.state !== 'down' && canSeePlayer(state, officer.x, officer.y, 300)) seen = true;
  }
  wanted.seen = seen;
  if (seen) wanted.lastSeenAt = state.time;

  // Heat decay only while unseen; committing crimes is handled by commitCrime.
  if (!seen && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
  }
  const newStars = starsForHeat(wanted.heat);
  if (newStars !== wanted.stars) {
    wanted.stars = newStars;
    if (newStars === 0) state.showToast('You lost them', 'The heat is off. For now.', '#7be382');
  }

  // Spawning follows the stars.
  const wantedCars = wanted.stars === 0 ? 0 : 1 + wanted.stars;
  const liveCars = state.cars.filter((c) => c.kind === 'police' && !c.dead);
  state.policeSpawnTimer -= dt;
  if (wanted.stars > 0 && liveCars.length < wantedCars && state.policeSpawnTimer <= 0) {
    spawnPoliceCar(state);
    state.policeSpawnTimer = WANTED.policeCarInterval;
  }
  state.officerSpawnTimer -= dt;
  if (wanted.stars >= 2 && state.officers.filter((o) => o.state !== 'down').length < wanted.stars - 1 && state.officerSpawnTimer <= 0) {
    const near = liveCars[0];
    if (near) spawnOfficer(state, near);
    state.officerSpawnTimer = WANTED.officerInterval;
  }
  state.roadblockCooldown -= dt;
  if (wanted.stars >= WANTED.roadblockStars && state.roadblockCooldown <= 0) {
    spawnRoadblock(state);
    state.roadblockCooldown = 26;
  }

  // Cruisers hunt: drive at the player's last known position, ram on contact.
  for (const car of liveCars) {
    if (car.roadblock) continue;
    const target = seen || state.time - wanted.lastSeenAt < 4
      ? p
      : { x: car.x + Math.cos(car.angle) * 200, y: car.y + Math.sin(car.angle) * 200 };
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    car.angle = angleLerp(car.angle, desired, clamp(dt * 2.4, 0, 1));
    const d = distance(car.x, car.y, target.x, target.y);
    const topSpeed = state.player.inCar ? 322 : 238;
    const targetSpeed = d > 60 ? topSpeed : topSpeed * 0.45;
    car.speed += clamp(targetSpeed - car.speed, -300 * dt, 200 * dt);
    moveCar(state, car, dt);
    if (state.player.inCar && state.player.car && distance(car.x, car.y, state.player.car.x, state.player.car.y) < 30) {
      state.policeContactThisFrame = true;
    }
  }

  // Officers chase on foot and shoot from three stars.
  for (const officer of state.officers) {
    if (officer.state === 'down') continue;
    officer.wobble += dt * 8;
    const d = distance(officer.x, officer.y, p.x, p.y);
    const desired = Math.atan2(p.y - officer.y, p.x - officer.x);
    officer.angle = angleLerp(officer.angle, desired, clamp(dt * 6, 0, 1));
    if (d > 120) {
      officer.x += Math.cos(officer.angle) * 148 * dt;
      officer.y += Math.sin(officer.angle) * 148 * dt;
      const fixed = collideWithBuildings(state.city, officer.x, officer.y, 10);
      officer.x = fixed.x;
      officer.y = fixed.y;
    }
    officer.shootCooldown -= dt;
    if (wanted.stars >= 3 && d < 300 && d > 40 && officer.shootCooldown <= 0 && canSeePlayer(state, officer.x, officer.y, 320)) {
      officer.shootCooldown = randRange(state.rng, 0.9, 1.7);
      state.enemyShoot(officer, p);
    }
    // Arrest: an officer close to a slow or on-foot player fills the meter.
    if (d < 34 && !state.player.inCar) state.arrestContact = true;
    if (d < 30 && state.player.inCar && Math.abs(state.player.car.speed) < 18) state.arrestContact = true;
  }

  // The arrest meter itself.
  if (state.arrestContact && wanted.stars > 0) {
    state.arrestProgress += dt / WANTED.arrestSeconds;
    if (state.arrestProgress >= 1) state.onBusted();
  } else {
    state.arrestProgress = Math.max(0, state.arrestProgress - dt * 0.7);
  }
  state.arrestContact = false;

  // Clean-up: units give up and leave when the stars are gone.
  if (wanted.stars === 0) {
    state.officers = state.officers.filter((o) => o.state === 'down');
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.dead && distance(car.x, car.y, p.x, p.y) > 700) car.kind = 'traffic';
    }
  }
}

export function shootOfficer(state, officer, damage) {
  if (officer.state === 'down') return;
  officer.health -= damage;
  state.commitCrime(18, officer.x, officer.y, null);
  if (officer.health <= 0) {
    officer.state = 'down';
    state.spawnParticles(officer.x, officer.y, 9, '#2b3a67', 70, 0.5);
    state.maybeDropCash(officer.x, officer.y);
  }
}
