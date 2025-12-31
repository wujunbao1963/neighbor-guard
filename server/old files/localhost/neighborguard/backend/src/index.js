// ============================================================================
// NeighborGuard Backend - Phase 2 Entry Point
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Routes
const configRoutes = require('./routes/config');
const authRoutes = require('./routes/auth');
const circleRoutes = require('./routes/circles');
const homeRoutes = require('./routes/homes');
const zoneRoutes = require('./routes/zones');
const eventRoutes = require('./routes/events');
const uploadRoutes = require('./routes/uploads');
const deviceRoutes = require('./routes/devices');
// Phase 1B Routes
const integrationRoutes = require('./routes/integrations');
const sensorRoutes = require('./routes/sensors');
const webhookRoutes = require('./routes/webhooks');
// Phase 2 Routes
const devRoutes = require('./routes/dev');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// Middleware
// ============================================================================

// CORS - Support both local development and Railway deployment
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    
    // Also allow any railway.app subdomain
    if (origin.includes('.railway.app') || origin.includes('.up.railway.app')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================================================
// Health Check
// ============================================================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    phase: 4,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development'
  });
});

// ============================================================================
// API Routes - All Phases
// ============================================================================
app.use('/api/config', configRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/circles', circleRoutes);
app.use('/api/homes', homeRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/devices', deviceRoutes);
// Phase 1B Routes
app.use('/api/integrations', integrationRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/webhooks', webhookRoutes);
// Phase 2 Routes (dev only)
app.use('/api/dev', devRoutes);

// ============================================================================
// 404 Handler
// ============================================================================
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND'
    }
  });
});

// ============================================================================
// Error Handler
// ============================================================================
app.use(errorHandler);

// ============================================================================
// Start Server
// ============================================================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏠 NeighborGuard Backend - Phase 4 (Complete API)           ║
║                                                               ║
║   Status: Running                                             ║
║   Port: ${PORT}                                                  ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(42)}║
║                                                               ║
║   Config:     GET  /api/config/*                              ║
║                                                               ║
║   Auth:       POST /api/auth/request-code                     ║
║               POST /api/auth/login                            ║
║               POST /api/auth/refresh                          ║
║               POST /api/auth/logout                           ║
║               GET  /api/auth/me                               ║
║               PUT  /api/auth/me                               ║
║                                                               ║
║   Circles:    GET    /api/circles                             ║
║               GET    /api/circles/:id                         ║
║               POST   /api/circles                             ║
║               PUT    /api/circles/:id                         ║
║               DELETE /api/circles/:id                         ║
║               POST   /api/circles/:id/members                 ║
║               PUT    /api/circles/:id/members/:mid            ║
║               DELETE /api/circles/:id/members/:mid            ║
║                                                               ║
║   Homes:      GET    /api/homes/:circleId                     ║
║               PUT    /api/homes/:circleId                     ║
║                                                               ║
║   Zones:      GET    /api/zones/:circleId                     ║
║               PUT    /api/zones/:circleId/:zoneId             ║
║               PUT    /api/zones/:circleId/batch               ║
║               POST   /api/zones/:circleId/reorder             ║
║                                                               ║
║   Events:     GET    /api/events/:circleId                    ║
║               GET    /api/events/:circleId/:eventId           ║
║               POST   /api/events/:circleId                    ║
║               PUT    /api/events/:circleId/:eventId           ║
║               PUT    /api/events/:circleId/:eventId/status    ║
║               PUT    /api/events/:circleId/:eventId/police    ║
║               DELETE /api/events/:circleId/:eventId           ║
║               POST   /api/events/:circleId/:eventId/notes     ║
║               GET    /api/events/:circleId/:eventId/notes     ║
║                                                               ║
║   Uploads:    POST   /api/uploads/:circleId/:eventId          ║
║               GET    /api/uploads/:circleId/:eventId          ║
║               DELETE /api/uploads/:circleId/:mediaId          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
