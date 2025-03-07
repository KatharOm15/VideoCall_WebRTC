const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { networkInterfaces } = require('os');

const app = express();
app.use(cors());

app.get("/",(req,res)=>{
  console.log("working")
})

app.listen(5001,()=>{
  console.log("running")
})
 
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Get local IP address
function getLocalIP() {
  
  return 'localhost';
}

// Endpoint to get server IP
// app.get('/get-ip', (req, res) => {
//   res.json({ ip: getLocalIP() });
// });

// Store active users and their rooms
const rooms = new Map();
const userConnections = new Map();
const roomHosts = new Map(); // Store host of each room

function broadcastToRoom(roomId, message, excludeUser = null) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).forEach(userId => {
      if (userId !== excludeUser && userConnections.has(userId)) {
        const ws = userConnections.get(userId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }
    });
  }
}

wss.on('connection', (ws) => {
  const userId = Date.now().toString();
  console.log('New connection:', userId);
  
  userConnections.set(userId, ws);

  // Send the user their ID
  ws.send(JSON.stringify({
    type: 'user-id',
    userId: userId
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      let room;

      switch (data.type) {
        case 'join-room':
          console.log(`User ${userId} joining room: ${data.room}`);
          if (!rooms.has(data.room)) {
            rooms.set(data.room, new Set());
            roomHosts.set(data.room, userId); // Set host if room is new
          }
          room = rooms.get(data.room);
          room.add(userId);

          ws.roomId = data.room;
          ws.userId = userId;

          console.log(`Current users in room ${data.room}:`, Array.from(room));

          // Send meeting link if user is host
          if (roomHosts.get(data.room) === userId) {
            ws.send(JSON.stringify({
              type: 'meeting-link',
              link: `http://localhost:${PORT}/join/${data.room}`
            }));
          }

          // Send current users list to new user
          ws.send(JSON.stringify({
            type: 'all-users',
            users: Array.from(room).filter(id => id !== userId)
          }));

          // Notify others in room
          broadcastToRoom(data.room, {
            type: 'user-joined',
            userId: userId
          }, userId);
          break;

          case 'user-call':
            console.log(`User ${userId} calling ${data.to}`);
            if (userConnections.has(data.to)) {
              userConnections.get(data.to).send(JSON.stringify({
                type: 'incoming-call',
                from: userId,
                offer: data.offer
              }));
            }
            break;

        case 'accept-call':
          console.log(`User ${userId} accepted call from ${data.to}`);
          if (userConnections.has(data.to)) {
            userConnections.get(data.to).send(JSON.stringify({
              type: 'call-accepted',
              from: userId,
              answer: data.answer
            }));
          }
          break;

        case 'decline-call':
          console.log(`User ${userId} declined call from ${data.to}`);
          if (userConnections.has(data.to)) {
            userConnections.get(data.to).send(JSON.stringify({
              type: 'call-declined',
              from: userId
            }));
          }
          break;

        case 'candidate':
          console.log(`ICE candidate from ${userId} to ${data.to}`);
          if (userConnections.has(data.to)) {
            userConnections.get(data.to).send(JSON.stringify({
              type: 'candidate',
              from: userId,
              candidate: data.candidate
            }));
          }
          break;

        case 'leave-room':
          if (ws.roomId && rooms.has(ws.roomId)) {
            const room = rooms.get(ws.roomId);
            room.delete(userId);
            console.log(`User ${userId} left room ${ws.roomId}`);
            if (room.size === 0) {
              rooms.delete(ws.roomId);
              roomHosts.delete(ws.roomId);
            } else {
              broadcastToRoom(ws.roomId, {
                type: 'user-left',
                userId: userId
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      const room = rooms.get(ws.roomId);
      room.delete(userId);
      console.log(`User ${userId} disconnected from room ${ws.roomId}`);
      if (room.size === 0) {
        rooms.delete(ws.roomId);
        roomHosts.delete(ws.roomId);
      } else {
        broadcastToRoom(ws.roomId, {
          type: 'user-left',
          userId: userId
        });
      }
    }
    userConnections.delete(userId);
  });
});

const PORT =5000;
server.listen(PORT,  () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local network access: http://${getLocalIP()}:${PORT}`);
});
