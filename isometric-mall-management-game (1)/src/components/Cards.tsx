import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { GameState, TradingCard } from '../game/data';
import { RARITY_LABELS, money } from '../game/data';
import { Icon } from './Ui';

const colors = {
  fire: { sky: '#4d325d', bottom: '#ce786b', body: '#ec9670', light: '#ffd79c', ink: '#82415b' },
  forest: { sky: '#295b59', bottom: '#95b789', body: '#9ec285', light: '#e3e6b1', ink: '#456854' },
  water: { sky: '#344c7d', bottom: '#86c6c5', body: '#9ce0d5', light: '#e4f6ee', ink: '#437ca0' },
  crystal: { sky: '#574176', bottom: '#b696d0', body: '#ddc6ee', light: '#fff0da', ink: '#826299' },
  moon: { sky: '#303450', bottom: '#8795bc', body: '#b3aedb', light: '#f1e8d2', ink: '#655c91' },
};

export function CreatureArt({ element, className = '' }: { element: TradingCard['element']; className?: string }) {
  const unique = useId().replace(/:/g, '');
  const c = colors[element];
  return <svg className={className} viewBox="0 0 180 190" aria-label={`${element}-Sammelkartenillustration`} role="img">
    <defs><linearGradient id={`sky${unique}`} x2="0" y2="1"><stop stopColor={c.sky}/><stop offset="1" stopColor={c.bottom}/></linearGradient><radialGradient id={`glow${unique}`}><stop stopColor={c.light} stopOpacity=".65"/><stop offset="1" stopColor={c.light} stopOpacity="0"/></radialGradient></defs>
    <rect width="180" height="190" fill={`url(#sky${unique})`} />
    <circle cx="90" cy="84" r="78" fill={`url(#glow${unique})`} />
    <circle cx="144" cy="32" r="17" fill={c.light} opacity=".8" />
    {[[20,24],[50,45],[151,79],[132,15],[20,95],[73,19],[160,127]].map(([x,y],i) => <path key={i} d={`M${x-3} ${y}h6m-3-3v6`} stroke={c.light} strokeWidth="1.5" opacity=".8" />)}
    <path d="M0 159l26-35 20 18 32-29 24 36 30-22 48 31v32H0z" fill={c.sky} opacity=".45" /><path d="M0 178q45-30 89-9t91-10v31H0z" fill={c.ink} opacity=".55" />
    {element === 'fire' && <g stroke={c.ink} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M77 103L31 74l7 41-17 12 41 8m52-34l41-26-3 32 14 21-40 5" fill="#c66b7d" />
      <path d="M107 147q49 19 45-17q-3-15-20-13q5 15-9 12" fill={c.body} />
      <ellipse cx="91" cy="128" rx="33" ry="37" fill={c.body}/><ellipse cx="87" cy="132" rx="19" ry="27" fill={c.light} stroke="none" />
      <path d="M69 70l-7-21 23 9m20 1l18-15-3 29" fill={c.light}/><path d="M63 91q-2-38 33-38q37 3 32 35l-13 23H76z" fill={c.body}/>
      <ellipse cx="81" cy="83" rx="6" ry="9" fill={c.light}/><ellipse cx="106" cy="82" rx="6" ry="9" fill={c.light}/><path d="M84 99q11 8 19-2" fill="none"/><path d="M81 83v4m25-6v4" strokeWidth="3.5"/>
      <path d="M64 144l-9 17h25m24-17l12 17H96" fill={c.body}/><path d="M66 118l-19 10m72-11l15 10" fill="none" strokeWidth="9" stroke={c.body}/>
      <path d="M150 123q-15-19 0-31q-1 15 10 18q9 10-3 19z" fill="#ffd590" stroke="none" />
    </g>}
    {element === 'forest' && <g stroke={c.ink} strokeWidth="2.3" strokeLinejoin="round">
      <path d="M73 68q-36-15-37-43q28 3 43 32m21 11q35-11 36-40q-24 5-39 27" fill="#8fb97d"/><path d="M90 59q-12-27 2-40q15 17 5 39" fill="#c7d495"/>
      <ellipse cx="88" cy="118" rx="44" ry="45" fill={c.body}/><path d="M49 98q0-48 41-46q42-2 45 45l-12 28H59z" fill={c.body}/><ellipse cx="87" cy="118" rx="29" ry="29" fill={c.light} stroke="none" />
      <ellipse cx="70" cy="88" rx="5" ry="8" fill={c.ink}/><ellipse cx="105" cy="87" rx="5" ry="8" fill={c.ink}/><path d="M79 102q8 7 16-1" fill="none"/><circle cx="57" cy="100" r="7" fill="#deaa91" stroke="none"/><circle cx="119" cy="98" r="7" fill="#deaa91" stroke="none"/>
      <path d="M53 139l-12 23h32m42-24l13 24H98" fill={c.body}/><path d="M48 113q-30-15-30 7q8 10 28 13m84-23q30-15 32 3q-6 17-27 21" fill={c.body}/><path d="M83 136l8-16 10 17-10 14z" fill="#b4be71" stroke="none"/>
    </g>}
    {element === 'water' && <g stroke={c.ink} strokeWidth="2.2" strokeLinejoin="round">
      <path d="M65 126q-34 22-37 0q-7 35 30 31m60-27q31 27 37-9q11 36-28 38" fill="none" stroke={c.light} strokeWidth="6"/>
      <path d="M57 79l-24-8 14 30m73-23l27-13-11 39" fill={c.body}/><path d="M57 76q7-44 40-36q35 6 31 42l-4 51q-2 28-30 15q-13 22-26 0q-29 10-27-17z" fill={c.body}/>
      <path d="M71 57q23-18 41 6" fill="none" stroke={c.light} strokeWidth="9"/><ellipse cx="72" cy="85" rx="6" ry="9" fill={c.ink}/><ellipse cx="110" cy="83" rx="6" ry="9" fill={c.ink}/><path d="M82 99q9 8 18-2" fill="none"/><circle cx="74" cy="82" r="2" fill="#fff" stroke="none"/><circle cx="111" cy="80" r="2" fill="#fff" stroke="none"/>
      <ellipse cx="91" cy="121" rx="20" ry="18" fill={c.light} stroke="none"/><path d="M84 43l10-22 6 24" fill={c.light}/>
    </g>}
    {element === 'crystal' && <g stroke={c.ink} strokeWidth="2.3" strokeLinejoin="round">
      <path d="M107 136q63-10 43-57q-1 28-33 23q-21 5-10 34" fill={c.light}/><ellipse cx="82" cy="129" rx="32" ry="31" fill={c.body}/>
      <path d="M54 68L44 31l32 25m28 5l32-28-8 41" fill={c.body}/><path d="M52 44l7 23 10-10m41 3l15-16-5 24" fill="#f4b8c2" stroke="none"/><path d="M48 91q-3-39 42-37q41 0 43 37l-42 27z" fill={c.body}/>
      <path d="M53 86l29 16 10 17 11-18 25-16-12 24-24 11-30-14z" fill={c.light} stroke="none"/><path d="M70 86l8 4m28 0l8-5" fill="none" strokeWidth="3"/><path d="M86 103h12l-6 5z" fill={c.ink}/><path d="M85 72l7-13 8 12-8 10z" fill="#fff2ad"/>
      <path d="M63 145l-11 18h24m24-16l11 16H89" fill={c.body}/><path d="M128 155l11-25 11 24-12 17zM24 152l7-18 8 18-8 10z" fill="#d9b8ef"/>
    </g>}
    {element === 'moon' && <g stroke={c.ink} strokeWidth="2.3" strokeLinejoin="round">
      <path d="M62 112q-39-10-38 31q27 14 45 3m47-31q40-13 39 28q-18 11-44 1" fill={c.body}/><ellipse cx="89" cy="119" rx="39" ry="44" fill={c.body}/><path d="M54 76l-6-32 30 16m25 0l28-17-4 35" fill={c.body}/>
      <path d="M53 90q-10-43 38-39q44-2 41 37l-13 26H66z" fill={c.body}/><ellipse cx="74" cy="83" rx="18" ry="21" fill={c.light}/><ellipse cx="109" cy="82" rx="18" ry="21" fill={c.light}/><ellipse cx="76" cy="84" rx="7" ry="11" fill={c.ink}/><ellipse cx="107" cy="83" rx="7" ry="11" fill={c.ink}/><circle cx="78" cy="80" r="3" fill="#fff" stroke="none"/><circle cx="109" cy="79" r="3" fill="#fff" stroke="none"/><path d="M84 100h13l-7 10z" fill="#e2af76"/>
      <ellipse cx="90" cy="129" rx="22" ry="25" fill={c.light} stroke="none"/><path d="M73 163v7m7-6v6m22-6v6m6-7v7" stroke="#d7b478" strokeWidth="3"/><path d="M86 123l5 8 9 1-7 6 1 9-7-5-7 3 2-8-5-6 8-1z" fill="#c7b3e0" stroke="none"/>
    </g>}
  </svg>;
}

