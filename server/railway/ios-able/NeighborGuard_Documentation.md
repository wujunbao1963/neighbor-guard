# NeighborGuard Project Documentation

## Project Overview

NeighborGuard is a neighborhood security app that allows community members to report and track security events, share evidence, and coordinate responses.

---

## Architecture

### Backend (Node.js + Express + PostgreSQL)
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with email verification codes
- **File Storage**: Local uploads with multipart support
- **Push Notifications**: Apple Push Notification Service (APNs)
- **Deployment**: Railway

### iOS App (SwiftUI)
- **Minimum iOS**: 17.0
- **Architecture**: MVVM with shared ViewModels
- **API Client**: Custom APIClient with automatic token refresh
- **Storage**: Keychain for tokens

---

## Key Features Implemented

### 1. Authentication
- Email-based login with verification codes
- JWT access tokens (15 minutes) + refresh tokens (7 days)
- Automatic token refresh on 401 responses

### 2. Circles (Security Groups)
- Users can belong to multiple circles
- Roles: OWNER, HOUSEHOLD, NEIGHBOR, RELATIVE
- Role-based permissions for settings access

### 3. Events (Security Incidents)
- Event types: suspicious_person, suspicious_vehicle, break_in_attempt, etc.
- Severity levels: LOW, MEDIUM, HIGH
- Status workflow: OPEN → ACKED → WATCHING → ESCALATED → RESOLVED/FALSE_ALARM
- Zone association (front_door, garage, backyard, etc.)

### 4. Notes & Reactions
- Quick response reactions with predefined options
- Free-form notes/comments
- System notes for status changes

### 5. Media Upload
- Photo and video capture
- Video compression (60 second max, medium quality)
- Thumbnail generation on server
- Progress tracking

### 6. Push Notifications
- Device token registration
- APNs integration with JWT authentication
- Notification triggers on new events and status changes
- Severity-based filtering

---

## Critical Bug Fixes & Solutions

### Issue 1: Event Detail Page Goes Blank After Minutes
**Root Cause**: The EventDetailSheet was using `eventViewModel.selectedEvent` which could be cleared by other parts of the app (pull-to-refresh, tab switching).

**Solution**: Made EventDetailSheet completely self-contained:
```swift
// Store event locally in @State
@State private var event: EventDetail?

// Fetch directly using APIClient
private func fetchEventDetail() async {
    let response: EventDetailResponse = try await APIClient.shared.request(
        path: "/events/\(circleId)/\(eventId)",
        method: .GET,
        requiresAuth: true
    )
    self.event = response.event
}
```

### Issue 2: 401 Unauthorized After Token Expires
**Root Cause**: APIClient had no automatic token refresh mechanism.

**Solution**: Added automatic token refresh to APIClient:
```swift
// Handle 401 - try refresh token
if httpResponse.statusCode == 401 && requiresAuth && !isRetry {
    if await refreshAccessToken() {
        // Retry with new token
        return try await self.request(path: path, method: method, body: body, requiresAuth: requiresAuth, isRetry: true)
    } else {
        throw APIError.unauthorized
    }
}
```

### Issue 3: Settings Page Privacy
**Root Cause**: All users could see all settings tabs regardless of role.

**Solution**: Role-based tab visibility:
```swift
var canManageCircle: Bool {
    guard let role = circleViewModel.selectedCircle?.role else { return false }
    return ["OWNER", "HOUSEHOLD"].contains(role)
}

// Show only Profile tab for non-managers
// Show all tabs for OWNER/HOUSEHOLD
```

### Issue 4: Push Notification Token Not Registering
**Root Cause**: iOS app was calling `/push/register` but backend route was `/devices/register`.

**Solution**: 
1. Fixed URL paths in PushNotificationService.swift
2. Added pending token mechanism for tokens received before login
3. Added `registerPendingToken()` call after login

### Issue 5: Video Upload Endless Spinner
**Root Cause**: Task cancellation when view refreshes, missing silent refresh option.

**Solution**:
1. Used `Task.detached` for uploads to avoid cancellation
2. Added `silent` parameter to loadEventDetail to prevent loading indicator

---

## File Structure

### iOS App Files (26 files)
```
APIClient.swift         - HTTP client with auto token refresh
APIError.swift          - Error types
AppConfig.swift         - Base URL configuration
AuthService.swift       - Login/logout/token management
AuthViewModel.swift     - Authentication state
Components.swift        - Reusable UI components
CreateEventSheet.swift  - New event creation form
EventCard.swift         - Event list item
EventDetailSheet.swift  - Event detail view (self-contained)
EventsPage.swift        - Events tab
HomePage.swift          - Home tab with active events
ImagePicker.swift       - Photo/video picker
KeychainService.swift   - Secure token storage
LoginView.swift         - Email login screen
MainTabView.swift       - Tab bar controller
MediaService.swift      - Media upload service
Models.swift            - Data models
NeighborGuardApp.swift  - App entry point
PushNotificationService.swift - Push notification handling
Services.swift          - API services (CircleService, EventService)
SettingsPage.swift      - Settings with tabs
Theme.swift             - Colors and styles
User.swift              - User model
VerificationCodeView.swift - Code input screen
ViewModels.swift        - CircleViewModel, EventViewModel
```

