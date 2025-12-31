//
//  SettingsPage.swift
//  NeighborGuard
//
//  Settings Page with Tabs
//

import SwiftUI

struct SettingsPage: View {
    @ObservedObject var authViewModel: AuthViewModel
    @ObservedObject var circleViewModel: CircleViewModel
    
    @State private var selectedTab = 0
    
    // Can edit this circle's settings (OWNER or HOUSEHOLD)
    var canManageCircle: Bool {
        guard let circle = circleViewModel.selectedCircle else { return false }
        return ["OWNER", "HOUSEHOLD"].contains(circle.myRole)
    }
    
    var isOwner: Bool {
        circleViewModel.selectedCircle?.myRole == "OWNER"
    }
    
    // Tabs depend on whether user can manage the selected circle
    var tabs: [(id: Int, label: String, icon: String)] {
        var allTabs: [(id: Int, label: String, icon: String)] = [
            (id: 0, label: "Profile", icon: "👤")
        ]
        
        // Only show circle management tabs if user is OWNER or HOUSEHOLD
        if canManageCircle {
            allTabs.append(contentsOf: [
                (id: 1, label: "Home", icon: "🏠"),
                (id: 2, label: "Zones", icon: "📍"),
                (id: 3, label: "Members", icon: "👥")
            ])
        }
        
        return allTabs
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Tab Navigation
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(tabs, id: \.id) { tab in
                        Button {
                            selectedTab = tab.id
                        } label: {
                            VStack(spacing: 0) {
                                Text("\(tab.icon) \(tab.label)")
                                    .font(.system(size: 14, weight: selectedTab == tab.id ? .semibold : .regular))
                                    .foregroundColor(selectedTab == tab.id ? .ngPurple : .textSecondary)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                
                                Rectangle()
                                    .fill(selectedTab == tab.id ? Color.ngPurple : Color.clear)
                                    .frame(height: 2)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .background(Color.white)
            .overlay(Rectangle().fill(Color.border).frame(height: 1), alignment: .bottom)
            
            // Tab Content
            ScrollView {
                VStack(spacing: 16) {
                    // Show circle role info if not owner/household
                    if !canManageCircle, let circle = circleViewModel.selectedCircle {
                        CardView {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "info.circle.fill")
                                        .foregroundColor(.ngPurple)
                                    Text("Circle: \(circle.displayName)")
                                        .font(.system(size: 14, weight: .medium))
                                }
                                Text("You are a \(Labels.role(circle.myRole)) in this circle. Only owners and household members can manage circle settings.")
                                    .font(.system(size: 13))
                                    .foregroundColor(.textSecondary)
                            }
                        }
                    }
                    
                    switch selectedTab {
                    case 0:
                        ProfileTab(authViewModel: authViewModel)
                    case 1:
                        if canManageCircle {
                            HomeTab(circleViewModel: circleViewModel, canEdit: canManageCircle)
                        }
                    case 2:
                        if canManageCircle {
                            ZonesTab(circleViewModel: circleViewModel, canEdit: canManageCircle)
                        }
                    case 3:
                        if canManageCircle {
                            MembersTab(circleViewModel: circleViewModel, isOwner: isOwner)
                        }
                    default:
                        EmptyView()
                    }
                }
                .padding(16)
            }
            .background(Color.pageBackground)
        }
        .onChange(of: circleViewModel.selectedCircle?.id) { oldValue, newValue in
            // Reset to Profile tab when circle changes
            if !canManageCircle && selectedTab != 0 {
                selectedTab = 0
            }
        }
    }
}

// MARK: - Profile Tab
struct ProfileTab: View {
    @ObservedObject var authViewModel: AuthViewModel
    @State private var isEditing = false
    @State private var displayName = ""
    @State private var phone = ""
    @State private var isSaving = false
    
