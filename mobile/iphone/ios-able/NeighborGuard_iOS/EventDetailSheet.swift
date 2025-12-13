//
//  EventDetailSheet.swift
//  NeighborGuard
//
//  Event Detail Sheet - Self-contained, fetches its own data
//

import SwiftUI

struct FeedbackOption: Identifiable {
    let id: String
    let state: String
    let icon: String
    let label: String
}

let feedbackOptions: [String: [FeedbackOption]] = [
    "suspicious": [
        FeedbackOption(id: "1", state: "NORMAL_OK", icon: "✅", label: "Checked, looks normal"),
        FeedbackOption(id: "2", state: "SUSPICIOUS", icon: "⚠️", label: "Checked, seems suspicious"),
        FeedbackOption(id: "3", state: "WATCHING", icon: "👁️", label: "I'm nearby, watching from distance"),
        FeedbackOption(id: "4", state: "ESCALATE_RECOMMEND_CALL_POLICE", icon: "🚨", label: "Urgent, recommend calling police")
    ],
    "breakin": [
        FeedbackOption(id: "1", state: "ESCALATE_BREAKIN_SUSPECTED", icon: "🚨", label: "I see possible break-in, call police"),
        FeedbackOption(id: "2", state: "ESCALATE_CALLED_POLICE", icon: "📞", label: "I've called police"),
        FeedbackOption(id: "3", state: "WATCHING_SAFE_DISTANCE", icon: "👁️", label: "Watching from safe distance"),
        FeedbackOption(id: "4", state: "DAMAGE_ONLY_NO_PERSON", icon: "⚠️", label: "No person, only damage visible")
    ],
    "package": [
        FeedbackOption(id: "1", state: "PACKAGE_OK", icon: "👀", label: "Checked, package is there"),
        FeedbackOption(id: "2", state: "PACKAGE_TAKEN_BY_MEMBER", icon: "✅", label: "I picked it up for you"),
        FeedbackOption(id: "3", state: "PACKAGE_MISSING", icon: "⚠️", label: "Package is missing"),
        FeedbackOption(id: "4", state: "PACKAGE_WATCHING", icon: "👁️", label: "I'll keep an eye on it")
    ],
    "custom": [
        FeedbackOption(id: "1", state: "CUSTOM_NORMAL_OK", icon: "✅", label: "Checked, seems fine"),
        FeedbackOption(id: "2", state: "CUSTOM_SUSPICIOUS", icon: "⚠️", label: "Unusual, keep monitoring"),
        FeedbackOption(id: "3", state: "CUSTOM_WATCHING", icon: "👁️", label: "I'll watch the area"),
        FeedbackOption(id: "4", state: "CUSTOM_ESCALATE", icon: "🚨", label: "Risky, consider calling police")
    ]
]

func getEventCategory(_ eventType: String) -> String {
    switch eventType {
    case "package_event": return "package"
    case "break_in_attempt", "perimeter_damage": return "breakin"
    case "suspicious_person", "suspicious_vehicle", "unusual_noise": return "suspicious"
    default: return "custom"
    }
}

struct EventDetailSheet: View {
    let circleId: String
    let eventId: String
    @ObservedObject var eventViewModel: EventViewModel
    
    @Environment(\.dismiss) private var dismiss
    
    // Self-contained state - this sheet owns its data
    @State private var event: EventDetail?
    @State private var isLoading = true
    
    @State private var selectedFeedback: String?
    @State private var showNoteInput = false
    @State private var noteText = ""
    @State private var isSubmitting = false
    @State private var showResolveDialog = false
    @State private var resolveType: String?
    @State private var resolveNote = ""
    
    // Media upload
    @State private var showMediaPicker = false
    @State private var selectedImages: [UIImage] = []
    @State private var selectedMedia: [MediaItem] = []
    @State private var isUploading = false
    
    // Media viewer
    @State private var selectedMediaForViewing: EventMedia?
    
