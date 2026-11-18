// Coral Bay — the city itself: a seeded 6x5 grid of blocks between two-lane
// roads, with named shops, downtown towers, a park, parking lots, and the
// beach, promenade, pier and sea to the east. Everything the renderer draws
// and everything that collides comes from the object built here.

import { BEACH, CITY, WORLD } from './config.js';
import { jitterColor, pick, randInt, randRange } from './random.js';

const SHOP_TYPES = [
  { kind: 'diner', sign: 'Coral Diner', color: '#e2703a' },
  { kind: 'bank', sign: 'Marina Bank', color: '#4a7fb5' },
  { kind: 'barbers', sign: 'Bay Barbers', color: '#c94f6d' },
  { kind: 'jewels', sign: 'Tide Jewels', color: '#8e6cc8' },
  { kind: 'hotel', sign: 'Palma Hotel', color: '#d9a441' },
  { kind: 'pharmacy', sign: 'Bay Pharmacy', color: '#4fae62' },
  { kind: 'bakery', sign: 'Bay Bakery', color: '#cf7d4e' },
  { kind: 'arcade', sign: 'Coral Arcade', color: '#3fa7a0' },
  { kind: 'surf', sign: 'Surf Shack', color: '#e08bb0' },
  { kind: 'books', sign: 'Coral Books', color: '#7a9e43' },
  { kind: 'laundry', sign: 'Tide Laundry', color: '#5b8dd9' },
  { kind: 'bar', sign: 'Flamingo Bar', color: '#d95763' },
  { kind: 'market', sign: 'Mangrove Market', color: '#69a84f' },
  { kind: 'optics', sign: 'Bay Optics', color: '#6d7fc4' },
  { kind: 'rentals', sign: 'Pier Rentals', color: '#b5894a' },
  { kind: 'inn', sign: 'Pelican Inn', color: '#a05f9e' },
];

const ROOF_COLORS = ['#d96f4e', '#5b8dd9', '#f2c94c', '#58b368', '#b565a7', '#e58e4e', '#4fb0c6', '#d95f76'];

/** Centre line of the col-th vertical road. */
export function verticalRoadCentre(col) {
  return CITY.firstRoadX + col * CITY.pitchX;
}

/** Centre line of the row-th horizontal road. */
export function horizontalRoadCentre(row) {
  return CITY.firstRoadY + row * CITY.pitchY;
}

export function verticalRoadCentres() {
  const centres = [];
  for (let col = 0; col < CITY.cols; col += 1) centres.push(verticalRoadCentre(col));
  return centres;
}

export function horizontalRoadCentres() {
  const centres = [];
  for (let row = 0; row < CITY.rows; row += 1) centres.push(horizontalRoadCentre(row));
  return centres;
}

