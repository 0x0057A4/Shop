/* Customer locomotion: customers walk along smooth, rounded routes instead of
 * hopping from tile to tile. The maths lives here, the DOM nodes are moved by
 * one shared requestAnimationFrame loop, so the scene never re-renders per frame. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Tile } from '../game/layout';
import { p } from './isoGeometry';
import type { Point } from './Motion';

/** Milliseconds a customer needs for one floor tile (the simulation step). */
export const WALK_STEP_MS = 420;
/** How much of a corner is cut away, in scene pixels. */
export const CORNER_RADIUS = 7;
/** Steps of a rounded corner. */
const CORNER_STEPS = 5;
/** Screen pixels of travel for one full step of the walk cycle. */
const STRIDE_PX = 22;
/** How far legs and arms swing, in degrees. */
const LEG_SWING = 9, ARM_SWING = 8;
/** How far the body lifts on a step, in scene pixels. */
const BOB_PX = 1.5;
/** Hip, shoulder and body offsets the limbs rotate around. */
const HIP_FRONT = [6, -17], HIP_BACK = [-3, -17], SHOULDER_FRONT = [11, -31], SHOULDER_BACK = [-7, -31];
const TAU = Math.PI * 2;
// On the server there is no layout phase; the plain effect is close enough there.
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface WalkingSource {
  id: number;
  path: Tile[];
  step: number;
  pause: number;
  phase: 'arrive' | 'browse' | 'queue' | 'leave';
}

/** The tile a walker stands on right now. */
export function tileOf(walker: WalkingSource): Tile {
  return walker.path[Math.max(0, Math.min(walker.step, walker.path.length - 1))] ?? { x: 7, y: 6 };
}

/**
 * Which way a walker looks: one step to the right goes down-right on screen,
 * one step back up-left, so the sign of the screen movement decides it.
 */
export function facingOf(walker: WalkingSource): 1 | -1 {
  const tile = tileOf(walker);
  const previous = walker.path[Math.max(0, walker.step - 1)] ?? tile;
  return ((tile.x - previous.x) - (tile.y - previous.y)) < 0 ? -1 : 1;
}

/** Screen position of a tile centre, matching isoGeometry's projection. */
export function tileCenter(tile: Tile): Point {
  const [x, y] = p(tile.x + .5, tile.y + .5, .4);
  return { x, y };
}

/** The way a customer walks: a steady stride, never faster than the simulation. */
export function walkerTraits(id: number) {
  const hash = (Math.imul(id + 1, 2654435761) >>> 0);
  const pick = (index: number, span: number) => ((hash >>> (index * 5)) % 1000) / 1000 * span;
  return {
    /** Wider corners make a slightly longer, more relaxed route. */
    curve: .72 + pick(0, .66),
    /** A small standing offset so a queue is not a perfect row. */
    offsetX: (pick(1, 5) - 2.5) * .9,
    offsetY: (pick(2, 5) - 2.5) * .9,
    /** Height and hair colour make every customer a person. */
    scale: .94 + pick(3, .12),
    hair: ['#59566c', '#4c4a5e', '#6b573f', '#7c5a45', '#454a5e'][Math.floor(pick(4, 5))],
  };
}

/** Line of sight: does the straight line from one tile to another stay free? */
export function lineIsClear(from: Tile, to: Tile, walkable: (tile: Tile) => boolean) {
  const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    // A line may pass exactly over the corner of four tiles; it is free when at
    // least one of them can be walked on.
    const corners: Tile[] = [{ x: Math.floor(x), y: Math.floor(y) }, { x: Math.ceil(x), y: Math.ceil(y) },
      { x: Math.floor(x), y: Math.ceil(y) }, { x: Math.ceil(x), y: Math.floor(y) }];
    if (!corners.some(walkable)) return false;
  }
  return true;
}

/**
 * Replaces a staircase of tile steps with long, straight lines: a customer who
 * wants to go three tiles across and three tiles back simply walks diagonally
 * instead of alternating between two screen directions on every step.
 */
