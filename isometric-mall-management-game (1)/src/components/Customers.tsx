import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Shop, ShopKind } from '../game/data';
import type { ShopDisplay } from '../game/visualInventory';
import type { Tile } from '../game/layout';
import { DOOR_TILES, blockedTiles, findPath, footprint, freeSides, isWalkable, piecesOf, placeOf } from '../game/layout';
import type { QueueCustomer } from '../game/services';
import { makeCustomer, serviceQueues } from '../game/services';
import type { ServiceQueue } from '../game/services';
import { p } from './isoGeometry';
import { SmoothGroup } from './Motion';

export const CUSTOMER_COLORS = ['#ddb28c', '#89abc3', '#c89eab', '#88b8a4', '#c190ae', '#7498b3', '#e0ad67', '#8aada1'];
/** Milliseconds per tile step. */
export const CUSTOMER_TICK_MS = 420;
/** How long a walker glides from one tile to the next; slightly shorter than the tick. */
export const CUSTOMER_GLIDE_MS = 400;
const MAX_WALKERS = 5;

type Phase = 'arrive' | 'browse' | 'queue' | 'leave';

export interface WalkerState {
  id: number;
  color: string;
  path: Tile[];
  step: number;
  pause: number;
  phase: Phase;
  serviceId: string | null;
  target: Tile | null;
  customer: QueueCustomer | null;
}

export interface CrowdState {
  walkers: WalkerState[];
  /** Waiting customers per service, the first entry stands at the counter. */
  queues: Record<string, number[]>;
}

let walkerSeq = 0;

interface CrowdContext {
  blocked: Set<string>;
  browse: Tile[];
  services: ServiceQueue[];
  doors: Tile[];
}

/** Everything the customers need to know about the current shop. */
export function crowdContext(kind: ShopKind, shop: Shop, display: ShopDisplay): CrowdContext {
  const blocked = blockedTiles(shop.layout);
  const browse: Tile[] = [];
  piecesOf(shop).forEach(piece => {
    if (piece.kind === 'register') return;
    const place = placeOf(shop.layout, piece);
    const size = footprint(piece.kind, place.rot);
    const centerDepth = place.x + size.w / 2 + place.y + size.d / 2;
    // Customers always approach a piece from the front, never from behind it.
    const spots = freeSides(place, piece.kind, blocked).filter(tile => tile.x + tile.y >= centerDepth);
    if (!spots.length) return;
    const appeal = piece.kind === 'shelf'
      ? ((display.shelves[piece.index] || []).length ? 3 : 0)
      : piece.kind === 'showcase' || piece.kind === 'center' || piece.kind === 'materials' ? 3 : 1;
    for (let i = 0; i < appeal; i++) browse.push(...spots);
  });
  return { blocked, browse, services: serviceQueues(kind, shop, blocked), doors: DOOR_TILES.map(door => ({ ...door })) };
}

function pick<T>(list: T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function planTo(from: Tile, goal: Tile, context: CrowdContext): Tile[] | null {
  return findPath(from, goal, context.blocked);
}

function planOutside(from: Tile, context: CrowdContext): Tile[] | null {
  const doors = [...context.doors].sort(() => Math.random() - .5);
  for (const door of doors) {
    const path = planTo(from, { x: door.x, y: door.y + 2 }, context);
    if (path) return path;
  }
  return null;
}

function planBrowse(from: Tile, context: CrowdContext): Tile[] | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const target = pick(context.browse);
    if (!target) return null;
    const path = planTo(from, target, context);
    if (path) return path;
  }
  return null;
}

function withPath(walker: WalkerState, path: Tile[]): WalkerState {
  return { ...walker, path, step: 0, target: path[path.length - 1] ?? null };
}

const here = (walker: WalkerState): Tile =>
  walker.path[Math.max(0, Math.min(walker.step, walker.path.length - 1))] ?? { x: 7, y: 6 };

export function targetCount(shop: Shop) {
  return Math.max(1, Math.min(MAX_WALKERS, 1 + Math.round(shop.popularity / 18)));
}

