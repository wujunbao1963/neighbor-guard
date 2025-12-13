import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI, sensorAPI, integrationAPI, homeAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

// ============================================================================
// CONSTANTS
// ============================================================================

const HOUSE_MODES = [
  { value: 'DISARMED', label: 'Disarmed', icon: '🔓', color: '#22c55e', desc: 'All alerts off' },
  { value: 'HOME', label: 'Home', icon: '🏠', color: '#3b82f6', desc: 'Perimeter protection on' },
  { value: 'AWAY', label: 'Away', icon: '🛡️', color: '#f59e0b', desc: 'Full protection enabled' },
  { value: 'NIGHT', label: 'Night', icon: '🌙', color: '#8b5cf6', desc: 'Enhanced night mode' },
];

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
  MANUAL: { label: 'Manual', icon: '✏️', color: '#6b7280', bgColor: '#f3f4f6' }
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

const SENSOR_STATUS_MAP = {
  closed: { label: 'Closed', isNormal: true },
  open: { label: 'Open', isNormal: false },
  clear: { label: 'Clear', isNormal: true },
  triggered: { label: 'Triggered', isNormal: false },
  normal: { label: 'Normal', isNormal: true },
  on: { label: 'Triggered', isNormal: false },
  off: { label: 'Normal', isNormal: true }
};

const ACTIVE_STATUSES = ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'];

