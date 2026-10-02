import type { MouseEvent } from 'react';
import type { ShopKind } from '../game/data';
import { getItem } from '../game/data';
import type { VisibleGood } from '../game/visualInventory';
import { Cube, p, polygon, pts } from './isoGeometry';

const rarityColors = { Gewoehnlich: '#aaa8c1', Selten: '#76abd4', Episch: '#b387da', Legendaer: '#e1b45c' };
const elementColors = { fire: '#e99374', forest: '#8ebc84', water: '#83b9db', crystal: '#cba7db', moon: '#9c9bce' };

interface FigureProps {
  x: number;
  y: number;
  z: number;
  kind: ShopKind;
  good: VisibleGood;
  count?: number;
  selected?: boolean;
  onInspect?: (good: VisibleGood) => void;
  inProgress?: boolean;
}

function Front({ x, y, z, w, h, fill, inset = .025 }: { x: number; y: number; z: number; w: number; h: number; fill: string; inset?: number }) {
  return <polygon points={polygon([[x+inset,y,z+inset],[x+w-inset,y,z+inset],[x+w-inset,y,z+h-inset],[x+inset,y,z+h-inset]])} fill={fill} />;
}

function IsoCard({ x, y, z, good }: { x: number; y: number; z: number; good: VisibleGood }) {
  const slab = good.type === 'item' && good.id === 'graded';
  const deck = good.type === 'item' && good.id === 'deck';
  const sleeve = good.type === 'item' && good.id === 'sleeves';
  const pack = good.type === 'item' && good.id === 'booster';
  const color = good.type === 'card' ? rarityColors[good.rarity] : getItem('tcg',good.id)?.color || '#8b6bd1';
  const w = deck ? .38 : .35;
  const d = deck ? .22 : sleeve ? .16 : pack ? .12 : .065;
  const h = pack ? .48 : slab ? .47 : sleeve ? .29 : deck ? .38 : .43;
  return <g>
    <Cube x={x} y={y} z={z} w={w} d={d} h={h} top={slab ? '#f9faf7' : color} left={slab ? '#e3ddd0' : '#534665'} right={slab ? '#e1e3de' : color} />
    <Front x={x} y={y+d+.002} z={z} w={w} h={h} fill={slab ? '#f8f5e9' : sleeve ? '#85bcbc' : deck ? '#594878' : pack ? '#795bad' : '#3c385c'} />
    {slab && <g><Front x={x+.04} y={y+d+.004} z={z+.045} w={w-.08} h={h-.16} fill="#3c385c" inset={0}/><Front x={x+.025} y={y+d+.006} z={z+h-.09} w={w-.05} h={.055} fill="#dcba73" inset={0}/></g>}
    {pack && <g>
      <polygon points={polygon([[x+.045,y+d+.007,z+.16],[x+w-.045,y+d+.007,z+.16],[x+w-.045,y+d+.007,z+.20],[x+.045,y+d+.007,z+.20]])} fill="#e9bf81" />
      <path d={`M${p(x+w*.5,y+d+.01,z+.34).join(' ')}l3 4-3 4-3-4z`} fill="#e8ce9d" />
      <text x={p(x+w*.48,y+d+.01,z+.11)[0]} y={p(x+w*.48,y+d+.01,z+.11)[1]} fill="#fff2c6" fontSize="5" fontWeight="900" textAnchor="middle">N</text>
    </g>}
    {deck && <g><Front x={x+.04} y={y+d+.005} z={z+.06} w={w-.08} h={.055} fill="#ddc088" inset={0}/><circle cx={p(x+w*.5,y+d+.01,z+.25)[0]} cy={p(x+w*.5,y+d+.01,z+.25)[1]} r="2.6" fill="#d8b789" /></g>}
    {sleeve && <g><Front x={x+.05} y={y+d+.005} z={z+.06} w={w-.1} h={.15} fill="#e5f2e9" inset={0}/><path d={`M${pts([p(x+.11,y+d+.01,z+.10),p(x+.25,y+d+.01,z+.19)])}`} stroke="#6daaa7" strokeWidth="1" /></g>}
    {(good.type === 'card' || good.id === 'single' || slab) && <g>
      <Front x={x+.045} y={y+d+.009} z={z+.095} w={w-.09} h={slab ? .23 : .27} fill={good.type === 'card' ? elementColors[good.element] : '#cfa77b'} inset={0} />
      <circle cx={p(x+w*.51,y+d+.013,z+.24)[0]} cy={p(x+w*.51,y+d+.013,z+.24)[1]} r="2.8" fill={good.type === 'card' ? '#f7f1d3' : '#fff1c9'} opacity=".9" />
      <Front x={x+.06} y={y+d+.013} z={z+.045} w={w-.12} h={.025} fill={color} inset={0} />
    </g>}
  </g>;
}