export function straightenTiles(tiles: Tile[], walkable: (tile: Tile) => boolean = () => true): Tile[] {
  if (tiles.length <= 2) return [...tiles];
  const out: Tile[] = [tiles[0]];
  let index = 0;
  while (index < tiles.length - 1) {
    let next = index + 1;
    for (let candidate = tiles.length - 1; candidate > index + 1; candidate--) {
      if (lineIsClear(tiles[index], tiles[candidate], walkable)) { next = candidate; break; }
    }
    out.push(tiles[next]);
    index = next;
  }
  return out;
}

/** Rounds the corners of a polyline with quadratic curves (Chaikin style). */
export function roundPolyline(points: Point[], radius = CORNER_RADIUS): Point[] {
  if (points.length < 3 || radius <= 0) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength * .42, outLength * .42);
    if (r < .4) { out.push(corner); continue; }
    const a = { x: corner.x - (corner.x - previous.x) / inLength * r, y: corner.y - (corner.y - previous.y) / inLength * r };
    const b = { x: corner.x + (next.x - corner.x) / outLength * r, y: corner.y + (next.y - corner.y) / outLength * r };
    out.push(a);
    for (let s = 1; s < CORNER_STEPS; s++) {
      const t = s / CORNER_STEPS;
      const q1 = { x: a.x + (corner.x - a.x) * t, y: a.y + (corner.y - a.y) * t };
      const q2 = { x: corner.x + (b.x - corner.x) * t, y: corner.y + (b.y - corner.y) * t };
      out.push({ x: q1.x + (q2.x - q1.x) * t, y: q1.y + (q2.y - q1.y) * t });
    }
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

export interface Route {
  points: Point[];
  /** Distance from the start to each point. */
  lengths: number[];
  total: number;
}

export function buildRoute(points: Point[]): Route {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, lengths, total: lengths[lengths.length - 1] ?? 0 };
}

