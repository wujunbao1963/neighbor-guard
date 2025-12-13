# NeighborGuard Changelog

## Session: December 13, 2025

### Bug Fixes

#### 1. Event Detail Page Blank Issue (CRITICAL FIX)
- **Problem**: Event detail page would show "Event not found" or "Unable to load event" after a few minutes
- **Root Cause**: EventDetailSheet depended on `eventViewModel.selectedEvent` which could be cleared by other parts of the app
- **Solution**: Made EventDetailSheet completely self-contained with its own `@State private var event: EventDetail?`
- **Files Changed**: `EventDetailSheet.swift`

#### 2. Token Refresh Not Working (CRITICAL FIX)
- **Problem**: API calls would fail with 401 after token expired (15 minutes)
- **Root Cause**: APIClient had no automatic token refresh mechanism
- **Solution**: Added `refreshAccessToken()` method and automatic retry on 401
- **Files Changed**: `APIClient.swift`

#### 3. Push Token Registration URL Wrong
- **Problem**: iOS app called `/push/register` but backend was `/devices/register`
- **Solution**: Fixed URLs in PushNotificationService.swift
- **Files Changed**: `PushNotificationService.swift`

#### 4. EventService Access Level
- **Problem**: `EventService()` was inaccessible due to private init
- **Solution**: Changed to use `EventService.shared` singleton
- **Files Changed**: `EventDetailSheet.swift`

#### 5. EventMedia.uploadedBy Property Name
- **Problem**: Used `uploadedBy` but model has `uploader`
- **Solution**: Changed to `m.uploader.displayName`
- **Files Changed**: `EventDetailSheet.swift`

### New Features

#### 1. Event Detail Header Improvements
- Added "First Reported" timestamp
- Added "Last Updated" timestamp
- Reorganized header layout

#### 2. Response Summary Line
- Shows: "3 viewed · 1 recommend police · 2 watching"
- Counts unique responders and reaction types

#### 3. Add Evidence & Add Note Buttons
- Same row, similar styling
- Add Evidence: purple gradient
- Add Note: purple outline

### Settings Page

#### 1. Role-Based Access
- OWNER/HOUSEHOLD: See all 4 tabs (Profile, Home, Zones, Members)
- NEIGHBOR/RELATIVE: See only Profile tab
- Info message for non-managers

#### 2. Home Tab Save Fix
- Fixed save not updating displayed data
- Added proper error handling and validation

### Push Notifications

#### 1. Backend Implementation
- Created `apnsService.js` for APNs communication
- Created `notificationService.js` for member notification
- Created `devices.js` routes for token management
- Added DeviceToken model to schema

#### 2. Notification Triggers
- New event creation → notify all members except creator
- Event resolved/false alarm → notify all members

### Debug Logging
- Added extensive logging to APNs service
- Added device registration logging
- Added notification trigger logging
- Helps diagnose push notification issues

---

## Previous Sessions Summary

### Phase 1-3: Foundation
- Authentication with email verification
- Circle and member management
- Event creation and management
- Notes and reactions

### Phase 4: Media Upload
- Photo capture and upload
- Video capture (60s max)
- Thumbnail generation
- Progress tracking

### Phase 5: Push Notifications
- APNs integration
- Device token registration
- Notification triggers
