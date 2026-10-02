import type { Placement, ShelfTier, Shop, ShopKind } from '../game/data';
import { SHOPS } from '../game/data';
import type { Piece } from '../game/layout';
import { FLOOR_Z } from '../game/layout';
import type { ShopDisplay, VisibleGood } from '../game/visualInventory';
import { SHELF_SHAPE, refillStack, shelfTierOf } from '../game/visualInventory';
import { GoodFigure } from './IsoGoods';
import { Cube, p, pts } from './isoGeometry';

/**
 * Every piece is designed in local tile coordinates (u = width, v = depth) and
 * placed on the floor through this small helper. Rotating a piece simply swaps
 * the axes, so all geometry below stays readable.
 */
export interface Local { tx: number; ty: number; rot: 0 | 1 }

export const lx = (l: Local, u: number, v: number) => (l.rot === 0 ? l.tx + u : l.tx + v);
export const ly = (l: Local, u: number, v: number) => (l.rot === 0 ? l.ty + v : l.ty + u);
export const q = (l: Local, u: number, v: number, z = FLOOR_Z) => p(lx(l, u, v), ly(l, u, v), z);
export const flat = (l: Local, corners: [number, number, number][]) => pts(corners.map(([u, v, z]) => q(l, u, v, z)));

export function Box({ l, u, v, w, d, h, z = FLOOR_Z, top, left, right, opacity }: { l: Local; u: number; v: number; w: number; d: number; h: number; z?: number; top?: string; left?: string; right?: string; opacity?: number }) {
  return <Cube x={lx(l, u, v)} y={ly(l, u, v)} z={z} w={l.rot === 0 ? w : d} d={l.rot === 0 ? d : w} h={h} top={top} left={left} right={right} opacity={opacity} />;
}

function Face({ l, corners, fill, opacity, stroke, strokeWidth }: { l: Local; corners: [number, number, number][]; fill: string; opacity?: number; stroke?: string; strokeWidth?: number }) {
  return <polygon points={flat(l, corners)} fill={fill} opacity={opacity} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
  const [px, py] = p(x + 0.22, y + 0.22, big ? 1.6 : 1.2);
  return <g>
    <ellipse cx={p(x, y)[0]} cy={p(x, y)[1] + 2} rx={big ? 26 : 17} ry={8} fill="#6c8c7b" opacity=".12" />
    <Cube x={x} y={y} w={0.46} d={0.46} h={0.48} top="#e7c6ae" left="#bd8b74" right="#dca88d" />
    <path d={`M${px} ${py + 32}v-30m0 20l-14-12m14 8l14-18`} stroke="#4c7a5e" strokeWidth="3" fill="none" />
    <g className="plant-leaves" style={{ transformOrigin: `${px}px ${py + 15}px` }}>
      <ellipse cx={px - 11} cy={py + 7} rx={big ? 14 : 9} ry={big ? 21 : 14} transform={`rotate(-40 ${px - 11} ${py + 7})`} fill="#639d75" />
      <ellipse cx={px + 13} cy={py + 1} rx={big ? 15 : 9} ry={big ? 22 : 14} transform={`rotate(40 ${px + 13} ${py + 1})`} fill="#7daf87" />
      <ellipse cx={px} cy={py - 5} rx={big ? 16 : 9} ry={big ? 23 : 15} fill="#88b995" />
      <path d={`M${px} ${py + 15}v-27`} stroke="#689c76" strokeWidth="1.4" />
    </g>
  </g>;
}

export function Tree({ x, y }: { x: number; y: number }) {
  const [px, py] = p(x, y, 0.1);
  return <g>
    <ellipse cx={px + 7} cy={py + 4} rx="37" ry="14" fill="#719680" opacity=".12" />
    <path d={`M${px} ${py}v-50m0 23l-14-20m14 16l17-22`} stroke="#9a9277" strokeWidth="6" strokeLinecap="round" />
    <ellipse cx={px - 19} cy={py - 57} rx="27" ry="28" fill="#8cb796" />
    <ellipse cx={px + 17} cy={py - 62} rx="28" ry="30" fill="#97c0a0" />
    <ellipse cx={px - 1} cy={py - 78} rx="29" ry="29" fill="#a3caa8" />
    <ellipse cx={px + 8} cy={py - 83} rx="18" ry="18" fill="#b0d3b2" opacity=".6" />
  </g>;
}

const rackColors = (kind: ShopKind) => kind === 'tcg'
  ? { dark: '#9a85b7', light: '#d1c1e1', top: '#dfd4ea' }
  : kind === 'it'
    ? { dark: '#7c9ba9', light: '#b6cbd3', top: '#d0dce3' }
    : { dark: '#b38c6d', light: '#d4b699', top: '#e9d2b4' };

