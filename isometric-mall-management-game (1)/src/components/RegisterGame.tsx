import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { getItem, money2 } from '../game/data';
import type { ShopKind } from '../game/data';
import type { QueueCustomer } from '../game/services';
import { BILLS, COINS, changeFor, minimalChange } from '../game/services';
import { Icon } from './Ui';

/** Length of the swipe groove in pixels. */
const SWIPE_TRAVEL = 210;

const cent = (value: number) => Math.round(value * 100);

function DenominationButton({ value, onPick, disabled }: { value: number; onPick: () => void; disabled: boolean }) {
  const isBill = value >= 5;
  return <button type="button" className={`denomination ${isBill ? 'bill' : 'coin'}`} disabled={disabled} onClick={onPick} aria-label={`${money2(value)} herausgeben`}>
    <span>{isBill ? `${value} €` : value >= 1 ? `${value} €` : `${Math.round(value * 100)} ct`}</span>
    <small>{isBill ? 'Schein' : 'Münze'}</small>
  </button>;
}

/** Cash: the customer hands over a note, the player builds the exact change. */
function CashGame({ customer, onPaid, onSkip }: { customer: QueueCustomer; onPaid: (perfect: boolean) => void; onSkip: () => void }) {
  const change = changeFor(customer);
  const [tray, setTray] = useState<number[]>([]);
  const [corrections, setCorrections] = useState(0);
  const [shake, setShake] = useState(false);
  const sum = Math.round(tray.reduce((total, value) => total + cent(value), 0)) / 100;
  const rest = Math.round((change - sum) * 100) / 100;
  const exact = cent(sum) === cent(change);
  const minimal = minimalChange(change);

  const add = (value: number) => {
    if (cent(sum + value) > cent(change)) {
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }
    setTray(previous => [...previous, value]);
  };
  const remove = (index: number) => {
    setCorrections(count => count + 1);
    setTray(previous => previous.filter((_, position) => position !== index));
  };

  const handOver = () => onPaid(exact && tray.length === minimal.length && corrections === 0);

  return <div className="register-game">
    <div className="register-customer">
      <span className="register-avatar" aria-hidden="true"><svg viewBox="0 0 40 46"><g transform="translate(20,44)"><ellipse cx="0" cy="0" rx="12" ry="5" fill="#68768c" opacity=".15" /><path d="M-3 -17l-1 14m9-14l1 14" stroke="#475168" strokeWidth="4.5" strokeLinecap="round" /><path d="M-7 -31l-4 13m18-13l4 13" stroke="#8aa9c4" strokeWidth="5" strokeLinecap="round" /><path d="M-7 -32q7-5 14 0l1 17q-8 4-16 0z" fill="#8aa9c4" /><rect x="8" y="-19" width="9" height="12" rx="1.5" fill="#f2dfba" /><rect x="-2.5" y="-38" width="5" height="7" rx="2" fill="#e6b694" /><ellipse cx="0" cy="-42" rx="7" ry="8" fill="#efc4a3" /><path d="M-7 -42q-1-12 9-9q8 1 5 9l-3-5-6 1z" fill="#59566c" /></g></svg></span>
      <div>
        <span className="eyebrow">BARZAHLUNG</span>
        <strong>Der Kunde gibt {money2(customer.handed)}</strong>
        <p>Rechnung {money2(customer.total)} · gib {money2(change)} Wechselgeld heraus.</p>
      </div>
    </div>
    <div className="cash-layout">
      <section className="cash-dispenser">
        <span className="eyebrow">SCHEINE</span>
        <div className="denomination-row">{BILLS.map(value => <DenominationButton key={value} value={value} onPick={() => add(value)} disabled={cent(sum + value) > cent(change)} />)}</div>
        <span className="eyebrow">MÜNZEN</span>
        <div className="denomination-row">{COINS.map(value => <DenominationButton key={value} value={value} onPick={() => add(value)} disabled={cent(sum + value) > cent(change)} />)}</div>
        <p className="register-note"><Icon name="coins" size={14} />Tippe Scheine und Münzen an, bis das Wechselgeld genau stimmt. Ein Klick auf ein Stück in der Ausgabe nimmt es zurück.</p>
      </section>
      <section className={`cash-tray ${exact ? 'is-exact' : ''} ${shake ? 'is-shaking' : ''}`}>
        <div className="cash-tray-head">
          <span className="eyebrow">WECHSELGELD</span>
          <strong className={rest === 0 ? 'positive' : rest < 0 ? 'negative' : ''}>{rest === 0 ? 'Stimmt genau' : rest > 0 ? `noch ${money2(rest)}` : `${money2(-rest)} zu viel`}</strong>
        </div>
        <div className="cash-tray-target"><strong>{money2(change)}</strong><small>Ziel</small></div>
        <div className="cash-tray-items">
          {tray.length === 0 && <span className="cash-tray-empty">Noch nichts herausgegeben.</span>}
          {tray.map((value, index) => <button type="button" key={`${value}-${index}`} className={`tray-piece ${value >= 5 ? 'bill' : 'coin'}`} onClick={() => remove(index)} aria-label={`${money2(value)} zurücknehmen`}>{value >= 1 ? `${value} €` : `${Math.round(value * 100)} ct`}</button>)}
        </div>
        <div className="cash-tray-foot">
          <span>Ausgegeben: <strong>{money2(sum)}</strong></span>
          {tray.length > 0 && <button type="button" className="text-button" onClick={() => { setCorrections(count => count + 1); setTray([]); }}>Alles zurück</button>}
        </div>
      </section>
    </div>
    <div className="register-actions">
      <span className="register-hint">{exact ? 'Perfekt gezählt – der Kunde freut sich.' : 'Zähle das Wechselgeld passend ab.'}</span>
      <div className="register-action-buttons">
        <button type="button" className="button secondary" title="Der Kunde geht ohne Kauf" onClick={onSkip}>Nicht jetzt</button>
        <button type="button" className="button primary" disabled={!exact} onClick={handOver}><Icon name="coins" size={16} />Wechselgeld geben und kassieren</button>
      </div>
    </div>
  </div>;
}

