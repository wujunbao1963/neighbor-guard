//
//  Models.swift
//  NeighborGuard
//
//  Phase 3: Data Models
//

import Foundation
import UIKit

// MARK: - Media Item (Photo or Video)
struct MediaItem: Identifiable, Equatable {
    let id = UUID()
    let type: MediaType
    let image: UIImage?        // For photos or video thumbnail
    let videoURL: URL?         // For videos
    
    enum MediaType {
        case photo
        case video
    }
    
    static func == (lhs: MediaItem, rhs: MediaItem) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Circle Models
// Named "SecurityCircle" to avoid conflict with SwiftUI's Circle shape

struct SecurityCircle: Codable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let myRole: String
    let myDisplayName: String?
    let home: Home?
    let members: [Member]
    let activeEventCount: Int
    let createdAt: String
    
    static func == (lhs: SecurityCircle, rhs: SecurityCircle) -> Bool {
        lhs.id == rhs.id
    }
}

struct Home: Codable, Identifiable {
    let id: String
    let displayName: String
    let houseType: String
    let city: String?
    let addressLine1: String?
}

struct Member: Codable, Identifiable {
    let id: String
    let userId: String
    let displayName: String
    let avatarUrl: String?
    let role: String
}

struct Zone: Codable, Identifiable {
    let id: String
    let zoneType: String
    let displayName: String
    let icon: String
    let isEnabled: Bool
    let displayOrder: Int
}

// MARK: - Event Models

struct Event: Codable, Identifiable {
    let id: String
    let eventType: String
    let title: String
    let description: String?
    let severity: String
    let status: String
    let zone: EventZone?
    let creator: EventCreator
    let occurredAt: String
    let createdAt: String
    let policeReported: Bool?
    let noteCount: Int?
    let mediaCount: Int?
    let thumbnails: [Thumbnail]?
    
    // Not from API - set locally when loading
    var circleId: String?
    var circleName: String?
    
    var isResolved: Bool {
        ["RESOLVED_OK", "RESOLVED_WARNING", "FALSE_ALARM"].contains(status)
    }
    
    var isOpen: Bool {
        ["OPEN", "ACKED", "WATCHING", "ESCALATED"].contains(status)
    }
    
    var formattedTime: String {
        formatDateString(occurredAt)
    }
    
    var displayNoteCount: Int {
        noteCount ?? 0
    }
    
    var displayPoliceReported: Bool {
        policeReported ?? false
    }
    
    // For sheet binding
    static func == (lhs: Event, rhs: Event) -> Bool {
        lhs.id == rhs.id
    }
}

extension Event: Equatable {}

struct EventZone: Codable {
    let id: String
    let zoneType: String
    let displayName: String
    let icon: String
}

struct EventCreator: Codable, Identifiable {
    let id: String
    let displayName: String
    let avatarUrl: String?
    
    // Handle case where avatarUrl might not be present at all
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decode(String.self, forKey: .displayName)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, displayName, avatarUrl
    }
}

struct Thumbnail: Codable, Identifiable {
    let id: String
    let url: String
    let mediaType: String
}

// MARK: - Event Detail

struct EventDetail: Codable, Identifiable {
    let id: String
    let eventType: String
    let title: String
    let description: String?
    let severity: String
    let status: String
    let zone: Zone?
    let creator: EventCreator
    let occurredAt: String
    let occurredEndAt: String?
    let policeReported: Bool
    let policeReportedAt: String?
    let policeReportNumber: String?
    let lossDescription: String?
    let createdAt: String
    let updatedAt: String
    let notes: [EventNote]
    let media: [EventMedia]
    let permissions: EventPermissions
    
    var isOpen: Bool {
        ["OPEN", "ACKED", "WATCHING", "ESCALATED"].contains(status)
    }
}

struct EventNote: Codable, Identifiable {
    let id: String
    let noteType: String
    let reactionCode: String?
    let body: String
    let createdAt: String
    let author: EventCreator?
}

struct EventMedia: Codable, Identifiable {
    let id: String
    let mediaType: String
    let sourceType: String
    let fileName: String
    let fileUrl: String
    let thumbnailUrl: String?
    let fileSizeBytes: Int
    let createdAt: String
    let uploader: MediaUploader
}

struct MediaUploader: Codable, Identifiable {
    let id: String
    let displayName: String
}

struct EventPermissions: Codable {
    let canEdit: Bool
    let canDelete: Bool
    let canAddNote: Bool
    let canUploadMedia: Bool
}

// MARK: - API Responses

struct CirclesResponse: Codable {
    let success: Bool
    let circles: [SecurityCircle]
}

struct CircleDetailResponse: Codable {
    let success: Bool
    let circle: CircleDetail
}

struct CircleDetail: Codable {
    let id: String
    let displayName: String
    let myRole: String
    let home: Home?
    let members: [MemberDetail]
    let zones: [Zone]
    let eventCount: Int
}

struct MemberDetail: Codable, Identifiable {
    let id: String
    let userId: String
    let email: String?
    let displayName: String
    let avatarUrl: String?
    let role: String
    let joinedAt: String
}

struct EventsResponse: Codable {
    let success: Bool
    let events: [Event]
    let pagination: Pagination
}

struct Pagination: Codable {
    let total: Int
    let limit: Int
    let offset: Int
    let hasMore: Bool
}

struct EventDetailResponse: Codable {
    let success: Bool
    let event: EventDetail
}

struct CreateEventResponse: Codable {
    let success: Bool
    let event: Event
}

struct AddNoteResponse: Codable {
    let success: Bool
    let note: EventNote
    let statusUpdated: Bool?
}

// MARK: - Config

struct EventTypeConfig: Codable, Identifiable {
    let value: String
    let label: String
    let labelEn: String
    let icon: String
    let severity: String
    let description: String?
    let descriptionEn: String?
    let allowedZones: [String]?
    
    var id: String { value }
}

struct EventTypesResponse: Codable {
    let success: Bool
    let eventTypes: [EventTypeConfig]
}

struct EventZoneWhitelistResponse: Codable {
    let success: Bool
    let whitelist: [String: [String]]
}

// MARK: - Helpers

func formatDateString(_ dateString: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    
    guard let date = formatter.date(from: dateString) else {
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: dateString) else {
            return dateString
        }
        return formatDate(date)
    }
    return formatDate(date)
}

private func formatDate(_ date: Date) -> String {
    let displayFormatter = DateFormatter()
    displayFormatter.locale = Locale(identifier: "en_US")
    displayFormatter.dateFormat = "MMM d, yyyy HH:mm"
    return displayFormatter.string(from: date)
}
