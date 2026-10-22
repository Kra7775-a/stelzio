import { GRID_H, GRID_W } from "@shared/constants";

/**
 * Обходит все клетки квадрата вокруг точки — это и есть зона обзора игрока.
 *
 * Квадрат, а не круг: проверять «на сколько клеток я отступил по каждой оси»
 * заметно дешевле, чем считать расстояние, а на глаз разница почти незаметна.
 */
export function forEachVisible(
  centerX: number,
  centerY: number,
  radius: number,
  visit: (index: number, x: number, y: number) => void,
): void {
  // Обрезаем квадрат краями карты: за её пределами клеток нет.
  const left = Math.max(0, centerX - radius);
  const right = Math.min(GRID_W - 1, centerX + radius);
  const top = Math.max(0, centerY - radius);
  const bottom = Math.min(GRID_H - 1, centerY + radius);

  for (let y = top; y <= bottom; y++) {
    const rowStart = y * GRID_W;
    for (let x = left; x <= right; x++) {
      visit(rowStart + x, x, y);
    }
  }
}

/** Попадает ли клетка (x, y) в зону обзора игрока, который стоит в (viewerX, viewerY). */
export const isVisible = (
  viewerX: number,
  viewerY: number,
  radius: number,
  x: number,
  y: number,
): boolean => Math.abs(viewerX - x) <= radius && Math.abs(viewerY - y) <= radius;
