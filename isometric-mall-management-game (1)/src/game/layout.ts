import type { FurnitureKind, Layout, PlaceableKind, Placement, Shop } from './data';
import { SHOP_EXPANSIONS } from './data';

export interface Tile { x: number; y: number }

/** The shop floor is a fixed grid of 9 × 7 tiles. */
export const GRID_W = 9;
export const GRID_H = 7;
/** The floor tiles are drawn slightly above the base of the shop. */
export const FLOOR_Z = 0.37;
/** Tiles in front of the entrance. Customers walk in and out here. */
export const DOOR_TILES: Tile[] = [{ x: 7, y: 6 }, { x: 8, y: 6 }];

export interface Grid { w: number; h: number }

/** The smallest sales floor. */
export const BASE_GRID: Grid = { w: GRID_W, h: GRID_H };

/** Every enlargement adds tiles to the right of the floor. */
export function gridFor(expansions: number): Grid {
  const level = Math.max(0, Math.min(SHOP_EXPANSIONS.length, Math.floor(expansions || 0)));
  return { w: GRID_W + SHOP_EXPANSIONS.slice(0, level).reduce((sum, step) => sum + step.width, 0), h: GRID_H };
}

/** The sales floor of a shop, including its enlargements. */
export const gridOf = (shop: Shop): Grid => gridFor(shop.expansions ?? 0);

export const PLACEABLE_ORDER: PlaceableKind[] = ['showcase', 'center', 'materials', 'register', 'shelf', 'workbench', 'decor'];
export const SINGLETONS: PlaceableKind[] = ['showcase', 'center', 'materials', 'register'];
/**
 * Everything with a rectangular footprint can be turned by 90 degrees; only the
 * square decor tile looks the same in both directions.
 */
export const ROTATABLE: PlaceableKind[] = ['showcase', 'center', 'materials', 'register', 'shelf', 'workbench'];

export const FOOTPRINTS: Record<PlaceableKind, { w: number; d: number }> = {
  showcase: { w: 3, d: 1 },
  center: { w: 2, d: 1 },
  materials: { w: 1, d: 2 },
  register: { w: 3, d: 1 },
  shelf: { w: 2, d: 1 },
  workbench: { w: 2, d: 1 },
  decor: { w: 1, d: 1 },
};

export const PLACE_LABELS: Record<PlaceableKind, string> = {
  showcase: 'Auslage',
  center: 'Mittelvitrine',
  materials: 'Rohstoffregal',
  register: 'Kasse',
  shelf: 'Regal',
  workbench: 'Arbeitsplatz',
  decor: 'Deko',
};

/** Default arrangement: keeps the aisles open and the entrance clear. */
const DEFAULTS: Record<string, Placement> = {
  'showcase-0': { x: 2, y: 2, rot: 0 },
  'center-0': { x: 5, y: 3, rot: 0 },
  'materials-0': { x: 5, y: 1, rot: 0 },
  'register-0': { x: 1, y: 5, rot: 0 },
  'shelf-0': { x: 0, y: 0, rot: 0 },
  'shelf-1': { x: 2, y: 0, rot: 0 },
  'shelf-2': { x: 4, y: 0, rot: 0 },
  'shelf-3': { x: 0, y: 4, rot: 1 },
  'shelf-4': { x: 2, y: 4, rot: 0 },
  'workbench-0': { x: 6, y: 0, rot: 0 },
  'workbench-1': { x: 8, y: 1, rot: 1 },
  'workbench-2': { x: 8, y: 3, rot: 1 },
  'decor-0': { x: 0, y: 6, rot: 0 },
  'decor-1': { x: 6, y: 6, rot: 0 },
  'decor-2': { x: 5, y: 6, rot: 0 },
  'decor-3': { x: 0, y: 2, rot: 0 },
};

export const tileKey = (tile: Tile) => `${tile.x},${tile.y}`;
export const isDoorTile = (tile: Tile) => DOOR_TILES.some(door => door.x === tile.x && door.y === tile.y);
export const rotatable = (kind: PlaceableKind) => ROTATABLE.includes(kind);

export function pieceCount(shop: Shop, kind: PlaceableKind): number {
  if (SINGLETONS.includes(kind) || !(kind in shop.furniture)) return 1;
  return Math.max(0, Math.floor(shop.furniture[kind as FurnitureKind] || 0));
}

export interface Piece { id: string; kind: PlaceableKind; index: number }

export function piecesOf(shop: Shop): Piece[] {
  const list: Piece[] = [];
  PLACEABLE_ORDER.forEach(kind => {
    const count = pieceCount(shop, kind);
    for (let index = 0; index < count; index++) list.push({ id: `${kind}-${index}`, kind, index });
  });
  return list;
}

export function footprint(kind: PlaceableKind, rot: 0 | 1 = 0) {
  const size = FOOTPRINTS[kind];
  return rot === 1 && rotatable(kind) ? { w: size.d, d: size.w } : { ...size };
}

export function tilesOf(place: Placement, kind: PlaceableKind): Tile[] {
  const { w, d } = footprint(kind, place.rot);
  const tiles: Tile[] = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) tiles.push({ x: place.x + dx, y: place.y + dy });
  return tiles;
}

export function insideGrid(place: Placement, kind: PlaceableKind, grid: Grid = BASE_GRID) {
  const { w, d } = footprint(kind, place.rot);
  return place.x >= 0 && place.y >= 0 && place.x + w <= grid.w && place.y + d <= grid.h;
}

