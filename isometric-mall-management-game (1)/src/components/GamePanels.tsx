import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState, Page, Placement, ShopKind } from '../game/data';
import { clock, getItem, money, money2, RARITY_LABELS, SHOPS, SHOP_ORDER } from '../game/data';
import { AUTO_SERVE_MS, AUTO_SERVE_TIP_CHANCE, capacity, checkout, expandShop, goalProgress, hasRole, movePlaceable, nextExpansion, skipCustomer as skipCustomerAction, stockCount } from '../game/engine';
import type { VisibleGood } from '../game/visualInventory';
import { createShopDisplay, displayedQuantity } from '../game/visualInventory';
import { Brand, Icon, Modal, Progress, ShopIcon } from './Ui';
import type { IconName } from './Ui';
import { IsoScene } from './IsoScene';
import type { ArrangeApi, ArrangeInfo, ServiceSpot } from './IsoScene';
import { useCrowd } from './Customers';
import { serviceQueues } from '../game/services';
import type { QueueCustomer } from '../game/services';
import { PLACE_LABELS, blockedTiles, piecesOf, placeOf, rotatable } from '../game/layout';
import { RegisterGame } from './RegisterGame';
import { GoodPortrait } from './IsoGoods';
import type { UpdateGame } from './ManagementViews';

export type ModalType = 'shops' | 'pack' | 'help' | 'settings' | 'rename' | 'newgame' | 'activity' | null;
export const NAV: {page: Page; label: string; icon: IconName}[] = [
  {page:'overview',label:'Übersicht',icon:'grid'},
  {page:'production',label:'Produktion',icon:'boxes'},
  {page:'inventory',label:'Lager & Einkauf',icon:'bag'},
  {page:'furnishing',label:'Einrichtung',icon:'chair'},
  {page:'staff',label:'Personal',icon:'users'},
  {page:'finances',label:'Finanzen',icon:'chart'},
  {page:'quests',label:'Aufgaben',icon:'flag'},
];

