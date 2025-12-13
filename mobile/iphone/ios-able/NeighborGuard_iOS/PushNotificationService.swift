//
//  PushNotificationService.swift
//  NeighborGuard
//
//  Phase 5: Push Notifications
//

import Foundation
import Combine
import UserNotifications
import UIKit

class PushNotificationService: NSObject, ObservableObject {
    static let shared = PushNotificationService()
    
    @Published var deviceToken: String?
    @Published var isPermissionGranted = false
    
    private var pendingToken: String? // Token waiting to be registered
    
    private override init() {
        super.init()
    }
    
    // MARK: - Request Permission
    func requestPermission() async -> Bool {
        print("📱 Requesting push notification permission...")
        
        do {
            let options: UNAuthorizationOptions = [.alert, .badge, .sound]
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: options)
            
            print("📱 Permission granted: \(granted)")
            
            await MainActor.run {
                self.isPermissionGranted = granted
            }
            
            if granted {
                await MainActor.run {
                    print("📱 Registering for remote notifications...")
                    UIApplication.shared.registerForRemoteNotifications()
                }
                
                // If we already have a pending token, register it now
                if let token = pendingToken {
                    print("📱 Found pending token, registering now...")
                    await registerTokenWithBackend(token)
                }
            }
            
            return granted
        } catch {
            print("❌ Push notification permission error: \(error)")
            return false
        }
    }
    
    // MARK: - Check Current Status
    func checkPermissionStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await MainActor.run {
            self.isPermissionGranted = settings.authorizationStatus == .authorized
        }
    }
    
    // MARK: - Handle Device Token
    func handleDeviceToken(_ deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = token
        self.pendingToken = token
        print("📱 Received device token: \(token.prefix(20))...")
        
        // Register token with backend
        Task {
            await registerTokenWithBackend(token)
        }
    }
    
    // MARK: - Register Token with Backend
    func registerTokenWithBackend(_ token: String) async {
        guard let authToken = KeychainService.shared.load(forKey: KeychainKeys.accessToken) else {
            print("⚠️ No auth token yet, will register push token later")
            self.pendingToken = token
            return
        }
        
        let urlString = "\(AppConfig.baseURL)/devices/register"
        print("📱 Registering push token with: \(urlString)")
        
        guard let url = URL(string: urlString) else {
            print("❌ Invalid URL: \(urlString)")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let deviceName = await MainActor.run { UIDevice.current.name }
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        
        let body: [String: Any] = [
            "token": token,
            "platform": "IOS",
            "deviceName": deviceName,
            "appVersion": appVersion
        ]
        
        print("📱 Push registration body: token=\(token.prefix(20))..., platform=IOS, deviceName=\(deviceName)")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse {
                print("📱 Push registration response status: \(httpResponse.statusCode)")
                
                if httpResponse.statusCode == 200 {
                    print("✅ Push token registered with backend successfully!")
                    self.pendingToken = nil // Clear pending token
                    if let responseString = String(data: data, encoding: .utf8) {
                        print("📱 Response: \(responseString)")
                    }
                } else {
                    print("⚠️ Push token registration failed with status: \(httpResponse.statusCode)")
                    if let responseString = String(data: data, encoding: .utf8) {
                        print("📱 Error response: \(responseString)")
                    }
                }
            }
        } catch {
            print("❌ Failed to register push token: \(error)")
        }
    }
    
    // Call this after login to register any pending token
    func registerPendingToken() async {
        if let token = pendingToken ?? deviceToken {
            print("📱 Registering pending/existing token after login...")
            await registerTokenWithBackend(token)
        } else {
            print("📱 No pending token to register")
        }
    }
    
    // MARK: - Unregister Token
    func unregisterToken() async {
        guard let token = deviceToken,
              let authToken = KeychainService.shared.load(forKey: KeychainKeys.accessToken) else {
            return
        }
        
        guard let url = URL(string: "\(AppConfig.baseURL)/devices/unregister") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = ["token": token]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let _ = try await URLSession.shared.data(for: request)
            print("✅ Push token unregistered")
        } catch {
            print("❌ Failed to unregister push token: \(error)")
        }
        
        self.deviceToken = nil
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension PushNotificationService: UNUserNotificationCenterDelegate {
    
    // Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        completionHandler([.banner, .badge, .sound])
    }
    
    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        // Handle deep linking to specific event
        if let eventId = userInfo["eventId"] as? String,
           let circleId = userInfo["circleId"] as? String {
            print("📱 Notification tapped: eventId=\(eventId), circleId=\(circleId)")
            
            // Post notification for app to handle navigation
            NotificationCenter.default.post(
                name: .openEventFromPush,
                object: nil,
                userInfo: ["eventId": eventId, "circleId": circleId]
            )
        }
        
        completionHandler()
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let openEventFromPush = Notification.Name("openEventFromPush")
}