/**
 * A shelf, drawn in the size it was bought in: a small half-height shelf or a
 * tall one. Each slot can hold a stack of goods when somebody keeps the shelves
 * filled, so the shop looks stocked.
 */
export function Rack({ place, kind, shop, units, tier = 1, stack = 1, onInspect, selected }: { place: Placement; kind: ShopKind; shop: Shop; units: VisibleGood[]; tier?: ShelfTier; stack?: number; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null }) {
  const c = rackColors(kind);
  const shape = SHELF_SHAPE[tier];
  const alongY = place.rot === 1;
  const ox = place.x + (alongY ? .175 : .16), oy = place.y + (alongY ? .16 : .175);
  const base = alongY ? .65 : 1.68, depth = alongY ? 1.68 : .65;
  // A small shelf keeps a little air above the goods, a tall one reaches higher.
  const height = shape.height;
  const w = alongY ? (tier === 1 ? .55 : base) : (tier === 1 ? 1.7 : base);
  const d = alongY ? (tier === 1 ? 1.7 : depth) : (tier === 1 ? .55 : depth);
  const levels = Array.from({ length: shape.rows }, (_, row) => .42 + row * (tier === 1 ? .42 : .64));
  return <g>
    <Cube x={ox} y={oy} w={w} d={d} h={height} top={c.top} left={c.dark} right={c.light} />
    {levels.map((z, row) => <g key={z}>
      <Cube x={ox + .03} y={oy + .03} z={z} w={w - .06} d={d + .04} h={.075} top={c.top} left={c.light} right={c.top} />
      {Array.from({ length: shape.columns }, (_, column) => {
        const slot = row * shape.columns + column;
        const step = (alongY ? d : w) / shape.columns;
        const offset = (alongY ? d : w) / shape.columns / 2;
        return Array.from({ length: stack }, (_, pile) => {
          const unit = units[slot * stack + pile];
          if (!unit) return null;
          const spot = .12 + column * step + offset - .06 + pile * .12;
          return <GoodFigure key={`${row}-${column}-${pile}-${unit.id}`}
            x={ox + (alongY ? .13 + pile * .1 : spot)}
            y={oy + (alongY ? spot : .28 + pile * .12)}
            z={z + .085 + pile * .16}
            kind={kind} good={unit} count={unit.type === 'card' ? 1 : shop.stock[unit.id]}
            selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />;
        });
      })}
    </g>)}
    <Cube x={ox} y={oy} z={height + .39} w={w} d={d} h={.1} top={c.top} left={c.light} right={c.light} />
  </g>;
}

