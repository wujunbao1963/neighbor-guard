//
//  MediaService.swift
//  NeighborGuard
//
//  Phase 4: Media Upload Service (Photos & Videos)
//

import Foundation
import UIKit
import AVFoundation

struct UploadedMedia: Codable, Identifiable {
    let id: String
    let mediaType: String
    let fileName: String
    let fileUrl: String
    let fileSizeBytes: Int
    let createdAt: String
}

struct UploadResponse: Codable {
    let success: Bool
    let media: [UploadedMedia]
    let message: String?
}

class MediaService {
    static let shared = MediaService()
    private init() {}
    
    // Upload photos only
    func uploadMedia(
        circleId: String,
        eventId: String,
        images: [UIImage],
        sourceType: String = "USER_UPLOAD"
    ) async throws -> [UploadedMedia] {
        guard let token = KeychainService.shared.load(forKey: KeychainKeys.accessToken) else {
            throw APIError.unauthorized
        }
        
        let url = URL(string: "\(AppConfig.baseURL)/uploads/\(circleId)/\(eventId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var data = Data()
        
        // Add source type
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\"sourceType\"\r\n\r\n".data(using: .utf8)!)
        data.append("\(sourceType)\r\n".data(using: .utf8)!)
        
        // Add images
        for (index, image) in images.enumerated() {
            guard let imageData = image.jpegData(compressionQuality: 0.8) else { continue }
            
            let filename = "photo_\(index + 1)_\(Int(Date().timeIntervalSince1970)).jpg"
            
            data.append("--\(boundary)\r\n".data(using: .utf8)!)
            data.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            data.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            data.append(imageData)
            data.append("\r\n".data(using: .utf8)!)
        }
        
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = data
        
        let (responseData, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(NSError(domain: "MediaService", code: -1))
        }
        
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        
        if httpResponse.statusCode >= 400 {
            if let errorResponse = try? JSONDecoder().decode(ServerErrorResponse.self, from: responseData) {
                throw APIError.serverError(statusCode: httpResponse.statusCode, message: errorResponse.message ?? errorResponse.error)
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: "Upload failed")
        }
        
        let uploadResponse = try JSONDecoder().decode(UploadResponse.self, from: responseData)
        return uploadResponse.media
    }
    
    // Upload mixed media (photos and videos)
    func uploadMediaItems(
        circleId: String,
        eventId: String,
        items: [MediaItem],
        sourceType: String = "USER_UPLOAD"
    ) async throws -> [UploadedMedia] {
        guard let token = KeychainService.shared.load(forKey: KeychainKeys.accessToken) else {
            throw APIError.unauthorized
        }
        
        var allUploaded: [UploadedMedia] = []
        
        // Separate photos and videos
        let photos = items.filter { $0.type == .photo }
        let videos = items.filter { $0.type == .video }
        
        // Upload photos first (batch)
        if !photos.isEmpty {
            let images = photos.compactMap { $0.image }
            if !images.isEmpty {
                print("📤 Uploading \(images.count) photos...")
                let uploaded = try await uploadMedia(circleId: circleId, eventId: eventId, images: images, sourceType: sourceType)
                allUploaded.append(contentsOf: uploaded)
                print("✅ Photos uploaded successfully")
            }
        }
        
        // Upload videos one by one (they're large)
        for (index, video) in videos.enumerated() {
            guard let videoURL = video.videoURL else { continue }
            
            print("📤 Uploading video \(index + 1)/\(videos.count)...")
            
            do {
                // Compress video first
                let compressedURL = try await compressVideo(inputURL: videoURL)
                
                // Upload compressed video
                let uploaded = try await uploadSingleVideo(
                    circleId: circleId,
                    eventId: eventId,
                    videoURL: compressedURL,
                    token: token,
                    sourceType: sourceType
                )
                allUploaded.append(contentsOf: uploaded)
                print("✅ Video \(index + 1) uploaded successfully")
                
                // Clean up compressed file
                try? FileManager.default.removeItem(at: compressedURL)
            } catch {
                print("❌ Failed to upload video \(index + 1): \(error)")
                // Continue with other videos
            }
        }
        
        return allUploaded
    }
    
    // Compress video for upload
    private func compressVideo(inputURL: URL) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mp4")
        
        let asset = AVAsset(url: inputURL)
        
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality) else {
            throw NSError(domain: "MediaService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Cannot create export session"])
        }
        
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        
        await exportSession.export()
        
        if let error = exportSession.error {
            throw error
        }
        
        guard exportSession.status == .completed else {
            throw NSError(domain: "MediaService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Video compression failed"])
        }
        
        // Log size reduction
        let inputSize = (try? FileManager.default.attributesOfItem(atPath: inputURL.path)[.size] as? Int) ?? 0
        let outputSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0
        print("📦 Video compressed: \(inputSize / 1024)KB → \(outputSize / 1024)KB")
        
        return outputURL
    }
    
    // Upload a single video file
    private func uploadSingleVideo(
        circleId: String,
        eventId: String,
        videoURL: URL,
        token: String,
        sourceType: String
    ) async throws -> [UploadedMedia] {
        let url = URL(string: "\(AppConfig.baseURL)/uploads/\(circleId)/\(eventId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 300 // 5 minutes for video upload
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        // Read video data
        let videoData = try Data(contentsOf: videoURL)
        print("📦 Video size: \(videoData.count / 1024)KB")
        
        var data = Data()
        
        // Add source type
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\"sourceType\"\r\n\r\n".data(using: .utf8)!)
        data.append("\(sourceType)\r\n".data(using: .utf8)!)
        
        // Add video
        let filename = "video_\(Int(Date().timeIntervalSince1970)).mp4"
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        data.append("Content-Type: video/mp4\r\n\r\n".data(using: .utf8)!)
        data.append(videoData)
        data.append("\r\n".data(using: .utf8)!)
        
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = data
        
        print("📤 Starting video upload (\(data.count / 1024)KB total)...")
        
        let (responseData, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(NSError(domain: "MediaService", code: -1))
        }
        
        print("📥 Upload response: \(httpResponse.statusCode)")
        
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        
        if httpResponse.statusCode >= 400 {
            if let responseStr = String(data: responseData, encoding: .utf8) {
                print("❌ Upload error response: \(responseStr)")
            }
            if let errorResponse = try? JSONDecoder().decode(ServerErrorResponse.self, from: responseData) {
                throw APIError.serverError(statusCode: httpResponse.statusCode, message: errorResponse.message ?? errorResponse.error)
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: "Video upload failed")
        }
        
        let uploadResponse = try JSONDecoder().decode(UploadResponse.self, from: responseData)
        return uploadResponse.media
    }
}
