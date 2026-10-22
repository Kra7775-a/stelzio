import { GRID_H, GRID_W, PLAYER_COLORS, VIEW_RADIUS } from "@shared/constants";
import type { ClientState } from "../store";

/** Размер одной клетки на экране, в пикселях. */
const CELL = 8;

/** Цвет нейтральной земли и белый запасной (если слот незнакомый). */
const NEUTRAL: [number, number, number] = [10, 14, 26];
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * "#38d6ff" → [56, 214, 255].
 *
 * Пиксель в ImageData — это четыре числа (R, G, B, A), поэтому цвет из настроек
 * нужно разложить на три байта. parseInt("38d6ff", 16) склеивает три байта в одно
 * число, а сдвиги `>>` достают их обратно.
 */
function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    (value >> 16) & 255, // красный — старший байт
    (value >> 8) & 255, // зелёный — средний байт
    value & 255, // синий — младший байт
  ];
}

/** Индекс в палитре = слот игрока, как и в constants. */
const PALETTE = PLAYER_COLORS.map(hexToRgb);

/**
 * Рисует карту, игроков и тьму.
 *
 * Клетки живут в маленьком offscreen-canvas размером 120×120 (одна клетка — один
 * пиксель). На экран он растягивается с выключенным сглаживанием. Это заметно
 * дешевле, чем каждый кадр рисовать 14 400 прямоугольников.
 */
export class Renderer {
  private readonly terrain = document.createElement("canvas");
  private readonly tctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  /** Отдельный слой под тьму: так проще «вырезать» в ней круг и наложить целиком. */
  private readonly fog = document.createElement("canvas");
  private readonly fctx: CanvasRenderingContext2D;

  constructor() {
    this.terrain.width = GRID_W;
    this.terrain.height = GRID_H;

    const tctx = this.terrain.getContext("2d");
    const fctx = this.fog.getContext("2d");
    if (!tctx || !fctx) throw new Error("Canvas 2D недоступен");

    this.tctx = tctx;
    this.fctx = fctx;
    this.image = tctx.createImageData(GRID_W, GRID_H);
    this.reset();
  }

  /** Заливает всю карту нейтральной землёй. */
  reset(): void {
    const data = this.image.data;

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const offset = (y * GRID_W + x) * 4;
        const shade = neutralShade(x, y);
        data[offset] = NEUTRAL[0] + shade;
        data[offset + 1] = NEUTRAL[1] + shade;
        data[offset + 2] = NEUTRAL[2] + shade;
        data[offset + 3] = 255; // полностью непрозрачный
      }
    }

    this.tctx.putImageData(this.image, 0, 0);
  }

  /** Заменяет карту целиком — используется для сообщения `full` при входе. */
  setOwner(owner: Uint8Array): void {
    this.reset();

    const painted: Array<[number, number]> = [];
    for (let cell = 0; cell < owner.length; cell++) {
      const slot = owner[cell] ?? 0;
      if (slot !== 0) painted.push([cell, slot]);
    }

    this.applyCells(painted);
  }

  /** Дорисовывает клетки, которые изменились на сервере (дельты из `state`). */
  applyCells(cells: Array<[number, number]>): void {
    if (cells.length === 0) return;

    const data = this.image.data;
    for (const [cell, slot] of cells) {
      const color = PALETTE[slot] ?? NEUTRAL;
      const offset = cell * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }

    this.tctx.putImageData(this.image, 0, 0);
  }

  /** Кадр: карта → игроки → вспышки → тьма → свой маркер поверх тьмы. */
  draw(canvas: HTMLCanvasElement, state: ClientState): void {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // На экранах с высокой плотностью canvas нужно увеличивать в dpr раз,
    // иначе картинка получится мыльной.
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx || width === 0 || height === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, width, height);

    const you = state.you;
    if (!you) return;

    // Камера всегда на нашем игроке: считаем, на сколько сдвинуть карту влево-вверх,
    // чтобы клетка игрока оказалась в центре экрана.
    const cameraX = you.x * CELL + CELL / 2 - width / 2;
    const cameraY = you.y * CELL + CELL / 2 - height / 2;
    const toScreenX = (cellX: number) => cellX * CELL + CELL / 2 - cameraX;
    const toScreenY = (cellY: number) => cellY * CELL + CELL / 2 - cameraY;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, -cameraX, -cameraY, GRID_W * CELL, GRID_H * CELL);

    for (const player of state.players) {
      if (!player.alive) continue;
      drawDot(ctx, toScreenX(player.x), toScreenY(player.y), PALETTE[player.slot] ?? WHITE);
    }

    for (const flash of state.flashes) {
      const x = toScreenX(flash.x);
      const y = toScreenY(flash.y);
      const radius = flash.r * CELL;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255, 240, 190, 0.5)");
      gradient.addColorStop(1, "rgba(255, 220, 140, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const selfX = toScreenX(you.x);
    const selfY = toScreenY(you.y);
    this.drawFog(ctx, width, height, dpr, selfX, selfY);

    // Себя рисуем после тьмы, чтобы свой маркер был виден всегда.
    drawDot(ctx, selfX, selfY, PALETTE[state.slot] ?? WHITE, true);
  }

  /**
   * Накладывает тьму на весь кадр, оставляя «дырку» вокруг игрока.
   *
   * Сначала слой заливается почти непрозрачным чёрным, затем в нём стирается
   * круглая область градиентом (destination-out) — края получаются мягкими.
   */
  private drawFog(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    x: number,
    y: number,
  ): void {
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.fog.width !== pixelWidth || this.fog.height !== pixelHeight) {
      this.fog.width = pixelWidth;
      this.fog.height = pixelHeight;
    }

    const fog = this.fctx;
    fog.setTransform(dpr, 0, 0, dpr, 0, 0);
    fog.clearRect(0, 0, width, height);
    fog.fillStyle = "rgba(3, 4, 9, 0.93)";
    fog.fillRect(0, 0, width, height);

    const radius = VIEW_RADIUS * CELL;
    const gradient = fog.createRadialGradient(x, y, radius * 0.35, x, y, radius);
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)"); // в центре стираем полностью
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)"); // к краю тьма остаётся

    fog.globalCompositeOperation = "destination-out";
    fog.fillStyle = gradient;
    fog.beginPath();
    fog.arc(x, y, radius, 0, Math.PI * 2);
    fog.fill();
    fog.globalCompositeOperation = "source-over";

    ctx.drawImage(this.fog, 0, 0, width, height);
  }
}

/**
 * Разброс яркости для нейтральной земли: без него карта выглядит плоским пятном.
 *
 * Значение зависит только от координат, а не от Math.random(): иначе клетки
 * «мерцали» бы при каждой перерисовке.
 */
function neutralShade(x: number, y: number): number {
  return (x * 7 + y * 13) % 5;
}

/** Кружок игрока со свечением. У своего маркера дополнительно рисуется кольцо. */
function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: [number, number, number],
  self = false,
): void {
  const [r, g, b] = color;

  ctx.save();
  ctx.shadowColor = `rgb(${r} ${g} ${b})`;
  ctx.shadowBlur = self ? 18 : 10;
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.beginPath();
  ctx.arc(x, y, self ? CELL * 0.9 : CELL * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (self) {
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, CELL * 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }
}
