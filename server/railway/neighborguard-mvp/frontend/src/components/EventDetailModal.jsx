import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI, uploadAPI } from '../services/api';
import LoadingSpinner from './LoadingSpinner';

// Feedback options by event category
const FEEDBACK_OPTIONS = {
  suspicious: [
    { state: 'NORMAL_OK', icon: '✅', label: '看过，觉得正常' },
    { state: 'SUSPICIOUS', icon: '⚠️', label: '看过，有点可疑' },
    { state: 'WATCHING', icon: '👁️', label: '我在附近，会远距离观察' },
    { state: 'ESCALATE_RECOMMEND_CALL_POLICE', icon: '🚨', label: '情况紧急，建议立刻报警' }
  ],
  breakin: [
    { state: 'ESCALATE_BREAKIN_SUSPECTED', icon: '🚨', label: '我看到疑似入室，建议立刻报警' },
    { state: 'ESCALATE_CALLED_POLICE', icon: '📞', label: '我已帮忙报警' },
    { state: 'WATCHING_SAFE_DISTANCE', icon: '👁️', label: '我在安全距离观察' },
    { state: 'DAMAGE_ONLY_NO_PERSON', icon: '⚠️', label: '没看到人，只看到破坏痕迹' }
  ],
  package: [
    { state: 'PACKAGE_OK', icon: '👀', label: '我看过，包裹还在' },
    { state: 'PACKAGE_TAKEN_BY_MEMBER', icon: '✅', label: '我已帮你代取' },
    { state: 'PACKAGE_MISSING', icon: '⚠️', label: '包裹不见了' },
    { state: 'PACKAGE_WATCHING', icon: '👁️', label: '我会留意观察' }
  ],
  custom: [
    { state: 'CUSTOM_NORMAL_OK', icon: '✅', label: '看过，觉得还好' },
    { state: 'CUSTOM_SUSPICIOUS', icon: '⚠️', label: '有点异常，建议继续观察' },
    { state: 'CUSTOM_WATCHING', icon: '👁️', label: '我会在附近留意观察' },
    { state: 'CUSTOM_ESCALATE', icon: '🚨', label: '有风险，建议报警或回来查看' }
  ]
};

// Get event category from event type
const getEventCategory = (eventType) => {
  if (eventType === 'package_event') return 'package';
  if (eventType === 'break_in_attempt' || eventType === 'perimeter_damage') return 'breakin';
  if (eventType === 'suspicious_person' || eventType === 'suspicious_vehicle' || eventType === 'unusual_noise') return 'suspicious';
  return 'custom';
};