### Backend Files
```
src/
  config/
    database.js         - Prisma client
    constants.js        - App constants
  middleware/
    auth.js             - JWT authentication
    errorHandler.js     - Error handling
  routes/
    auth.js             - Login/refresh/logout
    circles.js          - Circle CRUD
    devices.js          - Push token management
    events.js           - Event CRUD + notes + media
    homes.js            - Home management
    uploads.js          - File upload handling
    zones.js            - Zone management
  services/
    apnsService.js      - Apple Push Notification
    notificationService.js - Send notifications
  index.js              - Express app setup

prisma/
  schema.prisma         - Database schema
  seed.js               - Test data
```

---

## Database Schema (Key Models)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  displayName   String
  deviceTokens  DeviceToken[]
  memberships   CircleMember[]
}

model Circle {
  id            String   @id @default(uuid())
  displayName   String
  members       CircleMember[]
  events        Event[]
  zones         Zone[]
}

model Event {
  id            String   @id @default(uuid())
  eventType     String
  title         String
  severity      EventSeverity
  status        EventStatus
  circleId      String
  zoneId        String
  creatorId     String
  notes         EventNote[]
  media         EventMedia[]
}

model DeviceToken {
  id            String   @id @default(uuid())
  userId        String
  token         String   @unique
  platform      Platform
  isActive      Boolean  @default(true)
}
```

---

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Push Notifications
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.yourcompany.NeighborGuard
APNS_KEY_BASE64=base64_encoded_p8_file
APNS_PRODUCTION=false
```

### iOS (AppConfig.swift)
```swift
static let baseURL = "https://your-backend.railway.app/api"
```

---

## API Endpoints

### Authentication
- `POST /api/auth/send-code` - Send verification code
- `POST /api/auth/verify-code` - Verify code, get tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Circles
- `GET /api/circles` - List user's circles
- `GET /api/circles/:id` - Get circle details
- `PUT /api/circles/:id` - Update circle
- `POST /api/circles/:id/members` - Add member

### Events
- `GET /api/events/:circleId` - List events
- `POST /api/events/:circleId` - Create event
- `GET /api/events/:circleId/:eventId` - Get event detail
- `PUT /api/events/:circleId/:eventId/status` - Update status
- `POST /api/events/:circleId/:eventId/notes` - Add note
- `POST /api/events/:circleId/:eventId/media` - Upload media

### Devices
- `POST /api/devices/register` - Register push token
- `POST /api/devices/unregister` - Unregister token

---

## Key Implementation Patterns

### 1. Self-Contained Sheets
Sheets that load their own data and don't depend on parent viewModel state:
```swift
struct EventDetailSheet: View {
    @State private var event: EventDetail?  // Own state
    
    .task {
        await fetchEventDetail()  // Own fetch
    }
}
```

### 2. Automatic Token Refresh
APIClient automatically refreshes expired tokens:
```swift
if httpResponse.statusCode == 401 && !isRetry {
    if await refreshAccessToken() {
        return try await self.request(..., isRetry: true)
    }
}
```

### 3. Silent Refresh
Refresh data without showing loading indicators:
```swift
func loadEventDetail(circleId: String, eventId: String, silent: Bool = false) async {
    if !silent {
        isLoadingDetail = true
    }
    // ... load data
}
```

### 4. Role-Based Access
Check user role before showing UI:
```swift
var canManageCircle: Bool {
    ["OWNER", "HOUSEHOLD"].contains(role)
}
```

---

## Deployment

### Backend on Railway
1. Push to GitHub
2. Connect Railway to repo
3. Set environment variables
4. Deploy

### iOS on App Store
1. Configure signing in Xcode
2. Add required Info.plist keys:
   - NSCameraUsageDescription
   - NSPhotoLibraryUsageDescription
   - NSFileProviderDomainUsageDescription
3. Archive and upload to App Store Connect

---

## Testing Checklist

- [ ] Login with email verification
- [ ] Create new event
- [ ] Upload photo/video
- [ ] Add quick response
- [ ] Add note
- [ ] Resolve event
- [ ] Pull to refresh
- [ ] Event detail stays visible after minutes
- [ ] Token refresh works automatically
- [ ] Push notifications received
- [ ] Settings privacy (role-based)

---

## Version History

- **Phase 1**: Foundation (Auth, API Client)
- **Phase 2**: Circles & Events
- **Phase 3**: Notes & Reactions
- **Phase 4**: Media Upload
- **Phase 5**: Push Notifications
- **Phase 6**: Bug Fixes (Token Refresh, Self-Contained Sheets)
