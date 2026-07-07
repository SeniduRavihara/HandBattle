// Lightweight Node.js Socket.IO multiplayer game server for Gesture Arena

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for local testing
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// Keep track of rooms
// Room ID -> Room State
const rooms = new Map();

// Helper to generate 4-digit room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars like O/0/I/1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Check collision
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

// Resolve RPS winner
// Returns 0 if Draw, 1 if P1 wins, 2 if P2 wins
function resolveRPS(g1, g2) {
  if (g1 === g2) return 0;
  if (
    (g1 === 'rock' && g2 === 'scissors') ||
    (g1 === 'paper' && g2 === 'rock') ||
    (g1 === 'scissors' && g2 === 'paper')
  ) {
    return 1;
  }
  return 2;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create room
  socket.on('createRoom', ({ name }) => {
    const roomId = generateRoomCode();
    const roomState = {
      roomId,
      gameType: 'cricket', // Default
      status: 'waiting_for_players',
      players: [
        {
          id: socket.id,
          name: name || 'Player 1',
          score: 0,
          gesture: null,
          role: 'batter', // Default first batter
        },
      ],
      round: 1,
      target: null,
      overs: 2, // 12 balls limit
      throws: 0,
      maxRounds: 5, // RPS best of 5
      innings: 1,
      winner: null,
    };

    rooms.set(roomId, roomState);
    socket.join(roomId);
    
    console.log(`Room created: ${roomId} by ${socket.id}`);
    socket.emit('roomCreated', { roomId, playerIndex: 0, roomState });
  });

  // Join room
  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) {
      socket.emit('errorMsg', { message: 'Room not found.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('errorMsg', { message: 'Room is full.' });
      return;
    }

    const playerIndex = room.players.length;
    const newPlayer = {
      id: socket.id,
      name: name || `Player ${playerIndex + 1}`,
      score: 0,
      gesture: null,
      role: room.gameType === 'cricket' ? 'bowler' : null, // Host is batter, guest bowler
    };

    room.players.push(newPlayer);
    room.status = 'ready';
    socket.join(roomId);

    console.log(`User ${socket.id} joined room: ${roomId}`);
    io.to(roomId).emit('roomJoined', { roomId, playerIndex, roomState: room });
  });

  // Host configures game settings
  socket.on('configureGame', ({ roomId, gameType, settings }) => {
    const room = rooms.get(roomId);
    if (!room || room.players[0].id !== socket.id) return; // Only host can configure

    room.gameType = gameType;
    if (gameType === 'cricket') {
      room.overs = settings.overs || 2;
      room.players[0].role = 'batter';
      if (room.players[1]) room.players[1].role = 'bowler';
    } else {
      room.maxRounds = settings.maxRounds || 5;
      room.players.forEach(p => p.role = null);
    }

    // Reset scores & state
    room.players.forEach(p => {
      p.score = 0;
      p.gesture = null;
    });
    room.round = 1;
    room.target = null;
    room.throws = 0;
    room.innings = 1;
    room.winner = null;
    room.status = 'ready';

    io.to(roomId).emit('gameConfigured', { roomState: room });
  });

  // Start round countdown
  socket.on('startCountdown', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'countdown') return;

    room.status = 'countdown';
    room.players.forEach(p => p.gesture = null);

    // Broadcast trigger for countdown animation in client
    io.to(roomId).emit('countdownTriggered');
  });

  // Submit gesture
  socket.on('submitGesture', ({ roomId, gesture }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.gesture = gesture;
    console.log(`Room ${roomId}: Player ${player.name} submitted ${gesture}`);

    // If both players submitted, resolve the round!
    const bothSubmitted = room.players.every(p => p.gesture !== null);
    if (bothSubmitted) {
      resolveRound(room);
    }
  });

  // Rematch
  socket.on('rematch', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.players.forEach(p => {
      p.score = 0;
      p.gesture = null;
    });
    room.round = 1;
    room.target = null;
    room.throws = 0;
    room.innings = 1;
    room.winner = null;
    room.status = 'ready';

    if (room.gameType === 'cricket') {
      // Alternate starting roles
      room.players[0].role = room.players[0].role === 'batter' ? 'bowler' : 'batter';
      room.players[1].role = room.players[0].role === 'batter' ? 'bowler' : 'batter';
    }

    io.to(roomId).emit('rematchTriggered', { roomState: room });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find room the user was in
    for (const [roomId, room] of rooms.entries()) {
      const pIdx = room.players.findIndex(p => p.id === socket.id);
      if (pIdx !== -1) {
        room.players.splice(pIdx, 1);
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`Room deleted: ${roomId}`);
        } else {
          room.status = 'waiting_for_players';
          room.winner = null;
          room.players[0].score = 0;
          room.players[0].gesture = null;
          // Host remains
          io.to(roomId).emit('playerDisconnected', { 
            message: 'Your opponent disconnected. Waiting for a new player...',
            roomState: room 
          });
        }
        break;
      }
    }
  });
});