/** Card: the player pulls the card horizontally through the reader. */
function CardGame({ customer, onPaid, onSkip }: { customer: QueueCustomer; onPaid: (perfect: boolean) => void; onSkip: () => void }) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Ziehe die Karte von links nach rechts durch das Terminal.');
  const drag = useRef<{ id: number; startX: number; startProgress: number } | null>(null);
  const groove = useRef<HTMLDivElement>(null);
  const travel = useRef(SWIPE_TRAVEL);
  const done = useRef(false);
  const swipe = useRef(false);

  const finish = useCallback((perfect: boolean) => {
    if (done.current) return;
    done.current = true;
    setProgress(1);
    onPaid(perfect);
  }, [onPaid]);

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (done.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    travel.current = Math.max(120, (groove.current?.clientWidth ?? SWIPE_TRAVEL) - 104);
    drag.current = { id: event.pointerId, startX: event.clientX, startProgress: progress };
    setMessage('Weiterziehen …');
  };
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const next = Math.max(0, Math.min(1.08, drag.current.startProgress + (event.clientX - drag.current.startX) / travel.current));
    setProgress(next);
    if (next >= 1) finish(true);
  };
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    if (progress < 1) {
      setProgress(0);
      setMessage('Der Streifen muss in einem Zug ganz durchgezogen werden.');
    }
  };

  // Keyboard and touch friendly alternative: hold the arrow key to swipe.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (done.current || event.repeat) return;
      event.preventDefault();
      swipe.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight') return;
      swipe.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!swipe.current || done.current) return;
      setProgress(previous => {
        const next = Math.min(1, previous + .06);
        if (next >= 1) finish(true);
        return next;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [finish]);

  return <div className="register-game">
    <div className="register-customer">
      <span className="register-avatar" aria-hidden="true"><svg viewBox="0 0 40 46"><g transform="translate(20,44)"><ellipse cx="0" cy="0" rx="12" ry="5" fill="#68768c" opacity=".15" /><path d="M-3 -17l-1 14m9-14l1 14" stroke="#475168" strokeWidth="4.5" strokeLinecap="round" /><path d="M-7 -31l-4 13m18-13l4 13" stroke="#bfa6c9" strokeWidth="5" strokeLinecap="round" /><path d="M-7 -32q7-5 14 0l1 17q-8 4-16 0z" fill="#bfa6c9" /><rect x="8" y="-19" width="9" height="12" rx="1.5" fill="#f2dfba" /><rect x="-2.5" y="-38" width="5" height="7" rx="2" fill="#e6b694" /><ellipse cx="0" cy="-42" rx="7" ry="8" fill="#efc4a3" /><path d="M-7 -42q-1-12 9-9q8 1 5 9l-3-5-6 1z" fill="#59566c" /></g></svg></span>
      <div>
        <span className="eyebrow">KARTENZAHLUNG</span>
        <strong>Der Kunde steckt die Karte ins Terminal</strong>
        <p>{money2(customer.total)} werden abgebucht, sobald der Streifen durchgezogen ist.</p>
      </div>
    </div>
    <div className="card-terminal">
      <div className="terminal-screen">
        <span className="eyebrow">TERMINAL</span>
        <strong className={progress >= 1 ? 'positive' : ''}>{progress >= 1 ? 'Zahlung autorisiert' : `${Math.round(progress * 100)} % gelesen`}</strong>
        <small>{message}</small>
      </div>
      <div ref={groove} className={`card-groove ${progress >= 1 ? 'is-done' : ''}`} style={{ '--p': Math.min(1, progress) } as CSSProperties} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="slider" aria-label="Karte durchziehen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} tabIndex={0}>
        <span className="card-groove-track" />
        <span className="card-groove-fill" />
        <span className="bank-card">
          <span className="bank-card-chip" />
          <span className="bank-card-number">•••• 4271</span>
        </span>
      </div>
      <div className="card-terminal-foot">
        <span><Icon name="cpu" size={15} />Mit Maus oder Finger die Karte greifen und nach rechts durchziehen – oder <kbd>→</kbd> gedrückt halten.</span>
      </div>
      <div className="register-action-buttons">
        <button type="button" className="button secondary" title="Der Kunde geht ohne Kauf" onClick={onSkip}>Nicht jetzt</button>
      </div>
    </div>
  </div>;
}

