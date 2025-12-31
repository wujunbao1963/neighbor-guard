import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI, uploadAPI } from '../services/api';
import LoadingSpinner from './LoadingSpinner';

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_SEVERITY = {
  HIGH: { label: 'High', color: '#ef4444', bgColor: '#fee2e2' },
  MEDIUM: { label: 'Medium', color: '#f59e0b', bgColor: '#fef3c7' },
  LOW: { label: 'Low', color: '#64748b', bgColor: '#f1f5f9' }
};

const EVENT_STATUS = {
  OPEN: { label: 'Open', color: '#dc2626', bgColor: '#fee2e2' },
  ACKED: { label: 'Acknowledged', color: '#1e40af', bgColor: '#dbeafe' },
  WATCHING: { label: 'Watching', color: '#b45309', bgColor: '#fef3c7' },
  ESCALATED: { label: 'Escalated', color: '#7c3aed', bgColor: '#f3e8ff' },
  RESOLVED_OK: { label: 'Resolved', color: '#065f46', bgColor: '#d1fae5' },
  RESOLVED_WARNING: { label: 'Resolved (Loss)', color: '#c2410c', bgColor: '#ffedd5' },
  FALSE_ALARM: { label: 'False Alarm', color: '#6b7280', bgColor: '#f3f4f6' }
};

const EVENT_SOURCE_TYPES = {
  CAMERA: { label: 'Camera', icon: '📹', color: '#8b5cf6', bgColor: '#f3e8ff' },
  SENSOR: { label: 'Sensor', icon: '📡', color: '#0891b2', bgColor: '#cffafe' },
  EXTERNAL: { label: 'External', icon: '🔗', color: '#059669', bgColor: '#d1fae5' },
  MANUAL: { label: 'Manual', icon: '✏️', color: '#6b7280', bgColor: '#f3f4f6' },
  FUSION: { label: 'AI Detected', icon: '🧠', color: '#7c3aed', bgColor: '#f3e8ff' }
};

const SENSOR_TYPES = {
  DOOR_CONTACT: { label: 'Door Contact', icon: '🚪' },
  PIR: { label: 'PIR Motion', icon: '👁️' },
  GLASS_BREAK: { label: 'Glass Break', icon: '🪟' },
  VIBRATION: { label: 'Vibration', icon: '📳' },
  SMOKE: { label: 'Smoke', icon: '🔥' },
  WATER_LEAK: { label: 'Water Leak', icon: '💧' },
  OTHER: { label: 'Other', icon: '📡' }
};

// Phase 2: Fusion rule display info
const FUSION_RULES = {
  R1_BREAKIN_DOOR_PIR: { label: 'Break-in Pattern', icon: '🚨', description: 'Door opened with motion detected inside' },
  R2_BREAKIN_GLASS: { label: 'Glass Break Alert', icon: '🪟', description: 'Glass break sensor triggered' },
  R3_SUSPICIOUS_PERSON: { label: 'Suspicious Activity', icon: '👤', description: 'Person detected in private area' },
  R4_SUSPICIOUS_VEHICLE: { label: 'Vehicle Alert', icon: '🚗', description: 'Unusual vehicle activity detected' },
  R5_MOTION_ALERT: { label: 'Motion Alert', icon: '🔔', description: 'Motion detected in monitored area' }
};

const ACTIVE_STATUSES = ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'];

// Feedback options
const FEEDBACK_OPTIONS = [
  { state: 'NORMAL_OK', icon: '✅', label: 'Looks normal to me' },
  { state: 'SUSPICIOUS', icon: '⚠️', label: 'Looks suspicious' },
  { state: 'WATCHING', icon: '👁️', label: 'I\'m watching from nearby' },
  { state: 'ESCALATE', icon: '🚨', label: 'Urgent - call police' }
];

