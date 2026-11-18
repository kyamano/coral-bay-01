// Coral Bay — cars: the player's driving, traffic that follows the road
// grid, parked cars waiting to be stolen, and the physics they all share
// (impacts, damage, smoke, skid marks, headlights after dark).

import { CAR, CITY, DAYLIGHT } from './config.js';
import { angleDelta, angleLerp, clamp, distance, pick, randRange } from './random.js';
import {
  circleHitsBuilding, clampToWorld, collideWithBuildings, horizontalRoadCentres, verticalRoadCentres,
} from './city.js';

const CAR_MODELS = [
  { model: 'Comet Cabrio', color: '#e74c3c' },
  { model: 'Palma Sedan', color: '#5b8dd9' },
  { model: 'Tide Hatch', color: '#f2c94c' },
  { model: 'Coral Coupe', color: '#58b368' },
  { model: 'Dune Buggy', color: '#e58e4e' },
  { model: 'Marina Van', color: '#b565a7' },
  { model: 'Pelican Pickup', color: '#4fb0c6' },
  { model: 'Flamingo Roadster', color: '#d95f76' },
];

let nextCarId = 1;

export function makeCar(x, y, angle, kind, rng) {
  const spec = pick(rng, CAR_MODELS);
  return {
    id: nextCarId++,
    x,
    y,
    angle,
    speed: 0,
    kind, // parked | traffic | player | police | fleeing
    model: spec.model,
    color: spec.color,
    health: CAR.maxHealth,
    dead: false,
    smoke: 0,
    axis: Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? 'h' : 'v',
    dir: 1,
    lane: 24,
    cruiseSpeed: randRange(rng, 120, 175),
    turnCooldown: 0,
    honkCooldown: randRange(rng, 2, 9),
    roadblock: false,
  };
}

/** Parked cars line the lots and the kerbs: every one of them can be stolen. */
export function spawnParkedCars(state) {
  const { rng, city } = state;
  for (const block of city.blocks) {
    if (block.kind === 'buildings' && rng() < 0.45) {
      const car = makeCar(
        block.x + randRange(rng, 30, Math.max(31, block.w - 30)),
        block.y + block.h - 16,
        0,
        'parked',
        rng,
      );
      state.cars.push(car);
    }
    if (block.kind === 'lot') {
      for (let i = 0; i < 4; i += 1) {
        const car = makeCar(block.x + 34 + i * 36, block.y + 40, Math.PI / 2, 'parked', rng);
        state.cars.push(car);
      }
    }
  }
  while (state.cars.filter((c) => c.kind === 'parked').length < CAR.parkedCount) {
    const cx = pick(rng, verticalRoadCentres());
    const cy = pick(rng, horizontalRoadCentres());
    state.cars.push(makeCar(cx + 64, cy + randRange(rng, -160, 160), Math.PI / 2, 'parked', rng));
  }
}

/** Traffic spawns already rolling on a random road, in the right-hand lane. */
export function spawnTrafficCars(state, count) {
  const { rng } = state;
  for (let i = 0; i < count; i += 1) {
    const horizontal = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    let car;
    if (horizontal) {
      const cy = pick(rng, horizontalRoadCentres());
      car = makeCar(randRange(rng, 80, CITY.edgeX - 80), cy + (dir > 0 ? 24 : -24), dir > 0 ? 0 : Math.PI, 'traffic', rng);
      car.axis = 'h';
    } else {
      const cx = pick(rng, verticalRoadCentres());
      car = makeCar(cx + (dir > 0 ? -24 : 24), randRange(rng, 80, 1180), dir > 0 ? Math.PI / 2 : -Math.PI / 2, 'traffic', rng);
      car.axis = 'v';
    }
    car.dir = dir;
    car.speed = car.cruiseSpeed * 0.7;
    state.cars.push(car);
  }
}

export function nearestEnterableCar(state, reach) {
  const p = state.player;
  let best = null;
  let bestDistance = reach;
  for (const car of state.cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = car;
    }
  }
  return best;
}

/**
 * Move a car one step: advance along its heading, resolve building impacts
 * (damage, bounce, crash sound through the state hook), and lay skid marks
 * when it slides or brakes hard.
 */
