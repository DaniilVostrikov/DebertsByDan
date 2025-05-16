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
let takenCards = { }; // взятки игроков
let scores = { }; // очки игроков

const suits = ["♠️", "♥️", "♦️", "♣️"];
const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];

// очки карт (примерный подсчет в Деберц)
const cardPoints = {
  "7": 0,
  "8": 0,
  "9": 0,
  "10": 10,
  "J": 2,
  "Q": 3,
  "K": 4,
  "A": 11
};

const generateDeck = () => {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

const cardValue = (card) => cardPoints[card.rank] || 0;

const cardStr = (card) => card.rank + card.suit;

function canBeat(cardToPlay, cardOnTable, trump) {
  // Карта бьет другую если:
  // 1. Та же масть и старший ранг
  // 2. Козырь и карта на столе не козырь
  if (cardToPlay.suit === cardOnTable.suit) {
    return ranks.indexOf(cardToPlay.rank) > ranks.indexOf(cardOnTable.rank);
  }
  if (cardToPlay.suit === trump && cardOnTable.suit !== trump) {
    return true;
  }
  return false;
}

function getWinnerCard(cardsOnTable, trump) {
  // cardsOnTable = [{name, card:{rank, suit}} ...]
  // возвращает имя игрока, который выиграл взятку
  let winningCard = cardsOnTable[0].card;
  let winner = cardsOnTable[0].name;
  for (const c of cardsOnTable.slice(1)) {
    if (canBeat(c.card, winningCard, trump)) {
      winningCard = c.card;
      winner = c.name;
    }
  }
  return winner;
}

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("join", ({ name }) => {
    if (!players.find(p => p.name === name)) {
      players.push({ id: socket.id, name });
    }

    if (players.length === 2 && Object.keys(hands).length === 0) {
      deck = generateDeck();
      trump = deck[deck.length - 1].suit;

      hands[players[0].name] = deck.splice(0, 10);
      hands[players[1].name] = deck.splice(0, 10);

      takenCards = { [players[0].name]: [], [players[1].name]: [] };
      scores = { [players[0].name]: 0, [players[1].name]: 0 };

      table = [];
      turnIndex = 0;
    }

    broadcastState();
  });

  socket.on("play_card", ({ name, card }) => {
    if (players[turnIndex]?.name !== name) {
      socket.emit("error_message", "Не ваш ход");
      return;
    }

    // Проверим есть ли такая карта в руке
    const cardIndex = hands[name].findIndex(c => cardStr(c) === card);
    if (cardIndex === -1) {
      socket.emit("error_message", "У вас нет такой карты");
      return;
    }

    const cardToPlay = hands[name][cardIndex];

    // Проверка правил:
    // Если на столе нет карт - ходить можно любой
    // Если на столе одна карта - нужно бить, если можно
    if (table.length === 1) {
      const firstCard = table[0].card;
      const canBeatCard = canBeat(cardToPlay, firstCard, trump);

      // Проверяем, есть ли у игрока карты, которыми он может побить
      const hasToBeat = hands[name].some(c => canBeat(c, firstCard, trump));
      if (hasToBeat && !canBeatCard) {
        socket.emit("error_message", "Нужно побить карту на столе");
        return;
      }
    }

    // Снимаем карту с руки
    hands[name].splice(cardIndex, 1);

    // Кладем на стол
    table.push({ name, card: cardToPlay });

    if (table.length === players.length) {
      // Определяем победителя взятки
      const winner = getWinnerCard(table, trump);

      // Добавляем карты на взятки победителя
      takenCards[winner].push(...table.map(c => c.card));

      // Пересчитываем очки
      scores[winner] = takenCards[winner].reduce((acc, c) => acc + cardValue(c), 0);

      // Очищаем стол и устанавливаем ход победителя
      table = [];
      turnIndex = players.findIndex(p => p.name === winner);
    } else {
      // Передаем ход следующему игроку
      turnIndex = (turnIndex + 1) % players.length;
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
    takenCards = {};
    scores = {};
    broadcastState();
  });
});

function broadcastState() {
  const turn = players[turnIndex]?.name;
  io.emit("game_state", {
    players,
    hands: serializeHands(hands),
    table: serializeTable(table),
    trump,
    turn,
    scores,
  });
}

function serializeHands(hands) {
  const result = {};
  for (const p in hands) {
    result[p] = hands[p].map(cardStr);
  }
  return result;
}

function serializeTable(table) {
  return table.map(({ name, card }) => ({ name, card: cardStr(card) }));
}

app.get("/", (req, res) => {
  res.send("Деберц WebSocket сервер работает");
});

server.listen(PORT, () => {
  console.log(`Deberc server running on port ${PORT}`);
});
