import { SHOPS, roundCents } from './data';
import type { PlaceableKind, Placement, Shop, ShopKind } from './data';
import { BASE_GRID, freeSides, gridOf, isWalkable, neighbours, pieceCount, placeOf, footprint, tileKey } from './layout';
import type { Grid, Tile } from './layout';

/** How many customers fit into one line at a service. */
export const QUEUE_LENGTH = 4;

export interface ServiceInfo {
  id: string;
  kind: PlaceableKind;
  place: Placement;
  label: string;
  /** What the customers hand over: a purchase or a service job. */
  job: string;
}

export const BILLS = [100, 50, 20, 10, 5];
export const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05];
export const DENOMINATIONS = [...BILLS, ...COINS];

export interface BasketLine { itemId: string; name: string; quantity: number; price: number }

export interface QueueCustomer {
  /** Id of the walker this order belongs to. */
  walker: number;
  serviceId: string;
  label: string;
  method: 'cash' | 'card';
  lines: BasketLine[];
  total: number;
  /** Only for cash: the note the customer hands over. */
  handed: number;
}

export const serviceJobLabel = (kind: ShopKind, serviceKind: PlaceableKind) => {
  if (serviceKind === 'register') return 'Einkauf';
  return kind === 'it' ? 'Reparaturannahme' : kind === 'tcg' ? 'Karten-Grading' : 'Tortenbestellung';
};

export const serviceTitle = (kind: ShopKind, serviceKind: PlaceableKind) => {
  if (serviceKind === 'register') return 'Kasse';
  return kind === 'it' ? 'Reparaturbank' : kind === 'tcg' ? 'Sortiertisch' : 'Backstation';
};

/** The two counters where customers queue up: the till and the first workbench. */
export function servicePieces(kind: ShopKind, shop: Shop): ServiceInfo[] {
  const wanted: { id: string; kind: PlaceableKind }[] = [{ id: 'register-0', kind: 'register' }];
  if (pieceCount(shop, 'workbench') > 0) wanted.push({ id: 'workbench-0', kind: 'workbench' });
  return wanted.map(entry => {
    const piece = { id: entry.id, kind: entry.kind, index: 0 };
    return {
      id: entry.id,
      kind: entry.kind,
      place: placeOf(shop.layout, piece),
      label: serviceTitle(kind, entry.kind),
      job: serviceJobLabel(kind, entry.kind),
    };
  });
}

/**
 * The line in front of a service, ordered from the counter outwards. The first
 * spot is right in front of the piece, the rest follow the free floor.
 */
export function queueSpots(info: ServiceInfo, blocked: Set<string>, count = QUEUE_LENGTH, grid: Grid = BASE_GRID): Tile[] {
  const sides = freeSides(info.place, info.kind, blocked, grid);
  if (!sides.length) return [];
  const size = footprint(info.kind, info.place.rot);
  const center = info.place.x + size.w / 2 + info.place.y + size.d / 2;
  const front = [...sides].sort((a, b) => (b.x + b.y) - (a.x + a.y))[0];
  const spots: Tile[] = [front];
  const used = new Set([tileKey(front)]);
  while (spots.length < count) {
    const last = spots[spots.length - 1];
    const options = neighbours(last).filter(tile => !used.has(tileKey(tile)) && isWalkable(tile, blocked, grid) && tile.x + tile.y > center + .4);
    if (!options.length) break;
    const next = options.sort((a, b) => (b.x + b.y) - (a.x + a.y))[0];
    spots.push(next);
    used.add(tileKey(next));
  }
  return spots;
}

export interface ServiceQueue { info: ServiceInfo; spots: Tile[] }

/** Queue spots for every service, without overlaps between the two lines. */
export function serviceQueues(kind: ShopKind, shop: Shop, blocked: Set<string>): ServiceQueue[] {
  const used = new Set<string>();
  return servicePieces(kind, shop).map(info => {
    const extra = new Set(blocked);
    used.forEach(key => extra.add(key));
    const spots = queueSpots(info, extra, QUEUE_LENGTH, gridOf(shop));
    spots.forEach(spot => used.add(tileKey(spot)));
    return { info, spots };
  });
}

/** The next note a customer would have in their wallet. */
export function nextBill(total: number) {
  return BILLS.find(bill => bill >= total) ?? Math.ceil(total / 10) * 10;
}

function shuffle<T>(list: T[]) {
  return [...list].sort(() => Math.random() - .5);
}

/** Builds the order a customer brings to a counter. Returns null when there is nothing to do. */
export function makeCustomer(kind: ShopKind, shop: Shop, info: ServiceInfo, walker: number): QueueCustomer | null {
  const method: QueueCustomer['method'] = Math.random() < .55 ? 'cash' : 'card';
  let lines: BasketLine[] = [];
  if (info.kind === 'register') {
    const products = SHOPS[kind].items.filter(item => item.category === 'product' && (shop.stock[item.id] || 0) > 0);
    if (!products.length) return null;
    const wanted = Math.random() < .45 ? 2 : 1;
    lines = shuffle(products).slice(0, wanted).map(item => ({
      itemId: item.id, name: item.name, quantity: 1, price: roundCents(item.price * shop.price),
    }));
  } else {
    const price = roundCents((kind === 'tcg' ? 24 : kind === 'it' ? 96 : 18) * shop.price);
    lines = [{ itemId: 'service', name: info.job, quantity: 1, price }];
  }
  const total = roundCents(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
  if (total <= 0) return null;
  return {
    walker, serviceId: info.id, label: info.job, method, lines, total,
    handed: method === 'cash' ? nextBill(total) : 0,
  };
}

/** How much change the customer expects back. */
export const changeFor = (customer: QueueCustomer) => Math.max(0, roundCents(customer.handed - customer.total));

/** Greedy change: the smallest possible number of coins and notes. */
export function minimalChange(amount: number) {
  let rest = Math.round(amount * 100);
  const pieces: number[] = [];
  DENOMINATIONS.forEach(denomination => {
    const cents = Math.round(denomination * 100);
    while (rest >= cents) { rest -= cents; pieces.push(denomination); }
  });
  return pieces;
}

/** Splits a line of waiting customers into the walkable spots of a service. */
export const spotFor = (spots: Tile[], index: number) => (index >= 0 && index < spots.length ? spots[index] : null);
