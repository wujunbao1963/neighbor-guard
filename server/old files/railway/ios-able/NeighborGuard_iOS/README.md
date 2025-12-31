# NeighborGuard iOS - Complete

All files needed for the iOS app. Pure English UI.

## Setup

1. **Xcode** → Create new iOS App project
   - Product Name: `NeighborGuard`
   - Interface: `SwiftUI`
   - Language: `Swift`

2. Delete `ContentView.swift`

3. Drag ALL Swift files into the project

4. **Important**: Add these keys to Info.plist:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>NeighborGuard needs camera access to capture evidence photos and videos</string>
   <key>NSPhotoLibraryUsageDescription</key>
   <string>NeighborGuard needs photo library access to attach evidence</string>
   <key>NSMicrophoneUsageDescription</key>
   <string>NeighborGuard needs microphone access to record video with audio</string>
   ```

5. **For Push Notifications** (optional):
   - Enable "Push Notifications" capability in Xcode
   - Enable "Background Modes" → "Remote notifications"
   - Configure APNs in Apple Developer Portal

6. Run

## Test

- Email: any email
- Code: `587585`

## Files (26)

### Core (4 files)
- AppConfig.swift - API config
- APIError.swift - Error types
- KeychainService.swift - Secure storage
- APIClient.swift - HTTP client

### Authentication (5 files)
- User.swift - User model
- AuthService.swift - Auth API
- AuthViewModel.swift - Auth state
- LoginView.swift - Login screen
- VerificationCodeView.swift - Code entry

### Theme & Models (4 files)
- Theme.swift - Colors, labels
- Models.swift - Data models
- Services.swift - API services
- ViewModels.swift - State management

### UI Components (2 files)
- Components.swift - Cards, badges, buttons
- EventCard.swift - Event card

### Pages (6 files)
- HomePage.swift - Home tab with user greeting
- EventsPage.swift - Events tab
- SettingsPage.swift - Settings tab + notifications
- CreateEventSheet.swift - Create event + media
- EventDetailSheet.swift - Event detail + upload
- MainTabView.swift - Tab navigation

### Media - Phase 4 (2 files)
- MediaService.swift - Photo & video upload API
- ImagePicker.swift - Camera, video & library picker

### Push Notifications - Phase 5 (2 files)
- PushNotificationService.swift - Push handling
- NeighborGuardApp.swift - App entry + delegate

## Features

- ✅ Authentication (email + code)
- ✅ User greeting with name
- ✅ View events from all circles
- ✅ Create events with photos/videos
- ✅ Take photos with camera
- ✅ Record videos (up to 60 seconds)
- ✅ Select from photo library
- ✅ Upload media to existing events
- ✅ Quick feedback buttons
- ✅ Search & filter events
- ✅ Owner actions (resolve, false alarm, police)
- ✅ Add notes to events
- ✅ Push notification support
- ✅ Notification settings in Settings page
