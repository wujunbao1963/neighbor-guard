//
//  MainTabView.swift
//  NeighborGuard
//
//  Main Tab Navigation
//

import SwiftUI

struct MainTabView: View {
    @ObservedObject var authViewModel: AuthViewModel
    @StateObject private var circleViewModel = CircleViewModel()
    @StateObject private var eventViewModel = EventViewModel()
    
    @State private var selectedTab = 0
    @State private var showCirclePicker = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HeaderView(
                title: "NeighborGuard",
                subtitle: "Community Watch",
                circleSelector: circleViewModel.circles.count > 1 ? { showCirclePicker = true } : nil,
                selectedCircleName: circleViewModel.selectedCircle?.displayName
            )
            
            // Tab Bar
            HStack(spacing: 0) {
                TabButton(title: "🏠 Home", isSelected: selectedTab == 0) {
                    selectedTab = 0
                }
                
                TabButton(title: "📋 Events", isSelected: selectedTab == 1) {
                    selectedTab = 1
                }
                
                TabButton(title: "⚙️ Settings", isSelected: selectedTab == 2) {
                    selectedTab = 2
                }
            }
            .background(Color.white)
            .overlay(Rectangle().fill(Color.border).frame(height: 2), alignment: .bottom)
            
            // Content
            Group {
                switch selectedTab {
                case 0:
                    HomePage(authViewModel: authViewModel, circleViewModel: circleViewModel, eventViewModel: eventViewModel)
                case 1:
                    EventsPage(circleViewModel: circleViewModel, eventViewModel: eventViewModel)
                case 2:
                    SettingsPage(authViewModel: authViewModel, circleViewModel: circleViewModel)
                default:
                    EmptyView()
                }
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .task {
            await circleViewModel.loadCircles()
        }
        .sheet(isPresented: $showCirclePicker) {
            CirclePickerSheet(
                circles: circleViewModel.circles,
                selectedCircle: circleViewModel.selectedCircle,
                onSelect: { circle in
                    Task { await circleViewModel.selectCircle(circle); showCirclePicker = false }
                }
            )
            .presentationDetents([.medium])
        }
    }
}

struct TabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                Text(title)
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? .ngPurple : .textSecondary)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .padding(.vertical, 16)
                    .padding(.horizontal, 24)
                
                Rectangle()
                    .fill(isSelected ? Color.ngPurple : Color.clear)
                    .frame(height: 3)
            }
        }
        .buttonStyle(.plain)
    }
}

struct CirclePickerSheet: View {
    let circles: [SecurityCircle]
    let selectedCircle: SecurityCircle?
    let onSelect: (SecurityCircle) -> Void
    
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(circles) { circle in
                    Button {
                        onSelect(circle)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(circle.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.textPrimary)
                                
                                if let home = circle.home {
                                    Text(Labels.houseType(home.houseType))
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                }
                            }
                            
                            Spacer()
                            
                            if selectedCircle?.id == circle.id {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.ngPurple)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Circle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    MainTabView(authViewModel: AuthViewModel())
}
