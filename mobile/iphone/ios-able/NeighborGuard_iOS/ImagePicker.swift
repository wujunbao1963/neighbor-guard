//
//  ImagePicker.swift
//  NeighborGuard
//
//  Phase 4: Camera and Photo Library Picker with Video Support
//

import SwiftUI
import PhotosUI
import AVFoundation

// MediaItem is defined in Models.swift

// MARK: - Camera Picker (Photo & Video)
struct CameraPicker: UIViewControllerRepresentable {
    @Binding var mediaItem: MediaItem?
    let mediaType: UIImagePickerController.CameraCaptureMode
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        
        if mediaType == .video {
            picker.mediaTypes = ["public.movie"]
            picker.cameraCaptureMode = .video
            picker.videoQuality = .typeMedium
            picker.videoMaximumDuration = 60 // 1 minute max
        } else {
            picker.mediaTypes = ["public.image"]
            picker.cameraCaptureMode = .photo
        }
        
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        
        init(_ parent: CameraPicker) {
            self.parent = parent
        }
        
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.mediaItem = MediaItem(type: .photo, image: image, videoURL: nil)
            } else if let videoURL = info[.mediaURL] as? URL {
                // Generate thumbnail for video
                let thumbnail = generateVideoThumbnail(url: videoURL)
                parent.mediaItem = MediaItem(type: .video, image: thumbnail, videoURL: videoURL)
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
        
        private func generateVideoThumbnail(url: URL) -> UIImage? {
            let asset = AVAsset(url: url)
            let imageGenerator = AVAssetImageGenerator(asset: asset)
            imageGenerator.appliesPreferredTrackTransform = true
            
            do {
                let cgImage = try imageGenerator.copyCGImage(at: .zero, actualTime: nil)
                return UIImage(cgImage: cgImage)
            } catch {
                return nil
            }
        }
    }
}

// MARK: - Photo Library Picker (Photos & Videos)
struct PhotoLibraryPicker: UIViewControllerRepresentable {
    @Binding var mediaItems: [MediaItem]
    let maxSelection: Int
    let includeVideos: Bool
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = maxSelection
        
        if includeVideos {
            config.filter = .any(of: [.images, .videos])
        } else {
            config.filter = .images
        }
        
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: PhotoLibraryPicker
        
        init(_ parent: PhotoLibraryPicker) {
            self.parent = parent
        }
        
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            parent.dismiss()
            
            var items: [MediaItem] = []
            let group = DispatchGroup()
            
            for result in results {
                group.enter()
                
                // Check if it's a video
                if result.itemProvider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                    result.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
                        defer { group.leave() }
                        
                        if let url = url {
                            // Copy to temp directory
                            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
                            try? FileManager.default.copyItem(at: url, to: tempURL)
                            
                            let thumbnail = self.generateVideoThumbnail(url: tempURL)
                            DispatchQueue.main.async {
                                items.append(MediaItem(type: .video, image: thumbnail, videoURL: tempURL))
                            }
                        }
                    }
                } else {
                    // It's an image
                    result.itemProvider.loadObject(ofClass: UIImage.self) { object, error in
                        defer { group.leave() }
                        
                        if let image = object as? UIImage {
                            DispatchQueue.main.async {
                                items.append(MediaItem(type: .photo, image: image, videoURL: nil))
                            }
                        }
                    }
                }
            }
            
            group.notify(queue: .main) {
                self.parent.mediaItems = items
            }
        }
        
        private func generateVideoThumbnail(url: URL) -> UIImage? {
            let asset = AVAsset(url: url)
            let imageGenerator = AVAssetImageGenerator(asset: asset)
            imageGenerator.appliesPreferredTrackTransform = true
            
            do {
                let cgImage = try imageGenerator.copyCGImage(at: .zero, actualTime: nil)
                return UIImage(cgImage: cgImage)
            } catch {
                return nil
            }
        }
    }
}

// MARK: - Media Picker Sheet
struct MediaPickerSheet: View {
    @Binding var isPresented: Bool
    @Binding var selectedImages: [UIImage]
    var onMediaSelected: (([MediaItem]) -> Void)?
    
    @State private var showCameraPhoto = false
    @State private var showCameraVideo = false
    @State private var showPhotoLibrary = false
    @State private var cameraMediaItem: MediaItem?
    @State private var libraryMediaItems: [MediaItem] = []
    
