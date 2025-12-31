//
//  CreateEventSheet.swift
//  NeighborGuard
//
//  Create Event Sheet with Media Upload (Photos & Videos)
//

import SwiftUI

struct CreateEventSheet: View {
    @ObservedObject var circleViewModel: CircleViewModel
    @ObservedObject var eventViewModel: EventViewModel
    @Binding var isPresented: Bool
    
    @State private var eventTypes: [EventTypeConfig] = []
    @State private var eventZoneWhitelist: [String: [String]] = [:]
    @State private var isLoadingConfig = true
    
    @State private var selectedEventType: String = ""
    @State private var selectedZoneId: String = ""
    @State private var title: String = ""
    @State private var description: String = ""
    @State private var severity: String = "MEDIUM"
    
    // Media - now supports both photos and videos
    @State private var selectedImages: [UIImage] = []  // Legacy for backward compat
    @State private var selectedMedia: [MediaItem] = []
    @State private var showMediaPicker = false
    
    @State private var isSubmitting = false
    @State private var uploadProgress: String?
    @State private var errorMessage: String?
    
    var validZones: [Zone] {
        let zones = circleViewModel.enabledZones
        if selectedEventType.isEmpty { return zones }
        guard let whitelist = eventZoneWhitelist[selectedEventType], !whitelist.isEmpty else { return zones }
        return zones.filter { whitelist.contains($0.zoneType) }
    }
    
