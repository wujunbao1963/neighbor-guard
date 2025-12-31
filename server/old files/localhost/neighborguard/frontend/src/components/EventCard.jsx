export default function EventCard({ event, onClick, getZoneName, showCircle }) {
  const severityLabels = { HIGH: '高', MEDIUM: '中', LOW: '低' };
  const severityClasses = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
  
  const statusLabels = {
    OPEN: '进行中',
    ACKED: '已确认',
    WATCHING: '有人观察',
    RESOLVED_OK: '已解决',
    RESOLVED_WARNING: '已结束(有损失)',
    ESCALATED: '已升级/报警',
    FALSE_ALARM: '误报'
  };

  const zoneName = getZoneName ? getZoneName(event.zone?.id) : (event.zone?.displayName || '未知区域');
  const creatorName = event.creator?.displayName || '未知';
  const occurredAt = new Date(event.occurredAt || event.createdAt).toLocaleString('zh-CN');
  const circleName = event.circleName || event.circle?.displayName;

  return (
    <div 
      className={`card clickable severity-${severityClasses[event.severity] || 'low'}`}
      onClick={onClick}
      style={{ position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <span className={`badge badge-${severityClasses[event.severity] || 'low'}`}>
            {severityLabels[event.severity] || '低'}风险
          </span>
          <span className="badge" style={{ background: '#f5f5f5' }}>
            {zoneName}
          </span>
          {showCircle && circleName && (
            <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              {circleName}
            </span>
          )}
        </div>
        <span className={`status-badge status-${event.status?.toLowerCase()}`}>
          {statusLabels[event.status] || event.status}
        </span>
      </div>
      
      <h4 style={{ marginBottom: '8px', fontSize: '18px' }}>{event.title}</h4>
      
      {event.description && (
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
          {event.description}
        </div>
      )}
      
      <div style={{ fontSize: '12px', color: '#999' }}>
        {occurredAt} · 由 {creatorName} 报告
      </div>
      
      {event.policeReported && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>
          🚨 已报警
        </div>
      )}
      
      {event.noteCount > 0 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#667eea' }}>
          💬 {event.noteCount} 条反馈
        </div>
      )}
    </div>
  );
}
