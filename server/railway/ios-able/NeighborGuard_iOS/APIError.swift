//
//  APIError.swift
//  NeighborGuard
//
//  Phase 1: Foundation
//

import Foundation

// MARK: - API Error
enum APIError: Error, LocalizedError {
    case invalidURL
    case encodingError
    case decodingError(Error)
    case networkError(Error)
    case serverError(statusCode: Int, message: String?)
    case unauthorized
    case noData
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .encodingError:
            return "Failed to encode request"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return message ?? "Server error (code: \(code))"
        case .unauthorized:
            return "Unauthorized - please login again"
        case .noData:
            return "No data received"
        }
    }
}

// MARK: - Server Error Response
struct ServerErrorResponse: Decodable {
    let error: String?
    let message: String?
}
