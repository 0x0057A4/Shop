import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Tile } from '../game/layout';
import { GRID_H, GRID_W, blockedTiles, isWalkable } from '../game/layout';
import type { Shop } from '../game/data';
import { p } from './isoGeometry';
import { PersonFigure } from './Customers';

/** Screen-relative directions: on an isometric floor "up" means one tile back-left. */
export const PLAYER_STEPS = {
  up: { x: -1, y: -1 },
  down: { x: 1, y: 1 },
  left: { x: -1, y: 1 },
  right: { x: 1, y: -1 },
} as const;
export type PlayerFacing = keyof typeof PLAYER_STEPS;
export const PLAYER_STEP_MS = 165;

export interface PlayerState { tile: Tile; facing: PlayerFacing; moving: boolean }

const KEY_DIRECTIONS: Record<string, PlayerFacing> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

/** Nearest free tile inside the shop, starting at the entrance. */
export function findSpawnTile(shop: Shop): Tile {
  const blocked = blockedTiles(shop.layout);
  const start: Tile = { x: 7, y: 5 };
  if (isWalkable(start, blocked) && start.x < GRID_W && start.y < GRID_H) return start;
  const queue: Tile[] = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x >= 0 && current.y >= 0 && current.x < GRID_W && current.y < GRID_H && isWalkable(current, blocked)) return current;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || next.x < -2 || next.y < -2 || next.x > GRID_W + 2 || next.y > GRID_H + 2) return;
      seen.add(key);
      queue.push(next);
    });
  }
  return start;
}

/** Keyboard movement for the player figure. `session` changes when the shop does. */
export function usePlayer(shop: Shop, session: string, active: boolean) {
  const [player, setPlayer] = useState<PlayerState>(() => ({ tile: findSpawnTile(shop), facing: 'down', moving: false }));
  const held = useRef<PlayerFacing | null>(null);
  const blocked = useMemo(() => blockedTiles(shop.layout), [shop.layout]);

  // A new shop means a new starting position.
  useEffect(() => {
    setPlayer(previous => ({ ...previous, tile: findSpawnTile(shop), moving: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Never stand inside a piece of furniture: nudge the player onto a free tile.
  useEffect(() => {
    setPlayer(previous => {
      if (isWalkable(previous.tile, blocked) && previous.tile.x >= 0 && previous.tile.y >= 0 && previous.tile.x < GRID_W && previous.tile.y < GRID_H) return previous;
      return { ...previous, tile: findSpawnTile(shop), moving: false };
    });
  }, [blocked, shop]);

  const step = useCallback((direction: PlayerFacing) => {
    setPlayer(previous => {
      const delta = PLAYER_STEPS[direction];
      const tile = { x: previous.tile.x + delta.x, y: previous.tile.y + delta.y };
      const inside = tile.x >= 0 && tile.y >= 0 && tile.x < GRID_W && tile.y < GRID_H;
      if (!inside || !isWalkable(tile, blocked)) return { ...previous, facing: direction, moving: false };
      return { tile, facing: direction, moving: true };
    });
  }, [blocked]);

  useEffect(() => {
    if (!active) { held.current = null; setPlayer(previous => (previous.moving ? { ...previous, moving: false } : previous)); return; }
    const keyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code] ?? KEY_DIRECTIONS[event.key];
      if (!direction) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      held.current = direction;
      if (!event.repeat) step(direction);
    };
    const keyUp = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code] ?? KEY_DIRECTIONS[event.key];
      if (direction && held.current === direction) held.current = null;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    const timer = window.setInterval(() => { if (held.current) step(held.current); }, PLAYER_STEP_MS);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.clearInterval(timer);
    };
  }, [active, step]);

  return { player, walk: step };
}

/** The player's own figure, with a marker that makes it easy to find. */
export function PlayerAvatar({ player, busy = false }: { player: PlayerState; busy?: boolean }) {
  const [px, py] = p(player.tile.x + .5, player.tile.y + .5, .4);
  return <g className="player-avatar" transform={`translate(${px.toFixed(2)}, ${py.toFixed(2)})`} aria-hidden="true">
    <ellipse className="player-ring" cx="0" cy="0" rx="13.5" ry="6.2" />
    <ellipse cx="0" cy="0" rx="9.5" ry="4.3" fill="#5c6f77" opacity=".18" />
    <g className={player.moving ? 'player-bob' : ''} transform={player.facing === 'left' ? 'scale(-1, 1)' : undefined}>
      <PersonFigure color="#4f8a6f" carry="none" />
      <path d="M-4 -29h8l3 14h-14z" fill="#fdf6e3" opacity=".85" />
    </g>
    {busy && <g className="player-busy"><circle cx="0" cy="-58" r="3.4" fill="#7fb069" /><circle cx="0" cy="-66" r="2.2" fill="#a8cd94" /></g>}
    <g className="player-tag" transform="translate(0,-58)">
      <rect x="-15" y="-9" width="30" height="15" rx="7.5" fill="#3f6b52" />
      <text x="0" y="2" textAnchor="middle" fill="#f3f8ef" fontSize="8.4" fontWeight="800" letterSpacing=".6">DU</text>
    </g>
  </g>;
}
