// Coral Bay — every tuning number and colour in one place.
// The view is a fixed 1280x720 logical area; the renderer scales the canvas
// to the window, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** City layout: a 6 by 5 grid of blocks separated by two-lane roads. */
export const CITY = {
  cols: 6,
  rows: 5,
  roadWidth: 96,
  pitchX: 264,
  pitchY: 248,
  firstRoadX: 140,
  firstRoadY: 140,
  /** Right edge of the asphalt city; the beach starts here. */
  edgeX: 1600,
};

export const BEACH = {
  sandFrom: CITY.edgeX,
  promenadeX: 1708,
  sandTo: 1900,
  pierY: 620,
  pierFrom: 1900,
  pierTo: 2140,
};

export const WORLD = {
  width: 2240,
  height: 1272,
};

export const PLAYER = {
  radius: 11,
  walkSpeed: 128,
  runSpeed: 218,
  maxHealth: 100,
  reach: 46,
  startMoney: 25,
};

export const CAR = {
  length: 44,
  width: 22,
  maxSpeed: 348,
  maxReverse: -92,
  accel: 235,
  brake: 330,
  drag: 0.55,
  turnRate: 2.35,
  maxHealth: 100,
  trafficCount: 15,
  parkedCount: 17,
};

export const WANTED = {
  maxHeat: 320,
  /** Heat needed for stars 1..5. */
  starThresholds: [22, 62, 118, 188, 262],
  decayPerSecond: 3.4,
  policeCarInterval: 4.6,
  officerInterval: 7.5,
  arrestSeconds: 2.4,
  roadblockStars: 4,
};

export const WEAPON = {
  name: 'Harbour Pistol',
  magSize: 12,
  reloadSeconds: 1.15,
  cooldown: 0.21,
  damage: 34,
  range: 460,
  spread: 0.035,
};

export const CASH_PICKUP = { value: 25, radius: 15, lifeSeconds: 45, dropChance: 0.55 };

export const SPRINT = { seconds: 62, checkpoints: 4, basePay: 90 };

/** Game-clock hours where the light changes character. */
export const DAYLIGHT = {
  dawnHour: 6.5,
  noonHour: 12,
  duskHour: 17.5,
  nightHour: 20.5,
  headlightsFrom: 17.2,
  headlightsTo: 7.2,
};

export const SAVE_KEY = 'coral-bay.save.v2';

export const PALETTE = {
  sea: '#1d7f96',
  seaDeep: '#16677c',
  sand: '#ecd28f',
  promenade: '#d9c39a',
  asphalt: '#33373d',
  asphaltDark: '#2b2f34',
  lane: '#e8e3c8',
  sidewalk: '#b9b3a4',
  blockBase: '#cfc7b4',
  grass: '#79b657',
  parkPath: '#d9cfae',
  pier: '#9a7b58',
  text: '#f4f1e8',
  panel: 'rgba(12,16,22,0.78)',
  accent: '#ffb03a',
  danger: '#ff5147',
  good: '#7be382',
  info: '#37c8d9',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
