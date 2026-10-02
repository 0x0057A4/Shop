import { useState } from 'react';
import { motion } from 'framer-motion';
import type { FurnitureKind, GameState, Recipe, ShopKind } from '../game/data';
import { FLOOR_COLORS, SHELF_CAPACITY, STAFF_HIRE_COST, STAFF_WAGE, WALL_COLORS, getItem, money, number, RARITY_LABELS, SHOPS, SHOP_ORDER } from '../game/data';
import { STAFF_ROLE_LIST, addEvent, buyFurniture, buyMaterial, cancelJob, canBuyMaterial, canProduce, capacity, enqueue, expandShop, goalProgress, hireStaff, makeOrders, manageCards, nextExpansion, reservedSpace, rolesOf, sellStock, setStaffRole, shelfTierCount, shelfUpgradeCost, startRepair, stockCount, upgradeShelf, colorName, setShopColor } from '../game/engine';
import { createShopDisplay, SHELF_SLOTS, shelfTierOf } from '../game/visualInventory';
import { gridOf, piecesOf, placeOf } from '../game/layout';
import { CreatureArt } from './Cards';
import { GoodPortrait } from './IsoGoods';
import { Icon, Progress, ShopIcon } from './Ui';
import type { IconName } from './Ui';

export type UpdateGame = (action: (game: GameState) => GameState, message?: string) => void;
interface ViewProps { game: GameState; kind: ShopKind; update: UpdateGame; notify: (text: string) => void; }

function RecipeTile({ game, kind, recipe, update }: Omit<ViewProps, 'notify'> & { recipe: Recipe }) {
  const [batch, setBatch] = useState(1);
  const problem = canProduce(game, kind, recipe.id, batch);
  const item = getItem(kind, recipe.output)!;
  return <div className="recipe-tile">
    <div className="recipe-top"><span className="product-icon" style={{ background: SHOPS[kind].light, color: SHOPS[kind].color }}><GoodPortrait kind={kind} good={{type:'item',id:recipe.output}} /></span><div><span className="eyebrow">{recipe.intermediate ? 'VORPRODUKT' : 'HERSTELLUNG'}</span><h3>{recipe.name}</h3></div><span className="recipe-duration"><Icon name="clock" size={13} />{recipe.duration * batch}s</span></div>
    <p>{recipe.description}</p>
    <div className="recipe-ingredients">{Object.entries(recipe.inputs).map(([id, qty]) => <span key={id} className={(game.shops[kind].stock[id] || 0) < qty * batch ? 'ingredient-missing' : ''}><span className="ingredient-dot" style={{ backgroundColor: getItem(kind,id)?.color }} />{qty * batch} × {getItem(kind,id)?.name}</span>)}</div>
    <div className="recipe-output"><Icon name="arrow" size={16} /><span><strong>{recipe.quantity * batch} × {item.name}</strong><small>{recipe.intermediate ? 'Für deine nächsten Produktionsschritte' : `${money(item.price * recipe.quantity * batch)} Verkaufswert`}</small></span></div>
    <div className="recipe-controls"><label className="batch-select">Menge<select aria-label={`Produktionsmenge für ${recipe.name}`} value={batch} onChange={e => setBatch(Number(e.target.value))}><option value={1}>1 Charge</option><option value={2}>2 Chargen</option><option value={3}>3 Chargen</option></select></label><button className="button primary small" disabled={!!problem} title={problem || 'Produktion starten'} onClick={() => update(g => enqueue(g,kind,recipe.id,batch), `${recipe.name} ist in der Warteschlange.`)}><Icon name="play" size={14} />Herstellen</button></div>
    <label className="automation-toggle"><input type="checkbox" checked={game.shops[kind].autoRecipes.includes(recipe.id)} onChange={() => update(g => { const next=structuredClone(g); const auto=next.shops[kind].autoRecipes; next.shops[kind].autoRecipes=auto.includes(recipe.id) ? auto.filter(id => id !== recipe.id) : [...auto,recipe.id]; return next; })} /><span>1 Charge automatisch nachproduzieren</span></label>
    {problem && <span className="recipe-warning">{problem}</span>}
  </div>;
}

