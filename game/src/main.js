// Coral Bay — boot, the game state, and the one loop.
// An original open-world crime game: a seeded coastal city, traffic and
// pedestrians, stealable cars, a five-star wanted system with a real police
// response, a six-mission story for Mara Voss, mouse-aimed combat, a HUD
// with a live minimap, and a localStorage save. Static files only.
//
// Screens: title -> playing <-> paused, plus busted and wasted.
// ?seed=N fixes the city. ?shot=cover|street|mission|chase stages a scene.

import { PLAYER, SAVE_KEY, STEP, VIEW, WEAPON } from './config.js';
import { clamp, distance, makeRng } from './random.js';
import { buildCity, clampToWorld, collideWithBuildings, horizontalRoadCentres, verticalRoadCentres } from './city.js';
import { Input } from './input.js';
import { SoundBus } from './audio.js';
import {
  drivePlayerCar, makeCar, moveCar, nearestEnterableCar, spawnParkedCars, spawnTrafficCars, updateTrafficCar,
} from './vehicles.js';
import { angleLerp } from './random.js';
import { knockDownPedestrian, scarePedestrians, spawnPedestrians, startlePedestrian, updatePedestrian } from './pedestrians.js';
import { starsForHeat, updatePolice } from './police.js';
import {
  dropCash, enemyShoot, maybeDropCash, playerShoot, startReload, updateBullets, updatePickups, updateWeapon,
} from './combat.js';
import {
  MARA_POS, MISSIONS, SAFEHOUSE_POS, createMissionState, currentTarget, missionOfferPrompt,
  missionTargetHit, talkToMara, tryStartSprint, updateMissions,
} from './missions.js';
import { drawWorld, updateCamera } from './render.js';
import {
  drawEndScreen, drawHud, drawPauseScreen, drawTitleScreen, pointInRect,
} from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 20261119) >>> 0;
const shotName = params.get('shot');

const BUTTONS = {
  title: {
    newGame: { x: 490, y: 420, w: 300, h: 54 },
    continueGame: { x: 490, y: 488, w: 300, h: 54 },
  },
  pause: {
    resume: { x: 490, y: 330, w: 300, h: 54 },
    saveQuit: { x: 490, y: 398, w: 300, h: 54 },
  },
  end: {
    respawn: { x: 440, y: 380, w: 400, h: 54 },
  },
};

