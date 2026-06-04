const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./config/db');
const authRouter = require('./routes/auth');
const itemsRouter = require('./routes/items');
const claimsRouter = require('./routes/claims');
const reportsRouter = require('./routes/reports');
const systemRouter = require('./routes/system');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing (CORS) and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Register API Routes
app.use('/api/auth', authRouter);
app.use('/api/items', itemsRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/system', systemRouter);

// Fallback: Send index.html for any client-side routes (Single Page App style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database pool and start the Express server
async function startServer() {
  await db.initDb();
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 Smart Lost & Found Server successfully running on Port ${PORT}`);
    console.log(`📂 Web Application UI: http://localhost:${PORT}`);
    console.log(`================================================================`);
  });
}

startServer();
