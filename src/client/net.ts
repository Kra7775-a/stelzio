import type { ClientMsg, ServerMsg } from "@shared/protocol";

export type Status = "connecting" | "open" | "closed";

/**
 * Обёртка над WebSocket: сама переподключается при обрыве и отдаёт сообщения
 * через колбэки, чтобы UI не знал деталей сети.
 */
export class Net {
  private socket: WebSocket | null = null;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  onMessage: ((msg: ServerMsg) => void) | null = null;
  onStatus: ((status: Status) => void) | null = null;

  connect(): void {
    this.closed = false;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    this.socket = socket;
    this.onStatus?.("connecting");

    socket.onopen = () => this.onStatus?.("open");

    socket.onmessage = (event) => {
      try {
        this.onMessage?.(JSON.parse(String(event.data)) as ServerMsg);
      } catch {
        // Битое сообщение просто игнорируем.
      }
    };

    socket.onclose = () => {
      this.onStatus?.("closed");
      if (this.closed) return;
      // Связь оборвалась не по нашей воле — пробуем ещё раз через секунду.
      this.retry = setTimeout(() => this.connect(), 1000);
    };
  }

  send(msg: ClientMsg): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
  }
}