export function QueueList({ game, kind, update }: Omit<ViewProps, 'notify'>) {
  const shop = game.shops[kind];
  return <section className="queue-section"><div className="section-title"><h3>Deine Produktionslinie</h3><span>{shop.queue.length}/6 Aufträge · {Math.min(shop.furniture.workbench,shop.staff)} aktive Plätze</span></div>
    {shop.queue.length ? <div className="queue-list">{shop.queue.map((job,index) => {
      const recipe = SHOPS[kind].recipes.find(r => r.id === job.recipeId);
      const order = shop.orders.find(o => o.id === job.repairId);
      const active = index < Math.min(shop.furniture.workbench,shop.staff);
      return <div className="queue-row" key={job.id}><span className={`queue-number ${active ? 'active' : ''}`}>{active ? <Icon name={job.repairId ? 'wrench' : 'settings'} size={17} /> : index+1}</span><div className="queue-description"><div><strong>{order?.device || recipe?.name}</strong><span>{active ? `${Math.ceil((job.duration-job.progress)/(1+shop.skill*.15))}s verbleibend` : 'In Warteschlange'}</span></div><Progress value={job.progress/job.duration*100} /></div><button className="icon-button" onClick={() => update(g => cancelJob(g,kind,job.id),'Auftrag abgebrochen. Rohstoffe wurden zurückgegeben.')} aria-label="Auftrag abbrechen"><Icon name="x" size={16} /></button></div>;
    })}</div> : <div className="empty-state compact"><Icon name="settings" size={28} /><div><strong>Hier ist noch Platz für gute Ideen.</strong><p>Starte ein Rezept. Deine Mitarbeiter kümmern sich um den Rest.</p></div></div>}
  </section>;
}

export function ProductionView({ game, kind, update, notify, initialTab = 'craft' }: ViewProps & { initialTab?: 'craft' | 'repair' }) {
  const [tab,setTab] = useState(initialTab);
  const shop = game.shops[kind];
  return <div className="management-view">
    <div className="view-toolbar"><div className="tabs"><button className={tab === 'craft' ? 'active' : ''} onClick={() => setTab('craft')}><Icon name="settings" size={16} />Herstellung</button>{kind === 'it' && <button className={tab === 'repair' ? 'active' : ''} onClick={() => setTab('repair')}><Icon name="wrench" size={16} />Reparaturen<span>{shop.orders.filter(o => o.status === 'available').length}</span></button>}</div><span className="quiet-label"><Icon name="zap" size={14} />{Math.round((1+shop.skill*.15)*100)}% Effizienz</span></div>
    {shop.staff === 0 && <div className="staff-warning"><Icon name="staff" size={18}/><p>Hier passiert gerade nichts: Dein Team ist noch leer. Stelle unter <strong>Personal</strong> jemanden ein – für Kasse, Lager oder zum Auffüllen.</p></div>}
    {tab === 'craft' || kind !== 'it' ? <><div className="production-note"><Icon name={kind === 'bakery' ? 'bread' : 'boxes'} size={20} /><p>{kind === 'bakery' ? 'Erst der Teig, dann das Croissant. Vorprodukte bleiben im Lager, fertige Backwaren landen direkt im Verkauf.' : kind === 'it' ? 'Vom Mainboard zum fertigen PC: Stelle Vorprodukte her und verarbeite sie in deiner nächsten Charge.' : 'Vom Rohling zum Sammlerstück: Drucke Booster, veredle Einzelkarten und stelle spielbereite Decks zusammen.'}</p></div><div className="recipe-grid">{SHOPS[kind].recipes.map(recipe => <RecipeTile key={recipe.id} game={game} kind={kind} recipe={recipe} update={update} />)}</div></> : <div className="repair-orders"><div className="section-title"><h3>Ein zweites Leben für gute Technik.</h3><button className="text-button" disabled={shop.orders.some(o => o.status !== 'done')} onClick={() => update(g => { const next=structuredClone(g); next.shops.it.orders=makeOrders(); return next; },'Drei neue Service-Anfragen sind angekommen.')}><Icon name="reset" size={14} />Neue Anfragen</button></div>{shop.orders.map(order => <div className={`repair-order ${order.status === 'done' ? 'finished' : ''}`} key={order.id}><span className="repair-device"><Icon name={order.device.includes('PC') ? 'cpu' : 'monitor'} size={27} /></span><div className="repair-details"><h3>{order.device}</h3><p>{order.problem}</p><span><Icon name="clock" size={13} />{order.duration}s <i />{order.chips} × Mikrochip</span></div><div className="repair-reward"><strong>{money(order.reward)}</strong><small>Service-Umsatz</small></div><button className={`button ${order.status === 'available' ? 'primary' : 'secondary'} small`} disabled={order.status !== 'available' || shop.stock.chip < order.chips || shop.queue.length >= 6} onClick={() => { if(shop.stock.chip < order.chips) notify('Bestelle zuerst Mikrochips im Lager.'); else update(g => startRepair(g,order.id),'Das Gerät wird jetzt diagnostiziert und repariert.'); }}>{order.status === 'done' ? <><Icon name="check" size={14} />Fertig</> : order.status === 'queued' ? 'In Arbeit' : 'Reparieren'}</button></div>)}<p className="inline-note"><Icon name="shield" size={15} />Diagnose, Austausch und Funktionstest laufen automatisch. Erfolgreiche Reparaturen bringen +2 Beliebtheit.</p></div>}
    <QueueList game={game} kind={kind} update={update} />
  </div>;
}

