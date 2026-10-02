import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { GameState, Page, ShopKind, TradingCard } from './game/data';
import { getItem, money, SHOPS, SHOP_ORDER } from './game/data';
import { addEvent, advance, enqueue, isValidSave, loadGame, manageCards, newGame, normalizeGame, openPack, recommendedRecipe, SAVE_KEY, setTheme, unlockShop } from './game/engine';
import type { VisibleGood } from './game/visualInventory';
import { Brand, Icon, Modal, ShopIcon } from './components/Ui';
import { ActivityFeed, GoalPanel, NAV, ShopPanel, Sidebar, WorldPanel } from './components/GamePanels';
import type { ModalType } from './components/GamePanels';
import { FinanceView, FurnishingView, InventoryView, ProductionView, QuestView, StaffView } from './components/ManagementViews';
import type { UpdateGame } from './components/ManagementViews';
import { PackOpening } from './components/Cards';

const PAGE_COPY: Record<Page,{eyebrow:string;title:string;description:string}> = {
  overview:{eyebrow:'DEIN EINKAUFSIMPERIUM',title:'Kleine Läden. Große Möglichkeiten.',description:'Ein guter Ort beginnt mit einer guten Idee. Mach sie zu deiner Mall.'},
  production:{eyebrow:'VON DER IDEE INS REGAL',title:'Hier wird aus wenig richtig viel.',description:'Plane deine Chargen. Dein Team macht im Hintergrund den Rest.'},
  inventory:{eyebrow:'ALLES AN SEINEM PLATZ',title:'Gut gefüllt. Gut fürs Geschäft.',description:'Behalte deine Artikel im Blick und bestelle neue Rohstoffe direkt beim Lieferanten.'},
  furnishing:{eyebrow:'EIN ORT ZUM GERNEBLEIBEN',title:'Ein bisschen mehr Lieblingsladen.',description:'Kasse, Regale und kleine Extras. Gib deinem Laden seinen ganz eigenen Charakter.'},
  staff:{eyebrow:'DAS TEAM HINTER DEINER IDEE',title:'Zusammen wächst es sich besser.',description:'Finde gute Leute, entwickle dein Team und schaffe Platz für neue Produktionslinien.'},
  finances:{eyebrow:'DEINE IDEEN ZAHLEN SICH AUS',title:'Gute Geschäfte. Ein gutes Gefühl.',description:'Jeder Verkauf ist ein kleiner Schritt in Richtung Einkaufsimperium.'},
  quests:{eyebrow:'KLEINE SCHRITTE, GROSSE PLÄNE',title:'Deine nächste gute Geschichte.',description:'Erreiche Meilensteine und sammle Belohnungen für deinen nächsten grossen Schritt.'},
};