    var body: some View {
        NavigationStack {
            Group {
                if isLoadingConfig {
                    VStack { Spacer(); ProgressView(); Spacer() }
                } else {
                    formContent
                }
            }
            .navigationTitle("Report Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Submit") { Task { await submitEvent() } }
                        .fontWeight(.semibold)
                        .disabled(!isFormValid || isSubmitting)
                }
            }
        }
        .task { await loadConfig() }
        .sheet(isPresented: $showMediaPicker) {
            MediaPickerSheet(
                isPresented: $showMediaPicker,
                selectedImages: $selectedImages,
                onMediaSelected: { items in
                    selectedMedia.append(contentsOf: items)
                }
            )
            .presentationDetents([.height(380)])
        }
    }
    
    private var formContent: some View {
        Form {
            // Media Section (Photos & Videos) - AT THE TOP
            Section {
                if selectedMedia.isEmpty {
                    Button {
                        showMediaPicker = true
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(Color.white)
                                    .frame(width: 44, height: 44)
                                Image(systemName: "camera.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.ngPurple)
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("📷 Add Evidence")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                Text("Take photo, record video, or choose from library")
                                    .font(.system(size: 13))
                                    .foregroundColor(.white.opacity(0.9))
                            }
                            
                            Spacer()
                            
                            Image(systemName: "chevron.right")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        .padding(14)
                        .background(LinearGradient(colors: [Color.ngPurpleStart, Color.ngPurpleEnd], startPoint: .leading, endPoint: .trailing))
                        .cornerRadius(12)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
                } else {
                    SelectedMediaPreview(mediaItems: $selectedMedia) {
                        showMediaPicker = true
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                }
            } header: {
                Text("📷 Evidence (Recommended)")
            } footer: {
                if selectedMedia.isEmpty {
                    Text("Photos and videos help others understand the situation")
                        .font(.system(size: 12))
                }
            }
            
            Section("Event Type *") {
                Picker("Event Type", selection: $selectedEventType) {
                    Text("-- Select event type --").tag("")
                    ForEach(eventTypes) { type in
                        Text(type.labelEn).tag(type.value)
                    }
                }
                .onChange(of: selectedEventType) { oldValue, newValue in
                    onEventTypeChange(newValue)
                }
            }
            
            Section {
                Picker("Zone", selection: $selectedZoneId) {
                    Text("-- Select zone --").tag("")
                    ForEach(validZones) { zone in
                        Text("\(zone.icon) \(Labels.zoneType(zone.zoneType))").tag(zone.id)
                    }
                }
                .onChange(of: selectedZoneId) { oldValue, newValue in
                    onZoneChange(newValue)
                }
            } header: {
                HStack {
                    Text("Zone *")
                    if !selectedEventType.isEmpty && validZones.count < circleViewModel.enabledZones.count {
                        Text("(filtered by event type)")
                            .font(.caption)
                            .foregroundColor(.ngPurple)
                    }
                }
            }
            
            Section {
                TextField("Brief description of what happened", text: $title)
            } header: {
                HStack {
                    Text("Title *")
                    if selectedEventType != "custom" && !selectedEventType.isEmpty {
                        Text("(auto-generated, editable)")
                            .font(.caption)
                            .foregroundColor(.textSecondary)
                    }
                }
            }
            
            Section("Details (Optional)") {
                TextField("Additional details like time, appearance, license plate...", text: $description, axis: .vertical)
                    .lineLimit(3...6)
            }
            
            Section("Severity Level") {
                HStack(spacing: 12) {
                    ForEach([("HIGH", "High", Color.severityHigh), ("MEDIUM", "Medium", Color.severityMedium), ("LOW", "Low", Color.severityLow)], id: \.0) { sev in
                        Button {
                            severity = sev.0
                        } label: {
                            Text(sev.1)
                                .font(.system(size: 16, weight: severity == sev.0 ? .semibold : .regular))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(severity == sev.0 ? sev.2.opacity(0.2) : Color.white)
                                .foregroundColor(severity == sev.0 ? sev.2 : .textPrimary)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(severity == sev.0 ? sev.2 : Color.border, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .listRowInsets(EdgeInsets())
                .padding(.vertical, 8)
            }
            
            // Upload progress
            if let progress = uploadProgress {
                Section {
                    HStack {
                        ProgressView()
                        Text(progress)
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                }
            }
            
            if let error = errorMessage {
                Section {
                    Text(error)
                        .foregroundColor(.severityHigh)
                }
            }
        }
    }
    
    private var isFormValid: Bool {
        !selectedEventType.isEmpty && !selectedZoneId.isEmpty && !title.trimmingCharacters(in: .whitespaces).isEmpty
    }
    
    private func loadConfig() async {
        do {
            async let types = ConfigService.shared.getEventTypes()
            async let whitelist = ConfigService.shared.getEventZoneWhitelist()
            eventTypes = try await types
            eventZoneWhitelist = try await whitelist
        } catch {
            errorMessage = "Failed to load configuration"
        }
        isLoadingConfig = false
    }
    
    private func onEventTypeChange(_ value: String) {
        guard !value.isEmpty else { return }
        if let eventType = eventTypes.first(where: { $0.value == value }) {
            severity = eventType.severity
        }
        let newValidZones = validZones
        if !newValidZones.contains(where: { $0.id == selectedZoneId }) {
            selectedZoneId = newValidZones.first?.id ?? ""
        }
        if value != "custom" { generateTitle() }
    }
    
    private func onZoneChange(_ zoneId: String) {
        if selectedEventType != "custom" && !selectedEventType.isEmpty { generateTitle() }
    }
    
    private func generateTitle() {
        guard let zone = validZones.first(where: { $0.id == selectedZoneId }) else { return }
        let zoneName = Labels.zoneType(zone.zoneType)
        let templates: [String: String] = [
            "break_in_attempt": "Possible break-in at \(zoneName)",
            "perimeter_damage": "Damage found at \(zoneName)",
            "suspicious_person": "Suspicious person near \(zoneName)",
            "suspicious_vehicle": "Suspicious vehicle near \(zoneName)",
            "unusual_noise": "Unusual noise at \(zoneName)",
            "package_event": "Package event at \(zoneName)"
        ]
        title = templates[selectedEventType] ?? ""
    }
    
    private func submitEvent() async {
        guard let circleId = circleViewModel.selectedCircle?.id else {
            errorMessage = "Please select a circle first"
            return
        }
        
        isSubmitting = true
        errorMessage = nil
        uploadProgress = nil
        
        // Create event first
        let success = await eventViewModel.createEvent(
            circleId: circleId,
            zoneId: selectedZoneId,
            eventType: selectedEventType,
            title: title.trimmingCharacters(in: .whitespaces),
            description: description.trimmingCharacters(in: .whitespaces).isEmpty ? nil : description.trimmingCharacters(in: .whitespaces),
            severity: severity
        )
        
        if success {
            // Upload media if any
            if !selectedMedia.isEmpty, let newEvent = eventViewModel.homeEvents.first ?? eventViewModel.events.first {
                let photoCount = selectedMedia.filter { $0.type == .photo }.count
                let videoCount = selectedMedia.filter { $0.type == .video }.count
                
                var progressText = "Uploading "
                if photoCount > 0 { progressText += "\(photoCount) photo(s)" }
                if photoCount > 0 && videoCount > 0 { progressText += " and " }
                if videoCount > 0 { progressText += "\(videoCount) video(s)" }
                progressText += "..."
                
                uploadProgress = progressText
                
                do {
                    _ = try await MediaService.shared.uploadMediaItems(
                        circleId: circleId,
                        eventId: newEvent.id,
                        items: selectedMedia
                    )
                    uploadProgress = nil
                } catch {
                    print("Failed to upload media: \(error)")
                    // Don't fail the whole operation, event was created
                }
            }
            
            isPresented = false
        } else {
            errorMessage = eventViewModel.errorMessage ?? "Failed to create event"
        }
        
        isSubmitting = false
        uploadProgress = nil
    }
}

#Preview {
    CreateEventSheet(
        circleViewModel: CircleViewModel(),
        eventViewModel: EventViewModel(),
        isPresented: .constant(true)
    )
}
