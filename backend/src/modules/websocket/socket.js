const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');

let io;

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization;
    if (!token) return next(new Error('Authentication failed'));
    try {
      const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET || 'dev-secret');
      const userResult = await query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
      if (userResult.rows.length === 0) return next(new Error('Authentication failed'));
      socket.user = { id: userResult.rows[0].id };
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-project-room', async (projectId) => {
      const membership = await query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, socket.user.id]);
      if (membership.rows.length === 0) {
        socket.emit('error', { message: 'Unauthorized access to project room' });
        return;
      }
      socket.join(`project:${projectId}`);
      socket.emit('joined-project-room', { projectId });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIo() {
  return io;
}

function emitProjectEvent(projectId, eventName, payload) {
  if (io) {
    io.to(`project:${projectId}`).emit(eventName, payload);
  }
}

module.exports = { initializeSocket, getIo, emitProjectEvent };