function createState() {
  const rng = makeRng(seed);
  const state = {
    rng,
    city: buildCity(rng),
    input: new Input(canvas),
    sound: new SoundBus(),
    screen: 'title',
    time: 0,
    clockHour: 9.7,
    camera: { x: 430, y: 430 },
    player: {
      x: 430, y: 452, angle: 0, wobble: 0,
      health: PLAYER.maxHealth, money: PLAYER.startMoney,
      inCar: false, car: null,
    },
    cars: [],
    peds: [],
    officers: [],
    bullets: [],
    particles: [],
    skidMarks: [],
    pickups: [],
    floaters: [],
    muzzle: null,
    weapon: { name: WEAPON.name, ammo: WEAPON.magSize, cooldown: 0, reloading: 0 },
    wanted: { heat: 0, stars: 0, seen: false, lastSeenAt: -99 },
    arrestProgress: 0,
    arrestContact: false,
    policeSpawnTimer: 0,
    officerSpawnTimer: 0,
    roadblockCooldown: 0,
    policeContactThisFrame: false,
    missions: createMissionState(),
    fixerCar: null,
    stolenComet: false,
    autopilot: null,
    missionTargetPos: null,
    objectiveText: null,
    promptText: null,
    toast: null,
    shake: 0,
    damageFlash: 0,
    lastHurtAt: -99,
    aimWorld: { x: 0, y: 0 },
    hasSave: false,
  };

  state.playerPos = () => (state.player.inCar && state.player.car
    ? { x: state.player.car.x, y: state.player.car.y }
    : { x: state.player.x, y: state.player.y });
  state.currentTargetPos = () => currentTarget(state);
  state.spawnParticles = (x, y, count, color, speed, life) => {
    for (let i = 0; i < count; i += 1) {
      const a = rng() * Math.PI * 2;
      const v = speed * (0.3 + rng() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + rng() * 0.8), maxLife: life,
        size: 1.6 + rng() * 2.6, color,
      });
    }
  };
  state.showToast = (title, body, color) => {
    state.toast = { title, body, color, life: 4.4 };
  };
  state.commitCrime = (amount, x, y, label) => {
    let witnessed = false;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && distance(ped.x, ped.y, x, y) < 190) witnessed = true;
    }
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.dead && distance(car.x, car.y, x, y) < 340) witnessed = true;
    }
    for (const officer of state.officers) {
      if (officer.state !== 'down' && distance(officer.x, officer.y, x, y) < 340) witnessed = true;
    }
    const before = state.wanted.stars;
    state.wanted.heat = clamp(state.wanted.heat + amount * (witnessed ? 1 : 0.4), 0, 320);
    state.wanted.stars = starsForHeat(state.wanted.heat);
    if (witnessed) state.wanted.lastSeenAt = state.time;
    scarePedestrians(state, x, y, 120);
    if (label && state.wanted.stars > before) {
      state.showToast(`${'★'.repeat(state.wanted.stars)} WANTED`, label, '#ff5147');
    }
  };
  state.enemyShoot = (officer, target) => enemyShoot(state, officer, target);
  state.missionTargetHit = (car) => missionTargetHit(state, car);
  state.maybeDropCash = (x, y) => maybeDropCash(state, x, y);
  state.dropCash = (x, y) => dropCash(state, x, y);
  state.onBusted = () => {
    if (state.screen !== 'playing') return;
    state.screen = 'busted';
    state.sound.bustedSting();
    state.sound.setEngine(false, 0);
    state.sound.setSiren(false, 0);
  };
  state.saveGame = () => saveGame(state);
  state.stepWorld = (dt, staged) => updatePlaying(state, dt, staged);

  spawnParkedCars(state);
  spawnTrafficCars(state, 15);
  spawnPedestrians(state, 44);
  // The Comet Cabrio waiting on the road by Mara's diner corner (mission one).
  const comet = makeCar(404, 300, Math.PI / 2, 'parked', rng);
  comet.color = '#e74c3c';
  comet.model = 'Comet Cabrio';
  state.cars.push(comet);

  state.hasSave = Boolean(readSave());
  return state;
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame(state) {
  try {
    const p = state.playerPos();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      missionIndex: state.missions.index,
      freeRoam: state.missions.freeRoam,
      x: p.x,
      y: p.y,
      health: state.player.health,
      clockHour: state.clockHour,
    }));
    state.hasSave = true;
  } catch {
    // Storage can be unavailable (private mode): the game plays on unsaved.
  }
}

function applySave(state, save) {
  state.player.money = save.money ?? state.player.money;
  state.missions.index = clamp(save.missionIndex ?? 0, 0, MISSIONS.length);
  state.missions.freeRoam = Boolean(save.freeRoam) || state.missions.index >= MISSIONS.length;
  state.missions.phase = state.missions.freeRoam ? 'done' : 'offer';
  state.player.health = clamp(save.health ?? 100, 30, 100);
  state.clockHour = save.clockHour ?? state.clockHour;
  if (!state.player.inCar) {
    state.player.x = save.x ?? state.player.x;
    state.player.y = save.y ?? state.player.y;
  }
}

function resetWorld(state) {
  const fresh = createState();
  state.cars = fresh.cars;
  state.peds = fresh.peds;
  state.officers = [];
  state.bullets = [];
  state.particles = [];
  state.skidMarks = [];
  state.pickups = [];
  state.floaters = [];
  state.fixerCar = null;
  state.stolenComet = false;
  state.wanted = { heat: 0, stars: 0, seen: false, lastSeenAt: -99 };
  state.arrestProgress = 0;
  state.player.inCar = false;
  state.player.car = null;
  state.player.health = PLAYER.maxHealth;
  state.weapon.ammo = WEAPON.magSize;
  state.weapon.reloading = 0;
}

function startNewGame(state) {
  resetWorld(state);
  state.player.money = PLAYER.startMoney;
  state.player.x = 430;
  state.player.y = 452;
  state.missions = createMissionState();
  state.clockHour = 9.7;
  state.screen = 'playing';
  state.showToast('Welcome to Coral Bay', 'Talk to Mara Voss outside the Coral Diner — follow the blue M marker.', '#37c8d9');
  saveGame(state);
}

function continueGame(state) {
  const save = readSave();
  resetWorld(state);
  state.player.x = 430;
  state.player.y = 452;
  state.missions = createMissionState();
  if (save) applySave(state, save);
  state.screen = 'playing';
  state.showToast('Welcome back to Coral Bay', 'Your money, missions and position were restored from the save.', '#7be382');
}