function IsoTech({ x, y, z, id }: { x: number; y: number; z: number; id: string }) {
  if (id === 'pc') return <g>
    <Cube x={x} y={y} z={z} w={.38} d={.28} h={.59} top="#8996a7" left="#394455" right="#576779" />
    <Front x={x} y={y+.283} z={z} w={.38} h={.59} fill="#303d50" />
    <Front x={x+.05} y={y+.286} z={z+.11} w={.28} h={.38} fill="#607895" />
    <circle cx={p(x+.19,y+.29,z+.38)[0]} cy={p(x+.19,y+.29,z+.38)[1]} r="4.1" stroke="#8ae4d6" strokeWidth="1.1" fill="#466477" />
    <circle cx={p(x+.19,y+.29,z+.21)[0]} cy={p(x+.19,y+.29,z+.21)[1]} r="3.6" stroke="#c4a2dc" strokeWidth="1" fill="#466477" />
    <circle cx={p(x+.32,y+.29,z+.06)[0]} cy={p(x+.32,y+.29,z+.06)[1]} r=".85" fill="#98e0cb" />
  </g>;
  if (id === 'notebook') return <g>
    <Cube x={x} y={y} z={z} w={.48} d={.32} h={.065} top="#a4b8c3" left="#788e9b" right="#91a6b0" />
    <Cube x={x+.025} y={y+.025} z={z+.07} w={.43} d={.045} h={.36} top="#8398a5" left="#536b83" right="#b3c5ce" />
    <Front x={x+.025} y={y+.071} z={z+.07} w={.43} h={.36} fill="#526b85" />
    <Front x={x+.065} y={y+.073} z={z+.12} w={.35} h={.25} fill="#9ed0ce" />
    <polygon points={polygon([[x+.06,y+.11,z+.069],[x+.42,y+.11,z+.069],[x+.42,y+.28,z+.069],[x+.06,y+.28,z+.069]])} fill="#687e8e" />
    <circle cx={p(x+.23,y+.071,z+.39)[0]} cy={p(x+.23,y+.071,z+.39)[1]} r="1" fill="#ecf8f1" />
  </g>;
  if (id === 'ram') return <g>
    <Cube x={x} y={y} z={z} w={.43} d={.12} h={.24} top="#619a8d" left="#3b766f" right="#63a598" />
    <Front x={x} y={y+.123} z={z} w={.43} h={.24} fill="#397d70" />
    {[0,1,2].map(i => <Front key={i} x={x+.045+i*.125} y={y+.126} z={z+.09} w={.08} h={.1} fill="#3b5860" inset={0} />)}
    {[0,1,2,3].map(i => <Front key={i} x={x+.04+i*.1} y={y+.128} z={z+.015} w={.045} h={.025} fill="#e1c589" inset={0} />)}
  </g>;
  return <g>
    <Cube x={x} y={y} z={z} w={.42} d={.29} h={.09} top="#689a86" left="#477a70" right="#568877" />
    {[0,1,2].map(i => <Cube key={i} x={x+.05+i*.1} y={y+.07} z={z+.1} w={.065} d={.07} h={.025} top="#627884" left="#486371" right="#58717d" />)}
    <Cube x={x+.2} y={y+.17} z={z+.1} w={.14} d={.08} h={.03} top="#a8b9af" />
  </g>;
}

function IsoPastry({ x, y, z, id }: { x: number; y: number; z: number; id: string }) {
  const [cx, cy] = p(x+.20,y+.17,z+.13);
  if (id === 'croissant') return <g transform={`translate(${cx},${cy}) rotate(26)`}>
    <path d="M-9-1q3-8 8-2q5-6 9 2l-3 6q-5-4-10 0z" fill="#bc7d41" />
    <path d="M-9-3q4-8 8-1q5-7 10 0l-3 7q-3-5-6-1q-4-3-7 2z" fill="#e3ae69" />
    <path d="M-4-6q-2 5 1 9m5-10q4 5 2 10" fill="none" stroke="#f6d69b" strokeWidth="1.3" />
  </g>;
  if (id === 'cake') return <g>
    <ellipse cx={cx} cy={cy+2} rx="10" ry="4.8" fill="#e2bd96" />
    <path d={`M${cx-9} ${cy-3}q9-5 18 0v6q-9 5-18 0z`} fill="#d59cac" />
    <ellipse cx={cx} cy={cy-3} rx="9" ry="4.6" fill="#fff0dc" />
    <circle cx={cx-3} cy={cy-6} r="2.5" fill="#a54a69" />
    <circle cx={cx+3.8} cy={cy-6} r="2.2" fill="#bf6380" />
    <path d={`M${cx-8} ${cy+1}q8 4 16 0`} fill="none" stroke="#fff2e5" strokeWidth="1.1" />
  </g>;
  if (id === 'dough') return <g>
    <ellipse cx={cx} cy={cy+2} rx="10" ry="4" fill="#b9aa91" />
    <ellipse cx={cx} cy={cy-1} rx="9" ry="5.5" fill="#ecddbd" />
    <path d={`M${cx-5} ${cy-2}q5-4 10 0`} fill="none" stroke="#faf0d8" strokeWidth="1.2" />
  </g>;
  return <g>
    <path d={`M${cx-10} ${cy-2}q0-10 10-10t10 10v6q-10 8-20 0z`} fill="#b87842" />
    <ellipse cx={cx} cy={cy-3} rx="10" ry="5.6" fill="#d99e63" />
    {[-4,0,4].map(v => <path key={v} d={`M${cx+v-3} ${cy-5}l3 4`} stroke="#f5d09a" strokeWidth="1.4" strokeLinecap="round" />)}
  </g>;
}

