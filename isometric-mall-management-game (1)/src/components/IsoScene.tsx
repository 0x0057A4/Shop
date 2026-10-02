import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { FurnitureKind, GameState, PlaceableKind, Placement, Shop, ShopKind } from '../game/data';
import { DEFAULT_SHOP_COLORS, SHOPS, SHOP_ORDER } from '../game/data';
import type { VisibleGood } from '../game/visualInventory';
import { createShopDisplay } from '../game/visualInventory';
import { shade, shopPalette } from '../game/palette';
import { normalizeColors } from '../game/engine';
import type { Grid, Piece } from '../game/layout';
import { FLOOR_Z, PLACE_LABELS, blockedTiles, doorTiles, footprint, freeSides, gridFor, gridOf, piecesOf, placeOf, placementFits } from '../game/layout';
import { ARRANGE_KEYS, PICK_HEIGHT, canRotate, moveTarget, pickBox, pickPiece, rotateTarget } from './Arrange';
import { serviceQueues } from '../game/services';
import { staffRole } from '../game/engine';
import { PieceView, Plant, Tree } from './ShopPieces';
import type { StationView } from './ShopPieces';
import { CustomerGroup, Person } from './Customers';
import type { CrowdState } from './Customers';
import { Cube, p, pts, polygon } from './isoGeometry';

function Bench({ x, y }: { x: number; y: number }) {
  return <g>
    <Cube x={x+.12} y={y+.06} z={.08} w={.13} d={.56} h={.4} top="#8a9690" left="#8a9690" right="#697e76" />
    <Cube x={x+1.5} y={y+.06} z={.08} w={.13} d={.56} h={.4} top="#8a9690" left="#8a9690" right="#697e76" />
    <Cube x={x} y={y} z={.5} w={1.85} d={.7} h={.13} top="#d8bd92" left="#b49a75" right="#c5aa81" />
    <Cube x={x} y={y} z={.74} w={1.85} d={.12} h={.45} top="#e1caa5" left="#c7ab83" right="#d7bd95" />
    {[.22,.44].map(v => <polyline key={v} points={pts([p(x,y+v,.636),p(x+1.85,y+v,.636)])} fill="none" stroke="#b79c73" strokeWidth="1" />)}
  </g>;
}

type Interaction = (target: 'furnishing' | 'production' | 'special' | 'expand' | 'inventory', furniture?: FurnitureKind) => void;
function Hotspot({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return <g className={onClick ? 'iso-hotspot' : ''} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={label} onClick={onClick} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}><title>{label}</title>{children}</g>;
}

/** Extra height of a piece in screen pixels, used for its grab area while arranging. */
interface DragState { id: string; kind: Piece['kind']; from: Placement; place: Placement; startX: number; startY: number; valid: boolean }

/**
 * How far the pointer moved since it grabbed the piece, converted into tiles.
 * The two floor axes lean against each other on screen, so a screen step of
 * (+32, +16) is one tile to the right and one tile towards the viewer.
 */
export function dragPlace(from: Placement, start: { x: number; y: number }, point: { x: number; y: number }): Placement {
  const dux = (point.x - start.x) / 32;
  const duy = (point.y - start.y) / 16;
  return { x: from.x + Math.round((dux + duy) / 2), y: from.y + Math.round((duy - dux) / 2), rot: from.rot };
}

/** What the toolbar outside the scene needs to know about the arrangement. */
export interface ArrangeInfo { id: string; kind: PlaceableKind; label: string; rot: 0 | 1; canRotate: boolean }

/** Imperative handle for the arrange toolbar. */
export interface ArrangeApi {
  rotate: () => void;
  move: (dx: number, dy: number) => void;
  select: (id: string) => void;
  clear: () => void;
  cancel: () => void;
}

/** A service point (till, workbench) the player can click on directly. */
export interface ServiceSpot { id: string; label: string; count: number }

/**
 * The camera of the shop view. Everything that belongs to the scene – walls,
 * pavement, benches and trees – is projected and the viewBox is chosen so the
 * whole shop fits: an enlarged shop shows more tiles instead of being cut off.
 */
export function cameraViewBox(shop: Shop) {
  const grid = gridOf(shop);
  const grow = Math.max(grid.w, 9) - 9;
  const growD = Math.max(grid.h, 7) - 7;
  const xs = [-1.9, 12.2 + grow], ys = [-1.7, 10.4 + growD], zs = [-.3, 3.7];
  const points: [number, number][] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) points.push(p(x, y, z));
  const minX = Math.min(...points.map(point => point[0])) - 16;
  const maxX = Math.max(...points.map(point => point[0])) + 16;
  const minY = Math.min(...points.map(point => point[1])) - 16;
  const maxY = Math.max(...points.map(point => point[1])) + 16;
  const aspect = 860 / 500;
  let width = maxX - minX, height = maxY - minY;
  if (width / height < aspect) width = height * aspect; else height = width / aspect;
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  return `${(centerX - width / 2).toFixed(1)} ${(centerY - height / 2).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`;
}

