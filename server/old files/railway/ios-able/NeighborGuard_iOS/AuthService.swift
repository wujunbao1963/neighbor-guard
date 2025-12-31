//
//  AuthService.swift
//  NeighborGuard
//
//  Phase 2: Authentication
//

import Foundation

// MARK: - Auth Service
class AuthService {
    
    static let shared = AuthService()
    
    private let api = APIClient.shared
    private let keychain = KeychainService.shared
    
    private init() {}
    
    // MARK: - Request Verification Code
    func requestCode(email: String) async throws {
        let _: RequestCodeResponse = try await api.request(
            path: "/auth/request-code",
            method: .POST,
            body: ["email": email],
            requiresAuth: false
        )
    }
    
    // MARK: - Login with Code
    func login(email: String, code: String) async throws -> LoginResponse {
        let response: LoginResponse = try await api.request(
            path: "/auth/login",
            method: .POST,
            body: ["email": email, "code": code],
            requiresAuth: false
        )
        
        // Save tokens
        _ = keychain.save(response.tokens.accessToken, forKey: KeychainKeys.accessToken)
        _ = keychain.save(response.tokens.refreshToken, forKey: KeychainKeys.refreshToken)
        
        return response
    }
    
    // MARK: - Get Current User
    func getCurrentUser() async throws -> User {
        let response: MeResponse = try await api.request(
            path: "/auth/me",
            method: .GET,
            requiresAuth: true
        )
        return response.user
    }
    
    // MARK: - Refresh Token
    func refreshToken() async throws -> String {
        guard let refreshToken = keychain.load(forKey: KeychainKeys.refreshToken) else {
            throw APIError.unauthorized
        }
        
        let response: RefreshResponse = try await api.request(
            path: "/auth/refresh",
            method: .POST,
            body: ["refreshToken": refreshToken],
            requiresAuth: false
        )
        
        // Save new access token
        _ = keychain.save(response.accessToken, forKey: KeychainKeys.accessToken)
        
        return response.accessToken
    }
    
    // MARK: - Logout
    func logout() async {
        // Try to invalidate on server (ignore errors)
        if let refreshToken = keychain.load(forKey: KeychainKeys.refreshToken) {
            try? await api.requestVoid(
                path: "/auth/logout",
                method: .POST,
                body: ["refreshToken": refreshToken],
                requiresAuth: false
            )
        }
        
        // Clear local tokens
        keychain.clearAllTokens()
    }
    
    // MARK: - Check if logged in
    var isLoggedIn: Bool {
        keychain.load(forKey: KeychainKeys.accessToken) != nil
    }
    
    // MARK: - Update Profile
    func updateProfile(displayName: String, phone: String) async throws -> User {
        var body: [String: Any] = [:]
        if !displayName.isEmpty {
            body["displayName"] = displayName
        }
        if !phone.isEmpty {
            body["phone"] = phone
        }
        
        let response: MeResponse = try await api.request(
            path: "/auth/me",
            method: .PUT,
            body: body,
            requiresAuth: true
        )
        return response.user
    }
}
