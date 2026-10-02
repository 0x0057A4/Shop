import { CARD_NAMES, DEFAULT_SHOP_COLORS, FLOOR_COLORS, SHELF_CAPACITY, SHELF_UPGRADE_COST, SHOPS, SHOP_EXPANSIONS, SHOP_ORDER, STAFF_HIRE_COST, STAFF_WAGE, WALL_COLORS, clock, expansionTiles, floorGridFor, getItem, money } from './data';
import type { FurnitureKind, GameState, Placement, RepairOrder, ShelfTier, Shop, ShopColorPart, ShopColors, ShopKind, StaffRole, Theme, TradingCard } from './data';
import { gridOf, normalizeLayout, piecesOf, placementFits, placeOf } from './layout';
import type { QueueCustomer } from './services';

export const SAVE_KEY = 'mallside-save-v1';
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function makeOrders(): RepairOrder[] {
  return [
    { id: id(), device: 'Office-Notebook', problem: 'Defekter Arbeitsspeicher', reward: 195, duration: 28, chips: 1, status: 'available' },
    { id: id(), device: 'Gaming-PC', problem: 'Startet nicht mehr', reward: 340, duration: 45, chips: 2, status: 'available' },
    { id: id(), device: 'Ultrabook', problem: 'Überhitzt im Betrieb', reward: 260, duration: 36, chips: 1, status: 'available' },
  ];
}

function makeShop(kind: ShopKind): Shop {
  const shop: Shop = {
    owned: kind === 'tcg', name: SHOPS[kind].defaultName, popularity: 42,
    stock: { ...SHOPS[kind].starterStock }, furniture: { register: 1, shelf: 2, decor: 1, workbench: 1 },
    queue: [], cards: [], orders: kind === 'it' ? makeOrders() : [], staff: 0, skill: 0,
    price: 1, open: true, revenue: 0, sold: 0, produced: 0, autoRecipes: [], dailyRevenue: 0, hourlyRevenue: Array(12).fill(0),
    layout: {},
    staffRoles: [],
    expansions: 0,
    shelfTiers: Array.from({ length: 2 }, () => 1 as ShelfTier),
    colors: { ...DEFAULT_SHOP_COLORS[kind] },
  };
  shop.layout = normalizeLayout(shop);
  return shop;
}

export function newGame(kind: ShopKind = 'tcg', chosen = false): GameState {
  const shops = { tcg: makeShop('tcg'), it: makeShop('it'), bakery: makeShop('bakery') };
  SHOP_ORDER.forEach(k => { shops[k].owned = k === kind; });
  return {
    version: 1, hasChosen: chosen, selected: kind, coins: 12480, day: 1, minute: 540,
    elapsed: 0, speed: 1, paused: false, sound: false, theme: 'light', shops,
    events: [{ id: id(), text: chosen ? `${SHOPS[kind].defaultName} hat geöffnet` : 'Ein neuer Anfang', detail: chosen ? 'Dein Einkaufsimperium beginnt genau hier.' : 'Deine erste Ladenfläche wartet auf dich.', kind: 'info', time: '09:00' }],
    totalRevenue: 0, totalExpenses: 0, totalSold: 0, opened: 0, built: 0,
    completedProductions: 0, repaired: 0, goalClaimed: false, savedAt: Date.now(),
  };
}

export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const save = JSON.parse(raw) as GameState;
      SHOP_ORDER.forEach(kind => {
        if (save.shops?.[kind]) {
          save.shops[kind].produced ??= 0;
          save.shops[kind].autoRecipes ??= [];
          save.shops[kind].expansions ??= 0;
          save.shops[kind].staffRoles ??= Array.from({ length: save.shops[kind].staff || 0 }, () => 'register' as StaffRole);
          save.shops[kind].shelfTiers ??= Array.from({ length: save.shops[kind].furniture?.shelf || 0 }, () => 1 as ShelfTier);
          save.shops[kind].colors = { ...DEFAULT_SHOP_COLORS[kind], ...(save.shops[kind].colors || {}) };
          SHOPS[kind].items.forEach(item => { save.shops[kind].stock[item.id] ??= SHOPS[kind].starterStock[item.id] || 0; });
        }
      });
      save.theme = save.theme === 'dark' ? 'dark' : 'light';
      if (isValidSave(save)) {
        normalizeGame(save);
        const away = Math.max(0, Math.min(300, Math.floor((Date.now() - save.savedAt) / 1000)));
        const progressed = advance(save, away * save.speed);
        if (away >= 15 && save.hasChosen && !save.paused) addEvent(progressed, 'Schön, dass du wieder da bist.', `Dein Team hat ${away} Sekunden im Hintergrund weitergearbeitet.`);
        progressed.savedAt = Date.now();
        return progressed;
      }
    }
  } catch { /* A blocked or outdated local save should not prevent playing. */ }
  return newGame();
}

export function isValidSave(input: unknown): input is GameState {
  try { return validSaveShape(input); }
  catch { return false; }
}