export function TradingCardView({ card, index = 0, children }: { card: TradingCard; index?: number; children?: ReactNode }) {
  return <motion.div className={`trading-card rarity-${card.rarity.toLowerCase()} ${card.sold ? 'card-sold' : ''}`} initial={{ opacity: 0, rotateY: 95, y: 20 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} transition={{ delay: index * .13, duration: .48, ease: 'easeOut' }}>
    <div className="card-top"><span>NOVA</span><Icon name={card.rarity === 'Legendaer' ? 'star' : 'sparkles'} size={12} /></div>
    <CreatureArt element={card.element} />
    <div className="card-info"><strong>{card.name}</strong><span>{RARITY_LABELS[card.rarity]}<b>{money(card.value)}</b></span></div>
    {children}
  </motion.div>;
}

export function PackOpening({ game, cards, onOpen, onManage, onNext }: { game: GameState; cards: TradingCard[]; onOpen: () => void; onManage: (ids: string[], action: 'sell' | 'list') => void; onNext: () => void }) {
  const currentCards = cards.map(card => game.shops.tcg.cards.find(c => c.id === card.id) || card);
  const available = currentCards.filter(c => !c.sold);
  const unlisted = available.filter(c => !c.listed);
  return cards.length === 0 ? <div className="pack-opening-intro">
    <div className="pack-aura" />
    <motion.button className="booster-pack" onClick={onOpen} disabled={!game.hasChosen || game.shops.tcg.stock.booster < 1} aria-label="Nova-Booster öffnen" animate={{ y: [0,-9,0], rotate: [-3,0,-3] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
      <div className="pack-ridge" /><span className="pack-brand">NOVA<span>TRADING CARD GAME</span></span><div className="pack-emblem"><Icon name="zap" size={65} strokeWidth={1.3} /></div><strong>ORIGINS</strong><span className="pack-caption">A NEW STORY AWAITS</span><div className="pack-bottom">5 KARTEN · 1 ENTDECKUNG</div><div className="pack-ridge bottom" />
    </motion.button>
    <h3>Was steckt in deinem nächsten Pack?</h3><p>Fünf Karten. Mindestens eine seltene Entdeckung.<br />Sammeln, ins Regal stellen oder direkt verkaufen.</p>
    <button className="button primary" onClick={onOpen} disabled={!game.hasChosen || game.shops.tcg.stock.booster < 1}><Icon name="sparkles" size={17} />{game.shops.tcg.stock.booster ? 'Pack öffnen' : 'Keine Packs auf Lager'}<Icon name="arrow" size={16} /></button>
    <span className="pack-stock">{game.shops.tcg.stock.booster} Nova-Booster im Lager · verbraucht 1 Pack</span>
  </div> : <div className="pack-results">
    <div className="reveal-caption"><Icon name="sparkles" size={19} /><span>Fünf neue Geschichten für dein Regal.</span><strong>{money(currentCards.reduce((n,c) => n+c.value,0))} Pack-Wert</strong></div>
    <div className="cards-reveal">{currentCards.map((card,index) => <TradingCardView key={card.id} card={card} index={index}><div className="card-actions">{card.sold ? <span><Icon name="check" size={13} /> Verkauft</span> : card.listed ? <span><Icon name="store" size={13} /> Im Regal</span> : <button onClick={() => onManage([card.id], 'list')}><Icon name="plus" size={13} /> Ins Regal</button>}</div></TradingCardView>)}</div>
    <p className="pack-results-hint"><Icon name="eye" size={15} />Karten im Regal werden automatisch von deinen Kunden gekauft.</p>
    <div className="modal-actions"><button className="button primary" disabled={!unlisted.length} onClick={() => onManage(unlisted.map(c => c.id), 'list')}><Icon name="store" size={16} />Alle ins Regal</button><button className="button secondary" disabled={!available.length} onClick={() => onManage(available.map(c => c.id), 'sell')}>Verkaufen · {money(available.reduce((n,c) => n+c.value,0))}</button><button className="text-button next-pack" onClick={onNext}>Nächstes Pack<Icon name="arrow" size={16} /></button></div>
  </div>;
}