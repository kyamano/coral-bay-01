// Coral Bay — the staged scenes behind ?shot=cover|street|mission|chase.
// Each scene builds the real game state, places the player, the traffic,
// the police and the mission exactly where the story would put them, runs
// the real simulation for a few seconds with a simple autopilot, and leaves
// the frame frozen on a living moment of the actual game. Same seed, same
// frame, every time.

import { BEACH } from './config.js';
import { horizontalRoadCentre, verticalRoadCentre } from './city.js';
import { makeCar } from './vehicles.js';
import { spawnOfficer } from './police.js';
import { MARA_POS, MISSIONS } from './missions.js';

function placePlayerInCar(state, car) {
  car.kind = 'player';
  state.player.inCar = true;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
}

function addPoliceCar(state, x, y, angle) {
  const car = makeCar(x, y, angle, 'police', state.rng);
  car.color = '#eef1f5';
  car.model = 'CBPD Cruiser';
  state.cars.push(car);
  return car;
}

function setWanted(state, heat) {
  state.wanted.heat = heat;
  state.wanted.stars = heat >= 262 ? 5 : heat >= 118 ? 3 : heat >= 22 ? 1 : 0;
  state.wanted.lastSeenAt = 9999;
  state.wanted.seen = true;
}

function beginTimedDelivery(state) {
  const m = state.missions;
  m.index = 2;
  m.phase = 'active';
  m.active = MISSIONS[2];
  m.stepIndex = 0;
  m.stepTimer = 71;
  state.player.money = 450;
}

/** Cover: a 3-star chase through downtown, mid timed-delivery. */
function stageCover(state) {
  state.clockHour = 15.1;
  state.roadblockCooldown = 999;
  beginTimedDelivery(state);
  const roadY = horizontalRoadCentre(1);
  const car = makeCar(700, roadY + 24, 0, 'parked', state.rng);
  car.color = '#e74c3c';
  car.model = 'Comet Cabrio';
  car.speed = 264;
  state.cars.push(car);
  placePlayerInCar(state, car);
  state.autopilot = { speed: 250 };
  addPoliceCar(state, 580, roadY - 24, 0).speed = 240;
  addPoliceCar(state, 520, roadY + 24, 0).speed = 235;
  addPoliceCar(state, 800, roadY - 24, Math.PI).speed = 120;
  setWanted(state, 150);
  state.camera.x = car.x;
  state.camera.y = car.y;
  runAutopilot(state, 1.5);
  // Freeze the story the cover tells: three stars, fast, mid-delivery —
  // with the pursuit framed right on the player's tail.
  setWanted(state, 150);
  state.toast = null;
  if (state.player.car) {
    const car = state.player.car;
    car.speed = 264;
    car.angle = 0;
    const cruisers = state.cars.filter((c) => c.kind === 'police' && !c.dead);
    if (cruisers[0]) { cruisers[0].x = car.x - 82; cruisers[0].y = car.y - 8; cruisers[0].angle = 0.05; cruisers[0].speed = 250; }
    if (cruisers[1]) { cruisers[1].x = car.x - 158; cruisers[1].y = car.y + 24; cruisers[1].angle = -0.04; cruisers[1].speed = 246; }
    if (cruisers[2]) { cruisers[2].x = car.x + 215; cruisers[2].y = car.y - 54; cruisers[2].angle = Math.PI; cruisers[2].speed = 130; }
    state.camera.x = car.x;
    state.camera.y = car.y;
  }
}

/** Street: on foot downtown, Mara waiting, the city alive around you. */
function stageStreet(state) {
  state.clockHour = 11.4;
  state.player.x = 414;
  state.player.y = 384;
  state.player.angle = Math.atan2(352 - 384, 430 - 414);
  state.camera.x = state.player.x + 26;
  state.camera.y = state.player.y + 6;
  runIdle(state, 3);
}

/** Mission: Mara's dialogue open over the diner corner. */
function stageMission(state) {
  state.clockHour = 10.2;
  state.player.x = MARA_POS.x - 24;
  state.player.y = MARA_POS.y + 26;
  state.player.angle = Math.atan2(MARA_POS.y - state.player.y, MARA_POS.x - state.player.x);
  state.missions.phase = 'dialogue';
  state.missions.dialogue = MISSIONS[0].intro;
  state.missions.dialogueIndex = 0;
  state.camera.x = state.player.x + 20;
  state.camera.y = state.player.y;
  runIdle(state, 2);
}

/** Chase: five stars at sunset on the coast road, roadblock ahead. */
function stageChase(state) {
  state.clockHour = 18.6;
  state.roadblockCooldown = 999;
  const m = state.missions;
  m.index = 5;
  m.phase = 'active';
  m.active = MISSIONS[5];
  m.stepIndex = 0;
  state.player.money = 3750;
  state.player.health = 68;
  const coastX = verticalRoadCentre(5);
  // Heading north up the coast road; the pier objective is ahead.
  const car = makeCar(coastX - 24, 1010, -Math.PI / 2, 'parked', state.rng);
  car.model = 'Palma Sedan';
  car.color = '#f39c3c';
  car.speed = 282;
  state.cars.push(car);
  placePlayerInCar(state, car);
  state.autopilot = { speed: 275 };
  addPoliceCar(state, coastX + 24, 1130, -Math.PI / 2).speed = 262;
  addPoliceCar(state, coastX - 24, 1190, -Math.PI / 2).speed = 258;
  // The roadblock, parked across the coast road ahead.
  const blockA = addPoliceCar(state, coastX - 22, 620, Math.PI / 2 + 0.12);
  const blockB = addPoliceCar(state, coastX + 22, 620, Math.PI / 2 - 0.12);
  blockA.roadblock = true;
  blockB.roadblock = true;
  const officer = spawnOfficer(state, blockA);
  officer.x = coastX + 44;
  officer.y = 650;
  setWanted(state, 300);
  state.camera.x = car.x;
  state.camera.y = car.y;
  runAutopilot(state, 1.1);
  setWanted(state, 300);
  state.toast = null;
  if (state.player.car) state.player.car.speed = 282;
  state.camera.x = state.player.car.x;
  state.camera.y = state.player.car.y;
}

/** Run the world (no player input) for a few seconds of scene settling. */
function runIdle(state, seconds) {
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i += 1) state.stepWorld(1 / 60, true);
}

/** Drive the player's car with the autopilot while the world runs. */
function runAutopilot(state, seconds) {
  const steps = Math.floor(seconds * 60);
  for (let i = 0; i < steps; i += 1) state.stepWorld(1 / 60, true);
  state.autopilot = null;
  // Freeze mid-action: keep the speed the screenshot tells the story with.
  if (state.player.car) state.player.car.speed = Math.max(230, state.player.car.speed);
}

/**
 * Set the named scene up on a fresh state. Unknown names fall back to the
 * street scene, so a typo still shows the game.
 */
export function stageShot(state, name) {
  state.screen = 'playing';
  if (name === 'cover') stageCover(state);
  else if (name === 'mission') stageMission(state);
  else if (name === 'chase') stageChase(state);
  else stageStreet(state);
  state.missionTargetPos = state.currentTargetPos();
  state.camera.x = Math.max(400, Math.min(2240 - 400, state.camera.x));
  state.camera.y = Math.max(200, Math.min(1272 - 200, state.camera.y));
  return state;
}

export { BEACH };
