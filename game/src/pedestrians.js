// Coral Bay — pedestrians: citizens who stroll the sidewalks and the beach
// promenade, chat in pairs, and run screaming when a car mounts the kerb, a
// gun goes off, or someone goes down near them.

import { BEACH, CITY, WORLD } from './config.js';
import { angleLerp, clamp, distance, pick, randRange } from './random.js';
import { collideWithBuildings, isOnRoad } from './city.js';

const SHIRT_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#54a0ff', '#c8d6e5', '#ff9ff3', '#00d2d3'];
const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAT_COLORS = ['#ffffff', '#222831', '#e2703a', '#37c8d9', '#ffb03a'];

let nextPedId = 1;

export function makePedestrian(x, y, rng) {
  return {
    id: nextPedId++,
    x,
    y,
    angle: randRange(rng, 0, Math.PI * 2),
    speed: 0,
    walkSpeed: randRange(rng, 42, 78),
    shirt: pick(rng, SHIRT_COLORS),
    skin: pick(rng, SKIN_TONES),
    hat: rng() < 0.4 ? pick(rng, HAT_COLORS) : null,
    state: 'walk', // walk | flee | down
    targetX: x,
    targetY: y,
    retargetIn: randRange(rng, 0, 3),
    panic: 0,
    health: 100,
    wobble: randRange(rng, 0, Math.PI * 2),
  };
}

/** Citizens appear on sidewalks all over town and along the promenade. */
export function spawnPedestrians(state, count) {
  const { rng } = state;
  for (let i = 0; i < count; i += 1) {
    let x;
    let y;
    if (i % 5 === 4) {
      x = BEACH.promenadeX + randRange(rng, -52, 52);
      y = randRange(rng, 40, WORLD.height - 40);
    } else {
      const col = Math.floor(rng() * CITY.cols);
      const row = Math.floor(rng() * CITY.rows);
      const bx = CITY.firstRoadX + col * CITY.pitchX + CITY.roadWidth / 2;
      const by = CITY.firstRoadY + row * CITY.pitchY + CITY.roadWidth / 2;
      const side = Math.floor(rng() * 4);
      if (side === 0) { x = bx + randRange(rng, 0, CITY.pitchX - CITY.roadWidth); y = by - 7; }
      else if (side === 1) { x = bx + randRange(rng, 0, CITY.pitchX - CITY.roadWidth); y = by + CITY.pitchX - 130; }
      else if (side === 2) { x = bx - 7; y = by + randRange(rng, 0, CITY.pitchY - CITY.roadWidth); }
      else { x = bx + CITY.pitchY - 118; y = by + randRange(rng, 0, CITY.pitchY - CITY.roadWidth); }
    }
    const ped = makePedestrian(x, y, rng);
    ped.targetX = x + randRange(rng, -160, 160);
    ped.targetY = y + randRange(rng, -160, 160);
    state.peds.push(ped);
  }
}

/** Frighten everyone within radius: they flee from the danger point. */
export function scarePedestrians(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.panic = randRange(state.rng, 1.6, 3.2);
      ped.angle = Math.atan2(ped.y - y, ped.x - x) + randRange(state.rng, -0.5, 0.5);
    }
  }
}

/** A nearby horn blast startles a walker into a short hop away from the car. */
export function startlePedestrian(ped, fromX, fromY) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.panic = Math.max(ped.panic, 0.7);
  ped.angle = Math.atan2(ped.y - fromY, ped.x - fromX);
}

export function updatePedestrian(state, ped, dt) {
  if (ped.state === 'down') return;
  ped.wobble += dt * 9;

  if (ped.state === 'flee') {
    ped.panic -= dt;
    ped.speed = 178;
    if (ped.panic <= 0) {
      ped.state = 'walk';
      ped.retargetIn = 0;
    }
  } else {
    ped.retargetIn -= dt;
    const d = distance(ped.x, ped.y, ped.targetX, ped.targetY);
    if (d < 12 || ped.retargetIn <= 0) {
      ped.targetX = clamp(ped.x + randRange(state.rng, -230, 230), 14, BEACH.sandTo - 30);
      ped.targetY = clamp(ped.y + randRange(state.rng, -230, 230), 14, WORLD.height - 14);
      ped.retargetIn = randRange(state.rng, 4, 9);
    }
    const desired = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    ped.angle = angleLerp(ped.angle, desired, clamp(dt * 5, 0, 1));
    ped.speed = ped.walkSpeed;
  }

  let nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  let ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const fixed = collideWithBuildings(state.city, nx, ny, 10);
  nx = fixed.x;
  ny = fixed.y;
  ped.x = clamp(nx, 10, BEACH.sandTo - 6);
  ped.y = clamp(ny, 10, WORLD.height - 10);

  // Stepping into the road in front of a fast car is how accidents happen.
  if (isOnRoad(ped.x, ped.y)) {
    for (const car of state.cars) {
      if (car.dead) continue;
      if (Math.abs(car.speed) > 55 && distance(ped.x, ped.y, car.x, car.y) < 24) {
        knockDownPedestrian(state, ped, car);
        break;
      }
    }
  }
}

/** A pedestrian is hit: they go down, the city notices, the law responds. */
export function knockDownPedestrian(state, ped, byCar) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.health = 0;
  state.spawnParticles(ped.x, ped.y, 8, '#d64541', 80, 0.5);
  scarePedestrians(state, ped.x, ped.y, 130);
  const playerCaused = byCar && byCar === state.player.car;
  if (playerCaused) {
    state.commitCrime(34, ped.x, ped.y, 'You ran someone down!');
    state.shake = Math.min(0.7, state.shake + 0.3);
    state.sound.crash(0.6);
  }
}

export function shootPedestrian(state, ped, damage) {
  if (ped.state === 'down') return;
  ped.health -= damage;
  scarePedestrians(state, ped.x, ped.y, 160);
  if (ped.health <= 0) {
    ped.state = 'down';
    state.spawnParticles(ped.x, ped.y, 8, '#d64541', 80, 0.5);
  } else {
    ped.state = 'flee';
    ped.panic = 2.6;
    ped.angle = Math.atan2(ped.y - state.player.y, ped.x - state.player.x);
  }
}