    var currentFeedbackOptions: [FeedbackOption] {
        guard let event = event else { return [] }
        return feedbackOptions[getEventCategory(event.eventType)] ?? feedbackOptions["custom"]!
    }
    
    var body: some View {
        NavigationStack {
            Group {
                if isLoading && event == nil {
                    VStack { Spacer(); ProgressView(); Spacer() }
                } else if let event = event {
                    eventContent(event)
                } else {
                    VStack(spacing: 12) {
                        Text("Unable to load event")
                            .foregroundColor(.textMuted)
                        Button("Retry") {
                            Task { await fetchEventDetail() }
                        }
                        .foregroundColor(.ngPurple)
                    }
                }
            }
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .task {
            await fetchEventDetail()
        }
        .sheet(isPresented: $showMediaPicker) {
            MediaPickerSheet(
                isPresented: $showMediaPicker,
                selectedImages: $selectedImages,
                onMediaSelected: { items in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        self.selectedMedia = items
                    }
                }
            )
            .presentationDetents([.height(380)])
        }
        .fullScreenCover(item: $selectedMediaForViewing) { media in
            MediaViewerSheet(media: media)
        }
        .onChange(of: selectedMedia) { oldValue, newValue in
            if !newValue.isEmpty {
                Task { @MainActor in
                    await uploadSelectedMedia()
                }
            }
        }
    }
    
    // MARK: - Fetch Event Detail
    @MainActor
    private func fetchEventDetail() async {
        if event == nil {
            isLoading = true
        }
        
        do {
            let response: EventDetailResponse = try await APIClient.shared.request(
                path: "/events/\(circleId)/\(eventId)",
                method: .GET,
                requiresAuth: true
            )
            self.event = response.event
            self.selectedFeedback = response.event.notes.first { $0.noteType == "REACTION" }?.reactionCode
            print("✅ Event detail fetched: \(response.event.title)")
        } catch {
            print("❌ Failed to fetch event detail: \(error)")
            // Keep existing event data on refresh failure
        }
        
        isLoading = false
    }
    
    @MainActor
    private func uploadSelectedMedia() async {
        guard !selectedMedia.isEmpty else { return }
        
        let itemsToUpload = selectedMedia
        selectedMedia = []
        isUploading = true
        
        do {
            _ = try await MediaService.shared.uploadMediaItems(
                circleId: circleId,
                eventId: eventId,
                items: itemsToUpload
            )
            print("✅ Upload complete, refreshing...")
            await fetchEventDetail()
        } catch {
            print("❌ Failed to upload media: \(error)")
        }
        
        isUploading = false
    }
    
    // MARK: - Event Content
    @ViewBuilder
    private func eventContent(_ event: EventDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header Card
                CardView(severity: event.severity) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            SeverityBadge(severity: event.severity)
                            if let zone = event.zone {
                                BadgeView("\(zone.icon) \(Labels.zoneType(zone.zoneType))")
                            }
                            Spacer()
                            StatusBadge(status: event.status)
                        }
                        
                        Text(event.title).font(.system(size: 20, weight: .bold))
                        
                        if let desc = event.description, !desc.isEmpty {
                            Text(desc).font(.system(size: 14)).foregroundColor(.textSecondary)
                        }
                        
