// Enhanced WebSocket server for Deberc with turn order, trump suit, and round handling
const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

let players = [];
let hands = {};
let table = [];
let trump = "";
let turnIndex = 0;
let deck = [];

const generateDeck = () => {
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("join", ({ name }) => {
    if (!players.find(p => p.name === name)) {
      players.push({ id: socket.id, name });
    }

    if (players.length === 2) {
      deck = generateDeck();
      trump = deck[deck.length - 1].slice(-1); // Last card suit as trump
      hands[players[0].name] = deck.splice(0, 10);
      hands[players[1].name] = deck.splice(0, 10);
      table = [];
      turnIndex = 0;
    }

    broadcastState();
  });

  socket.on("play_card", ({ name, card }) => {
    if (players[turnIndex].name !== name) return;
    if (!hands[name]?.includes(card)) return;

    hands[name] = hands[name].filter(c => c !== card);
    table.push({ name, card });

    // Advance turn
    turnIndex = (turnIndex + 1) % players.length;

    // Check if round is over (2 cards on table)
    if (table.length === 2) {
      setTimeout(() => {
        table = [];
        broadcastState();
      }, 1000);
    }

    broadcastState();
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    players = players.filter(p => p.id !== socket.id);
    hands = {};
    table = [];
    trump = "";
    turnIndex = 0;
    broadcastState();
  });
});

function broadcastState() {
  const turn = players[turnIndex]?.name;
  io.emit("game_state", {
    players,
    hands,
    table,
    trump,
    turn
  });
}

app.get("/", (req, res) => {
  res.send("\u0414\u0435\u0431\u0435\u0440\u0446 WebSocket \u0441\u0435\u0440\u0432\u0435\u0440 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442");
});

server.listen(PORT, () => {
  console.log(`Deberc server running on port ${PORT}`);
});