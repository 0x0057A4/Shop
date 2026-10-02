import { SHOPS } from './data';
import type { Shop, ShopKind, TradingCard } from './data';

export type VisibleGood =
  | { type: 'item'; id: string }
  | { type: 'card'; id: string; element: TradingCard['element']; rarity: TradingCard['rarity']; name: string };

export interface ShopDisplay {
  showcase: VisibleGood[];
  center: VisibleGood[];
  shelves: VisibleGood[][];
  materials: VisibleGood[];
  workbench: VisibleGood[];
}

const preferred: Record<ShopKind, { showcase: string[]; center: string[]; shelf: string[] }> = {
  tcg: {
    showcase: ['graded', 'single', 'deck', 'booster', 'sleeves'],
    center: ['booster', 'deck', 'sleeves', 'single', 'graded'],
    shelf: ['booster', 'sleeves', 'single', 'deck', 'graded'],
  },
  it: {
    showcase: ['notebook', 'pc', 'ram'],
    center: ['pc', 'notebook', 'ram'],
    shelf: ['ram', 'notebook', 'pc'],
  },
  bakery: {
    showcase: ['croissant', 'cake', 'bread'],
    center: ['bread', 'croissant', 'cake'],
    shelf: ['bread', 'croissant', 'cake'],
  },
};

export function createShopDisplay(kind: ShopKind, shop: Shop): ShopDisplay {
  // A physical miniature always consumes one real item, so no product can appear
  // more often in the scene than it exists in this shop's sellable inventory.
  const remaining = Object.fromEntries(SHOPS[kind].items.filter(item => item.category === 'product').map(item => [item.id, Math.max(0, Math.floor(shop.stock[item.id] || 0))]));
  const listedCards = kind === 'tcg'
    ? shop.cards.filter(card => card.listed && !card.sold).sort((a, b) => b.value - a.value)
    : [];

  function take(order: string[], count: number): VisibleGood[] {
    const units: VisibleGood[] = [];
    while (units.length < count && order.some(id => remaining[id] > 0)) {
      for (const id of order) {
        if (units.length >= count) break;
        if (remaining[id] > 0) {
          remaining[id]--;
          units.push({ type: 'item', id });
        }
      }
    }
    return units;
  }

  function takeCards(count: number): VisibleGood[] {
    return listedCards.splice(0, count).map(card => ({
      type: 'card', id: card.id, element: card.element, rarity: card.rarity, name: card.name,
    }));
  }

  const showcase = takeCards(3);
  showcase.push(...take(preferred[kind].showcase, 5 - showcase.length));
  showcase.push(...takeCards(5 - showcase.length));

  const center = take(preferred[kind].center, 3);
  center.push(...takeCards(3 - center.length));

  const shelves = Array.from({ length: shop.furniture.shelf }, (_, index) => {
    const order = preferred[kind].shelf;
    const rotated = [...order.slice(index % order.length), ...order.slice(0, index % order.length)];
    const units = take(rotated, 9);
    units.push(...takeCards(9 - units.length));
    return units;
  });

  const materials: VisibleGood[] = SHOPS[kind].items
    .filter(item => item.category === 'material' && (shop.stock[item.id] || 0) > 0)
    .map(item => ({ type: 'item', id: item.id }));
  const intermediate = kind === 'bakery' ? 'dough' : kind === 'it' ? 'motherboard' : null;
  const workbench: VisibleGood[] = !shop.queue.length && intermediate && shop.stock[intermediate] > 0
    ? [{type: 'item', id: intermediate}]
    : [];

  return { showcase, center, shelves, materials, workbench };
}

export function displayedQuantity(display: ShopDisplay, good: VisibleGood) {
  return [...display.showcase, ...display.center, ...display.shelves.flat(), ...display.materials, ...display.workbench].filter(unit => unit.type === good.type && unit.id === good.id).length;
}