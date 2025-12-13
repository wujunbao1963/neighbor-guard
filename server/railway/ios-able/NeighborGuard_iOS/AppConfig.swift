//
//  AppConfig.swift
//  NeighborGuard
//
//  Phase 1: Foundation
//

import Foundation

// MARK: - API Environment
enum APIEnvironment {
    case development
    case production
    
    var baseURL: String {
        switch self {
        case .development:
            return "http://localhost:3001/api"
        case .production:
            return "https://neighborguard-backend-production.up.railway.app/api"
        }
    }
}

// MARK: - App Configuration
struct AppConfig {
    
    // Change this to .development when testing locally
    #if DEBUG
    static let environment: APIEnvironment = .production  // Use production API for testing
    #else
    static let environment: APIEnvironment = .production
    #endif
    
    static var baseURL: String {
        environment.baseURL
    }
    
    // Test mode verification code (same as web MVP)
    static let testVerificationCode = "587585"
}

// MARK: - Keychain Keys
struct KeychainKeys {
    static let accessToken = "com.neighborguard.accessToken"
    static let refreshToken = "com.neighborguard.refreshToken"
}