function IsoShop({ kind, shop, editing = false, crowd, onServe, onInteract, onInspect, onMove, arrangeApi, onArrangeInfo, selected, preview = false, noGround = false, dark = false }: {
  kind: ShopKind;
  shop: Shop;
  editing?: boolean;
  crowd?: CrowdState | null;
  /** Serving a waiting customer starts right here: click on the till or a service station. */
  onServe?: (serviceId: string) => void;
  onInteract?: Interaction;
  onInspect?: (good: VisibleGood) => void;
  onMove?: (id: string, place: Placement) => void;
  arrangeApi?: MutableRefObject<ArrangeApi | null>;
  onArrangeInfo?: (info: ArrangeInfo | null) => void;
  selected?: VisibleGood | null;
  preview?: boolean;
  noGround?: boolean;
  /** Dark interface: the surroundings are dimmed like an evening mall. */
  dark?: boolean;
}) {
  const tcg = kind === 'tcg', it = kind === 'it';
  // Wall and floor come from the player's colour choice, all shades follow.
  const palette = shopPalette(normalizeColors(shop.colors, DEFAULT_SHOP_COLORS[kind]), dark);
  const { wall, wallLight, wallTop, wallDeep, floorA, floorB, baseTop, baseLeft, baseRight } = palette;
  const accent = SHOPS[kind].color;
  const [signX,signY] = p(2.8,.22,3.05);
  const display = createShopDisplay(kind, shop);
  const displayed = [...display.showcase, ...display.center, ...display.shelves.flat()];
  const showCustomers = preview || (shop.open && displayed.length > 0);
  const layout = shop.layout;
  const grid = gridOf(shop);
  /** The sales floor can be enlarged, so nothing here may assume 9 × 7 tiles. */
  const roomW = Math.max(grid.w, 9);
  const roomD = Math.max(grid.h, 7);
  /** Tiles added to the right and to the front: the whole scene grows with them. */
  const grow = roomW - 9;
  const growD = roomD - 7;
  // Deckenlampen haengen ueber der Flaeche, Bilder an der Rueckwand: je groesser
  // der Laden, desto mehr davon.
  const lampSpots: [number, number][] = [];
  for (let x = 2.2; x <= roomW - 1.6; x += 3.4) lampSpots.push([x, roomD - 2.4]);
  for (let x = 4.6; x <= roomW - 1.6; x += 3.4) lampSpots.push([x, Math.min(roomD - 1.4, 4.6)]);
  const artSpots: [number, number][] = [];
  for (let x = 1.5; x <= roomW - 2.2; x += 2.6) artSpots.push([x, 2.05]);
  const pieces = piecesOf(shop);
  const blocked = blockedTiles(layout);
  const groupRef = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // After an enlargement the new tiles glow for a few seconds, so the growth is
  // visible right away, even in a shop that is full of furniture.
  const growthRef = useRef(shop.expansions ?? 0);
  const [freshGrid, setFreshGrid] = useState<Grid | null>(null);
  useEffect(() => {
    const level = shop.expansions ?? 0;
    const before = growthRef.current;
    growthRef.current = level;
    if (level <= before) { setFreshGrid(null); return; }
    setFreshGrid(gridFor(before));
    const timer = window.setTimeout(() => setFreshGrid(null), 7000);
    return () => window.clearTimeout(timer);
  }, [shop.expansions]);
  const walkers = crowd?.walkers ?? [];
  const queuePads = crowd ? serviceQueues(kind, shop, blocked).map(queue => ({ queue, waiting: (crowd.queues[queue.info.id] || []).length })) : [];
  const serviceSpots: ServiceSpot[] = serviceQueues(kind, shop, blocked).map(entry => ({
    id: entry.info.id,
    label: entry.info.label,
    count: crowd ? (crowd.queues[entry.info.id] || []).length : 0,
  }));

  const stationJobs = shop.queue.slice(0, Math.min(shop.furniture.workbench, shop.staff));
  const stations: StationView[] = pieces.filter(piece => piece.kind === 'workbench').map(piece => {
    const job = stationJobs[piece.index];
    const recipe = job && SHOPS[kind].recipes.find(entry => entry.id === job.recipeId);
    const repair = job?.repairId ? shop.orders.find(order => order.id === job.repairId) : undefined;
    let good: VisibleGood | null = recipe ? { type: 'item', id: recipe.output } : repair ? { type: 'item', id: repair.device.includes('PC') ? 'pc' : 'notebook' } : null;
    let working = !!job;
    if (!good) {
      const idle = kind === 'bakery' ? 'dough' : kind === 'it' ? 'motherboard' : null;
      if (idle && (shop.stock[idle] || 0) > 0) { good = { type: 'item', id: idle }; working = false; }
    }
    return { good, progress: job ? Math.min(1, job.progress / job.duration) : 0, active: working, working };
  });

  /** The pointer position in scene units, the same space the drawings use. */
  const scenePoint = (event: { clientX: number; clientY: number }) => {
    const node = groupRef.current;
    const matrix = node?.getScreenCTM();
    if (!node || !matrix || typeof DOMPoint === 'undefined') return null;
    try {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    } catch {
      return null;
    }
  };

  const hotspotFor = (piece: Piece): { label: string; onClick?: () => void } => {
    if (!onInteract || editing) return { label: PLACE_LABELS[piece.kind] };
    if (piece.kind === 'shelf') return { label: `Regal ${piece.index + 1}: ${(display.shelves[piece.index] || []).length} Produkte sichtbar. Anklicken zum Einrichten.`, onClick: () => onInteract('furnishing', 'shelf') };
    if (piece.kind === 'materials') return { label: 'Rohstoff-Vorrat ansehen', onClick: () => onInteract('inventory') };
    const service = serviceSpots.find(entry => entry.id === piece.id);
    if (service) return {
      label: service.count > 0 ? `${service.label}: ${service.count} wartend. Anklicken und bedienen.` : `${service.label}: niemand wartet. Anklicken und bedienen.`,
      onClick: () => onServe?.(service.id),
    };
    if (piece.kind === 'register') return { label: 'Kasse und Einrichtung verwalten', onClick: () => onInteract('furnishing', 'register') };
    if (piece.kind === 'workbench') return { label: it ? 'Reparaturbank öffnen' : tcg ? 'Sortiertisch und Produktion öffnen' : 'Backstube öffnen', onClick: () => onInteract('production') };
    if (piece.kind === 'showcase') return { label: tcg ? 'Booster-Pack öffnen oder Ware auswählen' : 'Auslage ansehen oder Ware auswählen', onClick: () => onInteract('special') };
    return { label: PLACE_LABELS[piece.kind] };
  };

  const placed = pieces.map(piece => ({ piece, place: placeOf(layout, piece) }));
  const ordered = [...placed].sort((a, b) => (a.place.x + a.place.y) - (b.place.x + b.place.y) || a.piece.index - b.piece.index);

  // ---------------------------------------------------------------- arranging
  const stateRef = useRef({ placed, ordered, layout, kind, focused, editing, onMove });
  stateRef.current = { placed, ordered, layout, kind, focused, editing, onMove };

  const focusedPlace = focused ? ordered.find(entry => entry.piece.id === focused) : undefined;
  const reportRef = useRef<((info: ArrangeInfo | null) => void) | undefined>(onArrangeInfo);
  reportRef.current = onArrangeInfo;
  useEffect(() => {
    if (!editing || !focusedPlace) reportRef.current?.(null);
    else reportRef.current?.({
      id: focusedPlace.piece.id,
      kind: focusedPlace.piece.kind,
      label: `${PLACE_LABELS[focusedPlace.piece.kind]}${ordered.filter(entry => entry.piece.kind === focusedPlace.piece.kind).length > 1 ? ` ${focusedPlace.piece.index + 1}` : ''}`,
      rot: focusedPlace.place.rot,
      canRotate: canRotate(focusedPlace.piece.kind),
    });
  }, [editing, focused, focusedPlace?.place.x, focusedPlace?.place.y, focusedPlace?.place.rot]);

  const boxes = ordered.map((entry, depth) => pickBox(entry.piece.id, entry.piece.kind, entry.place, depth));
  const boxRef = useRef(boxes);
  boxRef.current = boxes;

  const pointIn = (event: { clientX: number; clientY: number }) => scenePoint(event);

  const beginDrag = (entry: { piece: Piece; place: Placement }, event: { clientX: number; clientY: number }) => {
    const point = pointIn(event);
    if (!point) return false;
    setFocused(entry.piece.id);
    setDrag({ id: entry.piece.id, kind: entry.piece.kind, from: entry.place, place: entry.place, startX: point.x, startY: point.y, valid: true });
    return true;
  };

  /** One pointer handler for the whole shop floor: this is what makes picking reliable. */
  const scenePointerDown = (event: ReactPointerEvent<SVGGElement>) => {
    if (!editing) return;
    const point = pointIn(event);
    if (!point) return;
    const hit = pickPiece(point, boxRef.current);
    event.preventDefault();
    if (!hit) { setFocused(null); setDrag(null); return; }
    const entry = stateRef.current.placed.find(candidate => candidate.piece.id === hit.id);
    if (entry) beginDrag(entry, event);
  };

  // Dragging is driven by window listeners: pointer capture on an element that
  // React re-creates used to swallow the release, which left the scene stuck.
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const state = stateRef.current;
      const current = dragRef.current;
      if (!current) return;
      const point = scenePoint(event);
      if (!point) return;
      const place = dragPlace(current.from, { x: current.startX, y: current.startY }, point);
      if (place.x === current.place.x && place.y === current.place.y) return;
      setDrag({ ...current, place, valid: placementFits(state.layout, current.kind, place, current.id, grid) });
    };
    const finish = (event: PointerEvent | null) => {
      const current = dragRef.current;
      if (!current) return;
      let place = current.place;
      if (event) {
        const point = scenePoint(event);
        if (point) place = dragPlace(current.from, { x: current.startX, y: current.startY }, point);
      }
      const moved = place.x !== current.from.x || place.y !== current.from.y || current.place.rot !== current.from.rot;
      const fits = placementFits(stateRef.current.layout, current.kind, place, current.id, grid);
      setDrag(null);
      dragRef.current = null;
      if (moved && fits) stateRef.current.onMove?.(current.id, place);
    };
    const cancel = () => { setDrag(null); dragRef.current = null; };
    const up = (event: PointerEvent) => finish(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [drag !== null]);

  // Leaving the arrange mode never leaves a drag behind.
  useEffect(() => { if (!editing) { setDrag(null); dragRef.current = null; setFocused(null); } }, [editing]);

  const moveFocused = (dx: number, dy: number) => {
    const state = stateRef.current;
    const entry = state.ordered.find(candidate => candidate.piece.id === state.focused);
    if (!entry) return;
    const target = moveTarget(state.layout, entry.piece.kind, entry.place, entry.piece.id, dx, dy, grid);
    if (target) state.onMove?.(entry.piece.id, target);
    else setNotice('Dort steht schon etwas.');
  };
  const rotateFocused = () => {
    const state = stateRef.current;
    const entry = state.ordered.find(candidate => candidate.piece.id === state.focused);
    if (!entry) return;
    if (!canRotate(entry.piece.kind)) { setNotice('Dieses Möbelstück lässt sich nicht drehen.'); return; }
    const target = rotateTarget(state.layout, entry.piece.kind, entry.place, entry.piece.id, grid);
    if (target) state.onMove?.(entry.piece.id, target);
    else setNotice('Hier ist kein Platz zum Drehen.');
  };
  const apiRef = useRef<ArrangeApi | null>(null);
  const api = useMemo<ArrangeApi>(() => ({
    rotate: rotateFocused,
    move: moveFocused,
    select: id => setFocused(stateRef.current.ordered.some(entry => entry.piece.id === id) ? id : null),
    clear: () => setFocused(null),
    cancel: () => { setDrag(null); dragRef.current = null; },
  }), []);
  apiRef.current = api;
  useEffect(() => {
    if (!arrangeApi) return;
    arrangeApi.current = editing ? apiRef.current : null;
    return () => { arrangeApi.current = null; };
  }, [editing, arrangeApi]);

  // Keys act on the chosen piece, no matter which element has the focus.
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
      if (event.key === 'Escape') { setFocused(null); setDrag(null); dragRef.current = null; return; }
      if (!stateRef.current.focused) return;
      if (event.key === 'r' || event.key === 'R') { event.preventDefault(); rotateFocused(); return; }
      const step = ARRANGE_KEYS[event.key];
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      moveFocused(step[0], step[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 2200); return () => window.clearTimeout(timer); }, [notice]);

  const pieceNode = (piece: Piece, place: Placement, lifted: boolean) => {
    const { w, d } = footprint(piece.kind, place.rot);
    const corners: [number, number, number][] = [[place.x, place.y, FLOOR_Z], [place.x + w, place.y, FLOOR_Z], [place.x + w, place.y + d, FLOOR_Z], [place.x, place.y + d, FLOOR_Z]];
    const hotspot = hotspotFor(piece);
    const isFocused = editing && focused === piece.id;
    const handle = editing && canRotate(piece.kind) ? (() => {
      const [hx, hy] = p(place.x + w / 2, place.y + d / 2, FLOOR_Z);
      const top = hy - PICK_HEIGHT[piece.kind] - 4;
      return <g className={`piece-turn ${isFocused ? 'is-active' : ''}`} role="button" tabIndex={-1} aria-label={`${PLACE_LABELS[piece.kind]} drehen`}
        onPointerDown={event => { event.stopPropagation(); event.preventDefault(); setFocused(piece.id); }}
        onClick={event => { event.stopPropagation(); setFocused(piece.id); rotateFocused(); }}>
        <title>{`${PLACE_LABELS[piece.kind]} drehen`}</title>
        <circle cx={hx} cy={top} r={11} className="piece-turn-dot" />
        <path d={`M${hx - 4.6} ${top + 1.4}a4.6 4.6 0 1 1 2.6 4.1`} className="piece-turn-arrow" />
        <path d={`M${hx - 5.8} ${top - 2.6}l1.4 4 4-1.2`} className="piece-turn-arrow" />
      </g>;
    })() : null;
    return <Hotspot key={piece.id} label={isFocused ? `${PLACE_LABELS[piece.kind]}: Pfeiltasten verschieben, R dreht.` : hotspot.label} onClick={hotspot.onClick}>
      <g
        className={`shop-piece ${editing ? 'is-editing' : ''} ${lifted ? 'is-dragging' : ''} ${isFocused ? 'is-focused' : ''}`}
        onFocus={editing ? () => setFocused(piece.id) : undefined}
        tabIndex={editing ? 0 : undefined}
        role={editing ? 'button' : undefined}
        aria-label={editing ? `${PLACE_LABELS[piece.kind]} verschieben. Anklicken und ziehen, Pfeiltasten bewegen, R dreht.` : undefined}
      >
        <PieceView piece={piece} place={place} shopKind={kind} shop={shop} display={display} stations={stations} selected={editing ? null : selected ?? null} onInspect={editing ? undefined : onInspect} />
        {isFocused && !lifted && <polygon points={polygon(corners.map(([x, y, z]) => [x, y, z + .012] as [number, number, number]))} className="piece-marker" pointerEvents="none" />}
      </g>
      {handle}
    </Hotspot>;
  };

  // Everybody works where their task is: at the till, at the material shelf or
  // between the shelves they keep filled.
  const staffSpots: [number, number][] = [];
  const spotFor = (piece: Piece | undefined, fallback: [number, number]): [number, number] => {
    if (!piece) return fallback;
    const place = placeOf(layout, piece);
    const size = footprint(piece.kind, place.rot);
    const center = { x: place.x + size.w / 2, y: place.y + size.d / 2 };
    const sides = freeSides(place, piece.kind, blocked, grid);
    const best = sides.sort((a, b) => (a.x + a.y) - (b.x + b.y)).find(tile => tile.x + tile.y >= center.x + center.y - .5) || sides[0];
    return best ? [best.x + .5, best.y + .5] : [center.x, center.y];
  };
  const staffWorkplace = (index: number): Piece | undefined => {
    const role = staffRole(shop, index);
    if (role === 'register') return pieces.find(piece => piece.kind === 'register');
    if (role === 'stock') return pieces.find(piece => piece.kind === 'materials');
    return pieces.find(piece => piece.kind === 'shelf' && piece.index === index % Math.max(1, shop.furniture.shelf))
      || pieces.find(piece => piece.kind === 'workbench');
  };
  for (let index = 0; index < shop.staff; index++) {
    staffSpots.push(spotFor(staffWorkplace(index), [3.13, 5.08]));
  }

  return <g ref={groupRef} className={`shop-root ${dark ? 'is-night' : ''}`} onPointerDown={editing ? scenePointerDown : undefined}>
    {!noGround && <g>
      <polygon points={polygon([[-1.5,-1.35,-.2],[11.8,-1.35,-.2],[11.8,10.1 + growD,-.2],[-1.5,10.1 + growD,-.2]])} fill="#829e8a" opacity=".09" transform="translate(4 12)" />
      <Cube x={-1.5} y={-1.35} z={-.18} w={13.3} d={11.45 + growD} h={.22} top={dark ? '#3c4440' : '#dce8de'} left={dark ? '#313833' : '#bed0c2'} right={dark ? '#363d38' : '#c6d7ca'} />
      <g className="mall-ground">
        <polygon points={polygon([[9.45 + grow,-1.3,.055],[11.75 + grow,-1.3,.055],[11.75 + grow,10 + growD,.055],[9.45 + grow,10 + growD,.055]])} fill="#ebeae5" />
        <polygon points={polygon([[-1.45,7.7 + growD,.056],[9.5 + grow,7.7 + growD,.056],[9.5 + grow,10 + growD,.056],[-1.45,10 + growD,.056]])} fill="#ebeae5" />
        {Array.from({length: 13 + grow},(_,i) => <polyline key={`p${i}`} points={pts([p(-1.45+i,7.7 + growD,.061),p(-1.45+i,10 + growD,.061)])} stroke="#dcded7" strokeWidth=".8" fill="none" />)}
        {Array.from({length: 12 + growD},(_,i) => <polyline key={`q${i}`} points={pts([p(9.45 + grow,-1.3+i,.061),p(11.75 + grow,-1.3+i,.061)])} stroke="#dcded7" strokeWidth=".8" fill="none" />)}
        <g opacity={dark ? .68 : 1}>
          <Tree x={-.78} y={1.2} />
          <Tree x={9.8 + grow} y={-.35} />
        </g>
      </g>
      {dark && <polygon className="night-pavement" points={polygon([[-1.48,-1.33,.062],[11.78 + grow,-1.33,.062],[11.78 + grow,10.08 + growD,.062],[-1.48,10.08 + growD,.062]])} />}
    </g>}
    <Cube x={-.2} y={-.2} z={.06} w={grow + 9.4} d={7.4 + growD} h={.3} top={baseTop} left={baseLeft} right={baseRight} />
    {Array.from({length: roomW},(_,x) => Array.from({length: roomD},(_,y) => <polygon key={`tile-${x}-${y}`} points={polygon([[x,y,.37],[x+.99,y,.37],[x+.99,y+.99,.37],[x,y+.99,.37]])} fill={(x+y)%2 ? floorB : floorA} stroke={floorA} strokeWidth=".5" />))}
    {freshGrid && <g className="fresh-tiles" pointerEvents="none">
      {Array.from({length: roomW},(_,x) => Array.from({length: roomD},(_,y) => (x >= freshGrid.w || y >= freshGrid.h)
        ? <polygon key={`fresh-${x}-${y}`} points={polygon([[x + .05,y + .05,.381],[x + .94,y + .05,.381],[x + .94,y + .94,.381],[x + .05,y + .94,.381]])} className="fresh-tile" />
        : null))}
    </g>}
    {editing && <g className="layout-grid" pointerEvents="none">
      {Array.from({ length: roomW + 1 }, (_, i) => <polyline key={`v${i}`} points={pts([p(i, 0, .378), p(i, roomD, .378)])} />)}
      {Array.from({ length: roomD + 1 }, (_, i) => <polyline key={`h${i}`} points={pts([p(0, i, .378), p(roomW, i, .378)])} />)}
      {doorTiles(grid).map(tile => <polygon key={`door-${tile.x}-${tile.y}`} points={polygon([[tile.x,tile.y,.379],[tile.x+1,tile.y,.379],[tile.x+1,tile.y+1,.379],[tile.x,tile.y+1,.379]] as [number, number, number][])} className="layout-door" />)}
    </g>}
    {editing && drag && <polygon points={polygon(([[drag.place.x, drag.place.y, FLOOR_Z + .02], [drag.place.x + footprint(drag.kind, drag.place.rot).w, drag.place.y, FLOOR_Z + .02], [drag.place.x + footprint(drag.kind, drag.place.rot).w, drag.place.y + footprint(drag.kind, drag.place.rot).d, FLOOR_Z + .02], [drag.place.x, drag.place.y + footprint(drag.kind, drag.place.rot).d, FLOOR_Z + .02]] as [number, number, number][]))} className={`layout-ghost ${drag.valid ? 'valid' : 'invalid'}`} pointerEvents="none" />}
    <Cube x={0} y={-.22} w={grow + 9.12} d={.22} h={3.5} top={wallTop} left={wallLight} right={wall} />
    <Cube x={-.22} y={0} w={.22} d={6.9 + growD} h={3.5} top={wallTop} left={wall} right={wallLight} />
    <g className="interior-decor" pointerEvents="none">
      {/* Eingangsmatte und Laufweg bis in die Mitte des Ladens */}
      <polygon points={polygon([[7.05, roomD - 1.02, FLOOR_Z + .008], [8.95, roomD - 1.02, FLOOR_Z + .008], [8.95, roomD - .04, FLOOR_Z + .008], [7.05, roomD - .04, FLOOR_Z + .008]])} className="floor-mat" />
      {Array.from({ length: roomW - 5 }, (_, index) => {
        const x = 2.6 + index;
        if (x > roomW - 2.4) return null;
        return <polygon key={`path-${index}`} points={polygon([[x, roomD - 2.35, FLOOR_Z + .006], [x + .55, roomD - 2.35, FLOOR_Z + .006], [x + .55, roomD - 1.35, FLOOR_Z + .006], [x, roomD - 1.35, FLOOR_Z + .006]])} className="floor-path" />;
      })}
      {/* Teppich in der Raummitte, waechst mit dem Laden mit */}
      <polygon points={polygon([[roomW / 2 - 2.1, roomD / 2 - 1.15, FLOOR_Z + .007], [roomW / 2 + 2.1, roomD / 2 - 1.15, FLOOR_Z + .007], [roomW / 2 + 2.1, roomD / 2 + 1.15, FLOOR_Z + .007], [roomW / 2 - 2.1, roomD / 2 + 1.15, FLOOR_Z + .007]])} className="floor-rug" />
      <polygon points={polygon([[roomW / 2 - 1.75, roomD / 2 - .85, FLOOR_Z + .009], [roomW / 2 + 1.75, roomD / 2 - .85, FLOOR_Z + .009], [roomW / 2 + 1.75, roomD / 2 + .85, FLOOR_Z + .009], [roomW / 2 - 1.75, roomD / 2 + .85, FLOOR_Z + .009]])} className="floor-rug-inner" />
      {/* Deckenlampen mit warmem Lichtkreis auf dem Boden */}
      {lampSpots.map(([x, y], index) => {
        const [lx, ly] = p(x, y, 3.46);
        const [gx, gy] = p(x, y, FLOOR_Z);
        return <g key={`lamp-${index}`}>
          <ellipse cx={gx} cy={gy} rx={17} ry={8.5} className="lamp-glow" />
          <line x1={lx} y1={ly - 2} x2={lx} y2={ly + 22} className="lamp-cord" />
          <ellipse cx={lx} cy={ly + 25} rx={10} ry={5} className="lamp-shade" />
          <ellipse cx={lx} cy={ly + 27} rx={6} ry={3} className="lamp-light" />
        </g>;
      })}
      {/* Deckenventilator in der Mitte */}
      {(() => {
        const [fx, fy] = p(roomW / 2, roomD / 2, 3.3);
        return <g className="ceiling-fan">
          <line x1={fx} y1={fy - 16} x2={fx} y2={fy - 5} className="lamp-cord" />
          {[0, 60, 120].map(angle => <ellipse key={angle} cx={fx} cy={fy} rx={13} ry={3.2} className="fan-blade" transform={`rotate(${angle} ${fx} ${fy})`} />)}
          <circle cx={fx} cy={fy} r={3.4} className="fan-hub" />
        </g>;
      })()}
      {/* Bilder an der Rueckwand */}
      {artSpots.map(([x, z], index) => <g key={`art-${index}`} className="wall-art">
        <polygon points={polygon([[x, .015, z], [x + .95, .015, z], [x + .95, .015, z + .72], [x, .015, z + .72]])} className="art-frame" />
        <polygon points={polygon([[x + .1, .02, z + .1], [x + .85, .02, z + .1], [x + .85, .02, z + .62], [x + .1, .02, z + .62]])} className={`art-picture art-${index % 3}`} />
        <polygon points={polygon([[x + .18, .025, 3.4], [x + .5, .025, z + .18], [x + .3, .025, z + .2], [x + .12, .025, z + .5]])} className="art-shine" />
      </g>)}
    </g>
    {grow > 0 && <g>
      <Cube x={8.78} y={roomD} w={grow + .22} d={.2} h={.75} top={wallTop} left={wallDeep} right={wallLight} />
      <polygon points={polygon([[8.98, roomD + .06, .78], [8.98, roomD + .06, 2.5], [8.94 + grow, roomD + .06, 2.5], [8.94 + grow, roomD + .06, .78]])} fill="#dceef1" opacity=".5" />
      <polygon points={polygon([[8.98, roomD + .055, 1.5], [9.6 + grow, roomD + .055, 1.1], [9.6 + grow, roomD + .055, 1.6], [8.98, roomD + .055, 2.05]])} fill="#ffffff" opacity=".35" />
      <polyline points={pts([p(8.98, roomD + .06, .78), p(8.98, roomD + .06, 2.5), p(8.94 + grow, roomD + .06, 2.5), p(8.94 + grow, roomD + .06, .78)])} fill="none" stroke="#f9f8f6" strokeWidth="2.4" />
      {Array.from({ length: Math.max(1, Math.round(grow / 1.5)) }, (_, index) => {
        const x = 8.98 + (index + 1) * grow / (Math.max(1, Math.round(grow / 1.5)) + 1);
        return <polyline key={`mullion-${index}`} points={pts([p(x, roomD + .07, .78), p(x, roomD + .07, 2.5)])} fill="none" stroke="#f9f8f6" strokeWidth="1.6" />;
      })}
    </g>}
    <polygon points={polygon([[.012,2.2,1.3],[.012,3.85,1.3],[.012,3.85,3.2],[.012,2.2,3.2]])} fill={dark ? '#ffeec4' : '#e6f0f1'} stroke="#f9f8f6" strokeWidth="4" />
    <polyline points={pts([p(.016,3.02,1.3),p(.016,3.02,3.2)])} stroke="#fff" strokeWidth="3" />
    <polyline points={pts([p(.016,2.2,2.3),p(.016,3.85,2.3)])} stroke="#fff" strokeWidth="3" />
    <polygon points={polygon([[.02,2.25,1.5],[.02,3.6,1.5],[.02,3.6,2.8]])} fill="#c4e1df" opacity=".6" />
    <g transform={`translate(${p(7.34,.13,2.84).join(',')}) rotate(26.565)`}>
      <rect x="-37" y="-25" width="76" height="44" rx="3" fill={tcg ? '#6d548e' : it ? '#4f7287' : '#996f52'} stroke="#f8f3ee" strokeWidth="3" />
      {tcg ? <g><rect x="-23" y="-16" width="17" height="24" rx="2" fill="#d7a77d" /><rect x="-19" y="-12" width="9" height="13" fill="#6b4e8d" /><rect x="4" y="-16" width="17" height="24" rx="2" fill="#92b9b2" /><rect x="8" y="-12" width="9" height="13" fill="#486c88" /><path d="M-11-7l3 4-3 5-3-5zM12-7l3 4-3 5-3-5z" fill="#fff2cf" /></g> : it ? <g><path d="M-23-15h11v11h11v17M22-16H8v10H-4v14h-14" fill="none" stroke="#a5dbcf" strokeWidth="2" /><rect x="-10" y="-10" width="20" height="20" rx="2" fill="#9fc8c8" /><rect x="-5" y="-5" width="10" height="10" fill="#4b7182" /><circle cx="-23" cy="-15" r="2" fill="#fff2d4"/><circle cx="-18" cy="8" r="2" fill="#fff2d4"/></g> : <g><path d="M-27 3q8-16 17-15 12-1 15 13v7q-16 9-32 0z" fill="#dfad75"/><path d="M-17-7l5 11m5-9l4 10" stroke="#fae1af" strokeWidth="2"/><path d="M14 7q4-8 9-7t8 7q-10 7-17 0z" fill="#e8bf8b"/><circle cx="23" cy="-5" r="3" fill="#aa6674"/></g>}
    </g>
    <g transform={`translate(${signX},${signY}) rotate(26.565)`}>
      <rect x="-6" y="-26" width="184" height="36" rx="4" fill="#faf8fd" opacity=".94" />
      <text x="86" y="-3" textAnchor="middle" fill={tcg ? '#725297' : it ? '#47718d' : '#9d7351'} fontSize={shop.name.length > 15 ? 13 : 18} fontWeight="800" letterSpacing="1">{shop.name.toUpperCase()}</text>
      <rect x="18" y="15" width="42" height="3" rx="1.5" fill={accent} opacity=".25" /><rect x="70" y="15" width="78" height="3" rx="1.5" fill={accent} opacity=".25" />
    </g>
    {queuePads.filter(entry => entry.waiting > 0).map(({ queue, waiting }) => <g key={`queue-${queue.info.id}`} className="queue-pads" pointerEvents="none">
      {queue.spots.slice(0, Math.max(waiting, 1)).map((spot, index) => <g key={`${spot.x}-${spot.y}`}>
        <polygon points={polygon([[spot.x + .12, spot.y + .12, FLOOR_Z + .005], [spot.x + .88, spot.y + .12, FLOOR_Z + .005], [spot.x + .88, spot.y + .88, FLOOR_Z + .005], [spot.x + .12, spot.y + .88, FLOOR_Z + .005]])} className="queue-pad" />
        {index === 0 && <text x={p(spot.x + .5, spot.y + .5, FLOOR_Z)[0]} y={p(spot.x + .5, spot.y + .5, FLOOR_Z)[1] + 3} textAnchor="middle" className="queue-pad-label" fontSize={10} fontWeight={800} fill="#6f8a63">{waiting}</text>}
      </g>)}
    </g>)}
    {serviceSpots.filter(spot => spot.count > 0).map(spot => {
      const spotKind = spot.id.split('-')[0] as Piece['kind'];
      const place = placeOf(layout, { id: spot.id, kind: spotKind, index: 0 });
      const size = footprint(spotKind, place.rot);
      const [bx, by] = p(place.x + size.w / 2, place.y + size.d / 2, 3.3);
      const width = Math.max(150, spot.label.length * 8.6 + 132);
      return <g key={`service-${spot.id}`} className="service-marker" pointerEvents="none" role="status" aria-label={`${spot.label}: ${spot.count} wartend, anklicken zum Bedienen`}>
        <polygon points={polygon([[place.x - .06, place.y - .06, FLOOR_Z + .012], [place.x + size.w + .06, place.y - .06, FLOOR_Z + .012], [place.x + size.w + .06, place.y + size.d + .06, FLOOR_Z + .012], [place.x - .06, place.y + size.d + .06, FLOOR_Z + .012]] as [number, number, number][])} className="service-ring" />
        <g transform={`translate(${bx},${by})`} className="service-badge-group">
          <rect x={-width / 2} y={-19} width={width} height={30} rx={15} className="service-badge" />
          <rect x={-width / 2 + 10} y={-14} width={16} height={21} rx={7.5} className="service-badge-key" />
          <path d={`M${-width / 2 + 18} -10v5`} className="service-badge-key-line" />
          <text x={-width / 2 + 34} y={.5} className="service-badge-text" fontSize={11} fontWeight={700} fill="#f1f7ec">{spot.label} bedienen · {spot.count} wartend</text>
        </g>
      </g>;
    })}
    {(() => {
      // One list keeps the DOM nodes of the pieces alive while dragging; the
      // dragged piece is simply drawn last so it lies on top.
      const list = drag ? [...ordered.filter(entry => entry.piece.id !== drag.id), ...ordered.filter(entry => entry.piece.id === drag.id)] : ordered;
      return list.map(entry => pieceNode(entry.piece, drag?.id === entry.piece.id ? drag.place : entry.place, drag?.id === entry.piece.id));
    })()}
    {staffSpots.map(([x, y], index) => <Person key={`staff-${index}`} x={x} y={y} color={index === 0 ? '#96aabe' : '#b5a0c5'} staff />)}
    {showCustomers && <CustomerGroup walkers={walkers} />}
    <Cube x={-.22} y={roomD} w={6.9} d={.2} h={.75} top={wallTop} left={wallDeep} right={wallLight} />
    <g transform={`translate(${p(1.15,roomD + .24,.8).join(',')}) rotate(26.565)`}>
      <text fill="#fffdfd" fontSize="12" fontWeight="800" letterSpacing="1.4">{shop.name.toUpperCase()}</text>
    </g>
    <Cube x={roomW} y={0} w={.23} d={roomD} h={.36} top={wallTop} left={wallDeep} right={wallLight} />
    <Cube x={6.85} y={roomD} w={.22} d={.3} h={2.3} top={wallTop} left={wallDeep} right={wallLight} />
    <Cube x={8.78} y={roomD} w={.22} d={.3} h={2.3} top={wallTop} left={wallDeep} right={wallLight} />
    <Cube x={6.85} y={roomD} z={2.52} w={2.15} d={.3} h={.24} top={wallTop} left={wallDeep} right={wall} />
    <polygon points={polygon([[7.08,roomD + .15,.4],[8.77,roomD + .15,.4],[8.77,roomD + .15,2.5],[7.08,roomD + .15,2.5]])} fill="#cfebed" opacity=".24" />
    <polyline points={pts([p(7.92,roomD + .15,.4),p(7.92,roomD + .15,2.5)])} stroke="#eeeaf3" strokeWidth="2" />
    <polyline points={pts([p(7.73,roomD + .17,1.35),p(7.73,roomD + .17,1.65)])} stroke={wallDeep} strokeWidth="2.5" />
    <g transform={`translate(${p(8.39,roomD + .18,1.67).join(',')}) rotate(26.565)`}>
      <rect x="-13" y="-5" width="26" height="11" rx="1.6" fill={shop.open ? '#5c9474' : '#b38b79'} stroke="#f8f8eb" strokeWidth="1.2" />
      <text x="0" y="2.5" textAnchor="middle" fill="#fffdf3" fontSize="6.2" fontWeight="800" letterSpacing=".4">{shop.open ? 'OFFEN' : 'ZU'}</text>
    </g>
    {editing && notice && (() => {
      const [bx, by] = p(4.5, 4.5, 2.6);
      const width = Math.max(150, notice.length * 7.4 + 34);
      return <g className="arrange-note-tip" pointerEvents="none">
        <rect x={bx - width / 2} y={by - 16} width={width} height={26} rx={13} />
        <text x={bx} y={by + 2} textAnchor="middle">{notice}</text>
      </g>;
    })()}
    {!noGround && <g opacity={dark ? .62 : 1}>
      <Cube x={6.88} y={roomD + .25} z={.06} w={2.16} d={.48} h={.15} top={baseTop} left={baseLeft} right={baseRight} />
      <Cube x={6.88} y={roomD + .73} z={.05} w={2.16} d={.35} h={.07} top={shade(floorA, .05)} left={baseLeft} right={baseRight} />
      <Bench x={1.25} y={8.57 + growD} />
      <Bench x={10.13 + grow} y={1.66} />
      <Plant x={-.7} y={7.1 + growD} big />
      <Plant x={9.3 + grow} y={7.25 + growD} big />
      <Tree x={10.4 + grow} y={8.55 + growD} />
      <g>
        <path d={`M${p(11 + grow,.3)[0]} ${p(11 + grow,.3)[1]}v-75`} stroke="#a6b5ad" strokeWidth="3" />
        {dark && <circle cx={p(11 + grow,.3)[0]} cy={p(11 + grow,.3)[1]-76} r={26} className="lamp-halo" />}
        <circle cx={p(11 + grow,.3)[0]} cy={p(11 + grow,.3)[1]-78} r="7" fill={dark ? '#ffe9ad' : '#f8f5db'} stroke="#bbc9bb" strokeWidth="2" />
      </g>
      {showCustomers && <g className="mall-ground"><Person x={9.9} y={8.9 + growD} color="#c190ae" walking delay={1} /><Person x={5.04} y={9.04 + growD} color="#7498b3" walking delay={3} /><Person x={10.38} y={4.44} color="#e0ad67" walking delay={2} /><Person x={-.66} y={8.67 + growD} color="#8aada1" /></g>}
    </g>}
  </g>;
}

