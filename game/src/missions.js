// Coral Bay — missions and story. Mara Voss, who runs the Coral Diner,
// is sitting on a smuggling ledger the whole bay wants. Six missions chain
// from a first stolen car to a five-star run to the harbourmaster, each
// with dialogue, an objective marker and a cash reward. Between jobs, the
// Beach Sprint pays out for fast feet along the promenade.

import { BEACH, SPRINT } from './config.js';
import { clamp, distance } from './random.js';
import { makeCar } from './vehicles.js';

export const MARA_POS = { x: 430, y: 352 };
export const SAFEHOUSE_POS = { x: 218, y: 1172 };

const LEDGER_POS = { x: 1052, y: 300 };
const BANK_DROP = { x: 830, y: 96 };
const FIXER_START = { x: 1320, y: 640 };
const PIER_POS = { x: 2108, y: 620 };
const SPRINT_START = { x: BEACH.promenadeX, y: 1080 };

export const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 120,
    intro: [
      'Mara: You look like trouble with no ride. I like that.',
      'Mara: Steal me the red Comet Cabrio from the lot behind this diner. Quietly, if you can.',
    ],
    steps: [
      { type: 'steal', text: 'Steal the red Comet Cabrio by the diner corner', x: 404, y: 300 },
      { type: 'goto', text: 'Bring the Comet back to Mara', x: MARA_POS.x, y: MARA_POS.y },
    ],
    outro: 'Mara: Not a scratch worth mentioning. You just got hired.',
  },
  {
    title: 'The Ledger',
    reward: 200,
    intro: [
      'Mara: My ledger — every debt on this bay — is in a lockbox by the Marina Bank.',
      'Mara: Pick it up. If the law notices, that is your problem, not mine.',
    ],
    steps: [
      { type: 'goto', text: 'Pick up the ledger at Marina Bank', x: LEDGER_POS.x, y: LEDGER_POS.y },
      { type: 'goto', text: 'Bring the ledger back to Mara', x: MARA_POS.x, y: MARA_POS.y },
    ],
    outro: 'Mara: The Tide Ledger. Half the bay owes me now. The other half owes you trouble.',
  },
  {
    title: 'Ninety-Five Seconds',
    reward: 320,
    intro: [
      'Mara: A buyer at the bank drop gets cold feet in ninety-five seconds. Move.',
    ],
    steps: [
      { type: 'goto', text: 'Deliver the ledger to the Marina Bank drop — hurry!', x: BANK_DROP.x, y: BANK_DROP.y, timer: 95 },
    ],
    outro: 'Mara: Ninety-five seconds. You used most of them showing off, I hear.',
  },
  {
    title: 'The Fixer',
    reward: 420,
    intro: [
      'Mara: A fixer named Aldo is running my copy of the ledger across town.',
      'Mara: Stop his car. Ram it, shoot it, park on it — I do not care how.',
    ],
    steps: [
      { type: 'stopcar', text: "Stop the fixer's car", x: FIXER_START.x, y: FIXER_START.y },
      { type: 'goto', text: 'Return to Mara', x: MARA_POS.x, y: MARA_POS.y },
    ],
    outro: 'Mara: Aldo walked home. The ledger stays mine. You are earning your cut.',
  },
  {
    title: 'Heat Wave',
    reward: 520,
    intro: [
      'Mara: The CBPD is sweeping the bay for you tonight. Rude.',
      'Mara: Lose the police — all of them — then come back here in one piece.',
    ],
    steps: [
      { type: 'escape', text: 'Lose the police, then return to Mara', x: MARA_POS.x, y: MARA_POS.y },
    ],
    outro: 'Mara: Not a star in the sky. Beautiful. One last job, and it is the big one.',
  },
  {
    title: 'Tide Ledger Finale',
    reward: 900,
    intro: [
      'Mara: The harbourmaster at the end of the pier buys the ledger tonight.',
      'Mara: Every cop on the bay will try to stop you. Five stars, sweetheart. Earn them.',
    ],
    steps: [
      { type: 'goto', text: 'Take the ledger to the harbourmaster at the pier', x: PIER_POS.x, y: PIER_POS.y },
    ],
    outro: 'Mara: Paid in full. Coral Bay is ours — go enjoy it. The bay is your free roam now.',
  },
];

export function createMissionState() {
  return {
    index: 0,
    phase: 'offer', // offer | dialogue | active | done
    dialogue: [],
    dialogueIndex: 0,
    active: null,
    stepIndex: 0,
    stepTimer: null,
    freeRoam: false,
    sprint: null,
  };
}

