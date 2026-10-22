import {
  DASH_COST,
  DASH_DISTANCE,
  ENERGY_PER_CELL,
  FLASH_COST,
  FLASH_RADIUS,
  FLASH_TICKS,
  GRID_H,
  GRID_W,
  MAX_ENERGY,
  MAX_PLAYERS,
  MOVE_EVERY_TICKS,
  PAINT_EVERY_TICKS,
  START_ENERGY,
  TICK_HZ,
  VIEW_RADIUS,
} from "@shared/constants";
import { encodeBytes } from "@shared/codec";
import type { ActionKind, ClientMsg, Dir, PlayerView, ServerMsg } from "@shared/protocol";
import { idx, inBounds, step } from "@shared/sim";
import { forEachVisible, isVisible } from "./visibility";

/** Минимум, который комнате нужен от соединения, — уметь отправлять строку. */
export interface Conn {
  send(data: string): void;
}

export interface Player {
  id: string;
  name: string;
  slot: number;
  x: number;
  y: number;
  dir: Dir;
  energy: number;
  alive: boolean;
  /**
   * На каком тике этому игроку последний раз отправляли снапшот.
   * Сравнивая с ним, комната понимает, какие клетки для игрока новые.
   */
  sentAtTick: number;
  conn: Conn;
}

/** Вспышка — временный источник света, живёт до тика `until`. */
interface Flash {
  x: number;
  y: number;
  radius: number;
  until: number;
}

/** Стартовые точки по слотам: четыре угла карты. */
const SPAWNS = [
  { x: 8, y: 8 },
  { x: GRID_W - 9, y: GRID_H - 9 },
  { x: 8, y: GRID_H - 9 },
  { x: GRID_W - 9, y: 8 },
];

/** Допустимые направления — для проверки того, что реально пришло из сети. */
const DIRECTIONS: readonly Dir[] = ["up", "down", "left", "right"];

/** Оставляем в нике только буквы, цифры, пробел, дефис и подчёркивание. */
const sanitizeName = (name: string): string => {
  const cleaned = name
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .trim()
    .slice(0, 16);
  return cleaned.length > 0 ? cleaned : "anon";
};

/**
 * Одна игровая комната: до четырёх игроков и карта, которую они красят.
 *
 * Вся карта — это обычные массивы в памяти процесса. Ни базы данных, ни файлов:
 * комната живёт, пока в ней есть люди, и исчезает вместе с последним игроком.
 */
export class Room {
  readonly id: string;
  readonly players: Player[] = [];

  /** Владелец каждой клетки: 0 — ничья земля, 1..4 — слот игрока. */
  private readonly owner = new Uint8Array(GRID_W * GRID_H);

  /** На каком тике клетка менялась в последний раз. По этому массиву считаются дельты. */
  private readonly changedTick = new Uint32Array(GRID_W * GRID_H);

  /** Сколько клеток закрасил каждый слот. Индекс 0 не используется. */
  private readonly score = new Uint16Array(MAX_PLAYERS + 1);

  private flashes: Flash[] = [];
  private tickNo = 0;

  constructor(id: string) {
    this.id = id;
  }

  get size(): number {
    return this.players.length;
  }

  get isFull(): boolean {
    return this.players.length >= MAX_PLAYERS;
  }

  get isEmpty(): boolean {
    return this.players.length === 0;
  }

  /** Сажает игрока в комнату. Возвращает null, если свободных слотов не осталось. */
  join(name: string, conn: Conn): Player | null {
    const slot = this.firstFreeSlot();
    if (slot === -1) return null;

    const spawn = SPAWNS[slot - 1] ?? SPAWNS[0];
    const player: Player = {
      id: crypto.randomUUID(),
      name: sanitizeName(name),
      slot,
      x: spawn.x,
      y: spawn.y,
      dir: "right",
      energy: START_ENERGY,
      alive: true,
      sentAtTick: this.tickNo,
      conn,
    };

    this.players.push(player);

    // Три сообщения при входе: кто я, как карта выглядит сейчас, и первый снапшот.
    this.send(player, {
      t: "welcome",
      playerId: player.id,
      slot,
      roomId: this.id,
      grid: { w: GRID_W, h: GRID_H },
      tickHz: TICK_HZ,
    });
    this.send(player, { t: "full", owner: encodeBytes(this.owner) });
    this.send(player, this.buildState(player));

    return player;
  }

  leave(playerId: string): void {
    const index = this.players.findIndex((player) => player.id === playerId);
    if (index !== -1) this.players.splice(index, 1);
  }

  /** Обрабатывает намерение игрока, пришедшее с клиента. */
  handle(playerId: string, msg: ClientMsg): void {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) return;

    if (msg.t === "input") {
      // Направление запоминаем сразу, а сам шаг случится на ближайшем тике.
      if (DIRECTIONS.includes(msg.dir)) player.dir = msg.dir;
      return;
    }