/**
 * Makes a loaded or imported save playable: fills in missing furniture positions
 * and repairs arrangements that no longer fit the current shop floor.
 */
/** Every task a staff member can take over, in the order of the staff page. */
export const STAFF_ROLE_LIST: { id: StaffRole; label: string; short: string; description: string }[] = [
  { id: 'register', label: 'Kasse', short: 'bedient die Schlange', description: 'Nimmt wartenden Kunden das Geld ab, auch wenn du gerade nicht an der Kasse stehst.' },
  { id: 'stock', label: 'Lageristin', short: 'bestellt Rohstoffe nach', description: 'Kauft fehlende Rohstoffe automatisch nach, damit die Produktion weiterläuft.' },
  { id: 'refill', label: 'Auffüllen', short: 'hält die Auslage voll', description: 'Räumt Ware in die Regale, zeigt Stapel in der Auslage und lässt die Beliebtheit langsam steigen.' },
];

export const staffRole = (shop: Shop, index: number): StaffRole => shop.staffRoles?.[index] ?? 'register';
export const hasRole = (shop: Shop, role: StaffRole) => (shop.staffRoles || []).includes(role);
export const rolesOf = (shop: Shop) => Array.from({ length: shop.staff }, (_, index) => staffRole(shop, index));
export const shelfTier = (shop: Shop, index: number): ShelfTier => (shop.shelfTiers?.[index] === 2 ? 2 : 1);
export const shelfTierCount = (shop: Shop, tier: ShelfTier) => Array.from({ length: shop.furniture.shelf }, (_, index) => shelfTier(shop, index)).filter(value => value === tier).length;
export const expansionStep = (shop: Shop) => SHOP_EXPANSIONS[Math.min(shop.expansions || 0, SHOP_EXPANSIONS.length - 1)];
/** The floor of a shop as text, e.g. "12 × 8 Kacheln". */
export const floorLabel = (shop: Shop) => { const grid = floorGridFor(shop.expansions || 0); return `${grid.w} × ${grid.h} Kacheln`; };
export const nextExpansion = (shop: Shop) => (shop.expansions || 0) < SHOP_EXPANSIONS.length ? SHOP_EXPANSIONS[shop.expansions || 0] : null;
export const shelfUpgradeCost = (shop: Shop, index: number) => SHELF_UPGRADE_COST + 250 * shelfTierCount(shop, 2) + 250 * index;

/** Keeps saved games valid: roles, enlargements and shelf upgrades get defaults. */
export function normalizeShop(shop: Shop) {
  shop.expansions = Number.isFinite(shop.expansions) ? Math.max(0, Math.min(SHOP_EXPANSIONS.length, Math.floor(shop.expansions))) : 0;
  shop.staff = Math.max(0, Math.min(3, Math.round(Number.isFinite(shop.staff) ? shop.staff : 0)));
  const savedRoles = Array.isArray(shop.staffRoles) ? shop.staffRoles : [];
  shop.staffRoles = Array.from({ length: shop.staff }, (_, index) => STAFF_ROLE_LIST.some(role => role.id === savedRoles[index]) ? savedRoles[index] as StaffRole : 'register');
  const tiers = Array.isArray(shop.shelfTiers) ? shop.shelfTiers : [];
  shop.shelfTiers = Array.from({ length: shop.furniture.shelf }, (_, index) => (tiers[index] === 2 ? 2 : 1) as ShelfTier);
  shop.colors = normalizeColors(shop.colors);
}

const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
/** Falls back to the shop's default colours when a save contains nonsense. */
export function normalizeColors(colors: Partial<ShopColors> | undefined, fallback: ShopColors = DEFAULT_SHOP_COLORS.tcg): ShopColors {
  return {
    wall: isHex(colors?.wall) ? colors!.wall : fallback.wall,
    floor: isHex(colors?.floor) ? colors!.floor : fallback.floor,
  };
}

/** Every colour the player can pick for walls or floor. */
export const colorChoices = (part: ShopColorPart) => part === 'wall' ? WALL_COLORS : FLOOR_COLORS;

/** Looking for the pretty name of a colour choice. */
export const colorName = (part: ShopColorPart, value: string) =>
  colorChoices(part).find(entry => entry.value.toLowerCase() === value.toLowerCase())?.label || 'Eigene Farbe';

/** Repaints the walls or the floor of a shop. */
export function setShopColor(game: GameState, kind: ShopKind, part: ShopColorPart, value: string): GameState {
  const shop = game.shops[kind];
  if (!isHex(value) || shop.colors?.[part] === value) return game;
  if (!colorChoices(part).some(entry => entry.value.toLowerCase() === value.toLowerCase())) return game;
  const next = structuredClone(game);
  next.shops[kind].colors = { ...normalizeColors(next.shops[kind].colors, DEFAULT_SHOP_COLORS[kind]), [part]: value };
  const label = colorName(part, value);
  addEvent(next, part === 'wall' ? `Wände in ${label}` : `Boden in ${label}`, part === 'wall' ? 'Dein Laden hat einen neuen Anstrich bekommen.' : 'Der Verkaufsraum liegt in einer neuen Farbe.', 'build');
  return next;
}

