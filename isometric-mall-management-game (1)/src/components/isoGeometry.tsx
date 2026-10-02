export const U = 32;
export type Point = [number, number];

export const p = (x: number, y: number, z = 0): Point => [390 + (x - y) * U, 146 + (x + y) * U * 0.5 - z * U];
export const pts = (points: Point[]) => points.map(point => point.join(',')).join(' ');
export const polygon = (coordinates: [number, number, number][]) => pts(coordinates.map(c => p(...c)));

export function Cube({ x, y, z = 0.36, w, d, h, top = '#e4dcef', left = '#b8a6d4', right = '#cabade', opacity = 1 }: { x: number; y: number; z?: number; w: number; d: number; h: number; top?: string; left?: string; right?: string; opacity?: number }) {
  return <g opacity={opacity}>
    <polygon points={polygon([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={right} />
    <polygon points={polygon([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={left} />
    <polygon points={polygon([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={top} />
  </g>;
}