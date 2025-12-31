# NeighborGuard Codebase Refactoring Plan

## Executive Summary

This document outlines a comprehensive refactoring of the NeighborGuard codebase to improve:
- **Maintainability**: Smaller, focused modules
- **Testability**: Separated business logic from infrastructure
- **Scalability**: Clear architectural patterns
- **Code Quality**: Consistent patterns, better error handling

## Current State Analysis

### Backend Issues
| File | Lines | Issues |
|------|-------|--------|
| fusionEngine.js | 1257 | God class - rules, engine, utilities mixed |
| auth.js | 1549 | Route handlers mixed with business logic |
| events.js | 1049 | Similar mixing of concerns |
| constants.js | 400+ | Flat structure, no organization |

### Frontend Issues
| File | Lines | Issues |
|------|-------|--------|
| SettingsPage.jsx | 1400+ | Multiple features in one component |
| EventDetailModal.jsx | 900+ | Complex state management |
| HomePage.jsx | 600+ | Mixed concerns |

## Refactoring Architecture

### Backend New Structure
```
backend/src/
├── config/
│   ├── database.js              # Prisma client
│   ├── constants/
│   │   ├── index.js             # Export aggregator
│   │   ├── sensorTypes.js       # Sensor type constants
│   │   ├── eventTypes.js        # Event type constants
│   │   ├── zoneTypes.js         # Zone type constants
│   │   └── houseModes.js        # House mode constants
│   └── environment.js           # Environment config
│
├── middleware/
│   ├── auth.js                  # Authentication middleware
│   ├── errorHandler.js          # Error handling
│   ├── validation.js            # Request validation
│   └── rateLimit.js             # Rate limiting
│
├── routes/
│   ├── index.js                 # Route aggregator
│   ├── auth.routes.js           # Auth routes (thin)
│   ├── events.routes.js         # Event routes (thin)
│   ├── circles.routes.js        # Circle routes (thin)
│   └── ...
│
├── controllers/
│   ├── auth.controller.js       # Auth request handling
│   ├── events.controller.js     # Event request handling
│   ├── circles.controller.js    # Circle request handling
│   └── ...
│
├── services/
│   ├── fusion/
│   │   ├── index.js             # FusionEngine class (orchestration)
│   │   ├── rules/
│   │   │   ├── index.js         # Rule aggregator
│   │   │   ├── breakInRules.js  # Break-in detection rules
│   │   │   ├── perimeterRules.js
│   │   │   ├── suspiciousRules.js
│   │   │   ├── packageRules.js
│   │   │   └── safetyRules.js
│   │   ├── trackManager.js      # Track creation/management
│   │   └── eventGenerator.js    # Security event creation
│   │
│   ├── notification/
│   │   ├── index.js             # Notification service
│   │   ├── scorer.js            # ML scoring logic
│   │   ├── policy.js            # Notification policy
│   │   └── channels/
│   │       ├── apns.js          # Apple push
│   │       ├── fcm.js           # Firebase (future)
│   │       └── webhook.js       # Webhook (future)
│   │
│   ├── auth/
│   │   ├── index.js             # Auth service
│   │   ├── tokenService.js      # JWT/refresh tokens
│   │   ├── appleAuth.js         # Apple Sign-In
│   │   └── googleAuth.js        # Google Sign-In
│   │
│   └── storage/
│       ├── index.js             # Storage abstraction
│       ├── localUpload.js       # Local file storage
│       └── s3Upload.js          # S3 storage (future)
│
├── repositories/
│   ├── base.repository.js       # Base CRUD operations
│   ├── event.repository.js      # Event data access
│   ├── sensor.repository.js     # Sensor data access
│   ├── track.repository.js      # Track data access
│   └── user.repository.js       # User data access
│
├── utils/
│   ├── errors.js                # Custom error classes
│   ├── logger.js                # Logging utility
│   ├── validators.js            # Input validation helpers
│   └── helpers.js               # General utilities
│
└── index.js                     # Application entry point
```

