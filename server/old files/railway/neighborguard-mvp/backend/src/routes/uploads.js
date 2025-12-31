// ============================================================================
// Upload Routes
// Phase 4: File upload for event media
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const prisma = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireCircleMember } = require('../middleware/auth');

// ============================================================================
// Configure Multer
// ============================================================================
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const circleDir = path.join(uploadDir, req.params.circleId);
    if (!fs.existsSync(circleDir)) {
      fs.mkdirSync(circleDir, { recursive: true });
    }
    cb(null, circleDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
  const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg'];
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`不支持的文件类型: ${file.mimetype}`, 400, 'INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800, // 50MB default
    files: 10 // Max 10 files per request
  }
});

// ============================================================================
// POST /api/uploads/:circleId/:eventId - Upload media to event
// ============================================================================
router.post(
  '/:circleId/:eventId',
  authenticate,
  requireCircleMember(['OWNER', 'HOUSEHOLD', 'NEIGHBOR', 'RELATIVE']),
  upload.array('files', 10),
  async (req, res, next) => {
    try {
      const { circleId, eventId } = req.params;
      const { sourceType = 'USER_UPLOAD' } = req.body;

      // Verify event exists
      const event = await prisma.event.findFirst({
        where: { id: eventId, circleId, deletedAt: null }
      });

      if (!event) {
        // Clean up uploaded files
        if (req.files) {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
      }

      if (!req.files || req.files.length === 0) {
        throw new AppError('请选择要上传的文件', 400, 'NO_FILES');
      }

      const mediaRecords = [];

      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith('video/');
        const fileUrl = `/uploads/${circleId}/${file.filename}`;

        // Calculate file hash for evidence integrity
        const fileBuffer = fs.readFileSync(file.path);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const media = await prisma.eventMedia.create({
          data: {
            eventId,
            uploaderId: req.circleMember.id,
            mediaType: isVideo ? 'VIDEO' : 'PHOTO',
            sourceType,
            fileName: file.originalname,
            fileUrl,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            originalFileHash: fileHash
          }
        });

        mediaRecords.push({
          id: media.id,
          mediaType: media.mediaType,
          fileName: media.fileName,
          fileUrl: media.fileUrl,
          fileSizeBytes: media.fileSizeBytes,
          createdAt: media.createdAt
        });
      }

      // Get uploader display name for note
      const uploaderName = req.circleMember.displayName || req.user.displayName;
      
      // Create a note recording the upload action
      const photoCount = mediaRecords.filter(m => m.mediaType === 'PHOTO').length;
      const videoCount = mediaRecords.filter(m => m.mediaType === 'VIDEO').length;
      const parts = [];
      if (photoCount > 0) parts.push(`${photoCount} 张图片`);
      if (videoCount > 0) parts.push(`${videoCount} 个视频`);
      const noteBody = `上传了 ${parts.join(' 和 ')}`;

      await prisma.eventNote.create({
        data: {
          eventId,
          authorId: req.circleMember.id,
          noteType: 'SYSTEM',
          body: noteBody
        }
      });

      res.status(201).json({
        success: true,
        media: mediaRecords,
        message: `成功上传 ${mediaRecords.length} 个文件`
      });
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      next(error);
    }
  }
);