/** Switches the whole interface between light and dark. */
export function setTheme(game: GameState, theme: Theme): GameState {
  if (game.theme === theme) return game;
  return { ...game, theme };
}

export function normalizeGame(game: GameState): GameState {
  SHOP_ORDER.forEach(kind => {
    const shop = game.shops?.[kind];
    if (!shop) return;
    normalizeShop(shop);
    shop.layout = normalizeLayout(shop, shop.layout);
  });
  return game;
}

/** Hires a staff member with a fixed task; the shop pays the signing fee. */
export function hireStaff(game: GameState, kind: ShopKind, role: StaffRole): GameState {
  const shop = game.shops[kind];
  if (!game.hasChosen || !shop.owned || shop.staff >= 3 || game.coins < STAFF_HIRE_COST) return game;
  const next = structuredClone(game);
  const target = next.shops[kind];
  next.coins -= STAFF_HIRE_COST;
  next.totalExpenses += STAFF_HIRE_COST;
  target.staff += 1;
  target.staffRoles = [...(target.staffRoles || []), role];
  const roleInfo = STAFF_ROLE_LIST.find(entry => entry.id === role)!;
  addEvent(next, `Neue Mitarbeiterin: ${roleInfo.label}`, `${roleInfo.description} Kosten: ${STAFF_HIRE_COST} € Einstellung, ${STAFF_WAGE} € pro Tag.`, 'build');
  return next;
}

/** Gives a staff member a different task. */
export function setStaffRole(game: GameState, kind: ShopKind, index: number, role: StaffRole): GameState {
  const shop = game.shops[kind];
  if (!game.hasChosen || index < 0 || index >= shop.staff || staffRole(shop, index) === role) return game;
  const next = structuredClone(game);
  const roles = [...(next.shops[kind].staffRoles || [])];
  roles[index] = role;
  next.shops[kind].staffRoles = roles;
  const roleInfo = STAFF_ROLE_LIST.find(entry => entry.id === role)!;
  addEvent(next, `Aufgabe geändert`, `Mitarbeiter ${index + 1} ist jetzt für ${roleInfo.label} zuständig: ${roleInfo.description}`, 'info');
  return next;
}

/** Enlarges the sales floor: more tiles, same furniture that is already placed. */
export function expandShop(game: GameState, kind: ShopKind): GameState {
  const shop = game.shops[kind];
  const step = nextExpansion(shop);
  if (!game.hasChosen || !shop.owned || !step || game.coins < step.cost) return game;
  const next = structuredClone(game);
  next.coins -= step.cost;
  next.totalExpenses += step.cost;
  next.built += 1;
  next.shops[kind].expansions += 1;
  // New tiles can push the entrance one row further to the front, so the
  // furniture is laid out again against the bigger floor.
  next.shops[kind].layout = normalizeLayout(next.shops[kind], next.shops[kind].layout);
  next.shops[kind].popularity = Math.min(99, next.shops[kind].popularity + 4);
  const level = next.shops[kind].expansions;
  const grid = floorGridFor(level);
  addEvent(next, `Ladenfläche erweitert: ${step.label}`, `${expansionTiles(level - 1)} Kacheln mehr für ${money(step.cost)} – jetzt ${grid.w} × ${grid.h} Kacheln.`, 'build');
  return next;
}

/** Turns a small shelf into a tall one: more room and more goods on display. */
export function upgradeShelf(game: GameState, kind: ShopKind, index: number): GameState {
  const shop = game.shops[kind];
  if (!game.hasChosen || !shop.owned || index < 0 || index >= shop.furniture.shelf || shelfTier(shop, index) === 2) return game;
  const cost = shelfUpgradeCost(shop, index);
  if (game.coins < cost) return game;
  const next = structuredClone(game);
  next.coins -= cost;
  next.totalExpenses += cost;
  next.built += 1;
  const tiers = Array.from({ length: next.shops[kind].furniture.shelf }, (_, position) => shelfTier(next.shops[kind], position));
  tiers[index] = 2;
  next.shops[kind].shelfTiers = tiers;
  next.shops[kind].popularity = Math.min(99, next.shops[kind].popularity + 2);
  addEvent(next, `Regal ${index + 1} ausgebaut`, `Ein grosses Regal mit ${SHELF_CAPACITY[2]} Lagerplätzen für ${money(cost)}.`, 'build');
  return next;
}

/**
 * The storekeeper keeps production running: buys missing raw materials until
 * every recipe input is stocked again. Works on the given game object.
 */
