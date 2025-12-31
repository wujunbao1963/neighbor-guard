//
//  User.swift
//  NeighborGuard
//
//  Phase 2: Authentication
//

import Foundation

// MARK: - User Model
struct User: Codable, Identifiable {
    let id: String
    let email: String
    let displayName: String
    let avatarUrl: String?
    let phone: String?
    
    // Computed
    var initials: String {
        let parts = displayName.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(displayName.prefix(2)).uppercased()
    }
}

// MARK: - Circle Summary (returned with login)
struct CircleSummary: Codable, Identifiable {
    let id: String
    let displayName: String
    let role: String
    let home: HomeSummary?
}

struct HomeSummary: Codable {
    let displayName: String
    let houseType: String
}

// MARK: - API Response Models

// POST /api/auth/request-code response
struct RequestCodeResponse: Codable {
    let success: Bool
    let message: String
    let expiresIn: Int
}

// POST /api/auth/login response
struct LoginResponse: Codable {
    let success: Bool
    let user: User
    let circles: [CircleSummary]
    let tokens: TokensResponse
}

struct TokensResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: String
}

// POST /api/auth/refresh response
struct RefreshResponse: Codable {
    let success: Bool
    let accessToken: String
    let expiresIn: String
}

// GET /api/auth/me response
struct MeResponse: Codable {
    let success: Bool
    let user: User
}