export function Sidebar({ game, page, onNavigate, onModal, saved, mobileOpen, onClose }: { game: GameState; page: Page; onNavigate: (page:Page) => void; onModal:(modal:ModalType)=>void; saved:boolean; mobileOpen:boolean; onClose:()=>void }) {
  const owned=SHOP_ORDER.filter(k=>game.shops[k].owned).length;
  const navButton=(entry:typeof NAV[number]) => <button key={entry.page} aria-label={entry.label} title={entry.label} className={`nav-button ${page === entry.page ? 'active' : ''}`} onClick={()=>{onNavigate(entry.page);onClose();}}><Icon name={entry.icon} size={19}/><span>{entry.label}</span>{entry.page === 'quests' && !game.goalClaimed && <span className="nav-badge">{3-goalProgress(game).filter(Boolean).length}</span>}{entry.page === 'production' && SHOP_ORDER.reduce((n,k)=>n+game.shops[k].queue.length,0)>0 && <span className="nav-active-dot"/>}</button>;
  return <>{mobileOpen && <button className="sidebar-backdrop" aria-label="Navigation schliessen" onClick={onClose}/>}<aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
    <div className="sidebar-brand"><Brand/><button className="icon-button mobile-nav-close" onClick={onClose} aria-label="Navigation schliessen"><Icon name="x" size={19}/></button></div>
    <div className="sidebar-caption">DEIN KLEINES IMPERIUM</div>
    <nav aria-label="Hauptnavigation"><span className="nav-section-label">DEINE MALL</span>{navButton(NAV[0])}<button className="nav-button" aria-label="Meine Läden" title="Meine Läden" onClick={()=>{onModal('shops');onClose();}}><Icon name="store" size={19}/><span>Meine Läden</span><span className="nav-count">{owned}</span></button>{NAV.slice(1,5).map(navButton)}<div className="nav-divider"/><span className="nav-section-label">DER GROSSE PLAN</span>{NAV.slice(5).map(navButton)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-garden"><svg viewBox="0 0 150 80" aria-hidden="true"><path d="M33 69h85" stroke="#d5e0d5" strokeWidth="1.5"/><path d="M52 62V34l25-13 30 15v27L82 77z" fill="#dde8dd"/><path d="M52 34l25-13 30 15-25 13z" fill="#eef3e8"/><path d="M82 49l25-13v27L82 77z" fill="#bfd2c0"/><path d="M61 42v15m10-11v17m19-13v16m9-20v15" stroke="#91af98" strokeWidth="4"/><path d="M116 61V32m0 13l-9-8m9 0l9-8" stroke="#91ad91" strokeWidth="2"/><ellipse cx="108" cy="29" rx="9" ry="13" transform="rotate(-35 108 29)" fill="#b4cbb0"/><ellipse cx="122" cy="23" rx="9" ry="14" transform="rotate(30 122 23)" fill="#c7d9bb"/><path d="M112 56h9l-1 12h-7z" fill="#d6c6a7"/></svg><span>Aus kleinen Ideen<br/><strong>wird etwas Grosses.</strong></span></div><div className="save-status"><span className={saved ? 'status-dot' : 'status-dot warning'}/><div><strong>{saved ? 'Alles gespeichert' : 'Nur diese Sitzung'}</strong><span>{saved ? 'Dein Fortschritt bleibt bei dir.' : 'Browserspeicher nicht verfügbar.'}</span></div><Icon name="shield" size={16}/></div><button className="nav-button subtle" onClick={()=>onModal('help')}><Icon name="help" size={18}/><span>So funktioniert's</span></button><button className="nav-button subtle" onClick={()=>onModal('settings')}><Icon name="settings" size={18}/><span>Einstellungen</span></button><div className="sidebar-version"><span>MALLSIDE · SANDBOX</span><span>v1.0</span></div></div>
  </aside></>;
}

export function WorldPanel({ game, kind, mode, setMode, zoom, setZoom, update, onNavigate, onInspectInventory, onModal, onSpecial, notify, editLayout, onEditLayout, readGame, uiBlocked }: { game:GameState; kind:ShopKind; mode:'shop'|'mall'; setMode:(mode:'shop'|'mall')=>void; zoom:number; setZoom:(zoom:number)=>void; update:UpdateGame; onNavigate:(page:Page)=>void; onInspectInventory:(good:VisibleGood)=>void; onModal:(modal:ModalType)=>void; onSpecial:()=>void; notify:(text:string)=>void; editLayout:boolean; onEditLayout:(value:boolean)=>void; readGame:()=>GameState; uiBlocked:boolean }) {
  const ref=useRef<HTMLDivElement>(null);
  const [selected,setSelected]=useState<VisibleGood|null>(null);
  const [browse,setBrowse]=useState(false);
  useEffect(()=>{setSelected(null);setBrowse(false);},[kind,mode]);
  useEffect(()=>{if(mode==='mall' && editLayout)onEditLayout(false);},[mode,editLayout,onEditLayout]);
  const shop=game.shops[kind];
  const display=createShopDisplay(kind,shop);
  const [serving,setServing]=useState<{serviceId:string;customer:QueueCustomer}|null>(null);
  const [arrangeInfo,setArrangeInfo]=useState<ArrangeInfo|null>(null);
  const servingRef=useRef<typeof serving>(null);
  const arrangeApi=useRef<ArrangeApi|null>(null);
  const displayed=[...display.showcase,...display.center,...display.shelves.flat()];
  const crowdActive=mode === 'shop' && game.hasChosen && shop.open && displayed.length > 0;
  const crowd=useCrowd(kind,shop,display,crowdActive,game.paused);
  const blockedSet=blockedTiles(shop.layout);
  const services=serviceQueues(kind,shop,blockedSet);
  /** Clicking a service point is all it takes to serve the queue standing there. */
  const serveService=(serviceId:string)=>{
    if(uiBlocked || mode !== 'shop' || !game.hasChosen) return;
    const entry=services.find(item => item.info.id === serviceId);
    if(!entry) return;
    const waiting=crowd.waiting(entry.info.id);
    const customer=crowd.frontAt(entry.info.id,entry.spots[0]);
    if(!customer){
      if(waiting > 0) notify(`Der Kunde ist noch unterwegs zur ${entry.info.label}.`);
      else notify(`An der ${entry.info.label} wartet gerade niemand.`);
      return;
    }
    setServing({serviceId:entry.info.id,customer});
  };
  const waitingServices=services
    .map(entry => ({ entry, waiting: crowd.waiting(entry.info.id) }))
    .filter(item => item.waiting > 0)
    .sort((a,b) => b.waiting - a.waiting);
  const serveHint:ServiceSpot|null=waitingServices.length
    ? { id:waitingServices[0].entry.info.id, label:waitingServices[0].entry.info.label, count:waitingServices.reduce((sum,item) => sum + item.waiting, 0) }
    : null;
  /** The toolbar button serves whoever waits the longest. */
  const openRegister=()=>{
    if(mode !== 'shop' || !game.hasChosen) return;
    if(!waitingServices.length){notify('Gerade wartet niemand an Kasse oder Dienstleistung.');return;}
    serveService(waitingServices[0].entry.info.id);
  };
  const payCustomer=(perfect:boolean)=>{
    if(!serving) return {tip:0,earned:0};
    const result=checkout(readGame(),kind,serving.customer,perfect);
    update(()=>result.game,result.earned > 0
      ? `${serving.customer.method === 'cash' ? 'Bar' : 'Karten'}zahlung abgeschlossen · +${money2(result.earned)}${result.tip ? ` (${money2(result.tip)} Trinkgeld)` : ''}`
      : 'Leider ausverkauft – bestelle neue Ware im Lager.');
    crowd.finish(serving.serviceId);
    return {tip:result.tip,earned:result.earned};
  };
  const nextCustomer=(serviceId:string)=>{
    const following=crowd.front(serviceId);
    setServing(following ? {serviceId,customer:following} : null);
  };
  const skipCustomer=()=>{
    if(!serving) return;
    const leaving=serving.customer;
    update(g=>skipCustomerAction(g,kind,leaving),`${leaving.label} ist gegangen.`);
    crowd.finish(serving.serviceId);
    nextCustomer(serving.serviceId);
  };
  const item=selected?.type === 'item' ? getItem(kind,selected.id) : undefined;
  // Staff on the till keeps the queue moving, even while you walk around. The
  // current game, crowd and update callback are read from a ref, because the
  // shop re-renders every second while the game clock runs: the timer has to
  // survive those renders instead of being restarted all the time.
  const hasCashier=hasRole(shop,'register');
  const tillRef=useRef({kind,readGame,update,crowd});
  tillRef.current={kind,readGame,update,crowd};
  useEffect(()=>{
    if(!hasCashier || mode !== 'shop' || !game.hasChosen || game.paused || !shop.open) return;
    const timer=window.setInterval(()=>{
      if(servingRef.current) return;
      const {kind:shopKind,readGame:read,update:apply,crowd:people}=tillRef.current;
      const current=read();
      const currentShop=current.shops[shopKind];
      const till=serviceQueues(shopKind,currentShop,blockedTiles(currentShop.layout)).find(entry=>entry.info.kind === 'register');
      if(!till) return;
      const customer=people.frontAt(till.info.id,till.spots[0]);
      if(!customer) return;
      const result=checkout(current,shopKind,customer,Math.random() < AUTO_SERVE_TIP_CHANCE);
      apply(()=>result.game);
      people.finish(till.info.id);
    },AUTO_SERVE_MS);
    return()=>window.clearInterval(timer);
  },[hasCashier,mode,game.hasChosen,game.paused,shop.open]);
  servingRef.current=serving;
  const card=selected?.type === 'card' ? shop.cards.find(entry=>entry.id === selected.id) : undefined;
  const quantity=item ? shop.stock[item.id] || 0 : card && !card.sold ? 1 : 0;
  const name=item?.name ?? card?.name ?? (selected?.type === 'card' ? selected.name : '');
  const price=item ? item.price : card?.value || 0;
  const interact:Parameters<typeof IsoScene>[0]['onInteract']=(target)=>{
    if(target === 'expand') {onModal('shops');return;}
    if(!game.hasChosen) {notify('Wähle rechts deinen Startladen und eröffne ihn.');return;}
    if(target === 'special')onSpecial();
    else onNavigate(target === 'production' ? 'production' : target === 'inventory' ? 'inventory' : 'furnishing');
  };
  const fullScreen=async()=>{try{if(document.fullscreenElement) await document.exitFullscreen();else await ref.current?.requestFullscreen();}catch{notify('Die Vollbildansicht wird von diesem Browser nicht unterstützt.');}};
  return <div className="world-panel" ref={ref}><div className="world-heading"><button className="world-shop-selector" onClick={()=>onModal('shops')}><span className="world-shop-icon" style={{backgroundColor:SHOPS[kind].light,color:SHOPS[kind].color}}><ShopIcon kind={kind} size={22}/></span><span><strong>{shop.name}</strong><small>{SHOPS[kind].label} <span>·</span> {game.hasChosen ? 'Dein Laden' : 'Deine erste Geschichte'}</small></span><Icon name="down" size={15}/></button><div className="world-heading-actions"><button className={`button secondary small world-browse ${browse ? 'active' : ''}`} disabled={mode==='mall'} aria-label={browse ? 'Warenübersicht schliessen' : 'Warenübersicht öffnen'} title="Warenübersicht" aria-expanded={browse} onClick={()=>setBrowse(open=>!open)}><Icon name="eye" size={15}/>Waren</button><button className="button secondary small world-furnish" disabled={!game.hasChosen} onClick={()=>onNavigate('furnishing')}><Icon name="pencil" size={14}/>Einrichten</button></div></div>
    <div className="world-stage"><div className="world-stage-toolbar"><div className="world-view-tabs"><button className={mode === 'shop' ? 'active' : ''} onClick={()=>{setMode('shop');setZoom(1);}}><Icon name="store" size={14}/>Ladenansicht</button><button className={mode === 'mall' ? 'active' : ''} onClick={()=>{setMode('mall');setZoom(1);}}><Icon name="grid" size={14}/>Meine Mall</button></div><div className="world-stage-right"><button className={`button secondary small world-serve ${waitingServices.length ? 'is-ready' : ''}`} disabled={mode === 'mall' || !waitingServices.length} title={waitingServices.length ? `${waitingServices[0].entry.info.label} bedienen (${waitingServices.reduce((sum,item) => sum + item.waiting, 0)} wartend)` : 'Gerade wartet niemand an Kasse oder Dienstleistung'} onClick={openRegister}><Icon name="register" size={14}/>Bedienen{waitingServices.length > 0 && <span className="serve-badge">{waitingServices.reduce((sum,item) => sum + item.waiting, 0)}</span>}</button><button className="button secondary small world-expand" disabled={mode === 'mall' || !nextExpansion(shop) || game.coins < (nextExpansion(shop)?.cost ?? 0)} title={nextExpansion(shop) ? `Verkaufsfläche erweitern: ${nextExpansion(shop)!.label} für ${money2(nextExpansion(shop)!.cost)}` : 'Deine Verkaufsfläche ist voll ausgebaut'} onClick={()=>{if(mode !== 'shop')setMode('shop');update(g=>expandShop(g,kind),'Deine Verkaufsfläche ist gewachsen!');}}><Icon name="expand" size={14}/>Erweitern</button><button className={`button secondary small world-arrange ${editLayout ? 'active' : ''}`} disabled={!game.hasChosen || mode === 'mall'} aria-pressed={editLayout} title="Möbel auf den Kacheln verschieben" onClick={()=>{if(mode !== 'shop')setMode('shop');onEditLayout(!editLayout);}}><Icon name={editLayout ? 'check' : 'move'} size={14}/>{editLayout ? 'Fertig' : 'Anordnen'}</button><span className={`world-live ${game.paused ? 'is-paused' : ''}`}><i/>{!game.hasChosen ? 'VORSCHAU' : game.paused ? 'PAUSIERT' : 'DEINE MALL LEBT'}</span></div></div>
      <IsoScene game={game} kind={kind} mode={mode} zoom={zoom} editing={editLayout && mode === 'shop'} arrangeApi={arrangeApi} onArrangeInfo={setArrangeInfo} crowd={mode === 'shop' ? crowd.state : null} crowdReduced={crowd.reduced} onServe={editLayout ? undefined : serveService} onInteract={interact} onInspect={setSelected} onMove={(id:string,place:Placement)=>update(g=>movePlaceable(g,kind,id,place))} selected={selected} onSelect={k=>{if(game.hasChosen)update(g=>({...g,selected:k}));setMode('shop');setZoom(1);}}/>
      {mode === 'shop' && game.hasChosen && waitingServices.length > 0 && <div className="queue-panel" role="status" aria-live="polite">
        <span className="queue-panel-head"><Icon name="bell" size={14}/>Wartende Kundschaft</span>
        {waitingServices.map(item=><div className={`queue-panel-row ${serveHint?.id === item.entry.info.id ? 'is-near' : ''}`} key={item.entry.info.id}>
          <span className="queue-dot" aria-hidden="true"/>
          <span className="queue-panel-label">{item.entry.info.label}</span>
          <strong>{item.waiting}</strong>
          <button type="button" className="queue-serve" onClick={()=>serveService(item.entry.info.id)}><Icon name="register" size={12}/>Bedienen</button>
        </div>)}
      </div>}
      <span className="scene-hint"><Icon name={editLayout ? 'move' : 'eye'} size={14}/>{editLayout ? arrangeInfo ? `${arrangeInfo.label}: ziehen oder Pfeiltasten bewegen${arrangeInfo.canRotate ? ', R dreht' : ''}.` : 'Möbel anklicken und ziehen – Pfeiltasten bewegen, R dreht.' : mode === 'shop' ? game.hasChosen ? 'Kasse oder Dienstleistung anklicken – schon wird die wartende Kundschaft bedient.' : 'Ware anklicken: Produkt und echten Bestand ansehen.' : 'Wähle einen Laden oder eröffne eine neue Fläche.'}</span>
      {editLayout && mode === 'shop' && <div className="layout-editor-bar">
        <Icon name="move" size={15}/>
        <span className="editor-choice">{arrangeInfo ? <><strong>{arrangeInfo.label}</strong> gewählt</> : 'Möbel anklicken, um es zu bewegen'}</span>
        <label className="editor-picker"><span className="sr-only">Möbelstück auswählen</span>
          <select value={arrangeInfo?.id ?? ''} onChange={event=>arrangeApi.current?.select(event.target.value)}>
            <option value="">Möbelstück wählen …</option>
            {piecesOf(shop).map(piece=><option key={piece.id} value={piece.id}>{`${PLACE_LABELS[piece.kind]}${piecesOf(shop).filter(entry=>entry.kind === piece.kind).length > 1 ? ` ${piece.index + 1}` : ''} · ${placeOf(shop.layout,piece).x}/${placeOf(shop.layout,piece).y}${rotatable(piece.kind) ? placeOf(shop.layout,piece).rot === 1 ? ' · gedreht' : '' : ''}`}</option>)}
          </select>
        </label>
        <div className="editor-moves" role="group" aria-label="Möbelstück bewegen">
          {([['up','Nach hinten'],['left','Nach links'],['right','Nach rechts'],['down','Nach vorn']] as const).map(([direction,label])=>
            <button key={direction} type="button" className={`editor-nudge nudge-${direction}`} disabled={!arrangeInfo} aria-label={label} title={label}
              onClick={()=>arrangeApi.current?.move(direction === 'up' ? -1 : direction === 'down' ? 1 : 0, direction === 'left' ? 1 : direction === 'right' ? -1 : 0)}>
              {direction === 'up' ? '▲' : direction === 'down' ? '▼' : direction === 'left' ? '◀' : '▶'}
            </button>)}
        </div>
        <button type="button" className="button secondary small" disabled={!arrangeInfo || !arrangeInfo.canRotate} title={arrangeInfo?.canRotate ? 'Möbelstück drehen (R)' : 'Dieses Möbelstück lässt sich nicht drehen'} onClick={()=>arrangeApi.current?.rotate()}><Icon name="reset" size={14}/>Drehen <kbd>R</kbd></button>
        <button type="button" className="text-button" disabled={!arrangeInfo} onClick={()=>arrangeApi.current?.clear()}>Abwählen</button>
        <button type="button" className="text-button" onClick={()=>onEditLayout(false)}>Fertig</button>
      </div>}
      <div className="camera-controls"><button className="icon-button" onClick={()=>setZoom(Math.min(1.5,Math.round((zoom+.1)*10)/10))} disabled={zoom >= 1.5} aria-label="Ansicht vergrössern"><Icon name="plus" size={17}/></button><button className="icon-button" onClick={()=>setZoom(Math.max(.7,Math.round((zoom-.1)*10)/10))} disabled={zoom <= .7} aria-label="Ansicht verkleinern"><Icon name="minus" size={17}/></button><span/><button className="icon-button" onClick={()=>setZoom(1)} aria-label="Ansicht zurücksetzen"><Icon name="reset" size={16}/></button><button className="icon-button" onClick={fullScreen} aria-label="Vollbildansicht"><Icon name="maximize" size={16}/></button></div>
    </div><AnimatePresence>{browse && <motion.div className="scene-catalog" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:.22}}>
      <div className="scene-catalog-inner"><div className="scene-catalog-heading"><div><h3>Was steht in deinem Laden?</h3><p>Jedes Stück in der Szene stammt aus deinem Bestand.</p></div><button className="icon-button" aria-label="Warenübersicht schliessen" onClick={()=>setBrowse(false)}><Icon name="x" size={16}/></button></div>
      <div className="scene-catalog-list">{SHOPS[kind].items.map(entry => {
        const good:VisibleGood={type:'item',id:entry.id};
        const count=shop.stock[entry.id] || 0;
        return <button key={entry.id} className={`scene-catalog-item ${count===0 ? 'is-empty' : ''}`} onClick={()=>{setSelected(good);setBrowse(false);}}><span className="catalog-art" style={{background:entry.color+'21'}}><GoodPortrait kind={kind} good={good}/></span><span><strong>{entry.name}</strong><small>{count === 0 ? 'Nicht auf Lager' : `${count} auf Lager · ${displayedQuantity(display,good)} sichtbar`}</small></span></button>;
      })}{shop.cards.filter(entry=>entry.listed && !entry.sold).map(entry=>{
        const good:VisibleGood={type:'card',id:entry.id,element:entry.element,rarity:entry.rarity,name:entry.name};
        return <button key={entry.id} className="scene-catalog-item" onClick={()=>{setSelected(good);setBrowse(false);}}><span className="catalog-art" style={{background:'#f1eaf8'}}><GoodPortrait kind={kind} good={good}/></span><span><strong>{entry.name}</strong><small>{RARITY_LABELS[entry.rarity]} · {displayedQuantity(display,good) ? 'in Auslage' : 'auf Lager'}</small></span></button>;
      })}</div></div>
    </motion.div>}</AnimatePresence><AnimatePresence mode="wait">{selected && <motion.div className="scene-inspector" key={`${selected.type}-${selected.id}`} role="region" aria-label="Wareninformation" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.2}}>
      <span className="scene-inspector-art"><GoodPortrait kind={kind} good={selected}/></span>
      <span className="scene-inspector-copy"><small>{selected.type === 'card' ? RARITY_LABELS[selected.rarity]+' · Einzelkarte' : item?.category === 'intermediate' ? 'VORPRODUKT · WERKSTATT' : item?.category === 'material' ? 'ROHSTOFF · VORRAT' : 'WARE IN DEINEM LADEN'}</small><strong>{name}</strong><span className={quantity === 0 ? 'scene-out-of-stock' : ''}>{quantity === 0 ? 'Ausverkauft' : item?.category === 'intermediate' ? `${quantity} Stück für deine Rezepte` : `${displayedQuantity(display,selected)} sichtbar · ${quantity} Stück auf Lager`}</span></span>
      <span className="scene-inspector-price"><small>{item?.category === 'material' ? 'EINKAUFSPREIS' : item?.category === 'intermediate' ? 'WERT' : 'VERKAUFSPREIS'}</small><strong>{money(Math.round(price * (item?.category === 'material' ? 1 : shop.price)))}</strong></span>
      <button className="button secondary small scene-inspector-action" onClick={()=>game.hasChosen ? onInspectInventory(selected) : onModal('shops')}>{game.hasChosen ? selected.type==='card' ? 'Sammlung' : item?.category==='intermediate' ? 'Produktion' : 'Zum Lager' : 'Laden eröffnen'}<Icon name="arrow" size={13}/></button>
      <button className="icon-button scene-inspector-close" aria-label="Wareninformation schliessen" onClick={()=>setSelected(null)}><Icon name="x" size={17}/></button>
    </motion.div>}</AnimatePresence><Modal open={!!serving} onClose={()=>setServing(null)} wide className="register-modal" title={serving ? `${serving.customer.method === 'cash' ? 'Barzahlung' : 'Kartenzahlung'} · ${money2(serving.customer.total)}` : 'Kasse'} subtitle={serving ? `${serving.customer.label} · bediene den Kunden und schliesse den Kassenvorgang ab.` : ''}>
        {serving && <RegisterGame
          key={serving.customer.walker}
          customer={serving.customer}
          kind={kind}
          onPaid={payCustomer}
          onSkip={skipCustomer}
          onNext={()=>nextCustomer(serving.serviceId)}
          onClose={()=>setServing(null)}
        />}
      </Modal><div className="world-footer"><div className="world-time"><span className="time-icon"><Icon name="sun" size={19}/></span><strong>Tag {game.day}<span>·</span>{clock(game.minute)}</strong><span className="time-of-day">{game.minute < 720 ? 'Ein guter Morgen' : game.minute < 1080 ? 'Ein guter Nachmittag' : 'Ein guter Abend'}</span></div><div className="simulation-controls"><button className={`pause-button ${game.paused ? 'paused' : ''}`} disabled={!game.hasChosen} onClick={()=>update(g=>({...g,paused:!g.paused}))} aria-label={game.paused ? 'Simulation fortsetzen' : 'Simulation pausieren'} title="Leertaste: Pause"><Icon name={game.paused ? 'play' : 'pause'} size={15}/></button><div className="speed-controls">{[1,2,3].map(speed=><button key={speed} disabled={!game.hasChosen} className={game.speed === speed ? 'active' : ''} aria-pressed={game.speed === speed} onClick={()=>update(g=>({...g,speed}))}>{speed}×</button>)}</div><Icon name="fast" size={17}/></div></div>
  </div>;
}