export function staffRestock(game: GameState, kind: ShopKind): boolean {
  const shop = game.shops[kind];
  if (!shop?.owned || !hasRole(shop, 'stock')) return false;
  const targetQuantity = 12;
  const reserve = 150;
  let bought = false;
  const inputs = [...new Set(SHOPS[kind].recipes.flatMap(recipe => Object.keys(recipe.inputs)))];
  inputs.forEach(itemId => {
    const item = getItem(kind, itemId);
    if (!item) return;
    const missing = targetQuantity - (shop.stock[itemId] || 0);
    if (missing <= 0) return;
    const affordable = Math.floor((game.coins - reserve) / item.price);
    let quantity = Math.max(0, Math.min(missing, affordable));
    // Keep the warehouse from overflowing.
    const room = capacity(shop) - (stockCount(shop) + reservedSpace(kind, shop) - 1);
    quantity = Math.min(quantity, Math.max(0, room));
    if (quantity < 1) return;
    game.coins -= item.price * quantity;
    game.totalExpenses += item.price * quantity;
    shop.stock[itemId] = (shop.stock[itemId] || 0) + quantity;
    bought = true;
  });
  if (bought) addEvent(game, 'Lageristin hat nachbestellt', `${shop.name}: Rohstoffe sind wieder aufgefüllt.`, 'info');
  return bought;
}

/** How often a cashier serves the next waiting customer, in milliseconds. */
export const AUTO_SERVE_MS = 3200;
/** Chance that an automatic sale still earns a tip. */
export const AUTO_SERVE_TIP_CHANCE = .25;

/** Moves one piece to another tile. Invalid targets leave the game untouched. */
export function movePlaceable(game: GameState, kind: ShopKind, id: string, place: Placement): GameState {
  const shop = game.shops[kind];
  const piece = piecesOf(shop).find(entry => entry.id === id);
  if (!piece || piece.kind !== id.split('-')[0]) return game;
  const target: Placement = { x: Math.round(place.x), y: Math.round(place.y), rot: place.rot === 1 ? 1 : 0 };
  if (!placementFits(shop.layout, piece.kind, target, id, gridOf(shop))) return game;
  const current = placeOf(shop.layout, piece);
  if (current.x === target.x && current.y === target.y && current.rot === target.rot) return game;
  const next = structuredClone(game);
  next.shops[kind].layout[id] = target;
  return next;
}

function validSaveShape(input: unknown): input is GameState {
  if (!input || typeof input !== 'object') return false;
  const value = input as GameState;
  const numeric = ['coins', 'day', 'minute', 'elapsed', 'totalRevenue', 'totalExpenses', 'totalSold', 'opened', 'built', 'completedProductions', 'repaired'] as const;
  if (value.version !== 1 || !numeric.every(key => Number.isFinite(value[key]) && value[key] >= 0) || !SHOP_ORDER.includes(value.selected)) return false;
  if (![1,2,3].includes(value.speed) || typeof value.paused !== 'boolean' || typeof value.hasChosen !== 'boolean' || typeof value.sound !== 'boolean' || typeof value.goalClaimed !== 'boolean' || !Number.isFinite(value.savedAt) || !Array.isArray(value.events)) return false;
  if (value.day < 1 || value.minute < 540 || value.minute >= 1260 || value.events.length > 16) return false;
  if (!['day','minute','elapsed','totalSold','opened','built','completedProductions','repaired'].every(key => Number.isInteger(value[key as keyof GameState]))) return false;
  if (!value.events.every(event => event && typeof event.id === 'string' && typeof event.text === 'string' && typeof event.detail === 'string' && typeof event.time === 'string' && ['sale','production','info','build'].includes(event.kind))) return false;
  return SHOP_ORDER.every(kind => {
    const shop = value.shops?.[kind];
    if (!shop || !Array.isArray(shop.orders)) return false;
    return typeof shop.name === 'string' && shop.name.length >= 2 && shop.name.length <= 22 && typeof shop.owned === 'boolean' && typeof shop.open === 'boolean' &&
      Number.isFinite(shop.popularity) && shop.popularity >= 0 && shop.popularity <= 100 && Number.isFinite(shop.price) && shop.price >= .8 && shop.price <= 1.3 && Number.isFinite(shop.revenue) && Number.isFinite(shop.dailyRevenue) && Number.isFinite(shop.sold) && Number.isFinite(shop.produced) &&
      Number.isInteger(shop.staff) && shop.staff >= 0 && shop.staff <= 3 && Number.isInteger(shop.skill) && shop.skill >= 0 && shop.skill <= 3 &&
      SHOPS[kind].items.every(item => Number.isFinite(shop.stock?.[item.id]) && shop.stock[item.id] >= 0) &&
      Object.values(shop.stock).every(quantity => Number.isInteger(quantity) && quantity >= 0) &&
      (['register','shelf','decor','workbench'] as FurnitureKind[]).every(key => Number.isInteger(shop.furniture?.[key]) && shop.furniture[key] >= 1 && shop.furniture[key] <= SHOPS[kind].furniture[key].max) &&
      Array.isArray(shop.queue) && shop.queue.length <= 6 && shop.queue.every(job => job && typeof job.id === 'string' && Number.isFinite(job.progress) && job.progress >= 0 && Number.isFinite(job.duration) && job.duration > 0 && Number.isInteger(job.batch) && job.batch >= 1 && job.batch <= 3 && (job.repairId ? shop.orders.some(order => order.id === job.repairId && order.status === 'queued') : SHOPS[kind].recipes.some(r => r.id === job.recipeId))) &&
      Array.isArray(shop.cards) && shop.cards.every(card => card && typeof card.id === 'string' && typeof card.name === 'string' && typeof card.listed === 'boolean' && typeof card.sold === 'boolean' && Number.isFinite(card.value) && card.value >= 0 && ['Gewoehnlich','Selten','Episch','Legendaer'].includes(card.rarity) && ['fire','forest','water','crystal','moon'].includes(card.element)) &&
      shop.orders.every(order => order && typeof order.id === 'string' && typeof order.device === 'string' && typeof order.problem === 'string' && Number.isFinite(order.reward) && Number.isFinite(order.duration) && Number.isFinite(order.chips) && ['available','queued','done'].includes(order.status)) &&
      Array.isArray(shop.autoRecipes) && shop.autoRecipes.every(recipeId => SHOPS[kind].recipes.some(r => r.id === recipeId)) &&
      (shop.layout === undefined || (typeof shop.layout === 'object' && shop.layout !== null && !Array.isArray(shop.layout))) &&
      Array.isArray(shop.hourlyRevenue) && shop.hourlyRevenue.length === 12 && shop.hourlyRevenue.every(Number.isFinite);
  }) && (!value.hasChosen || value.shops[value.selected].owned);
}

