import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

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

// Phase 2: Fusion rule display info
const FUSION_RULES = {
  R1_BREAKIN_DOOR_PIR: { label: 'Break-in Pattern', icon: '🚨' },
  R2_BREAKIN_GLASS: { label: 'Glass Break', icon: '🪟' },
  R3_SUSPICIOUS_PERSON: { label: 'Suspicious Person', icon: '👤' },
  R4_SUSPICIOUS_VEHICLE: { label: 'Vehicle Alert', icon: '🚗' },
  R5_MOTION_ALERT: { label: 'Motion Alert', icon: '🔔' }
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
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  searchInput: {
    padding: '10px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '14px',
    width: '200px'
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '14px',
    background: 'white'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export default function TimelinePage({ onViewEvent }) {
  const { circles } = useAuth();
  const { currentCircleId, getZoneById } = useCircle();
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [securityOnly, setSecurityOnly] = useState(true); // Phase 2: Filter for security events

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    if (!circles || circles.length === 0) return;
    loadEvents();
  }, [circles]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const allEventsPromises = circles.map(circle =>
        eventAPI.getAll(circle.id, { limit: 100 })
          .then(res => res.data.events.map(e => ({ ...e, circleId: circle.id, circleName: circle.displayName })))
          .catch(() => [])
      );
      const allEventsArrays = await Promise.all(allEventsPromises);
      const allEvents = allEventsArrays.flat();
      setEvents(allEvents);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

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

  // Filter events
  const filteredEvents = events.filter(e => {
    // Phase 2: Security events filter
    if (securityOnly && e.isSecurityEvent === false) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchTitle = e.title?.toLowerCase().includes(query);
      const matchDescription = e.description?.toLowerCase().includes(query);
      const matchZone = e.zone?.displayName?.toLowerCase().includes(query);
      const matchCircle = e.circleName?.toLowerCase().includes(query);
      const matchPath = e.pathSummary?.toLowerCase().includes(query);
      if (!matchTitle && !matchDescription && !matchZone && !matchCircle && !matchPath) {
        return false;
      }
    }

    // Source filter
    if (sourceFilter && e.sourceType !== sourceFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(e.status)) {
      return false;
    }
    if (statusFilter === 'resolved' && ACTIVE_STATUSES.includes(e.status)) {
      return false;
    }

    return true;
  });

  // Sort: active events first, then by date
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const aIsActive = ACTIVE_STATUSES.includes(a.status);
    const bIsActive = ACTIVE_STATUSES.includes(b.status);
    if (aIsActive && !bIsActive) return -1;
    if (!aIsActive && bIsActive) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // ============================================================================
  // RENDER
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
      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <input
          type="text"
          placeholder="🔍 Search events..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Security Events Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: securityOnly ? '#f3e8ff' : '#f5f5f5',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            color: securityOnly ? '#7c3aed' : '#666',
            border: securityOnly ? '1px solid #e9d5ff' : '1px solid #e0e0e0'
          }}>
            <input
              type="checkbox"
              checked={securityOnly}
              onChange={(e) => setSecurityOnly(e.target.checked)}
              style={{ display: 'none' }}
            />
            🛡️ Security Only
          </label>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Sources</option>
            <option value="FUSION">🧠 AI Detected</option>
            <option value="CAMERA">📹 Camera</option>
            <option value="SENSOR">📡 Sensor</option>
            <option value="EXTERNAL">🔗 External</option>
            <option value="MANUAL">✏️ Manual</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ ...styles.card, color: '#ef4444', borderLeft: '4px solid #ef4444' }}>
          {error}
        </div>
      )}

      {/* Events List */}
      {sortedEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <div>No matching events found</div>
        </div>
      ) : (
        sortedEvents.map(event => {
          const severityInfo = EVENT_SEVERITY[event.severity] || EVENT_SEVERITY.LOW;
          const statusInfo = EVENT_STATUS[event.status] || EVENT_STATUS.OPEN;
          const sourceInfo = getSourceInfo(event.sourceType, event.externalSource);
          const fusionRule = event.fusionRule ? FUSION_RULES[event.fusionRule] : null;

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
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
                  {/* Phase 2: Show fusion rule badge */}
                  {fusionRule && (
                    <span style={{ ...styles.badge, background: '#fef3c7', color: '#b45309' }}>
                      {fusionRule.icon} {fusionRule.label}
                    </span>
                  )}
                </div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  background: statusInfo.bgColor,
                  color: statusInfo.color
                }}>
                  {statusInfo.label}
                </span>
              </div>
              <h4 style={{ marginBottom: '6px', fontSize: '16px', margin: 0, marginBottom: '6px' }}>{event.title}</h4>
              
              {/* Phase 2: Show path summary for fusion events */}
              {event.pathSummary && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  color: '#7c3aed',
                  marginBottom: '6px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ marginRight: '4px' }}>📍</span>
                  {event.pathSummary.split(' → ').map((zone, idx, arr) => (
                    <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        background: '#ede9fe',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px'
                      }}>
                        {zone.replace(/_/g, ' ')}
                      </span>
                      {idx < arr.length - 1 && <span style={{ color: '#a78bfa' }}>→</span>}
                    </span>
                  ))}
                  {event.dwellSecondsPrivate > 0 && (
                    <span style={{ marginLeft: '8px', color: '#9333ea' }}>
                      ⏱️ {event.dwellSecondsPrivate}s
                    </span>
                  )}
                </div>
              )}

              <div style={{ fontSize: '12px', color: '#999' }}>
                {formatTime(event.occurredAt || event.createdAt)} · {event.creator?.displayName || 'System'}
                {circles.length > 1 && event.circleName && (
                  <span> · 📍 {event.circleName}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
