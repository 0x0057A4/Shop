export type ShopKind = 'tcg' | 'it' | 'bakery';
export type Page = 'overview' | 'production' | 'inventory' | 'furnishing' | 'staff' | 'finances' | 'quests';
export type FurnitureKind = 'register' | 'shelf' | 'decor' | 'workbench';

export interface Item {
  id: string;
  name: string;
  category: 'material' | 'intermediate' | 'product';
  price: number;
  color: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, number>;
  output: string;
  quantity: number;
  duration: number;
  intermediate?: boolean;
}

export interface TradingCard {
  id: string;
  name: string;
  rarity: 'Gewoehnlich' | 'Selten' | 'Episch' | 'Legendaer';
  value: number;
  element: 'fire' | 'forest' | 'water' | 'crystal' | 'moon';
  listed: boolean;
  sold: boolean;
}

export interface ProductionJob {
  id: string;
  recipeId: string;
  batch: number;
  progress: number;
  duration: number;
  repairId?: string;
}

export interface RepairOrder {
  id: string;
  device: string;
  problem: string;
  reward: number;
  duration: number;
  chips: number;
  status: 'available' | 'queued' | 'done';
}

export interface Shop {
  owned: boolean;
  name: string;
  popularity: number;
  stock: Record<string, number>;
  furniture: Record<FurnitureKind, number>;
  queue: ProductionJob[];
  cards: TradingCard[];
  orders: RepairOrder[];
  staff: number;
  skill: number;
  price: number;
  open: boolean;
  revenue: number;
  sold: number;
  produced: number;
  autoRecipes: string[];
  dailyRevenue: number;
  hourlyRevenue: number[];
}

export interface GameEvent {
  id: string;
  text: string;
  detail: string;
  kind: 'sale' | 'production' | 'info' | 'build';
  time: string;
}

export interface GameState {
  version: number;
  hasChosen: boolean;
  selected: ShopKind;
  coins: number;
  day: number;
  minute: number;
  elapsed: number;
  speed: number;
  paused: boolean;
  sound: boolean;
  shops: Record<ShopKind, Shop>;
  events: GameEvent[];
  totalRevenue: number;
  totalExpenses: number;
  totalSold: number;
  opened: number;
  built: number;
  completedProductions: number;
  repaired: number;
  goalClaimed: boolean;
  savedAt: number;
}

export interface ShopConfig {
  label: string;
  defaultName: string;
  tagline: string;
  description: string;
  specialty: string;
  color: string;
  light: string;
  expansionCost: number;
  starterStock: Record<string, number>;
  items: Item[];
  recipes: Recipe[];
  furniture: Record<FurnitureKind, { name: string; description: string; cost: number; max: number }>;
}

export const SHOP_ORDER: ShopKind[] = ['tcg', 'it', 'bakery'];