function EmptyPlot({ x, y, label, onClick }: { x: number; y: number; label: string; onClick: () => void }) {
  return <g transform={`translate(${x},${y})`} className="empty-plot" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }} aria-label={`${label} eröffnen`}>
    <polygon points="0,45 125,-18 265,52 140,115" fill="#dde8df" stroke="#b1c7b9" strokeWidth="2" strokeDasharray="7 5" />
    <g transform="translate(134,39)"><circle r="21" fill="#edf4ed" /><path d="M-7 0h14M0-7v14" stroke="#789384" strokeWidth="2" strokeLinecap="round" /></g>
    <text x="134" y="78" textAnchor="middle" fontSize="12" fill="#71877a" fontWeight="600">{label}</text>
  </g>;
}

export function IsoScene({ game, kind, mode, zoom, editing = false, crowd = null, onServe, onInteract, onInspect, onMove, arrangeApi, onArrangeInfo, selected, onSelect }: {
  game: GameState;
  kind: ShopKind;
  mode: 'shop' | 'mall';
  zoom: number;
  editing?: boolean;
  crowd?: CrowdState | null;
  /** Clicking a till or service station serves the customer waiting there. */
  onServe?: (serviceId: string) => void;
  onInteract: Interaction;
  onInspect: (good: VisibleGood) => void;
  onMove?: (id: string, place: Placement) => void;
  /** Imperative handle used by the arrange toolbar next to the scene. */
  arrangeApi?: MutableRefObject<ArrangeApi | null>;
  /** Reports which piece is currently chosen, for that toolbar. */
  onArrangeInfo?: (info: ArrangeInfo | null) => void;
  selected: VisibleGood | null;
  onSelect: (kind: ShopKind) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (game.paused || reduced) ref.current?.pauseAnimations();
    else ref.current?.unpauseAnimations();
  }, [game.paused, mode]);
  return <svg ref={ref} className={`iso-scene ${game.paused ? 'simulation-paused' : ''} ${editing ? 'is-arranging' : ''}`} viewBox={mode === 'shop' ? cameraViewBox(game.shops[kind]) : '0 0 860 500'} role="group" aria-label={`Interaktive isometrische ${mode === 'shop' ? SHOPS[kind].label : 'Mall'}-Ansicht`}>
    <defs><filter id="scene-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#809c89" floodOpacity=".12" /></filter></defs>
    <g transform={`translate(430 250) scale(${zoom}) translate(-430 -250)`}>
      {mode === 'shop'
        ? <g filter="url(#scene-shadow)"><IsoShop kind={kind} shop={game.shops[kind]} editing={editing} crowd={crowd} onServe={onServe} onInteract={onInteract} onInspect={onInspect} onMove={onMove} arrangeApi={arrangeApi} onArrangeInfo={onArrangeInfo} selected={selected} preview={!game.hasChosen} dark={game.theme === 'dark'} /></g>
        : <g>
          <polygon points="35,216 443,12 817,202 410,422" fill="#e1eae0" />
          <path d="M160 275L550 80M250 330L654 128M330 180L653 341" stroke="#eeeee8" strokeWidth="36" />
          {SHOP_ORDER.map((k, index) => {
            const transform = ['translate(-30 15) scale(.53)', 'translate(360 -8) scale(.5)', 'translate(185 248) scale(.43)'][index];
            const empty = [{x:55,y:165},{x:485,y:98},{x:238,y:311}][index];
            const visible = game.hasChosen ? game.shops[k].owned : k === kind;
            return visible ? <g key={k} transform={transform} onClick={() => onSelect(k)} className="mall-shop" role="button" tabIndex={0} aria-label={`${game.shops[k].name} ansehen`} onKeyDown={e => { if (e.key === 'Enter') onSelect(k); }}><IsoShop kind={k} shop={game.shops[k]} noGround preview={!game.hasChosen} /></g> : <EmptyPlot key={k} {...empty} label={SHOPS[k].label} onClick={() => onInteract('expand')} />;
          })}
          <g transform="translate(430 239)"><ellipse cx="0" cy="0" rx="34" ry="18" fill="#c1d3cb" /><ellipse cx="0" cy="-5" rx="31" ry="17" fill="#a3c8d0" /><ellipse cx="0" cy="-8" rx="25" ry="13" fill="#c9e4e4" /><path d="M0-10v-35m-10 15q10-27 20 0" stroke="#e4f3ee" strokeWidth="3" fill="none" /><circle cx="0" cy="-48" r="4" fill="#e7f5f0" /></g>
          <g transform="translate(50 123) scale(.6)"><Tree x={0} y={0} /></g><g transform="translate(515 218) scale(.6)"><Tree x={0} y={0} /></g>
          <text x="104" y="450" fill="#819d89" fontSize="28" fontWeight="800" letterSpacing="6" transform="rotate(-26.565 104 450)">MALLSIDE</text>
        </g>}
    </g>
  </svg>;
}
