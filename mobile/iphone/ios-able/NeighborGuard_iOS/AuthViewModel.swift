//
//  AuthViewModel.swift
//  NeighborGuard
//
//  Phase 2: Authentication
//

import Foundation
import SwiftUI
import Combine

// MARK: - Auth State
enum AuthState {
    case loading
    case loggedOut
    case loggedIn(User)
}

// MARK: - Auth View Model
@MainActor
class AuthViewModel: ObservableObject {
    
    // MARK: - Published State
    @Published var authState: AuthState = .loading
    @Published var circles: [CircleSummary] = []
    
    // Login flow state
    @Published var email: String = ""
    @Published var verificationCode: String = ""
    @Published var isCodeSent: Bool = false
    
    // UI state
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    
    // MARK: - Services
    private let authService = AuthService.shared
    
    // MARK: - Computed
    var currentUser: User? {
        if case .loggedIn(let user) = authState {
            return user
        }
        return nil
    }
    
    var isLoggedIn: Bool {
        if case .loggedIn = authState {
            return true
        }
        return false
    }
    
    var currentEmail: String {
        email
    }
    
    // MARK: - Initialize
    init() {
        Task {
            await checkLoginStatus()
        }
    }
    
    // MARK: - Check Login Status on App Launch
    func checkLoginStatus() async {
        if authService.isLoggedIn {
            do {
                let user = try await authService.getCurrentUser()
                authState = .loggedIn(user)
            } catch {
                // Token invalid, clear and show login
                print("❌ Token invalid: \(error.localizedDescription)")
                await authService.logout()
                authState = .loggedOut
            }
        } else {
            authState = .loggedOut
        }
    }
    
    // MARK: - Request Verification Code
    func requestCode(email: String? = nil) async {
        if let newEmail = email {
            self.email = newEmail
        }
        let trimmedEmail = self.email.lowercased().trimmingCharacters(in: .whitespaces)
        
        guard !trimmedEmail.isEmpty else {
            errorMessage = "Please enter your email"
            return
        }
        
        guard trimmedEmail.contains("@") else {
            errorMessage = "Please enter a valid email"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        do {
            try await authService.requestCode(email: trimmedEmail)
            isCodeSent = true
            print("✅ Code sent to \(trimmedEmail)")
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to send code. Please try again."
        }
        
        isLoading = false
    }
    
    // MARK: - Verify Code and Login
    func login(code: String? = nil) async {
        if let newCode = code {
            self.verificationCode = newCode
        }
        let trimmedEmail = email.lowercased().trimmingCharacters(in: .whitespaces)
        let trimmedCode = verificationCode.trimmingCharacters(in: .whitespaces)
        
        guard trimmedCode.count == 6 else {
            errorMessage = "Please enter the 6-digit code"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        do {
            let response = try await authService.login(email: trimmedEmail, code: trimmedCode)
            circles = response.circles
            authState = .loggedIn(response.user)
            
            // Reset login form
            resetLoginForm()
            
            print("✅ Logged in as \(response.user.displayName)")
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Invalid code. Please try again."
        }
        
        isLoading = false
    }
    
    // MARK: - Logout
    func logout() async {
        isLoading = true
        
        await authService.logout()
        
        authState = .loggedOut
        circles = []
        resetLoginForm()
        
        isLoading = false
        print("✅ Logged out")
    }
    
    // MARK: - Go Back to Email Entry
    func goBackToEmail() {
        isCodeSent = false
        verificationCode = ""
        errorMessage = nil
    }
    
    // MARK: - Reset Login Form
    private func resetLoginForm() {
        email = ""
        verificationCode = ""
        isCodeSent = false
        errorMessage = nil
    }
    
    // MARK: - Dismiss Error
    func dismissError() {
        errorMessage = nil
    }
    
    // MARK: - Update Profile
    func updateProfile(displayName: String, phone: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let updatedUser = try await authService.updateProfile(displayName: displayName, phone: phone)
            authState = .loggedIn(updatedUser)
            print("✅ Profile updated")
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Failed to update profile"
        }
        
        isLoading = false
    }
}