function respawn(state) {
  const penalty = state.screen === 'busted' ? 0.2 : 0.15;
  state.player.money = Math.max(0, Math.floor(state.player.money * (1 - penalty)));
  if (state.player.inCar) exitCar(state, true);
  state.officers = [];
  state.cars = state.cars.filter((car) => car.kind !== 'police');
  state.wanted = { heat: 0, stars: 0, seen: false, lastSeenAt: -99 };
  state.arrestProgress = 0;
  state.player.health = PLAYER.maxHealth;
  state.player.x = SAFEHOUSE_POS.x;
  state.player.y = SAFEHOUSE_POS.y;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  if (state.missions.phase === 'active') {
    state.missions.active = null;
    state.missions.phase = state.missions.freeRoam ? 'done' : 'offer';
    state.showToast('Back on your feet', 'The mission was dropped. Mara will offer it again.', '#ffb03a');
  }
  state.screen = 'playing';
  saveGame(state);
}

function exitCar(state, thrown = false) {
  const { player } = state;
  const car = player.car;
  if (!car) { player.inCar = false; return; }
  player.x = car.x - Math.sin(car.angle) * 20;
  player.y = car.y + Math.cos(car.angle) * 20;
  if (car.kind === 'player') car.kind = 'parked';
  if (thrown) {
    player.x = car.x + 26;
    player.y = car.y + 10;
  }
  player.inCar = false;
  player.car = null;
  state.sound.doorSlam();
  state.sound.setEngine(false, 0);
}

function enterCar(state, car) {
  const { player } = state;
  const wasParked = car.kind === 'parked';
  car.kind = 'player';
  player.inCar = true;
  player.car = car;
  state.sound.doorSlam();
  if (car.model === 'Comet Cabrio') state.stolenComet = true;
  if (wasParked) {
    state.commitCrime(20, car.x, car.y, 'Grand theft auto!');
    state.showToast('Vehicle stolen', `${car.model} — WASD to drive, F to get out.`, '#ffb03a');
  }
}

/** Screenshot scenes drive themselves: hold a speed and stay on the road. */
function autopilotDrive(state, car, dt) {
  const targetSpeed = state.autopilot.speed;
  car.speed += clamp(targetSpeed - car.speed, -300 * dt, 190 * dt);
  const horizontal = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle));
  let targetAngle = car.angle;
  if (horizontal) {
    const centres = horizontalRoadCentres();
    let nearest = centres[0];
    for (const cy of centres) if (Math.abs(cy - car.y) < Math.abs(nearest - car.y)) nearest = cy;
    const drift = clamp((nearest - car.y) * 0.012, -0.22, 0.22);
    targetAngle = (Math.cos(car.angle) >= 0 ? 0 : Math.PI) + drift * (Math.cos(car.angle) >= 0 ? 1 : -1);
  } else {
    const centres = verticalRoadCentres();
    let nearest = centres[0];
    for (const cx of centres) if (Math.abs(cx - car.x) < Math.abs(nearest - car.x)) nearest = cx;
    const drift = clamp((nearest - car.x) * 0.012, -0.22, 0.22);
    targetAngle = (Math.sin(car.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2) - drift * (Math.sin(car.angle) >= 0 ? 1 : -1);
  }
  car.angle = angleLerp(car.angle, targetAngle, clamp(dt * 2.6, 0, 1));
  moveCar(state, car, dt);
}

function updatePlayer(state, dt) {
  const { player, input } = state;
  if (player.inCar && player.car) {
    if (state.autopilot) autopilotDrive(state, player.car, dt);
    else drivePlayerCar(state, player.car, input, dt);
    player.x = player.car.x;
    player.y = player.car.y;
    if (input.pressed('KeyH')) honkHorn(state);
    if (input.pressed('KeyF') || input.pressed('KeyE')) exitCar(state);
    return;
  }
  const move = input.moveVector();
  const running = input.down('ShiftLeft', 'ShiftRight');
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (move.x !== 0 || move.y !== 0) {
    player.x += move.x * speed * dt;
    player.y += move.y * speed * dt;
    player.wobble += dt * (running ? 13 : 9);
  }
  // Face the mouse: the aim is always where the cursor is.
  player.angle = Math.atan2(state.aimWorld.y - player.y, state.aimWorld.x - player.x);
  const corrected = collideWithBuildings(state.city, player.x, player.y, PLAYER.radius);
  const clamped = clampToWorld(corrected.x, corrected.y, PLAYER.radius, true);
  player.x = clamped.x;
  player.y = clamped.y;

  // Talk to Mara, or start the Beach Sprint, or get into a car.
  if (input.pressed('KeyE')) {
    const nearMara = distance(player.x, player.y, MARA_POS.x, MARA_POS.y) < 52;
    if (nearMara && (state.missions.phase === 'offer' || state.missions.phase === 'dialogue')) {
      talkToMara(state);
    } else {
      const car = nearestEnterableCar(state, PLAYER.reach);
      if (car) enterCar(state, car);
    }
  }
  if (input.pressed('KeyF')) {
    const car = nearestEnterableCar(state, PLAYER.reach);
    if (car) enterCar(state, car);
  }
  if (input.pressed('KeyB')) tryStartSprint(state);
  if (input.pressed('KeyH')) honkHorn(state);
  // Shooting and reloading.
  if (input.mouseDown) playerShoot(state, state.aimWorld.x, state.aimWorld.y);
  if (input.pressed('KeyR')) startReload(state);
}