// ============================================================================
// STYLES
// ============================================================================
const styles = {
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  actionCard: {
    flex: 1,
    background: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb'
  },
  btn: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px'
  },
  btnPrimary: { background: '#667eea', color: 'white' },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
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
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export default function HomePage({ onCreateEvent, onViewEvent, onNavigateToSettings }) {
  const { circles } = useAuth();
  const { currentCircle, currentCircleId, home, zones, canEdit, refreshHome } = useCircle();
  
  const [events, setEvents] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModeModal, setShowModeModal] = useState(false);
  const [changingMode, setChangingMode] = useState(false);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    if (!circles || circles.length === 0) return;
    loadEvents();
  }, [circles]);

  useEffect(() => {
    if (currentCircleId && canEdit) {
      loadSensors();
      loadIntegrations();
    }
  }, [currentCircleId, canEdit]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const allEventsPromises = circles.map(circle =>
        eventAPI.getAll(circle.id, { status: 'active' })
          .then(res => res.data.events.map(e => ({ ...e, circleId: circle.id, circleName: circle.displayName })))
          .catch(() => [])
      );
      const allEventsArrays = await Promise.all(allEventsPromises);
      const allEvents = allEventsArrays.flat();
      allEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setEvents(allEvents);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const loadSensors = async () => {
    try {
      const res = await sensorAPI.getAll(currentCircleId);
      setSensors(res.data.sensors || []);
    } catch (err) {
      console.error('Failed to load sensors:', err);
    }
  };

  const loadIntegrations = async () => {
    try {
      const res = await integrationAPI.getAll(currentCircleId);
      setIntegrations(res.data.integrations || []);
    } catch (err) {
      console.error('Failed to load integrations:', err);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleChangeMode = async (newMode) => {
    if (!currentCircleId || changingMode) return;
    setChangingMode(true);
    try {
      await homeAPI.updateMode(currentCircleId, newMode);
      await refreshHome();
      setShowModeModal(false);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to change mode');
    } finally {
      setChangingMode(false);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const currentModeInfo = HOUSE_MODES.find(m => m.value === home?.houseMode) || HOUSE_MODES[0];
  const activeEvents = events.filter(e => ACTIVE_STATUSES.includes(e.status));
  const highMediumEvents = activeEvents.filter(e => e.severity === 'HIGH' || e.severity === 'MEDIUM');
  const onlineSensors = sensors.length;
  const connectedIntegrations = integrations.filter(i => i.isActive).length;

  const getSourceInfo = (sourceType, externalSource) => {
    const info = EVENT_SOURCE_TYPES[sourceType] || EVENT_SOURCE_TYPES.MANUAL;
    if (sourceType === 'EXTERNAL' && externalSource) {
      return { ...info, label: externalSource };
    }
    return info;
  };

  const formatTime = (isoString) => {
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
  // RENDER: Mode Modal
  // ============================================================================
  const renderModeModal = () => {
    if (!showModeModal) return null;

    return (
      <div style={styles.modalOverlay} onClick={() => setShowModeModal(false)}>
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e0e0e0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', textAlign: 'center' }}>Select Mode</h2>
          </div>
          <div style={{ padding: '16px' }}>
            {HOUSE_MODES.map((mode, idx) => (
              <div
                key={mode.value}
                onClick={() => !changingMode && handleChangeMode(mode.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  marginBottom: idx < HOUSE_MODES.length - 1 ? '8px' : 0,
                  borderRadius: '12px',
                  border: home?.houseMode === mode.value ? `2px solid ${mode.color}` : '2px solid #e5e7eb',
                  background: home?.houseMode === mode.value ? `${mode.color}08` : 'white',
                  cursor: changingMode ? 'wait' : 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px',
                    background: mode.color,
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    {mode.icon}
                  </div>
                  <div>
                    <p style={{ fontWeight: '600', color: home?.houseMode === mode.value ? mode.color : '#333', margin: 0 }}>
                      {mode.label}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', margin: 0 }}>{mode.desc}</p>
                  </div>
                </div>
                {home?.houseMode === mode.value && (
                  <span style={{ color: mode.color, fontSize: '20px' }}>✓</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid #e0e0e0' }}>
            <button
              onClick={() => setShowModeModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Row 1: Security Action + Current Mode */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        {/* Security Action Card */}
        <div style={styles.actionCard}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>🆘 Security Action</div>
          <button
            onClick={onCreateEvent}
            style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', padding: '10px 20px' }}
          >
            Report Event
          </button>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
            For emergencies, call 911 directly
          </div>
        </div>

        {/* Current Mode Card */}
        {canEdit && (
          <div
            onClick={() => setShowModeModal(true)}
            style={{
              ...styles.actionCard,
              cursor: 'pointer',
              borderColor: `${currentModeInfo.color}60`,
              background: `linear-gradient(135deg, ${currentModeInfo.color}05, white)`
            }}
          >
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Current Mode</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '40px', height: '40px',
                background: currentModeInfo.color,
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px'
              }}>
                {currentModeInfo.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: currentModeInfo.color }}>
                  {currentModeInfo.label}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>{currentModeInfo.desc}</div>
              </div>
              <div style={{ color: '#ccc', fontSize: '18px' }}>›</div>
            </div>
          </div>
        )}
      </div>

      {/* Security Status */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: '12px', margin: 0, marginBottom: '12px' }}>Security Status</h3>
        {activeEvents.length === 0 ? (
          <div style={{ color: '#10b981' }}>🟢 No active events</div>
        ) : highMediumEvents.length > 0 ? (
          <div style={{ color: '#f59e0b' }}>
            🟡 {highMediumEvents.length} medium/high risk event(s) pending
          </div>
        ) : (
          <div style={{ color: '#3b82f6' }}>
            🔵 {activeEvents.length} low risk event(s) in progress
          </div>
        )}
      </div>

      {/* Active Events */}
      <h3 style={{ margin: '24px 0 16px' }}>Active Events ({activeEvents.length})</h3>

      {activeEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <div>No active events</div>
        </div>
      ) : (
        activeEvents.map(event => {
          const severityInfo = EVENT_SEVERITY[event.severity] || EVENT_SEVERITY.LOW;
          const statusInfo = EVENT_STATUS[event.status] || EVENT_STATUS.OPEN;
          const sourceInfo = getSourceInfo(event.sourceType, event.externalSource);

          return (
            <div
              key={event.id}
              onClick={() => onViewEvent(event)}
              style={{
                ...styles.card,
                cursor: 'pointer',
                borderLeft: `4px solid ${severityInfo.color}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ ...styles.badge, background: severityInfo.bgColor, color: severityInfo.color }}>
                    {severityInfo.label}
                  </span>
                  <span style={{ ...styles.badge, background: '#f5f5f5' }}>
                    {event.zone?.displayName || 'Unknown'}
                  </span>
                  <span style={{ ...styles.badge, background: sourceInfo.bgColor, color: sourceInfo.color }}>
                    {sourceInfo.icon} {sourceInfo.label}
                  </span>
                </div>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '500',
                  background: statusInfo.bgColor,
                  color: statusInfo.color
                }}>
                  {statusInfo.label}
                </span>
              </div>

              <h4 style={{ marginBottom: '8px', fontSize: '18px', margin: 0, marginBottom: '8px' }}>{event.title}</h4>

              {event.description && (
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{event.description}</div>
              )}

              <div style={{ fontSize: '12px', color: '#999' }}>
                {formatTime(event.occurredAt || event.createdAt)} · by {event.creator?.displayName || 'System'}
              </div>

              {event.sourceType === 'SENSOR' && event.sensorType && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#0891b2' }}>
                  📡 Sensor: {SENSOR_TYPES[event.sensorType]?.label || event.sensorType}
                </div>
              )}

              {event.noteCount > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#667eea' }}>
                  💬 {event.noteCount} comment(s)
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Sensor Status Section */}
      {canEdit && sensors.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ marginBottom: '4px', margin: 0, marginBottom: '4px' }}>Sensor Status</h3>
              <div style={{ fontSize: '13px', color: '#666' }}>
                📡 {onlineSensors} sensor(s) online · 🔗 {connectedIntegrations} integration(s) connected
              </div>
            </div>
            {onNavigateToSettings && (
              <button
                onClick={() => onNavigateToSettings('sensors')}
                style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
              >
                Manage →
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
            {sensors.slice(0, 6).map(sensor => {
              const typeInfo = SENSOR_TYPES[sensor.sensorType] || SENSOR_TYPES.OTHER;
              const lastState = sensor.lastState?.toLowerCase() || 'unknown';
              const statusInfo = SENSOR_STATUS_MAP[lastState] || { label: sensor.lastState || 'Unknown', isNormal: true };

              return (
                <div key={sensor.id} style={{
                  background: 'white',
                  borderRadius: '10px',
                  padding: '12px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  border: '1px solid #f0f0f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{typeInfo.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: '500', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sensor.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: statusInfo.isNormal ? '#d1fae5' : '#fee2e2',
                      color: statusInfo.isNormal ? '#059669' : '#dc2626'
                    }}>
                      {statusInfo.label}
                    </span>
                    {sensor.batteryLevel && (
                      <span style={{ fontSize: '11px', color: sensor.batteryLevel < 50 ? '#f59e0b' : '#9ca3af' }}>
                        🔋 {sensor.batteryLevel}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {sensors.length > 6 && (
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                onClick={() => onNavigateToSettings && onNavigateToSettings('sensors')}
                style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
              >
                View all {sensors.length} sensors →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{ ...styles.card, color: '#ef4444', borderLeft: '4px solid #ef4444', marginTop: '16px' }}>
          {error}
        </div>
      )}

      {/* Mode Modal */}
      {renderModeModal()}
    </div>
  );
}
