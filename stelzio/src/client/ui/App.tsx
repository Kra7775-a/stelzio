import { decodeBytes } from "@shared/codec";
import type { Dir, ServerMsg } from "@shared/protocol";
import { useEffect, useRef, useState } from "react";
import { Net, type Status } from "../net";
import { Renderer } from "../render/renderer";
import { state } from "../store";

/**
 * Клавиша → направление. Английские буквы продублированы русскими: если у игрока
 * включена раскладка ЙЦУКЕН, WASD нажимаются как ЦФЫВ.
 */
const KEY_DIR: Record<string, Dir> = {
  arrowup: "up",
  w: "up",
  ц: "up",
  arrowdown: "down",
  s: "down",
  ы: "down",
  arrowleft: "left",
  a: "left",
  ф: "left",
  arrowright: "right",
  d: "right",
  в: "right",
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const netRef = useRef<Net | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const joinedRef = useRef(false);

  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [energy, setEnergy] = useState(0);
  const [room, setRoom] = useState("");
  const [players, setPlayers] = useState(0);
  const [own, setOwn] = useState(0);

  useEffect(() => {
    rendererRef.current = new Renderer();

    const net = new Net();
    netRef.current = net;
    net.onStatus = setStatus;

    net.onMessage = (msg: ServerMsg) => {
      switch (msg.t) {
        case "welcome":
          state.playerId = msg.playerId;
          state.slot = msg.slot;
          state.roomId = msg.roomId;
          joinedRef.current = true;
          setRoom(msg.roomId);
          setJoined(true);
          break;
        case "full":
          rendererRef.current?.setOwner(decodeBytes(msg.owner));
          break;
        case "state":
          state.you = msg.you;
          state.players = msg.players;
          state.flashes = msg.flashes;
          state.tick = msg.tick;
          state.score = msg.score;
          rendererRef.current?.applyCells(msg.cells);
          break;
        case "error":
          console.warn(msg.message);
          break;
      }
    };

    net.connect();
    return () => net.close();
  }, []);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas && rendererRef.current) {
        rendererRef.current.draw(canvas, state);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setEnergy(state.you?.energy ?? 0);
      setPlayers(state.players.length + (state.you ? 1 : 0));
      setOwn(state.score[state.slot] ?? 0);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!joinedRef.current) return;

      const dir = KEY_DIR[event.key.toLowerCase()];
      if (dir) {
        event.preventDefault();
        netRef.current?.send({ t: "input", dir });
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        netRef.current?.send({ t: "action", kind: "flash" });
        return;
      }

      if (event.key === "Shift") {
        netRef.current?.send({ t: "action", kind: "dash" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const join = () => {
    netRef.current?.send({ t: "join", name: name.trim() || "anon" });
  };

  return (
    <div className="game">
      <canvas ref={canvasRef} className="board" />

      {joined ? (
        <div className="hud">
          <div className="hud-energy">
            <span className="label">энергия</span>
            <div className="bar">
              <div className="fill" style={{ width: `${energy}%` }} />
            </div>
            <span className="value">{energy}</span>
          </div>
          <div className="hud-meta">
            <span>комната {room}</span>
            <span>игроков {players}</span>
            <span>клеток {own}</span>
          </div>
        </div>
      ) : (
        <div className="overlay">
          <div className="panel">
            <h1>stelzio</h1>
            <p className="tagline">Крась землю. Прячься в темноте. Режь чужие следы.</p>

            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") join();
              }}
              placeholder="Ник"
              maxLength={16}
              autoFocus
            />

            <button type="button" onClick={join} disabled={status !== "open"}>
              Войти в игру
            </button>

            <p className="hint">WASD / стрелки — движение · Пробел — вспышка · Shift — рывок</p>
            <p className="status">
              {status === "open"
                ? "сервер на связи"
                : status === "connecting"
                  ? "подключаюсь…"
                  : "нет связи, переподключаюсь"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