function IsoMaterial({ x, y, z, id }: { x: number; y: number; z: number; id: string }) {
  const [cx,cy] = p(x+.18,y+.13,z+.08);

  if (id === 'paper' || id === 'plastic') return <g>
    {[0,1,2].map(i => <Cube key={i} x={x+i*.017} y={y+i*.012} z={z+i*.047} w={.35} d={.22} h={.045} top={id === 'paper' ? '#f4ede9' : '#bed9d7'} left={id === 'paper' ? '#d4ccd8' : '#91b7b6'} right={id === 'paper' ? '#e1dce7' : '#a7cecb'} opacity={id === 'plastic' ? .8 : 1} />)}
    <path d={`M${pts([p(x+.07,y+.26,z+.14),p(x+.31,y+.26,z+.14)])}`} stroke={id === 'paper' ? '#937ab4' : '#75aaa9'} strokeWidth="1.1" />
  </g>;
  if (id === 'ink' || id === 'yeast' || id === 'sugar') return <g>
    <Cube x={x+.055} y={y+.03} z={z} w={.26} d={.2} h={.28} top={id === 'ink' ? '#6c577d' : '#ede3d2'} left={id === 'ink' ? '#574368' : '#c8b8a3'} right={id === 'ink' ? '#85719d' : '#e1d2bc'} />
    <Cube x={x+.09} y={y+.055} z={z+.28} w={.2} d={.15} h={.055} top={id === 'ink' ? '#b4a4ba' : '#c5ae88'} left="#b7a8ac" right="#d4c3af" />
    <Front x={x+.095} y={y+.234} z={z+.07} w={.18} h={.11} fill={id === 'ink' ? '#caa5c9' : id === 'sugar' ? '#f7f4e6' : '#e1c29c'} inset={0} />
  </g>;
  if (id === 'flour') return <g>
    <path d={`M${cx-8} ${cy-1}l2-9 11 1 3 9 2 9q-9 6-18 0z`} fill="#d7c2a4" />
    <path d={`M${cx-7} ${cy-9}l11 1 2 4-12-1z`} fill="#f2e6d1" />
    <path d={`M${cx-5} ${cy+2}q5-4 11 0`} stroke="#f6eddb" strokeWidth="1.5" fill="none" />
  </g>;
  if (id === 'butter') return <g>
    <Cube x={x} y={y} z={z} w={.38} d={.25} h={.18} top="#f3cf78" left="#d4a963" right="#eac77a" />
    <polygon points={polygon([[x+.05,y+.254,z+.045],[x+.34,y+.254,z+.045],[x+.34,y+.254,z+.13],[x+.05,y+.254,z+.13]])} fill="#fff8de" />
    <path d={`M${pts([p(x+.13,y+.26,z+.07),p(x+.27,y+.26,z+.07)])}`} stroke="#deb967" strokeWidth="1.1" />
  </g>;
  if (id === 'berries') return <g>
    <ellipse cx={cx} cy={cy+3} rx="11" ry="5.5" fill="#ad835f" />
    <ellipse cx={cx} cy={cy-2} rx="11" ry="5.5" fill="#dfbb91" />
    {[[-5,-4],[0,-6],[6,-2],[-2,0]].map(([dx,dy],i) => <circle key={i} cx={cx+dx} cy={cy+dy} r="2.5" fill={i%2 ? '#a84c68' : '#bc5b74'} />)}
    <path d={`M${cx-10} ${cy-2}q-2 9 10 12 12-4 10-12`} fill="none" stroke="#97704f" strokeWidth="1.3" />
  </g>;
  if (id === 'foil') return <g>
    <Cube x={x+.02} y={y+.05} z={z} w={.35} d={.2} h={.17} top="#d9c7ad" left="#b999ba" right="#86b4ba" />
    <ellipse cx={cx+4} cy={cy-1} rx="4.2" ry="7" fill="#e5d7bd" />
    <ellipse cx={cx+4} cy={cy-1} rx="1.9" ry="4" fill="#968baa" />
    <path d={`M${pts([p(x+.04,y+.253,z+.06),p(x+.28,y+.253,z+.06)])}`} stroke="#faf3de" strokeWidth="1.5" />
  </g>;
  if (id === 'copper') return <g>
    <ellipse cx={cx} cy={cy+1} rx="10" ry="5.5" fill="#ad7756" />
    <ellipse cx={cx} cy={cy-2} rx="9" ry="5" fill="#d6a072" />
    <ellipse cx={cx} cy={cy-2} rx="4.5" ry="2.3" fill="#6d7a72" />
    <path d={`M${cx-10} ${cy}q10 10 20 0m-20 3q10 10 20 0`} stroke="#f0b77f" strokeWidth="1" fill="none" />
  </g>;
  if (id === 'chip') return <g>
    <Cube x={x+.05} y={y+.025} z={z} w={.3} d={.23} h={.09} top="#414f5f" left="#34434e" right="#5e7381" />
    <Cube x={x+.1} y={y+.075} z={z+.09} w={.2} d={.13} h={.055} top="#778c9b" left="#556b7a" right="#69818b" />
    {[0,1,2].map(i => <path key={i} d={`M${pts([p(x+.09+i*.1,y+.265,z+.04),p(x+.09+i*.1,y+.31,z+.04)])}`} stroke="#d8c497" strokeWidth="1.1" />)}
  </g>;
  if (id === 'circuit') return <g>
    <Cube x={x+.01} y={y+.015} z={z} w={.39} d={.27} h={.045} top="#579480" left="#487a6c" right="#669f8c" />
    <polyline points={pts([p(x+.07,y+.08,z+.049),p(x+.18,y+.08,z+.049),p(x+.18,y+.18,z+.049),p(x+.32,y+.18,z+.049)])} fill="none" stroke="#c6d9a1" strokeWidth="1.2" />
    <Cube x={x+.22} y={y+.08} z={z+.05} w={.1} d={.09} h={.035} top="#536675" />
  </g>;
  return <g>
    <Cube x={x+.03} y={y+.02} z={z} w={.34} d={.26} h={.28} top="#bcc6c8" left="#82949e" right="#a5b4ba" />
    <Front x={x+.065} y={y+.283} z={z+.07} w={.27} h={.17} fill="#506170" />
  </g>;
}

