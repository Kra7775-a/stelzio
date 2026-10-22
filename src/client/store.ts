import type { PlayerView } from "@shared/protocol";

/**
 * Последний снапшот с сервера, глазами клиента. Рендер и HUD просто читают эти поля.
 *
 * Сама карта здесь не лежит: она живёт в Renderer рядом с ImageData, чтобы не
 * копировать 14 400 байт на каждое сообщение.
 */
export interface ClientState {
  /** Моя позиция и энергия. null, пока мы ещё не вошли в игру. */
  you: { x: number; y: number; energy: number; alive: boolean } | null;
  /** Видимые игроки. Себя в этом списке нет — себя рисуем отдельно. */
  players: PlayerView[];
  /** Активные вспышки. */
  flashes: Array<{ x: number; y: number; r: number }>;
  tick: number;
  /** Сколько клеток закрашено каждым слотом. Индекс — слот. */
  score: number[];
  roomId: string;
  playerId: string;
  slot: number;
}

export const state: ClientState = {
  you: null,
  players: [],
  flashes: [],
  tick: 0,
  score: [0, 0, 0, 0, 0],
  roomId: "",
  playerId: "",
  slot: 0,
};
