import type { Layout, PlaceableKind, Placement } from '../game/data';
import { footprint, placementFits, rotatable } from '../game/layout';
import { p } from './isoGeometry';

/**
 * How far above its footprint a piece can still be grabbed, in screen pixels.
 * This mirrors roughly how tall the piece is drawn, so the area the player can
 * click is the same area they see.
 */
export const PICK_HEIGHT: Record<PlaceableKind, number> = {
  shelf: 96,
  workbench: 66,
  register: 62,
  showcase: 58,
  center: 48,
  materials: 44,
  decor: 46,
};
export const PICK_PAD = 10;

export interface ScreenPoint { x: number; y: number }

export interface PickBox {
  id: string;
  kind: PlaceableKind;
  /** The outline of the drawn piece: a hexagon over its footprint and height. */
  outline: ScreenPoint[];
  minX: number;
  maxX: number;
  /** Upper edge of the footprint, i.e. the back corner. */
  footTop: number;
  /** Lower edge of the footprint, i.e. the front corner. */
  footBottom: number;
  /** Highest point of the drawn piece. */
  top: number;
  /** Paint order: a larger value is drawn later and therefore lies on top. */
  depth: number;
}

/** Convex hull of a small set of points (monotone chain). */
function hull(points: ScreenPoint[]): ScreenPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: ScreenPoint[]) => {
    const out: ScreenPoint[] = [];
    list.forEach(point => {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    });
    return out;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The area a piece occupies on screen: its footprint, lifted by the height it is
 * drawn with. The outline is a hexagon, not a rectangle – that is what the piece
 * really looks like, so a piece in front does not swallow the one behind it.
 */
export function pickBox(id: string, kind: PlaceableKind, place: Placement, depth = 0): PickBox {
  const { w, d } = footprint(kind, place.rot);
  const corners: ScreenPoint[] = [
    { x: place.x, y: place.y },
    { x: place.x + w, y: place.y },
    { x: place.x + w, y: place.y + d },
    { x: place.x, y: place.y + d },
  ].map(tile => { const [x, y] = p(tile.x, tile.y); return { x, y }; });
  const height = PICK_HEIGHT[kind];
  const lifted = corners.map(point => ({ x: point.x, y: point.y - height }));
  const top = Math.min(...lifted.map(point => point.y));
  return {
    id,
    kind,
    outline: hull([...corners, ...lifted]),
    minX: Math.min(...corners.map(point => point.x)),
    maxX: Math.max(...corners.map(point => point.x)),
    footTop: Math.min(...corners.map(point => point.y)),
    footBottom: Math.max(...corners.map(point => point.y)),
    top,
    depth,
  };
}

/** Point in polygon, counting the crossings of a ray to the right. */
export function insideOutline(box: PickBox, point: ScreenPoint) {
  const outline = box.outline;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) / (b.y - a.y) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

export const boxHas = (box: PickBox, point: ScreenPoint) => insideOutline(box, point);

/**
 * The piece the player aimed at. Pieces are drawn back to front, so the one
 * drawn last wins: that is the piece actually visible under the cursor.
 */
export function pickPiece<T extends PickBox>(point: ScreenPoint, boxes: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const box of boxes) {
    if (!insideOutline(box, point)) continue;
    if (!best || box.depth > best.depth) best = box;
  }
  return best;
}

/** Arrow keys move the chosen piece one tile: screen-up is back, screen-right is right. */
export const ARRANGE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowRight: [0, -1],
  ArrowDown: [1, 0],
  ArrowLeft: [0, 1],
};

export function canRotate(kind: PlaceableKind) {
  return rotatable(kind);
}

/** The moved position, or null when a piece is already standing there. */
export function moveTarget(layout: Layout, kind: PlaceableKind, place: Placement, id: string, dx: number, dy: number): Placement | null {
  const target: Placement = { ...place, x: place.x + dx, y: place.y + dy };
  if (target.x === place.x && target.y === place.y) return null;
  return placementFits(layout, kind, target, id) ? target : null;
}

/**
 * All places a rotated piece could stand without leaving the area it covered
 * before, closest to its old position first.
 */
export function rotatedAnchors(kind: PlaceableKind, place: Placement): Placement[] {
  const before = footprint(kind, place.rot);
  const after = footprint(kind, place.rot === 0 ? 1 : 0);
  const center = { x: place.x + before.w / 2, y: place.y + before.d / 2 };
  const candidates: { place: Placement; moved: number }[] = [];
  for (let dx = -(after.w - 1); dx <= 0; dx++) {
    for (let dy = -(after.d - 1); dy <= 0; dy++) {
      const x = place.x + dx, y = place.y + dy;
      candidates.push({
        place: { x, y, rot: place.rot === 0 ? 1 : 0 },
        moved: Math.hypot(x + after.w / 2 - center.x, y + after.d / 2 - center.y),
      });
    }
  }
  return candidates.sort((a, b) => a.moved - b.moved).map(entry => entry.place);
}

/**
 * Turning a piece in place. Long counters become narrow ones, so the rotated
 * footprint rarely fits on the very same tile – in that case the piece is
 * nudged to the nearest free spot that stays around its old centre.
 */
export function rotateTarget(layout: Layout, kind: PlaceableKind, place: Placement, id: string): Placement | null {
  if (!rotatable(kind)) return null;
  for (const candidate of rotatedAnchors(kind, place)) {
    if (placementFits(layout, kind, candidate, id)) return candidate;
  }
  return null;
}
