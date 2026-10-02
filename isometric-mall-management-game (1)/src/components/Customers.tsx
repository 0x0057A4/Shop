import { useEffect, useRef, useState } from 'react';
import type { Shop } from '../game/data';
import type { ShopDisplay } from '../game/visualInventory';
import type { Tile } from '../game/layout';
import { DOOR_TILES, blockedTiles, findPath, footprint, freeSides, isWalkable, piecesOf, placeOf } from '../game/layout';
import { p } from './isoGeometry';

export const CUSTOMER_COLORS = ['#ddb28c', '#89abc3', '#c89eab', '#88b8a4', '#c190ae', '#7498b3', '#e0ad67', '#8aada1'];
/** Milliseconds per tile step. The CSS transition of a walker uses the same rhythm. */
export const CUSTOMER_TICK_MS = 700;
const MAX_WALKERS = 5;
let walkerSeq = 0;

type Goal = 'browse' | 'register' | 'exit';

export interface WalkerState {
  key: number;
  color: string;
  path: Tile[];
  step: number;
  goal: Goal;
  pause: number;
}

interface WalkContext {
  blocked: Set<string>;
  browse: Tile[];
  register: Tile[];
  doors: Tile[];
}

/** All places a customer may walk to, derived from the current shop layout. */
export function buildContext(shop: Shop, display: ShopDisplay): WalkContext {
  const blocked = blockedTiles(shop.layout);
  const browse: Tile[] = [];
  const register: Tile[] = [];
  piecesOf(shop).forEach(piece => {
    const place = placeOf(shop.layout, piece);
    const size = footprint(piece.kind, place.rot);
    const centerDepth = place.x + size.w / 2 + place.y + size.d / 2;
    // Customers always approach a piece from the front, never from behind it.
    const spots = freeSides(place, piece.kind, blocked).filter(tile => tile.x + tile.y >= centerDepth);
    if (!spots.length) return;
    if (piece.kind === 'register') { register.push(...spots); return; }
    const appeal = piece.kind === 'shelf'
      ? ((display.shelves[piece.index] || []).length ? 3 : 0)
      : piece.kind === 'showcase' || piece.kind === 'center' || piece.kind === 'materials' ? 3 : 1;
    for (let i = 0; i < appeal; i++) browse.push(...spots);
  });
  return { blocked, browse, register, doors: DOOR_TILES.map(door => ({ ...door })) };
}