export function moveCar(state, car, dt) {
  const prevSpeed = car.speed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (circleHitsBuilding(state.city, car.x, car.y, 19)) {
    const fixed = collideWithBuildings(state.city, car.x, car.y, 21);
    car.x = fixed.x;
    car.y = fixed.y;
    if (Math.abs(car.speed) > 60) {
      damageCar(state, car, Math.abs(car.speed) * 0.16, true);
      state.shake = Math.min(0.8, state.shake + Math.abs(car.speed) / 700);
    }
    car.speed = -car.speed * 0.25;
  }
  const clamped = clampToWorld(car.x, car.y, 22, false);
  if (clamped.x !== car.x || clamped.y !== car.y) {
    car.x = clamped.x;
    car.y = clamped.y;
    car.speed *= 0.6;
  }

  // Car-to-car bumps: a soft push apart and shared damage at speed.
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const d = distance(car.x, car.y, other.x, other.y);
    if (d < 34 && d > 0.01) {
      const push = (34 - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push;
      car.y += uy * push;
      other.x -= ux * push;
      other.y -= uy * push;
      const closing = Math.abs(prevSpeed) + Math.abs(other.speed);
      if (closing > 130) {
        damageCar(state, car, closing * 0.05, true);
        damageCar(state, other, closing * 0.05, false);
        state.shake = Math.min(0.7, state.shake + 0.25);
      }
    }
  }

  if (Math.abs(car.speed) > 150 && car.sliding) {
    state.skidMarks.push({ x: car.x, y: car.y, life: 7 });
    if (state.skidMarks.length > 420) state.skidMarks.shift();
  }
  if (car.health < 45 && !car.dead) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      state.spawnParticles(car.x, car.y - 6, 1, 'rgba(60,60,60,0.7)', 26, 0.9);
    }
  }
}

/** Damage a car; at zero it is a smoking wreck and drops loot via the hook. */
export function damageCar(state, car, amount, byPlayer) {
  if (car.dead) return;
  car.health -= amount;
  if (car.kind === 'player' || car === state.player.car) {
    state.sound.crash(Math.min(1, amount / 26));
  }
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    state.spawnParticles(car.x, car.y, 16, '#ff9f43', 120, 0.7);
    state.spawnParticles(car.x, car.y, 10, 'rgba(50,50,50,0.8)', 60, 1.2);
    if (car.kind === 'police') {
      state.commitCrime(26, car.x, car.y, 'You wrecked a police cruiser!');
      state.maybeDropCash(car.x, car.y);
    }
    if (car.kind === 'fleeing') state.missionTargetHit(car);
  }
}

/** The player's own driving: throttle, brake, reverse, handbrake, steering. */
export function drivePlayerCar(state, car, input, dt) {
  const forward = input.down('KeyW', 'ArrowUp');
  const back = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const handbrake = input.down('Space');

  if (forward) car.speed += CAR.accel * dt;
  else if (back) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.55 * dt;
  }
  if (handbrake) car.speed -= car.speed * 2.6 * dt;
  car.speed -= car.speed * CAR.drag * dt;
  car.speed = clamp(car.speed, CAR.maxReverse, CAR.maxSpeed);
  if (!forward && !back && Math.abs(car.speed) < 4) car.speed = 0;

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const grip = handbrake ? 1.5 : 1;
  car.sliding = handbrake && Math.abs(car.speed) > 120;
  if (steer !== 0 && car.speed !== 0) {
    const direction = car.speed >= 0 ? 1 : -1;
    car.angle += steer * CAR.turnRate * grip * dt * direction * Math.min(1, Math.abs(car.speed) / 130);
  }
  moveCar(state, car, dt);
}

/**
 * Traffic: hold the lane, brake for the car ahead, and sometimes turn at a
 * junction. When the player's car blocks the lane, traffic honks.
 */