/** Picks the service with the shortest line that still has room. */
function chooseService(context: CrowdContext, queues: CrowdState['queues'], walker: WalkerState, kind: ShopKind, shop: Shop): { queue: ServiceQueue; customer: QueueCustomer } | null {
  const open = context.services
    .map(queue => ({ queue, waiting: (queues[queue.info.id] || []).length }))
    .filter(entry => entry.queue.spots.length > entry.waiting)
    .sort((a, b) => a.waiting - b.waiting);
  for (const entry of open) {
    const customer = makeCustomer(kind, shop, entry.queue.info, walker.id);
    if (customer) return { queue: entry.queue, customer };
  }
  return null;
}

/** One simulation step: every customer walks one tile and the lines shuffle forward. */
export function stepCrowd(state: CrowdState, kind: ShopKind, shop: Shop, display: ShopDisplay): CrowdState {
  const context = crowdContext(kind, shop, display);
  const alive = new Set(state.walkers.map(walker => walker.id));
  const queues: CrowdState['queues'] = {};
  Object.entries(state.queues).forEach(([serviceId, list]) => {
    const kept = list.filter(id => alive.has(id));
    if (kept.length) queues[serviceId] = kept;
  });

  const walkers: WalkerState[] = state.walkers.map(walker => {
    if (walker.phase === 'queue' && walker.serviceId) {
      const index = (queues[walker.serviceId] || []).indexOf(walker.id);
      if (index < 0) return { ...walker, phase: 'browse', serviceId: null, customer: null, target: null, path: [], step: 0, pause: 2 };
      const spot = context.services.find(entry => entry.info.id === walker.serviceId)?.spots[index];
      if (spot && (spot.x !== walker.target?.x || spot.y !== walker.target?.y)) {
        const path = planTo(here(walker), spot, context);
        if (path) walker = withPath(walker, path);
      }
    }
    return walker;
  });

  const next: WalkerState[] = [];
  for (const walker of walkers) {
    if (walker.pause > 0) { next.push({ ...walker, pause: walker.pause - 1 }); continue; }
    if (walker.step < walker.path.length - 1) {
      const upcoming = walker.path[walker.step + 1];
      if (isWalkable(upcoming, context.blocked)) { next.push({ ...walker, step: walker.step + 1 }); continue; }
      // Furniture moved into the way: find a new route, otherwise leave the shop.
      const current = walker.path[walker.step];
      const replanned = walker.target ? planTo(current, walker.target, context) : null;
      if (replanned && replanned.length > 1) { next.push(withPath(walker, replanned)); continue; }
      const exit = planOutside(current, context);
      if (exit) next.push({ ...withPath(walker, exit), phase: 'leave', serviceId: null, customer: null });
      continue;
    }
    // Arrived at the end of the current path. Customers who are done walk out
    // through the door instead of vanishing at the counter.
    if (walker.phase === 'leave') {
      const exit = planOutside(here(walker), context);
      if (exit && exit.length > 1) next.push(withPath(walker, exit));
      continue;
    }
    if (walker.phase === 'queue') { next.push(walker); continue; }
    const at = here(walker);
    if (walker.phase === 'arrive') {
      const path = planBrowse(at, context);
      if (path) next.push({ ...withPath(walker, path), phase: 'browse', pause: 2 + Math.floor(Math.random() * 4) });
      continue;
    }
    // Browsing done: join a line, keep browsing or leave the shop.
    const joined = chooseService(context, queues, walker, kind, shop);
    if (joined && Math.random() < .85) {
      const index = (queues[joined.queue.info.id] || []).length;
      queues[joined.queue.info.id] = [...(queues[joined.queue.info.id] || []), walker.id];
      const spot = joined.queue.spots[index];
      const path = spot ? planTo(at, spot, context) : null;
      if (path) {
        next.push({ ...withPath(walker, path), phase: 'queue', serviceId: joined.queue.info.id, customer: joined.customer });
        continue;
      }
      queues[joined.queue.info.id] = (queues[joined.queue.info.id] || []).filter(id => id !== walker.id);
    }
    if (Math.random() < .35) {
      const exit = planOutside(at, context);
      if (exit) next.push({ ...withPath(walker, exit), phase: 'leave' });
      continue;
    }
    const path = planBrowse(at, context);
    if (path) next.push({ ...withPath(walker, path), phase: 'browse', pause: 3 + Math.floor(Math.random() * 4) });
  }

  if (next.length < targetCount(shop) && Math.random() < .45) {
    const door = pick(context.doors);
    const inside = door && planTo({ x: door.x, y: door.y + 2 }, door, context);
    if (door && inside) {
      const id = walkerSeq++;
      const start: Tile = { x: door.x, y: door.y + 2 };
      next.push({
        id,
        color: CUSTOMER_COLORS[id % CUSTOMER_COLORS.length],
        path: [start, { x: door.x, y: door.y + 1 }, { ...door }, ...inside.slice(1)],
        step: 0,
        pause: 0,
        phase: 'arrive',
        serviceId: null,
        target: door,
        customer: null,
      });
    }
  }
  return { walkers: next, queues };
}

