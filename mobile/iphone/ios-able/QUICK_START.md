# NeighborGuard Quick Start Guide

## 1. Backend Setup

### Extract and Deploy
```bash
unzip neighborguard-mvp-with-push.zip
cd neighborguard-mvp/backend
npm install
```

### Configure Environment
Create `.env` file:
```env
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Push Notifications (optional)
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.yourcompany.NeighborGuard
APNS_KEY_BASE64=base64_encoded_p8_file
APNS_PRODUCTION=false
```

### Initialize Database
```bash
npx prisma db push
npx prisma db seed  # Optional: add test data
```

### Run
```bash
npm start
```

## 2. iOS App Setup

### Extract Files
```bash
unzip NeighborGuard_iOS.zip -d NeighborGuard
```

### Configure Xcode
1. Create new Xcode project "NeighborGuard"
2. Drag all .swift files into project
3. Update `AppConfig.swift`:
   ```swift
   static let baseURL = "https://your-backend-url.com/api"
   ```

### Info.plist Keys Required
- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription
- NSFileProviderDomainUsageDescription

### Enable Push Notifications
1. Add Push Notifications capability
2. Add Background Modes: Remote notifications
3. Download APNs key from Apple Developer portal

## 3. Testing

### Create Test User
1. Open app, enter email
2. Check backend logs for verification code (or email if configured)
3. Enter code to login

### Create Test Circle
Use API or seed data to create circles and add members.

## 4. Key Files to Modify

| File | Purpose | When to Change |
|------|---------|----------------|
| `AppConfig.swift` | Backend URL | Always |
| `backend/.env` | Server config | Always |
| `PushNotificationService.swift` | Push setup | For push notifications |

## 5. Common Issues

### "Unable to load event"
- Check backend is running
- Check network connectivity
- Check Xcode console for API errors

### "Event detail goes blank"
- This was fixed in latest version
- APIClient now auto-refreshes tokens

### Push notifications not working
- Must use real device (not simulator)
- Check APNs configuration in backend
- Check device token is registered in database

## 6. Support Files

- `NeighborGuard_Documentation.md` - Full technical documentation
- `NeighborGuard_iOS.zip` - iOS source code (26 Swift files)
- `neighborguard-mvp-with-push.zip` - Backend source code