/** H: a horn blast. Pedestrians startle; police very close by take notice. */
function honkHorn(state) {
  state.sound.horn();
  const p = state.playerPos();
  for (const ped of state.peds) {
    if (distance(ped.x, ped.y, p.x, p.y) < 90) {
      startlePedestrian(ped, p.x, p.y);
    }
  }
  for (const car of state.cars) {
    if (car.kind === 'police' && distance(car.x, car.y, p.x, p.y) < 130) {
      state.commitCrime(3, p.x, p.y, null);
      break;
    }
  }
}

function updateParticles(state, dt) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.92;
    particle.vy *= 0.92;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const mark of state.skidMarks) mark.life -= dt;
  state.skidMarks = state.skidMarks.filter((m) => m.life > 0);
}

function updateObjectives(state) {
  state.missionTargetPos = currentTarget(state);
  const missions = state.missions;
  if (missions.sprint) {
    state.objectiveText = `Beach Sprint — ring ${missions.sprint.next + 1} of 4`;
  } else if (missions.phase === 'offer' && !missions.freeRoam) {
    const next = MISSIONS[missions.index];
    state.objectiveText = next ? `Talk to Mara — "${next.title}"` : null;
  } else if (missions.phase === 'dialogue') {
    state.objectiveText = 'Talking to Mara…';
  } else if (missions.phase === 'active') {
    const step = missions.active.steps[missions.stepIndex];
    state.objectiveText = step ? step.text : null;
  } else if (missions.freeRoam) {
    state.objectiveText = 'Free roam — Coral Bay is yours. B starts the Beach Sprint down south.';
  } else {
    state.objectiveText = null;
  }
  state.promptText = missionOfferPrompt(state);
  if (!state.promptText && !state.player.inCar) {
    const car = nearestEnterableCar(state, PLAYER.reach);
    if (car) state.promptText = `E — Get in the ${car.model}`;
  } else if (!state.promptText && state.player.inCar) {
    state.promptText = 'F — Get out · H — Horn';
  }
}

