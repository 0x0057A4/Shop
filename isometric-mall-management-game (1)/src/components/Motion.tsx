import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';

/**
 * A jump longer than this many scene units is treated as a teleport: the figure
 * is moved at once instead of gliding across the whole shop. One tile step is at
 * most 64 units wide (a horizontal step in the isometric grid), so normal
 * walking never reaches this limit.
 */
export const SNAP_DISTANCE = 200;

export interface Point { x: number; y: number }

/** Soft start and arrival, the classic smoothstep curve. */
export function smoothstep(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * How a walker covers a step: "smooth" eases in and out (the classic soft
 * arrival), "linear" keeps a steady pace like real walking. A route uses linear
 * in the middle and smooth for the first and the last step.
 */
export type Ease = 'smooth' | 'linear';

/** The position between two tiles at a given progress (0 = from, 1 = target). */
export function interpolate(from: Point, target: Point, t: number, ease: Ease = 'smooth'): Point {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = ease === 'linear' ? clamped : smoothstep(clamped);
  return { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
}

/** True when jumping that far would look like a teleport rather than a step. */
export function isTeleport(from: Point, target: Point, snapDistance = SNAP_DISTANCE) {
  return Math.hypot(target.x - from.x, target.y - from.y) > snapDistance;
}

/**
 * A normal step (up to 64 units in the isometric grid) always takes the plain
 * duration. A longer way – a nudge of a few tiles, a fresh spawn – is glided
 * more slowly so that it stays a movement instead of a blur, at most three times
 * as long.
 */
export function glideDuration(distance: number, ms: number, stepLength = 64, maxStretch = 3) {
  if (ms <= 0) return 0;
  return ms * Math.min(maxStretch, Math.max(1, distance / stepLength));
}

/**
 * Glides a point towards its target with requestAnimationFrame instead of
 * snapping from tile to tile. Robbed of the animation by the operating system
 * ("reduce motion"), the point jumps straight to the target.
 */
export function useSmoothPoint(x: number, y: number, ms: number, snapDistance = SNAP_DISTANCE, ease: Ease = 'smooth'): Point {
  const [pos, setPos] = useState<Point>(() => ({ x, y }));
  const ref = useRef({ current: { x, y }, from: { x, y }, target: { x, y }, start: 0, duration: ms, ease, raf: 0 });
  const reduced = useRef(false);

  // Read the system setting once; it is the only thing that switches the glide off.
  useEffect(() => {
    reduced.current = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const tick = useCallback((now: number) => {
    const state = ref.current;
    if (!state.start) state.start = now;
    const t = state.duration <= 0 ? 1 : Math.min(1, (now - state.start) / state.duration);
    state.current = interpolate(state.from, state.target, t, state.ease);
    setPos(state.current);
    if (t < 1) state.raf = requestAnimationFrame(tick);
    else { state.raf = 0; state.start = 0; }
  }, []);

  useEffect(() => {
    const state = ref.current;
    const distance = Math.hypot(x - state.current.x, y - state.current.y);
    state.ease = ease;
    state.duration = reduced.current ? 0 : glideDuration(distance, ms);
    if (distance < .02) return;
    if (isTeleport(state.current, { x, y }, snapDistance) || state.duration <= 0) {
      state.current = { x, y };
      state.from = { x, y };
      state.target = { x, y };
      state.start = 0;
      setPos(state.current);
      return;
    }
    state.from = { ...state.current };
    state.target = { x, y };
    state.start = 0;
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }, [x, y, ms, snapDistance, ease, tick]);

  useEffect(() => () => {
    if (ref.current.raf) cancelAnimationFrame(ref.current.raf);
    ref.current.raf = 0;
  }, []);

  return pos;
}

/** A group that follows its target coordinates smoothly. */
export function SmoothGroup({ x, y, ms, snapDistance, ease, children, ...rest }: {
  x: number;
  y: number;
  /** Duration of one step in milliseconds. */
  ms: number;
  snapDistance?: number;
  ease?: Ease;
} & Omit<SVGProps<SVGGElement>, 'transform' | 'x' | 'y' | 'children'> & { children: ReactNode }) {
  const pos = useSmoothPoint(x, y, ms, snapDistance, ease);
  return <g transform={`translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`} {...rest}>{children}</g>;
}
