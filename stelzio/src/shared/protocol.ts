/**
 * Протокол — обычный JSON. Поле с типом сообщения названо коротко (`t`, а не `type`):
 * сообщений много, а лишние байты в имени умножаются на 20 отправок в секунду.
 */

/** Направление движения. Клиент присылает намерение, а не готовые координаты. */
export type Dir = "up" | "down" | "left" | "right";

/** Действия, которые тратят энергию. */
export type ActionKind = "flash" | "dash";

/** Сообщения клиент → сервер. */
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "input"; dir: Dir }
  | { t: "action"; kind: ActionKind };

/** Каким видит другого игрока наш клиент. */
export interface PlayerView {
  id: string;
  name: string;
  slot: number;
  x: number;
  y: number;
  alive: boolean;
}

/**
 * Сообщения сервер → клиент.
 *
 * - `welcome` — кто я: мой id, слот, комната и размер карты.
 * - `full`    — вся карта один раз при входе (в base64), чтобы было с чего начать.
 * - `state`   — снапшот тика: моя позиция, видимые игроки и только изменившиеся
 *               клетки (`cells`), а не вся карта целиком.
 */
export type ServerMsg =
  | {
      t: "welcome";
      playerId: string;
      slot: number;
      roomId: string;
      grid: { w: number; h: number };
      tickHz: number;
    }
  | { t: "full"; owner: string }
  | {
      t: "state";
      tick: number;
      you: { x: number; y: number; energy: number; alive: boolean };
      players: PlayerView[];
      /** Пары [индекс клетки, слот владельца]. Индекс — тот самый `idx(x, y)`. */
      cells: Array<[number, number]>;
      flashes: Array<{ x: number; y: number; r: number }>;
      score: number[];
    }
  | { t: "error"; message: string };