function updatePlaying(state, dt, staged = false) {
  state.time += dt;
  state.clockHour = (state.clockHour + (dt * 0.85) / 60) % 24;

  state.aimWorld = {
    x: state.input.mouseX - VIEW.width / 2 + state.camera.x,
    y: state.input.mouseY - VIEW.height / 2 + state.camera.y,
  };

  const healthBefore = state.player.health;
  if (staged) {
    // Staged scenes: the player is a prop; the world still lives.
    if (state.player.inCar && state.player.car && state.autopilot) {
      autopilotDrive(state, state.player.car, dt);
      state.player.x = state.player.car.x;
      state.player.y = state.player.car.y;
    }
  } else {
    updatePlayer(state, dt);
  }
  updateWeapon(state, dt);
  updateMissions(state, dt);

  for (const car of state.cars) {
    if (car.kind === 'traffic') updateTrafficCar(state, car, dt);
  }
  for (const ped of state.peds) updatePedestrian(state, ped, dt);
  updatePolice(state, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  updateParticles(state, dt);
  updateObjectives(state);

  // Pedestrians vs the player's own car (updatePedestrian covers traffic).
  if (state.player.inCar && state.player.car && Math.abs(state.player.car.speed) > 55) {
    for (const ped of state.peds) {
      if (ped.state !== 'down' && distance(ped.x, ped.y, state.player.car.x, state.player.car.y) < 24) {
        knockDownPedestrian(state, ped, state.player.car);
      }
    }
  }

  // Sirens and engine notes follow the action.
  const anyPolice = state.cars.some((c) => c.kind === 'police' && !c.dead) || state.officers.some((o) => o.state !== 'down');
  state.sound.setSiren(anyPolice && state.wanted.stars > 0, dt);
  if (state.player.inCar && state.player.car) {
    state.sound.setEngine(true, Math.abs(state.player.car.speed) / 344);
  } else {
    state.sound.setEngine(false, 0);
  }

  if (state.player.health < healthBefore) {
    state.lastHurtAt = state.time;
    state.damageFlash = 1;
  }
  state.damageFlash = Math.max(0, state.damageFlash - dt * 2.4);
  if (state.wanted.stars === 0 && state.time - (state.lastHurtAt || -99) > 6) {
    state.player.health = Math.min(PLAYER.maxHealth, state.player.health + 2.2 * dt);
  }
  if (state.player.health <= 0 && state.screen === 'playing') {
    state.screen = 'wasted';
    state.sound.setEngine(false, 0);
    state.sound.setSiren(false, 0);
  }
  if (state.toast) {
    state.toast.life -= dt;
    if (state.toast.life <= 0) state.toast = null;
  }
  state.shake = Math.max(0, state.shake - dt * 1.8);
  updateCamera(state, dt);
}

function handleClicks(state) {
  const { input } = state;
  if (!input.clicked) return;
  state.sound.unlock();
  const { clickX: x, clickY: y } = input;
  if (state.screen === 'title') {
    if (pointInRect(x, y, BUTTONS.title.newGame)) startNewGame(state);
    else if (state.hasSave && pointInRect(x, y, BUTTONS.title.continueGame)) continueGame(state);
  } else if (state.screen === 'paused') {
    if (pointInRect(x, y, BUTTONS.pause.resume)) state.screen = 'playing';
    else if (pointInRect(x, y, BUTTONS.pause.saveQuit)) {
      saveGame(state);
      state.screen = 'title';
    }
  } else if (state.screen === 'busted' || state.screen === 'wasted') {
    if (pointInRect(x, y, BUTTONS.end.respawn)) respawn(state);
  }
}

function draw(state) {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  if (state.shake > 0 && state.screen === 'playing') {
    const s = state.shake * 9;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawWorld(ctx, state);
  ctx.restore();

  if (state.screen === 'title') {
    drawTitleScreen(ctx, state, {
      newGame: BUTTONS.title.newGame,
      continueGame: BUTTONS.title.continueGame,
    });
    return;
  }
  drawHud(ctx, state);
  if (state.screen === 'paused') drawPauseScreen(ctx, state, BUTTONS.pause);
  if (state.screen === 'busted' || state.screen === 'wasted') drawEndScreen(ctx, state, BUTTONS.end);
}

const state = createState();
if (shotName) {
  stageShot(state, shotName);
} else {
  state.camera.x = 430;
  state.camera.y = 430;
}
window.__coralBay = state;
window.__shotReady = Boolean(shotName);

let lastTimestamp = 0;
let accumulator = 0;
function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!lastTimestamp) lastTimestamp = timestamp;
  let elapsed = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;

  handleClicks(state);
  const { input } = state;
  if (input.pressed('KeyM')) state.sound.setMuted(!state.sound.muted);
  if (input.down('KeyW', 'KeyA', 'KeyS', 'KeyD') || input.clicked) state.sound.unlock();
  if (state.screen === 'playing' && (input.pressed('KeyP') || input.pressed('Escape'))) {
    state.screen = 'paused';
    saveGame(state);
  } else if (state.screen === 'paused' && (input.pressed('KeyP') || input.pressed('Escape'))) {
    state.screen = 'playing';
  }
  if (state.screen === 'title' && (input.pressed('Enter') || input.pressed('Space'))) {
    state.sound.unlock();
    startNewGame(state);
  }

  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (shotName) {
      // A staged scene is a frozen frame: the world was already run forward
      // by stageShot, and the screenshot must show exactly that moment.
      accumulator = 0;
      break;
    }
    if (state.screen === 'playing') {
      updatePlaying(state, STEP);
    } else if (state.screen === 'title') {
      state.time += STEP;
      for (const car of state.cars) if (car.kind === 'traffic') updateTrafficCar(state, car, STEP);
      for (const ped of state.peds) updatePedestrian(state, ped, STEP);
      updateParticles(state, STEP);
    }
  }
  draw(state);
  input.endFrame();
}
requestAnimationFrame(frame);