    var body: some View {
        VStack(spacing: 16) {
            // Profile Card
            CardView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Personal Information")
                            .font(.system(size: 16, weight: .semibold))
                        Spacer()
                        if !isEditing {
                            Button("Edit") {
                                displayName = authViewModel.currentUser?.displayName ?? ""
                                phone = authViewModel.currentUser?.phone ?? ""
                                isEditing = true
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.ngPurple)
                        } else {
                            HStack(spacing: 16) {
                                Button("Cancel") {
                                    isEditing = false
                                }
                                .font(.system(size: 14))
                                .foregroundColor(.textSecondary)
                                
                                Button(isSaving ? "Saving..." : "Save") {
                                    Task {
                                        isSaving = true
                                        await authViewModel.updateProfile(displayName: displayName, phone: phone)
                                        isSaving = false
                                        isEditing = false
                                    }
                                }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.ngPurple)
                                .disabled(isSaving)
                            }
                        }
                    }
                    
                    if isEditing {
                        // Edit Form
                        VStack(alignment: .leading, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Display Name")
                                    .font(.system(size: 14))
                                    .foregroundColor(.textSecondary)
                                TextField("Your name", text: $displayName)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Phone")
                                    .font(.system(size: 14))
                                    .foregroundColor(.textSecondary)
                                TextField("Phone number", text: $phone)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .keyboardType(.phonePad)
                            }
                        }
                    } else {
                        // Display Info
                        if let user = authViewModel.currentUser {
                            HStack(spacing: 16) {
                                ZStack {
                                    Circle()
                                        .fill(Color.ngPurple.opacity(0.2))
                                        .frame(width: 60, height: 60)
                                    Text(user.initials)
                                        .font(.system(size: 20, weight: .bold))
                                        .foregroundColor(.ngPurple)
                                }
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(user.displayName)
                                        .font(.system(size: 18, weight: .semibold))
                                    Text(user.email)
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                    if let phone = user.phone, !phone.isEmpty {
                                        Text(phone)
                                            .font(.system(size: 14))
                                            .foregroundColor(.textSecondary)
                                    }
                                }
                                Spacer()
                            }
                        }
                    }
                }
            }
            
            // App Info Card
            CardView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("About")
                        .font(.system(size: 16, weight: .semibold))
                    
                    HStack {
                        Text("Version")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                        Spacer()
                        Text("1.0.0")
                            .font(.system(size: 14))
                    }
                    
                    HStack {
                        Text("Environment")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                        Spacer()
                        Text(AppConfig.environment == .production ? "Production" : "Development")
                            .font(.system(size: 14))
                    }
                }
            }
            
            // Notification Settings
            NotificationSettingsCard()
            
            // Logout Button
            Button {
                Task {
                    await PushNotificationService.shared.unregisterToken()
                    await authViewModel.logout()
                }
            } label: {
                HStack {
                    Spacer()
                    if authViewModel.isLoading {
                        ProgressView().tint(.severityHigh)
                    } else {
                        Text("Logout")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.severityHigh)
                    }
                    Spacer()
                }
                .padding(.vertical, 14)
                .background(Color.white)
                .cornerRadius(12)
                .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
            }
            .disabled(authViewModel.isLoading)
        }
    }
}

// MARK: - Home Tab
struct HomeTab: View {
    @ObservedObject var circleViewModel: CircleViewModel
    let canEdit: Bool
    
    @State private var isEditing = false
    @State private var displayName = ""
    @State private var addressLine1 = ""
    @State private var city = ""
    @State private var isSaving = false
    @State private var saveError: String?
    
    var body: some View {
        VStack(spacing: 16) {
            if let circle = circleViewModel.selectedCircle, let home = circle.home {
                CardView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("Home Information")
                                .font(.system(size: 16, weight: .semibold))
                            Spacer()
                            if canEdit {
                                if !isEditing {
                                    Button("Edit") {
                                        displayName = home.displayName
                                        addressLine1 = home.addressLine1 ?? ""
                                        city = home.city ?? ""
                                        saveError = nil
                                        isEditing = true
                                    }
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.ngPurple)
                                } else {
                                    HStack(spacing: 16) {
                                        Button("Cancel") {
                                            isEditing = false
                                            saveError = nil
                                        }
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                        
                                        Button(isSaving ? "Saving..." : "Save") {
                                            Task {
                                                await saveHome()
                                            }
                                        }
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.ngPurple)
                                        .disabled(isSaving)
                                    }
                                }
                            }
                        }
                        
