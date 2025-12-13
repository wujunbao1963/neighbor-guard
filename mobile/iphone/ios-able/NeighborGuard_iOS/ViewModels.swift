//
//  ViewModels.swift
//  NeighborGuard
//
//  Phase 3: State Management
//

import Foundation
import SwiftUI
import Combine

// MARK: - Circle ViewModel
@MainActor
class CircleViewModel: ObservableObject {
    @Published var circles: [SecurityCircle] = []
    @Published var selectedCircle: SecurityCircle?
    @Published var circleDetail: CircleDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let service = CircleService.shared
    
    var enabledZones: [Zone] {
        circleDetail?.zones.filter { $0.isEnabled } ?? []
    }
    
    var allZones: [Zone] {
        circleDetail?.zones ?? []
    }
    
    func loadCircles() async {
        isLoading = true
        errorMessage = nil
        
        do {
            circles = try await service.getCircles()
            
            // Update selectedCircle with fresh data from loaded circles
            if let currentId = selectedCircle?.id,
               let updatedCircle = circles.first(where: { $0.id == currentId }) {
                selectedCircle = updatedCircle
            } else if selectedCircle == nil, let first = circles.first {
                await selectCircle(first)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func selectCircle(_ circle: SecurityCircle) async {
        selectedCircle = circle
        await loadCircleDetail(circleId: circle.id)
    }
    
    func loadCircleDetail(circleId: String) async {
        do {
            circleDetail = try await service.getCircleDetail(circleId: circleId)
        } catch {
            print("Failed to load circle detail: \(error)")
        }
    }
    
    // Zone management
    func toggleZone(zone: Zone, enabled: Bool) async {
        guard let circleId = selectedCircle?.id else { return }
        
        do {
            try await service.updateZone(circleId: circleId, zoneId: zone.id, isEnabled: enabled)
            await loadCircleDetail(circleId: circleId)
        } catch {
            print("Failed to toggle zone: \(error)")
            errorMessage = "Failed to update zone"
        }
    }
    
    // Member management
    func addMember(email: String, role: String) async -> Bool {
        guard let circleId = selectedCircle?.id else { return false }
        
        do {
            try await service.addMember(circleId: circleId, email: email, role: role)
            await loadCircleDetail(circleId: circleId)
            // Update selectedCircle with new members
            if circleDetail != nil {
                selectedCircle = circles.first { $0.id == circleId }
            }
            await loadCircles() // Refresh to get updated member list
            return true
        } catch let error as APIError {
            switch error {
            case .serverError(_, let message):
                errorMessage = message
            default:
                errorMessage = "Failed to add member"
            }
            return false
        } catch {
            errorMessage = "Failed to add member"
            return false
        }
    }
    
    func removeMember(memberId: String) async {
        guard let circleId = selectedCircle?.id else { return }
        
        do {
            try await service.removeMember(circleId: circleId, memberId: memberId)
            await loadCircleDetail(circleId: circleId)
            await loadCircles() // Refresh circles list
        } catch {
            print("Failed to remove member: \(error)")
            errorMessage = "Failed to remove member"
        }
    }
    
    // Home management
    func updateHome(displayName: String, addressLine1: String, city: String) async -> Bool {
        guard let circleId = selectedCircle?.id else { 
            errorMessage = "No circle selected"
            return false 
        }
        
        print("📝 Updating home for circle \(circleId): name=\(displayName), address=\(addressLine1), city=\(city)")
        
        do {
            try await service.updateHome(
                circleId: circleId,
                displayName: displayName.isEmpty ? nil : displayName,
                addressLine1: addressLine1.isEmpty ? nil : addressLine1,
                city: city.isEmpty ? nil : city
            )
            print("✅ Home updated successfully")
            await loadCircleDetail(circleId: circleId)
            await loadCircles() // Refresh to update circle names
            return true
        } catch let error as APIError {
            print("❌ Failed to update home: \(error)")
            switch error {
            case .serverError(_, let message):
                errorMessage = message
            default:
                errorMessage = "Failed to update home: \(error.localizedDescription)"
            }
            return false
        } catch {
            print("❌ Failed to update home: \(error)")
            errorMessage = "Failed to update home"
            return false
        }
    }
}

// MARK: - Event ViewModel
@MainActor
class EventViewModel: ObservableObject {
    @Published var events: [Event] = []
    @Published var homeEvents: [Event] = []  // Separate for home page active events
    @Published var selectedEvent: EventDetail?
    @Published var isLoading = false
    @Published var isLoadingDetail = false
    @Published var errorMessage: String?
    
    private let service = EventService.shared
    private var currentCircleId: String?
    
    var activeEvents: [Event] {
        homeEvents.filter { $0.isOpen }
    }
    
    var resolvedEvents: [Event] {
        events.filter { $0.isResolved }
    }
    
    // Load events from a single circle
    func loadEvents(circleId: String, status: String? = nil) async {
        currentCircleId = circleId
        isLoading = true
        errorMessage = nil
        
        do {
            events = try await service.getEvents(circleId: circleId, status: status)
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    // Load events from ALL circles (for home page)
    func loadAllActiveEvents(circles: [SecurityCircle]) async {
        guard !circles.isEmpty else {
            print("⚠️ loadAllActiveEvents called with empty circles")
            return
        }
        
        print("📥 loadAllActiveEvents starting with \(circles.count) circles")
        isLoading = true
        errorMessage = nil
        
        // Use Task.detached to create a non-cancellable context for network requests
        let allEvents: [Event] = await Task.detached {
            var events: [Event] = []
            
            for circle in circles {
                do {
                    var circleEvents = try await self.service.getEvents(circleId: circle.id, status: "active")
                    print("✅ Got \(circleEvents.count) active events from circle \(circle.id)")
                    // Set circleId and circleName for each event
                    circleEvents = circleEvents.map { event in
                        var e = event
                        e.circleId = circle.id
                        e.circleName = circle.displayName
                        return e
                    }
                    events.append(contentsOf: circleEvents)
                } catch {
                    print("❌ Failed to load events for circle \(circle.id): \(error)")
                }
            }
            
            return events
        }.value
        
        // Only update if we got some events OR if this was a successful load (no errors for all circles)
        // This prevents clearing existing events on network failure
        print("📥 loadAllActiveEvents completed with \(allEvents.count) total events")
        if !allEvents.isEmpty || homeEvents.isEmpty {
            homeEvents = allEvents.sorted { $0.createdAt > $1.createdAt }
        }
        isLoading = false
    }
    
    // Load all events (for timeline)
    func loadAllEvents(circles: [SecurityCircle]) async {
        guard !circles.isEmpty else {
            print("⚠️ loadAllEvents called with empty circles")
            return
        }
        
        print("📥 loadAllEvents starting with \(circles.count) circles")
        isLoading = true
        errorMessage = nil
        
        // Use Task.detached to create a non-cancellable context for network requests
        let allEvents: [Event] = await Task.detached {
            var events: [Event] = []
            
            for circle in circles {
                do {
                    var circleEvents = try await self.service.getEvents(circleId: circle.id, limit: 100)
                    print("✅ Got \(circleEvents.count) events from circle \(circle.id)")
                    // Set circleId and circleName for each event
                    circleEvents = circleEvents.map { event in
                        var e = event
                        e.circleId = circle.id
                        e.circleName = circle.displayName
                        return e
                    }
                    events.append(contentsOf: circleEvents)
                } catch {
                    print("❌ Failed to load events for circle \(circle.id): \(error)")
                }
            }
            
            return events
        }.value
        
        // Only update if we got some events OR if this was first load
        // This prevents clearing existing events on network failure
        print("📥 loadAllEvents completed with \(allEvents.count) total events")
        if !allEvents.isEmpty || events.isEmpty {
            events = allEvents.sorted { e1, e2 in
                if e1.isOpen && !e2.isOpen { return true }
                if !e1.isOpen && e2.isOpen { return false }
                return e1.createdAt > e2.createdAt
            }
        }
        
        isLoading = false
    }
    
    func loadEventDetail(circleId: String, eventId: String, silent: Bool = false) async {
        if !silent {
            isLoadingDetail = true
        }
        print("📋 Loading event detail: circleId=\(circleId), eventId=\(eventId), silent=\(silent)")
        
        do {
            selectedEvent = try await service.getEventDetail(circleId: circleId, eventId: eventId)
            print("✅ Event detail loaded successfully")
        } catch {
            print("❌ Failed to load event detail: \(error)")
        }
        
        isLoadingDetail = false
    }
    
    func createEvent(
        circleId: String,
        zoneId: String,
        eventType: String,
        title: String,
        description: String?,
        severity: String
    ) async -> Bool {
        isLoading = true
        errorMessage = nil
        
        do {
            let newEvent = try await service.createEvent(
                circleId: circleId,
                zoneId: zoneId,
                eventType: eventType,
                title: title,
                description: description,
                severity: severity
            )
            events.insert(newEvent, at: 0)
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
    
    func addNote(circleId: String, eventId: String, body: String, noteType: String = "COMMENT", reactionCode: String? = nil) async -> Bool {
        do {
            _ = try await service.addNote(circleId: circleId, eventId: eventId, body: body, noteType: noteType, reactionCode: reactionCode)
            // Refresh event detail
            await loadEventDetail(circleId: circleId, eventId: eventId)
            return true
        } catch {
            return false
        }
    }
    
    func updateStatus(circleId: String, eventId: String, status: String, note: String?) async -> Bool {
        do {
            try await service.updateStatus(circleId: circleId, eventId: eventId, status: status)
            if let note = note {
                _ = try await service.addNote(circleId: circleId, eventId: eventId, body: note, noteType: "SYSTEM")
            }
            await loadEventDetail(circleId: circleId, eventId: eventId)
            
            // If status is resolved/false alarm, remove from homeEvents (active events)
            let resolvedStatuses = ["RESOLVED_OK", "RESOLVED_WARNING", "FALSE_ALARM"]
            if resolvedStatuses.contains(status) {
                homeEvents.removeAll { $0.id == eventId }
            }
            
            return true
        } catch {
            return false
        }
    }
    
    func reportPolice(circleId: String, eventId: String) async -> Bool {
        do {
            try await service.updatePolice(circleId: circleId, eventId: eventId, reported: true)
            _ = try await service.addNote(circleId: circleId, eventId: eventId, body: "Police report recorded", noteType: "SYSTEM")
            await loadEventDetail(circleId: circleId, eventId: eventId)
            return true
        } catch {
            return false
        }
    }
    
    func clearSelection() {
        selectedEvent = nil
    }
}
