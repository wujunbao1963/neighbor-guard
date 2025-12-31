//
//  Services.swift
//  NeighborGuard
//
//  Phase 3: API Services
//

import Foundation
import Combine

// MARK: - Circle Service
class CircleService {
    static let shared = CircleService()
    private let api = APIClient.shared
    private init() {}
    
    func getCircles() async throws -> [SecurityCircle] {
        let response: CirclesResponse = try await api.request(
            path: "/circles",
            method: .GET,
            requiresAuth: true
        )
        return response.circles
    }
    
    func getCircleDetail(circleId: String) async throws -> CircleDetail {
        let response: CircleDetailResponse = try await api.request(
            path: "/circles/\(circleId)",
            method: .GET,
            requiresAuth: true
        )
        return response.circle
    }
    
    // Zone management
    func updateZone(circleId: String, zoneId: String, isEnabled: Bool) async throws {
        try await api.requestVoid(
            path: "/zones/\(circleId)/\(zoneId)",
            method: .PUT,
            body: ["isEnabled": isEnabled],
            requiresAuth: true
        )
    }
    
    // Member management
    func addMember(circleId: String, email: String, role: String) async throws {
        try await api.requestVoid(
            path: "/circles/\(circleId)/members",
            method: .POST,
            body: ["email": email, "role": role],
            requiresAuth: true
        )
    }
    
    func removeMember(circleId: String, memberId: String) async throws {
        try await api.requestVoid(
            path: "/circles/\(circleId)/members/\(memberId)",
            method: .DELETE,
            requiresAuth: true
        )
    }
    
    // Home management
    func updateHome(circleId: String, displayName: String?, addressLine1: String?, city: String?) async throws {
        var body: [String: Any] = [:]
        if let name = displayName { body["displayName"] = name }
        if let address = addressLine1 { body["addressLine1"] = address }
        if let city = city { body["city"] = city }
        
        print("🌐 API: PUT /homes/\(circleId) with body: \(body)")
        
        try await api.requestVoid(
            path: "/homes/\(circleId)",
            method: .PUT,
            body: body,
            requiresAuth: true
        )
        
        print("🌐 API: Home update successful")
    }
}

// MARK: - Event Service
class EventService {
    static let shared = EventService()
    private let api = APIClient.shared
    private init() {}
    
    func getEvents(circleId: String, status: String? = nil, limit: Int = 50) async throws -> [Event] {
        var path = "/events/\(circleId)?limit=\(limit)"
        if let status = status {
            path += "&status=\(status)"
        }
        
        let response: EventsResponse = try await api.request(
            path: path,
            method: .GET,
            requiresAuth: true
        )
        return response.events
    }
    
    func getEventDetail(circleId: String, eventId: String) async throws -> EventDetail {
        let response: EventDetailResponse = try await api.request(
            path: "/events/\(circleId)/\(eventId)",
            method: .GET,
            requiresAuth: true
        )
        return response.event
    }
    
    func createEvent(
        circleId: String,
        zoneId: String,
        eventType: String,
        title: String,
        description: String?,
        severity: String
    ) async throws -> Event {
        var body: [String: Any] = [
            "zoneId": zoneId,
            "eventType": eventType,
            "title": title,
            "severity": severity
        ]
        if let desc = description, !desc.isEmpty {
            body["description"] = desc
        }
        
        let response: CreateEventResponse = try await api.request(
            path: "/events/\(circleId)",
            method: .POST,
            body: body,
            requiresAuth: true
        )
        return response.event
    }
    
    func updateStatus(circleId: String, eventId: String, status: String) async throws {
        try await api.requestVoid(
            path: "/events/\(circleId)/\(eventId)/status",
            method: .PUT,
            body: ["status": status],
            requiresAuth: true
        )
    }
    
    func addNote(circleId: String, eventId: String, body: String, noteType: String = "COMMENT", reactionCode: String? = nil) async throws -> EventNote {
        var reqBody: [String: Any] = ["body": body, "noteType": noteType]
        if let code = reactionCode {
            reqBody["reactionCode"] = code
        }
        
        let response: AddNoteResponse = try await api.request(
            path: "/events/\(circleId)/\(eventId)/notes",
            method: .POST,
            body: reqBody,
            requiresAuth: true
        )
        return response.note
    }
    
    func updatePolice(circleId: String, eventId: String, reported: Bool, reportNumber: String? = nil) async throws {
        var body: [String: Any] = ["policeReported": reported]
        if let num = reportNumber {
            body["policeReportNumber"] = num
        }
        
        try await api.requestVoid(
            path: "/events/\(circleId)/\(eventId)/police",
            method: .PUT,
            body: body,
            requiresAuth: true
        )
    }
}

// MARK: - Config Service
class ConfigService {
    static let shared = ConfigService()
    private let api = APIClient.shared
    private init() {}
    
    func getEventTypes() async throws -> [EventTypeConfig] {
        let response: EventTypesResponse = try await api.request(
            path: "/config/event-types",
            method: .GET,
            requiresAuth: false
        )
        return response.eventTypes
    }
    
    func getEventZoneWhitelist() async throws -> [String: [String]] {
        let response: EventZoneWhitelistResponse = try await api.request(
            path: "/config/event-zone-whitelist",
            method: .GET,
            requiresAuth: false
        )
        return response.whitelist
    }
}