    if (msg.t === "action") {
      this.useAction(player, msg.kind);
    }
  }

  /** Один шаг мира: двигаем игроков, гасим старые вспышки, рассылаем дельты. */
  tick(): void {
    this.tickNo++;

    for (const player of this.players) {
      if (!player.alive) continue;
      if (this.tickNo % MOVE_EVERY_TICKS === 0) this.advance(player);
    }

    // Вспышка живёт FLASH_TICKS тиков, после чего просто выпадает из списка.
    this.flashes = this.flashes.filter((flash) => flash.until > this.tickNo);

    this.broadcast();
  }

  private firstFreeSlot(): number {
    for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
      if (!this.players.some((player) => player.slot === slot)) return slot;
    }
    return -1;
  }

  /** Шаг в текущем направлении плюс покраска клетки, на которую встали. */
  private advance(player: Player): void {
    const next = step(player.x, player.y, player.dir);
    if (!inBounds(next.x, next.y)) return; // упёрлись в край карты — просто стоим

    player.x = next.x;
    player.y = next.y;
    this.paint(player);
  }

  /** Красит клетку под игроком и выдаёт за неё энергию. */
  private paint(player: Player): void {
    if (this.tickNo % PAINT_EVERY_TICKS !== 0) return;

    const cell = idx(player.x, player.y);
    const previousOwner = this.owner[cell] ?? 0;
    if (previousOwner === player.slot) return; // своя клетка — менять нечего

    // Если клетка была чужой, у прошлого владельца отнимаем её из счёта.
    if (previousOwner !== 0) {
      this.score[previousOwner] = Math.max(0, (this.score[previousOwner] ?? 0) - 1);
    }

    this.owner[cell] = player.slot;
    this.changedTick[cell] = this.tickNo;
    this.score[player.slot] = (this.score[player.slot] ?? 0) + 1;
    player.energy = Math.min(MAX_ENERGY, player.energy + ENERGY_PER_CELL);
  }

  /** Вспышка освещает зону вокруг, рывок проносит игрока вперёд на несколько клеток. */
  private useAction(player: Player, kind: ActionKind): void {
    if (!player.alive) return;

    if (kind === "flash") {
      if (player.energy < FLASH_COST) return; // не хватает энергии — ничего не делаем
      player.energy -= FLASH_COST;
      this.flashes.push({
        x: player.x,
        y: player.y,
        radius: FLASH_RADIUS,
        until: this.tickNo + FLASH_TICKS,
      });
      return;
    }

    if (kind === "dash") {
      if (player.energy < DASH_COST) return;
      player.energy -= DASH_COST;

      // Рывок — это несколько обычных шагов подряд, каждый со своей покраской.
      for (let stepNumber = 0; stepNumber < DASH_DISTANCE; stepNumber++) {
        const next = step(player.x, player.y, player.dir);
        if (!inBounds(next.x, next.y)) break;
        player.x = next.x;
        player.y = next.y;
        this.paint(player);
      }
    }
  }

  private broadcast(): void {
    for (const player of this.players) {
      this.send(player, this.buildState(player));
    }
  }

  /**
   * Собирает снапшот для одного игрока.
   *
   * Главная хитрость игры в темноте: игроку уходят только те клетки, которые он
   * видит и которые менялись после прошлой отправки ему. Всё остальное для него
   * просто не существует — поэтому подсмотреть через клиент нечего.
   */
  private buildState(player: Player): ServerMsg {
    const cells: Array<[number, number]> = [];

    forEachVisible(player.x, player.y, VIEW_RADIUS, (cell) => {
      const changedAfterLastSend = (this.changedTick[cell] ?? 0) > player.sentAtTick;
      if (changedAfterLastSend) {
        cells.push([cell, this.owner[cell] ?? 0]);
      }
    });

    const visiblePlayers: PlayerView[] = this.players
      .filter((other) => other.id !== player.id && other.alive)
      .filter((other) => isVisible(player.x, player.y, VIEW_RADIUS, other.x, other.y))
      .map((other) => ({
        id: other.id,
        name: other.name,
        slot: other.slot,
        x: other.x,
        y: other.y,
        alive: other.alive,
      }));

    const snapshot: ServerMsg = {
      t: "state",
      tick: this.tickNo,
      you: {
        x: player.x,
        y: player.y,
        energy: Math.round(player.energy),
        alive: player.alive,
      },
      players: visiblePlayers,
      cells,
      flashes: this.flashes.map((flash) => ({ x: flash.x, y: flash.y, r: flash.radius })),
      score: Array.from(this.score),
    };

    player.sentAtTick = this.tickNo;
    return snapshot;
  }

  /** Отправка не должна ронять комнату: если игрок отвалился, просто убираем его. */
  private send(player: Player, msg: ServerMsg): void {
    try {
      player.conn.send(JSON.stringify(msg));
    } catch {
      this.leave(player.id);
    }
  }
}

/** Раскладывает игроков по комнатам: сначала в свободные, потом заводит новую. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  get roomCount(): number {
    return this.rooms.size;
  }

  get playerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }

  join(name: string, conn: Conn): { room: Room; player: Player } | null {
    let room: Room | undefined = [...this.rooms.values()].find(
      (candidate) => !candidate.isFull,
    );

    if (!room) {
      room = new Room(crypto.randomUUID().slice(0, 8));
      this.rooms.set(room.id, room);
    }

    const player = room.join(name, conn);
    return player ? { room, player } : null;
  }

  handle(roomId: string, playerId: string, msg: ClientMsg): void {
    this.rooms.get(roomId)?.handle(playerId, msg);
  }

  leave(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.leave(playerId);
    if (room.isEmpty) this.rooms.delete(roomId); // пустые комнаты не держим
  }

  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }
}