export function addEvent(game: GameState, text: string, detail: string, kind: GameState['events'][number]['kind'] = 'info') {
  game.events.unshift({ id: id(), text, detail, kind, time: clock(game.minute) });
  game.events = game.events.slice(0, 16);
}

export function capacity(shop: Shop) {
  const shelves = Array.from({ length: shop.furniture.shelf }, (_, index) => shelfTier(shop, index))
    .reduce((sum, tier) => sum + SHELF_CAPACITY[tier], 0);
  return 80 + shelves;
}
export function stockCount(shop: Shop) { return Object.values(shop.stock).reduce((a, b) => a + b, 0); }
export function recommendedRecipe(kind: ShopKind) { return SHOPS[kind].recipes[kind === 'tcg' ? 0 : 1].id; }

export function reservedSpace(kind: ShopKind, shop: Shop) {
  return shop.queue.reduce((total, job) => {
    if (job.repairId) return total + (shop.orders.find(order => order.id === job.repairId)?.chips || 0);
    const recipe = SHOPS[kind].recipes.find(r => r.id === job.recipeId)!;
    return total + Math.max(recipe.quantity, Object.values(recipe.inputs).reduce((a,b) => a+b,0)) * job.batch;
  }, 0);
}

export function canProduce(game: GameState, kind: ShopKind, recipeId: string, batch = 1) {
  const recipe = SHOPS[kind].recipes.find(r => r.id === recipeId);
  const shop = game.shops[kind];
  if (!game.hasChosen || !shop.owned) return 'Starte zuerst deinen Laden.';
  if (!Number.isInteger(batch) || batch < 1 || batch > 3) return 'Wähle 1 bis 3 Chargen.';
  if (!recipe) return 'Rezept nicht gefunden.';
  if (shop.queue.length >= 6) return 'Die Warteschlange ist voll.';
  const missing = Object.entries(recipe.inputs).find(([item, qty]) => (shop.stock[item] || 0) < qty * batch);
  if (missing) return `Nicht genug ${getItem(kind, missing[0])?.name || missing[0]}.`;
  const usedInputs = Object.values(recipe.inputs).reduce((a, b) => a + b, 0) * batch;
  if (stockCount(shop) - usedInputs + reservedSpace(kind,shop) + Math.max(usedInputs,recipe.quantity * batch) > capacity(shop)) return 'Dein Lager ist voll. Baue ein weiteres Regal.';
  return null;
}

export function enqueue(game: GameState, kind: ShopKind, recipeId: string, batch = 1): GameState {
  if (canProduce(game, kind, recipeId, batch)) return game;
  const next = structuredClone(game);
  queueRecipe(next,kind,recipeId,batch);
  return next;
}

function queueRecipe(game: GameState, kind: ShopKind, recipeId: string, batch = 1) {
  const recipe = SHOPS[kind].recipes.find(r => r.id === recipeId)!;
  const shop = game.shops[kind];
  Object.entries(recipe.inputs).forEach(([item, qty]) => { shop.stock[item] -= qty * batch; });
  shop.queue.push({ id: id(), recipeId, batch, progress: 0, duration: recipe.duration * batch });
  addEvent(game, `${recipe.name} in Produktion`, `${shop.name} · ${recipe.quantity * batch} Stück werden hergestellt.`, 'production');
}