export default function App() {
  const [game,setGame]=useState<GameState>(loadGame);
  const [page,setPage]=useState<Page>('overview');
  const [pending,setPending]=useState<ShopKind>(game.selected);
  const [picker,setPicker]=useState<ShopKind>(game.selected);
  const [mode,setMode]=useState<'shop'|'mall'>('shop');
  const [zoom,setZoom]=useState(1);
  const [arrange,setArrange]=useState(false);
  const [modal,setModal]=useState<ModalType>(null);
  const [packCards,setPackCards]=useState<TradingCard[]>([]);
  const [productionTab,setProductionTab]=useState<'craft'|'repair'>('craft');
  const [inventoryTab,setInventoryTab]=useState<'products'|'materials'|'cards'>('products');
  const [rename,setRename]=useState('');
  const [toast,setToast]=useState<{id:number;text:string}|null>(null);
  const [saved,setSaved]=useState(true);
  const [mobileOpen,setMobileOpen]=useState(false);
  const audio=useRef<AudioContext|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  /** Always the newest state, also for actions that need it right away (the register). */
  const gameRef=useRef(game);
  gameRef.current=game;
  const kind=game.hasChosen ? game.selected : pending;
  const shop=game.shops[kind];
  const copy=PAGE_COPY[page];

  const dark=game.theme === 'dark';
  useEffect(()=>{document.documentElement.classList.toggle('dark-ui',dark);},[dark]);
  const notify=useCallback((text:string)=>setToast({id:Date.now(),text}),[]);
  const closeModal=useCallback(()=>setModal(null),[]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),3800);return()=>window.clearTimeout(timer);},[toast]);
  useEffect(()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(game));setSaved(true);}catch{setSaved(false);}},[game]);
  useEffect(()=>{
    let last=Date.now();
    const timer=window.setInterval(()=>{
      const elapsed=Math.floor((Date.now()-last)/1000);
      const seconds=Math.min(300,elapsed);
      if(seconds<1)return;
      last+=elapsed*1000;
      setGame(previous=>{const next=advance(previous,seconds*previous.speed);gameRef.current=next;return next;});
    },1000);
    return()=>window.clearInterval(timer);
  },[]);

  const update:UpdateGame=useCallback((action,message)=>{
    const previous=gameRef.current;
    const changed=action(previous);
    const next=changed === previous ? previous : {...changed,savedAt:Date.now()};
    gameRef.current=next;
    setGame(next);
    if(message){notify(message);if(game.sound){try{
      audio.current ||= new AudioContext();void audio.current.resume();
      const tone=audio.current.createOscillator(),gain=audio.current.createGain();
      tone.type='sine';tone.frequency.setValueAtTime(720,audio.current.currentTime);tone.frequency.exponentialRampToValueAtTime(1080,audio.current.currentTime+.08);
      gain.gain.setValueAtTime(.035,audio.current.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.current.currentTime+.15);
      tone.connect(gain);gain.connect(audio.current.destination);tone.start();tone.stop(audio.current.currentTime+.16);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
    }catch{ /* Sound is optional on browsers without Web Audio. */ }}}
  },[notify,game.sound]);

  const goPage=useCallback((next:Page)=>{
    if(!game.hasChosen && next !== 'overview'){notify('Wähle zuerst deinen Startladen. Dann gehört die Mall dir.');return;}
    if(next === 'production')setProductionTab('craft');
    if(next === 'inventory')setInventoryTab('products');
    if(next !== 'overview')setArrange(false);
    setPage(next);setMobileOpen(false);
  },[game.hasChosen,notify]);

  const arrangeFurniture=useCallback(()=>{setPage('overview');setMode('shop');setZoom(1);setArrange(true);},[]);

  const inspectInventory=(good:VisibleGood)=>{
    if(good.type === 'item' && getItem(kind,good.id)?.category === 'intermediate'){
      setProductionTab('craft');setPage('production');
    }else{
      setInventoryTab(good.type === 'card' ? 'cards' : getItem(kind,good.id)?.category === 'material' ? 'materials' : 'products');setPage('inventory');
    }
  };

  const showModal=(next:ModalType)=>{
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
    setMobileOpen(false);
    if(next === 'shops' || next === 'newgame')setPicker(game.hasChosen ? game.selected : pending);
    if(next === 'pack')setPackCards([]);if(next === 'rename')setRename(shop.name);setModal(next);
  };

  const start=(startKind:ShopKind)=>{
    const fresh=newGame(startKind,true);
    fresh.shops[startKind].autoRecipes=[recommendedRecipe(startKind)];
    const started=enqueue(fresh,startKind,recommendedRecipe(startKind));
    setGame(started);setPending(startKind);setPage('overview');setMode('shop');setZoom(1);setArrange(false);setModal(null);
    notify(`${SHOPS[startKind].defaultName} ist geöffnet. Deine Geschichte beginnt!`);
  };

  const special=()=>{if(kind === 'tcg')showModal('pack');else{setProductionTab(kind === 'it' ? 'repair' : 'craft');setPage('production');}};
  const handleOpenPack=()=>{
    const result=openPack(game);if(!result.cards.length){notify('Keine Booster auf Lager. Stelle neue Packs in der Produktion her.');return;}
    setGame(result.game);setPackCards(result.cards);
  };

  useEffect(()=>{
    const shortcuts=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(!game.hasChosen || modal || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || ['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(target.tagName) || target.isContentEditable)return;
      if(event.code === 'Space'){event.preventDefault();setGame(g=>({...g,paused:!g.paused}));}
      if(['1','2','3'].includes(event.key))setGame(g=>({...g,speed:Number(event.key)}));
    };window.addEventListener('keydown',shortcuts);return()=>window.removeEventListener('keydown',shortcuts);
  },[game.hasChosen,modal]);

  const exportSave=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(game,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`mallside-tag-${game.day}.json`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Dein Spielstand wurde exportiert.');
  };
  const importSave=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    try{const imported:unknown=JSON.parse(await file.text());if(!isValidSave(imported))throw new Error('invalid');setGame(normalizeGame({...imported,savedAt:Date.now()}));setPending(imported.selected);setPage('overview');setArrange(false);closeModal();notify('Dein Spielstand ist wieder da. Willkommen zurück!');}
    catch{notify('Diese Datei ist kein gültiger Mallside-Spielstand.');}event.target.value='';
  };
  const chooseShop=()=>{
    if(modal === 'newgame' || !game.hasChosen){start(picker);return;}
    const alreadyOwned=game.shops[picker].owned;
    if(!alreadyOwned && game.coins < SHOPS[picker].expansionCost){notify('Für diesen Laden brauchst du noch etwas Startkapital.');return;}
    update(g=>unlockShop(g,picker),alreadyOwned ? `Willkommen in ${game.shops[picker].name}.` : `${SHOPS[picker].defaultName} ist jetzt Teil deiner Mall!`);
    setPage('overview');setMode('shop');setZoom(1);closeModal();
  };
  const selectedPicker=SHOPS[picker],isFresh=modal === 'newgame' || !game.hasChosen,owned=game.shops[picker].owned;
  const viewProps={game,kind,update,notify};

  return <MotionConfig reducedMotion="user"><div className={`app-shell ${dark ? 'is-dark' : ''}`}>
    <Sidebar game={game} page={page} onNavigate={goPage} onModal={showModal} saved={saved} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/>
    <div className="app-main"><header className="topbar"><div className="topbar-location"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Navigation öffnen"><Icon name="menu" size={21}/></button><span className="mobile-brand"><Brand compact/></span><Icon name="store" size={17}/><span>Meine Mall</span><Icon name="right" size={13}/><strong>{NAV.find(entry=>entry.page === page)?.label}</strong></div><div className="topbar-resources"><div className="top-resource wallet"><span className="resource-icon"><Icon name="coins" size={20}/></span><span><small>Dein Guthaben</small><strong>{money(game.coins)}</strong></span></div><span className="resource-divider"/><div className="top-resource reputation"><span className="resource-icon"><Icon name="star" size={19}/></span><span><small>Beliebtheit</small><strong>{Math.round(shop.popularity)}<span> / 100</span></strong></span></div><span className="resource-divider last"/><button className="icon-button theme-toggle" onClick={()=>update(g=>setTheme(g,dark ? 'light' : 'dark'),dark ? 'Helles Layout an' : 'Dunkles Layout an')} aria-label={dark ? 'Helles Layout einschalten' : 'Dunkles Layout einschalten'} title={dark ? 'Helles Layout' : 'Dunkles Layout'} aria-pressed={dark}><Icon name={dark ? 'sun' : 'moon'} size={20}/></button><button className="icon-button notification-button" onClick={()=>showModal('activity')} aria-label="Mall-Aktivitäten ansehen"><Icon name="bell" size={20}/>{game.events.length>1 && <i/>}</button><button className="manager-avatar" onClick={()=>showModal('settings')} aria-label="Einstellungen öffnen">L<span/></button></div></header>
      <main className="workspace"><div className="page-heading"><div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></div><button className="button secondary header-action" onClick={()=>page !== 'overview' ? goPage('overview') : showModal(game.hasChosen ? 'shops' : 'help')}><Icon name={page !== 'overview' ? 'store' : game.hasChosen ? 'plus' : 'book'} size={16}/>{page !== 'overview' ? 'Zur Ladenansicht' : game.hasChosen ? 'Neuen Laden eröffnen' : 'Spiel entdecken'}{page === 'overview' && game.hasChosen && <Icon name="arrowUp" size={15}/>}</button></div>
        {!game.hasChosen && <button className="mobile-start-prompt" onClick={()=>showModal('shops')}><span><Icon name="store" size={16}/>Wähle deinen ersten Laden</span><Icon name="arrow" size={16}/></button>}
        <div className="content-layout"><div className="main-column"><AnimatePresence mode="wait"><motion.div className="page-content" key={`${page}-${page === 'production' ? productionTab : ''}-${page === 'overview' ? 'world' : kind}`} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.2}}>
          {page === 'overview' && <><WorldPanel game={game} kind={kind} mode={mode} setMode={setMode} zoom={zoom} setZoom={setZoom} update={update} onNavigate={goPage} onInspectInventory={inspectInventory} onModal={showModal} onSpecial={special} notify={notify} editLayout={arrange} onEditLayout={setArrange} readGame={()=>gameRef.current} uiBlocked={modal !== null}/><ActivityFeed game={game} onMore={()=>showModal('activity')}/></>}
          {page === 'production' && <ProductionView {...viewProps} initialTab={productionTab}/>}
          {page === 'inventory' && <InventoryView {...viewProps} initialTab={inventoryTab}/>}
          {page === 'furnishing' && <FurnishingView {...viewProps} onArrange={arrangeFurniture}/>}
          {page === 'staff' && <StaffView {...viewProps}/>}
          {page === 'finances' && <FinanceView {...viewProps}/>}
          {page === 'quests' && <QuestView {...viewProps}/>}
        </motion.div></AnimatePresence><div className="workspace-footer"><span>Ein bisschen planen. Ein bisschen träumen. Deine Mall.</span><span><Icon name="leaf" size={12}/>Made for good little stories.</span></div></div>
          <aside className="right-column"><ShopPanel game={game} kind={kind} pending={pending} onPending={setPending} onStart={()=>start(pending)} update={update} onNavigate={goPage} onSpecial={special} onModal={showModal}/><GoalPanel game={game} kind={kind} onNavigate={goPage}/></aside>
        </div>
      </main>
    </div>

    <Modal open={modal === 'shops' || modal === 'newgame'} onClose={closeModal} title={isFresh ? 'Deine erste grosse Idee.' : 'Mehr Platz für gute Geschichten.'} subtitle={modal === 'newgame' ? 'Ein neuer Anfang: Dein aktueller Spielstand wird durch ein neues Spiel ersetzt.' : !game.hasChosen ? 'Wähle deinen ersten Laden. Alles andere wächst mit dir.' : 'Besuche deine Läden oder eröffne einen neuen Teil deiner Mall.'}>
      <div className="picker-list">{SHOP_ORDER.map(k=><button className={`picker-option ${picker === k ? 'selected' : ''}`} style={{'--shop-color':SHOPS[k].color,'--shop-light':SHOPS[k].light} as CSSProperties} onClick={()=>setPicker(k)} key={k} aria-pressed={picker === k}><span className="picker-shop-icon"><ShopIcon kind={k} size={25}/></span><span><strong>{SHOPS[k].label}</strong><small>{SHOPS[k].specialty}</small></span><span className="picker-price">{isFresh ? <Icon name={picker === k ? 'check' : 'plus'} size={18}/> : game.shops[k].owned ? <><i/>Geöffnet</> : money(SHOPS[k].expansionCost)}</span></button>)}</div><div className="picker-description" style={{borderColor:selectedPicker.color}}><span className="eyebrow">{selectedPicker.defaultName.toUpperCase()}</span><h3>{selectedPicker.tagline}</h3><p>{selectedPicker.description}</p></div><div className="picker-actions"><span><Icon name="coins" size={16}/>{isFresh ? '12.480 € Startkapital' : money(game.coins)+' verfügbar'}</span><button className="button primary" disabled={!isFresh && !owned && game.coins < selectedPicker.expansionCost} onClick={chooseShop}>{isFresh ? 'Meine Geschichte starten' : owned ? 'Laden ansehen' : 'Laden eröffnen'}<Icon name="arrow" size={17}/></button></div>
    </Modal>
    <Modal open={modal === 'pack'} onClose={closeModal} title={packCards.length ? 'Deine neuen Entdeckungen.' : 'Ein kleines Pack. Grosse Möglichkeiten.'} subtitle="NOVA ORIGINS · Card Corner" wide className="pack-modal"><PackOpening game={game} cards={packCards} onOpen={handleOpenPack} onManage={(ids,action)=>update(g=>manageCards(g,ids,action),action === 'list' ? 'Deine Karten stehen jetzt zum Verkauf im Regal.' : 'Deine Sammlerkarten wurden verkauft.')} onNext={()=>setPackCards([])}/></Modal>
    <Modal open={modal === 'rename'} onClose={closeModal} title="Ein Name, der hängen bleibt." subtitle="Gib deinem Laden eine ganz persönliche Note."><form className="rename-form" onSubmit={event=>{event.preventDefault();if(rename.trim().length<2)return;update(g=>{const next=structuredClone(g);next.shops[kind].name=rename.trim();addEvent(next,`${rename.trim()}: Ein neuer Name, dieselbe gute Idee.`,'Dein Ladenschild wurde aktualisiert.');return next;},'Dein neues Ladenschild hängt bereits.');closeModal();}}><label>Ladenname<input value={rename} onChange={e=>setRename(e.target.value)} maxLength={22} minLength={2} required placeholder="Dein Lieblingsladen"/></label><span>{rename.length}/22 Zeichen</span><button className="button primary" type="submit">Namen speichern<Icon name="check" size={16}/></button></form></Modal>
    <Modal open={modal === 'activity'} onClose={closeModal} title="Deine Mall ist voller Leben." subtitle="Verkäufe, neue Produkte und kleine grosse Fortschritte."><ActivityFeed game={game} all/></Modal>
    <Modal open={modal === 'help'} onClose={closeModal} title="Klein anfangen. Gross rauskommen." subtitle="Willkommen bei Mallside. Deine Mall. Deine Geschichte."><div className="help-steps">{[{icon:'store' as const,title:'Dein erster Lieblingsladen.',text:'TCG, Technik oder Backwaren? Wähle einen Startladen. Einrichtung, Rohstoffe und 12.480 € Startkapital sind bereits dabei.'},{icon:'boxes' as const,title:'Aus Rohstoffen werden gute Ideen.',text:'Starte Rezepte in der Produktion. Vorprodukte wie Teig und Mainboards eröffnen weitere Rezepte. Dein Team arbeitet im Hintergrund.'},{icon:'sparkles' as const,title:'Jeder Laden kann etwas Besonderes.',text:'Öffne Booster und verkaufe seltene Karten, repariere defekte Computer oder stelle warme Backwaren in deiner Backstube her.'},{icon:'leaf' as const,title:'Wachsen, ganz in deinem Tempo.',text:'Dekoration steigert die Beliebtheit. Regale vergrössern das Lager. Personal und Arbeitsplätze ermöglichen parallele Produktion. Eröffne später weitere Läden.'}].map((step,index)=><div key={step.title}><span><Icon name={step.icon} size={22}/></span><section><small>SCHRITT 0{index+1}</small><h3>{step.title}</h3><p>{step.text}</p></section></div>)}</div><div className="help-time"><Icon name="clock" size={19}/><p>1 echte Sekunde = 1 Spielminute. Um 21:00 Uhr beginnt der nächste Tag. Pro Laden werden 60 € Miete und je Mitarbeiter 120 € Lohn abgerechnet. Backwaren verlieren über Nacht 25% ihres Bestands.</p></div><div className="help-shortcuts"><span><kbd>Leertaste</kbd> Pause</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Tempo</span><span><kbd>Esc</kbd> Fenster schliessen</span></div><button className="button primary full-width" onClick={closeModal}>Zeit für deine gute Idee<Icon name="arrow" size={17}/></button></Modal>
    <Modal open={modal === 'settings'} onClose={closeModal} title="Deine Mall. Dein Tempo." subtitle="Ein paar kleine Einstellungen für deine grosse Geschichte."><div className="settings-rows"><div><span><Icon name={dark ? 'moon' : 'sun'} size={21}/><section><strong>Dunkles Layout</strong><p>Für ruhige Abende: Die Oberfläche wird dunkel, dein Laden bleibt beleuchtet</p></section></span><button className={`switch ${dark ? 'on' : ''}`} role="switch" aria-checked={dark} aria-label="Dunkles Layout einschalten" onClick={()=>update(g=>setTheme(g,dark ? 'light' : 'dark'),dark ? 'Helles Layout an' : 'Dunkles Layout an')}><span/></button></div><div><span><Icon name={game.sound ? 'volume' : 'mute'} size={21}/><section><strong>Ein bisschen Klang</strong><p>Sanfte Töne bei deinen Aktionen</p></section></span><button className={`switch ${game.sound ? 'on' : ''}`} role="switch" aria-checked={game.sound} aria-label="Spielton aktivieren" onClick={()=>update(g=>({...g,sound:!g.sound}))}><span/></button></div><div><span><Icon name="pause" size={21}/><section><strong>Eine kleine Pause</strong><p>Produktion und Verkäufe anhalten</p></section></span><button className={`switch ${game.paused ? 'on' : ''}`} role="switch" aria-checked={game.paused} aria-label="Spiel pausieren" onClick={()=>update(g=>({...g,paused:!g.paused}))}><span/></button></div><div><span><Icon name="shield" size={21}/><section><strong>Dein Spielstand bleibt bei dir</strong><p>{saved ? 'Automatisch in diesem Browser gespeichert' : 'Exportiere den Spielstand, um ihn zu behalten'}</p></section></span><Icon name={saved ? 'check' : 'download'} size={19}/></div></div><section className="save-actions"><span className="eyebrow">DEINE GESCHICHTE MITNEHMEN</span><div><button className="button secondary" onClick={exportSave}><Icon name="download" size={16}/>Exportieren</button><button className="button secondary" onClick={()=>importInput.current?.click()}><Icon name="upload" size={16}/>Importieren</button><input ref={importInput} type="file" accept=".json,application/json" onChange={importSave} hidden/></div><p>Als JSON-Datei sichern oder auf einem anderen Gerät weiterspielen.</p></section><section className="reset-section"><div><h3>Eine neue Geschichte?</h3><p>Ein Neustart ersetzt deinen bisherigen Spielstand.</p></div><button className="button danger small" onClick={()=>showModal('newgame')}><Icon name="reset" size={15}/>Neues Spiel</button></section></Modal>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{opacity:0,y:16,x:8}} animate={{opacity:1,y:0,x:0}} exit={{opacity:0,y:8}}><span><Icon name="check" size={17}/></span><p>{toast.text}</p><button onClick={()=>setToast(null)} aria-label="Nachricht schliessen"><Icon name="x" size={16}/></button></motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
