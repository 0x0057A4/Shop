import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Tile } from '../game/layout';
import { blockedTiles, gridOf, isWalkable } from '../game/layout';
import type { Shop } from '../game/data';
import { p } from './isoGeometry';
import { PersonFigure } from './Customers';
import { SmoothGroup } from './Motion';

/** Screen-relative directions: on an isometric floor "up" means one tile back-left. */
export const PLAYER_STEPS = {
  up: { x: -1, y: -1 },
  down: { x: 1, y: 1 },
  left: { x: -1, y: 1 },
  right: { x: 1, y: -1 },
} as const;
export type PlayerFacing = keyof typeof PLAYER_STEPS;
export const PLAYER_STEP_MS = 190;
/** How long the figure glides from one tile to the next. */
export const PLAYER_GLIDE_MS = 180;

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
  const grid = gridOf(shop);
  // Right behind the entrance, which always sits in the last row of tiles.
  const start: Tile = { x: 7, y: Math.max(0, grid.h - 2) };
  if (isWalkable(start, blocked, grid)) return start;
  const queue: Tile[] = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (isWalkable(current, blocked, grid) && current.x >= 0 && current.y >= 0) return current;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || next.x < -2 || next.y < -2 || next.x > grid.w + 2 || next.y > grid.h + 2) return;
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
  const grid = useMemo(() => gridOf(shop), [shop.expansions, shop]);

  // A new shop means a new starting position.
  useEffect(() => {
    setPlayer(previous => ({ ...previous, tile: findSpawnTile(shop), moving: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Never stand inside a piece of furniture: nudge the player onto a free tile.
  useEffect(() => {
    setPlayer(previous => {
      if (isWalkable(previous.tile, blocked, grid) && previous.tile.x >= 0 && previous.tile.y >= 0) return previous;
      return { ...previous, tile: findSpawnTile(shop), moving: false };
    });
  }, [blocked, grid, shop]);

  const lastStep = useRef(0);
  const step = useCallback((direction: PlayerFacing) => {
    lastStep.current = performance.now();
    setPlayer(previous => {
      const delta = PLAYER_STEPS[direction];
      const tile = { x: previous.tile.x + delta.x, y: previous.tile.y + delta.y };
      if (!isWalkable(tile, blocked, grid)) return { ...previous, facing: direction, moving: false };
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
      if (held.current !== direction) { held.current = direction; lastStep.current = 0; }
      if (!event.repeat && performance.now() - lastStep.current >= PLAYER_STEP_MS * .8) step(direction);
    };
    const keyUp = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code] ?? KEY_DIRECTIONS[event.key];
      if (direction && held.current === direction) held.current = null;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    // Keeps walking while a key is held; the due check stops a double step when a
    // key is pressed right before the next tick.
    const timer = window.setInterval(() => {
      const since = performance.now() - lastStep.current;
      if (!held.current) {
        // Nobody walks any more: the figure stands still and stops bobbing.
        if (since > PLAYER_STEP_MS) setPlayer(previous => (previous.moving ? { ...previous, moving: false } : previous));
        return;
      }
      if (since < PLAYER_STEP_MS) return;
      step(held.current);
    }, PLAYER_STEP_MS / 3);
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
  return <SmoothGroup className="player-avatar" aria-hidden="true" x={px} y={py} ms={PLAYER_GLIDE_MS} style={{ '--step-ms': `${PLAYER_GLIDE_MS}ms` } as CSSProperties}>
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
  </SmoothGroup>;
}