                        if let error = saveError {
                            Text(error)
                                .font(.system(size: 14))
                                .foregroundColor(.severityHigh)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.severityHigh.opacity(0.1))
                                .cornerRadius(8)
                        }
                        
                        if isEditing {
                            VStack(alignment: .leading, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Home Name")
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                    TextField("e.g. My Home", text: $displayName)
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                }
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Address")
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                    TextField("Street address", text: $addressLine1)
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                }
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("City")
                                        .font(.system(size: 14))
                                        .foregroundColor(.textSecondary)
                                    TextField("City", text: $city)
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 8) {
                                InfoRow(label: "Name", value: home.displayName)
                                InfoRow(label: "Type", value: Labels.houseType(home.houseType))
                                if let address = home.addressLine1, !address.isEmpty {
                                    InfoRow(label: "Address", value: address)
                                }
                                if let city = home.city, !city.isEmpty {
                                    InfoRow(label: "City", value: city)
                                }
                            }
                        }
                    }
                }
            } else {
                Text("No home information available")
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
            }
        }
    }
    
    private func saveHome() async {
        guard !displayName.isEmpty else {
            saveError = "Home name cannot be empty"
            return
        }
        
        isSaving = true
        saveError = nil
        
        let success = await circleViewModel.updateHome(
            displayName: displayName,
            addressLine1: addressLine1,
            city: city
        )
        
        isSaving = false
        
        if success {
            isEditing = false
        } else {
            saveError = circleViewModel.errorMessage ?? "Failed to save changes"
        }
    }
}

// MARK: - Zones Tab
struct ZonesTab: View {
    @ObservedObject var circleViewModel: CircleViewModel
    let canEdit: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Enabled zones can be selected when creating events")
                .font(.system(size: 14))
                .foregroundColor(.textSecondary)
            
            if !canEdit {
                Text("(Only Owner and Household can modify)")
                    .font(.system(size: 12))
                    .foregroundColor(.textMuted)
            }
            
            CardView {
                VStack(spacing: 0) {
                    ForEach(Array(circleViewModel.allZones.enumerated()), id: \.element.id) { index, zone in
                        HStack {
                            Text(zone.icon)
                                .font(.system(size: 20))
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Labels.zoneType(zone.zoneType))
                                    .font(.system(size: 14, weight: .medium))
                            }
                            
                            Spacer()
                            
                            Toggle("", isOn: Binding(
                                get: { zone.isEnabled },
                                set: { newValue in
                                    Task {
                                        await circleViewModel.toggleZone(zone: zone, enabled: newValue)
                                    }
                                }
                            ))
                            .labelsHidden()
                            .tint(.ngPurple)
                            .disabled(!canEdit)
                        }
                        .padding(.vertical, 12)
                        
                        if index < circleViewModel.allZones.count - 1 {
                            Divider()
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Members Tab
struct MembersTab: View {
    @ObservedObject var circleViewModel: CircleViewModel
    let isOwner: Bool
    
    @State private var showAddMember = false
    @State private var newMemberEmail = ""
    @State private var newMemberRole = "NEIGHBOR"
    @State private var isAdding = false
    @State private var errorMessage = ""
    
    let roleOptions = [
        ("HOUSEHOLD", "Household"),
        ("NEIGHBOR", "Neighbor"),
        ("RELATIVE", "Relative")
    ]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Circle members can view and participate in event discussions")
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
                
                Spacer()
                
                if isOwner && !showAddMember {
                    Button {
                        showAddMember = true
                    } label: {
                        Text("+ Add")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.ngPurple)
                            .cornerRadius(8)
                    }
                }
            }
            
            // Add Member Form
            if isOwner && showAddMember {
                CardView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Add New Member")
                            .font(.system(size: 16, weight: .semibold))
                        
                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.severityHigh)
                                .cornerRadius(8)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Email Address *")
                                .font(.system(size: 14))
                                .foregroundColor(.textSecondary)
                            TextField("member@example.com", text: $newMemberEmail)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Role")
                                .font(.system(size: 14))
                                .foregroundColor(.textSecondary)
                            Picker("Role", selection: $newMemberRole) {
                                ForEach(roleOptions, id: \.0) { role in
                                    Text(role.1).tag(role.0)
                                }
                            }
                            .pickerStyle(.segmented)
                        }
                        
