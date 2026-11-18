// Coral Bay — small deterministic random helpers.
// The city and every staged screenshot scene come from one seeded generator,
// so a given seed always builds the same Coral Bay.

/** A mulberry32 generator: tiny, fast, and good enough for a city. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Pick a colour and vary its lightness a touch, for building variety. */
export function jitterColor(rng, hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 + (rng() * 2 - 1) * amount;
  const channel = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * clamp(t, 0, 1);
}
