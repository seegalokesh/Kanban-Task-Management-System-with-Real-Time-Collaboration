require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./config/db');
const authRoutes = require('./modules/auth/authRoutes');
const projectRoutes = require('./modules/projects/projectRoutes');
const taskRoutes = require('./modules/tasks/taskRoutes');
const { initializeSocket } = require('./modules/websocket/socket');

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'uploads')));

  app.use('/auth', authRoutes);
  app.use('/projects', projectRoutes);
  app.use('/projects', taskRoutes);

  initializeSocket(server);

  await initializeDatabase();

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`API listening on ${port}`));
}

startServer().catch((error) => console.error(error));