export function InventoryView({ game, kind, update, initialTab = 'products' }: ViewProps & { initialTab?: 'products' | 'materials' | 'cards' }) {
  const [tab,setTab] = useState<'products'|'materials'|'cards'>(initialTab);
  const [search,setSearch] = useState('');
  const [quantity,setQuantity] = useState(10);
  const shop = game.shops[kind];
  const reserved = reservedSpace(kind,shop);
  const items = SHOPS[kind].items.filter(item => (tab === 'products' ? item.category === 'product' : item.category !== 'product') && item.name.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')));
  const cards = shop.cards.filter(card => !card.sold && card.name.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')));
  return <div className="management-view inventory-view"><div className="view-toolbar"><div className="tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Verkaufsartikel</button><button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>Rohstoffe</button>{kind === 'tcg' && <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Sammlung<span>{shop.cards.filter(c => !c.sold).length}</span></button>}</div></div>
    <div className="inventory-capacity"><div><Icon name="boxes" size={20} /><span><strong>Alles an seinem Platz.</strong><small>Regale schaffen Platz für neue Möglichkeiten.</small></span></div><span><strong>{stockCount(shop)+reserved}</strong> / {capacity(shop)} Plätze{reserved>0 && <small className="capacity-reserved">davon {reserved} für Aufträge reserviert</small>}</span><Progress value={(stockCount(shop)+reserved)/capacity(shop)*100} /></div>
    <div className="inventory-tools"><label className="search-input"><Icon name="search" size={17} /><input placeholder={tab === 'cards' ? 'Karten suchen ...' : 'Artikel suchen ...'} value={search} onChange={e => setSearch(e.target.value)} aria-label="Inventar durchsuchen" /></label>{tab === 'materials' && <label className="batch-select">Bestellmenge<select value={quantity} onChange={e => setQuantity(Number(e.target.value))} aria-label="Bestellmenge"><option value={10}>10 Stück</option><option value={25}>25 Stück</option><option value={50}>50 Stück</option></select></label>}</div>
    {tab !== 'cards' ? <div className="stock-table"><div className="stock-table-head"><span>ARTIKEL</span><span>BESTAND</span><span>{tab === 'materials' ? 'EINKAUFSPREIS' : 'VERKAUFSPREIS'}</span><span /></div>{items.map(item => {
      const blocked = !!canBuyMaterial(game,kind,item.id,quantity);
       return <div className="stock-row" key={item.id}><div><span className="stock-item-icon" style={{background:item.color+'20',color:item.color}}><GoodPortrait kind={kind} good={{type:'item',id:item.id}} /></span><span><strong>{item.name}</strong><small>{item.category === 'intermediate' ? 'Vorprodukt' : item.category === 'material' ? 'Rohstoff' : 'Im Verkauf'}</small></span></div><span className={shop.stock[item.id] < 5 ? 'low-stock' : ''}>{shop.stock[item.id] || 0}<small> Stück</small></span><strong>{money(tab === 'materials' ? item.price : Math.round(item.price*shop.price))}</strong><button className="button secondary small" disabled={tab === 'materials' ? blocked : !shop.stock[item.id]} title={blocked && tab === 'materials' ? 'Zu wenig Guthaben oder kein Platz im Lager.' : ''} onClick={() => update(g => tab === 'materials' ? buyMaterial(g,kind,item.id,quantity) : sellStock(g,kind,item.id), tab === 'materials' ? `${quantity} × ${item.name} geliefert.` : `${item.name} direkt verkauft.`)}><Icon name={tab === 'materials' ? 'plus' : 'coins'} size={13} />{tab === 'materials' ? `${quantity} bestellen` : '1 verkaufen'}</button></div>;
    })}{!items.length && <div className="empty-state">Keine passenden Artikel gefunden.</div>}</div> : <div className="collection-list">{cards.length ? cards.map(card => <div className="collection-row" key={card.id}><CreatureArt element={card.element} /><div><strong>{card.name}</strong><span>{RARITY_LABELS[card.rarity]}{card.listed ? ' · Im Regal' : ' · In deiner Sammlung'}</span></div><strong>{money(card.value)}</strong><button className="button secondary small" disabled={card.listed} onClick={() => update(g => manageCards(g,[card.id],'list'),'Die Karte steht jetzt zum Verkauf im Regal.')}><Icon name={card.listed ? 'check' : 'plus'} size={14} />{card.listed ? 'Im Regal' : 'Ins Regal'}</button><button className="icon-button" title="Karte direkt verkaufen" onClick={() => update(g => manageCards(g,[card.id],'sell'),`${card.name} verkauft.`)} aria-label={`${card.name} verkaufen`}><Icon name="coins" size={17} /></button></div>) : <div className="empty-state"><Icon name="cards" size={38} /><h3>Deine nächste Entdeckung wartet.</h3><p>Öffne ein Nova-Pack, um deine eigene Kartensammlung zu beginnen.</p></div>}</div>}
    {tab === 'products' && <div className="pricing-controls"><div><h3>Dein Laden. Deine Preise.</h3><p>Höhere Preise bringen mehr Marge, können aber die Nachfrage senken.</p></div><label><span>Preisniveau<strong>{Math.round(shop.price*100)}%</strong></span><input aria-label="Preisniveau einstellen" type="range" min="80" max="130" step="5" value={shop.price*100} onChange={e => update(g => { const next=structuredClone(g); next.shops[kind].price=Number(e.target.value)/100; return next; })} /></label></div>}
    <p className="inline-note"><Icon name={tab === 'materials' ? 'truck' : 'store'} size={16} />{tab === 'materials' ? 'Dein lokaler Lieferant liefert sofort. Produktionsketten sind oft günstiger als fertige Vorprodukte.' : 'Deine Mitarbeiter verkaufen automatisch, solange der Laden geöffnet ist.'}</p>
  </div>;
}

const furnitureIcons: Record<FurnitureKind,IconName> = {register:'register',shelf:'boxes',decor:'leaf',workbench:'hammer'};
export function FurniturePreview({ type, kind, shop }: { type: FurnitureKind; kind: ShopKind; shop: GameState['shops'][ShopKind] }) {
  const color=SHOPS[kind].color;
  const shelfUnits=createShopDisplay(kind,shop).shelves[0] || [];
  return <svg viewBox="0 0 180 125" role="img" aria-label={type === 'decor' ? 'Pflanze' : type === 'shelf' ? 'Isometrisches Regal' : type === 'register' ? 'Isometrische Kasse' : 'Isometrischer Arbeitstisch'}>
    <ellipse cx="92" cy="94" rx="57" ry="10" fill="#677369" opacity=".07" />
    {type === 'decor' ? <g><path d="M72 75l20-10 22 11-2 20-21 9-19-11z" fill="#d3ac92"/><path d="M72 75l20-10 22 11-23 10z" fill="#e6c4ac"/><path d="M92 76V35m0 27L67 41m25 16l23-20" stroke="#739b79" strokeWidth="3"/><ellipse cx="71" cy="39" rx="13" ry="22" transform="rotate(-40 71 39)" fill="#86b68f"/><ellipse cx="112" cy="36" rx="13" ry="21" transform="rotate(42 112 36)" fill="#a4c9a2"/><ellipse cx="91" cy="26" rx="13" ry="22" fill="#97bf9a"/></g> : <g>
      <path d={type === 'shelf' ? 'M44 39l67-32 29 15v63l-68 32-28-15z' : 'M38 58l67-33 39 20v39l-69 33-37-20z'} fill={color}/>
      <path d={type === 'shelf' ? 'M44 39l67-32 29 15-68 33z' : 'M38 58l67-33 39 20-69 33z'} fill="#e4d8ed"/>
      <path d={type === 'shelf' ? 'M72 55l68-33v63l-68 32z' : 'M75 78l69-33v39l-69 33z'} fill={color} opacity=".7"/>
      {type === 'shelf' && <g>{[39,61,84].map((y,i) => <g key={y}><path d={`M77 ${y+13}l58-28v5l-58 28z`} fill="#f4eefa"/>{[0,1,2].map(n => {
        const unit=shelfUnits[i*3+n];
        if(!unit)return null;
        const px=80+n*17, py=y+8-n*8;
        const itemColor=unit.type==='item' ? getItem(kind,unit.id)?.color || color : color;
        if(kind==='bakery')return <g key={n}><ellipse cx={px+5} cy={py-4} rx="6" ry="3" fill={unit.id==='cake' ? '#c98193' : '#ce9863'}/><path d={`M${px+2} ${py-5}l3 2m2-3l2 2`} stroke="#f7d6a5" strokeWidth="1"/></g>;
        if(kind==='it')return <g key={n}><path d={`M${px} ${py}v-11l12-6v11z`} fill={itemColor}/><path d={`M${px+2} ${py-9}l8-4v5l-8 4z`} fill="#d2eeee" opacity=".7"/></g>;
        return <g key={n}><path d={`M${px} ${py}v-14l10-5v14z`} fill={itemColor}/><path d={`M${px+2} ${py-11}l6-3v5l-6 3z`} fill="#f7eadc" opacity=".7"/></g>;
      })}</g>)}</g>}
      {type === 'register' && <g><path d="M87 42l26-12v22L87 65z" fill="#415c59"/><path d="M90 43l20-9v16l-20 10z" fill="#9ed5bd"/><path d="M68 54l12-6 9 5-13 6z" fill="#d3b985"/></g>}
      {type === 'workbench' && <g><path d="M47 65v29l12 6V71m69-17v29l13-7V48" fill="#bdaa95"/><path d="M38 58l67-33 39 20-69 33z" fill="#e7d1b5"/>{kind === 'bakery' ? <g><path d="M63 53l28-13 19 10-28 14z" fill="#d39d73"/><ellipse cx="85" cy="50" rx="13" ry="5" transform="rotate(-23 85 50)" fill="#efdab4"/><path d="M107 29l16 9v22l-16 8-16-8V38z" fill="#657378"/><path d="M97 44l10-5v16l-10 5z" fill="#eab273"/></g> : kind === 'it' ? <g><path d="M62 54l31-15 22 11-32 15z" fill="#5e9390"/><path d="M75 46l20-9v16l-20 9z" fill="#4d6579"/><path d="M77 47l16-7v11l-16 7z" fill="#98cfcf"/></g> : <g><path d="M63 55l34-16 21 11-34 16z" fill="#9883bd"/><path d="M77 51l12-6 8 5-12 6z" fill="#f9f2e9"/></g>}</g>}
    </g>}
  </svg>;
}
export function FurnishingView({ game, kind, update, onArrange }: ViewProps & { onArrange?: () => void }) {
  const shop = game.shops[kind];
  const expansion = nextExpansion(shop);
  const largeShelves = shelfTierCount(shop, 2);
  const gridSize = gridOf(shop);
  return <div className="management-view furnishing-view">
    <section className="expansion-card">
      <span className="expansion-icon"><Icon name="expand" size={22}/></span>
      <div>
        <h3>{expansion ? `Ausbau: ${expansion.label}` : 'Voll ausgebaut'}</h3>
        <p>{expansion ? 'Zwei Kacheln mehr Verkaufsfläche, Platz für weitere Regale und Arbeitsplätze. Deine Möbel bleiben stehen.' : 'Deine Verkaufsfläche nutzt bereits die grösste Grösse.'}</p>
        <span className="expansion-size"><Icon name="grid" size={13}/>{gridSize.w} × {gridSize.h} Kacheln · Ausbaustufe {shop.expansions}/2</span>
      </div>
      <button className="button primary" disabled={!expansion || game.coins < expansion.cost} onClick={()=>update(g=>expandShop(g,kind),'Deine Verkaufsfläche ist gewachsen!')}>{expansion ? <><Icon name="expand" size={16}/>Erweitern · {money(expansion.cost)}</> : 'Voll ausgebaut'}</button>
    </section>
    <section className="color-picker-card">
      <div className="section-title"><h3>Farben für deinen Laden</h3><span>{colorName('wall', shop.colors.wall)} &amp; {colorName('floor', shop.colors.floor)}</span></div>
      <p className="section-intro">Wähle die Farbe der Wände und des Verkaufsraums. Zwei Farben, unendlich viele Stimmungen – die Auslage und alle Möbel bleiben wie sie sind.</p>
      <div className="color-part">
        <div className="color-part-head"><Icon name="store" size={14}/><h4>Wandfarbe</h4><span>Wände, Fensterrahmen und Fassade</span></div>
        <div className="color-row" role="group" aria-label="Wandfarbe wählen">
          {WALL_COLORS.map(color => <button key={color.id} type="button" className={`color-swatch ${shop.colors.wall.toLowerCase() === color.value.toLowerCase() ? 'active' : ''}`} style={{background: color.value}} title={color.label} aria-label={`Wand in ${color.label}`} aria-pressed={shop.colors.wall.toLowerCase() === color.value.toLowerCase()} onClick={()=>update(g=>setShopColor(g,kind,'wall',color.value),`Die Wände sind jetzt ${color.label}.`)} />)}
        </div>
      </div>
      <div className="color-part">
        <div className="color-part-head"><Icon name="grid" size={14}/><h4>Bodenfarbe</h4><span>Kacheln und Sockel des Verkaufsraums</span></div>
        <div className="color-row" role="group" aria-label="Bodenfarbe wählen">
          {FLOOR_COLORS.map(color => <button key={color.id} type="button" className={`color-swatch ${shop.colors.floor.toLowerCase() === color.value.toLowerCase() ? 'active' : ''}`} style={{background: color.value}} title={color.label} aria-label={`Boden in ${color.label}`} aria-pressed={shop.colors.floor.toLowerCase() === color.value.toLowerCase()} onClick={()=>update(g=>setShopColor(g,kind,'floor',color.value),`Der Boden liegt jetzt in ${color.label}.`)} />)}
        </div>
        <div className="color-preview"><span className="color-preview-bar"><i style={{background: shop.colors.wall}} /><i style={{background: shop.colors.floor}} /></span>So sieht die Kombination im Laden aus. Änderungen siehst du sofort in der Ladenansicht.</div>
      </div>
    </section>
    <section className="shelf-upgrade-card">
      <div className="section-title"><h3>Regale ausbauen</h3><span>{largeShelves}/{shop.furniture.shelf} grosse Regale · {capacity(shop)} Lagerplätze</span></div>
      <p className="section-intro">Kleine Regale sind halbhoch, grosse Regale reichen bis zur Decke und zeigen mehr Ware. Jedes Upgrade schafft Lagerplatz und füllt die Auslage sichtbar.</p>
      <div className="shelf-upgrade-list">{Array.from({length:shop.furniture.shelf},(_,index) => {
        const tier=shelfTierOf(shop,index);
        const cost=shelfUpgradeCost(shop,index);
        const piece=piecesOf(shop).find(entry=>entry.kind==='shelf'&&entry.index===index);
        const place=piece ? placeOf(shop.layout,piece) : {x:0,y:0,rot:0 as const};
        return <div className={`shelf-upgrade-row ${tier === 2 ? 'is-large' : ''}`} key={index}>
          <span className="shelf-art" aria-hidden="true">{Array.from({length: tier === 2 ? 3 : 2},(_,level) => <i key={level} style={{height: tier === 2 ? 7 : 5}}/>)}</span>
          <div><h3>Regal {index + 1} · {tier === 2 ? 'gross' : 'klein, halbhoch'}</h3><p>{SHELF_SLOTS[tier]} Plätze in der Auslage · {SHELF_CAPACITY[tier]} Lagerplätze · Kachel {place.x}/{place.y}</p></div>
          <button className="button secondary small" disabled={tier === 2 || game.coins < cost} onClick={()=>update(g=>upgradeShelf(g,kind,index),`Regal ${index + 1} ist jetzt gross.`)}>{tier === 2 ? 'Ausgebaut' : `Ausbauen · ${money(cost)}`}</button>
        </div>;
      })}</div>
    </section>
    <div className="production-note"><Icon name="sparkles" size={20} /><p>Mehr als nur Möbel: Regale schaffen Lagerplatz, Arbeitsplätze beschleunigen die Herstellung und Extras machen deinen Laden zum Lieblingsort.</p></div>
    {onArrange && <div className="arrange-note"><span className="arrange-icon"><Icon name="move" size={20} /></span><div><h3>Stell deinen Laden um.</h3><p>Kasse, Regale, Arbeitsplätze und Deko lassen sich direkt auf den Kacheln deiner Ladenansicht verschieben und drehen.</p></div><button className="button secondary small" onClick={onArrange}><Icon name="grid" size={14} />Im Laden anordnen</button></div>}<div className="furniture-grid">{(Object.keys(SHOPS[kind].furniture) as FurnitureKind[]).map(type => {
    const item = SHOPS[kind].furniture[type], level=shop.furniture[type], cost=item.cost*level;
    return <div className="furniture-tile" key={type}><div className="furniture-preview" style={{background:SHOPS[kind].light}}><FurniturePreview type={type} kind={kind} shop={shop} /><span>{type === 'register' || type === 'workbench' ? 'Stufe' : 'Anzahl'} {level}/{item.max}</span></div><div className="furniture-info"><span className="eyebrow"><Icon name={furnitureIcons[type]} size={12} />{type === 'register' ? 'KASSE' : type === 'shelf' ? 'REGALE' : type === 'decor' ? 'EXTRAS & ACCESSOIRES' : 'ARBEITSPLATZ'}</span><h3>{item.name}</h3><p>{item.description}</p><button className="button secondary" disabled={level >= item.max || game.coins < cost} onClick={() => update(g => buyFurniture(g,kind,type), `${item.name} steht jetzt in deinem Laden.`)}><Icon name={level >= item.max ? 'check' : 'plus'} size={16} />{level >= item.max ? 'Voll ausgebaut' : type === 'register' ? 'Kasse verbessern' : 'Aufstellen'}{level < item.max && <strong>{money(cost)}</strong>}</button></div></div>;
  })}</div><p className="inline-note"><Icon name="move" size={15} />Jede neue Einrichtung erscheint sofort in deiner Ladenansicht und lässt sich dort frei auf den Kacheln verschieben.</p></div>;
}

export function StaffView({ game, kind, update }: ViewProps) {
  const shop=game.shops[kind];
  const names=['Mila Weber','Noah Fischer','Leni Berg'];
  const roles=rolesOf(shop);
  const cost=nextExpansion(shop);
  return <div className="management-view staff-view">
    <div className="section-title"><h3>Gute Leute. Ein gutes Gefühl.</h3><span>{shop.staff}/3 Mitarbeiter</span></div>
    <p className="section-intro">Jede Person übernimmt eine Aufgabe. Kasse bedient die Warteschlange, die Lageristin bestellt Rohstoffe nach, Auffüllen hält die Regale voll.</p>
    {shop.staff === 0 && <div className="staff-empty"><Icon name="staff" size={22}/><div><h3>Noch niemand im Team.</h3><p>Ohne Personal läuft der Laden nur, wenn du selbst an der Kasse stehst und produzierst.</p></div></div>}
    <div className="staff-list">{names.slice(0,shop.staff).map((name,i) => <div className={`staff-row is-${roles[i]}`} key={name}>
      <span className={`staff-avatar avatar-${i}`}>{name.split(' ').map(n => n[0]).join('')}</span>
      <div><h3>{name}</h3><p>{shop.staff > 1 ? `Mitarbeiter ${i + 1} · ` : ''}{STAFF_ROLE_LIST.find(role => role.id === roles[i])?.description}</p></div>
      <strong>{STAFF_WAGE} €<small>/ Tag</small></strong>
      <div className="role-picker" role="group" aria-label={`Aufgabe von ${name}`}>
        {STAFF_ROLE_LIST.map(role => <button key={role.id} type="button" className={`role-chip ${roles[i] === role.id ? 'active' : ''}`} aria-pressed={roles[i] === role.id} title={role.description} onClick={()=>update(g=>setStaffRole(g,kind,i,role.id),`${name} ist jetzt für ${role.label} zuständig.`)}><Icon name={role.id === 'register' ? 'register' : role.id === 'stock' ? 'box' : 'shelf'} size={14}/>{role.label}</button>)}
      </div>
    </div>)}</div>
    <div className="hire-row">
      {STAFF_ROLE_LIST.map(role => <button key={role.id} className="button secondary" disabled={shop.staff >= 3 || game.coins < STAFF_HIRE_COST} title={role.description} onClick={()=>update(g=>hireStaff(g,kind,role.id),`${names[game.shops[kind].staff]} übernimmt: ${role.label}.`)}><Icon name="plus" size={15}/>{role.label} einstellen · {STAFF_HIRE_COST} €</button>)}
    </div>
    {shop.staff >= 3 && <p className="hire-note"><Icon name="check" size={14}/>Dein Team ist komplett. Ändere die Aufgaben jederzeit oben.</p>}
    <section className="training-section"><div className="training-icon"><Icon name="book" size={30}/></div><div><h3>Gemeinsam besser werden.</h3><p>Ein Training erhöht das Produktionstempo deines gesamten Teams um 15%.</p><Progress value={shop.skill/3*100}/><span>Trainingsstufe {shop.skill}/3 · {Math.round((1+shop.skill*.15)*100)}% Produktionstempo</span></div><button className="button secondary" disabled={shop.skill >= 3 || game.coins < (shop.skill+1)*200} onClick={() => update(g => {if(g.shops[kind].skill>=3||g.coins<(g.shops[kind].skill+1)*200)return g;const next=structuredClone(g);const price=(next.shops[kind].skill+1)*200;next.coins-=price;next.totalExpenses+=price;next.shops[kind].skill++;return next;},'Training abgeschlossen. Dein Team arbeitet jetzt effizienter.')}>{shop.skill >= 3 ? 'Voll trainiert' : `Trainieren · ${money((shop.skill+1)*200)}`}</button></section>
    <section className="expansion-note">
      <span className="expansion-icon"><Icon name="expand" size={20}/></span>
      <div><h3>Mehr Platz für dein Team</h3><p>{cost ? `Eine grössere Verkaufsfläche gibt jedem mehr Raum: ${cost.label} für ${money(cost.cost)}.` : 'Deine Verkaufsfläche ist bereits voll ausgebaut.'}</p></div>
      <button className="button primary small" disabled={!cost || game.coins < cost.cost} onClick={()=>update(g=>expandShop(g,kind),'Deine Verkaufsfläche ist gewachsen!')}>{cost ? `Erweitern · ${money(cost.cost)}` : 'Voll ausgebaut'}</button>
    </section>
    <div className="staff-costs"><span>Aufgaben heute<strong>{roles.map(role => STAFF_ROLE_LIST.find(entry => entry.id === role)?.label).join(', ') || 'niemand'}</strong></span><span>Personal am nächsten Tageswechsel<strong>{money(shop.staff*STAFF_WAGE)}</strong></span><span>Miete pro Tag<strong>60 €</strong></span></div>
  </div>;
}

export function FinanceView({ game, notify }: ViewProps) {
  const owned=SHOP_ORDER.filter(k => game.shops[k].owned);
  const values=Array.from({length:12},(_,hour) => owned.reduce((sum,k) => sum+game.shops[k].hourlyRevenue[hour],0));
  const max=Math.max(50,...values);
  const today=owned.reduce((sum,k) => sum+game.shops[k].dailyRevenue,0);
  return <div className="management-view finance-view"><div className="finance-summary"><div><span>Gesamter Umsatz<Icon name="arrowUp" size={16}/></span><strong className="positive">{money(game.totalRevenue)}</strong><small>Seit deinem ersten Tag</small></div><div><span>Gesamte Ausgaben<Icon name="truck" size={16}/></span><strong>{money(game.totalExpenses)}</strong><small>Einkauf, Einrichtung & Betrieb</small></div><div><span>Dein Ergebnis<Icon name="chart" size={16}/></span><strong className={game.totalRevenue-game.totalExpenses >= 0 ? 'positive' : ''}>{money(game.totalRevenue-game.totalExpenses)}</strong><small>Umsatz abzüglich Ausgaben</small></div></div><div className="finance-chart"><div className="section-title"><div><h3>Ein guter Tag für gute Geschäfte.</h3><p>Umsatz pro Stunde · Tag {game.day}</p></div><strong>{money(today)}<span>heute</span></strong></div><div className="chart-area"><div className="chart-lines">{[3,2,1,0].map(n => <span key={n}>{Math.round(max/3*n)} €</span>)}</div><div className="chart-bars">{values.map((value,i) => <button key={i} className={Math.floor(game.minute/60) === i+9 ? 'current' : ''} onClick={() => notify(`${i+9}:00 Uhr: ${money(value)} Umsatz.`)} title={`${i+9}:00 · ${money(value)}`} aria-label={`${i+9} Uhr: ${money(value)} Umsatz`}><motion.span initial={{height:4}} animate={{height:`${Math.max(2,value/max*100)}%`}}/><small>{i+9}</small></button>)}</div>{today === 0 && <span className="chart-empty-label">Dein erster Verkauf schreibt hier Geschichte.</span>}</div></div><section className="finance-shops"><div className="section-title"><h3>Jeder Laden zählt.</h3><span>{owned.length} {owned.length === 1 ? 'Laden' : 'Läden'} geöffnet</span></div>{owned.map(k => <div className="finance-shop-row" key={k}><span style={{color:SHOPS[k].color,background:SHOPS[k].light}}><ShopIcon kind={k}/></span><div><strong>{game.shops[k].name}</strong><small>{SHOPS[k].label}</small></div><span>{number(game.shops[k].sold)} Artikel</span><strong>{money(game.shops[k].revenue)}</strong></div>)}</section><p className="inline-note"><Icon name="clock" size={15}/>Am Tageswechsel werden {money(owned.reduce((n,k)=>n+game.shops[k].staff*120+60,0))} für Personal und Miete abgerechnet.</p></div>;
}

export function QuestView({ game, kind, update }: ViewProps) {
  const goals=goalProgress(game);
  const labels=[kind === 'tcg' ? 'Öffne deinen ersten Booster' : kind === 'it' ? 'Schliesse deine erste Reparatur ab' : 'Stelle deine erste Backware her', 'Gib deinem Laden ein Upgrade', 'Verkaufe deine ersten 5 Artikel'];
  const descriptions=[kind === 'tcg' ? 'Entdecke fünf Karten und stelle sie zum Verkauf ins Regal.' : kind === 'it' ? 'Nimm eine Service-Anfrage an und bringe ein Gerät wieder zum Laufen.' : 'Starte ein Rezept. Die Herstellung läuft im Hintergrund.', 'Stelle ein Regal, eine Pflanze oder einen zusätzlichen Arbeitsplatz auf.', 'Deine Kunden kaufen automatisch. Du kannst Artikel auch direkt verkaufen.'];
  return <div className="management-view quests-view"><div className="quest-banner"><span className="quest-flag"><Icon name="flag" size={28}/></span><div><span className="eyebrow">DEIN ERSTER MEILENSTEIN</span><h3>Vom Laden zur Lieblingsadresse.</h3><p>Drei kleine Schritte. Ein richtig guter Anfang.</p></div><span className="quest-reward"><Icon name="coins" size={19}/><strong>850 €</strong><small>+4 Beliebtheit</small></span></div><div className="quest-list">{labels.map((label,i) => <div className={`quest-row ${goals[i] ? 'complete' : ''}`} key={label}><span>{goals[i] ? <Icon name="check" size={18}/> : i+1}</span><div><h3>{label}</h3><p>{descriptions[i]}</p></div><strong>{i === 2 ? `${Math.min(5,game.totalSold)}/5` : goals[i] ? '1/1' : '0/1'}</strong></div>)}</div><div className="quest-claim"><span>{goals.filter(Boolean).length} von 3 Aufgaben abgeschlossen</span><button className="button primary" disabled={!goals.every(Boolean) || game.goalClaimed} onClick={() => update(g => {if(g.goalClaimed || !goalProgress(g).every(Boolean))return g;const next=structuredClone(g);next.goalClaimed=true;next.coins+=850;next.shops[kind].popularity=Math.min(99,next.shops[kind].popularity+4);addEvent(next,'Dein erster Meilenstein ist geschafft!','850 € Belohnung und +4 Beliebtheit. Auf die nächsten grossen Ideen.');return next;},'Meilenstein geschafft! +850 € und +4 Beliebtheit.')}><Icon name={game.goalClaimed ? 'check' : 'gift'} size={17}/>{game.goalClaimed ? 'Belohnung abgeholt' : 'Belohnung abholen'}</button></div><section className="next-chapter"><Icon name="store" size={28}/><div><span className="eyebrow">DAS NÄCHSTE KAPITEL</span><h3>Eine Mall. Drei Geschichten.</h3><p>Eröffne alle drei Ladensorten und lass dein Einkaufszentrum wachsen.</p><Progress value={SHOP_ORDER.filter(k=>game.shops[k].owned).length/3*100}/><span>{SHOP_ORDER.filter(k=>game.shops[k].owned).length}/3 Läden eröffnet</span></div></section></div>;
}