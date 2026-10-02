import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid, Store, Boxes, Hammer, Users, ChartNoAxesCombined, Flag, CircleHelp,
  Settings2, ChevronDown, ChevronRight, ChevronLeft, Plus, Minus, X, Check,
  Coins, Star, Play, Pause, Maximize, RotateCcw, ArrowUpRight, Leaf, Layers,
  Cpu, Croissant, Clock3, Sparkles, ShoppingBag, Truck, Zap, Search, Bell,
  Pencil, Volume2, VolumeX, Download, Trash2, ChevronsRight, Eye, Wrench,
  CircleCheck, Package, ShieldCheck, BookOpen, ArrowRight, Sun, LockKeyhole,
  Monitor, Armchair, CreditCard, MoveUpRight, Upload, Menu, Gift, Moon, Palette,
} from 'lucide-react';
import type { ShopKind } from '../game/data';

const iconMap = {
  grid: LayoutGrid, store: Store, boxes: Boxes, hammer: Hammer, users: Users,
  chart: ChartNoAxesCombined, flag: Flag, help: CircleHelp, settings: Settings2,
  down: ChevronDown, right: ChevronRight, left: ChevronLeft, plus: Plus, minus: Minus,
  x: X, check: Check, coins: Coins, star: Star, play: Play, pause: Pause,
  maximize: Maximize, reset: RotateCcw, arrowUp: ArrowUpRight, leaf: Leaf,
  cards: Layers, cpu: Cpu, bread: Croissant, clock: Clock3, sparkles: Sparkles,
  bag: ShoppingBag, truck: Truck, zap: Zap, search: Search, bell: Bell,
  pencil: Pencil, volume: Volume2, mute: VolumeX, download: Download, trash: Trash2,
  fast: ChevronsRight, eye: Eye, wrench: Wrench, done: CircleCheck, package: Package,
  shield: ShieldCheck, book: BookOpen, arrow: ArrowRight, sun: Sun, lock: LockKeyhole,
  monitor: Monitor, chair: Armchair, register: CreditCard, move: MoveUpRight,
  upload: Upload, menu: Menu, gift: Gift,
  staff: Users, shelf: Layers, box: Package, expand: Maximize, moon: Moon, palette: Palette,
};

export type IconName = keyof typeof iconMap;
export function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  const Component = iconMap[name];
  return <Component size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function ShopIcon({ kind, size = 20 }: { kind: ShopKind; size?: number }) {
  return <Icon name={kind === 'tcg' ? 'cards' : kind === 'it' ? 'cpu' : 'bread'} size={size} />;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand">
    <span className="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 22V11l6-3v14M13 12l6-3v13M19 13l6-3v12" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    {!compact && <span>mallside<span className="brand-dot">.</span></span>}
  </div>;
}

export function Progress({ value, color, className = '' }: { value: number; color?: string; className?: string }) {
  return <div className={`progress-track ${className}`}><span style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} /></div>;
}

export function Modal({ open, onClose, title, subtitle, children, wide = false, className = '' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('button, input, select')?.focus(), 80);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open, onClose]);
  return createPortal(<AnimatePresence>{open && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} initial={{ opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.22 }}>
      <div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Schliessen"><Icon name="x" /></button></div>
      <div className="modal-content">{children}</div>
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}