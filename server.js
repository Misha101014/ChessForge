const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((req, res) => {
  let file = path.join(__dirname, "public", "index.html");

  if (req.url.startsWith("/game/")) {
    file = path.join(__dirname, "public", "index.html");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Chess Forge server error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function makeRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "create") {
      let code = makeRoomCode();

      while (rooms.has(code)) {
        code = makeRoomCode();
      }

      rooms.set(code, {
        players: [ws],
        moves: []
      });

      ws.room = code;
      ws.player = 1;

      send(ws, {
        type: "room",
        code,
        player: 1
      });

      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Комната не найдена"
        });
        return;
      }

      if (room.players.length >= 2) {
        send(ws, {
          type: "error",
          message: "Комната уже заполнена"
        });
        return;
      }

      room.players.push(ws);

      ws.room = code;
      ws.player = 2;

      send(ws, {
        type: "room",
        code,
        player: 2
      });

      for (const player of room.players) {
        send(player, {
          type: "start",
          players: room.players.length
        });
      }

      return;
    }

    if (msg.type === "move") {
      const room = rooms.get(ws.room);
      if (!room) return;

      room.moves.push(msg.move);

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "move",
            move: msg.move
          });
        }
      }
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.room);
    if (!room) return;

    room.players = room.players.filter(p => p !== ws);

    for (const player of room.players) {
      send(player, {
        type: "opponent_left"
      });
    }

    if (room.players.length === 0) {
      rooms.delete(ws.room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chess Forge running on port ${PORT}`);
});
