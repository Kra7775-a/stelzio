/** Сколько раз в секунду сервер обновляет мир. 20 Гц — это шаг в 50 мс. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/** Размер карты в клетках. */
export const GRID_W = 120;
export const GRID_H = 120;

/** Сколько игроков помещается в одну комнату. */
export const MAX_PLAYERS = 4;

/** Радиус обзора в клетках: всё, что дальше, сервер игроку не отправляет. */
export const VIEW_RADIUS = 16;

/**
 * Игрок двигается и красит не каждый тик, а раз в два.
 * Иначе он проносится по карте слишком быстро.
 */
export const MOVE_EVERY_TICKS = 2;
export const PAINT_EVERY_TICKS = 2;

/** Энергия: потолок, стартовый запас и сколько добавляет одна закрашенная клетка. */
export const MAX_ENERGY = 100;
export const START_ENERGY = 50;
export const ENERGY_PER_CELL = 2;

/** Вспышка: сколько стоит, какой радиус освещает и сколько тиков держится. */
export const FLASH_COST = 30;
export const FLASH_RADIUS = 18;
export const FLASH_TICKS = 50;

/** Рывок: сколько стоит и сколько клеток пролетает за одно нажатие. */
export const DASH_COST = 10;
export const DASH_DISTANCE = 3;

/**
 * Цвета игроков.
 * Индекс в массиве = слот игрока, поэтому слот 0 — это нейтральная земля.
 */
export const PLAYER_COLORS = ["#000000", "#38d6ff", "#ff4d8d", "#ffd23a", "#7dff6b"] as const;
