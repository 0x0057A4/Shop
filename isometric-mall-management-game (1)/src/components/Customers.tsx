import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Shop, ShopKind } from '../game/data';
import type { ShopDisplay } from '../game/visualInventory';
import type { Tile } from '../game/layout';
import { blockedTiles, doorTiles, findPath, footprint, freeSides, gridOf, isWalkable, piecesOf, placeOf } from '../game/layout';
import type { Grid } from '../game/layout';
import type { QueueCustomer } from '../game/services';
import { makeCustomer, serviceQueues } from '../game/services';
import type { ServiceQueue } from '../game/services';
import { p } from './isoGeometry';
import { WALK_STEP_MS, facingOf, registerWalkerNode, tileOf, walkerTraits } from './CustomerMotion';
import type { WalkerParts } from './CustomerMotion';

// Auf dem Server gibt es keine Layout-Phase; dort reicht der normale Effekt.
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const CUSTOMER_COLORS = ['#ddb28c', '#89abc3', '#c89eab', '#88b8a4', '#c190ae', '#7498b3', '#e0ad67', '#8aada1'];
/** Milliseconds per tile step; the walk loop uses the same clock. */
export const CUSTOMER_TICK_MS = WALK_STEP_MS;
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
  /** How many ticks the customer already lingers at its spot while fading out. */
  linger?: number;
}

export interface CrowdState {
  walkers: WalkerState[];
  /** Waiting customers per service, the first entry stands at the counter. */
  queues: Record<string, number[]>;
}

let walkerSeq = 0;

interface CrowdContext {
  blocked: Set<string>;
  grid: Grid;
  browse: Tile[];
  services: ServiceQueue[];
  doors: Tile[];
}

/** Everything the customers need to know about the current shop. */
export function crowdContext(kind: ShopKind, shop: Shop, display: ShopDisplay): CrowdContext {
  const blocked = blockedTiles(shop.layout);
  const grid = gridOf(shop);
  const browse: Tile[] = [];
  piecesOf(shop).forEach(piece => {
    if (piece.kind === 'register') return;
    const place = placeOf(shop.layout, piece);
    const size = footprint(piece.kind, place.rot);
    const centerDepth = place.x + size.w / 2 + place.y + size.d / 2;
    // Customers always approach a piece from the front, never from behind it.
    const spots = freeSides(place, piece.kind, blocked, grid).filter(tile => tile.x + tile.y >= centerDepth);
    if (!spots.length) return;
    const appeal = piece.kind === 'shelf'
      ? ((display.shelves[piece.index] || []).length ? 3 : 0)
      : piece.kind === 'showcase' || piece.kind === 'center' || piece.kind === 'materials' ? 3 : 1;
    for (let i = 0; i < appeal; i++) browse.push(...spots);
  });
  return { blocked, grid, browse, services: serviceQueues(kind, shop, blocked), doors: doorTiles(grid) };
}

/** The pavement in front of the entrance, where the floor grid has ended. */
export function onApron(tile: Tile, grid: Grid) {
  return tile.x >= -2 && tile.x <= grid.w + 1 && tile.y >= -2 && tile.y <= grid.h + 3;
}

/** Can this walker put its foot on that tile? Coming and going uses the apron. */
export function walkableFor(walker: WalkerState, context: CrowdContext) {
  if (walker.phase !== 'arrive' && walker.phase !== 'leave') {
    return (tile: Tile) => isWalkable(tile, context.blocked, context.grid);
  }
  return (tile: Tile) => onApron(tile, context.grid) && !context.blocked.has(`${tile.x},${tile.y}`);
}