export function cancelJob(game: GameState, kind: ShopKind, jobId: string): GameState {
  const next = structuredClone(game);
  const shop = next.shops[kind];
  const job = shop.queue.find(j => j.id === jobId);
  if (!job) return game;
  if (job.repairId) {
    const order = shop.orders.find(o => o.id === job.repairId)!;
    shop.stock.chip += order.chips;
    order.status = 'available';
  } else {
    const recipe = SHOPS[kind].recipes.find(r => r.id === job.recipeId)!;
    Object.entries(recipe.inputs).forEach(([item, qty]) => { shop.stock[item] += qty * job.batch; });
    shop.autoRecipes = shop.autoRecipes.filter(recipeId => recipeId !== job.recipeId);
  }
  shop.queue = shop.queue.filter(j => j.id !== jobId);
  return next;
}

export function startRepair(game: GameState, orderId: string): GameState {
  const order = game.shops.it.orders.find(o => o.id === orderId);
  if (!game.hasChosen || !game.shops.it.owned || !order || order.status !== 'available' || game.shops.it.stock.chip < order.chips || game.shops.it.queue.length >= 6) return game;
  const next = structuredClone(game);
  const target = next.shops.it.orders.find(o => o.id === orderId)!;
  next.shops.it.stock.chip -= target.chips;
  target.status = 'queued';
  next.shops.it.queue.push({ id: id(), recipeId: 'repair', repairId: orderId, progress: 0, duration: target.duration, batch: 1 });
  addEvent(next, `${target.device} in Reparatur`, target.problem, 'production');
  return next;
}

export function canBuyMaterial(game: GameState, kind: ShopKind, itemId: string, quantity: number) {
  const item = getItem(kind, itemId);
  if (!game.hasChosen || !game.shops[kind].owned || !item) return 'Eröffne zuerst deinen Laden.';
  if (!Number.isInteger(quantity) || quantity < 1) return 'Ungültige Bestellmenge.';
  if (game.coins < item.price * quantity) return 'Dafür reicht dein Guthaben noch nicht.';
  if (stockCount(game.shops[kind]) + reservedSpace(kind,game.shops[kind]) + quantity > capacity(game.shops[kind])) return 'Zu wenig Lagerplatz. Laufende Aufträge reservieren Platz.';
  return null;
}

export function buyMaterial(game: GameState, kind: ShopKind, itemId: string, quantity: number): GameState {
  if (canBuyMaterial(game,kind,itemId,quantity)) return game;
  const item = getItem(kind,itemId)!;
  const next = structuredClone(game);
  next.coins -= item.price * quantity;
  next.totalExpenses += item.price * quantity;
  next.shops[kind].stock[itemId] = (next.shops[kind].stock[itemId] || 0) + quantity;
  addEvent(next, 'Lieferung angekommen', `${quantity} × ${item.name} für ${next.shops[kind].name}.`, 'info');
  return next;
}

export function buyFurniture(game: GameState, kind: ShopKind, furniture: FurnitureKind): GameState {
  const config = SHOPS[kind].furniture[furniture];
  const cost = config.cost * game.shops[kind].furniture[furniture];
  if (!game.hasChosen || game.coins < cost || game.shops[kind].furniture[furniture] >= config.max) return game;
  const next = structuredClone(game);
  next.coins -= cost;
  next.totalExpenses += cost;
  next.built++;
  next.shops[kind].furniture[furniture]++;
  next.shops[kind].layout = normalizeLayout(next.shops[kind], next.shops[kind].layout);
  next.shops[kind].popularity = Math.min(99, next.shops[kind].popularity + (furniture === 'decor' ? 6 : 3));
  addEvent(next, `${config.name} aufgestellt`, 'Dein Laden ist jetzt noch ein bisschen besser.', 'build');
  return next;
}

export function unlockShop(game: GameState, kind: ShopKind): GameState {
  if (game.shops[kind].owned) return { ...game, selected: kind };
  if (game.coins < SHOPS[kind].expansionCost) return game;
  const next = structuredClone(game);
  next.coins -= SHOPS[kind].expansionCost;
  next.totalExpenses += SHOPS[kind].expansionCost;
  next.shops[kind].owned = true;
  next.selected = kind;
  next.shops[kind].autoRecipes = [recommendedRecipe(kind)];
  if (!canProduce(next,kind,recommendedRecipe(kind))) queueRecipe(next,kind,recommendedRecipe(kind));
  addEvent(next, `${next.shops[kind].name} ist eröffnet!`, 'Deine Mall wächst um einen neuen Lieblingsort.', 'build');
  return next;
}

function creditSale(game: GameState, shop: Shop, amount: number, count = 1) {
  game.coins += amount;
  game.totalRevenue += amount;
  game.totalSold += count;
  shop.revenue += amount;
  shop.dailyRevenue += amount;
  shop.sold += count;
  const hour = Math.max(0, Math.min(11, Math.floor(game.minute / 60) - 9));
  shop.hourlyRevenue[hour] += amount;
}