export default function EventDetailModal({ eventId, circleId, onClose }) {
  const { user } = useAuth();
  const { currentCircleId } = useCircle();
  const effectiveCircleId = circleId || currentCircleId;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  
  // Resolution dialog state
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveType, setResolveType] = useState(null); // 'RESOLVED_OK' or 'FALSE_ALARM'
  const [resolveNote, setResolveNote] = useState('');

  // Fetch event
  useEffect(() => {
    const fetchEvent = async () => {
      if (!currentCircleId || !eventId) return;
      setLoading(true);
      try {
        const response = await eventAPI.getOne(effectiveCircleId, eventId);
        setEvent(response.data.event);
        
        // Check if user already gave feedback
        const userNote = response.data.event.notes?.find(
          n => n.author?.id === user?.id && n.noteType === 'REACTION'
        );
        if (userNote) setSelectedFeedback(userNote.reactionCode);
      } catch (err) {
        setError(err.response?.data?.error?.message || '加载事件失败');
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [effectiveCircleId, eventId, user?.id]);

  const statusLabels = {
    OPEN: '进行中', ACKED: '已确认', WATCHING: '有人观察',
    RESOLVED_OK: '已解决', RESOLVED_WARNING: '已结束(有损失)',
    ESCALATED: '已升级/报警', FALSE_ALARM: '误报'
  };
  const severityLabels = { HIGH: '高', MEDIUM: '中', LOW: '低' };
  const severityColors = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#94a3b8' };

  const isOpen = ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'].includes(event?.status);
  const eventCategory = event ? getEventCategory(event.eventType) : 'custom';
  const feedbackOptions = FEEDBACK_OPTIONS[eventCategory];

  // Handle feedback click
  const handleFeedbackClick = async (state) => {
    if (!isOpen || submitting) return;
    
    setSubmitting(true);
    try {
      await eventAPI.addNote(effectiveCircleId, eventId, {
        noteType: 'REACTION',
        reactionCode: state,
        body: feedbackOptions.find(o => o.state === state)?.label || state
      });
      setSelectedFeedback(state);
      // Refresh event
      const response = await eventAPI.getOne(effectiveCircleId, eventId);
      setEvent(response.data.event);
    } catch (err) {
      alert(err.response?.data?.error?.message || '提交反馈失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle status change with note
  const handleStatusChange = async (newStatus, noteBody) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await eventAPI.updateStatus(effectiveCircleId, eventId, newStatus);
      // Add a note recording the resolution
      if (noteBody) {
        await eventAPI.addNote(effectiveCircleId, eventId, { noteType: 'SYSTEM', body: noteBody });
      }
      const response = await eventAPI.getOne(effectiveCircleId, eventId);
      setEvent(response.data.event);
      // Close resolve dialog
      setShowResolveDialog(false);
      setResolveNote('');
      setResolveType(null);
    } catch (err) {
      alert(err.response?.data?.error?.message || '更新状态失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Open resolve dialog
  const openResolveDialog = (type) => {
    setResolveType(type);
    setResolveNote(type === 'RESOLVED_OK' ? '事件已解决，确认安全' : '经核实为误报');
    setShowResolveDialog(true);
  };

  // Submit resolution
  const submitResolution = () => {
    if (!resolveNote.trim()) {
      alert('请填写说明');
      return;
    }
    handleStatusChange(resolveType, resolveNote.trim());
  };

  // Handle add note
  const handleAddNote = async () => {
    if (!noteText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await eventAPI.addNote(effectiveCircleId, eventId, { noteType: 'COMMENT', body: noteText.trim() });
      setNoteText('');
      setShowNoteInput(false);
      const response = await eventAPI.getOne(effectiveCircleId, eventId);
      setEvent(response.data.event);
    } catch (err) {
      alert(err.response?.data?.error?.message || '添加评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setSubmitting(true);
    try {
      await uploadAPI.upload(effectiveCircleId, eventId, files);
      const response = await eventAPI.getOne(effectiveCircleId, eventId);
      setEvent(response.data.event);
      alert(`已上传 ${files.length} 个文件`);
    } catch (err) {
      alert(err.response?.data?.error?.message || '上传失败');
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">事件详情</h2>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><LoadingSpinner size="lg" /></div>
          ) : error ? (
            <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>{error}</div>
          ) : event && (
            <>
              {/* Closed Event Alert */}
              {!isOpen && (
                <div className="alert" style={{ 
                  marginBottom: '20px',
                  background: event.status === 'RESOLVED_OK' ? '#d1fae5' : '#f3f4f6',
                  border: `1px solid ${event.status === 'RESOLVED_OK' ? '#10b981' : '#d1d5db'}`
                }}>
                  {event.status === 'RESOLVED_OK' ? '✓ 此事件已解决' : 
                   event.status === 'FALSE_ALARM' ? 'ℹ️ 此事件已标记为误报' : '此事件已关闭'}
                </div>
              )}

              {/* Event Header */}
              <div style={{ 
                padding: '16px', background: '#f9fafb', borderRadius: '8px',
                borderLeft: `4px solid ${severityColors[event.severity]}`, marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span className={`badge badge-${event.severity?.toLowerCase()}`}>{severityLabels[event.severity]}风险</span>
                  <span className="badge" style={{ background: '#e0e0e0' }}>{event.zone?.displayName}</span>
                  <span className={`status-badge status-${event.status?.toLowerCase()}`}>{statusLabels[event.status]}</span>
                  <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                    {event.circle?.displayName || '圈子'}
                  </span>
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{event.title}</h3>
                {event.description && <p style={{ color: '#666', marginBottom: '8px' }}>{event.description}</p>}
                <div style={{ fontSize: '14px', color: '#999' }}>
                  发生时间: {new Date(event.occurredAt).toLocaleString('zh-CN')}<br/>
                  报告人: {event.creator?.displayName}
                </div>
                {event.policeReported && (
                  <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fef3c7', borderRadius: '6px', color: '#92400e' }}>
                    🚨 已于 {new Date(event.policeReportedAt).toLocaleString('zh-CN')} 报警
                    {event.policeReportNumber && ` (案件号: ${event.policeReportNumber})`}
                  </div>
                )}
              </div>

              {/* Media summary - download button only shows when event is resolved */}
              {event.media?.length > 0 && (
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px 16px', 
                  background: '#f0f9ff', 
                  borderRadius: '8px', 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '14px', color: '#0369a1' }}>
                    📎 此事件包含 {event.media.length} 个附件（见下方时间线）
                  </span>
                  {!isOpen && (
                    <a 
                      href={uploadAPI.downloadEvent(effectiveCircleId, eventId)}
                      download
                      style={{
                        padding: '6px 12px',
                        background: '#667eea',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '12px',
                        textDecoration: 'none'
                      }}
                    >
                      📥 下载报告
                    </a>
                  )}
                </div>
              )}

              {/* Feedback Buttons - Only show when event is open */}
              {isOpen && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ marginBottom: '12px' }}>邻里协作反馈</h4>
                  <div className="feedback-buttons">
                    {feedbackOptions.map(option => (
                      <button
                        key={option.state}
                        className={`feedback-btn ${selectedFeedback === option.state ? 'selected' : ''}`}
                        onClick={() => handleFeedbackClick(option.state)}
                        disabled={submitting}
                      >
                        <div className="feedback-icon">{option.icon}</div>
                        <div className="feedback-label">{option.label}</div>
                      </button>
                    ))}
                  </div>
                  
                  {/* Feedback summary */}
                  {event.notes?.filter(n => n.noteType === 'REACTION').length > 0 && (
                    <div style={{ marginTop: '12px', fontSize: '14px', color: '#667eea' }}>
                      {event.notes.filter(n => n.noteType === 'REACTION').length} 人已反馈
                    </div>
                  )}
                  
                  {/* Upload Evidence */}
                  <div style={{ marginTop: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>📸 上传证据（可选）</div>
                    <input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} disabled={submitting} />
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>支持照片和视频</div>
                  </div>
                </div>
              )}

              {/* Owner/Creator Actions */}
              {isOpen && event.permissions?.canEdit && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ marginBottom: '12px' }}>事件管理</h4>
                  
                  {/* Resolution Dialog */}
                  {showResolveDialog ? (
                    <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', marginBottom: '12px' }}>
                      <div style={{ fontWeight: '500', marginBottom: '12px' }}>
                        {resolveType === 'RESOLVED_OK' ? '✅ 标记已解决' : '❌ 标记为误报'}
                      </div>
                      <textarea
                        className="form-textarea"
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="请填写说明..."
                        style={{ marginBottom: '12px' }}
                        rows={3}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-primary" 
                          onClick={submitResolution}
                          disabled={submitting || !resolveNote.trim()}
                        >
                          {submitting ? '提交中...' : '确认提交'}
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => { setShowResolveDialog(false); setResolveNote(''); }}
                          disabled={submitting}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {!event.policeReported && (
                        <button className="btn btn-danger" onClick={() => {
                          if (confirm('确认记录已报警？')) {
                            eventAPI.updatePolice(effectiveCircleId, eventId, { policeReported: true })
                              .then(() => eventAPI.addNote(effectiveCircleId, eventId, { noteType: 'SYSTEM', body: '已记录报警' }))
                              .then(() => eventAPI.getOne(effectiveCircleId, eventId))
                              .then(res => setEvent(res.data.event))
                              .catch(err => alert(err.response?.data?.error?.message || '操作失败'));
                          }
                        }}>
                          记录我已报警
                        </button>
                      )}
                      <button className="btn btn-success" style={{ background: '#10b981' }} onClick={() => openResolveDialog('RESOLVED_OK')}>
                        已解决 / 已安全
                      </button>
                      <button className="btn btn-secondary" onClick={() => openResolveDialog('FALSE_ALARM')}>
                        标记为误报
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Section */}
              {isOpen && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ marginBottom: '12px' }}>备注与讨论</h4>
                  {!showNoteInput ? (
                    <button className="btn btn-secondary" onClick={() => setShowNoteInput(true)}>添加备注</button>
                  ) : (
                    <div>
                      <textarea className="form-textarea" placeholder="输入备注内容..." value={noteText} 
                        onChange={(e) => setNoteText(e.target.value)} style={{ marginBottom: '8px' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" onClick={handleAddNote} disabled={submitting}>提交备注</button>
                        <button className="btn btn-secondary" onClick={() => { setShowNoteInput(false); setNoteText(''); }}>取消</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 style={{ marginBottom: '12px' }}>事件时间线 ({event.notes?.length || 0})</h4>
                {event.notes?.length > 0 ? (
                  <div style={{ paddingLeft: '8px' }}>
                    {event.notes.map(note => {
                      // Check if this note is about media upload
                      const isMediaNote = note.body?.includes('上传了') && 
                        (note.body?.includes('图片') || note.body?.includes('视频'));
                      
                      // Find media uploaded by same user around this time (within 10 seconds)
                      const noteTime = new Date(note.createdAt).getTime();
                      const noteAuthorId = note.author?.id || note.authorId;
                      const relatedMedia = isMediaNote ? (event.media || []).filter(m => {
                        const mediaTime = new Date(m.createdAt).getTime();
                        const mediaUploaderId = m.uploader?.id || m.uploaderId;
                        // Match by uploader and time proximity
                        const sameUploader = mediaUploaderId === noteAuthorId;
                        const closeTime = Math.abs(mediaTime - noteTime) < 10000; // within 10 seconds
                        return sameUploader && closeTime;
                      }) : [];

                      return (
                        <div key={note.id} className="timeline-item">
                          <div className="timeline-time">{new Date(note.createdAt).toLocaleString('zh-CN')}</div>
                          <div className="timeline-content">
                            <strong>{note.author?.displayName || '系统'}</strong>
                            {note.noteType === 'REACTION' && <span style={{ marginLeft: '8px', color: '#667eea' }}>[反馈]</span>}
                            ：{note.body}
                            
                            {/* Show media thumbnails/links inline */}
                            {relatedMedia.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {relatedMedia.map(m => (
                                  <a key={m.id} href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ 
                                      width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', 
                                      background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      textDecoration: 'none', border: '1px solid #e5e7eb'
                                    }}>
                                    {m.mediaType === 'PHOTO' ? (
                                      <img src={m.thumbnailUrl || m.fileUrl} alt="" 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '🖼️'; }}
                                      />
                                    ) : (
                                      <div style={{ 
                                        width: '100%', height: '100%', 
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'
                                      }}>
                                        <span style={{ fontSize: '24px' }}>▶️</span>
                                        <span style={{ fontSize: '10px' }}>视频</span>
                                      </div>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}
                            
                            {/* If media note but no media found, show fallback links */}
                            {isMediaNote && relatedMedia.length === 0 && event.media?.length > 0 && (
                              <div style={{ marginTop: '8px', fontSize: '12px', color: '#667eea' }}>
                                📎 <a href="#media-section" style={{ color: '#667eea' }}>查看附件</a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#999', fontSize: '14px' }}>暂无动态</div>
                )}
              </div>

              {/* Participants */}
              {event.notes?.filter(n => n.noteType === 'REACTION').length > 0 && (
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px solid #e5e7eb' }}>
                  <h4 style={{ marginBottom: '12px' }}>👥 参与人员</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {event.notes.filter(n => n.noteType === 'REACTION').map(note => (
                      <div key={note.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', background: '#f0f4ff', borderRadius: '20px',
                        fontSize: '14px', border: '1px solid #e0e7ff'
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: '#667eea', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '500'
                        }}>
                          {note.author?.displayName?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '500' }}>{note.author?.displayName}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{note.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