/** The point at a given distance along the route. */
export function pointOnRoute(route: Route, distance: number): Point {
  if (!route.points.length) return { x: 0, y: 0 };
  if (distance <= 0) return { ...route.points[0] };
  if (distance >= route.total) return { ...route.points[route.points.length - 1] };
  let index = 1;
  while (index < route.lengths.length - 1 && route.lengths[index] < distance) index++;
  const from = route.points[index - 1], to = route.points[index];
  const span = route.lengths[index] - route.lengths[index - 1] || 1;
  const t = (distance - route.lengths[index - 1]) / span;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** The direction the route runs at a given distance, in screen pixels. */
export function routeDirection(route: Route, distance: number): Point {
  if (route.points.length < 2) return { x: 0, y: 0 };
  let index = 1;
  while (index < route.lengths.length - 1 && route.lengths[index] < distance) index++;
  const from = route.points[index - 1], to = route.points[index];
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/**
 * The route a customer walks next: from where the figure really stands along the
 * remaining tiles of its planned way, straightened and with soft corners. The
 * simulation gives one WALK_STEP_MS per tile, so the figure never outruns it.
 */
export function buildWalkerRoute(walker: WalkingSource, from: Point | null, walkable: (tile: Tile) => boolean, curve = 1) {
  const start = Math.max(0, Math.min(walker.step, walker.path.length - 1));
  const anchors = straightenTiles(walker.path.slice(start), walkable);
  const centers = anchors.slice(from ? 1 : 0).map(tileCenter);
  const points = roundPolyline(from ? [from, ...centers] : centers, CORNER_RADIUS * curve);
  const route = buildRoute(points);
  const steps = Math.max(0, walker.path.length - 1 - start);
  return { route, duration: Math.max(.001, steps * WALK_STEP_MS / 1000) };
}

// ------------------------------------------------------------------- the loop

/** Every part of a figure the walk loop moves. */
export interface WalkerParts {
  /** The group the whole customer is translated with. */
  motion?: SVGGElement | null;
  /** The group that is mirrored when the customer turns around. */
  face?: SVGGElement | null;
  /** The body that bobs up and down while walking. */
  body?: SVGGElement | null;
  shadow?: SVGElement | null;
  legFront?: SVGGElement | null;
  legBack?: SVGGElement | null;
  armFront?: SVGGElement | null;
  armBack?: SVGGElement | null;
}

const registry = new Map<number, WalkerParts>();

/**
 * Every customer figure hands its moving parts over to the walk loop. New figures
 * are placed on their tile right away, so nobody is ever drawn in the corner of
 * the scene while waiting for the next frame.
 */
export function registerWalkerNode(id: number, parts: WalkerParts | null) {
  if (!parts || !parts.motion) { registry.delete(id); return; }
  registry.set(id, parts);
  if (!parts.motion.hasAttribute('transform')) {
    const x = Number(parts.motion.dataset.x ?? NaN);
    const y = Number(parts.motion.dataset.y ?? NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) setAttribute(parts.motion, 'transform', `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
  }
}

export function registeredWalkerCount() {
  return registry.size;
}

interface Plan {
  signature: string;
  route: Route;
  distance: number;
  /** 0 = standing, 1 = full speed; softened so nobody starts or stops abruptly. */
  throttle: number;
  facing: number;
  /** Position inside the walk cycle, in radians. */
  phase: number;
  /** How far the limbs are swung right now; eases to zero when standing. */
  pose: number;
}

/** Writes an attribute only when it really changes; saves work and repaints. */
const written = new WeakMap<Element, string>();
function setAttribute(node: Element | null | undefined, name: string, value: string) {
  if (!node) return;
  const key = `${name}=${value}`;
  if (written.get(node) === key) return;
  written.set(node, key);
  node.setAttribute(name, value);
}

/** Rounds a pivot rotation into an SVG transform, e.g. rotate around the hip. */
function limb(swing: number, pivot: number[]) {
  const angle = swing.toFixed(2);
  return `translate(${pivot[0]} ${pivot[1]}) rotate(${angle}) translate(${-pivot[0]} ${-pivot[1]})`;
}

/**
 * Walks every customer along its route. One loop moves all figures by writing
 * the transform attribute directly, so neither React nor the CSS animations have
 * to keep up with the frame rate.
 */
export function WalkerMotion({ walkers, walkable, active = true, reduced = false }: {
  walkers: WalkingSource[];
  walkable: (tile: Tile) => boolean;
  active?: boolean;
  reduced?: boolean;
}) {
  const latest = useRef({ walkers, walkable, active, reduced });
  latest.current = { walkers, walkable, active, reduced };

  useIsoLayout(() => {
    let frame = 0;
    let last = 0;
    const plans = new Map<number, Plan>();

    const run = (now: number, first: boolean) => {
      const { walkers, walkable, active, reduced } = latest.current;
      const delta = first ? 0 : Math.min(.064, Math.max(0, (now - last) / 1000));
      last = now;
      const alive = new Set<number>();
      for (const walker of walkers) {
        alive.add(walker.id);
        const entry = registry.get(walker.id);
        if (!entry) continue;
        const traits = walkerTraits(walker.id);
        if (reduced) {
          // Wer keine Bewegung sehen moechte, steht trotzdem genau da, wo die
          // Simulation ihn gerade hat - ohne Route, ohne Gangzyklus.
          plans.delete(walker.id);
          const tile = tileOf(walker);
          const at = tileCenter(tile);
          setAttribute(entry.motion, 'transform', `translate(${(at.x + traits.offsetX).toFixed(2)}, ${(at.y + traits.offsetY).toFixed(2)})`);
          setAttribute(entry.face, 'transform', facingOf(walker) < 0 ? 'scale(-1 1)' : '');
          setAttribute(entry.legFront, 'transform', limb(0, HIP_FRONT));
          setAttribute(entry.legBack, 'transform', limb(0, HIP_BACK));
          setAttribute(entry.armFront, 'transform', limb(0, SHOULDER_FRONT));
          setAttribute(entry.armBack, 'transform', limb(0, SHOULDER_BACK));
          setAttribute(entry.body, 'transform', `translate(0 0) scale(${traits.scale.toFixed(3)})`);
          setAttribute(entry.shadow, 'transform', 'scale(1.000)');
          setAttribute(entry.shadow, 'opacity', '.150');
          continue;
        }
        const signature = `${walker.phase}|${walker.step}|${walker.path.length}`;
        let plan = plans.get(walker.id);
        const remaining = plan ? Math.max(0, plan.route.total - plan.distance) : 0;
        if (!plan) {
          const built = buildWalkerRoute(walker, tileCenter(tileOf(walker)), walkable, traits.curve);
          plan = { signature, route: built.route, distance: 0, throttle: 0, facing: 1, phase: 0, pose: 0 };
          plans.set(walker.id, plan);
        } else if (plan.signature !== signature) {
          // Only follow a new plan when the old leg is (almost) walked out, so a
          // customer always reaches the spot the simulation sent it to.
          if (remaining <= .7) {
            const built = buildWalkerRoute(walker, pointOnRoute(plan.route, plan.distance), walkable, traits.curve);
            plan = { signature, route: built.route, distance: 0, throttle: plan.throttle, facing: plan.facing, phase: plan.phase, pose: plan.pose };
            plans.set(walker.id, plan);
          } else if (buildWalkerRoute(walker, null, walkable, traits.curve).route.total > .7) {
            const built = buildWalkerRoute(walker, pointOnRoute(plan.route, plan.distance), walkable, traits.curve);
            plan = { signature, route: built.route, distance: 0, throttle: plan.throttle, facing: plan.facing, phase: plan.phase, pose: plan.pose };
            plans.set(walker.id, plan);
          }
        }
        // Standing still is allowed, but the last leg is always walked to its end.
        const finishing = plan.distance < plan.route.total - .4;
        const walking = active && !reduced && (finishing || (walker.pause === 0 && walker.step < walker.path.length - 1));
        const target = walking ? 1 : 0;
        const rate = target > plan.throttle ? .32 : .26;
        plan.throttle += (target - plan.throttle) * (first ? 1 : Math.min(1, delta / rate));
        const steps = Math.max(0, walker.path.length - 1 - walker.step);
        const duration = Math.max(.24, steps * WALK_STEP_MS / 1000);
        const before = plan.distance;
        plan.distance = Math.min(plan.route.total, plan.distance + plan.route.total / duration * plan.throttle * (first ? 0 : delta));
        if (plan.distance >= plan.route.total - .02) plan.distance = plan.route.total;
        plan.phase = (plan.phase + (plan.distance - before) / STRIDE_PX * TAU) % TAU;
        const at = pointOnRoute(plan.route, plan.distance);
        setAttribute(entry.motion, 'transform', `translate(${(at.x + traits.offsetX).toFixed(2)}, ${(at.y + traits.offsetY).toFixed(2)})`);
        const direction = routeDirection(plan.route, plan.distance);
        if (Math.abs(direction.x) > .12) plan.facing = direction.x < 0 ? -1 : 1;
        setAttribute(entry.face, 'transform', plan.facing < 0 ? 'scale(-1 1)' : '');
        // The walk cycle follows the distance really travelled: the legs stop the
        // moment the customer stops, instead of freezing in the middle of a step.
        const velocity = delta > 0 ? (plan.distance - before) / delta : 0;
        const pose = Math.min(1, velocity / 30);
        plan.pose += (pose - plan.pose) * (first ? 1 : Math.min(1, delta / .16));
        const swing = Math.sin(plan.phase) * plan.pose;
        setAttribute(entry.legFront, 'transform', limb(-swing * LEG_SWING, HIP_FRONT));
        setAttribute(entry.legBack, 'transform', limb(swing * LEG_SWING, HIP_BACK));
        setAttribute(entry.armFront, 'transform', limb(swing * ARM_SWING, SHOULDER_FRONT));
        setAttribute(entry.armBack, 'transform', limb(-swing * ARM_SWING, SHOULDER_BACK));
        // Die Groesse aus den Merkmalen gehoert mit in die Matrix, sonst wuerde sie ueberschrieben.
        setAttribute(entry.body, 'transform', `translate(0 ${(-BOB_PX * Math.abs(swing)).toFixed(2)}) scale(${traits.scale.toFixed(3)})`);
        setAttribute(entry.shadow, 'transform', `scale(${(1 - .13 * Math.abs(swing)).toFixed(3)})`);
        setAttribute(entry.shadow, 'opacity', (.15 - .04 * Math.abs(swing)).toFixed(3));
      }
      for (const id of [...plans.keys()]) if (!alive.has(id)) plans.delete(id);
    };

    // The first run places every figure before the browser paints the frame.
    run(0, true);
    const loop = (now: number) => { run(now, false); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