export function updateTrafficCar(state, car, dt) {
  if (car.dead) return;
  car.turnCooldown -= dt;
  car.honkCooldown -= dt;

  // The car ahead in our lane and direction.
  let gap = Infinity;
  let blocker = null;
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = car.axis === 'h' ? dx * car.dir : dy * car.dir;
    const side = car.axis === 'h' ? Math.abs(dy - (other.axis === car.axis ? 0 : dy)) : Math.abs(dx);
    const lateral = car.axis === 'h' ? Math.abs(other.y - car.y) : Math.abs(other.x - car.x);
    if (ahead > 0 && ahead < gap && lateral < 26 && side < 900) {
      gap = ahead;
      blocker = other;
    }
  }
  const playerCar = state.player.car;
  if (playerCar && state.player.inCar) {
    const dx = playerCar.x - car.x;
    const dy = playerCar.y - car.y;
    const ahead = car.axis === 'h' ? dx * car.dir : dy * car.dir;
    const lateral = car.axis === 'h' ? Math.abs(dy) : Math.abs(dx);
    if (ahead > 0 && ahead < gap && lateral < 30) {
      gap = ahead;
      blocker = playerCar;
    }
  }

  let targetSpeed = car.cruiseSpeed;
  if (gap < 88) {
    targetSpeed = Math.min(targetSpeed, Math.max(0, (gap - 40) * 2.2));
    if (gap < 62 && car.honkCooldown <= 0 && blocker === playerCar) {
      state.sound.trafficHorn();
      car.honkCooldown = randRange(state.rng, 3, 8);
    }
  }
  car.speed += clamp(targetSpeed - car.speed, -260 * dt, 130 * dt);

  // Junctions: when our centre crosses a perpendicular road centre, maybe turn.
  const centres = car.axis === 'h' ? verticalRoadCentres() : horizontalRoadCentres();
  const along = car.axis === 'h' ? car.x : car.y;
  for (const centre of centres) {
    if (Math.abs(along - centre) < 8 && car.turnCooldown <= 0 && state.rng() < 0.012) {
      turnTrafficCar(state, car, centre);
      break;
    }
  }

  // Hold the lane line.
  if (car.axis === 'h') {
    const roadY = nearestCentre(car.y, horizontalRoadCentres());
    const laneY = roadY + (car.dir > 0 ? car.lane : -car.lane);
    car.y += clamp(laneY - car.y, -60 * dt, 60 * dt);
    car.angle = angleLerp(car.angle, car.dir > 0 ? 0 : Math.PI, clamp(dt * 3, 0, 1));
  } else {
    const roadX = nearestCentre(car.x, verticalRoadCentres());
    const laneX = roadX + (car.dir > 0 ? -car.lane : car.lane);
    car.x += clamp(laneX - car.x, -60 * dt, 60 * dt);
    car.angle = angleLerp(car.angle, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2, clamp(dt * 3, 0, 1));
  }
  moveCar(state, car, dt);

  // Wrap traffic around the city so the streets never empty.
  if (car.x < 30 || car.x > CITY.edgeX - 20 || car.y < 30 || car.y > 1240) {
    respawnTrafficCar(state, car);
  }
}

function nearestCentre(value, centres) {
  let best = centres[0];
  for (const c of centres) if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  return best;
}

function turnTrafficCar(state, car, centre) {
  car.turnCooldown = 2.5;
  if (car.axis === 'h') {
    car.y = nearestCentre(car.y, horizontalRoadCentres());
    car.x = centre;
    car.axis = 'v';
    car.dir = state.rng() < 0.5 ? 1 : -1;
  } else {
    car.x = nearestCentre(car.x, verticalRoadCentres());
    car.y = centre;
    car.axis = 'h';
    car.dir = state.rng() < 0.5 ? 1 : -1;
  }
}

function respawnTrafficCar(state, car) {
  const horizontal = state.rng() < 0.5;
  const dir = state.rng() < 0.5 ? 1 : -1;
  car.dir = dir;
  car.dead = false;
  car.health = CAR.maxHealth;
  if (horizontal) {
    const cy = pick(state.rng, horizontalRoadCentres());
    car.axis = 'h';
    car.x = dir > 0 ? 60 : CITY.edgeX - 60;
    car.y = cy + (dir > 0 ? car.lane : -car.lane);
    car.angle = dir > 0 ? 0 : Math.PI;
  } else {
    const cx = pick(state.rng, verticalRoadCentres());
    car.axis = 'v';
    car.x = cx + (dir > 0 ? -car.lane : car.lane);
    car.y = dir > 0 ? 60 : 1180;
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  car.speed = car.cruiseSpeed * 0.6;
}

/** Are this car's headlights on at the current game-clock hour? */
export function headlightsOn(state, car) {
  const h = state.clockHour;
  return h >= DAYLIGHT.headlightsFrom || h < DAYLIGHT.headlightsTo || car.kind === 'police';
}

export { angleDelta };
