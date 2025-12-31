//
//  EventsPage.swift
//  NeighborGuard
//
//  Events Page - All Events List
//

import SwiftUI

struct EventsPage: View {
    @ObservedObject var circleViewModel: CircleViewModel
    @ObservedObject var eventViewModel: EventViewModel
    
    @State private var searchText = ""
    @State private var filter: EventFilterOption = .all
    @State private var selectedEvent: Event?
    
    enum EventFilterOption: String, CaseIterable {
        case all = "All Events"
        case highMedium = "High/Medium Risk Only"
    }
    
    var filteredEvents: [Event] {
        var result = eventViewModel.events
        
        if filter == .highMedium {
            result = result.filter { $0.severity == "HIGH" || $0.severity == "MEDIUM" }
        }
        
        let trimmed = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if !trimmed.isEmpty {
            result = result.filter { event in
                event.title.lowercased().contains(trimmed) ||
                (event.description?.lowercased().contains(trimmed) ?? false) ||
                event.creator.displayName.lowercased().contains(trimmed) ||
                (event.zone?.displayName.lowercased().contains(trimmed) ?? false) ||
                (event.circleName?.lowercased().contains(trimmed) ?? false)
            }
        }
        
        return result
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Events")
                        .font(.system(size: 20, weight: .semibold))
                    
                    if circleViewModel.circles.count > 1 {
                        Text("(All Circles)")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                    
                    Spacer()
                }
                
                // Search Box
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.textMuted)
                    
                    TextField("Search events...", text: $searchText)
                        .font(.system(size: 14))
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
                .padding(12)
                .background(Color.white)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
                
                // Filter row
                HStack {
                    let trimmed = searchText.trimmingCharacters(in: .whitespaces)
                    if trimmed.isEmpty {
                        Text("\(filteredEvents.count) \(filteredEvents.count == 1 ? "event" : "events")")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    } else {
                        Text("Found \(filteredEvents.count) \(filteredEvents.count == 1 ? "event" : "events")")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                    
                    Spacer()
                    
                    Menu {
                        ForEach(EventFilterOption.allCases, id: \.self) { option in
                            Button {
                                filter = option
                            } label: {
                                HStack {
                                    Text(option.rawValue)
                                    if filter == option {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(filter.rawValue)
                                .font(.system(size: 14))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
                    }
                    .foregroundColor(.textPrimary)
                }
            }
            .padding(16)
            .background(Color.white)
            
            // Events List
            ScrollView {
                LazyVStack(spacing: 12) {
                    if eventViewModel.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.vertical, 40)
                    } else if filteredEvents.isEmpty {
                        EmptyStateView(icon: "📋", message: "No events found")
                    } else {
                        ForEach(filteredEvents) { event in
                            EventCard(
                                event: event,
                                showCircle: circleViewModel.circles.count > 1,
                                circleName: event.circleName,
                                onTap: {
                                    selectedEvent = event
                                }
                            )
                        }
                    }
                }
                .padding(16)
            }
            .background(Color.pageBackground)
        }
        .refreshable {
            // Copy circles to local variable to avoid cancellation issues
            let circles = circleViewModel.circles
            if !circles.isEmpty {
                await eventViewModel.loadAllEvents(circles: circles)
            }
        }
        .sheet(item: $selectedEvent) { event in
            if let circleId = event.circleId {
                EventDetailSheet(
                    circleId: circleId,
                    eventId: event.id,
                    eventViewModel: eventViewModel
                )
            }
        }
        .task {
            // Only load events if we have circles and no events yet
            if !circleViewModel.circles.isEmpty && eventViewModel.events.isEmpty {
                await eventViewModel.loadAllEvents(circles: circleViewModel.circles)
            }
        }
        .onChange(of: circleViewModel.circles) { oldValue, newValue in
            // Only reload if circles changed from empty to non-empty
            if !newValue.isEmpty && oldValue.isEmpty {
                Task {
                    await eventViewModel.loadAllEvents(circles: newValue)
                }
            }
        }
    }
}

#Preview {
    EventsPage(
        circleViewModel: CircleViewModel(),
        eventViewModel: EventViewModel()
    )
}