export interface CheckoutResult {
  game: GameState;
  /** Money the customer paid, including the tip. */
  earned: number;
  tip: number;
  /** Number of items that actually left the shelf. */
  units: number;
  /** Items the customer wanted but that were already sold out. */
  missing: string[];
}

/**
 * Serves one customer at the register: the goods leave the shelf (and with them
 * the shop display), the money goes to the till and a perfect payment earns a tip.
 */
/** The player does not serve this customer; they leave without buying anything. */
export function skipCustomer(game: GameState, kind: ShopKind, customer: QueueCustomer): GameState {
  const next = structuredClone(game);
  const shop = next.shops[kind];
  shop.popularity = Math.max(0, shop.popularity - 1);
  addEvent(next, 'Kunde geht', `${customer.label} wartet nicht länger und verlässt den Laden.`, 'info');
  return next;
}

export function checkout(game: GameState, kind: ShopKind, customer: QueueCustomer, perfect: boolean): CheckoutResult {
  const next = structuredClone(game);
  const shop = next.shops[kind];
  let earned = 0;
  let units = 0;
  const missing: string[] = [];
  customer.lines.forEach(line => {
    if (line.itemId === 'service') { earned += line.price; return; }
    const available = Math.max(0, Math.floor(shop.stock[line.itemId] || 0));
    const sold = Math.min(available, line.quantity);
    if (sold < line.quantity) missing.push(line.name);
    if (!sold) return;
    shop.stock[line.itemId] = available - sold;
    earned += line.price * sold;
    units += sold;
  });
  const tip = perfect && earned > 0 ? Math.round(earned * 0.08) : 0;
  if (earned > 0) {
    creditSale(next, shop, earned + tip, units);
    shop.popularity = Math.min(99, shop.popularity + 1);
    addEvent(next, 'Kasse: Kunde bedient', `${customer.label} · +${money(earned + tip)}${tip ? ` (${money(tip)} Trinkgeld)` : ''} · ${customer.method === 'cash' ? 'Barzahlung' : 'Kartenzahlung'}`, 'sale');
  } else {
    shop.popularity = Math.max(0, shop.popularity - 1);
    addEvent(next, 'Leider ausverkauft', `Für ${customer.label} war nichts mehr im Regal. Bestelle neue Ware im Lager.`, 'info');
  }
  return { game: next, earned: earned + tip, tip, units, missing };
}

export function sellStock(game: GameState, kind: ShopKind, itemId: string): GameState {
  const item = getItem(kind, itemId);
  if (!game.hasChosen || !item || !game.shops[kind].stock[itemId]) return game;
  const next = structuredClone(game);
  next.shops[kind].stock[itemId]--;
  const amount = Math.round(item.price * next.shops[kind].price);
  creditSale(next, next.shops[kind], amount);
  addEvent(next, `${item.name} direkt verkauft`, `${next.shops[kind].name} · +${amount} €`, 'sale');
  return next;
}

