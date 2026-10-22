import { TICK_MS } from "@shared/constants";
import type { ClientMsg } from "@shared/protocol";
import { Hono } from "hono";
import { createBunWebSocket, serveStatic } from "hono/bun";
import { RoomManager } from "./room";

const { upgradeWebSocket, websocket } = createBunWebSocket();
const rooms = new RoomManager();

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    rooms: rooms.roomCount,
    players: rooms.playerCount,
  }),
);

app.get(
  "/ws",
  upgradeWebSocket(() => {
    let session: { roomId: string; playerId: string } | null = null;

    return {
      onMessage(event, ws) {
        if (typeof event.data !== "string") return;

        let msg: ClientMsg;
        try {
          msg = JSON.parse(event.data) as ClientMsg;
        } catch {
          return;
        }

        // Соединение сначала «не привязано» к игре: первое сообщение — всегда join.
        // После него запоминаем комнату и id игрока, дальше просто пересылаем намерения.
        if (!session) {
          if (msg.t !== "join") return;
          const joined = rooms.join(msg.name, { send: (data) => ws.send(data) });
          if (!joined) {
            ws.send(JSON.stringify({ t: "error", message: "Комната заполнена" }));
            ws.close(1011, "room full");
            return;
          }
          session = { roomId: joined.room.id, playerId: joined.player.id };
          return;
        }

        rooms.handle(session.roomId, session.playerId, msg);
      },

      onClose() {
        if (session) rooms.leave(session.roomId, session.playerId);
      },
    };
  }),
);

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

setInterval(() => rooms.tickAll(), TICK_MS);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
};