                        HStack(spacing: 12) {
                            Button {
                                Task {
                                    await addMember()
                                }
                            } label: {
                                Text(isAdding ? "Adding..." : "Add")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 10)
                                    .background(Color.ngPurple)
                                    .cornerRadius(8)
                            }
                            .disabled(isAdding || newMemberEmail.isEmpty)
                            
                            Button {
                                showAddMember = false
                                newMemberEmail = ""
                                newMemberRole = "NEIGHBOR"
                                errorMessage = ""
                            } label: {
                                Text("Cancel")
                                    .font(.system(size: 14))
                                    .foregroundColor(.textSecondary)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 10)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            
            // Members List
            if let members = circleViewModel.circleDetail?.members {
                CardView {
                    VStack(spacing: 0) {
                        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .fill(Color.ngPurple.opacity(0.2))
                                        .frame(width: 40, height: 40)
                                    Text(String(member.displayName.prefix(1)))
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.ngPurple)
                                }
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.displayName)
                                        .font(.system(size: 14, weight: .medium))
                                    if let email = member.email {
                                        Text(email)
                                            .font(.system(size: 12))
                                            .foregroundColor(.textSecondary)
                                    }
                                }
                                
                                Spacer()
                                
                                Text(Labels.role(member.role))
                                    .font(.system(size: 12))
                                    .foregroundColor(.ngPurple)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.ngPurple.opacity(0.1))
                                    .cornerRadius(12)
                                
                                if isOwner && member.role != "OWNER" {
                                    Button {
                                        Task {
                                            await circleViewModel.removeMember(memberId: member.id)
                                        }
                                    } label: {
                                        Text("Remove")
                                            .font(.system(size: 12))
                                            .foregroundColor(.severityHigh)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 4)
                                                    .stroke(Color.severityHigh, lineWidth: 1)
                                            )
                                    }
                                }
                            }
                            .padding(.vertical, 12)
                            
                            if index < members.count - 1 {
                                Divider()
                            }
                        }
                    }
                }
            }
        }
    }
    
    private func addMember() async {
        guard !newMemberEmail.isEmpty else {
            errorMessage = "Please enter an email"
            return
        }
        
        // Basic email validation
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        guard emailPredicate.evaluate(with: newMemberEmail) else {
            errorMessage = "Please enter a valid email address"
            return
        }
        
        isAdding = true
        errorMessage = ""
        
        let success = await circleViewModel.addMember(email: newMemberEmail, role: newMemberRole)
        
        isAdding = false
        
        if success {
            showAddMember = false
            newMemberEmail = ""
            newMemberRole = "NEIGHBOR"
        } else {
            errorMessage = circleViewModel.errorMessage ?? "Failed to add member"
        }
    }
}

// MARK: - Helper Views
struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundColor(.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 14))
        }
    }
}

// MARK: - Notification Settings Card
struct NotificationSettingsCard: View {
    @StateObject private var pushService = PushNotificationService.shared
    @State private var isCheckingStatus = true
    
    var body: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("🔔 Notifications")
                        .font(.system(size: 16, weight: .semibold))
                    Spacer()
                }
                
                if isCheckingStatus {
                    HStack {
                        ProgressView().scaleEffect(0.8)
                        Text("Checking status...")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                } else if pushService.isPermissionGranted {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Color(hex: "10b981"))
                        Text("Notifications enabled")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "10b981"))
                    }
                    
                    Text("You'll receive alerts for new events and updates")
                        .font(.system(size: 13))
                        .foregroundColor(.textSecondary)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "bell.slash.fill")
                            .foregroundColor(.textMuted)
                        Text("Notifications disabled")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                    
                    Button {
                        Task {
                            await pushService.requestPermission()
                        }
                    } label: {
                        Text("Enable Notifications")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.ngPurple)
                            .cornerRadius(8)
                    }
                    .padding(.top, 4)
                }
            }
        }
        .task {
            await pushService.checkPermissionStatus()
            isCheckingStatus = false
        }
    }
}

#Preview {
    SettingsPage(
        authViewModel: AuthViewModel(),
        circleViewModel: CircleViewModel()
    )
}