export function GoodFigure({ x, y, z, kind, good, count, selected, onInspect, inProgress = false }: FigureProps) {
  const item = good.type === 'card' ? undefined : getItem(kind,good.id);
  const itemName = good.type === 'card' ? good.name : item?.name || good.id;
  const h = item?.category === 'material' ? .34 : kind === 'tcg' ? .48 : kind === 'it' ? (good.id === 'pc' ? .6 : good.id === 'notebook' ? .45 : .3) : .28;
  const [cx,cy] = p(x+.2,y+.18,z);
  const onSelect = (event: MouseEvent<SVGGElement>) => { event.stopPropagation(); onInspect?.(good); };
  return <g
    className={`${onInspect ? 'iso-good' : ''} ${selected ? 'iso-good-selected' : ''}`}
    role={onInspect ? 'button' : undefined}
    tabIndex={onInspect ? 0 : undefined}
    aria-label={`${itemName}${count === undefined ? '' : `, ${count} im Bestand`}`}
    onClick={onInspect ? onSelect : undefined}
    onKeyDown={onInspect ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onInspect(good); } } : undefined}
  >
    <title>{inProgress ? `${itemName} in Arbeit` : `${itemName}${count === undefined ? '' : ` · ${count} auf Lager`}`}</title>
    {selected && <ellipse cx={cx} cy={cy+3} rx="12" ry="5" fill="#7da668" opacity=".55" />}
    {item?.category === 'material' ? <IsoMaterial x={x} y={y} z={z} id={good.id} /> : kind === 'tcg' ? <IsoCard x={x} y={y} z={z} good={good} /> : kind === 'it' ? <IsoTech x={x} y={y} z={z} id={good.id} /> : <IsoPastry x={x} y={y} z={z} id={good.id} />}
    {onInspect && <rect x={cx-12} y={cy-h*32-6} width="25" height={h*32+16} fill="transparent" pointerEvents="all" />}
  </g>;
}

export function GoodPortrait({ kind, good }: { kind: ShopKind; good: VisibleGood }) {
  const [cx,cy] = p(.6,.4,1.2);
  return <svg viewBox={`${cx-17} ${cy-30} 38 45`} role="img" aria-label={good.type === 'card' ? good.name : getItem(kind,good.id)?.name || good.id}>
    <GoodFigure x={.6} y={.4} z={1.2} kind={kind} good={good} />
  </svg>;
}