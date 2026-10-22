import { GRID_H, GRID_W } from "./constants";
import type { Dir } from "./protocol";

/**
 * Вся карта хранится не как двумерный массив, а как один длинный список клеток:
 * клетка с координатами (x, y) лежит по индексу `y * GRID_W + x`.
 *
 * Зачем так: в сообщениях вместо пары координат передаётся одно число, а серверу
 * не нужно создавать вложенные массивы.
 */
export const idx = (x: number, y: number): number => y * GRID_W + x;

/** Не вышли ли за границы карты. */
export const inBounds = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

/**
 * Один шаг в заданную сторону.
 * Тот же шаг используется и для движения, и для рывка — рывок просто зовёт его трижды.
 */
export function step(x: number, y: number, dir: Dir): { x: number; y: number } {
  switch (dir) {
    case "up":
      return { x, y: y - 1 };
    case "down":
      return { x, y: y + 1 };
    case "left":
      return { x: x - 1, y };
    case "right":
      return { x: x + 1, y };
  }
}
