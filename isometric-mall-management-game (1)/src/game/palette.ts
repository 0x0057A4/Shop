import type { ShopColors } from './data';

/** A colour as numbers, for mixing. */
const channels = (hex: string) => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const num = Number.parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(value => clamp(value).toString(16).padStart(2, '0')).join('')}`;

/** Mixes a colour towards white (`amount` > 0) or towards black (`amount` < 0). */
export function shade(hex: string, amount: number) {
  const { r, g, b } = channels(hex);
  const mix = (value: number) => amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
  return toHex(mix(r), mix(g), mix(b));
}

/** Mixes two colours: `amount` 0 keeps the first, 1 gives the second. */
export function mix(first: string, second: string, amount: number) {
  const a = channels(first), b = channels(second);
  return toHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
}

export interface ShopPalette {
  /** The wall colour the player chose. */
  wall: string;
  /** Lit wall faces and top edges. */
  wallLight: string;
  wallTop: string;
  /** Shadowed wall faces. */
  wallDeep: string;
  /** Sales floor: two shades for the chequered tiles. */
  floorA: string;
  floorB: string;
  /** The platform the shop stands on. */
  baseTop: string;
  baseLeft: string;
  baseRight: string;
  /** Small helper for light or dark surroundings. */
  outdoor: number;
}

/**
 * All shades of a shop, derived from the two colours the player picked.
 * A dark interface dims the surroundings a little, the shop keeps its colours.
 */
export function shopPalette(colors: ShopColors, _dark = false): ShopPalette {
  // The shop itself always stays in the player's colours – like a lit shop in a
  // dark mall. Only the world around it is dimmed (see `.mall-ground`).
  const wall = colors.wall;
  const floor = colors.floor;
  return {
    wall,
    wallLight: shade(wall, .14),
    wallTop: shade(wall, .24),
    wallDeep: shade(wall, -.16),
    floorA: floor,
    floorB: shade(floor, .06),
    baseTop: shade(floor, -.06),
    baseLeft: shade(floor, -.2),
    baseRight: shade(floor, -.1),
    outdoor: _dark ? 1 : 0,
  };
}
