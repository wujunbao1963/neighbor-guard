//
//  EventCard.swift
//  NeighborGuard
//
//  Event Card Component
//

import SwiftUI

struct EventCard: View {
    let event: Event
    let showCircle: Bool
    let circleName: String?
    let onTap: () -> Void
    
    init(event: Event, showCircle: Bool = false, circleName: String? = nil, onTap: @escaping () -> Void) {
        self.event = event
        self.showCircle = showCircle
        self.circleName = circleName
        self.onTap = onTap
    }
    
    var body: some View {
        CardView(severity: event.severity, clickable: true, action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                // Top row: badges and status
                HStack(alignment: .top) {
                    HStack(spacing: 6) {
                        SeverityBadge(severity: event.severity)
                        
                        if let zone = event.zone {
                            BadgeView(Labels.zoneType(zone.zoneType))
                        }
                        
                        if showCircle, let name = circleName {
                            BadgeView(name, background: Color(hex: "e0e7ff"), textColor: Color(hex: "4338ca"))
                        }
                    }
                    
                    Spacer()
                    
                    StatusBadge(status: event.status)
                }
                
                // Title
                Text(event.title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
                
                // Description
                if let description = event.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                }
                
                // Time and creator
                Text("\(event.formattedTime) · Reported by \(event.creator.displayName)")
                    .font(.system(size: 12))
                    .foregroundColor(.textMuted)
                
                // Police reported
                if event.displayPoliceReported {
                    Text("🚨 Police Reported")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.severityHigh)
                }
                
                // Note count
                if event.displayNoteCount > 0 {
                    Text("💬 \(event.displayNoteCount) \(event.displayNoteCount == 1 ? "response" : "responses")")
                        .font(.system(size: 12))
                        .foregroundColor(.ngPurple)
                }
            }
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        Text("Event Card Preview")
    }
    .padding()
    .background(Color.pageBackground)
}