// Resolve the game round
function resolveRound(room) {
  const p1 = room.players[0];
  const p2 = room.players[1];
  let roundResult = {};

  if (room.gameType === 'rps') {
    const rpsOutcome = resolveRPS(p1.gesture, p2.gesture); // 0=draw, 1=p1 wins, 2=p2 wins
    
    if (rpsOutcome === 1) {
      p1.score += 1;
      roundResult = { winner: p1.name, type: 'rps_win', detail: `${p1.gesture} beats ${p2.gesture}` };
    } else if (rpsOutcome === 2) {
      p2.score += 1;
      roundResult = { winner: p2.name, type: 'rps_win', detail: `${p2.gesture} beats ${p1.gesture}` };
    } else {
      roundResult = { winner: null, type: 'draw', detail: `Both chose ${p1.gesture}` };
    }

    const winsNeeded = Math.ceil(room.maxRounds / 2);
    if (p1.score >= winsNeeded) {
      room.status = 'finished';
      room.winner = p1.name;
    } else if (p2.score >= winsNeeded) {
      room.status = 'finished';
      room.winner = p2.name;
    } else {
      room.status = 'ready';
      room.round += 1;
    }
  } else if (room.gameType === 'cricket') {
    // Hand Cricket logic
    // Gestures will be numbers: 0 to 6
    const g1Num = parseInt(p1.gesture, 10);
    const g2Num = parseInt(p2.gesture, 10);

    const batter = p1.role === 'batter' ? p1 : p2;
    const bowler = p1.role === 'bowler' ? p1 : p2;
    
    const batterThrow = p1.role === 'batter' ? g1Num : g2Num;
    const bowlerThrow = p1.role === 'bowler' ? g1Num : g2Num;

    room.throws += 1;

    if (batterThrow === bowlerThrow) {
      // OUT!
      roundResult = { type: 'out', detail: `Batter shown ${batterThrow}, matched by Bowler! OUT!` };
      
      if (room.innings === 1) {
        // Swap roles for 2nd innings
        room.innings = 2;
        room.target = batter.score + 1;
        room.throws = 0;
        
        // Swap roles
        p1.role = p1.role === 'batter' ? 'bowler' : 'batter';
        p2.role = p2.role === 'batter' ? 'bowler' : 'batter';
        
        room.status = 'ready';
      } else {
        // 2nd innings ends. Game over!
        room.status = 'finished';
        // The bowler of 2nd innings defended the target
        const firstInningsBatter = p1.role === 'bowler' ? p1 : p2; // The side that batted first
        const secondInningsBatter = p1.role === 'batter' ? p1 : p2;
        
        if (secondInningsBatter.score === room.target - 1) {
          room.winner = 'Tie';
        } else {
          room.winner = firstInningsBatter.name;
        }
      }
    } else {
      // Run scored!
      batter.score += batterThrow;
      roundResult = { type: 'runs', runs: batterThrow, detail: `Batter scores ${batterThrow} run(s).` };

      const ballsLimit = room.overs * 6;

      // In 2nd innings, check if target chased down
      if (room.innings === 2 && batter.score >= room.target) {
        room.status = 'finished';
        room.winner = batter.name;
      } else if (room.throws >= ballsLimit) {
        // Over/Balls limit reached!
        roundResult.detail += " Over limit reached!";
        if (room.innings === 1) {
          room.innings = 2;
          room.target = batter.score + 1;
          room.throws = 0;
          
          p1.role = p1.role === 'batter' ? 'bowler' : 'batter';
          p2.role = p2.role === 'batter' ? 'bowler' : 'batter';
          
          room.status = 'ready';
        } else {
          // 2nd innings ends. Game over!
          room.status = 'finished';
          const firstInningsBatter = p1.role === 'bowler' ? p1 : p2;
          const secondInningsBatter = p1.role === 'batter' ? p1 : p2;
          
          if (secondInningsBatter.score === room.target - 1) {
            room.winner = 'Tie';
          } else if (secondInningsBatter.score < room.target - 1) {
            room.winner = firstInningsBatter.name;
          }
        }
      } else {
        room.status = 'ready';
      }
    }
  }

  // Clear gestures for next round
  io.to(room.roomId).emit('roundResolved', { roomState: room, roundResult });
}

server.listen(PORT, () => {
  console.log(`Multiplayer server running on port ${PORT}`);
});
