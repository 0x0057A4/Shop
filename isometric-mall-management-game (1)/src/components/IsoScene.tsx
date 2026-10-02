import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { FurnitureKind, GameState, Shop, ShopKind } from '../game/data';
import { SHOPS, SHOP_ORDER } from '../game/data';
import type { VisibleGood } from '../game/visualInventory';
import { createShopDisplay } from '../game/visualInventory';
import { GoodFigure } from './IsoGoods';
import { Cube, p, pts, polygon } from './isoGeometry';

function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
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

function Tree({ x, y }: { x: number; y: number }) {
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

function Person({ x, y, color = '#e5a178', walking = false, delay = 0, staff = false }: { x: number; y: number; color?: string; walking?: boolean; delay?: number; staff?: boolean }) {
  const [px, py] = p(x, y, 0.4);
  return <g className={walking ? 'customer-walking' : ''}>
    {walking && <animateTransform attributeName="transform" type="translate" values="0 0; 14 7; 0 0" dur={`${7 + delay}s`} begin={`${-delay}s`} repeatCount="indefinite" />}
    <ellipse cx={px} cy={py} rx="10" ry="4.5" fill="#68768c" opacity=".15" />
    <path d={`M${px - 3} ${py - 17}l-1 14m9-14l1 14`} stroke="#475168" strokeWidth="4.5" strokeLinecap="round" />
    <path d={`M${px - 5} ${py - 2}h-4m15 0h4`} stroke="#354159" strokeWidth="3" strokeLinecap="round" />
    <path d={`M${px - 7} ${py - 31}l-4 13m18-13l4 13`} stroke={color} strokeWidth="5" strokeLinecap="round" />
    <path d={`M${px - 7} ${py - 32}q7-5 14 0l1 17q-8 4-16 0z`} fill={color} />
    {staff && <path d={`M${px - 4} ${py - 29}h8l3 14h-14z`} fill="#f2f1db" opacity=".9" />}
    <rect x={px - 2.5} y={py - 38} width="5" height="7" rx="2" fill="#e6b694" />
    <ellipse cx={px} cy={py - 42} rx="7" ry="8" fill="#efc4a3" />
    <path d={`M${px - 7} ${py - 42}q-1-12 9-9q8 1 5 9l-3-5-6 1z`} fill={staff ? '#665542' : '#59566c'} />
    {!staff && <g><rect x={px + 8} y={py - 19} width="9" height="12" rx="1.5" fill="#f2dfba" /><path d={`M${px + 10} ${py - 18}v-4h5v4`} stroke="#c4ab83" fill="none" /></g>}
  </g>;
}

function Rack({ x, y, kind, shop, units, onInspect, selected, alongY = false }: { x: number; y: number; kind: ShopKind; shop: Shop; units: VisibleGood[]; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null; alongY?: boolean }) {
  const c = kind === 'tcg' ? { dark: '#9a85b7', light: '#d1c1e1', top: '#dfd4ea' } : kind === 'it' ? { dark: '#7c9ba9', light: '#b6cbd3', top: '#d0dce3' } : { dark: '#b38c6d', light: '#d4b699', top: '#e9d2b4' };
  const w = alongY ? .65 : 1.68, d = alongY ? 1.68 : .65;
  return <g>
    <Cube x={x} y={y} w={w} d={d} h={2.15} top={c.top} left={c.dark} right={c.light} />
    {[.48, 1.12, 1.76].map((z, level) => <g key={z}>
      <Cube x={x+.03} y={y+.03} z={z} w={w-.06} d={d+.04} h={.075} top={c.top} left={c.light} right={c.top} />
      {[0, 1, 2].map(i => {
        const unit = units[level * 3 + i];
        return unit && <GoodFigure key={`${level}-${i}-${unit.id}`} x={x + (alongY ? .13 : .11 + i*.51)} y={y + (alongY ? .12 + i*.51 : .28)} z={z+.085} kind={kind} good={unit} count={unit.type === 'card' ? 1 : shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />;
      })}
    </g>)}
    <Cube x={x} y={y} z={2.54} w={w} d={d} h={.1} top={c.top} left={c.light} right={c.light} />
  </g>;
}

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
  return <g className="iso-hotspot" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={label} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}><title>{label}</title>{children}</g>;
}

