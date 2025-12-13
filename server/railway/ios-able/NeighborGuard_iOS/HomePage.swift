//
//  HomePage.swift
//  NeighborGuard
//
//  Home Page
//

import SwiftUI

struct HomePage: View {
    @ObservedObject var authViewModel: AuthViewModel
    @ObservedObject var circleViewModel: CircleViewModel
    @ObservedObject var eventViewModel: EventViewModel
    
    @State private var showCreateEvent = false
    @State private var selectedEvent: Event?
    
    var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good morning" }
        else if hour < 18 { return "Good afternoon" }
        else { return "Good evening" }
    }
    
    var userName: String {
        authViewModel.currentUser?.displayName ?? "User"
    }
    
    var userInitial: String {
        String(userName.prefix(1)).uppercased()
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // User Greeting Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(greeting)
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                        Text(userName)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.textPrimary)
                    }
                    Spacer()
                    
                    // Profile avatar
                    ZStack {
                        Circle()
                            .fill(Color.ngPurple.opacity(0.1))
                            .frame(width: 44, height: 44)
                        Text(userInitial)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.ngPurple)
                    }
                }
                .padding(.bottom, 8)
                
                // Alert Box
                AlertInfoBox(
                    title: "🆘 Security Actions",
                    message: "Tip: For emergencies, call your local emergency number directly.",
                    buttonTitle: "Report New Event",
                    buttonAction: { showCreateEvent = true }
                )
                
                // Security Status Card
                CardView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Current Security Status")
                            .font(.system(size: 16, weight: .semibold))
                        
                        let highPriorityCount = eventViewModel.homeEvents.filter { 
                            ($0.severity == "HIGH" || $0.severity == "MEDIUM") && $0.isOpen 
                        }.count
                        
                        if highPriorityCount == 0 {
                            HStack(spacing: 8) {
                                Text("🟢")
                                Text("No active high-risk events")
                                    .foregroundColor(Color(hex: "10b981"))
                            }
                        } else {
                            HStack(spacing: 8) {
                                Text("🟡")
                                Text("\(highPriorityCount) medium/high risk \(highPriorityCount == 1 ? "event" : "events") pending")
                                    .foregroundColor(Color(hex: "f59e0b"))
                            }
                        }
                        
                        if circleViewModel.circles.count > 1 {
                            Text("Monitoring \(circleViewModel.circles.count) circles")
                                .font(.system(size: 12))
                                .foregroundColor(.textSecondary)
                        }
                    }
                }
                
                // Events Section
                VStack(alignment: .leading, spacing: 16) {
                    Text("Active Events (\(eventViewModel.homeEvents.filter { $0.isOpen }.count))")
                        .font(.system(size: 18, weight: .semibold))
                    
                    if eventViewModel.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.vertical, 40)
                    } else if eventViewModel.activeEvents.isEmpty {
                        EmptyStateView(icon: "✓", message: "No active events")
                    } else {
                        ForEach(eventViewModel.activeEvents) { event in
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
            }
            .padding(16)
        }
        .background(Color.pageBackground)
        .refreshable {
            // Copy circles to local variable to avoid cancellation issues
            let circles = circleViewModel.circles
            if !circles.isEmpty {
                await eventViewModel.loadAllActiveEvents(circles: circles)
            }
        }
        .sheet(isPresented: $showCreateEvent) {
            CreateEventSheet(
                circleViewModel: circleViewModel,
                eventViewModel: eventViewModel,
                isPresented: $showCreateEvent
            )
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
            // Only load circles if empty
            if circleViewModel.circles.isEmpty {
                await circleViewModel.loadCircles()
            }
            // Only load events if we have circles and no events yet
            if !circleViewModel.circles.isEmpty && eventViewModel.homeEvents.isEmpty {
                await eventViewModel.loadAllActiveEvents(circles: circleViewModel.circles)
            }
        }
        .onChange(of: circleViewModel.circles) { oldValue, newValue in
            // Only reload if circles changed from empty to non-empty
            if !newValue.isEmpty && oldValue.isEmpty {
                Task {
                    await eventViewModel.loadAllActiveEvents(circles: newValue)
                }
            }
        }
    }
}

#Preview {
    HomePage(
        authViewModel: AuthViewModel(),
        circleViewModel: CircleViewModel(),
        eventViewModel: EventViewModel()
    )
}