// ============================================================================
// GET /api/uploads/:circleId/:eventId - Get all media for event
// ============================================================================
router.get('/:circleId/:eventId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;

    // Verify event exists
    const event = await prisma.event.findFirst({
      where: { id: eventId, circleId, deletedAt: null }
    });

    if (!event) {
      throw new AppError('事件不存在', 404, 'EVENT_NOT_FOUND');
    }

    const media = await prisma.eventMedia.findMany({
      where: { eventId },
      include: {
        uploader: {
          include: {
            user: { select: { displayName: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      media: media.map(m => ({
        id: m.id,
        mediaType: m.mediaType,
        sourceType: m.sourceType,
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        thumbnailUrl: m.thumbnailUrl,
        mimeType: m.mimeType,
        fileSizeBytes: m.fileSizeBytes,
        createdAt: m.createdAt,
        uploader: {
          id: m.uploader.id,
          displayName: m.uploader.displayName || m.uploader.user.displayName
        }
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELETE /api/uploads/:circleId/:mediaId - Delete a media file
// ============================================================================
router.delete('/:circleId/:mediaId', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, mediaId } = req.params;

    const media = await prisma.eventMedia.findUnique({
      where: { id: mediaId },
      include: {
        event: true
      }
    });

    if (!media || media.event.circleId !== circleId) {
      throw new AppError('媒体文件不存在', 404, 'MEDIA_NOT_FOUND');
    }

    // Check permissions - Owner or uploader can delete
    const isOwner = req.circleMember.role === 'OWNER';
    const isUploader = media.uploaderId === req.circleMember.id;
    
    if (!isOwner && !isUploader) {
      throw new AppError('没有权限删除此文件', 403, 'NOT_AUTHORIZED');
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '../../', media.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete thumbnail if exists
    if (media.thumbnailUrl) {
      const thumbPath = path.join(__dirname, '../../', media.thumbnailUrl);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }
    }

    // Delete database record
    await prisma.eventMedia.delete({
      where: { id: mediaId }
    });

    res.json({
      success: true,
      message: '文件已删除'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/uploads/:circleId/:eventId/download - Download event report package as zip
// ============================================================================
const archiver = require('archiver');

router.get('/:circleId/:eventId/download', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId, eventId } = req.params;

    // Get the event with all related data
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        circleId,
        deletedAt: null
      },
      include: {
        media: {
          include: {
            uploader: {
              include: {
                user: { select: { displayName: true } }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        zone: { select: { displayName: true } },
        circle: { select: { displayName: true } },
        creator: {
          include: {
            user: { select: { displayName: true } }
          }
        },
        notes: {
          include: {
            author: {
              include: {
                user: { select: { displayName: true } }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: { message: '事件不存在', code: 'EVENT_NOT_FOUND' }
      });
    }

    const exporterName = req.circleMember.displayName || req.user.displayName;
    const exportTime = new Date();
    const dateStr = exportTime.toISOString().split('T')[0];
    const creatorName = event.creator?.displayName || event.creator?.user?.displayName || '未知';
    
    // Status and severity labels
    const statusLabels = {
      OPEN: '待处理', ACKED: '已确认', WATCHING: '观察中',
      RESOLVED_OK: '已解决', RESOLVED_WARNING: '有损失',
      ESCALATED: '已报警', FALSE_ALARM: '误报'
    };
    const severityLabels = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' };
    const severityClass = { HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low' };
    const statusClass = event.status?.includes('RESOLVED') || event.status === 'FALSE_ALARM' ? 'badge-resolved' : 'badge-open';

    // Generate text report
    const textReport = generateTextReport(event, statusLabels, severityLabels, creatorName, exporterName, exportTime);
    
    // Generate HTML report
    const htmlReport = generateHtmlReport(event, statusLabels, severityLabels, severityClass, statusClass, creatorName, exporterName, exportTime);
    
    // Generate media manifest
    const mediaManifest = event.media?.map(m => ({
      id: m.id,
      fileName: m.fileName,
      type: m.mediaType,
      uploadedBy: m.uploader?.displayName || m.uploader?.user?.displayName || '未知',
      uploadedAt: m.createdAt,
      size: m.fileSizeBytes
    })) || [];

    // Set headers for zip download
    const safeTitle = event.title.substring(0, 30).replace(/[\/\\:*?"<>|]/g, '_');
    const zipFileName = `NeighborGuard_${eventId.substring(0, 16)}_${safeTitle}_${dateStr}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);

    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    // Add text report
    archive.append(textReport, { name: '事件记录.txt' });
    
    // Add HTML report
    archive.append(htmlReport, { name: '事件报告.html' });
    
    // Add media manifest
    archive.append(JSON.stringify(mediaManifest, null, 2), { name: '证据清单_media_manifest.json' });
    
    // Add media files to 证据文件/ folder
    if (event.media && event.media.length > 0) {
      for (const media of event.media) {
        const filePath = path.join(uploadDir, circleId, path.basename(media.fileUrl));
        if (fs.existsSync(filePath)) {
          const ext = path.extname(media.fileName);
          const safeFileName = `${media.id.substring(0, 8)}_${media.fileName.replace(/[\/\\:*?"<>|]/g, '_')}`;
          archive.file(filePath, { name: `证据文件/${safeFileName}` });
        }
      }
    }

    // Finalize archive
    await archive.finalize();

  } catch (error) {
    console.error('Download error:', error);
    next(error);
  }
});

// Generate text report
function generateTextReport(event, statusLabels, severityLabels, creatorName, exporterName, exportTime) {
  const formatTime = (date) => new Date(date).toLocaleString('zh-CN');
  
  let text = `NeighborGuard 事件记录
====================================

事件ID: ${event.id}
事件标题: ${event.title}
严重程度: ${severityLabels[event.severity] || event.severity}
位置: ${event.zone?.displayName || '未知'}
状态: ${statusLabels[event.status] || event.status}
描述: ${event.description || '无'}
创建时间: ${formatTime(event.occurredAt)}
创建人: ${creatorName}
所属圈子: ${event.circle?.displayName || '未知'}
`;

  if (event.policeReported) {
    text += `已报警: 是
报警时间: ${formatTime(event.policeReportedAt)}
${event.policeReportNumber ? `案件号: ${event.policeReportNumber}` : ''}
`;
  }

  text += `
====================================
时间线记录
====================================
`;

  if (event.notes && event.notes.length > 0) {
    for (const note of event.notes) {
      const authorName = note.author?.displayName || note.author?.user?.displayName || '系统';
      text += `
[${formatTime(note.createdAt)}] ${authorName}: ${note.body}
`;
    }
  } else {
    text += `
暂无记录
`;
  }

  // Add participant feedback section
  const feedbacks = event.notes?.filter(n => n.noteType === 'REACTION') || [];
  if (feedbacks.length > 0) {
    text += `
====================================
参与人员反馈
====================================
`;
    for (const fb of feedbacks) {
      const authorName = fb.author?.displayName || fb.author?.user?.displayName || '未知';
      text += `
${authorName}: ${fb.body}
`;
    }
  }

  text += `
====================================
导出时间: ${formatTime(exportTime)}
导出人: ${exporterName}
====================================
`;

  return text;
}

// Generate HTML report
function generateHtmlReport(event, statusLabels, severityLabels, severityClass, statusClass, creatorName, exporterName, exportTime) {
  const formatTime = (date) => new Date(date).toLocaleString('zh-CN');
  
  // Generate timeline HTML
  let timelineHtml = '';
  if (event.notes && event.notes.length > 0) {
    for (const note of event.notes) {
      const authorName = note.author?.displayName || note.author?.user?.displayName || '系统';
      timelineHtml += `
            <div class="timeline-item">
                <div class="timeline-time">${formatTime(note.createdAt)}</div>
                <div>
                    <span class="timeline-actor">${authorName}</span>: ${note.body}
                </div>
            </div>`;
    }
  }

  // Generate feedback table
  let feedbackHtml = '';
  const feedbacks = event.notes?.filter(n => n.noteType === 'REACTION') || [];
  if (feedbacks.length > 0) {
    feedbackHtml = `
    <div class="section">
        <h2>👥 参与人员反馈</h2>
        <table>
            <tr>
                <th>成员</th>
                <th>反馈</th>
                <th>时间</th>
            </tr>`;
    for (const fb of feedbacks) {
      const authorName = fb.author?.displayName || fb.author?.user?.displayName || '未知';
      feedbackHtml += `
            <tr>
                <td>${authorName}</td>
                <td>${fb.body}</td>
                <td>${formatTime(fb.createdAt)}</td>
            </tr>`;
    }
    feedbackHtml += `
        </table>
    </div>`;
  }

  // Generate media gallery
  let mediaHtml = '';
  if (event.media && event.media.length > 0) {
    mediaHtml = `
    <div class="section">
        <h2>📎 证据文件 (${event.media.length})</h2>
        <div class="media-grid">`;
    for (const media of event.media) {
      const uploaderName = media.uploader?.displayName || media.uploader?.user?.displayName || '未知';
      const safeFileName = `${media.id.substring(0, 8)}_${media.fileName.replace(/[\/\\:*?"<>|]/g, '_')}`;
      const fileSize = media.fileSizeBytes < 1024 * 1024 
        ? `${(media.fileSizeBytes / 1024).toFixed(1)} KB`
        : `${(media.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      
      if (media.mediaType === 'PHOTO') {
        mediaHtml += `
            <div class="media-item">
                <a href="证据文件/${safeFileName}" target="_blank">
                    <img class="media-thumbnail" src="证据文件/${safeFileName}" alt="${media.fileName}">
                    <div class="media-overlay">🔍 点击查看原图</div>
                </a>
                <div class="media-info">
                    <div class="media-filename">${media.fileName}</div>
                    <div class="media-meta">上传者: ${uploaderName}<br>时间: ${formatTime(media.createdAt)}<br>大小: ${fileSize}</div>
                </div>
            </div>`;
      } else {
        mediaHtml += `
            <div class="media-item">
                <a href="证据文件/${safeFileName}" target="_blank" class="video-link">
                    <div class="video-placeholder">
                        <span class="play-icon">▶️</span>
                        <span>点击播放视频</span>
                    </div>
                </a>
                <div class="media-info">
                    <div class="media-filename">🎥 ${media.fileName}</div>
                    <div class="media-meta">上传者: ${uploaderName}<br>时间: ${formatTime(media.createdAt)}<br>大小: ${fileSize}</div>
                </div>
            </div>`;
      }
    }
    mediaHtml += `
        </div>
    </div>`;
  }

  // Police report info
  let policeHtml = '';
  if (event.policeReported) {
    policeHtml = `
            <tr>
                <td>已报警</td>
                <td>是 - ${formatTime(event.policeReportedAt)}${event.policeReportNumber ? ` (案件号: ${event.policeReportNumber})` : ''}</td>
            </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NeighborGuard 安防事件报告</title>
    <style>
        body {
            font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .report-header {
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .report-header h1 {
            color: #667eea;
            margin: 0 0 10px 0;
        }
        .meta-info {
            color: #666;
            font-size: 14px;
        }
        .section {
            margin: 30px 0;
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
        }
        .section h2 {
            color: #333;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
            margin-top: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            background: white;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #f3f4f6;
            font-weight: 600;
            width: 30%;
        }
        .timeline-item {
            padding: 15px;
            margin: 10px 0;
            background: white;
            border-left: 4px solid #667eea;
            border-radius: 4px;
        }
        .timeline-time {
            font-size: 12px;
            color: #999;
            margin-bottom: 5px;
        }
        .timeline-actor {
            font-weight: 600;
            color: #667eea;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-high { background: #fee2e2; color: #991b1b; }
        .badge-medium { background: #fef3c7; color: #92400e; }
        .badge-low { background: #dbeafe; color: #1e40af; }
        .badge-resolved { background: #d1fae5; color: #065f46; }
        .badge-open { background: #fef3c7; color: #92400e; }
        .media-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
            margin: 20px 0;
        }
        .media-item {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .media-item a {
            display: block;
            text-decoration: none;
            color: inherit;
        }
        .media-thumbnail {
            width: 100%;
            height: 150px;
            object-fit: cover;
            display: block;
        }
        .media-overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .media-item:hover .media-overlay { opacity: 1; }
        .video-link { display: block; height: 150px; }
        .video-placeholder {
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .play-icon { font-size: 36px; margin-bottom: 8px; }
        .media-info { padding: 10px; }
        .media-filename {
            font-weight: 600;
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
        }
        .media-meta { font-size: 11px; color: #666; }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #999;
            font-size: 12px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="report-header">
        <h1>🛡️ NeighborGuard 安防事件报告</h1>
        <div class="meta-info">
            <p><strong>报告编号：</strong>${event.id}</p>
            <p><strong>生成时间：</strong>${formatTime(exportTime)}</p>
            <p><strong>导出人：</strong>${exporterName}</p>
        </div>
    </div>

    <div class="section">
        <h2>📋 事件概览</h2>
        <table>
            <tr>
                <th>事件标题</th>
                <td><strong>${event.title}</strong></td>
            </tr>
            <tr>
                <th>严重程度</th>
                <td><span class="badge ${severityClass[event.severity] || ''}">${severityLabels[event.severity] || event.severity}</span></td>
            </tr>
            <tr>
                <th>发生位置</th>
                <td>${event.zone?.displayName || '未知'}</td>
            </tr>
            <tr>
                <th>所属圈子</th>
                <td>${event.circle?.displayName || '未知'}</td>
            </tr>
            <tr>
                <th>创建时间</th>
                <td>${formatTime(event.occurredAt)}</td>
            </tr>
            <tr>
                <th>创建人</th>
                <td>${creatorName}</td>
            </tr>
            <tr>
                <th>当前状态</th>
                <td><span class="badge ${statusClass}">${statusLabels[event.status] || event.status}</span></td>
            </tr>
            <tr>
                <th>事件描述</th>
                <td>${event.description || '无'}</td>
            </tr>${policeHtml}
        </table>
    </div>

    ${mediaHtml}

    <div class="section">
        <h2>📅 事件时间线</h2>
        ${timelineHtml || '<p style="color: #999;">暂无记录</p>'}
    </div>

    ${feedbackHtml}

    <div class="section">
        <h2>📋 使用说明</h2>
        <ul>
            <li>本报告包含所有事件相关的证据文件，位于 <code>证据文件/</code> 文件夹中</li>
            <li>点击证据文件缩略图可查看原始文件</li>
            <li>详细的文件清单请查看 <code>证据清单_media_manifest.json</code></li>
            <li>本报告可直接用浏览器打开，或打印为PDF提交给相关部门</li>
        </ul>
    </div>

    <div class="footer">
        <p>本报告由 NeighborGuard 邻里联防安全协作系统自动生成</p>
        <p>报告内容真实有效，可用于向执法部门或保险公司提交</p>
        <p>如有疑问，请联系事件创建人：${creatorName}</p>
    </div>
</body>
</html>`;
}

// ============================================================================
// GET /api/uploads/:circleId/download-all - Download all media for circle as zip
// ============================================================================
router.get('/:circleId/download-all', authenticate, requireCircleMember(), async (req, res, next) => {
  try {
    const { circleId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    // Get all events with media in this circle
    const events = await prisma.event.findMany({
      where: {
        circleId,
        deletedAt: null,
        ...(Object.keys(dateFilter).length > 0 ? { occurredAt: dateFilter } : {})
      },
      include: {
        media: true,
        zone: { select: { displayName: true } }
      },
      orderBy: { occurredAt: 'desc' }
    });

    // Collect all media files
    const mediaFiles = [];
    for (const event of events) {
      for (const media of event.media) {
        const filePath = path.join(uploadDir, circleId, path.basename(media.fileUrl));
        
        if (fs.existsSync(filePath)) {
          const dateStr = new Date(event.occurredAt).toISOString().split('T')[0];
          const zoneName = event.zone?.displayName || 'unknown';
          const ext = path.extname(media.fileName);
          const fileName = `${dateStr}_${zoneName}_${event.title.substring(0, 20)}_${media.id.substring(0, 8)}${ext}`;
          mediaFiles.push({
            filePath,
            fileName: fileName.replace(/[\/\\:*?"<>|]/g, '_')
          });
        }
      }
    }

    if (mediaFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: '没有找到任何媒体文件', code: 'NO_MEDIA' }
      });
    }

    // Set headers for zip download
    const zipFileName = `neighborguard_media_${new Date().toISOString().split('T')[0]}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    // Add files to archive
    for (const { filePath, fileName } of mediaFiles) {
      archive.file(filePath, { name: fileName });
    }

    // Finalize archive
    await archive.finalize();

  } catch (error) {
    next(error);
  }
});

module.exports = router;
