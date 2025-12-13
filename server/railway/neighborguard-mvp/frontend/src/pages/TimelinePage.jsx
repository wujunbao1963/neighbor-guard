import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { eventAPI, uploadAPI } from '../services/api';
import EventCard from '../components/EventCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function TimelinePage({ onViewEvent }) {
  const { circles } = useAuth();
  const { currentCircleId, getZoneById, zones } = useCircle();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'high-medium'

  // Fetch all events from ALL circles
  useEffect(() => {
    const fetchAllEvents = async () => {
      if (!circles || circles.length === 0) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all events from all circles
        const allEventsPromises = circles.map(circle => 
          eventAPI.getAll(circle.id, { limit: 100 })
            .then(res => res.data.events.map(e => ({ ...e, circleId: circle.id, circleName: circle.displayName })))
            .catch(() => [])
        );
        
        const allEventsArrays = await Promise.all(allEventsPromises);
        const allEvents = allEventsArrays.flat();
        
        setEvents(allEvents);
      } catch (err) {
        setError(err.response?.data?.error?.message || '加载事件失败');
      } finally {
        setLoading(false);
      }
    };

    fetchAllEvents();
  }, [circles]);

  // Get zone display name
  const getZoneName = (zoneId) => {
    const zone = getZoneById(zoneId);
    return zone?.displayName || '未知区域';
  };

  // Filter events
  const filteredEvents = events.filter(event => {
    // Filter by severity
    if (filter === 'high-medium') {
      if (event.severity !== 'HIGH' && event.severity !== 'MEDIUM') {
        return false;
      }
    }
    
    // Filter by search text
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      const matchTitle = event.title?.toLowerCase().includes(searchLower);
      const matchDescription = event.description?.toLowerCase().includes(searchLower);
      const matchCreator = event.creator?.displayName?.toLowerCase().includes(searchLower);
      const matchCircle = event.circleName?.toLowerCase().includes(searchLower);
      const zoneName = event.zone?.displayName || '';
      const matchZone = zoneName.toLowerCase().includes(searchLower);
      
      return matchTitle || matchDescription || matchCreator || matchZone || matchCircle;
    }
    
    return true;
  });

  // Sort: open events first (by newest), then resolved events (by newest)
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const openStatuses = ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'];
    const aIsOpen = openStatuses.includes(a.status);
    const bIsOpen = openStatuses.includes(b.status);
    
    if (aIsOpen && !bIsOpen) return -1;
    if (!aIsOpen && bIsOpen) return 1;
    
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>
            事件时间线
            {circles.length > 1 && (
              <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
                (所有圈子)
              </span>
            )}
          </h2>
        </div>
        
        {/* Search Box */}
        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 搜索事件标题、描述、报告人、圈子或位置..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        
        {/* Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {searchText.trim() 
              ? `找到 ${sortedEvents.length} 条相关事件` 
              : `共 ${sortedEvents.length} 条事件`}
          </div>
          <select 
            className="form-select" 
            style={{ width: 'auto' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">全部事件</option>
            <option value="high-medium">仅中/高风险</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: '#ef4444', borderLeft: '4px solid #ef4444' }}>
          {error}
        </div>
      )}

      {sortedEvents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div>暂无事件记录</div>
        </div>
      ) : (
        sortedEvents.map(event => (
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
