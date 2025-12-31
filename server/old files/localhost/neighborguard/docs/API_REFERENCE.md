# NeighborGuard Phase 2 - API Reference

## Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:5000/api
```

## Authentication

All API requests (except auth endpoints) require a JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Circle-specific endpoints also require the X-Circle-Id header:

```
X-Circle-Id: <circle_uuid>
```

---

## Authentication Endpoints

### Request Verification Code

```http
POST /auth/request-code
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification code sent",
  "expiresIn": 600
}
```

### Login

```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "587585"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John",
    "avatarUrl": null
  },
  "circles": [
    {
      "id": "uuid",
      "displayName": "Home",
      "role": "OWNER",
      "home": {
        "displayName": "My House",
        "houseType": "DETACHED",
        "houseMode": "HOME"
      }
    }
  ],
  "tokens": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": "15m"
  },
  "isNewUser": false
}
```

### Refresh Token

```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "userId": "uuid",
  "refreshToken": "refresh_token"
}
```

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token"
}
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": { ... },
  "circles": [ ... ]
}
```

---

## Events Endpoints

### List Events

```http
GET /circles/:circleId/events
Authorization: Bearer <token>
X-Circle-Id: <circleId>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| pageSize | number | Items per page (default: 20, max: 100) |
| status | string | Filter by status (OPEN, ACKED, RESOLVED, etc.) |
| severity | string | Filter by severity (HIGH, MEDIUM, LOW) |
| eventType | string | Filter by event type |
| dateFrom | ISO date | Start date |
| dateTo | ISO date | End date |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "eventType": "suspicious_person",
      "title": "Person detected in backyard",
      "severity": "MEDIUM",
      "status": "OPEN",
      "occurredAt": "2025-12-12T10:30:00Z",
      "zone": {
        "id": "uuid",
        "displayName": "Backyard"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 45,
  "totalPages": 3
}
```

### Get Recent Events

```http
GET /circles/:circleId/events/recent
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | number | Max events to return (default: 50) |

### Get Open Events

```http
GET /circles/:circleId/events/open
Authorization: Bearer <token>
```

### Get Event Details

```http
GET /circles/:circleId/events/:eventId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "eventType": "break_in_attempt",
    "title": "Break-in attempt detected",
    "description": "Front door opened with indoor motion",
    "severity": "HIGH",
    "status": "OPEN",
    "occurredAt": "2025-12-12T10:30:00Z",
    "zone": { ... },
    "primaryTrack": {
      "id": "uuid",
      "objectType": "PERSON",
      "firstSeenAt": "2025-12-12T10:29:30Z",
      "lastSeenAt": "2025-12-12T10:30:15Z",
      "dwellSecondsPrivate": 45,
      "zonesVisited": ["FRONT_DOOR", "LIVING_ROOM"],
      "sensorEvents": [
        {
          "id": "uuid",
          "sensor": {
            "name": "Front Door Contact",
            "sensorType": "DOOR_CONTACT"
          },
          "triggerState": "on",
          "occurredAt": "2025-12-12T10:29:30Z"
        }
      ]
    },
    "media": [],
    "feedback": [],
    "mlFeatures": { ... }
  }
}
```

### Update Event Status

```http
PUT /circles/:circleId/events/:eventId/status
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "RESOLVED"
}
```

**Valid Statuses:** OPEN, ACKED, WATCHING, RESOLVED, FALSE_ALARM

### Submit Feedback

```http
POST /circles/:circleId/events/:eventId/feedback
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "rating": 1,
  "label": "FALSE_ALARM",
  "notes": "It was just the wind"
}
```

**Valid Labels:** FALSE_ALARM, USEFUL

### Create Manual Event

```http
POST /circles/:circleId/events
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "zoneId": "uuid",
  "eventType": "suspicious_person",
  "title": "Suspicious person at front door",
  "description": "Saw someone looking through window",
  "severity": "MEDIUM"
}
```

---

## Home Endpoints

### Get Home

```http
GET /circles/:circleId/home
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "My House",
    "houseType": "DETACHED",
    "houseMode": "HOME",
    "hasDriveway": true,
    "hasBackYard": true,
    "hasBackAlley": false,
    "nightModeAuto": false,
    "nightModeStart": "22:00",
    "nightModeEnd": "06:00"
  }
}
```

### Update Home

```http
PUT /circles/:circleId/home
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "displayName": "Updated Name",
  "nightModeAuto": true,
  "nightModeStart": "23:00"
}
```

### Set House Mode

```http
PUT /circles/:circleId/home/mode
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "mode": "AWAY"
}
```

**Valid Modes:** DISARMED, HOME, AWAY, NIGHT

---

## Zones Endpoints

### List Zones

```http
GET /circles/:circleId/zones
Authorization: Bearer <token>
```

### Create Zone

```http
POST /circles/:circleId/zones
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "displayName": "Front Porch",
  "zoneType": "PORCH",
  "privacyLevel": "SEMI_PRIVATE",
  "isEntryPoint": false
}
```

### Update Zone

```http
PUT /circles/:circleId/zones/:zoneId
Authorization: Bearer <token>
```

### Delete Zone

```http
DELETE /circles/:circleId/zones/:zoneId
Authorization: Bearer <token>
```

---

## Sensors Endpoints

### List Sensors

```http
GET /circles/:circleId/sensors
Authorization: Bearer <token>
```

### Update Sensor

```http
PUT /circles/:circleId/sensors/:sensorId
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "zoneId": "new_zone_uuid",
  "isEnabled": true
}
```

---

## Webhook Endpoint

### Home Assistant Webhook

```http
POST /webhooks/ha/:integrationId
```

**Request Body:**
```json
{
  "entity_id": "binary_sensor.front_door",
  "state": "on",
  "attributes": {
    "device_class": "door",
    "friendly_name": "Front Door"
  },
  "context": {
    "id": "context_id",
    "timestamp": "2025-12-12T10:30:00Z"
  }
}
```

**With Camera AI Flags:**
```json
{
  "entity_id": "camera.front_yard",
  "state": "person",
  "attributes": {
    "friendly_name": "Front Yard Camera"
  },
  "flags": ["person", "loitering"]
}
```

**Valid Flags:**
- `person`, `vehicle`, `animal`, `package`
- `loiter`, `loitering`, `linger`
- `intrusion`, `line_cross`, `forced_entry`
- `item_forgotten`, `delivered`
- `item_taken`, `removed`
- `repeated`, `seen_before`

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request data |
| MISSING_CREDENTIALS | 400 | Required fields missing |
| INVALID_TOKEN | 401 | JWT token invalid |
| TOKEN_EXPIRED | 401 | JWT token expired |
| NOT_MEMBER | 403 | Not a circle member |
| INSUFFICIENT_ROLE | 403 | Role doesn't have permission |
| NOT_FOUND | 404 | Resource not found |
| DUPLICATE_ENTRY | 409 | Resource already exists |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

- Authentication endpoints: 10 requests per minute per IP
- API endpoints: 100 requests per minute per user
- Webhook endpoints: 1000 requests per minute per integration

---

## Pagination

List endpoints support pagination:

```
GET /api/circles/:id/events?page=2&pageSize=20
```

Response includes:
```json
{
  "page": 2,
  "pageSize": 20,
  "total": 45,
  "totalPages": 3
}
```
