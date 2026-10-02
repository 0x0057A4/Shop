import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { FurnitureKind, GameState, Placement, Shop, ShopKind } from '../game/data';
import { SHOPS, SHOP_ORDER } from '../game/data';
import type { VisibleGood } from '../game/visualInventory';
import { createShopDisplay } from '../game/visualInventory';
import type { Piece } from '../game/layout';
import { DOOR_TILES, FLOOR_Z, GRID_H, GRID_W, PLACE_LABELS, blockedTiles, footprint, freeSides, piecesOf, placeOf, placementFits, rotatable } from '../game/layout';
import { PieceView, Plant, Tree } from './ShopPieces';
import type { StationView } from './ShopPieces';
import { CustomerGroup, Person, useShopWalkers } from './Customers';
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
const GRAB_HEIGHT: Record<string, number> = { shelf: 96, workbench: 62, register: 58, showcase: 54, center: 44, materials: 42, decor: 46 };

interface DragState { id: string; kind: Piece['kind']; from: Placement; place: Placement; grabX: number; grabY: number; valid: boolean }

function IsoShop({ kind, shop, editing = false, paused = false, onInteract, onInspect, onMove, selected, preview = false, noGround = false }: {
  kind: ShopKind;
  shop: Shop;
  editing?: boolean;
  paused?: boolean;
  onInteract?: Interaction;
  onInspect?: (good: VisibleGood) => void;
  onMove?: (id: string, place: Placement) => void;
  selected?: VisibleGood | null;
  preview?: boolean;
  noGround?: boolean;
}) {
  const tcg = kind === 'tcg', it = kind === 'it';
  const wall = tcg ? '#c3afe2' : it ? '#b1cddc' : '#e6c9aa';
  const wall2 = tcg ? '#d5c7eb' : it ? '#c8dce5' : '#f0dbc1';
  const accent = SHOPS[kind].color;
  const [signX,signY] = p(2.8,.22,3.05);
  const display = createShopDisplay(kind, shop);
  const displayed = [...display.showcase, ...display.center, ...display.shelves.flat()];
  const showCustomers = preview || (shop.open && displayed.length > 0);
  const layout = shop.layout;
  const pieces = piecesOf(shop);
  const blocked = blockedTiles(layout);
  const groupRef = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const { walkers, reduced } = useShopWalkers(shop, display, showCustomers, paused);

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

  const pointerTile = (event: { clientX: number; clientY: number }) => {
    const node = groupRef.current;
    const matrix = node?.getScreenCTM();
    if (!node || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const ux = (point.x - 390) / 32, uy = (point.y - 146) / 16;
    return { x: (ux + uy) / 2, y: (uy - ux) / 2 };
  };

  const startDrag = (piece: Piece, place: Placement) => (event: ReactPointerEvent<SVGGElement>) => {
    if (!editing || !onMove) return;
    const point = pointerTile(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFocused(piece.id);
    setDrag({ id: piece.id, kind: piece.kind, from: place, place, grabX: point.x - place.x, grabY: point.y - place.y, valid: true });
  };
  const moveDrag = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return;
    const point = pointerTile(event);
    if (!point) return;
    const place: Placement = { x: Math.round(point.x - drag.grabX), y: Math.round(point.y - drag.grabY), rot: drag.place.rot };
    setDrag({ ...drag, place, valid: placementFits(layout, drag.kind, place, drag.id) });
  };
  const endDrag = (commit: boolean) => (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return;
    event.stopPropagation();
    const target = drag.place;
    const moved = target.x !== drag.from.x || target.y !== drag.from.y || target.rot !== drag.from.rot;
    setDrag(null);
    if (commit && drag.valid && moved) onMove?.(drag.id, target);
  };

  const shift = (piece: Piece, place: Placement, dx: number, dy: number) => {
    const target: Placement = { ...place, x: place.x + dx, y: place.y + dy };
    if (placementFits(layout, piece.kind, target, piece.id)) onMove?.(piece.id, target);
  };
  const turn = (piece: Piece, place: Placement) => {
    if (!rotatable(piece.kind)) return;
    const target: Placement = { ...place, rot: place.rot === 0 ? 1 : 0 };
    if (placementFits(layout, piece.kind, target, piece.id)) onMove?.(piece.id, target);
  };

  const hotspotFor = (piece: Piece): { label: string; onClick?: () => void } => {
    if (!onInteract || editing) return { label: PLACE_LABELS[piece.kind] };
    if (piece.kind === 'shelf') return { label: `Regal ${piece.index + 1}: ${(display.shelves[piece.index] || []).length} Produkte sichtbar. Anklicken zum Einrichten.`, onClick: () => onInteract('furnishing', 'shelf') };
    if (piece.kind === 'materials') return { label: 'Rohstoff-Vorrat ansehen', onClick: () => onInteract('inventory') };
    if (piece.kind === 'register') return { label: 'Kasse und Einrichtung verwalten', onClick: () => onInteract('furnishing', 'register') };
    if (piece.kind === 'workbench') return { label: it ? 'Reparaturbank öffnen' : tcg ? 'Sortiertisch und Produktion öffnen' : 'Backstube öffnen', onClick: () => onInteract('production') };
    if (piece.kind === 'showcase') return { label: tcg ? 'Booster-Pack öffnen oder Ware auswählen' : 'Auslage ansehen oder Ware auswählen', onClick: () => onInteract('special') };
    return { label: PLACE_LABELS[piece.kind] };
  };

  const placed = pieces.map(piece => ({ piece, place: placeOf(layout, piece) }));
  const ordered = [...placed].sort((a, b) => (a.place.x + a.place.y) - (b.place.x + b.place.y) || a.piece.index - b.piece.index);

  const pieceNode = (piece: Piece, place: Placement, lifted: boolean) => {
    const { w, d } = footprint(piece.kind, place.rot);
    const corners: [number, number, number][] = [[place.x, place.y, FLOOR_Z], [place.x + w, place.y, FLOOR_Z], [place.x + w, place.y + d, FLOOR_Z], [place.x, place.y + d, FLOOR_Z]];
    const [x1, y1] = p(place.x, place.y, FLOOR_Z);
    const [x2, y2] = p(place.x + w, place.y + d, FLOOR_Z);
    const [x3] = p(place.x + w, place.y, FLOOR_Z);
    const [x4] = p(place.x, place.y + d, FLOOR_Z);
    const minX = Math.min(x1, x2, x3, x4), maxX = Math.max(x1, x2, x3, x4);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const hotspot = hotspotFor(piece);
    const isFocused = editing && focused === piece.id;
    return <Hotspot key={piece.id} label={isFocused ? `${PLACE_LABELS[piece.kind]}: Pfeiltasten verschieben, R drehen.` : hotspot.label} onClick={hotspot.onClick}>
      <g
        className={`shop-piece ${editing ? 'is-editing' : ''} ${lifted ? 'is-dragging' : ''} ${isFocused ? 'is-focused' : ''}`}
        onPointerDown={editing ? startDrag(piece, place) : undefined}
        onPointerMove={editing ? moveDrag : undefined}
        onPointerUp={editing ? endDrag(true) : undefined}
        onPointerCancel={editing ? endDrag(false) : undefined}
        onFocus={editing ? () => setFocused(piece.id) : undefined}
        tabIndex={editing ? 0 : undefined}
        role={editing ? 'button' : undefined}
        aria-label={editing ? `${PLACE_LABELS[piece.kind]} verschieben. Pfeiltasten bewegen, R dreht.` : undefined}
        onKeyDown={editing ? event => {
          const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowRight: [0, -1], ArrowDown: [1, 0], ArrowLeft: [0, 1] };
          if (event.key === 'r' || event.key === 'R') { event.preventDefault(); event.stopPropagation(); turn(piece, place); return; }
          const step = moves[event.key];
          if (!step) return;
          event.preventDefault(); event.stopPropagation();
          shift(piece, place, step[0], step[1]);
        } : undefined}
      >
        <PieceView piece={piece} place={place} shopKind={kind} shop={shop} display={display} stations={stations} selected={editing ? null : selected ?? null} onInspect={editing ? undefined : onInspect} />
        {editing && <rect x={minX} y={minY - (GRAB_HEIGHT[piece.kind] ?? 70)} width={maxX - minX} height={maxY - minY + (GRAB_HEIGHT[piece.kind] ?? 70)} fill="transparent" pointerEvents="all" onClick={event => { event.stopPropagation(); event.preventDefault(); }} />}
        {isFocused && !lifted && <polygon points={polygon(corners.map(([x, y, z]) => [x, y, z + .012] as [number, number, number]))} className="piece-marker" pointerEvents="none" />}
      </g>
    </Hotspot>;
  };

  const staffSpots: [number, number][] = [];
  const staffPiece = (index: number) => index === 0 ? pieces.find(piece => piece.kind === 'register') : pieces.find(piece => piece.kind === 'workbench' && piece.index === index);
  for (let index = 0; index < shop.staff; index++) {
    const piece = staffPiece(index);
    if (!piece) { staffSpots.push([3.13, 5.08]); continue; }
    const place = placeOf(layout, piece);
    const size = footprint(piece.kind, place.rot);
    const center = { x: place.x + size.w / 2, y: place.y + size.d / 2 };
    const sides = freeSides(place, piece.kind, blocked);
    const best = sides.sort((a, b) => (a.x + a.y) - (b.x + b.y)).find(tile => tile.x + tile.y >= center.x + center.y - .5) || sides[0];
    staffSpots.push(best ? [best.x + .5, best.y + .5] : [center.x, center.y]);
  }

  return <g ref={groupRef}>
    {!noGround && <g>
      <polygon points={polygon([[-1.5,-1.35,-.2],[11.8,-1.35,-.2],[11.8,10.1,-.2],[-1.5,10.1,-.2]])} fill="#829e8a" opacity=".09" transform="translate(4 12)" />
      <Cube x={-1.5} y={-1.35} z={-.18} w={13.3} d={11.45} h={.22} top="#dce8de" left="#bed0c2" right="#c6d7ca" />
      <polygon points={polygon([[9.45,-1.3,.055],[11.75,-1.3,.055],[11.75,10,.055],[9.45,10,.055]])} fill="#ebeae5" />
      <polygon points={polygon([[-1.45,7.7,.056],[9.5,7.7,.056],[9.5,10,.056],[-1.45,10,.056]])} fill="#ebeae5" />
      {Array.from({length: 13},(_,i) => <polyline key={`p${i}`} points={pts([p(-1.45+i,7.7,.061),p(-1.45+i,10,.061)])} stroke="#dcded7" strokeWidth=".8" fill="none" />)}
      {Array.from({length: 12},(_,i) => <polyline key={`q${i}`} points={pts([p(9.45,-1.3+i,.061),p(11.75,-1.3+i,.061)])} stroke="#dcded7" strokeWidth=".8" fill="none" />)}
      <Tree x={-.78} y={1.2} />
      <Tree x={9.8} y={-.35} />
    </g>}
    <Cube x={-.2} y={-.2} z={.06} w={9.4} d={7.4} h={.3} top={tcg ? '#eae5ef' : it ? '#e4edf0' : '#f0e9dc'} left="#c2b7cd" right="#d0c6d8" />
    {Array.from({length:9},(_,x) => Array.from({length:7},(_,y) => <polygon key={`tile-${x}-${y}`} points={polygon([[x,y,.37],[x+.99,y,.37],[x+.99,y+.99,.37],[x,y+.99,.37]])} fill={(tcg ? ['#eee8f1','#f6f1f6'] : it ? ['#e9f0f2','#f4f8f7'] : ['#f2ebdf','#faf5ec'])[(x+y)%2]} stroke={tcg ? '#eee8f1' : it ? '#e9f0f2' : '#f2ebdf'} strokeWidth=".5" />))}
    {editing && <g className="layout-grid" pointerEvents="none">
      {Array.from({ length: GRID_W + 1 }, (_, i) => <polyline key={`v${i}`} points={pts([p(i, 0, .378), p(i, GRID_H, .378)])} />)}
      {Array.from({ length: GRID_H + 1 }, (_, i) => <polyline key={`h${i}`} points={pts([p(0, i, .378), p(GRID_W, i, .378)])} />)}
      {DOOR_TILES.map(tile => <polygon key={`door-${tile.x}-${tile.y}`} points={polygon([[tile.x,tile.y,.379],[tile.x+1,tile.y,.379],[tile.x+1,tile.y+1,.379],[tile.x,tile.y+1,.379]] as [number, number, number][])} className="layout-door" />)}
    </g>}
    {editing && drag && <polygon points={polygon(([[drag.place.x, drag.place.y, FLOOR_Z + .02], [drag.place.x + footprint(drag.kind, drag.place.rot).w, drag.place.y, FLOOR_Z + .02], [drag.place.x + footprint(drag.kind, drag.place.rot).w, drag.place.y + footprint(drag.kind, drag.place.rot).d, FLOOR_Z + .02], [drag.place.x, drag.place.y + footprint(drag.kind, drag.place.rot).d, FLOOR_Z + .02]] as [number, number, number][]))} className={`layout-ghost ${drag.valid ? 'valid' : 'invalid'}`} pointerEvents="none" />}
    <Cube x={0} y={-.22} w={9.12} d={.22} h={3.5} top="#e0d6ee" left={wall2} right={wall} />
    <Cube x={-.22} y={0} w={.22} d={6.9} h={3.5} top="#dfd5eb" left={wall} right={wall} />
    <polygon points={polygon([[.012,2.2,1.3],[.012,3.85,1.3],[.012,3.85,3.2],[.012,2.2,3.2]])} fill="#e6f0f1" stroke="#f9f8f6" strokeWidth="4" />
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
    {ordered.filter(entry => entry.piece.id !== drag?.id).map(entry => pieceNode(entry.piece, entry.place, false))}
    {drag && (() => { const entry = placed.find(candidate => candidate.piece.id === drag.id); return entry ? pieceNode(entry.piece, drag.place, true) : null; })()}
    {staffSpots.map(([x, y], index) => <Person key={`staff-${index}`} x={x} y={y} color={index === 0 ? '#96aabe' : '#b5a0c5'} staff />)}
    {showCustomers && !reduced && <CustomerGroup walkers={walkers} />}
    {showCustomers && reduced && <g>
      <Person x={1.6} y={2.6} color="#ddb28c" />
      <Person x={6.6} y={1.6} color="#89abc3" />
      <Person x={2.6} y={5.4} color="#c89eab" />
    </g>}
    <Cube x={-.22} y={7} w={6.9} d={.2} h={.75} top="#d4c3e1" left={tcg ? '#b59cce' : it ? '#9fbecf' : '#d2aa83'} right="#c5b0d9" />
    <g transform={`translate(${p(1.15,7.24,.8).join(',')}) rotate(26.565)`}>
      <text fill="#fffdfd" fontSize="12" fontWeight="800" letterSpacing="1.4">{shop.name.toUpperCase()}</text>
    </g>
    <Cube x={9} y={0} w={.23} d={7} h={.36} top="#ddd1e8" left="#c2b0d5" right="#c5b5d6" />
    <Cube x={6.85} y={7} w={.22} d={.3} h={2.3} top="#e8dcef" left="#cdbade" right="#d9c9e7" />
    <Cube x={8.78} y={7} w={.22} d={.3} h={2.3} top="#e8dcef" left="#cdbade" right="#d9c9e7" />
    <Cube x={6.85} y={7} z={2.52} w={2.15} d={.3} h={.24} top="#e6dcf0" left="#bfadd4" right="#d4c3e3" />
    <polygon points={polygon([[7.08,7.15,.4],[8.77,7.15,.4],[8.77,7.15,2.5],[7.08,7.15,2.5]])} fill="#cfebed" opacity=".24" />
    <polyline points={pts([p(7.92,7.15,.4),p(7.92,7.15,2.5)])} stroke="#eeeaf3" strokeWidth="2" />
    <polyline points={pts([p(7.73,7.17,1.35),p(7.73,7.17,1.65)])} stroke="#b19cc9" strokeWidth="2.5" />
    <g transform={`translate(${p(8.39,7.18,1.67).join(',')}) rotate(26.565)`}>
      <rect x="-13" y="-5" width="26" height="11" rx="1.6" fill={shop.open ? '#5c9474' : '#b38b79'} stroke="#f8f8eb" strokeWidth="1.2" />
      <text x="0" y="2.5" textAnchor="middle" fill="#fffdf3" fontSize="6.2" fontWeight="800" letterSpacing=".4">{shop.open ? 'OFFEN' : 'ZU'}</text>
    </g>
    {!noGround && <g>
      <Cube x={6.88} y={7.25} z={.06} w={2.16} d={.48} h={.15} top="#e4dce9" left="#cbc2d3" right="#d5cdda" />
      <Cube x={6.88} y={7.73} z={.05} w={2.16} d={.35} h={.07} top="#e8e1eb" left="#d0c8d7" right="#d8d1de" />
      <Bench x={1.25} y={8.57} />
      <Bench x={10.13} y={1.66} />
      <Plant x={-.7} y={7.1} big />
      <Plant x={9.3} y={7.25} big />
      <Tree x={10.4} y={8.55} />
      <g><path d={`M${p(11,.3)[0]} ${p(11,.3)[1]}v-75`} stroke="#a6b5ad" strokeWidth="3" /><circle cx={p(11,.3)[0]} cy={p(11,.3)[1]-78} r="7" fill="#f8f5db" stroke="#bbc9bb" strokeWidth="2" /></g>
      {showCustomers && <g><Person x={9.9} y={8.9} color="#c190ae" walking delay={1} /><Person x={5.04} y={9.04} color="#7498b3" walking delay={3} /><Person x={10.38} y={4.44} color="#e0ad67" walking delay={2} /><Person x={-.66} y={8.67} color="#8aada1" /></g>}
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

export function IsoScene({ game, kind, mode, zoom, editing = false, onInteract, onInspect, onMove, selected, onSelect }: {
  game: GameState;
  kind: ShopKind;
  mode: 'shop' | 'mall';
  zoom: number;
  editing?: boolean;
  onInteract: Interaction;
  onInspect: (good: VisibleGood) => void;
  onMove?: (id: string, place: Placement) => void;
  selected: VisibleGood | null;
  onSelect: (kind: ShopKind) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (game.paused || reduced) ref.current?.pauseAnimations();
    else ref.current?.unpauseAnimations();
  }, [game.paused, mode]);
  return <svg ref={ref} className={`iso-scene ${game.paused ? 'simulation-paused' : ''} ${editing ? 'is-arranging' : ''}`} viewBox="0 0 860 500" role="group" aria-label={`Interaktive isometrische ${mode === 'shop' ? SHOPS[kind].label : 'Mall'}-Ansicht`}>
    <defs><filter id="scene-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#809c89" floodOpacity=".12" /></filter></defs>
    <g transform={`translate(430 250) scale(${zoom}) translate(-430 -250)`}>
      {mode === 'shop'
        ? <g filter="url(#scene-shadow)"><IsoShop kind={kind} shop={game.shops[kind]} editing={editing} paused={game.paused} onInteract={onInteract} onInspect={onInspect} onMove={onMove} selected={selected} preview={!game.hasChosen} /></g>
        : <g>
          <polygon points="35,216 443,12 817,202 410,422" fill="#e1eae0" />
          <path d="M160 275L550 80M250 330L654 128M330 180L653 341" stroke="#eeeee8" strokeWidth="36" />
          {SHOP_ORDER.map((k, index) => {
            const transform = ['translate(-30 15) scale(.53)', 'translate(360 -8) scale(.5)', 'translate(185 248) scale(.43)'][index];
            const empty = [{x:55,y:165},{x:485,y:98},{x:238,y:311}][index];
            const visible = game.hasChosen ? game.shops[k].owned : k === kind;
            return visible ? <g key={k} transform={transform} onClick={() => onSelect(k)} className="mall-shop" role="button" tabIndex={0} aria-label={`${game.shops[k].name} ansehen`} onKeyDown={e => { if (e.key === 'Enter') onSelect(k); }}><IsoShop kind={k} shop={game.shops[k]} paused={game.paused} noGround preview={!game.hasChosen} /></g> : <EmptyPlot key={k} {...empty} label={SHOPS[k].label} onClick={() => onInteract('expand')} />;
          })}
          <g transform="translate(430 239)"><ellipse cx="0" cy="0" rx="34" ry="18" fill="#c1d3cb" /><ellipse cx="0" cy="-5" rx="31" ry="17" fill="#a3c8d0" /><ellipse cx="0" cy="-8" rx="25" ry="13" fill="#c9e4e4" /><path d="M0-10v-35m-10 15q10-27 20 0" stroke="#e4f3ee" strokeWidth="3" fill="none" /><circle cx="0" cy="-48" r="4" fill="#e7f5f0" /></g>
          <g transform="translate(50 123) scale(.6)"><Tree x={0} y={0} /></g><g transform="translate(515 218) scale(.6)"><Tree x={0} y={0} /></g>
          <text x="104" y="450" fill="#819d89" fontSize="28" fontWeight="800" letterSpacing="6" transform="rotate(-26.565 104 450)">MALLSIDE</text>
        </g>}
    </g>
  </svg>;
}
