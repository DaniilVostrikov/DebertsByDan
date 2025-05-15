// Minimal WebSocket server for Deberc
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

// In-memory game state
let players = [];
let hands = {};
let table = [];

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
      const deck = generateDeck();
      hands[players[0].name] = deck.splice(0, 10);
      hands[players[1].name] = deck.splice(0, 10);
      table = [];
    }

    broadcastState();
  });

  socket.on("play_card", ({ name, card }) => {
    if (hands[name]) {
      hands[name] = hands[name].filter(c => c !== card);
      table.push(card);
      broadcastState();
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    players = players.filter(p => p.id !== socket.id);
    hands = {};
    table = [];
    broadcastState();
  });
});

function broadcastState() {
  io.emit("game_state", {
    players,
    hands,
    table
  });
}

server.listen(PORT, () => {
  console.log(`Deberc server running on port ${PORT}`);
});