/** The current tile of a walker (never undefined, also while a path is rebuilt). */
export const currentTile = here;

/** The customer standing at the counter of a service, if anyone waits there. */
export function frontCustomer(state: CrowdState, serviceId: string): QueueCustomer | null {
  const list = state.queues[serviceId] || [];
  const walker = state.walkers.find(entry => entry.id === list[0]);
  return walker?.customer ?? null;
}

export const waitingCount = (state: CrowdState, serviceId: string) => (state.queues[serviceId] || []).length;

/**
 * The customer who is ready to be served: the one at the front of the line and,
 * when a spot is given, only while they really stand at that spot.
 */
export function frontCustomerAt(state: CrowdState, serviceId: string, spot?: Tile): QueueCustomer | null {
  const list = state.queues[serviceId] || [];
  const walker = state.walkers.find(entry => entry.id === list[0]);
  if (!walker?.customer) return null;
  if (spot) {
    const tile = here(walker);
    if (tile.x !== spot.x || tile.y !== spot.y) return null;
  }
  return walker.customer;
}

/** Removes the served customer from the line; everyone behind moves up. */
export function finishFront(state: CrowdState, serviceId: string): CrowdState {
  const list = state.queues[serviceId] || [];
  const [served, ...rest] = list;
  if (served === undefined) return state;
  return {
    walkers: state.walkers.map(walker => walker.id === served
      ? { ...walker, phase: 'leave' as Phase, serviceId: null, customer: null, target: null, path: [here(walker)], step: 0, pause: 1 }
      : walker),
    queues: { ...state.queues, [serviceId]: rest },
  };
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

const EMPTY: CrowdState = { walkers: [], queues: {} };

/** Runs the customer simulation of one shop. */
export function useCrowd(kind: ShopKind, shop: Shop, display: ShopDisplay, active: boolean, paused: boolean) {
  const [state, setState] = useState<CrowdState>(EMPTY);
  const reduced = usePrefersReducedMotion();
  const latest = useRef({ kind, shop, display });
  const stateRef = useRef(state);
  latest.current = { kind, shop, display };
  stateRef.current = state;

  // A different shop means a different crowd.
  useEffect(() => { setState(EMPTY); }, [kind]);

  useEffect(() => {
    if (!active) { setState(EMPTY); return; }
    if (paused) return;
    const timer = window.setInterval(() => {
      const { kind: currentKind, shop: currentShop, display: currentDisplay } = latest.current;
      setState(previous => stepCrowd(previous, currentKind, currentShop, currentDisplay));
    }, reduced ? 1400 : CUSTOMER_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, paused, reduced]);

  return {
    state,
    reduced,
    front: (serviceId: string) => frontCustomer(stateRef.current, serviceId),
    frontAt: (serviceId: string, spot?: Tile) => frontCustomerAt(stateRef.current, serviceId, spot),
    waiting: (serviceId: string) => waitingCount(state, serviceId),
    finish: (serviceId: string) => {
      const next = finishFront(stateRef.current, serviceId);
      stateRef.current = next;
      setState(next);
      return next;
    },
  };
}

/** The walking customers of one shop. */
export function CustomerGroup({ walkers }: { walkers: WalkerState[] }) {
  return <g className="customer-layer">
    {walkers.map(walker => {
      const tile = here(walker);
      const [px, py] = p(tile.x + .5, tile.y + .5, .4);
      return <Walker key={walker.id} px={px} py={py} color={walker.color} walking={walker.pause === 0 && walker.step < walker.path.length - 1} carry={walker.customer && walker.serviceId?.startsWith('workbench') ? 'box' : 'bag'} waiting={walker.phase === 'queue'} />;
    })}
  </g>;
}

/** An animated customer; the figure glides from tile to tile instead of jumping. */
export function Walker({ px, py, color, walking, carry = 'bag', waiting = false }: { px: number; py: number; color: string; walking: boolean; carry?: 'bag' | 'box'; waiting?: boolean }) {
  return <SmoothGroup className="customer-walker" x={px} y={py} ms={CUSTOMER_GLIDE_MS} style={{ '--step-ms': `${CUSTOMER_GLIDE_MS}ms` } as CSSProperties}>
    <ellipse cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15" />
    <g className={walking ? 'customer-bob' : ''}><PersonFigure color={color} carry={carry} waiting={waiting} /></g>
  </SmoothGroup>;
}

/** The body of a person, drawn with the feet at the local origin. */
export function PersonFigure({ color, staff = false, carry = 'bag', waiting = false }: { color: string; staff?: boolean; carry?: 'bag' | 'box' | 'none'; waiting?: boolean }) {
  return <g className={waiting ? 'customer-waiting' : ''}>
    <path d="M-3 -17l-1 14m9-14l1 14" stroke="#475168" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M-5 -2h-4m15 0h4" stroke="#354159" strokeWidth="3" strokeLinecap="round" />
    <path d="M-7 -31l-4 13m18-13l4 13" stroke={color} strokeWidth="5" strokeLinecap="round" />
    <path d="M-7 -32q7-5 14 0l1 17q-8 4-16 0z" fill={color} />
    {staff && <path d="M-4 -29h8l3 14h-14z" fill="#f2f1db" opacity=".9" />}
    <rect x="-2.5" y="-38" width="5" height="7" rx="2" fill="#e6b694" />
    <ellipse cx="0" cy="-42" rx="7" ry="8" fill="#efc4a3" />
    <path d="M-7 -42q-1-12 9-9q8 1 5 9l-3-5-6 1z" fill={staff ? '#665542' : '#59566c'} />
    {!staff && carry === 'bag' && <g><rect x="8" y="-19" width="9" height="12" rx="1.5" fill="#f2dfba" /><path d="M10 -18v-4h5v4" stroke="#c4ab83" fill="none" /></g>}
    {!staff && carry === 'box' && <g><rect x="7" y="-18" width="13" height="11" rx="1.5" fill="#cbd6de" /><path d="M9 -18h9M13.5 -18v11" stroke="#93a5b1" fill="none" /><rect x="10" y="-22" width="7" height="4" rx="1" fill="#9fb4c0" /></g>}
  </g>;
}

/** A static person, used for staff and passers-by. */
export function Person({ x, y, color = '#e5a178', walking = false, delay = 0, staff = false }: { x: number; y: number; color?: string; walking?: boolean; delay?: number; staff?: boolean }) {
  const [px, py] = p(x, y, 0.4);
  return <g transform={`translate(${px.toFixed(2)}, ${py.toFixed(2)})`}>
    <g className={walking ? 'customer-walking' : ''}>
      {walking && <animateTransform attributeName="transform" type="translate" values="0 0; 14 7; 0 0" dur={`${7 + delay}s`} begin={`${-delay}s`} repeatCount="indefinite" />}
      <ellipse cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15" />
      <PersonFigure color={color} staff={staff} />
    </g>
  </g>;
}
