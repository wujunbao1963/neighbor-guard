//
//  Theme.swift
//  NeighborGuard
//
//  App Theme - Colors and Labels
//

import SwiftUI

// MARK: - App Colors
extension Color {
    static let ngPurpleStart = Color(hex: "667eea")
    static let ngPurpleEnd = Color(hex: "764ba2")
    static let ngPurple = Color(hex: "667eea")
    
    static let severityHigh = Color(hex: "ef4444")
    static let severityMedium = Color(hex: "f59e0b")
    static let severityLow = Color(hex: "94a3b8")
    
    static let statusOpen = Color(hex: "dc2626")
    static let statusAcked = Color(hex: "1e40af")
    static let statusWatching = Color(hex: "b45309")
    static let statusEscalated = Color(hex: "7c3aed")
    static let statusResolvedOk = Color(hex: "065f46")
    static let statusResolvedWarning = Color(hex: "c2410c")
    static let statusFalseAlarm = Color(hex: "6b7280")
    
    static let cardBackground = Color.white
    static let pageBackground = Color(hex: "f5f5f5")
    static let textPrimary = Color(hex: "333333")
    static let textSecondary = Color(hex: "666666")
    static let textMuted = Color(hex: "999999")
    static let border = Color(hex: "e0e0e0")
    
    static let alertInfoBg = Color(hex: "eff6ff")
    static let alertInfoBorder = Color(hex: "bfdbfe")
    static let alertInfoText = Color(hex: "1e40af")
    
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}

extension LinearGradient {
    static let ngHeader = LinearGradient(colors: [Color.ngPurpleStart, Color.ngPurpleEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
}

// MARK: - Labels (English)
struct Labels {
    static func severity(_ value: String) -> String {
        switch value {
        case "HIGH": return "High Risk"
        case "MEDIUM": return "Medium Risk"
        case "LOW": return "Low Risk"
        default: return value
        }
    }
    
    static func status(_ value: String) -> String {
        switch value {
        case "OPEN": return "Open"
        case "ACKED": return "Acknowledged"
        case "WATCHING": return "Watching"
        case "RESOLVED_OK": return "Resolved"
        case "RESOLVED_WARNING": return "Resolved (Loss)"
        case "ESCALATED": return "Escalated"
        case "FALSE_ALARM": return "False Alarm"
        default: return value
        }
    }
    
    static func eventType(_ value: String) -> String {
        switch value {
        case "break_in_attempt": return "Break-in Attempt"
        case "perimeter_damage": return "Perimeter Damage"
        case "suspicious_person": return "Suspicious Person"
        case "suspicious_vehicle": return "Suspicious Vehicle"
        case "unusual_noise": return "Unusual Noise"
        case "package_event": return "Package Event"
        case "custom": return "Custom"
        default: return value
        }
    }
    
    static func role(_ value: String) -> String {
        switch value {
        case "OWNER": return "Owner"
        case "HOUSEHOLD": return "Household"
        case "NEIGHBOR": return "Neighbor"
        case "RELATIVE": return "Relative"
        case "OBSERVER": return "Observer"
        default: return value
        }
    }
    
    static func houseType(_ value: String) -> String {
        switch value {
        case "DETACHED": return "Detached"
        case "SEMI": return "Semi-detached"
        case "ROW": return "Row House"
        case "APARTMENT": return "Apartment"
        default: return value
        }
    }
    
    static func zoneType(_ value: String) -> String {
        switch value.lowercased() {
        case "front_yard", "frontyard": return "Front Yard"
        case "backyard", "back_yard": return "Backyard"
        case "side_yard", "sideyard": return "Side Yard"
        case "driveway": return "Driveway"
        case "garage": return "Garage"
        case "front_door", "frontdoor": return "Front Door"
        case "back_door", "backdoor": return "Back Door"
        case "side_door", "sidedoor": return "Side Door"
        case "porch": return "Porch"
        case "balcony": return "Balcony"
        case "roof": return "Roof"
        case "basement": return "Basement"
        case "fence": return "Fence"
        case "gate": return "Gate"
        case "mailbox": return "Mailbox"
        case "street": return "Street"
        case "sidewalk": return "Sidewalk"
        case "alley": return "Alley"
        case "parking", "parking_lot": return "Parking"
        case "common_area", "commonarea": return "Common Area"
        case "lobby": return "Lobby"
        case "hallway": return "Hallway"
        case "elevator": return "Elevator"
        case "stairwell": return "Stairwell"
        case "pool": return "Pool"
        case "garden": return "Garden"
        case "shed": return "Shed"
        case "window": return "Window"
        case "entrance": return "Entrance"
        case "yard": return "Yard"
        case "other": return "Other"
        default: 
            // If no translation found, return the original value
            // This prevents showing raw keys
            print("⚠️ Unknown zone type: \(value)")
            return value
        }
    }
}

func severityColor(_ severity: String) -> Color {
    switch severity {
    case "HIGH": return .severityHigh
    case "MEDIUM": return .severityMedium
    case "LOW": return .severityLow
    default: return .gray
    }
}

func statusColor(_ status: String) -> Color {
    switch status {
    case "OPEN": return .statusOpen
    case "ACKED": return .statusAcked
    case "WATCHING": return .statusWatching
    case "ESCALATED": return .statusEscalated
    case "RESOLVED_OK": return .statusResolvedOk
    case "RESOLVED_WARNING": return .statusResolvedWarning
    case "FALSE_ALARM": return .statusFalseAlarm
    default: return .gray
    }
}

func statusBackground(_ status: String) -> Color {
    switch status {
    case "OPEN": return Color(hex: "fee2e2")
    case "ACKED": return Color(hex: "dbeafe")
    case "WATCHING": return Color(hex: "fef3c7")
    case "ESCALATED": return Color(hex: "f3e8ff")
    case "RESOLVED_OK": return Color(hex: "d1fae5")
    case "RESOLVED_WARNING": return Color(hex: "ffedd5")
    case "FALSE_ALARM": return Color(hex: "f3f4f6")
    default: return Color(hex: "f3f4f6")
    }
}