export const SHOPS: Record<ShopKind, ShopConfig> = {
  tcg: {
    label: 'TCG-Laden', defaultName: 'Card Corner', tagline: 'Kleine Packs. Grosse Schätze.',
    description: 'Öffne Booster, entdecke seltene Karten und werde zum Treffpunkt für Sammler.',
    specialty: 'Packs & Einzelkarten', color: '#8b6bd1', light: '#f0eafb', expansionCost: 5800,
    starterStock: { booster: 18, single: 8, sleeves: 24, paper: 40, ink: 24, foil: 20, plastic: 20, graded: 0, deck: 0 },
    items: [
      { id: 'booster', name: 'Nova-Booster', category: 'product', price: 18, color: '#8b6bd1' },
      { id: 'single', name: 'Einzelkarte', category: 'product', price: 12, color: '#efac6c' },
      { id: 'sleeves', name: 'Kartenhüllen', category: 'product', price: 8, color: '#7cbcb1' },
      { id: 'graded', name: 'Grading-Karte', category: 'product', price: 95, color: '#d3a74d' },
      { id: 'deck', name: 'Turnierdeck', category: 'product', price: 120, color: '#a18dca' },
      { id: 'paper', name: 'Kartenrohlinge', category: 'material', price: 2, color: '#a6a6b5' },
      { id: 'ink', name: 'Druckfarbe', category: 'material', price: 3, color: '#908bb7' },
      { id: 'foil', name: 'Hologrammfolie', category: 'material', price: 4, color: '#cea158' },
      { id: 'plastic', name: 'Kunststoff', category: 'material', price: 2, color: '#75afae' },
    ],
    recipes: [
      { id: 'boosters', name: 'Nova-Booster', description: 'Drucken, veredeln und zu einem neuen Pack versiegeln.', inputs: { paper: 3, ink: 1, foil: 1 }, output: 'booster', quantity: 4, duration: 35 },
      { id: 'sleeves', name: 'Kartenhüllen', description: 'Schützende Hüllen für die wertvollsten Fundstücke.', inputs: { plastic: 2, paper: 1 }, output: 'sleeves', quantity: 6, duration: 24 },
      { id: 'grading', name: 'Karten-Grading', description: 'Prüfen, bewerten und in einer Sammlerkapsel versiegeln.', inputs: { single: 1, sleeves: 2, foil: 1 }, output: 'graded', quantity: 1, duration: 50 },
      { id: 'deck', name: 'Turnierdeck', description: 'Ein spielbereites Deck aus ausgewählten Einzelkarten.', inputs: { single: 5, sleeves: 4, paper: 2 }, output: 'deck', quantity: 1, duration: 60 },
    ],
    furniture: {
      register: { name: 'Smarte Kasse', description: 'Schneller kassieren. Mehr zufriedene Sammler.', cost: 380, max: 3 },
      shelf: { name: 'Sammlerregal', description: '+40 Lagerplätze und +3 Beliebtheit.', cost: 260, max: 5 },
      decor: { name: 'Pflanzen & Neon', description: 'Ein bisschen Atmosphäre. +6 Beliebtheit.', cost: 180, max: 4 },
      workbench: { name: 'Sortiertisch', description: 'Ein weiterer Platz für parallele Produktion.', cost: 450, max: 3 },
    },
  },
  it: {
    label: 'IT-Komponenten', defaultName: 'Byte Works', tagline: 'Gute Technik. In besten Händen.',
    description: 'Baue eigene PCs, verkaufe Komponenten und bringe defekte Geräte wieder zum Laufen.',
    specialty: 'Komponenten & Reparaturen', color: '#599bba', light: '#e7f1f8', expansionCost: 6800,
    starterStock: { chip: 30, copper: 30, circuit: 24, casing: 10, motherboard: 2, ram: 12, pc: 2, notebook: 3 },
    items: [
      { id: 'ram', name: 'RAM-Kit 32 GB', category: 'product', price: 65, color: '#76b4b1' },
      { id: 'motherboard', name: 'Mainboard', category: 'intermediate', price: 110, color: '#648f9f' },
      { id: 'pc', name: 'Gaming-PC', category: 'product', price: 580, color: '#7491c7' },
      { id: 'notebook', name: 'Refurbished-Laptop', category: 'product', price: 290, color: '#90a3b9' },
      { id: 'chip', name: 'Mikrochips', category: 'material', price: 8, color: '#8197a7' },
      { id: 'copper', name: 'Kupferleitungen', category: 'material', price: 3, color: '#bf916e' },
      { id: 'circuit', name: 'Leiterplatten', category: 'material', price: 6, color: '#70a68e' },
      { id: 'casing', name: 'Gehäuse', category: 'material', price: 18, color: '#a0aabd' },
    ],
    recipes: [
      { id: 'board', name: 'Mainboard', description: 'Leiterplatte bestücken, verlöten und auf Funktion prüfen.', inputs: { circuit: 3, copper: 2 }, output: 'motherboard', quantity: 1, duration: 40, intermediate: true },
      { id: 'ram', name: 'RAM-Kit 32 GB', description: 'Chips montieren und einen kurzen Belastungstest ausführen.', inputs: { chip: 2, copper: 1 }, output: 'ram', quantity: 2, duration: 30 },
      { id: 'pc', name: 'Gaming-PC', description: 'Komponenten zusammenbauen, System installieren, testen.', inputs: { motherboard: 1, ram: 2, casing: 1 }, output: 'pc', quantity: 1, duration: 75 },
      { id: 'notebook', name: 'Refurbished-Laptop', description: 'Ein neues Innenleben für ein zweites Geräteleben.', inputs: { casing: 1, chip: 2, copper: 1 }, output: 'notebook', quantity: 1, duration: 60 },
    ],
    furniture: {
      register: { name: 'Service-Kasse', description: 'Eine schnelle Anlaufstelle für deine Kunden.', cost: 420, max: 3 },
      shelf: { name: 'Komponentenregal', description: '+40 Lagerplätze und +3 Beliebtheit.', cost: 320, max: 5 },
      decor: { name: 'RGB & Grün', description: 'Mehr Atmosphäre. +6 Beliebtheit.', cost: 220, max: 4 },
      workbench: { name: 'Reparaturbank', description: 'Ein zusätzlicher Produktions- und Reparaturplatz.', cost: 550, max: 3 },
    },
  },
  bakery: {
    label: 'Bäckerei', defaultName: 'Butter & Crumb', tagline: 'Frisch gebacken. Mit viel Liebe.',
    description: 'Vom ersten Teig bis zum warmen Croissant: Deine Backstube arbeitet im Hintergrund.',
    specialty: 'Teige & frische Backwaren', color: '#d69b62', light: '#fbf0e3', expansionCost: 4800,
    starterStock: { flour: 35, butter: 20, yeast: 14, sugar: 20, berries: 12, dough: 8, bread: 16, croissant: 18, cake: 4 },
    items: [
      { id: 'bread', name: 'Landbrot', category: 'product', price: 7, color: '#bd956c' },
      { id: 'croissant', name: 'Buttercroissant', category: 'product', price: 5, color: '#dba261' },
      { id: 'cake', name: 'Beerentörtchen', category: 'product', price: 14, color: '#c98491' },
      { id: 'dough', name: 'Grundteig', category: 'intermediate', price: 3, color: '#deca9f' },
      { id: 'flour', name: 'Weizenmehl', category: 'material', price: 1, color: '#cfbea3' },
      { id: 'butter', name: 'Butter', category: 'material', price: 2, color: '#d8b669' },
      { id: 'yeast', name: 'Hefe', category: 'material', price: 1, color: '#bcaa99' },
      { id: 'sugar', name: 'Zucker', category: 'material', price: 1, color: '#a6b8ba' },
      { id: 'berries', name: 'Frische Beeren', category: 'material', price: 3, color: '#be8b9b' },
    ],
    recipes: [
      { id: 'dough', name: 'Grundteig', description: 'Zutaten mischen, kneten und den Teig ruhen lassen.', inputs: { flour: 3, yeast: 1, butter: 1 }, output: 'dough', quantity: 4, duration: 25, intermediate: true },
      { id: 'bread', name: 'Landbrot', description: 'Rustikalen Teig formen und mit knuspriger Kruste backen.', inputs: { flour: 2, yeast: 1 }, output: 'bread', quantity: 4, duration: 35 },
      { id: 'croissant', name: 'Buttercroissant', description: 'Grundteig tourieren, rollen und goldbraun backen.', inputs: { dough: 2, butter: 2 }, output: 'croissant', quantity: 6, duration: 40 },
      { id: 'cake', name: 'Beerentörtchen', description: 'Böden backen, Creme aufschlagen und mit frischen Beeren garnieren.', inputs: { flour: 2, butter: 2, sugar: 3, berries: 2 }, output: 'cake', quantity: 2, duration: 60 },
    ],
    furniture: {
      register: { name: 'Bäckerei-Kasse', description: 'Damit warme Backwaren schnell bei den Kunden sind.', cost: 320, max: 3 },
      shelf: { name: 'Backwaren-Auslage', description: '+40 Lagerplätze und +3 Beliebtheit.', cost: 240, max: 5 },
      decor: { name: 'Blumen & Kreidetafel', description: 'Ein einladender Duft verdient ein schönes Umfeld. +6 Beliebtheit.', cost: 160, max: 4 },
      workbench: { name: 'Backstation', description: 'Mehr Platz zum Kneten, Backen und Verzieren.', cost: 480, max: 3 },
    },
  },
};

export const CARD_NAMES = ['Glutdrache', 'Mooswächter', 'Gezeitengeist', 'Kristallfuchs', 'Mondschwinge'];
export const RARITY_LABELS: Record<TradingCard['rarity'], string> = {
  Gewoehnlich: 'Gewöhnlich', Selten: 'Selten', Episch: 'Episch', Legendaer: 'Legendär',
};

export const money = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n) + ' €';
export const number = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
export const clock = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${Math.floor(minute % 60).toString().padStart(2, '0')}`;
export const getItem = (kind: ShopKind, id: string) => SHOPS[kind].items.find(item => item.id === id);