export function currentMission(state) {
  return MISSIONS[state.missions.index] || null;
}

/** The world position the HUD should mark right now, or null. */
export function currentTarget(state) {
  const m = state.missions;
  if (m.sprint) {
    const ring = m.sprint.rings[m.sprint.next];
    return ring ? { x: ring.x, y: ring.y } : null;
  }
  if (m.phase === 'offer' && !m.freeRoam) return { x: MARA_POS.x, y: MARA_POS.y };
  if (m.phase === 'active' && m.active) {
    const step = m.active.steps[m.stepIndex];
    if (!step) return null;
    if (step.type === 'stopcar' && state.fixerCar && !state.fixerCar.dead) {
      return { x: state.fixerCar.x, y: state.fixerCar.y };
    }
    return { x: step.x, y: step.y };
  }
  return null;
}

export function missionOfferPrompt(state) {
  const m = state.missions;
  if (state.player.inCar) return null;
  const d = distance(state.player.x, state.player.y, MARA_POS.x, MARA_POS.y);
  if (d > 52) return null;
  if (m.phase === 'offer' && !m.freeRoam) return `E — Talk to Mara: "${currentMission(state).title}"`;
  if (m.phase === 'dialogue') return 'E — Continue';
  if (m.freeRoam) return 'Mara: The bay is yours. B starts the Beach Sprint, down south.';
  return null;
}

/** The player pressed the talk key near Mara: advance offer/dialogue. */
export function talkToMara(state) {
  const m = state.missions;
  if (m.phase === 'offer' && !m.freeRoam) {
    const mission = currentMission(state);
    m.phase = 'dialogue';
    m.dialogue = mission.intro;
    m.dialogueIndex = 0;
    return;
  }
  if (m.phase === 'dialogue') {
    m.dialogueIndex += 1;
    if (m.dialogueIndex >= m.dialogue.length) startMission(state);
  }
}

function startMission(state) {
  const m = state.missions;
  const mission = currentMission(state);
  m.active = mission;
  m.phase = 'active';
  m.stepIndex = 0;
  armStepTimer(state);
  if (mission.title === 'The Fixer') spawnFixerCar(state);
  if (mission.title === 'Heat Wave') state.commitCrime(150, state.player.x, state.player.y, 'The sweep is on!');
  if (mission.title === 'Tide Ledger Finale') state.commitCrime(300, state.player.x, state.player.y, 'Five stars. Earn them.');
  state.showToast(mission.title, mission.steps[0].text, '#37c8d9');
}

function armStepTimer(state) {
  const m = state.missions;
  const step = m.active ? m.active.steps[m.stepIndex] : null;
  m.stepTimer = step && step.timer ? step.timer : null;
}

function completeStep(state) {
  const m = state.missions;
  const step = m.active.steps[m.stepIndex];
  if (step && step.type === 'goto' && m.stepIndex === m.active.steps.length - 1) {
    state.dropCash(state.player.x + 20, state.player.y);
  }
  m.stepIndex += 1;
  if (m.stepIndex >= m.active.steps.length) {
    completeMission(state);
  } else {
    armStepTimer(state);
    const next = m.active.steps[m.stepIndex];
    state.showToast('Objective updated', next.text, '#37c8d9');
    state.sound.checkpoint();
  }
}

function completeMission(state) {
  const m = state.missions;
  const mission = m.active;
  state.player.money += mission.reward;
  state.floaters.push({ x: state.player.x, y: state.player.y - 24, text: `+$${mission.reward}`, life: 1.8, color: '#7be382' });
  state.showToast('Mission complete', `${mission.title} — $${mission.reward}`, '#7be382');
  state.dialogue = [mission.outro];
  state.sound.missionDone();
  m.index += 1;
  m.active = null;
  m.stepTimer = null;
  if (m.index >= MISSIONS.length) {
    m.freeRoam = true;
    m.phase = 'done';
  } else {
    m.phase = 'offer';
  }
  state.saveGame();
}

function failMission(state, reason) {
  const m = state.missions;
  state.showToast('Mission failed', reason, '#ff5147');
  m.active = null;
  m.stepTimer = null;
  m.phase = 'offer';
  state.fixerCar = null;
}

function spawnFixerCar(state) {
  const car = makeCar(FIXER_START.x, FIXER_START.y, 0, 'fleeing', state.rng);
  car.color = '#222831';
  car.model = "Fixer's Saloon";
  car.cruiseSpeed = 235;
  car.speed = 150;
  state.cars.push(car);
  state.fixerCar = car;
}