/** Raw material crate: tall and narrow, goods lined up along the long side. */
export function MaterialsShelf({ place, kind, units, shop, onInspect, selected }: { place: Placement; kind: ShopKind; units: VisibleGood[]; shop: Shop; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null }) {
  const l: Local = { tx: place.x, ty: place.y, rot: place.rot };
  const top = kind === 'tcg' ? '#d7c9e2' : kind === 'it' ? '#bbd0d4' : '#e5cfb1';
  const shown = units.slice(0, 5);
  return <g>
    <Box l={l} u={.17} v={.05} w={.65} d={1.9} h={.42} top={top} left="#b9afa7" right="#cbbfae" />
    <Box l={l} u={.16} v={.03} z={.79} w={.68} d={1.94} h={.07} top="#eee9df" left="#d3c8be" right="#e4dace" />
    {shown.map((unit, i) => <GoodFigure key={`material-${i}-${unit.id}`} x={lx(l, .315, .32 + i * .34)} y={ly(l, .315, .32 + i * .34)} z={.88} kind={kind} good={unit} count={shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />)}
  </g>;
}

/** Glass display case in the front area. */
export function ShowcaseCabinet({ place, kind, units, shop, stack = 1, onInspect, selected }: { place: Placement; kind: ShopKind; units: VisibleGood[]; shop: Shop; stack?: number; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null }) {
  const l: Local = { tx: place.x, ty: place.y, rot: place.rot };
  const left = kind === 'tcg' ? '#c1afd7' : kind === 'it' ? '#a1bfcd' : '#d9b99a';
  const right = kind === 'tcg' ? '#d4c2e4' : kind === 'it' ? '#c3d9e0' : '#e9d1b4';
  return <g>
    <Box l={l} u={.2} v={.1} w={2.6} d={.95} h={.62} top="#d1bdde" left={left} right={right} />
    {units.map((unit, i) => {
      const slot = Math.floor(i / stack), pile = i % stack;
      const u = .34 + slot * .48 + pile * .16, v = .35 - pile * .12;
      return <GoodFigure key={`showcase-${i}-${unit.id}`} x={lx(l, u, v)} y={ly(l, u, v)} z={1.01 + pile * .2} good={unit} kind={kind} count={unit.type === 'card' ? 1 : shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />;
    })}
    <g pointerEvents="none">
      <Box l={l} u={.2} v={.1} z={1.0} w={2.6} d={.95} h={.53} top="#eaf3f3" left="#d7eeee" right="#c9e4e9" opacity={.3} />
      <polyline points={flat(l, [[.2, 1.05, 1], [.2, 1.05, 1.53], [2.8, 1.05, 1.53], [2.8, 1.05, 1]])} fill="none" stroke="#f8f6fd" strokeWidth="2" />
    </g>
  </g>;
}

/** Free-standing middle display for the newest highlights. */
export function CenterDisplay({ place, kind, units, shop, onInspect, selected }: { place: Placement; kind: ShopKind; units: VisibleGood[]; shop: Shop; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null }) {
  const l: Local = { tx: place.x, ty: place.y, rot: place.rot };
  const top = kind === 'it' ? '#c9dce2' : kind === 'tcg' ? '#e0d3ea' : '#e9d6ba';
  const left = kind === 'it' ? '#92b5c2' : kind === 'tcg' ? '#bda9d1' : '#cfac86';
  const right = kind === 'it' ? '#aecdd5' : kind === 'tcg' ? '#cab9dc' : '#dcc19c';
  return <g>
    <Box l={l} u={.4} v={.05} w={1.2} d={.9} h={.67} top={top} left={left} right={right} />
    {units.map((unit, i) => <GoodFigure key={`center-${i}-${unit.id}`} x={lx(l, .45 + i * .4, .32)} y={ly(l, .45 + i * .4, .32)} z={1.06} good={unit} kind={kind} count={unit.type === 'card' ? 1 : shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />)}
  </g>;
}

/** Checkout counter. Higher levels add extra screens on the same counter. */
export function Counter({ place, kind, level, accent }: { place: Placement; kind: ShopKind; level: number; accent: string }) {
  const l: Local = { tx: place.x + (place.rot === 0 ? .075 : .01), ty: place.y + (place.rot === 0 ? .01 : .075), rot: place.rot };
  const right = kind === 'tcg' ? '#ac94cb' : kind === 'it' ? '#8bb0c4' : '#e0b789';
  const extra = (u: number, w: number) => <g><Box l={l} u={u} v={.39} z={1.62} w={w} d={.12} h={.38} top="#536471" left="#354b54" right="#576a71" /><Face l={l} corners={[[u + .04, .52, 1.69], [u + .04 + w, .52, 1.69], [u + .04 + w, .52, 1.96], [u + .04, .52, 1.96]]} fill="#a7d8c6" /></g>;
  return <g>
    <Box l={l} u={0} v={0} w={2.85} d={.98} h={1.0} top="#f0e5ef" left={accent} right={right} />
    <Box l={l} u={-.09} v={-.06} z={1.37} w={3.03} d={1.1} h={.12} top="#f7f0f8" left="#e0d3e9" right="#e8ddf0" />
    <Face l={l} corners={[[.23, .98, .75], [2.58, .98, .75], [2.58, .98, 1.14], [.23, .98, 1.14]]} fill="#ffffff" opacity={.13} />
    <Box l={l} u={2.03} v={.2} z={1.5} w={.16} d={.2} h={.25} top="#6b7683" left="#5b6577" right="#85919a" />
    <Box l={l} u={1.85} v={.3} z={1.66} w={.64} d={.12} h={.46} top="#536471" left="#354b54" right="#576a71" />
    <Face l={l} corners={[[1.9, .43, 1.73], [2.43, .43, 1.73], [2.43, .43, 2.06], [1.9, .43, 2.06]]} fill="#a7d8c6" />
    {level > 1 && extra(1.08, .48)}
    {level > 2 && extra(.37, .43)}
    <Box l={l} u={.33} v={.26} z={1.49} w={.55} d={.4} h={.18} top="#e3d5a1" left="#c7b884" right="#d8c993" />
  </g>;
}

export interface StationView { good: VisibleGood | null; progress: number; active: boolean; working: boolean }

/** The production stations: the first one is the big workbench, the rest are desks. */
export function WorkbenchStation({ place, kind, index, station, accent, selected, onInspect }: { place: Placement; kind: ShopKind; index: number; station: StationView; accent: string; selected: VisibleGood | null; onInspect?: (good: VisibleGood) => void }) {
  const l: Local = { tx: place.x, ty: place.y, rot: place.rot };
  const goodNode = (u: number, v: number, z: number) => station.good
    ? <GoodFigure x={lx(l, u, v)} y={ly(l, u, v)} z={z} good={station.good} kind={kind} inProgress={station.working} onInspect={station.working ? undefined : onInspect} selected={!station.working && !!selected && selected.type === station.good.type && selected.id === station.good.id} />
    : null;
  if (index === 0) {
    const it = kind === 'it', tcg = kind === 'tcg';
    return <g>
      <Box l={l} u={.08} v={.05} w={1.84} d={.86} h={.92} top="#ede2d3" left={it ? '#90adb9' : '#bcaa9b'} right={it ? '#a3bec8' : '#cec0ad'} />
      <Box l={l} u={.04} v={.01} z={1.28} w={1.94} d={.94} h={.12} top="#f4eee6" left="#e1d5c5" right="#e7ddd0" />
      {it ? <g>
        <Box l={l} u={.45} v={.22} z={1.41} w={.86} d={.16} h={.68} top="#566c80" left="#344c61" right="#496376" />
        <Face l={l} corners={[[.52, .385, 1.53], [1.24, .385, 1.53], [1.24, .385, 2.01], [.52, .385, 2.01]]} fill={station.active ? '#98d4d9' : '#839da4'} />
        <polyline points={flat(l, [[.58, .39, 1.71], [.72, .39, 1.71], [.79, .39, 1.85], [.89, .39, 1.66], [.98, .39, 1.77], [1.14, .39, 1.77]])} fill="none" stroke={station.active ? '#e0f9e7' : '#b9ced0'} strokeWidth="1.6" />
        {goodNode(1.45, .22, 1.41) || <g><Box l={l} u={1.48} v={.2} z={1.41} w={.47} d={.36} h={.02} top="#5d918d" /><path d={`M${pts([q(l, 1.7, .28, 1.44), q(l, 1.9, .5, 1.5)])}`} stroke="#c4a8a0" strokeWidth="2" /></g>}
      </g> : tcg ? <g>
        <Box l={l} u={.34} v={.16} z={1.42} w={1.55} d={.72} h={.025} top="#a996c7" />
        <Box l={l} u={.47} v={.36} z={1.46} w={.56} d={.34} h={.08} top="#756196" left="#61517f" right="#8a78a6" />
        <polyline points={flat(l, [[.53, .71, 1.51], [.95, .71, 1.51]])} stroke="#e1cb9a" strokeWidth="1" />
        {goodNode(1.4, .25, 1.46)}
      </g> : <g>
        <Box l={l} u={.15} v={.05} z={1.4} w={1.05} d={.66} h={.94} top="#9eafb2" left="#6b8185" right="#8c9da0" />
        <Face l={l} corners={[[.26, .72, 1.54], [1.1, .72, 1.54], [1.1, .72, 2.07], [.26, .72, 2.07]]} fill="#475f66" stroke="#bbcbca" strokeWidth={2} />
        <Face l={l} corners={[[.33, .725, 1.65], [1.03, .725, 1.65], [1.03, .725, 1.9], [.33, .725, 1.9]]} fill={station.active ? '#e8ab60' : '#53676a'} opacity={.85} />
        {goodNode(1.5, .25, 1.42) || <ellipse cx={q(l, 1.68, .45, 1.42)[0]} cy={q(l, 1.68, .45, 1.42)[1]} rx="11" ry="5" fill="#d2c0a8" />}
      </g>}
      <polyline points={flat(l, [[.12, .93, 1.03], [1.88, .93, 1.03]])} stroke={accent} strokeWidth="2.6" strokeLinecap="round" opacity=".2" />
      {station.progress > 0 && <polyline points={flat(l, [[.12, .93, 1.04], [.12 + 1.76 * station.progress, .93, 1.04]])} stroke={accent} strokeWidth="2.6" strokeLinecap="round" className="production-light" />}
      <circle cx={q(l, 1.9, .5, 1.2)[0]} cy={q(l, 1.9, .5, 1.2)[1]} r="3" fill={station.active ? '#b4e4a5' : '#dbe3cf'} className={station.active ? 'production-light' : ''} />
    </g>;
  }
  return <g>
    <Box l={l} u={.25} v={.1} w={1.5} d={.8} h={.78} top="#f0e5d9" left="#baa997" right="#d4c3af" />
    {goodNode(.73, .3, 1.16) || <g><Box l={l} u={.59} v={.26} z={1.16} w={.67} d={.39} h={.02} top={accent} opacity={.55} /><polyline points={flat(l, [[.74, .35, 1.2], [1.05, .53, 1.2]])} stroke="#f9f5e8" strokeWidth="1" /></g>}
    {station.progress > 0 && <polyline points={flat(l, [[.3, .92, .9], [.3 + 1.4 * station.progress, .92, .9]])} stroke={accent} strokeWidth="2.2" strokeLinecap="round" className="production-light" />}
  </g>;
}

/** Little A-frame board that welcomes customers in. */
function InfoSign({ place }: { place: Placement }) {
  const l: Local = { tx: place.x + .5, ty: place.y + .3, rot: 0 };
  return <g>
    <polygon points={flat(l, [[-.24, .42, .02], [.24, .42, .02], [.24, .05, .62], [-.24, .05, .62]])} fill="#f6efdd" stroke="#d7c6a2" strokeWidth="1" />
    <polygon points={flat(l, [[.24, -.02, .02], [-.24, -.02, .02], [-.24, .35, .62], [.24, .35, .62]])} fill="#e7dcc2" stroke="#d7c6a2" strokeWidth="1" />
    <circle cx={q(l, 0, .2, .42)[0]} cy={q(l, 0, .2, .42)[1]} r="2.4" fill="#8fae7f" />
    <polyline points={flat(l, [[-.12, .2, .24], [.12, .2, .24]])} stroke="#b7c6a4" strokeWidth="1.6" />
    <polyline points={flat(l, [[-.12, .2, .36], [.06, .2, .36]])} stroke="#cbd7ba" strokeWidth="1.6" />
  </g>;
}

/** Neon star on a small stand. */
function NeonStar({ place, accent }: { place: Placement; accent: string }) {
  const base = p(place.x + .5, place.y + .5, FLOOR_Z);
  const top = p(place.x + .5, place.y + .5, 2.2);
  return <g>
    <ellipse cx={base[0]} cy={base[1] + 2} rx="10" ry="4" fill="#68768c" opacity=".12" />
    <Cube x={place.x + .38} y={place.y + .38} w={.24} d={.24} h={.14} top="#d8cfc4" left="#b2a79c" right="#c8bdb1" />
    <path d={`M${base[0]} ${base[1]}V${top[1]}`} stroke="#b0a897" strokeWidth="2.4" />
    <g transform={`translate(${top[0]},${top[1]}) rotate(26.565)`}>
      <path d="M0-13l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="none" stroke="#fff5d5" strokeWidth="3" />
      <path d="M0-13l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="none" stroke={accent} strokeWidth="1" />
    </g>
  </g>;
}

/** Decorative extras: two plants, a welcome sign and a neon star. */
export function DecorPiece({ place, index, accent }: { place: Placement; index: number; accent: string }) {
  if (index % 4 === 1) return <InfoSign place={place} />;
  if (index % 4 === 2) return <Plant x={place.x + .18} y={place.y + .18} big />;
  if (index % 4 === 3) return <NeonStar place={place} accent={accent} />;
  return <Plant x={place.x + .26} y={place.y + .26} />;
}

export function PieceView({ piece, place, shopKind, shop, display, stations, selected, onInspect }: {
  piece: Piece;
  place: Placement;
  shopKind: ShopKind;
  shop: Shop;
  display: ShopDisplay;
  stations: StationView[];
  selected: VisibleGood | null;
  onInspect?: (good: VisibleGood) => void;
}) {
  const accent = SHOPS[shopKind].color;
  if (piece.kind === 'shelf') return <Rack place={place} kind={shopKind} shop={shop} units={display.shelves[piece.index] || []} tier={shelfTierOf(shop, piece.index)} stack={refillStack(shop)} onInspect={onInspect} selected={selected} />;
  if (piece.kind === 'materials') return <MaterialsShelf place={place} kind={shopKind} units={display.materials} shop={shop} onInspect={onInspect} selected={selected} />;
  if (piece.kind === 'showcase') return <ShowcaseCabinet place={place} kind={shopKind} units={display.showcase} shop={shop} stack={refillStack(shop)} onInspect={onInspect} selected={selected} />;
  if (piece.kind === 'center') return <CenterDisplay place={place} kind={shopKind} units={display.center} shop={shop} onInspect={onInspect} selected={selected} />;
  if (piece.kind === 'register') return <Counter place={place} kind={shopKind} level={shop.furniture.register} accent={accent} />;
  if (piece.kind === 'workbench') return <WorkbenchStation place={place} kind={shopKind} index={piece.index} station={stations[piece.index] || { good: null, progress: 0, active: false, working: false }} accent={accent} selected={selected} onInspect={onInspect} />;
  return <DecorPiece place={place} index={piece.index} accent={accent} />;
}
