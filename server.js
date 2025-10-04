const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
require('dotenv').config();

const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const { connectDB } = require('./config/database');
const { setupFilters } = require('./services/filterService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware di sicurezza
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connessione al database
connectDB();

// Setup filtri predefiniti
setupFilters();

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Chat Organizer Server',
    version: '1.0.0',
    endpoints: {
      webhook: '/webhook',
      api: '/api',
      health: '/health'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

module.exports = app;