/** Collects all tiles taken by pieces of a layout, ignoring one optional piece. */
export function occupiedTiles(layout: Layout, exceptId?: string): Set<string> {
  const tiles = new Set<string>();
  Object.entries(layout).forEach(([id, place]) => {
    if (id === exceptId) return;
    const kind = id.split('-')[0] as PlaceableKind;
    if (!FOOTPRINTS[kind]) return;
    tilesOf(place, kind).forEach(tile => tiles.add(tileKey(tile)));
  });
  return tiles;
}

export function placementFits(layout: Layout, kind: PlaceableKind, place: Placement, exceptId?: string, grid: Grid = BASE_GRID) {
  if (!insideGrid(place, kind, grid)) return false;
  const taken = occupiedTiles(layout, exceptId);
  return tilesOf(place, kind).every(tile => !isDoorTile(tile) && !taken.has(tileKey(tile)));
}

/** First free spot for a piece, preferring the upright orientation. */
export function firstFreeSpot(layout: Layout, kind: PlaceableKind, grid: Grid = BASE_GRID): Placement | null {
  const rotations: (0 | 1)[] = rotatable(kind) ? [0, 1] : [0];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      for (const rot of rotations) {
        const place: Placement = { x, y, rot };
        if (placementFits(layout, kind, place, undefined, grid)) return place;
      }
    }
  }
  return null;
}

/**
 * Last resort for a crowded floor: any in-bounds spot that keeps the entrance
 * clear. It may share tiles with another piece, but the shop stays renderable
 * until the player rearranges it.
 */
function emergencySpot(kind: PlaceableKind, grid: Grid = BASE_GRID): Placement {
  const rotations: (0 | 1)[] = rotatable(kind) ? [0, 1] : [0];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      for (const rot of rotations) {
        const place: Placement = { x, y, rot };
        if (insideGrid(place, kind, grid) && tilesOf(place, kind).every(tile => !isDoorTile(tile))) return place;
      }
    }
  }
  return { x: 0, y: 0, rot: 0 };
}

function shapeOf(input: unknown): Placement | null {
  const value = input as Placement | undefined;
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return { x: Math.round(value.x), y: Math.round(value.y), rot: value.rot === 1 ? 1 : 0 };
}

/**
 * Builds a valid layout for the current furniture count. Saved positions are kept
 * whenever they still fit, everything else falls back to a free tile.
 */
export function normalizeLayout(shop: Shop, saved?: Layout): Layout {
  const layout: Layout = {};
  const grid = gridOf(shop);
  const pieces = piecesOf(shop);
  pieces.forEach(piece => {
    const candidates = [shapeOf(saved?.[piece.id]), DEFAULTS[piece.id]].filter(Boolean) as Placement[];
    const chosen = candidates.find(candidate => placementFits(layout, piece.kind, candidate, undefined, grid));
    if (chosen) layout[piece.id] = chosen;
  });
  pieces.forEach(piece => {
    if (layout[piece.id]) return;
    const free = firstFreeSpot(layout, piece.kind, grid);
    if (free) { layout[piece.id] = free; return; }
    layout[piece.id] = emergencySpot(piece.kind, grid);
  });
  return layout;
}

export function placeOf(layout: Layout, piece: Piece): Placement {
  return layout[piece.id] || DEFAULTS[piece.id] || { x: 0, y: 0, rot: 0 };
}

export function layoutFits(layout: Layout, shop: Shop) {
  const grid = gridOf(shop);
  return piecesOf(shop).every(piece => placementFits(layout, piece.kind, placeOf(layout, piece), piece.id, grid));
}

export function blockedTiles(layout: Layout): Set<string> {
  return occupiedTiles(layout);
}

export const isInside = (tile: Tile, grid: Grid = BASE_GRID) => tile.x >= 0 && tile.y >= 0 && tile.x < grid.w && tile.y < grid.h;
/** The pavement right in front of the shop entrance. */
export const isOutside = (tile: Tile) => (tile.x === 7 || tile.x === 8) && tile.y >= GRID_H && tile.y <= GRID_H + 1;
export const isWalkable = (tile: Tile, blocked: Set<string>, grid: Grid = BASE_GRID) =>
  (isInside(tile, grid) && !blocked.has(tileKey(tile))) || isOutside(tile);

const STEPS: Tile[] = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }];

export function neighbours(tile: Tile): Tile[] {
  return STEPS.map(step => ({ x: tile.x + step.x, y: tile.y + step.y }));
}

/** Breadth first search across the free tiles of the shop floor. */
export function findPath(from: Tile, goal: Tile, blocked: Set<string>, grid: Grid = BASE_GRID): Tile[] | null {
  if (!isWalkable(goal, blocked, grid)) return null;
  const start = tileKey(from);
  const target = tileKey(goal);
  if (start === target) return [from];
  const queue: Tile[] = [from];
  const previous = new Map<string, string | null>([[start, null]]);
  const byKey = new Map<string, Tile>([[start, from]]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of neighbours(current)) {
      const key = tileKey(next);
      if (previous.has(key) || !isWalkable(next, blocked, grid)) continue;
      previous.set(key, tileKey(current));
      byKey.set(key, next);
      if (key === target) {
        const path: Tile[] = [next];
        let cursor: string | null = tileKey(current);
        while (cursor) { path.unshift(byKey.get(cursor)!); cursor = previous.get(cursor) ?? null; }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** All walkable tiles that touch a piece and can be used as a browsing spot. */
export function freeSides(place: Placement, kind: PlaceableKind, blocked: Set<string>): Tile[] {
  const own = new Set(tilesOf(place, kind).map(tileKey));
  const sides = new Map<string, Tile>();
  tilesOf(place, kind).forEach(tile => neighbours(tile).forEach(neighbour => {
    const key = tileKey(neighbour);
    if (own.has(key) || sides.has(key) || !isWalkable(neighbour, blocked)) return;
    sides.set(key, neighbour);
  }));
  return [...sides.values()];
}
