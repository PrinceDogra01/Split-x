const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const { logEmailConfigStatus } = require('./utils/email');

const app = express();

// logEmailConfigStatus();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Block API calls if DB is down (keeps dev server usable)
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  if (!req.path.startsWith('/api')) return next();

  // 1 = connected
  if (mongoose.connection.readyState === 1) return next();

  return res.status(503).json({
    message: 'Database unavailable. Check your MongoDB connection / Atlas IP whitelist.',
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/invite', require('./routes/invite'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/balances', require('./routes/balances'));
app.use('/api/settlements', require('./routes/settlements'));
app.use('/api/payments', require('./routes/payments'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const hasExplicitPort = process.env.PORT != null && String(process.env.PORT).trim() !== '';
const desiredPort = Number(process.env.PORT) || 5000;

const startServer = (port, attemptsLeft = 20) => {
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      if (hasExplicitPort) {
        console.error(`Port ${port} is already in use. Stop the other process or set PORT to a free port (e.g. PORT=5001).`);
        process.exit(1);
      }

      if (attemptsLeft <= 0) {
        console.error(`Unable to find a free port starting from ${desiredPort}.`);
        process.exit(1);
      }

      console.warn(`Port ${port} is in use; trying ${port + 1}...`);
      startServer(port + 1, attemptsLeft - 1);
      return;
    }

    console.error('Server error:', error);
    process.exit(1);
  });
};

startServer(desiredPort);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('MongoDB connection error:', error?.message || error);
  });

module.exports = app;


