import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI } from '../services/api';
import EventCard from '../components/EventCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function HomePage({ onCreateEvent, onViewEvent }) {
  const { circles } = useAuth();
  const { currentCircleId, getZoneById, zones } = useCircle();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoneCache, setZoneCache] = useState({});

  // Fetch events from ALL circles user belongs to
  useEffect(() => {
    const fetchAllEvents = async () => {
      if (!circles || circles.length === 0) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Fetch active events from all circles
        const allEventsPromises = circles.map(circle => 
          eventAPI.getAll(circle.id, { status: 'active' })
            .then(res => res.data.events.map(e => ({ ...e, circleId: circle.id, circleName: circle.displayName })))
            .catch(() => []) // If one circle fails, continue with others
        );
        
        const allEventsArrays = await Promise.all(allEventsPromises);
        const allEvents = allEventsArrays.flat();
        
        // Sort by created time (newest first)
        allEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        setEvents(allEvents);
      } catch (err) {
        setError(err.response?.data?.error?.message || '加载事件失败');
      } finally {
        setLoading(false);
      }
    };

    fetchAllEvents();
  }, [circles]);

  // Cache zones for current circle
  useEffect(() => {
    if (currentCircleId && zones.length > 0) {
      const cache = {};
      zones.forEach(z => { cache[z.id] = z.displayName; });
      setZoneCache(prev => ({ ...prev, [currentCircleId]: cache }));
    }
  }, [currentCircleId, zones]);

  // Count high priority events
  const highPriorityEvents = events.filter(e => 
    e.severity === 'HIGH' || e.severity === 'MEDIUM'
  );

  // Get zone display name
  const getZoneName = (zoneId) => {
    // Try current circle's zones first
    const zone = getZoneById(zoneId);
    if (zone) return zone.displayName;
    // Fallback
    return '未知区域';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Alert Box */}
      <div className="alert alert-info">
        <strong>🆘 安防操作</strong>
        <div style={{ marginTop: '12px' }}>
          <button className="btn btn-primary" onClick={onCreateEvent}>
            新建事件 / 求助
          </button>
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          小提示：如需报警，请直接拨打当地紧急电话。
        </div>
      </div>

      {/* Security Status Card */}
      <div className="card">
        <h3 style={{ marginBottom: '12px' }}>当前安防状态</h3>
        {highPriorityEvents.length === 0 ? (
          <div style={{ color: '#10b981' }}>
            🟢 当前无进行中的高风险事件
          </div>
        ) : (
          <div style={{ color: '#f59e0b' }}>
            🟡 有 {highPriorityEvents.length} 条中/高风险事件待确认
          </div>
        )}
        {circles.length > 1 && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            正在监控 {circles.length} 个圈子
          </div>
        )}
      </div>

      {/* Events Section */}
      <h3 style={{ margin: '24px 0 16px' }}>进行中事件 ({events.length})</h3>
      
      {error && (
        <div className="card" style={{ color: '#ef4444', borderLeft: '4px solid #ef4444' }}>
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <div>暂无进行中的事件</div>
        </div>
      ) : (
        events.map(event => (
          <EventCard
            key={event.id}
            event={event}
            onClick={() => onViewEvent(event)}
            getZoneName={getZoneName}
            showCircle={circles.length > 1}
          />
        ))
      )}
    </div>
  );
}
