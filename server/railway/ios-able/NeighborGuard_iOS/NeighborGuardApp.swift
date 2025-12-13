//
//  NeighborGuardApp.swift
//  NeighborGuard
//
//  App Entry Point with Push Notification Support
//

import SwiftUI
import UserNotifications

@main
struct NeighborGuardApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()
    @Environment(\.scenePhase) private var scenePhase
    
    var body: some Scene {
        WindowGroup {
            RootView(viewModel: authViewModel)
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    if newPhase == .active {
                        // Clear badge when app becomes active
                        UNUserNotificationCenter.current().setBadgeCount(0)
                        UIApplication.shared.applicationIconBadgeNumber = 0
                    }
                }
        }
    }
}

// MARK: - App Delegate for Push Notifications
class AppDelegate: NSObject, UIApplicationDelegate {
    
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set up push notification delegate
        UNUserNotificationCenter.current().delegate = PushNotificationService.shared
        
        // Clear badge on launch
        application.applicationIconBadgeNumber = 0
        
        return true
    }
    
    func applicationDidBecomeActive(_ application: UIApplication) {
        // Clear badge when app becomes active
        application.applicationIconBadgeNumber = 0
        
        // Also clear notification center
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushNotificationService.shared.handleDeviceToken(deviceToken)
    }
    
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("❌ Failed to register for remote notifications: \(error)")
    }
}

// MARK: - Root View
struct RootView: View {
    @ObservedObject var viewModel: AuthViewModel
    
    var body: some View {
        Group {
            switch viewModel.authState {
            case .loading:
                VStack(spacing: 16) {
                    ProgressView()
                    Text("Loading...")
                        .foregroundColor(.secondary)
                }
                
            case .loggedOut:
                if viewModel.isCodeSent {
                    VerificationCodeView(viewModel: viewModel)
                } else {
                    LoginView(viewModel: viewModel)
                }
                
            case .loggedIn:
                MainTabView(authViewModel: viewModel)
                    .task {
                        // Request push notification permission after login
                        let granted = await PushNotificationService.shared.requestPermission()
                        print("📱 Push permission after login: \(granted)")
                        
                        // Register any pending token now that we're logged in
                        await PushNotificationService.shared.registerPendingToken()
                    }
            }
        }
        .animation(.easeInOut, value: viewModel.authState.description)
    }
}

extension AuthState {
    var description: String {
        switch self {
        case .loading: return "loading"
        case .loggedOut: return "loggedOut"
        case .loggedIn: return "loggedIn"
        }
    }
}