function pick<T>(list: T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function plan(goal: Goal, from: Tile, context: WalkContext): Tile[] | null {
  if (goal === 'browse') {
    for (let attempt = 0; attempt < 12; attempt++) {
      const target = pick(context.browse);
      if (!target) return null;
      const path = findPath(from, target, context.blocked);
      if (path) return path;
    }
    return null;
  }
  if (goal === 'register') {
    const spots = [...context.register].sort(() => Math.random() - .5);
    for (const spot of spots) {
      const path = findPath(from, spot, context.blocked);
      if (path) return path;
    }
    return null;
  }
  const doors = [...context.doors].sort(() => Math.random() - .5);
  for (const door of doors) {
    const path = findPath(from, { x: door.x, y: door.y + 2 }, context.blocked);
    if (path) return path;
  }
  return null;
}

export function spawnWalker(context: WalkContext): WalkerState | null {
  const door = pick(context.doors);
  if (!door) return null;
  const route = plan('browse', door, context);
  const key = walkerSeq++;
  return {
    key,
    color: CUSTOMER_COLORS[key % CUSTOMER_COLORS.length],
    path: [{ x: door.x, y: door.y + 2 }, { x: door.x, y: door.y + 1 }, { ...door }, ...(route ? route.slice(1) : [])],
    step: 0,
    goal: 'browse',
    pause: 0,
  };
}

function targetCount(shop: Shop) {
  return Math.max(1, Math.min(MAX_WALKERS, 1 + Math.round(shop.popularity / 18)));
}

export function stepWalkers(list: WalkerState[], shop: Shop, context: WalkContext): WalkerState[] {
  const next: WalkerState[] = [];
  for (const walker of list) {
    if (walker.pause > 0) { next.push({ ...walker, pause: walker.pause - 1 }); continue; }
    if (walker.step < walker.path.length - 1) {
      const upcoming = walker.path[walker.step + 1];
      if (isWalkable(upcoming, context.blocked)) { next.push({ ...walker, step: walker.step + 1 }); continue; }
      // Furniture moved into the way: find a new route to the same destination.
      const current = walker.path[walker.step];
      const target = walker.path[walker.path.length - 1];
      const rerouted = findPath(current, target, context.blocked);
      if (rerouted && rerouted.length > 1) { next.push({ ...walker, path: rerouted, step: 1 }); continue; }
      const exit = plan('exit', current, context);
      if (exit) next.push({ ...walker, path: exit, step: 0, goal: 'exit', pause: 0 });
      continue;
    }
    if (walker.goal === 'exit') continue;
    const here = walker.path[walker.step];
    const goals: Goal[] = walker.goal === 'browse' ? ['register', 'exit'] : ['exit'];
    let planned: { path: Tile[]; goal: Goal } | null = null;
    for (const goal of goals) {
      const path = plan(goal, here, context);
      if (path) { planned = { path, goal }; break; }
    }
    if (!planned) continue;
    next.push({ ...walker, path: planned.path, step: 0, goal: planned.goal, pause: 3 + Math.floor(Math.random() * 5) });
  }
  if (next.length < targetCount(shop) && Math.random() < .45) {
    const spawn = spawnWalker(context);
    if (spawn) next.push(spawn);
  }
  return next;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Simulates customers walking through the shop, one tile per tick. */
export function useShopWalkers(shop: Shop, display: ShopDisplay, active: boolean, paused: boolean) {
  const [walkers, setWalkers] = useState<WalkerState[]>([]);
  const reduced = usePrefersReducedMotion();
  const latest = useRef({ shop, display });
  useEffect(() => { latest.current = { shop, display }; });

  useEffect(() => {
    if (!active || reduced || paused) {
      if (!active) setWalkers([]);
      return;
    }
    const timer = window.setInterval(() => {
      const { shop: current, display: currentDisplay } = latest.current;
      const context = buildContext(current, currentDisplay);
      setWalkers(list => stepWalkers(list, current, context));
    }, CUSTOMER_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, reduced, paused]);

  return { walkers, reduced };
}

/** The walking customers of one shop. */
export function CustomerGroup({ walkers }: { walkers: WalkerState[] }) {
  return <g className="customer-layer">
    {walkers.map(walker => {
      const tile = walker.path[Math.min(walker.step, walker.path.length - 1)];
      const [px, py] = p(tile.x + .5, tile.y + .5, .4);
      return <Walker key={walker.key} px={px} py={py} color={walker.color} walking={walker.pause === 0} />;
    })}
  </g>;
}

/** An animated customer. Position changes are animated by CSS transitions. */
export function Walker({ px, py, color, walking }: { px: number; py: number; color: string; walking: boolean }) {
  return <g className="customer-walker" style={{ transform: `translate(${px}px, ${py}px)` }}>
    <ellipse cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15" />
    <g className={walking ? 'customer-bob' : ''}><PersonFigure color={color} /></g>
  </g>;
}

/** The body of a person, drawn with the feet at the local origin. */
export function PersonFigure({ color, staff = false }: { color: string; staff?: boolean }) {
  return <g>
    <path d="M-3 -17l-1 14m9-14l1 14" stroke="#475168" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M-5 -2h-4m15 0h4" stroke="#354159" strokeWidth="3" strokeLinecap="round" />
    <path d="M-7 -31l-4 13m18-13l4 13" stroke={color} strokeWidth="5" strokeLinecap="round" />
    <path d="M-7 -32q7-5 14 0l1 17q-8 4-16 0z" fill={color} />
    {staff && <path d="M-4 -29h8l3 14h-14z" fill="#f2f1db" opacity=".9" />}
    <rect x="-2.5" y="-38" width="5" height="7" rx="2" fill="#e6b694" />
    <ellipse cx="0" cy="-42" rx="7" ry="8" fill="#efc4a3" />
    <path d="M-7 -42q-1-12 9-9q8 1 5 9l-3-5-6 1z" fill={staff ? '#665542' : '#59566c'} />
    {!staff && <g><rect x="8" y="-19" width="9" height="12" rx="1.5" fill="#f2dfba" /><path d="M10 -18v-4h5v4" stroke="#c4ab83" fill="none" /></g>}
  </g>;
}

/** A static person, used for staff and passers-by. */
export function Person({ x, y, color = '#e5a178', walking = false, delay = 0, staff = false }: { x: number; y: number; color?: string; walking?: boolean; delay?: number; staff?: boolean }) {
  const [px, py] = p(x, y, 0.4);
  return <g style={{ transform: `translate(${px}px, ${py}px)` }}>
    <g className={walking ? 'customer-walking' : ''}>
      {walking && <animateTransform attributeName="transform" type="translate" values="0 0; 14 7; 0 0" dur={`${7 + delay}s`} begin={`${-delay}s`} repeatCount="indefinite" />}
      <ellipse cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15" />
      <PersonFigure color={color} staff={staff} />
    </g>
  </g>;
}