### Frontend New Structure
```
frontend/src/
├── components/
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── Modal.jsx
│   │   ├── Card.jsx
│   │   ├── LoadingSpinner.jsx
│   │   └── ErrorBoundary.jsx
│   │
│   ├── events/
│   │   ├── EventCard.jsx
│   │   ├── EventList.jsx
│   │   ├── EventDetail/
│   │   │   ├── index.jsx
│   │   │   ├── EventHeader.jsx
│   │   │   ├── EventTimeline.jsx
│   │   │   ├── EventActions.jsx
│   │   │   └── EventMedia.jsx
│   │   └── CreateEventModal.jsx
│   │
│   ├── settings/
│   │   ├── SettingsLayout.jsx
│   │   ├── ProfileSection.jsx
│   │   ├── NotificationSection.jsx
│   │   ├── ZonesSection.jsx
│   │   ├── SensorsSection.jsx
│   │   └── IntegrationsSection.jsx
│   │
│   └── layout/
│       ├── Header.jsx
│       ├── Navigation.jsx
│       └── Sidebar.jsx
│
├── hooks/
│   ├── useAuth.js
│   ├── useCircle.js
│   ├── useEvents.js
│   ├── useSensors.js
│   └── useLocalStorage.js
│
├── pages/
│   ├── HomePage.jsx             # Simplified, uses hooks
│   ├── TimelinePage.jsx
│   ├── SettingsPage.jsx         # Simplified, uses sections
│   ├── AdminPage.jsx
│   └── LoginPage.jsx
│
├── services/
│   ├── api/
│   │   ├── client.js            # Axios instance
│   │   ├── auth.api.js          # Auth endpoints
│   │   ├── events.api.js        # Event endpoints
│   │   └── circles.api.js       # Circle endpoints
│   └── storage.js               # Local storage helpers
│
├── context/
│   ├── AuthContext.jsx
│   ├── CircleContext.jsx
│   └── ThemeContext.jsx
│
├── utils/
│   ├── constants.js
│   ├── formatters.js
│   └── validators.js
│
└── App.jsx
```

## Implementation Phases

### Phase 1: Backend Core Refactoring
1. Extract constants into organized modules
2. Create repository layer
3. Split FusionEngine into focused modules
4. Implement controller pattern for routes

### Phase 2: Backend Service Layer
1. Extract auth business logic
2. Create notification service modules
3. Implement proper error handling
4. Add logging infrastructure

### Phase 3: Frontend Refactoring
1. Create common components
2. Split large page components
3. Implement custom hooks
4. Organize API services

### Phase 4: Testing & Documentation
1. Add unit tests for services
2. Add integration tests
3. Update API documentation
4. Create developer guide

## Key Patterns to Apply

### 1. Repository Pattern
```javascript
// repositories/base.repository.js
class BaseRepository {
  constructor(model) {
    this.model = model;
  }
  
  async findById(id) { ... }
  async findMany(where, options) { ... }
  async create(data) { ... }
  async update(id, data) { ... }
  async delete(id) { ... }
}
```

### 2. Service Pattern
```javascript
// services/fusion/index.js
class FusionEngine {
  constructor(trackManager, ruleEngine, eventGenerator) {
    this.trackManager = trackManager;
    this.ruleEngine = ruleEngine;
    this.eventGenerator = eventGenerator;
  }
  
  async processSensorEvent(event) {
    const track = await this.trackManager.findOrCreateTrack(event);
    const rule = this.ruleEngine.evaluate(track);
    return this.eventGenerator.createOrUpdate(track, rule);
  }
}
```

### 3. Custom Hooks Pattern
```javascript
// hooks/useEvents.js
export function useEvents(circleId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const fetchEvents = useCallback(async () => { ... }, [circleId]);
  const createEvent = useCallback(async (data) => { ... }, [circleId]);
  
  return { events, loading, error, fetchEvents, createEvent };
}
```

### 4. Error Handling Pattern
```javascript
// utils/errors.js
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

## File-by-File Changes

See individual refactoring files for detailed implementation.