export function advance(game: GameState, seconds: number): GameState {
  if (!game.hasChosen || game.paused) return game;
  const next = structuredClone(game);
  // Every simulated second advances production and the in-game clock together.
  for (let t = 0; t < seconds; t++) {
    next.elapsed++;
    next.minute++;
    if (next.minute >= 1260) {
      next.day++;
      next.minute = 540;
      const wages = SHOP_ORDER.filter(k => next.shops[k].owned).reduce((sum, k) => sum + next.shops[k].staff * STAFF_WAGE + 60, 0);
      next.coins = Math.max(0, next.coins - wages);
      next.totalExpenses += wages;
      SHOP_ORDER.forEach(k => {
        next.shops[k].dailyRevenue = 0;
        next.shops[k].hourlyRevenue = Array(12).fill(0);
        if (k === 'bakery' && next.shops[k].owned) ['bread', 'croissant', 'cake'].forEach(item => { next.shops[k].stock[item] = Math.floor(next.shops[k].stock[item] * 0.75); });
      });
      addEvent(next, `Guten Morgen, Tag ${next.day}!`, `${wages} € für Personal und Miete abgerechnet. Backwaren vom Vortag wurden aussortiert.`);
    }
    SHOP_ORDER.forEach(kind => {
      const shop = next.shops[kind];
      if (!shop.owned) return;
      const active = shop.queue.slice(0, Math.min(shop.furniture.workbench, shop.staff));
      active.forEach(job => {
        job.progress += 1 + shop.skill * 0.15;
        if (job.progress < job.duration) return;
        if (job.repairId) {
          const order = shop.orders.find(o => o.id === job.repairId)!;
          order.status = 'done';
          creditSale(next, shop, order.reward, 0);
          next.repaired++;
          shop.popularity = Math.min(99, shop.popularity + 2);
          addEvent(next, `${order.device} repariert`, `${order.reward} € Service-Umsatz. Wieder ein glücklicher Kunde!`, 'production');
        } else {
          const recipe = SHOPS[kind].recipes.find(r => r.id === job.recipeId)!;
          shop.stock[recipe.output] = (shop.stock[recipe.output] || 0) + recipe.quantity * job.batch;
          next.completedProductions++;
          if (getItem(kind,recipe.output)?.category === 'product') shop.produced++;
          addEvent(next, `${recipe.name} fertig`, `${recipe.quantity * job.batch} Stück liegen jetzt im Lager.`, 'production');
        }
        shop.queue = shop.queue.filter(j => j.id !== job.id);
      });
      shop.autoRecipes.forEach(recipeId => {
        if (!shop.queue.some(job => job.recipeId === recipeId) && !canProduce(next,kind,recipeId)) queueRecipe(next,kind,recipeId);
      });
      // The storekeeper refills the raw materials every now and then.
      if (hasRole(shop, 'stock') && next.elapsed % 20 === 0) staffRestock(next, kind);
      // A person on shelf duty keeps the sales floor full and the mood up.
      if (hasRole(shop, 'refill') && shop.open && shop.popularity < 99 && next.elapsed % 300 === 0
        && SHOPS[kind].items.some(item => item.category === 'product' && (shop.stock[item.id] || 0) > 0)) {
        shop.popularity = Math.min(99, shop.popularity + 1);
      }
      const salesInterval = Math.max(4, 11 - shop.furniture.register - Math.floor(shop.popularity / 25));
      if (!shop.open || next.elapsed % salesInterval !== 0) return;
      const card = shop.cards.find(c => c.listed && !c.sold);
      if (card) {
        card.sold = true;
        creditSale(next, shop, Math.round(card.value * shop.price));
        addEvent(next, `${card.name} verkauft`, `${shop.name} · +${Math.round(card.value * shop.price)} €`, 'sale');
        return;
      }
      const products = SHOPS[kind].items.filter(item => item.category === 'product' && shop.stock[item.id] > 0);
      if (!products.length) return;
      // Higher prices gently reduce demand without interrupting the simulation.
      if (shop.price > 1.15 && Math.floor(next.elapsed / salesInterval) % 3 === 0) return;
      const product = products[Math.floor(next.elapsed / salesInterval) % products.length];
      const amount = Math.round(product.price * shop.price);
      shop.stock[product.id]--;
      creditSale(next, shop, amount);
      addEvent(next, `${product.name} verkauft`, `${shop.name} · +${amount} €`, 'sale');
    });
  }
  next.savedAt = Date.now();
  return next;
}

export function openPack(game: GameState): { game: GameState; cards: TradingCard[] } {
  if (!game.hasChosen || !game.shops.tcg.owned || game.shops.tcg.stock.booster < 1) return { game, cards: [] };
  const next = structuredClone(game);
  next.shops.tcg.stock.booster--;
  next.opened++;
  const elements: TradingCard['element'][] = ['fire', 'forest', 'water', 'crystal', 'moon'];
  const cards = Array.from({ length: 5 }, (_, index): TradingCard => {
    const roll = Math.random();
    const rarity = roll > 0.97 ? 'Legendaer' : roll > 0.84 ? 'Episch' : roll > 0.57 || index === 4 ? 'Selten' : 'Gewoehnlich';
    const creature = Math.floor(Math.random() * 5);
    const baseValue = { Gewoehnlich: 7, Selten: 24, Episch: 85, Legendaer: 280 }[rarity];
    return { id: id(), name: CARD_NAMES[creature], rarity, value: baseValue + Math.floor(Math.random() * baseValue * 0.3), element: elements[creature], listed: false, sold: false };
  });
  next.shops.tcg.cards.push(...cards);
  addEvent(next, 'Ein Nova-Pack voller Möglichkeiten', '5 neue Karten entdeckt. Mindestens eine seltene Karte ist garantiert.', 'info');
  return { game: next, cards };
}

export function manageCards(game: GameState, ids: string[], action: 'sell' | 'list'): GameState {
  const next = structuredClone(game);
  let amount = 0;
  let count = 0;
  next.shops.tcg.cards.forEach(card => {
    if (!ids.includes(card.id) || card.sold) return;
    if (action === 'list') card.listed = true;
    else { card.sold = true; amount += card.value; count++; }
  });
  if (action === 'sell' && count) {
    creditSale(next, next.shops.tcg, amount, count);
    addEvent(next, `${count} Sammlerkarten verkauft`, `Deine Entdeckungen bringen ${amount} € ein.`, 'sale');
  }
  return next;
}

export function goalProgress(game: GameState) {
  const special = game.selected === 'tcg' ? game.opened > 0 : game.selected === 'it' ? game.repaired > 0 : game.shops.bakery.produced > 0;
  return [special, game.built > 0, game.totalSold >= 5];
}