/** The little receipt shown after a successful payment. */
function Receipt({ customer, tip, onNext, onClose }: { customer: QueueCustomer; tip: number; onNext: () => void; onClose: () => void }) {
  return <div className="register-game register-receipt">
    <div className="receipt-paper">
      <span className="eyebrow">KASSENBON</span>
      <ul>
        {customer.lines.map(line => <li key={line.itemId}>
          <span>{line.quantity} × {line.name}</span>
          <strong>{money2(line.price * line.quantity)}</strong>
        </li>)}
        {tip > 0 && <li className="receipt-tip"><span>Trinkgeld für guten Service</span><strong>{money2(tip)}</strong></li>}
      </ul>
      <div className="receipt-total"><span>Bezahlt · {customer.method === 'cash' ? 'Bar' : 'Karte'}</span><strong>{money2(customer.total + tip)}</strong></div>
      {tip > 0 ? <p className="receipt-thanks"><Icon name="sparkles" size={14} />Sauber kassiert – der Kunde lässt ein Trinkgeld da.</p> : <p className="receipt-thanks"><Icon name="check" size={14} />Zahlung abgeschlossen. Der Kunde geht zufrieden weiter.</p>}
    </div>
    <div className="register-actions">
      <span className="register-hint">Die Ware ist vom Regal verschwunden und das Geld liegt in der Kasse.</span>
      <div className="register-action-buttons">
        <button type="button" className="button secondary" onClick={onClose}>Kasse schliessen</button>
        <button type="button" className="button primary" onClick={onNext}><Icon name="arrow" size={16} />Nächster Kunde</button>
      </div>
    </div>
  </div>;
}

export function RegisterGame({ customer, kind, onPaid, onSkip, onNext, onClose }: {
  customer: QueueCustomer;
  kind: ShopKind;
  /** Called as soon as the payment succeeded. */
  onPaid: (perfect: boolean) => { tip: number; earned: number } | null;
  /** The player waves the customer off; they leave without paying. */
  onSkip: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ tip: number; earned: number } | null>(null);
  const paid = (perfect: boolean) => { setResult(onPaid(perfect) ?? { tip: 0, earned: customer.total }); };

  if (result) return <Receipt customer={customer} tip={result.tip} onNext={onNext} onClose={onClose} />;
  return <div className="register-customer-wrap">
    <div className="register-basket">
      <span className="eyebrow">WARENKORB · {customer.label.toUpperCase()}</span>
      <ul>{customer.lines.map(line => <li key={line.itemId}>
        <span className="basket-art">{line.itemId === 'service' ? <Icon name={kind === 'it' ? 'wrench' : kind === 'tcg' ? 'cards' : 'bread'} size={17} /> : getItem(kind, line.itemId)?.name.split(' ')[0]}</span>
        <span>{line.quantity} × {line.name}</span>
        <strong>{money2(line.price * line.quantity)}</strong>
      </li>)}</ul>
      <div className="basket-total"><span>Zu zahlen</span><strong>{money2(customer.total)}</strong></div>
    </div>
    {customer.method === 'cash' ? <CashGame customer={customer} onPaid={paid} onSkip={onSkip} /> : <CardGame customer={customer} onPaid={paid} onSkip={onSkip} />}
  </div>;
}