                        // First Reported / Last Updated
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 4) {
                                Text("First Reported:")
                                    .font(.system(size: 12))
                                    .foregroundColor(.textMuted)
                                Text(formatDateString(event.createdAt))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.textSecondary)
                            }
                            HStack(spacing: 4) {
                                Text("Last Updated:")
                                    .font(.system(size: 12))
                                    .foregroundColor(.textMuted)
                                Text(formatDateString(event.updatedAt))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.textSecondary)
                            }
                        }
                        
                        Text("Reported by \(event.creator.displayName)")
                            .font(.system(size: 12)).foregroundColor(.textMuted)
                        
                        if event.policeReported {
                            HStack {
                                Text("🚨 Police Reported").font(.system(size: 14, weight: .medium)).foregroundColor(.severityHigh)
                                if let num = event.policeReportNumber {
                                    Text("(Report #: \(num))").font(.system(size: 12)).foregroundColor(.textSecondary)
                                }
                            }
                        }
                    }
                }
                
                // Upload Progress
                if isUploading {
                    HStack {
                        ProgressView()
                        Text("Uploading media...")
                            .font(.system(size: 14))
                            .foregroundColor(.textSecondary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(Color(hex: "f5f3ff"))
                    .cornerRadius(8)
                }
                
                // Response Summary
                if !event.notes.isEmpty {
                    responseSummaryView(event)
                }
                
                // Quick Response
                if event.isOpen {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("⚡ Quick Response").font(.system(size: 16, weight: .semibold))
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(currentFeedbackOptions) { option in
                                FeedbackButton(icon: option.icon, label: option.label, isSelected: selectedFeedback == option.state) {
                                    Task { await submitFeedback(option) }
                                }
                            }
                        }
                    }
                }
                
                // Add Evidence & Add Note - Same Row
                if event.isOpen && (event.permissions.canUploadMedia || event.permissions.canAddNote) {
                    HStack(spacing: 12) {
                        if event.permissions.canUploadMedia {
                            Button {
                                showMediaPicker = true
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "camera.fill")
                                        .font(.system(size: 16))
                                    Text("Add Evidence")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .background(LinearGradient(colors: [Color.ngPurpleStart, Color.ngPurpleEnd], startPoint: .leading, endPoint: .trailing))
                                .cornerRadius(10)
                            }
                        }
                        
                        if event.permissions.canAddNote {
                            Button {
                                showNoteInput = true
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "text.bubble.fill")
                                        .font(.system(size: 16))
                                    Text("Add Note")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(.ngPurple)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .background(Color.ngPurple.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.ngPurple, lineWidth: 1.5)
                                )
                                .cornerRadius(10)
                            }
                        }
                    }
                }
                
                // Note Input
                if showNoteInput {
                    VStack(spacing: 12) {
                        TextField("Enter your note...", text: $noteText, axis: .vertical)
                            .lineLimit(3...6).padding(12).background(Color.white).cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.ngPurple, lineWidth: 2))
                        HStack(spacing: 12) {
                            PrimaryButton("Submit Note", icon: "paperplane.fill", isLoading: isSubmitting) { Task { await submitNote() } }
                            SecondaryButton(title: "Cancel", icon: "xmark") { showNoteInput = false; noteText = "" }
                        }
                    }
                    .padding(16)
                    .background(Color(hex: "f5f3ff"))
                    .cornerRadius(12)
                }
                
                // Owner Actions
                if event.isOpen && event.permissions.canEdit {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("📋 Owner Actions").font(.system(size: 16, weight: .semibold))
                        
                        if showResolveDialog {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(resolveType == "RESOLVED_OK" ? "✅ Mark as Resolved" : "ℹ️ Mark as False Alarm")
                                    .font(.system(size: 16, weight: .semibold))
                                TextField("Enter notes (optional)...", text: $resolveNote, axis: .vertical)
                                    .lineLimit(2...4).padding(12).background(Color.white).cornerRadius(8)
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border))
                                HStack(spacing: 12) {
                                    PrimaryButton("Confirm", icon: "checkmark.circle.fill", isLoading: isSubmitting) { Task { await submitResolve() } }
                                    SecondaryButton(title: "Cancel", icon: "xmark") { showResolveDialog = false; resolveNote = "" }
                                }
                            }.padding(16).background(Color(hex: "f9fafb")).cornerRadius(12)
                        } else {
                            HStack(spacing: 12) {
                                if !event.policeReported {
                                    ActionButton(title: "Report Police", icon: "phone.fill", color: .severityHigh) { Task { await reportPolice() } }
                                }
                                ActionButton(title: "Resolved", icon: "checkmark.circle.fill", color: Color(hex: "10b981")) {
                                    resolveType = "RESOLVED_OK"; showResolveDialog = true
                                }
                                ActionButton(title: "False Alarm", icon: "info.circle.fill", color: Color(hex: "6b7280")) {
                                    resolveType = "FALSE_ALARM"; showResolveDialog = true
                                }
                            }
                        }
                    }
                }
                
                // Media Gallery
                if !event.media.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("🖼️ Evidence (\(event.media.count))").font(.system(size: 16, weight: .semibold))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 8) {
                            ForEach(event.media) { media in
                                mediaGridItem(media)
                            }
                        }
                    }
                }
                
                // Activity Timeline
                let timelineItems = buildTimelineItems(notes: event.notes, media: event.media)
                if !timelineItems.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("📜 Activity").font(.system(size: 16, weight: .semibold))
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(timelineItems.enumerated()), id: \.element.id) { index, item in
                                UnifiedTimelineItemView(
                                    item: item,
                                    isLast: index == timelineItems.count - 1,
                                    onMediaTap: { media in selectedMediaForViewing = media }
                                )
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
    }
    
    // MARK: - Response Summary
    @ViewBuilder
    private func responseSummaryView(_ event: EventDetail) -> some View {
        let stats = calculateResponseStats(event.notes)
        let summaryText = buildSummaryText(stats)
        
        if !summaryText.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.ngPurple)
                
                Text(summaryText)
                    .font(.system(size: 13))
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(hex: "f3f4f6"))
            .cornerRadius(8)
        }
    }
    
    struct ResponseStats {
        var viewed: Int = 0
        var recommendPolice: Int = 0
        var watching: Int = 0
    }
    
    private func buildSummaryText(_ stats: ResponseStats) -> String {
        var parts: [String] = []
        if stats.viewed > 0 { parts.append("\(stats.viewed) viewed") }
        if stats.recommendPolice > 0 { parts.append("\(stats.recommendPolice) recommend police") }
        if stats.watching > 0 { parts.append("\(stats.watching) watching") }
        return parts.joined(separator: " · ")
    }
    
    private func calculateResponseStats(_ notes: [EventNote]) -> ResponseStats {
        var stats = ResponseStats()
        var seenAuthors = Set<String>()
        
        for note in notes {
            guard note.noteType == "REACTION", let code = note.reactionCode else { continue }
            
            if let authorId = note.author?.id, !seenAuthors.contains(authorId) {
                seenAuthors.insert(authorId)
                stats.viewed += 1
            }
            
            let upperCode = code.uppercased()
            if ["ESCALATE", "POLICE", "CALL"].contains(where: { upperCode.contains($0) }) {
                stats.recommendPolice += 1
            }
            if ["WATCHING", "WATCH"].contains(where: { upperCode.contains($0) }) {
                stats.watching += 1
            }
        }
        
        return stats
    }
    
    // MARK: - Media Grid Item
    @ViewBuilder
    private func mediaGridItem(_ media: EventMedia) -> some View {
        let fullUrl = media.fileUrl.hasPrefix("http") ? media.fileUrl : "\(AppConfig.baseURL.replacingOccurrences(of: "/api", with: ""))\(media.fileUrl)"
        let thumbUrl = media.thumbnailUrl.map { $0.hasPrefix("http") ? $0 : "\(AppConfig.baseURL.replacingOccurrences(of: "/api", with: ""))\($0)" }
        
        Button {
            selectedMediaForViewing = media
        } label: {
            ZStack {
                AsyncImage(url: URL(string: thumbUrl ?? fullUrl)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color(hex: "e5e7eb")
                }
                .frame(width: 100, height: 100)
                .clipped()
                .cornerRadius(8)
                
                if media.mediaType == "video" {
                    ZStack {
                        Circle().fill(Color.black.opacity(0.5)).frame(width: 32, height: 32)
                        Image(systemName: "play.fill").foregroundColor(.white).font(.system(size: 14))
                    }
                }
            }
        }
    }
    
    // MARK: - Timeline Items
    private func buildTimelineItems(notes: [EventNote], media: [EventMedia]) -> [TimelineItem] {
        var items: [TimelineItem] = []
        
        for note in notes {
            items.append(TimelineItem(
                id: "note-\(note.id)",
                type: .note,
                timestamp: note.createdAt,
                author: note.author?.displayName ?? "System",
                content: note.body,
                isReaction: note.noteType == "REACTION",
                media: nil
            ))
        }
        
        for m in media {
            items.append(TimelineItem(
                id: "media-\(m.id)",
                type: .media,
                timestamp: m.createdAt,
                author: m.uploader.displayName,
                content: m.mediaType == "video" ? "Uploaded a video" : "Uploaded a photo",
                isReaction: false,
                media: m
            ))
        }
        
        return items.sorted { $0.timestamp > $1.timestamp }
    }
    
    // MARK: - Actions
    private func submitFeedback(_ option: FeedbackOption) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        
        do {
            let body: [String: Any] = [
                "body": option.label,
                "noteType": "REACTION",
                "reactionCode": option.state
            ]
            let _: AddNoteResponse = try await APIClient.shared.request(
                path: "/events/\(circleId)/\(eventId)/notes",
                method: .POST,
                body: body,
                requiresAuth: true
            )
            selectedFeedback = option.state
            await fetchEventDetail()
        } catch {
            print("❌ Failed to submit feedback: \(error)")
        }
        
        isSubmitting = false
    }
    
    private func submitNote() async {
        guard !noteText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSubmitting = true
        
        do {
            let body: [String: Any] = ["body": noteText.trimmingCharacters(in: .whitespaces)]
            let _: AddNoteResponse = try await APIClient.shared.request(
                path: "/events/\(circleId)/\(eventId)/notes",
                method: .POST,
                body: body,
                requiresAuth: true
            )
            noteText = ""
            showNoteInput = false
            await fetchEventDetail()
        } catch {
            print("❌ Failed to submit note: \(error)")
        }
        
        isSubmitting = false
    }
    
    private func submitResolve() async {
        guard let type = resolveType else { return }
        isSubmitting = true
        
        do {
            try await APIClient.shared.requestVoid(
                path: "/events/\(circleId)/\(eventId)/status",
                method: .PUT,
                body: ["status": type],
                requiresAuth: true
            )
            
            if !resolveNote.trimmingCharacters(in: .whitespaces).isEmpty {
                let noteBody: [String: Any] = ["body": resolveNote.trimmingCharacters(in: .whitespaces), "noteType": "SYSTEM"]
                let _: AddNoteResponse = try await APIClient.shared.request(
                    path: "/events/\(circleId)/\(eventId)/notes",
                    method: .POST,
                    body: noteBody,
                    requiresAuth: true
                )
            }
            
            showResolveDialog = false
            resolveNote = ""
            resolveType = nil
            await fetchEventDetail()
            
            // Update home events list
            eventViewModel.homeEvents.removeAll { $0.id == eventId }
        } catch {
            print("❌ Failed to resolve: \(error)")
        }
        
        isSubmitting = false
    }
    
    private func reportPolice() async {
        isSubmitting = true
        
        do {
            try await APIClient.shared.requestVoid(
                path: "/events/\(circleId)/\(eventId)/police",
                method: .PUT,
                body: ["reported": true],
                requiresAuth: true
            )
            
            let noteBody: [String: Any] = ["body": "Police report recorded", "noteType": "SYSTEM"]
            let _: AddNoteResponse = try await APIClient.shared.request(
                path: "/events/\(circleId)/\(eventId)/notes",
                method: .POST,
                body: noteBody,
                requiresAuth: true
            )
            
            await fetchEventDetail()
        } catch {
            print("❌ Failed to report police: \(error)")
        }
        
        isSubmitting = false
    }
}