export function ShopPanel({ game, kind, pending, onPending, onStart, update, onNavigate, onSpecial, onModal }: { game:GameState; kind:ShopKind; pending:ShopKind; onPending:(kind:ShopKind)=>void; onStart:()=>void; update:UpdateGame; onNavigate:(page:Page)=>void; onSpecial:()=>void; onModal:(modal:ModalType)=>void }) {
  const shop=game.shops[kind];
  const current=shop.queue[0];
  const recipe=SHOPS[kind].recipes.find(r=>r.id === current?.recipeId);
  const order=shop.orders.find(o=>o.id === current?.repairId);
  if(!game.hasChosen)return <section className="shop-panel starter-panel"><span className="eyebrow green">DER ERSTE SCHRITT</span><h2>Dein erster Laden.</h2><p className="starter-intro">Jede grosse Geschichte fängt klein an.<br/>Womit beginnt deine?</p><div className="shop-choices">{SHOP_ORDER.map(k=><button className={`shop-choice ${pending === k ? 'selected' : ''}`} style={{'--shop-color':SHOPS[k].color,'--shop-light':SHOPS[k].light} as React.CSSProperties} key={k} onClick={()=>onPending(k)} aria-pressed={pending === k}><span className="shop-choice-icon"><ShopIcon kind={k} size={21}/></span><span><strong>{SHOPS[k].label}</strong><small>{SHOPS[k].specialty}</small></span><span className="choice-check">{pending === k && <Icon name="check" size={12}/>}</span></button>)}</div><button className="button primary start-button" onClick={onStart}>Lass uns loslegen<Icon name="arrow" size={17}/></button><span className="starter-capital"><Icon name="coins" size={14}/>Dein Startkapital: <strong>{money(game.coins)}</strong></span><div className="starter-tip"><span><Icon name="leaf" size={21}/></span><p>Ganz entspannt starten.<br/><strong>Deine Mall wächst in deinem Tempo.</strong></p></div></section>;
  return <section className="shop-panel"><div className="shop-panel-heading"><span className="eyebrow">DEIN LADEN</span><button className="icon-button" onClick={()=>onModal('rename')} aria-label="Laden umbenennen"><Icon name="pencil" size={14}/></button></div><div className="shop-profile"><span className="shop-avatar" style={{color:SHOPS[kind].color,background:SHOPS[kind].light}}><ShopIcon kind={kind} size={29}/></span><div><h2>{shop.name}</h2><p>{SHOPS[kind].label}</p></div></div><button className={`shop-open-toggle ${!shop.open ? 'closed' : ''}`} aria-pressed={shop.open} onClick={()=>update(g=>{const next=structuredClone(g);next.shops[kind].open=!next.shops[kind].open;return next;},shop.open ? 'Laden geschlossen. Die Produktion läuft weiter.' : 'Die Türen sind offen. Willkommen, liebe Kunden!')}><i/>{shop.open ? 'Geöffnet für gute Geschäfte' : 'Laden ist geschlossen'}<span className="toggle-mini"><span/></span></button><div className="shop-divider"/><div className="shop-special"><div className="section-title"><h3>{kind === 'tcg' ? 'Die nächste Entdeckung' : kind === 'it' ? 'Gute Technik verdient Service' : 'Frisch aus deiner Backstube'}</h3><Icon name="sparkles" size={15}/></div><p>{kind === 'tcg' ? `${shop.stock.booster} Packs warten auf ihre Geschichte.` : kind === 'it' ? `${shop.orders.filter(o=>o.status === 'available').length} Geräte warten auf deine Hilfe.` : `${shop.stock.bread+shop.stock.croissant+shop.stock.cake} frische Backwaren liegen bereit.`}</p><button className="button primary" onClick={onSpecial}><Icon name={kind === 'tcg' ? 'cards' : kind === 'it' ? 'wrench' : 'bread'} size={16}/>{kind === 'tcg' ? 'Pack öffnen' : kind === 'it' ? 'Reparaturen ansehen' : 'Backstube öffnen'}<Icon name="arrow" size={16}/></button></div><div className="shop-divider"/><div className="shop-popularity"><div><span><Icon name="star" size={15}/>Beliebtheit</span><strong>{Math.round(shop.popularity)}<small>/100</small></strong></div><Progress value={shop.popularity}/><p>Kleine Extras machen einen grossen Unterschied.</p></div><button className="shop-stock-summary" onClick={()=>onNavigate('inventory')}><span><Icon name="boxes" size={16}/>Lagerplätze</span><strong>{stockCount(shop)}<small> / {capacity(shop)}</small><Icon name="right" size={14}/></strong></button><div className="shop-production"><div className="section-title"><h3>Im Hintergrund passiert Gutes.</h3><span className={`status-dot ${current ? '' : 'idle'}`}/></div>{current ? <><div className="production-peek"><span><Icon name={order ? 'wrench' : 'settings'} size={17}/></span><div><strong>{order?.device || recipe?.name}</strong><small>{Math.ceil((current.duration-current.progress)/(1+shop.skill*.15))}s verbleibend · {shop.queue.length} {shop.queue.length === 1 ? 'Auftrag' : 'Aufträge'}</small></div><b>{Math.floor(current.progress/current.duration*100)}%</b></div><Progress value={current.progress/current.duration*100} color={SHOPS[kind].color}/></> : <p className="production-idle">Dein nächstes Produkt wartet auf eine Idee.</p>}<button className="text-button" onClick={()=>onNavigate('production')}>{current ? 'Produktion verwalten' : 'Herstellung starten'}<Icon name="arrow" size={14}/></button></div><button className="button secondary full-width" onClick={()=>onNavigate('furnishing')}><Icon name="chair" size={16}/>Laden einrichten</button></section>;
}