function pick<T>(list: T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function planTo(from: Tile, goal: Tile, context: CrowdContext): Tile[] | null {
  return findPath(from, goal, context.blocked, context.grid);
}

/**
 * Leaving the shop: through the door, down the two steps to the pavement and
 * then along the corridor until the customer is out of the picture. Tiles in
 * front of the shop are no floor tiles any more, so this part is planned by hand.
 */
function planOutside(from: Tile, context: CrowdContext): Tile[] | null {
  const doors = [...context.doors].sort(() => Math.random() - .5);
  for (const door of doors) {
    const inside = planTo(from, door, context);
    if (!inside) continue;
    const steps: Tile[] = [{ x: door.x, y: door.y + 1 }, { x: door.x, y: door.y + 2 }];
    const side = Math.random() < .5 ? -1 : 1;
    const targetX = Math.max(-1, Math.min(context.grid.w, door.x + side * (2 + Math.round(Math.random() * 3))));
    let x = door.x;
    const y = door.y + 2;
    while (x !== targetX) { x += targetX > x ? 1 : -1; steps.push({ x, y }); }
    return [...inside, ...steps];
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
  return { ...walker, path, step: 0, target: path[path.length - 1] ?? null, linger: 0 };
}

const here = (walker: WalkerState): Tile => tileOf(walker);

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
      if (walkableFor(walker, context)(upcoming)) { next.push({ ...walker, step: walker.step + 1 }); continue; }
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
      if (exit && exit.length > 1) { next.push(withPath(walker, exit)); continue; }
      // Stehen bleiben, damit die Figur in Ruhe ausblenden kann.
      const linger = (walker.linger ?? 0) + 1;
      if (linger <= 2) next.push({ ...walker, linger });
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

/** All walking customers of one shop, each one drawn on its own. */
export function CustomerGroup({ walkers }: { walkers: WalkerState[] }) {
  return <g className="customer-layer">
    {walkers.map(walker => <CustomerFigure key={walker.id} walker={walker} />)}
  </g>;
}

/**
 * One customer as a standalone node. The scene sorts every customer in with the
 * furniture by its floor depth, so the shop really stands in front of them.
 * Position and facing are handed to the walk loop (CustomerMotion); React only
 * draws the figure itself and keeps the data attributes for static pictures.
 */
export function CustomerFigure({ walker }: { walker: WalkerState }) {
  const tile = tileOf(walker);
  const [px, py] = p(tile.x + .5, tile.y + .5, .4);
  const traits = walkerTraits(walker.id);
  const walking = walker.pause === 0 && walker.step < walker.path.length - 1;
  const entering = walker.phase === 'arrive' && walker.step <= 1;
  const leaving = walker.phase === 'leave' && walker.path.length - 1 - walker.step <= 1;
  const parts = useRef<WalkerParts>({});
  const handOver = () => registerWalkerNode(walker.id, parts.current);
  useIsoLayout(handOver, []);
  useEffect(() => () => registerWalkerNode(walker.id, null), [walker.id]);
  return <g className={`customer-walker ${walking ? 'is-walking' : ''} ${entering ? 'is-entering' : ''} ${leaving ? 'is-leaving' : ''}`}>
    <g
      className="walker-motion" data-x={(px + traits.offsetX).toFixed(1)} data-y={(py + traits.offsetY).toFixed(1)}
      ref={node => { parts.current.motion = node; handOver(); }}
    >
      <ellipse
        className="customer-shadow" cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15"
        ref={node => { parts.current.shadow = node; handOver(); }}
      />
      <g className="walker-face" ref={node => { parts.current.face = node; handOver(); }}>
        <g className="customer-bob" transform={`scale(${traits.scale.toFixed(3)})`} ref={node => { parts.current.body = node; handOver(); }}>
          <PersonFigure
            color={walker.color} hair={traits.hair} walking={walking} waiting={walker.phase === 'queue'}
            carry={walker.customer && walker.serviceId?.startsWith('workbench') ? 'box' : 'bag'}
            parts={parts.current}
          />
        </g>
      </g>
    </g>
  </g>;
}

/** Which way one customer looks (the screen movement of its last step). */
export function stepFacing(walker: WalkerState): 'left' | 'right' {
  return facingOf(walker) < 0 ? 'left' : 'right';
}

/** A customer that simply stands where it is put (used for previews and tests). */
export function Walker({ px, py, color, walking, carry = 'bag', waiting = false }: { px: number; py: number; color: string; walking: boolean; carry?: 'bag' | 'box'; waiting?: boolean }) {
  return <g className={`customer-walker ${walking ? 'is-walking' : ''}`}>
    <g className="walker-motion" transform={`translate(${px.toFixed(2)}, ${py.toFixed(2)})`}>
      <ellipse className="customer-shadow" cx="0" cy="0" rx="10" ry="4.5" fill="#68768c" opacity=".15" />
      <g className={walking ? 'customer-bob' : ''}><PersonFigure color={color} carry={carry} waiting={waiting} walking={walking} /></g>
    </g>
  </g>;
}

/** The body of a person, drawn with the feet at the local origin. */
export function PersonFigure({ color, hair = '#59566c', staff = false, carry = 'bag', waiting = false, walking = false, parts }: { color: string; hair?: string; staff?: boolean; carry?: 'bag' | 'box' | 'none'; waiting?: boolean; walking?: boolean; parts?: WalkerParts }) {
  // Legs and arms hang on their own pivot so the walk cycle can swing them.
  const leg = (back: boolean) => <g key={back ? 'leg-back' : 'leg-front'} className={`person-leg ${back ? 'is-back' : ''} ${walking ? 'is-walking' : ''}`}
    ref={node => { if (parts) { if (back) parts.legBack = node; else parts.legFront = node; } }}>
    <path d={back ? 'M-3 -17l-1 14' : 'M6 -17l1 14'} stroke="#475168" strokeWidth="4.5" strokeLinecap="round" />
    <path d={back ? 'M-5 -2h-4' : 'M4 -2h4'} stroke="#354159" strokeWidth="3" strokeLinecap="round" />
  </g>;
  const arm = (back: boolean) => <g key={back ? 'arm-back' : 'arm-front'} className={`person-arm ${back ? 'is-back' : ''} ${walking ? 'is-walking' : ''}`}
    ref={node => { if (parts) { if (back) parts.armBack = node; else parts.armFront = node; } }}>
    <path d={back ? 'M-7 -31l-4 13' : 'M11 -31l4 13'} stroke={color} strokeWidth="5" strokeLinecap="round" />
  </g>;
  return <g className={`person-figure ${walking ? 'is-walking' : ''} ${waiting ? 'customer-waiting' : ''}`}>
    {leg(true)}{leg(false)}
    {arm(true)}{arm(false)}
    <path d="M-7 -32q7-5 14 0l1 17q-8 4-16 0z" fill={color} />
    {staff && <path d="M-4 -29h8l3 14h-14z" fill="#f2f1db" opacity=".9" />}
    <rect x="-2.5" y="-38" width="5" height="7" rx="2" fill="#e6b694" />
    <ellipse cx="0" cy="-42" rx="7" ry="8" fill="#efc4a3" />
    <path d="M-7 -42q-1-12 9-9q8 1 5 9l-3-5-6 1z" fill={staff ? '#665542' : hair} />
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