// ============================================================================
// STYLES
// ============================================================================
const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modal: {
    background: 'white',
    borderRadius: '16px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  header: {
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  body: {
    padding: '20px'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  btn: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500'
  },
  btnPrimary: { background: '#667eea', color: 'white' },
  btnSecondary: { background: '#f5f5f5', color: '#333' },
  btnSuccess: { background: '#10b981', color: 'white' },
  btnDanger: { background: '#ef4444', color: 'white' },
  infoBox: (bgColor, borderColor) => ({
    background: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px'
  }),
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '20px'
  },
  gridItem: {
    background: '#f9fafb',
    padding: '12px',
    borderRadius: '8px'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
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
  const [mlFeedback, setMlFeedback] = useState(null);  // Phase 2: ML feedback state
  const [mlFeedbackMessage, setMlFeedbackMessage] = useState('');  // Show after submission

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    if (!effectiveCircleId || !eventId) return;
    loadEvent();
    loadMlFeedback();
  }, [effectiveCircleId, eventId]);

  const loadEvent = async () => {
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
      setError(err.response?.data?.error?.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const loadMlFeedback = async () => {
    try {
      const response = await eventAPI.getFeedback(effectiveCircleId, eventId);
      if (response.data.myFeedback) {
        setMlFeedback(response.data.myFeedback.label);
      }
    } catch (err) {
      // Ignore - feedback feature may not be available
    }
  };

  const handleMlFeedback = async (label) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await eventAPI.submitFeedback(effectiveCircleId, eventId, label);
      setMlFeedback(label);
      setMlFeedbackMessage(response.data.message);
      // Clear message after 3 seconds
      setTimeout(() => setMlFeedbackMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleFeedbackClick = async (state) => {
    if (!isOpen || submitting) return;
    setSubmitting(true);
    try {
      await eventAPI.addNote(effectiveCircleId, eventId, {
        noteType: 'REACTION',
        reactionCode: state,
        body: FEEDBACK_OPTIONS.find(o => o.state === state)?.label || state
      });
      setSelectedFeedback(state);
      await loadEvent();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await eventAPI.updateStatus(effectiveCircleId, eventId, newStatus);
      await loadEvent();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await eventAPI.addNote(effectiveCircleId, eventId, { noteType: 'COMMENT', body: noteText.trim() });
      setNoteText('');
      setShowNoteInput(false);
      await loadEvent();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setSubmitting(true);
    try {
      await uploadAPI.upload(effectiveCircleId, eventId, files);
      await loadEvent();
      alert(`Uploaded ${files.length} file(s)`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const isOpen = ACTIVE_STATUSES.includes(event?.status);
  const severityInfo = EVENT_SEVERITY[event?.severity] || EVENT_SEVERITY.LOW;
  const statusInfo = EVENT_STATUS[event?.status] || EVENT_STATUS.OPEN;
  const sourceInfo = EVENT_SOURCE_TYPES[event?.sourceType] || EVENT_SOURCE_TYPES.MANUAL;

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Event Details</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>{error}</div>
          ) : event && (
            <>
              {/* Closed Event Alert */}
              {!isOpen && (
                <div style={styles.infoBox(
                  event.status === 'RESOLVED_OK' ? '#d1fae5' : '#f3f4f6',
                  event.status === 'RESOLVED_OK' ? '#10b981' : '#d1d5db'
                )}>
                  {event.status === 'RESOLVED_OK' ? '✓ This event has been resolved' :
                   event.status === 'FALSE_ALARM' ? 'ℹ️ This event was marked as false alarm' : 'This event is closed'}
                </div>
              )}

              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                <span style={{ ...styles.badge, background: severityInfo.bgColor, color: severityInfo.color }}>
                  {severityInfo.label} Risk
                </span>
                <span style={{ ...styles.badge, background: '#f5f5f5' }}>
                  📍 {event.zone?.displayName || 'Unknown'}
                </span>
                <span style={{ ...styles.badge, background: sourceInfo.bgColor, color: sourceInfo.color }}>
                  {sourceInfo.icon} {sourceInfo.label}
                </span>
              </div>

              {/* Title & Description */}
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', margin: 0, marginBottom: '8px' }}>
                {event.title}
              </h3>
              {event.description && (
                <p style={{ color: '#666', marginBottom: '16px', margin: 0, marginBottom: '16px' }}>{event.description}</p>
              )}

              {/* Info Grid */}
              <div style={styles.grid2}>
                <div style={styles.gridItem}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Occurred At</div>
                  <div style={{ fontWeight: '500' }}>{formatTime(event.occurredAt)}</div>
                </div>
                <div style={styles.gridItem}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Status</div>
                  <div style={{ fontWeight: '500', color: statusInfo.color }}>{statusInfo.label}</div>
                </div>
              </div>

              {/* Sensor Info */}
              {event.sourceType === 'SENSOR' && (
                <div style={{
                  background: '#ecfeff',
                  border: '1px solid #a5f3fc',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>📡</span>
                    <span style={{ fontWeight: '500', color: '#0891b2' }}>Sensor Info</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#0e7490' }}>
                    <p style={{ margin: 0 }}>Type: {SENSOR_TYPES[event.sensorType]?.label || event.sensorType}</p>
                  </div>
                </div>
              )}

              {/* Phase 2: Behavior Summary for FUSION events */}
              {event.sourceType === 'FUSION' && (
                <div style={{
                  background: '#faf5ff',
                  border: '1px solid #e9d5ff',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>🧠</span>
                    <span style={{ fontWeight: '600', color: '#7c3aed', fontSize: '15px' }}>Behavior Analysis</span>
                  </div>
                  
                  {/* Fusion Rule */}
                  {event.fusionRule && FUSION_RULES[event.fusionRule] && (
                    <div style={{
                      background: 'white',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      border: '1px solid #e9d5ff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{FUSION_RULES[event.fusionRule].icon}</span>
                        <span style={{ fontWeight: '500', color: '#6b21a8' }}>
                          {FUSION_RULES[event.fusionRule].label}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>
                        {FUSION_RULES[event.fusionRule].description}
                      </div>
                    </div>
                  )}

                  {/* Path Summary */}
                  {event.pathSummary && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: '500', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Movement Path
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                        fontSize: '13px',
                        color: '#6b21a8'
                      }}>
                        {event.pathSummary.split(' → ').map((zone, idx, arr) => (
                          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              background: '#ede9fe',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontWeight: '500'
                            }}>
                              {zone.replace(/_/g, ' ')}
                            </span>
                            {idx < arr.length - 1 && <span style={{ color: '#a78bfa' }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {event.dwellSecondsPrivate > 0 && (
                      <div style={{
                        background: 'white',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        border: '1px solid #e9d5ff',
                        flex: '1',
                        minWidth: '100px'
                      }}>
                        <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: '500' }}>DWELL TIME</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#6b21a8' }}>
                          {event.dwellSecondsPrivate}s
                        </div>
                      </div>
                    )}
                    {event.contributingSensorIds?.length > 0 && (
                      <div style={{
                        background: 'white',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        border: '1px solid #e9d5ff',
                        flex: '1',
                        minWidth: '100px'
                      }}>
                        <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: '500' }}>SENSORS</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#6b21a8' }}>
                          {event.contributingSensorIds.length}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* External Source Info */}
              {event.sourceType === 'EXTERNAL' && (
                <div style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🔗</span>
                    <span style={{ fontWeight: '500', color: '#059669' }}>External System</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#047857' }}>
                    <p style={{ margin: 0 }}>Source: {event.externalSource || 'Unknown'}</p>
                    {event.externalEventId && <p style={{ margin: 0 }}>External ID: {event.externalEventId}</p>}
                  </div>
                </div>
              )}

              {/* Feedback Buttons - Only show when event is open */}
              {isOpen && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px', margin: 0, marginBottom: '12px' }}>Quick Feedback</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {FEEDBACK_OPTIONS.map(option => (
                      <button
                        key={option.state}
                        onClick={() => handleFeedbackClick(option.state)}
                        disabled={submitting}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          border: selectedFeedback === option.state ? '2px solid #667eea' : '1px solid #e5e7eb',
                          background: selectedFeedback === option.state ? '#f0f4ff' : 'white',
                          cursor: submitting ? 'wait' : 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '20px', marginRight: '8px' }}>{option.icon}</span>
                        <span style={{ fontSize: '13px' }}>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {isOpen && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <button
                    onClick={() => handleStatusChange('RESOLVED_OK')}
                    disabled={submitting}
                    style={{ ...styles.btn, ...styles.btnSuccess, flex: 1 }}
                  >
                    ✓ Mark Resolved
                  </button>
                  <button
                    onClick={() => handleStatusChange('FALSE_ALARM')}
                    disabled={submitting}
                    style={{ ...styles.btn, ...styles.btnSecondary, flex: 1 }}
                  >
                    False Alarm
                  </button>
                </div>
              )}

              {/* Phase 2: ML Feedback Section */}
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                background: '#faf5ff',
                borderRadius: '12px',
                border: '1px solid #e9d5ff'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginBottom: '12px' 
                }}>
                  <span style={{ fontSize: '18px' }}>🧠</span>
                  <span style={{ fontWeight: '600', color: '#6b21a8' }}>Was this notification helpful?</span>
                </div>
                
                {mlFeedbackMessage ? (
                  <div style={{
                    padding: '12px',
                    background: '#d1fae5',
                    borderRadius: '8px',
                    color: '#065f46',
                    fontSize: '14px'
                  }}>
                    ✓ {mlFeedbackMessage}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => handleMlFeedback('FALSE_ALARM')}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: mlFeedback === 'FALSE_ALARM' ? '2px solid #dc2626' : '1px solid #fca5a5',
                        background: mlFeedback === 'FALSE_ALARM' ? '#fef2f2' : 'white',
                        cursor: submitting ? 'wait' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>👎</span>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#dc2626' }}>False Alarm</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>Don't alert me for this</span>
                    </button>
                    <button
                      onClick={() => handleMlFeedback('USEFUL')}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: mlFeedback === 'USEFUL' ? '2px solid #059669' : '1px solid #a7f3d0',
                        background: mlFeedback === 'USEFUL' ? '#ecfdf5' : 'white',
                        cursor: submitting ? 'wait' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>👍</span>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#059669' }}>Useful</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>Keep alerting me</span>
                    </button>
                  </div>
                )}
                
                {mlFeedback && !mlFeedbackMessage && (
                  <div style={{ 
                    marginTop: '8px', 
                    fontSize: '12px', 
                    color: '#7c3aed',
                    textAlign: 'center'
                  }}>
                    Your feedback: {mlFeedback === 'FALSE_ALARM' ? '👎 False Alarm' : '👍 Useful'}
                  </div>
                )}
              </div>

              {/* Add Comment */}
              {isOpen && (
                <div style={{ marginBottom: '20px' }}>
                  {!showNoteInput ? (
                    <button
                      onClick={() => setShowNoteInput(true)}
                      style={{ ...styles.btn, ...styles.btnSecondary, width: '100%' }}
                    >
                      💬 Add Comment
                    </button>
                  ) : (
                    <div>
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Type your comment..."
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          fontSize: '14px',
                          resize: 'vertical',
                          minHeight: '80px',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleAddNote}
                          disabled={submitting || !noteText.trim()}
                          style={{ ...styles.btn, ...styles.btnPrimary }}
                        >
                          Submit
                        </button>
                        <button
                          onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                          style={{ ...styles.btn, ...styles.btnSecondary }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upload Evidence */}
              {isOpen && (
                <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>📸 Upload Evidence</div>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileUpload}
                    disabled={submitting}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>Photos and videos accepted</div>
                </div>
              )}

              {/* Timeline / Notes */}
              <div>
                <h4 style={{ marginBottom: '12px', margin: 0, marginBottom: '12px' }}>
                  Activity ({event.notes?.length || 0})
                </h4>
                {event.notes?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {event.notes.map(note => (
                      <div key={note.id} style={{
                        padding: '12px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        borderLeft: note.noteType === 'REACTION' ? '3px solid #667eea' : '3px solid #e5e7eb'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '500' }}>{note.author?.displayName || 'System'}</span>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{formatTime(note.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#374151' }}>{note.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#999', fontSize: '14px' }}>No activity yet</div>
                )}
              </div>

              {/* Media Attachments */}
              {event.media?.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ marginBottom: '12px', margin: 0, marginBottom: '12px' }}>
                    Attachments ({event.media.length})
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {event.media.map(m => (
                      <a
                        key={m.id}
                        href={m.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        {m.mediaType === 'PHOTO' ? (
                          <img
                            src={m.thumbnailUrl || m.fileUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: '24px' }}>▶️</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
