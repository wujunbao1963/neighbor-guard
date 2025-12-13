import { useState, useEffect } from 'react';
import { useCircle } from '../context/CircleContext';
import { eventAPI, configAPI, uploadAPI } from '../services/api';
import LoadingSpinner from './LoadingSpinner';

export default function CreateEventModal({ onClose, onSuccess }) {
  const { currentCircleId, enabledZones } = useCircle();
  
  const [eventTypes, setEventTypes] = useState([]);
  const [eventZoneWhitelist, setEventZoneWhitelist] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    eventType: '',
    zone: '',
    title: '',
    description: '',
    severity: 'MEDIUM',
    media: []
  });

  // Load config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [typesRes, whitelistRes] = await Promise.all([
          configAPI.getEventTypes(),
          configAPI.getEventZoneWhitelist()
        ]);
        setEventTypes(typesRes.data.eventTypes);
        setEventZoneWhitelist(whitelistRes.data.whitelist);
      } catch (err) {
        setError('加载配置失败');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  // Get valid zones for selected event type
  const getValidZones = () => {
    if (!formData.eventType) return enabledZones;
    
    const whitelist = eventZoneWhitelist[formData.eventType];
    if (!whitelist || whitelist.length === 0) return enabledZones;
    
    return enabledZones.filter(z => whitelist.includes(z.zoneType));
  };

  const validZones = getValidZones();

  // Generate title based on event type and zone
  const generateTitle = (eventType, zoneName) => {
    const templates = {
      break_in_attempt: `${zoneName}发现疑似入室`,
      perimeter_damage: `${zoneName}发现损坏`,
      suspicious_person: `${zoneName}发现可疑人员`,
      suspicious_vehicle: `${zoneName}发现可疑车辆`,
      unusual_noise: `${zoneName}听到异常声响`,
      package_event: `${zoneName}包裹事件`,
      custom: ''
    };
    return templates[eventType] || '';
  };

  // Handle event type change
  const handleEventTypeChange = (value) => {
    const eventType = eventTypes.find(t => t.value === value);
    const newValidZones = value ? 
      (eventZoneWhitelist[value]?.length > 0 
        ? enabledZones.filter(z => eventZoneWhitelist[value].includes(z.zoneType))
        : enabledZones)
      : enabledZones;
    
    const currentZoneValid = newValidZones.some(z => z.id === formData.zone);
    const newZone = currentZoneValid ? formData.zone : (newValidZones[0]?.id || '');
    const zoneName = newValidZones.find(z => z.id === newZone)?.displayName || '';
    
    setFormData({
      ...formData,
      eventType: value,
      zone: newZone,
      title: value !== 'custom' ? generateTitle(value, zoneName) : formData.title,
      severity: eventType?.severity || 'MEDIUM'
    });
  };

  // Handle zone change
  const handleZoneChange = (zoneId) => {
    const zone = validZones.find(z => z.id === zoneId);
    const zoneName = zone?.displayName || '';
    
    setFormData({
      ...formData,
      zone: zoneId,
      title: formData.eventType !== 'custom' ? generateTitle(formData.eventType, zoneName) : formData.title
    });
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isUnder50MB = file.size <= 50 * 1024 * 1024;
      
      if (!isImage && !isVideo) {
        alert(`${file.name}: 只支持图片和视频文件`);
        return false;
      }
      if (!isUnder50MB) {
        alert(`${file.name}: 文件大小超过50MB限制`);
        return false;
      }
      return true;
    });

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({
          ...prev,
          media: [...prev.media, {
            file,
            name: file.name,
            type: file.type,
            size: file.size,
            preview: event.target.result
          }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  // Remove media
  const removeMedia = (index) => {
    setFormData(prev => ({
      ...prev,
      media: prev.media.filter((_, i) => i !== index)
    }));
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.eventType || !formData.zone || !formData.title.trim()) {
      setError('请填写必填项');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create event
      const eventRes = await eventAPI.create(currentCircleId, {
        eventType: formData.eventType,
        zoneId: formData.zone,
        title: formData.title.trim(),
        description: formData.description.trim(),
        severity: formData.severity
      });

      const newEvent = eventRes.data.event;

      // Upload files if any
      if (formData.media.length > 0) {
        const files = formData.media.map(m => m.file);
        await uploadAPI.upload(currentCircleId, newEvent.id, files);
      }

      onSuccess(newEvent);
    } catch (err) {
      setError(err.response?.data?.error?.message || '创建事件失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">新建事件</h2>
        </div>
        
        {loading ? (
          <div className="modal-body" style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: '#fee2e2', 
                  color: '#dc2626',
                  borderRadius: '8px' 
                }}>
                  {error}
                </div>
              )}

              {/* Event Type */}
              <div className="form-group">
                <label className="form-label">事件类型 *</label>
                <select
                  className="form-select"
                  value={formData.eventType}
                  onChange={e => handleEventTypeChange(e.target.value)}
                >
                  <option value="">-- 请选择事件类型 --</option>
                  {eventTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Zone */}
              <div className="form-group">
                <label className="form-label">
                  位置 *
                  {formData.eventType && validZones.length < enabledZones.length && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#667eea', fontWeight: 'normal' }}>
                      （已根据事件类型过滤适用防区）
                    </span>
                  )}
                </label>
                <select
                  className="form-select"
                  value={formData.zone}
                  onChange={e => handleZoneChange(e.target.value)}
                >
                  <option value="">-- 请选择位置 --</option>
                  {validZones.map(zone => (
                    <option key={zone.id} value={zone.id}>
                      {zone.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="form-group">
                <label className="form-label">
                  事件标题 *
                  {formData.eventType !== 'custom' && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                      （可自行修改）
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="简短描述发生了什么"
                />
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">详细说明</label>
                <textarea
                  className="form-textarea"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="补充更多细节，如时间、外貌特征、车牌号等..."
                />
              </div>

              {/* Severity */}
              <div className="form-group">
                <label className="form-label">风险等级</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { value: 'HIGH', label: '高', color: '#ef4444' },
                    { value: 'MEDIUM', label: '中', color: '#f59e0b' },
                    { value: 'LOW', label: '低', color: '#94a3b8' }
                  ].map(sev => (
                    <button
                      key={sev.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, severity: sev.value })}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: `2px solid ${formData.severity === sev.value ? sev.color : '#e0e0e0'}`,
                        borderRadius: '8px',
                        background: formData.severity === sev.value ? `${sev.color}20` : 'white',
                        cursor: 'pointer',
                        fontWeight: formData.severity === sev.value ? '600' : '400'
                      }}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media Upload */}
              <div className="form-group">
                <label className="form-label">上传证据（图片/视频）</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {formData.media.map((item, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      {item.type.startsWith('image/') ? (
                        <img 
                          src={item.preview} 
                          alt="" 
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }}
                        />
                      ) : (
                        <div style={{ 
                          width: '80px', height: '80px', 
                          background: '#f5f5f5', 
                          borderRadius: '8px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          🎬
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(index)}
                        style={{
                          position: 'absolute', top: '-8px', right: '-8px',
                          width: '24px', height: '24px',
                          background: '#ef4444', color: 'white',
                          border: 'none', borderRadius: '50%',
                          cursor: 'pointer', fontSize: '14px'
                        }}
                      >
                        ×
                      </button>
                      <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                        {formatFileSize(item.size)}
                      </div>
                    </div>
                  ))}
                  
                  <label style={{
                    width: '80px', height: '80px',
                    border: '2px dashed #e0e0e0',
                    borderRadius: '8px',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#999'
                  }}>
                    <span style={{ fontSize: '24px' }}>+</span>
                    <span style={{ fontSize: '12px' }}>添加</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitting || !formData.eventType || !formData.zone || !formData.title.trim()}
              >
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