function IsoShop({ kind, shop, onInteract, onInspect, selected, preview = false, noGround = false }: { kind: ShopKind; shop: Shop; onInteract?: Interaction; onInspect?: (good: VisibleGood) => void; selected?: VisibleGood | null; preview?: boolean; noGround?: boolean }) {
  const tcg = kind === 'tcg', it = kind === 'it';
  const wall = tcg ? '#c3afe2' : it ? '#b1cddc' : '#e6c9aa';
  const wall2 = tcg ? '#d5c7eb' : it ? '#c8dce5' : '#f0dbc1';
  const accent = SHOPS[kind].color;
  const [signX,signY] = p(2.8,.22,3.05);
  const display = createShopDisplay(kind, shop);
  const displayed = [...display.showcase, ...display.center, ...display.shelves.flat()];
  const showCustomers = preview || (shop.open && displayed.length > 0);
  const workstationJobs = shop.queue.slice(0, Math.min(shop.furniture.workbench, shop.staff));
  const current = workstationJobs[0];
  const currentRecipe = current && SHOPS[kind].recipes.find(recipe => recipe.id === current.recipeId);
  const currentRepair = current?.repairId ? shop.orders.find(order => order.id === current.repairId) : undefined;
  const workingGood: VisibleGood | null = currentRecipe ? { type: 'item', id: currentRecipe.output } : currentRepair ? { type: 'item', id: currentRepair.device.includes('PC') ? 'pc' : 'notebook' } : null;
  const ovenActive = !tcg && !it && !!currentRecipe && currentRecipe.output !== 'dough';
  const stageColor = tcg ? '#eae5ef' : it ? '#e4edf0' : '#f0e9dc';
  const floorColor = tcg ? ['#eee8f1','#f6f1f6'] : it ? ['#e9f0f2','#f4f8f7'] : ['#f2ebdf','#faf5ec'];
  const rackPositions = [
    { x: .35, y: .62, alongY: true },
    { x: 1.88, y: .35, alongY: false },
    { x: 3.75, y: .35, alongY: false },
    { x: .35, y: 4.22, alongY: true },
    { x: 5.08, y: 4.57, alongY: false },
  ];
  return <g>
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
    <Cube x={-.2} y={-.2} z={.06} w={9.4} d={7.4} h={.3} top={stageColor} left="#c2b7cd" right="#d0c6d8" />
    {Array.from({length:9},(_,x) => Array.from({length:7},(_,y) => <polygon key={`${x}-${y}`} points={polygon([[x,y,.37],[x+.99,y,.37],[x+.99,y+.99,.37],[x,y+.99,.37]])} fill={floorColor[(x+y)%2]} stroke={floorColor[0]} strokeWidth=".5" />))}
    <Cube x={-.12} y={-.12} w={9.28} d={.22} h={3.5} top="#e0d6ee" left={wall2} right={wall} />
    <Cube x={-.12} y={.1} w={.22} d={6.9} h={3.5} top="#dfd5eb" left={wall} right={wall} />
    <polygon points={polygon([[.115,2.2,1.3],[.115,3.85,1.3],[.115,3.85,3.2],[.115,2.2,3.2]])} fill="#e6f0f1" stroke="#f9f8f6" strokeWidth="4" />
    <polyline points={pts([p(.12,3.02,1.3),p(.12,3.02,3.2)])} stroke="#fff" strokeWidth="3" />
    <polyline points={pts([p(.12,2.2,2.3),p(.12,3.85,2.3)])} stroke="#fff" strokeWidth="3" />
    <polygon points={polygon([[.12,2.25,1.5],[.12,3.6,1.5],[.12,3.6,2.8]])} fill="#c4e1df" opacity=".6" />
    <g transform={`translate(${p(7.34,.13,2.84).join(',')}) rotate(26.565)`}>
      <rect x="-37" y="-25" width="76" height="44" rx="3" fill={tcg ? '#6d548e' : it ? '#4f7287' : '#996f52'} stroke="#f8f3ee" strokeWidth="3" />
      {tcg ? <g><rect x="-23" y="-16" width="17" height="24" rx="2" fill="#d7a77d" /><rect x="-19" y="-12" width="9" height="13" fill="#6b4e8d" /><rect x="4" y="-16" width="17" height="24" rx="2" fill="#92b9b2" /><rect x="8" y="-12" width="9" height="13" fill="#486c88" /><path d="M-11-7l3 4-3 5-3-5zM12-7l3 4-3 5-3-5z" fill="#fff2cf" /></g> : it ? <g><path d="M-23-15h11v11h11v17M22-16H8v10H-4v14h-14" fill="none" stroke="#a5dbcf" strokeWidth="2" /><rect x="-10" y="-10" width="20" height="20" rx="2" fill="#9fc8c8" /><rect x="-5" y="-5" width="10" height="10" fill="#4b7182" /><circle cx="-23" cy="-15" r="2" fill="#fff2d4"/><circle cx="-18" cy="8" r="2" fill="#fff2d4"/></g> : <g><path d="M-27 3q8-16 17-15 12-1 15 13v7q-16 9-32 0z" fill="#dfad75"/><path d="M-17-7l5 11m5-9l4 10" stroke="#fae1af" strokeWidth="2"/><path d="M14 7q4-8 9-7t8 7q-10 7-17 0z" fill="#e8bf8b"/><circle cx="23" cy="-5" r="3" fill="#aa6674"/></g>}
    </g>
    <g transform={`translate(${signX},${signY}) rotate(26.565)`}>
      <rect x="-6" y="-26" width="184" height="36" rx="4" fill="#faf8fd" opacity=".94" />
      <text x="86" y="-3" textAnchor="middle" fill={tcg ? '#725297' : it ? '#47718d' : '#9d7351'} fontSize={shop.name.length > 15 ? 13 : 18} fontWeight="800" letterSpacing="1">{shop.name.toUpperCase()}</text>
      <rect x="18" y="15" width="42" height="3" rx="1.5" fill={accent} opacity=".25" /><rect x="70" y="15" width="78" height="3" rx="1.5" fill={accent} opacity=".25" />
    </g>
    {rackPositions.slice(0,shop.furniture.shelf).map((position,index) => <Hotspot key={index} label={`Regal ${index+1}: ${display.shelves[index]?.length || 0} Produkte sichtbar. Anklicken zum Einrichten.`} onClick={onInteract ? () => onInteract('furnishing', 'shelf') : undefined}>
      <Rack {...position} kind={kind} shop={shop} units={display.shelves[index]} onInspect={onInspect} selected={selected} />
    </Hotspot>)}
    <Hotspot label="Rohstoff-Vorrat ansehen" onClick={onInteract ? ()=>onInteract('inventory') : undefined}>
      <Cube x={5.53} y={.73} w={.65} d={1.91} h={.42} top={tcg ? '#d7c9e2' : it ? '#bbd0d4' : '#e5cfb1'} left="#b9afa7" right="#cbbfae" />
      <Cube x={5.52} y={.72} z={.79} w={.68} d={1.94} h={.07} top="#eee9df" left="#d3c8be" right="#e4dace" />
      {display.materials.map((unit,i)=><GoodFigure key={`material-${unit.id}`} x={5.67} y={.79+i*.36} z={.88} kind={kind} good={unit} count={shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />)}
    </Hotspot>
    <Plant x={.35} y={6.25} />
    <Hotspot label={it ? 'Reparaturbank öffnen' : tcg ? 'Sortiertisch und Produktion öffnen' : 'Backstube öffnen'} onClick={onInteract ? () => onInteract('production') : undefined}>
      <Cube x={6.22} y={.65} w={2.28} d={1.15} h={.92} top="#ede2d3" left={it ? '#90adb9' : '#bcaa9b'} right={it ? '#a3bec8' : '#cec0ad'} />
      <Cube x={6.15} y={.6} z={1.28} w={2.4} d={1.27} h={.12} top="#f4eee6" left="#e1d5c5" right="#e7ddd0" />
      {it ? <g>
        <Cube x={6.6} y={.88} z={1.42} w={.86} d={.16} h={.68} top="#566c80" left="#344c61" right="#496376" />
        <polygon points={polygon([[6.67,1.05,1.53],[7.39,1.05,1.53],[7.39,1.05,2.01],[6.67,1.05,2.01]])} fill={current ? '#98d4d9' : '#839da4'} />
        <polyline points={pts([p(6.73,1.06,1.71),p(6.87,1.06,1.71),p(6.94,1.06,1.85),p(7.04,1.06,1.66),p(7.13,1.06,1.77),p(7.29,1.06,1.77)])} fill="none" stroke={current ? '#e0f9e7' : '#b9ced0'} strokeWidth="1.6" />
        {workingGood ? <GoodFigure x={7.65} y={.89} z={1.41} good={workingGood} kind={kind} inProgress /> : shop.stock.motherboard > 0 ? <GoodFigure x={7.66} y={1.04} z={1.42} good={{type:'item',id:'motherboard'}} kind={kind} count={shop.stock.motherboard} onInspect={onInspect} selected={selected?.type === 'item' && selected.id === 'motherboard'} /> : <g><Cube x={7.68} y={1.06} z={1.41} w={.47} d={.36} h={.02} top="#5d918d" /><path d={`M${pts([p(7.9,1.1,1.44),p(8.15,1.38,1.53)])}`} stroke="#c4a8a0" strokeWidth="2" /></g>}
      </g> : tcg ? <g>
        <Cube x={6.54} y={.87} z={1.42} w={1.55} d={.72} h={.025} top="#a996c7" />
        <Cube x={6.67} y={1.07} z={1.46} w={.56} d={.34} h={.08} top="#756196" left="#61517f" right="#8a78a6" />
        <polyline points={pts([p(6.73,1.42,1.51),p(7.15,1.42,1.51)])} stroke="#e1cb9a" strokeWidth="1" />
        {workingGood && <GoodFigure x={7.59} y={1.08} z={1.46} good={workingGood} kind={kind} inProgress />}
      </g> : <g>
        <Cube x={6.37} y={.76} z={1.4} w={1.05} d={.66} h={.94} top="#9eafb2" left="#6b8185" right="#8c9da0" />
        <polygon points={polygon([[6.48,1.43,1.54],[7.32,1.43,1.54],[7.32,1.43,2.07],[6.48,1.43,2.07]])} fill="#475f66" stroke="#bbcbca" strokeWidth="2" />
        <polygon points={polygon([[6.55,1.435,1.65],[7.25,1.435,1.65],[7.25,1.435,1.9],[6.55,1.435,1.9]])} fill={ovenActive ? '#e8ab60' : '#53676a'} opacity=".85" className={ovenActive ? 'production-light' : ''} />
        {workingGood ? <GoodFigure x={7.7} y={1.09} z={1.42} good={workingGood} kind={kind} inProgress /> : shop.stock.dough > 0 ? <GoodFigure x={7.7} y={1.09} z={1.42} good={{type:'item',id:'dough'}} kind={kind} count={shop.stock.dough} onInspect={onInspect} selected={selected?.type === 'item' && selected.id === 'dough'} /> : <ellipse cx={p(7.91,1.26,1.42)[0]} cy={p(7.91,1.26,1.42)[1]} rx="11" ry="5" fill="#d2c0a8" />}
      </g>}
      {current && <polyline points={pts([p(6.43,1.812,1.03),p(6.43+1.82*Math.min(1,current.progress/current.duration),1.812,1.03)])} fill="none" stroke={accent} strokeWidth="2.8" strokeLinecap="round" className="production-light" />}
      <circle cx={p(8.3,1.8,1.15)[0]} cy={p(8.3,1.8,1.15)[1]} r="3" fill={shop.queue.length ? '#b4e4a5' : '#dbe3cf'} className={shop.queue.length ? 'production-light' : ''} />
    </Hotspot>
    {shop.furniture.decor > 1 && <g>
      <Plant x={8.3} y={.25} />
      <g transform={`translate(${p(5.64,.14,2.8).join(',')}) rotate(26.565)`}>
        <rect x="-21" y="-13" width="44" height="25" rx="2" fill={tcg ? '#654a89' : it ? '#41627c' : '#60715c'} stroke={tcg ? '#b494d7' : it ? '#80c5c6' : '#d2bd96'} strokeWidth="2" />
        {tcg ? <g><path d="M0-8l3 6 7 1-6 5 2 7-6-4-6 4 2-7-6-5 7-1z" fill="#eac883" /><circle cx="-13" cy="-6" r="1" fill="#d9c5ec" /><circle cx="14" cy="3" r="1" fill="#d9c5ec" /></g> : it ? <g>{[-12,-4,4,12].map((x,i)=><circle key={i} cx={x} cy={i%2 ? 3 : -2} r="2" fill={i%2 ? '#a6e1c7' : '#c3adda'} />)}<path d="M-16 6h32" stroke="#91c6bb" strokeWidth="1" /></g> : <text x="1" y="4" textAnchor="middle" fill="#f6e9c7" fontSize="8" fontWeight="800" letterSpacing=".6">FRISCH</text>}
      </g>
    </g>}
    {shop.furniture.decor > 2 && <Plant x={4.85} y={6.05} />}
    {shop.furniture.decor > 3 && <g transform={`translate(${p(8.32,.24,3.1).join(',')}) rotate(26.565)`}><path d="M0-13l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="none" stroke="#fff5d5" strokeWidth="3"/><path d="M0-13l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="none" stroke={accent} strokeWidth="1"/></g>}
    <Hotspot label={tcg ? 'Booster-Pack öffnen oder Ware auswählen' : 'Auslage ansehen oder Ware auswählen'} onClick={onInteract ? () => onInteract('special') : undefined}>
      <Cube x={2.2} y={3.1} w={2.6} d={.95} h={.62} top="#d1bdde" left={tcg ? '#c1afd7' : it ? '#a1bfcd' : '#d9b99a'} right={tcg ? '#d4c2e4' : it ? '#c3d9e0' : '#e9d1b4'} />
      {display.showcase.map((unit,i) => <GoodFigure key={`showcase-${i}-${unit.id}`} x={2.34+i*.48} y={3.35} z={1.01} good={unit} kind={kind} count={unit.type==='card' ? 1 : shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />)}
      <g pointerEvents="none"><Cube x={2.2} y={3.1} z={1.0} w={2.6} d={.95} h={.53} top="#eaf3f3" left="#d7eeee" right="#c9e4e9" opacity={.3} /><polyline points={pts([p(2.2,4.05,1),p(2.2,4.05,1.53),p(4.8,4.05,1.53),p(4.8,4.05,1)])} fill="none" stroke="#f8f6fd" strokeWidth="2" /></g>
    </Hotspot>
    <Cube x={5.25} y={2.53} w={1.2} d={1.12} h={.67} top={it ? '#c9dce2' : tcg ? '#e0d3ea' : '#e9d6ba'} left={it ? '#92b5c2' : tcg ? '#bda9d1' : '#cfac86'} right={it ? '#aecdd5' : tcg ? '#cab9dc' : '#dcc19c'} />
    {display.center.map((unit,i) => <GoodFigure key={`center-${i}-${unit.id}`} x={5.3+i*.38} y={2.92} z={1.06} good={unit} kind={kind} count={unit.type==='card' ? 1 : shop.stock[unit.id]} selected={selected?.type === unit.type && selected.id === unit.id} onInspect={onInspect} />)}
    {Array.from({length:Math.max(0,shop.furniture.workbench-1)},(_,i) => {
      const x = i === 0 ? 7.12 : 7.13, y = i === 0 ? 2.56 : 4.75;
      const job = workstationJobs[i+1];
      const recipe = job && SHOPS[kind].recipes.find(item=>item.id === job.recipeId);
      const repair = job?.repairId ? shop.orders.find(order=>order.id === job.repairId) : undefined;
      const item: VisibleGood | null = recipe ? { type:'item', id:recipe.output } : repair ? { type:'item', id:repair.device.includes('PC') ? 'pc' : 'notebook' } : null;
      return <Hotspot key={i} label={`Arbeitsplatz ${i+2}: ${recipe?.name || repair?.device || 'frei'}. Produktion öffnen.`} onClick={onInteract ? ()=>onInteract('production') : undefined}>
        <Cube x={x} y={y} w={1.4} d={.78} h={.78} top="#f0e5d9" left="#baa997" right="#d4c3af" />
        {item ? <GoodFigure x={x+.48} y={y+.2} z={1.16} good={item} kind={kind} inProgress /> : <g><Cube x={x+.34} y={y+.16} z={1.16} w={.67} d={.39} h={.02} top={accent} opacity={.55} /><polyline points={pts([p(x+.49,y+.25,1.2),p(x+.8,y+.43,1.2)])} stroke="#f9f5e8" strokeWidth="1" /></g>}
      </Hotspot>;
    })}
    {shop.staff > 1 && <Person x={7.75} y={2.2} color="#96aabe" staff />}
    {shop.staff > 2 && <Person x={7.73} y={4.4} color="#b5a0c5" staff />}
    {showCustomers && <Person x={6.92} y={4.15} color="#ddb28c" />}
    {showCustomers && shop.popularity >= 58 && <Person x={4.91} y={4.18} color="#89abc3" />}
    {showCustomers && shop.popularity >= 78 && <Person x={6.62} y={5.84} color="#c89eab" />}
    <Person x={3.13} y={5.08} color="#88b8a4" staff />
    <Hotspot label="Kasse und Einrichtung verwalten" onClick={onInteract ? () => onInteract('furnishing', 'register') : undefined}>
      <Cube x={1.77} y={5.35} w={2.85} d={1.05} h={1.01} top="#f0e5ef" left={accent} right={tcg ? '#ac94cb' : it ? '#8bb0c4' : '#e0b789'} />
      <Cube x={1.68} y={5.29} z={1.37} w={3.03} d={1.17} h={.12} top="#f7f0f8" left="#e0d3e9" right="#e8ddf0" />
      <polygon points={polygon([[2.0,6.41,.75],[4.35,6.41,.75],[4.35,6.41,1.14],[2,6.41,1.14]])} fill="#ffffff" opacity=".13" />
      <Cube x={3.8} y={5.55} z={1.5} w={.16} d={.2} h={.25} top="#6b7683" left="#5b6577" right="#85919a" />
      <Cube x={3.62} y={5.65} z={1.66} w={.64} d={.12} h={.46} top="#536471" left="#354b54" right="#576a71" />
      <polygon points={polygon([[3.67,5.78,1.73],[4.2,5.78,1.73],[4.2,5.78,2.06],[3.67,5.78,2.06]])} fill="#a7d8c6" />
      {shop.furniture.register > 1 && <g><Cube x={2.85} y={5.74} z={1.62} w={.48} d={.12} h={.38} top="#536471" left="#354b54" right="#576a71" /><polygon points={polygon([[2.89,5.87,1.69],[3.29,5.87,1.69],[3.29,5.87,1.96],[2.89,5.87,1.96]])} fill="#a7d8c6" /></g>}
      {shop.furniture.register > 2 && <g><Cube x={2.14} y={5.74} z={1.62} w={.43} d={.12} h={.36} top="#536471" left="#354b54" right="#576a71" /><polygon points={polygon([[2.18,5.87,1.69],[2.52,5.87,1.69],[2.52,5.87,1.94],[2.18,5.87,1.94]])} fill="#a7d8c6" /></g>}
      <Cube x={2.1} y={5.61} z={1.49} w={.55} d={.4} h={.18} top="#e3d5a1" left="#c7b884" right="#d8c993" />
    </Hotspot>
    <Cube x={-.1} y={6.92} w={6.9} d={.2} h={.75} top="#d4c3e1" left={tcg ? '#b59cce' : it ? '#9fbecf' : '#d2aa83'} right="#c5b0d9" />
    <g transform={`translate(${p(1.15,7.15,.8).join(',')}) rotate(26.565)`}>
      <text fill="#fffdfd" fontSize="12" fontWeight="800" letterSpacing="1.4">{shop.name.toUpperCase()}</text>
    </g>
    <Cube x={8.84} y={.1} w={.23} d={6.98} h={.36} top="#ddd1e8" left="#c2b0d5" right="#c5b5d6" />
    <Cube x={6.85} y={6.89} w={.22} d={.3} h={2.3} top="#e8dcef" left="#cdbade" right="#d9c9e7" />
    <Cube x={8.78} y={6.89} w={.22} d={.3} h={2.3} top="#e8dcef" left="#cdbade" right="#d9c9e7" />
    <Cube x={6.85} y={6.89} z={2.52} w={2.15} d={.3} h={.24} top="#e6dcf0" left="#bfadd4" right="#d4c3e3" />
    <polygon points={polygon([[7.08,7.04,.4],[8.77,7.04,.4],[8.77,7.04,2.5],[7.08,7.04,2.5]])} fill="#cfebed" opacity=".24" />
    <polyline points={pts([p(7.92,7.04,.4),p(7.92,7.04,2.5)])} stroke="#eeeaf3" strokeWidth="2" />
    <polyline points={pts([p(7.73,7.06,1.35),p(7.73,7.06,1.65)])} stroke="#b19cc9" strokeWidth="2.5" />
    <g transform={`translate(${p(8.39,7.07,1.67).join(',')}) rotate(26.565)`}>
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
      {showCustomers && <g><Person x={8.06} y={7.62} color="#c190ae" walking delay={1} /><Person x={5.04} y={9.04} color="#7498b3" walking delay={3} /><Person x={10.38} y={4.44} color="#e0ad67" walking delay={2} /><Person x={-.66} y={8.67} color="#8aada1" /></g>}
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

export function IsoScene({ game, kind, mode, zoom, onInteract, onInspect, selected, onSelect }: { game: GameState; kind: ShopKind; mode: 'shop' | 'mall'; zoom: number; onInteract: Interaction; onInspect: (good: VisibleGood) => void; selected: VisibleGood | null; onSelect: (kind: ShopKind) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (game.paused || reduced) ref.current?.pauseAnimations();
    else ref.current?.unpauseAnimations();
  }, [game.paused, mode]);
  return <svg ref={ref} className={`iso-scene ${game.paused ? 'simulation-paused' : ''}`} viewBox="0 0 860 500" role="group" aria-label={`Interaktive isometrische ${mode === 'shop' ? SHOPS[kind].label : 'Mall'}-Ansicht`}>
    <defs><filter id="scene-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#809c89" floodOpacity=".12" /></filter></defs>
    <g transform={`translate(430 250) scale(${zoom}) translate(-430 -250)`}>
      {mode === 'shop' ? <g filter="url(#scene-shadow)"><IsoShop kind={kind} shop={game.shops[kind]} onInteract={onInteract} onInspect={onInspect} selected={selected} preview={!game.hasChosen} /></g> : <g>
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