    var body: some View {
        VStack(spacing: 0) {
            // Handle
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.gray.opacity(0.3))
                .frame(width: 36, height: 5)
                .padding(.top, 8)
            
            Text("Add Media")
                .font(.system(size: 18, weight: .semibold))
                .padding(.top, 16)
            
            VStack(spacing: 12) {
                // Take Photo option
                Button {
                    showCameraPhoto = true
                } label: {
                    MediaOptionRow(
                        icon: "camera.fill",
                        iconColor: .ngPurple,
                        title: "Take Photo",
                        subtitle: "Use camera to capture evidence"
                    )
                }
                
                // Record Video option
                Button {
                    showCameraVideo = true
                } label: {
                    MediaOptionRow(
                        icon: "video.fill",
                        iconColor: Color(hex: "ef4444"),
                        title: "Record Video",
                        subtitle: "Record up to 60 seconds"
                    )
                }
                
                // Photo Library option
                Button {
                    showPhotoLibrary = true
                } label: {
                    MediaOptionRow(
                        icon: "photo.on.rectangle.angled",
                        iconColor: Color(hex: "10b981"),
                        title: "Choose from Library",
                        subtitle: "Select photos or videos"
                    )
                }
            }
            .padding(20)
            
            Button {
                isPresented = false
            } label: {
                Text("Cancel")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .background(Color.pageBackground)
        .fullScreenCover(isPresented: $showCameraPhoto) {
            CameraPicker(mediaItem: $cameraMediaItem, mediaType: .photo)
                .ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showCameraVideo) {
            CameraPicker(mediaItem: $cameraMediaItem, mediaType: .video)
                .ignoresSafeArea()
        }
        .sheet(isPresented: $showPhotoLibrary) {
            PhotoLibraryPicker(mediaItems: $libraryMediaItems, maxSelection: 10, includeVideos: true)
        }
        .onChange(of: cameraMediaItem) { oldValue, newValue in
            if let item = newValue {
                if let callback = onMediaSelected {
                    callback([item])
                } else if item.type == .photo, let image = item.image {
                    selectedImages.append(image)
                }
                cameraMediaItem = nil
                isPresented = false
            }
        }
        .onChange(of: libraryMediaItems) { oldValue, newValue in
            if !newValue.isEmpty {
                if let callback = onMediaSelected {
                    callback(newValue)
                } else {
                    // Legacy: only add photos to selectedImages
                    for item in newValue {
                        if item.type == .photo, let image = item.image {
                            selectedImages.append(image)
                        }
                    }
                }
                libraryMediaItems = []
                isPresented = false
            }
        }
    }
}

// MARK: - Media Option Row
struct MediaOptionRow: View {
    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String
    
    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.1))
                    .frame(width: 50, height: 50)
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundColor(iconColor)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.textPrimary)
                Text(subtitle)
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .foregroundColor(.textMuted)
        }
        .padding(16)
        .background(Color.white)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Selected Media Preview (Photos & Videos)
struct SelectedMediaPreview: View {
    @Binding var mediaItems: [MediaItem]
    let onAdd: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                let photoCount = mediaItems.filter { $0.type == .photo }.count
                let videoCount = mediaItems.filter { $0.type == .video }.count
                
                HStack(spacing: 4) {
                    if photoCount > 0 {
                        Text("📷 \(photoCount)")
                    }
                    if videoCount > 0 {
                        Text("🎥 \(videoCount)")
                    }
                }
                .font(.system(size: 14, weight: .semibold))
                
                Spacer()
                
                if mediaItems.count < 10 {
                    Button(action: onAdd) {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                            Text("Add")
                        }
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.ngPurple)
                    }
                }
            }
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(mediaItems.indices, id: \.self) { index in
                        ZStack(alignment: .topTrailing) {
                            if let image = mediaItems[index].image {
                                Image(uiImage: image)
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 80, height: 80)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            } else {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color(hex: "f5f5f5"))
                                    .frame(width: 80, height: 80)
                            }
                            
                            // Video indicator
                            if mediaItems[index].type == .video {
                                ZStack {
                                    Circle()
                                        .fill(Color.black.opacity(0.6))
                                        .frame(width: 30, height: 30)
                                    Image(systemName: "play.fill")
                                        .font(.system(size: 12))
                                        .foregroundColor(.white)
                                }
                                .position(x: 40, y: 40)
                            }
                            
                            Button {
                                mediaItems.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.white)
                                    .background(Circle().fill(Color.black.opacity(0.5)))
                            }
                            .offset(x: 6, y: -6)
                        }
                    }
                    
                    // Add more button
                    if mediaItems.count < 10 {
                        Button(action: onAdd) {
                            VStack(spacing: 8) {
                                Image(systemName: "plus")
                                    .font(.system(size: 24))
                                Text("Add")
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(.textMuted)
                            .frame(width: 80, height: 80)
                            .background(Color(hex: "f5f5f5"))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.border, style: StrokeStyle(lineWidth: 2, dash: [6]))
                            )
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Color(hex: "fafafa"))
        .cornerRadius(12)
    }
}

// MARK: - Legacy Selected Images Preview (for backward compatibility)
struct SelectedImagesPreview: View {
    @Binding var images: [UIImage]
    let onAdd: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("📷 Photos (\(images.count))")
                    .font(.system(size: 14, weight: .semibold))
                
                Spacer()
                
                if images.count < 10 {
                    Button(action: onAdd) {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                            Text("Add")
                        }
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.ngPurple)
                    }
                }
            }
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(images.indices, id: \.self) { index in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: images[index])
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 80, height: 80)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            
                            Button {
                                images.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.white)
                                    .background(Circle().fill(Color.black.opacity(0.5)))
                            }
                            .offset(x: 6, y: -6)
                        }
                    }
                    
                    // Add more button
                    if images.count < 10 {
                        Button(action: onAdd) {
                            VStack(spacing: 8) {
                                Image(systemName: "plus")
                                    .font(.system(size: 24))
                                Text("Add")
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(.textMuted)
                            .frame(width: 80, height: 80)
                            .background(Color(hex: "f5f5f5"))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.border, style: StrokeStyle(lineWidth: 2, dash: [6]))
                            )
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Color(hex: "fafafa"))
        .cornerRadius(12)
    }
}

