// ============================================================================
// SensorsSection Component
// Sensor management for Settings page
// ============================================================================

import React, { useState } from 'react';
import { useSensors, useZones } from '../../hooks';
import { Card } from '../common/Card';
import { Badge, StatusBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { getSensorType, getSensorStatus, SENSOR_TYPES } from '../../constants';

export function SensorsSection({ circleId }) {
  const { sensors, loading, stats, updateSensor, toggleSensor, deleteSensor } = useSensors();
  const { zones } = useZones();
  const [showModal, setShowModal] = useState(false);
  const [editingSensor, setEditingSensor] = useState(null);

  const styles = {
    container: {
      margin: '0 16px 24px'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px'
    },
    label: {
      fontSize: '13px',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    statsRow: {
      display: 'flex',
      gap: '12px',
      marginBottom: '12px'
    },
    statCard: {
      flex: 1,
      background: 'white',
      borderRadius: '8px',
      padding: '12px',
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    },
    statValue: (color) => ({
      fontSize: '20px',
      fontWeight: '600',
      color
    }),
    statLabel: {
      fontSize: '11px',
      color: '#6b7280',
      textTransform: 'uppercase'
    },
    list: {
      background: 'white',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    },
    sensorItem: (isLast) => ({
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
      cursor: 'pointer'
    }),
    sensorIcon: {
      fontSize: '24px',
      marginRight: '12px'
    },
    sensorInfo: {
      flex: 1
    },
    sensorName: {
      fontSize: '15px',
      fontWeight: '500',
      color: '#1f2937'
    },
    sensorMeta: {
      fontSize: '13px',
      color: '#6b7280'
    },
    toggle: {
      marginLeft: '12px'
    },
    chevron: {
      color: '#9ca3af',
      fontSize: '18px',
      marginLeft: '8px'
    },
    emptyState: {
      textAlign: 'center',
      padding: '32px 16px',
      color: '#6b7280'
    }
  };

  const handleSensorClick = (sensor) => {
    setEditingSensor(sensor);
    setShowModal(true);
  };

  const handleToggle = async (e, sensorId) => {
    e.stopPropagation();
    await toggleSensor(sensorId);
  };

  const handleSaveSensor = async (sensorData) => {
    try {
      await updateSensor(editingSensor.id, sensorData);
      setShowModal(false);
    } catch (error) {
      alert('Failed to save sensor');
    }
  };

  const handleDeleteSensor = async (sensorId) => {
    if (window.confirm('Are you sure you want to delete this sensor?')) {
      try {
        await deleteSensor(sensorId);
        setShowModal(false);
      } catch (error) {
        alert('Failed to delete sensor');
      }
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.label}>Sensors</div>
        <div style={styles.emptyState}>Loading sensors...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.label}>Sensors ({stats.total})</div>
      </div>

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue('#22c55e')}>{stats.online}</div>
          <div style={styles.statLabel}>Online</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue('#ef4444')}>{stats.offline}</div>
          <div style={styles.statLabel}>Offline</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue('#f59e0b')}>{stats.lowBattery}</div>
          <div style={styles.statLabel}>Low Battery</div>
        </div>
      </div>

      {sensors.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No sensors configured</p>
          <p style={{ fontSize: '13px' }}>Sensors are added through integrations</p>
        </div>
      ) : (
        <div style={styles.list}>
          {sensors.map((sensor, index) => {
            const typeInfo = getSensorType(sensor.sensorType);
            const statusInfo = getSensorStatus(sensor.status);
            const zone = zones.find(z => z.id === sensor.zoneId);
            
            return (
              <div
                key={sensor.id}
                style={styles.sensorItem(index === sensors.length - 1)}
                onClick={() => handleSensorClick(sensor)}
              >
                <span style={styles.sensorIcon}>{typeInfo.icon}</span>
                <div style={styles.sensorInfo}>
                  <div style={styles.sensorName}>{sensor.name}</div>
                  <div style={styles.sensorMeta}>
                    {typeInfo.label}
                    {zone && ` • ${zone.displayName}`}
                    {sensor.batteryLevel !== null && ` • 🔋 ${sensor.batteryLevel}%`}
                  </div>
                </div>
                <StatusBadge status={sensor.status} size="sm" />
                <div style={styles.toggle}>
                  <ToggleSwitch
                    checked={sensor.isEnabled}
                    onChange={(e) => handleToggle(e, sensor.id)}
                  />
                </div>
                <span style={styles.chevron}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sensor Edit Modal */}
      <SensorEditModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        sensor={editingSensor}
        zones={zones}
        onSave={handleSaveSensor}
        onDelete={editingSensor ? () => handleDeleteSensor(editingSensor.id) : null}
      />
    </div>
  );
}

/**
 * Toggle Switch Component
 */
function ToggleSwitch({ checked, onChange }) {
  const style = {
    container: {
      width: '44px',
      height: '26px',
      background: checked ? '#667eea' : '#e5e7eb',
      borderRadius: '13px',
      padding: '2px',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    knob: {
      width: '22px',
      height: '22px',
      background: 'white',
      borderRadius: '50%',
      transition: 'transform 0.2s',
      transform: checked ? 'translateX(18px)' : 'translateX(0)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
    }
  };

  return (
    <div style={style.container} onClick={onChange}>
      <div style={style.knob} />
    </div>
  );
}

/**
 * Sensor Edit Modal
 */
function SensorEditModal({ isOpen, onClose, sensor, zones, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: sensor?.name || '',
    zoneId: sensor?.zoneId || '',
    isEnabled: sensor?.isEnabled ?? true
  });

  React.useEffect(() => {
    setFormData({
      name: sensor?.name || '',
      zoneId: sensor?.zoneId || '',
      isEnabled: sensor?.isEnabled ?? true
    });
  }, [sensor]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '15px',
    marginBottom: '16px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px'
  };

  if (!sensor) return null;

  const typeInfo = getSensorType(sensor.sensorType);
  const statusInfo = getSensorStatus(sensor.status);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sensor Settings"
      footer={
        <>
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Save
          </Button>
        </>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '48px' }}>{typeInfo.icon}</span>
        <div style={{ marginTop: '8px' }}>
          <StatusBadge status={sensor.status} />
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Sensor Name</label>
        <input
          type="text"
          style={inputStyle}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Front Door Contact"
        />

        <label style={labelStyle}>Zone</label>
        <select
          style={inputStyle}
          value={formData.zoneId}
          onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
        >
          <option value="">-- Select Zone --</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.displayName}
            </option>
          ))}
        </select>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={formData.isEnabled}
            onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
          />
          Sensor Enabled
        </label>

        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          background: '#f9fafb', 
          borderRadius: '8px',
          fontSize: '13px',
          color: '#6b7280'
        }}>
          <div><strong>Type:</strong> {typeInfo.label}</div>
          <div><strong>External ID:</strong> {sensor.externalId || 'N/A'}</div>
          {sensor.batteryLevel !== null && (
            <div><strong>Battery:</strong> {sensor.batteryLevel}%</div>
          )}
          {sensor.lastState && (
            <div><strong>Last State:</strong> {sensor.lastState}</div>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default SensorsSection;