export function GoalPanel({ game, kind, onNavigate }: { game:GameState; kind:ShopKind; onNavigate:(page:Page)=>void }) {
  const goals=goalProgress(game);
  const labels=[kind === 'tcg' ? 'Dein erstes Pack öffnen' : kind === 'it' ? 'Ein Gerät reparieren' : 'Deine erste Charge backen','Den Laden schöner machen','5 Artikel verkaufen'];
  return <section className="goal-panel"><div className="goal-heading"><span><Icon name="flag" size={19}/></span><div><span className="eyebrow">DEIN NÄCHSTER MEILENSTEIN</span><h3>Ein richtig guter Anfang.</h3></div></div><div className="mini-goals">{labels.map((label,i)=><div className={goals[i] ? 'complete' : ''} key={label}><span>{goals[i] && <Icon name="check" size={10}/>}</span><p>{label}</p><small>{i === 2 ? `${Math.min(5,game.totalSold)}/5` : goals[i] ? '1/1' : '0/1'}</small></div>)}</div><div className="goal-footer"><span><Icon name="gift" size={13}/>{game.goalClaimed ? 'Meilenstein geschafft!' : '850 € Belohnung'}</span><button className="text-button" onClick={()=>onNavigate('quests')}>Aufgaben<Icon name="arrow" size={14}/></button></div></section>;
}

export function ActivityFeed({ game, onMore, all = false }: { game:GameState; onMore?:()=>void; all?:boolean }) {
  return <section className={`activity-feed ${all ? 'activity-all' : ''}`}>{!all && <div className="section-title"><h3>Leben in deiner Mall<span className="activity-live-dot"/></h3><button className="text-button" onClick={onMore}>Alle Aktivitäten<Icon name="arrow" size={13}/></button></div>}<div className="activity-list">{game.events.slice(0,all ? 16 : 2).map(event=><div className="activity-row" key={event.id}><span className={`activity-icon ${event.kind}`}><Icon name={event.kind === 'sale' ? 'bag' : event.kind === 'production' ? 'boxes' : event.kind === 'build' ? 'hammer' : 'leaf'} size={17}/></span><div><strong>{event.text}</strong><p>{event.detail}</p></div><span className="activity-time">{event.time}</span></div>)}</div></section>;
}