/** Called when the fixer's car is wrecked (from combat/vehicles damage). */
export function missionTargetHit(state, car) {
  const m = state.missions;
  if (!m.active || m.phase !== 'active') return;
  const step = m.active.steps[m.stepIndex];
  if (step && step.type === 'stopcar' && car === state.fixerCar) {
    state.showToast('Target stopped', "The fixer won't be running anything else.", '#7be382');
    completeStep(state);
  }
}

/** The fleeing fixer drives the grid and avoids the player, badly. */
export function updateFixerCar(state, dt) {
  const car = state.fixerCar;
  if (!car || car.dead) return;
  const m = state.missions;
  if (!m.active || m.active.title !== 'The Fixer') return;
  const p = state.playerPos();
  const away = Math.atan2(car.y - p.y, car.x - p.x);
  // Snap the escape to the nearest road direction so it stays on the grid.
  const snapped = Math.round(away / (Math.PI / 2)) * (Math.PI / 2);
  car.angle += clamp(((snapped - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -2.4 * dt, 2.4 * dt);
  car.speed += clamp(225 - car.speed, -200 * dt, 160 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 40, 1560);
  car.y = clamp(car.y, 40, 1230);
}

/** Beach Sprint: B near the start ring begins a 4-ring promenade time trial. */
export function tryStartSprint(state) {
  const m = state.missions;
  if (m.sprint || state.player.inCar) return false;
  if (distance(state.player.x, state.player.y, SPRINT_START.x, SPRINT_START.y) > 60) return false;
  const rings = [];
  for (let i = 0; i < SPRINT.checkpoints; i += 1) {
    rings.push({ x: BEACH.promenadeX, y: 1080 - i * 265 });
  }
  m.sprint = { rings, next: 0, timeLeft: SPRINT.seconds };
  state.showToast('Beach Sprint!', 'Hit every ring before the clock runs out!', '#ffb03a');
  state.sound.checkpoint();
  return true;
}

function updateSprint(state, dt) {
  const sprint = state.missions.sprint;
  if (!sprint) return;
  sprint.timeLeft -= dt;
  if (sprint.timeLeft <= 0) {
    state.missions.sprint = null;
    state.showToast('Sprint failed', 'Out of time. The rings reset — try again.', '#ff5147');
    return;
  }
  const ring = sprint.rings[sprint.next];
  if (ring && distance(state.player.x, state.player.y, ring.x, ring.y) < 42) {
    sprint.next += 1;
    state.sound.checkpoint();
    state.spawnParticles(ring.x, ring.y, 12, '#ffb03a', 90, 0.5);
    if (sprint.next >= sprint.rings.length) {
      const pay = SPRINT.basePay + Math.round(sprint.timeLeft) * 2;
      state.player.money += pay;
      state.floaters.push({ x: state.player.x, y: state.player.y - 24, text: `Sprint +$${pay}`, life: 1.8, color: '#7be382' });
      state.showToast('Sprint complete!', `$${pay} — the promenade crowd loves it.`, '#7be382');
      state.sound.missionDone();
      state.missions.sprint = null;
      state.saveGame();
    }
  }
}

export function updateMissions(state, dt) {
  updateFixerCar(state, dt);
  updateSprint(state, dt);
  const m = state.missions;
  if (m.phase !== 'active' || !m.active) return;

  if (m.stepTimer !== null) {
    m.stepTimer -= dt;
    if (m.stepTimer <= 0) {
      failMission(state, 'Out of time. Mara is not pleased.');
      return;
    }
  }

  const step = m.active.steps[m.stepIndex];
  if (!step) return;
  const p = state.playerPos();

  if (step.type === 'goto' || step.type === 'pickup') {
    if (distance(p.x, p.y, step.x, step.y) < 46) completeStep(state);
  } else if (step.type === 'steal') {
    if (state.player.inCar && state.player.car && state.player.car.model === 'Comet Cabrio' && state.stolenComet) {
      completeStep(state);
    }
  } else if (step.type === 'escape') {
    if (state.wanted.stars === 0 && distance(p.x, p.y, step.x, step.y) < 52 && !state.player.inCar) {
      completeStep(state);
    } else if (state.wanted.stars === 0 && distance(p.x, p.y, step.x, step.y) < 52 && state.player.inCar) {
      // Arriving still in a car is fine too, as long as the heat is gone.
      completeStep(state);
    }
  }
}