// MARK: - Timeline Item Model
struct TimelineItem: Identifiable {
    let id: String
    let type: TimelineItemType
    let timestamp: String
    let author: String
    let content: String?
    let isReaction: Bool
    let media: EventMedia?
    
    enum TimelineItemType {
        case note
        case media
    }
}

// MARK: - Unified Timeline Item View
struct UnifiedTimelineItemView: View {
    let item: TimelineItem
    let isLast: Bool
    let onMediaTap: (EventMedia) -> Void
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(item.type == .media ? Color.ngPurple : (item.isReaction ? Color(hex: "f59e0b") : Color(hex: "6b7280")))
                    .frame(width: 10, height: 10)
                
                if !isLast {
                    Rectangle()
                        .fill(Color.border)
                        .frame(width: 2)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 10)
            
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.textPrimary)
                    
                    Spacer()
                    
                    Text(formatTimelineDate(item.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(.textMuted)
                }
                
                if item.type == .media, let media = item.media {
                    let fullUrl = media.fileUrl.hasPrefix("http") ? media.fileUrl : "\(AppConfig.baseURL.replacingOccurrences(of: "/api", with: ""))\(media.fileUrl)"
                    let thumbUrl = media.thumbnailUrl.map { $0.hasPrefix("http") ? $0 : "\(AppConfig.baseURL.replacingOccurrences(of: "/api", with: ""))\($0)" }
                    
                    Button { onMediaTap(media) } label: {
                        ZStack(alignment: .bottomLeading) {
                            AsyncImage(url: URL(string: thumbUrl ?? fullUrl)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Color(hex: "e5e7eb")
                            }
                            .frame(width: 120, height: 90)
                            .clipped()
                            .cornerRadius(8)
                            
                            if media.mediaType == "video" {
                                ZStack {
                                    Circle().fill(Color.black.opacity(0.6)).frame(width: 28, height: 28)
                                    Image(systemName: "play.fill").foregroundColor(.white).font(.system(size: 12))
                                }
                                .padding(6)
                            }
                        }
                    }
                } else if let content = item.content {
                    Text(content)
                        .font(.system(size: 14))
                        .foregroundColor(.textSecondary)
                }
            }
            .padding(.bottom, isLast ? 0 : 16)
        }
    }
}

