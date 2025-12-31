//
//  APIClient.swift
//  NeighborGuard
//
//  API Client with automatic token refresh
//

import Foundation

// MARK: - HTTP Method
enum HTTPMethod: String {
    case GET, POST, PUT, DELETE
}

// MARK: - API Client
class APIClient {
    
    static let shared = APIClient()
    
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var isRefreshing = false
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
        
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }
    
    // MARK: - Tokens
    var accessToken: String? {
        KeychainService.shared.load(forKey: KeychainKeys.accessToken)
    }
    
    var refreshToken: String? {
        KeychainService.shared.load(forKey: KeychainKeys.refreshToken)
    }
    
    // MARK: - Token Refresh
    private func refreshAccessToken() async -> Bool {
        guard let refreshToken = refreshToken else {
            print("❌ No refresh token available")
            return false
        }
        
        guard !isRefreshing else {
            // Wait a bit if already refreshing
            try? await Task.sleep(nanoseconds: 500_000_000)
            return accessToken != nil
        }
        
        isRefreshing = true
        defer { isRefreshing = false }
        
        print("🔄 Refreshing access token...")
        
        guard let url = URL(string: AppConfig.baseURL + "/auth/refresh") else {
            return false
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["refreshToken": refreshToken])
        
        do {
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                return false
            }
            
            if httpResponse.statusCode == 200 {
                struct RefreshResponse: Codable {
                    let accessToken: String
                }
                
                let refreshResponse = try decoder.decode(RefreshResponse.self, from: data)
                _ = KeychainService.shared.save(refreshResponse.accessToken, forKey: KeychainKeys.accessToken)
                print("✅ Token refreshed successfully")
                return true
            } else {
                print("❌ Token refresh failed with status: \(httpResponse.statusCode)")
                return false
            }
        } catch {
            print("❌ Token refresh error: \(error)")
            return false
        }
    }
    
    // MARK: - Generic Request with Auto Retry
    func request<T: Decodable>(
        path: String,
        method: HTTPMethod = .GET,
        body: [String: Any]? = nil,
        requiresAuth: Bool = true,
        isRetry: Bool = false
    ) async throws -> T {
        
        // Build URL
        guard let url = URL(string: AppConfig.baseURL + path) else {
            throw APIError.invalidURL
        }
        
        // Build request
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add auth header if needed
        if requiresAuth, let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Add body if present
        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        
        print("🌐 API Request: \(method.rawValue) \(path)\(isRetry ? " (retry)" : "")")
        
        // Perform request
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.noData
        }
        
        print("📥 API Response: \(httpResponse.statusCode)")
        
        // Handle 401 - try refresh token
        if httpResponse.statusCode == 401 && requiresAuth && !isRetry {
            print("🔐 Got 401, attempting token refresh...")
            if await refreshAccessToken() {
                // Retry with new token
                return try await self.request(path: path, method: method, body: body, requiresAuth: requiresAuth, isRetry: true)
            } else {
                throw APIError.unauthorized
            }
        }
        
        // Handle other error status codes
        switch httpResponse.statusCode {
        case 200...299:
            break // Success
        case 401:
            throw APIError.unauthorized
        default:
            var message: String?
            if let errorResponse = try? decoder.decode(ServerErrorResponse.self, from: data) {
                message = errorResponse.error ?? errorResponse.message
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
        
        // Decode response
        do {
            let result = try decoder.decode(T.self, from: data)
            return result
        } catch {
            print("❌ Decoding error: \(error)")
            if let jsonString = String(data: data, encoding: .utf8) {
                print("📄 Response body: \(jsonString.prefix(500))")
            }
            throw APIError.decodingError(error)
        }
    }
    
    // MARK: - Request without response body (with Auto Retry)
    func requestVoid(
        path: String,
        method: HTTPMethod = .POST,
        body: [String: Any]? = nil,
        requiresAuth: Bool = true,
        isRetry: Bool = false
    ) async throws {
        
        guard let url = URL(string: AppConfig.baseURL + path) else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if requiresAuth, let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        
        print("🌐 API Request: \(method.rawValue) \(path)\(isRetry ? " (retry)" : "")")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.noData
        }
        
        print("📥 API Response: \(httpResponse.statusCode)")
        
        // Handle 401 - try refresh token
        if httpResponse.statusCode == 401 && requiresAuth && !isRetry {
            print("🔐 Got 401, attempting token refresh...")
            if await refreshAccessToken() {
                // Retry with new token
                return try await self.requestVoid(path: path, method: method, body: body, requiresAuth: requiresAuth, isRetry: true)
            } else {
                throw APIError.unauthorized
            }
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            return // Success
        case 401:
            throw APIError.unauthorized
        default:
            var message: String?
            if let errorResponse = try? decoder.decode(ServerErrorResponse.self, from: data) {
                message = errorResponse.error ?? errorResponse.message
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
    }
}