/** The city block between roads: col/row index the gap, not the road. */
export function blockRect(col, row) {
  const x0 = verticalRoadCentre(col) + CITY.roadWidth / 2;
  const x1 = col + 1 < CITY.cols ? verticalRoadCentre(col + 1) - CITY.roadWidth / 2 : CITY.edgeX;
  const y0 = horizontalRoadCentre(row) + CITY.roadWidth / 2;
  const y1 = row + 1 < CITY.rows ? horizontalRoadCentre(row + 1) - CITY.roadWidth / 2 : WORLD.height;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function isOnRoad(x, y) {
  if (x >= CITY.edgeX) return false;
  for (const cx of verticalRoadCentres()) if (Math.abs(x - cx) < CITY.roadWidth / 2) return true;
  for (const cy of horizontalRoadCentres()) if (Math.abs(y - cy) < CITY.roadWidth / 2) return true;
  return false;
}

/**
 * Build the whole city from the seed. Returns buildings (solid, signed),
 * city blocks, trees, lamps, and the special places other systems use.
 */
export function buildCity(rng) {
  const buildings = [];
  const blocks = [];
  const trees = [];
  const lamps = [];

  for (let col = 0; col < CITY.cols; col += 1) {
    for (let row = 0; row < CITY.rows; row += 1) {
      const rect = blockRect(col, row);
      const isPark = col === 2 && row === 2;
      const isLot = (col === 4 && row === 1) || (col === 1 && row === 3);
      const downtown = col >= 1 && col <= 2 && row >= 0 && row <= 1;
      blocks.push({ ...rect, col, row, kind: isPark ? 'park' : isLot ? 'lot' : 'buildings' });

      if (isPark) {
        for (let i = 0; i < 9; i += 1) {
          trees.push({
            x: rect.x + randRange(rng, 18, rect.w - 18),
            y: rect.y + randRange(rng, 18, rect.h - 18),
            r: randRange(rng, 11, 17),
          });
        }
        continue;
      }
      if (isLot) continue;

      // Two buildings per block, split along the longer side, inset from the kerb.
      const inset = 14;
      const horizontalSplit = rect.w >= rect.h;
      for (let i = 0; i < 2; i += 1) {
        const shop = SHOP_TYPES[(col * 7 + row * 3 + i * 5) % SHOP_TYPES.length];
        let bx;
        let by;
        let bw;
        let bh;
        if (horizontalSplit) {
          bw = (rect.w - inset * 2 - 10) / 2;
          bh = rect.h - inset * 2;
          bx = rect.x + inset + i * (bw + 10);
          by = rect.y + inset;
        } else {
          bw = rect.w - inset * 2;
          bh = (rect.h - inset * 2 - 10) / 2;
          bx = rect.x + inset;
          by = rect.y + inset + i * (bh + 10);
        }
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          kind: shop.kind,
          sign: shop.sign,
          color: jitterColor(rng, shop.color, 0.08),
          roof: jitterColor(rng, pick(rng, ROOF_COLORS), 0.06),
          floors: downtown ? randInt(rng, 5, 9) : randInt(rng, 1, 3),
          tower: downtown,
        });
      }
    }
  }

  // Palms along the promenade and the park paths.
  for (let y = 60; y < WORLD.height - 40; y += 118) {
    trees.push({ x: BEACH.promenadeX - 64, y: y + randRange(rng, -14, 14), r: randRange(rng, 12, 16), palm: true });
    trees.push({ x: BEACH.promenadeX + 64, y: y + 60, r: randRange(rng, 12, 16), palm: true });
  }
  // Street lamps at every intersection corner.
  for (const cx of verticalRoadCentres()) {
    for (const cy of horizontalRoadCentres()) {
      lamps.push({ x: cx - CITY.roadWidth / 2 - 7, y: cy - CITY.roadWidth / 2 - 7 });
      lamps.push({ x: cx + CITY.roadWidth / 2 + 7, y: cy + CITY.roadWidth / 2 + 7 });
    }
  }

  return {
    buildings,
    blocks,
    trees,
    lamps,
    dinerPos: { x: verticalRoadCentre(1) + 30, y: horizontalRoadCentre(1) - 74 },
    safehousePos: { x: verticalRoadCentre(0) + 78, y: horizontalRoadCentre(4) + 30 },
    bankPos: { x: verticalRoadCentre(3) + 96, y: horizontalRoadCentre(0) - 40 },
    pierPos: { x: BEACH.pierTo - 30, y: BEACH.pierY },
    sprintStartPos: { x: BEACH.promenadeX, y: 1080 },
  };
}

/** Push a circle (the player, a pedestrian) out of every building rect. */
export function collideWithBuildings(city, x, y, radius) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(nx, b.x + b.w));
    const closestY = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - closestX;
    const dy = ny - closestY;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        nx = closestX + (dx / d) * radius;
        ny = closestY + (dy / d) * radius;
      } else {
        // Centre inside the rect: push out along the smallest exit.
        const left = nx - b.x;
        const right = b.x + b.w - nx;
        const top = ny - b.y;
        const bottom = b.y + b.h - ny;
        const min = Math.min(left, right, top, bottom);
        if (min === left) nx = b.x - radius;
        else if (min === right) nx = b.x + b.w + radius;
        else if (min === top) ny = b.y - radius;
        else ny = b.y + b.h + radius;
      }
    }
  }
  return { x: nx, y: ny };
}

/** True when a circle overlaps any building (used for car impacts). */
export function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(x, b.x + b.w));
    const closestY = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** Keep an entity inside the world and out of the sea (unless on the pier). */
export function clampToWorld(x, y, radius, onFoot) {
  let nx = Math.max(radius, Math.min(WORLD.width - radius, x));
  let ny = Math.max(radius, Math.min(WORLD.height - radius, y));
  const onPier = Math.abs(ny - BEACH.pierY) < 26 && nx > BEACH.sandTo - 10;
  if (nx > BEACH.sandTo && !onPier) nx = BEACH.sandTo;
  if (!onFoot && nx > CITY.edgeX + 210) nx = CITY.edgeX + 210;
  return { x: nx, y: ny };
}