// MARK: - Media Viewer Sheet
struct MediaViewerSheet: View {
    let media: EventMedia
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            let fullUrl = media.fileUrl.hasPrefix("http") ? media.fileUrl : "\(AppConfig.baseURL.replacingOccurrences(of: "/api", with: ""))\(media.fileUrl)"
            
            ZStack {
                Color.black.ignoresSafeArea()
                
                if media.mediaType == "video" {
                    VideoPlayerView(url: URL(string: fullUrl)!)
                } else {
                    AsyncImage(url: URL(string: fullUrl)) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        ProgressView()
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.white)
                }
            }
        }
    }
}

// MARK: - Video Player View
import AVKit

struct VideoPlayerView: View {
    let url: URL
    @State private var player: AVPlayer?
    
    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                player = AVPlayer(url: url)
                player?.play()
            }
            .onDisappear {
                player?.pause()
            }
    }
}

// MARK: - Helper
func formatTimelineDate(_ dateString: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    
    guard let date = formatter.date(from: dateString) else {
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: dateString) else { return dateString }
        return formatRelativeDate(date)
    }
    
    return formatRelativeDate(date)
}

func formatRelativeDate(_ date: Date) -> String {
    let now = Date()
    let diff = now.timeIntervalSince(date)
    
    if diff < 60 { return "Just now" }
    if diff < 3600 { return "\(Int(diff / 60))m ago" }
    if diff < 86400 { return "\(Int(diff / 3600))h ago" }
    if diff < 604800 { return "\(Int(diff / 86400))d ago" }
    
    let df = DateFormatter()
    df.dateFormat = "MMM d"
    return df.string(from: date)
}
