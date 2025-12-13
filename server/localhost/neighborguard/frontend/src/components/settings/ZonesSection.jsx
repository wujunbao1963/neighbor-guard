// ============================================================================
// ZonesSection Component
// Zone management for Settings page
// ============================================================================

import React, { useState } from 'react';
import { useZones } from '../../hooks';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { getZoneType, getPrivacyLevel, ZONE_TYPES, PRIVACY_LEVELS } from '../../constants';

export function ZonesSection({ circleId }) {
  const { zones, loading, createZone, updateZone, deleteZone } = useZones();
  const [showModal, setShowModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);

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
    list: {
      background: 'white',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    },
    zoneItem: (isLast) => ({
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
      cursor: 'pointer'
    }),
    zoneIcon: {
      fontSize: '24px',
      marginRight: '12px'
    },
    zoneInfo: {
      flex: 1
    },
    zoneName: {
      fontSize: '15px',
      fontWeight: '500',
      color: '#1f2937'
    },
    zoneType: {
      fontSize: '13px',
      color: '#6b7280'
    },
    chevron: {
      color: '#9ca3af',
      fontSize: '18px'
    },
    emptyState: {
      textAlign: 'center',
      padding: '32px 16px',
      color: '#6b7280'
    }
  };

  const handleZoneClick = (zone) => {
    setEditingZone(zone);
    setShowModal(true);
  };

  const handleAddZone = () => {
    setEditingZone(null);
    setShowModal(true);
  };

  const handleSaveZone = async (zoneData) => {
    try {
      if (editingZone) {
        await updateZone(editingZone.id, zoneData);
      } else {
        await createZone(zoneData);
      }
      setShowModal(false);
    } catch (error) {
      alert('Failed to save zone');
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (window.confirm('Are you sure you want to delete this zone?')) {
      try {
        await deleteZone(zoneId);
        setShowModal(false);
      } catch (error) {
        alert('Failed to delete zone');
      }
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.label}>Zones</div>
        <div style={styles.emptyState}>Loading zones...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.label}>Zones ({zones.length})</div>
        <Button size="sm" variant="ghost" onClick={handleAddZone}>
          + Add Zone
        </Button>
      </div>

      {zones.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No zones configured</p>
          <Button size="sm" onClick={handleAddZone}>Add Your First Zone</Button>
        </div>
      ) : (
        <div style={styles.list}>
          {zones.map((zone, index) => {
            const zoneTypeInfo = getZoneType(zone.zoneType);
            const privacyInfo = getPrivacyLevel(zone.privacyLevel);
            
            return (
              <div
                key={zone.id}
                style={styles.zoneItem(index === zones.length - 1)}
                onClick={() => handleZoneClick(zone)}
              >
                <span style={styles.zoneIcon}>{zoneTypeInfo.icon}</span>
                <div style={styles.zoneInfo}>
                  <div style={styles.zoneName}>{zone.displayName}</div>
                  <div style={styles.zoneType}>
                    {zoneTypeInfo.label}
                    {zone.isEntryPoint && ' • Entry Point'}
                  </div>
                </div>
                <Badge 
                  variant={
                    privacyInfo.color === '#ef4444' ? 'danger' :
                    privacyInfo.color === '#f59e0b' ? 'warning' :
                    privacyInfo.color === '#3b82f6' ? 'info' : 'success'
                  }
                  size="sm"
                >
                  {privacyInfo.label}
                </Badge>
                <span style={styles.chevron}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Zone Edit Modal */}
      <ZoneEditModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        zone={editingZone}
        onSave={handleSaveZone}
        onDelete={editingZone ? () => handleDeleteZone(editingZone.id) : null}
      />
    </div>
  );
}

/**
 * Zone Edit Modal
 */
function ZoneEditModal({ isOpen, onClose, zone, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    displayName: zone?.displayName || '',
    zoneType: zone?.zoneType || 'CUSTOM',
    privacyLevel: zone?.privacyLevel || 'SEMI_PRIVATE',
    isEntryPoint: zone?.isEntryPoint || false
  });

  // Reset form when zone changes
  React.useEffect(() => {
    setFormData({
      displayName: zone?.displayName || '',
      zoneType: zone?.zoneType || 'CUSTOM',
      privacyLevel: zone?.privacyLevel || 'SEMI_PRIVATE',
      isEntryPoint: zone?.isEntryPoint || false
    });
  }, [zone]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={zone ? 'Edit Zone' : 'Add Zone'}
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
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Zone Name</label>
        <input
          type="text"
          style={inputStyle}
          value={formData.displayName}
          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          placeholder="e.g., Front Porch"
          required
        />

        <label style={labelStyle}>Zone Type</label>
        <select
          style={inputStyle}
          value={formData.zoneType}
          onChange={(e) => setFormData({ ...formData, zoneType: e.target.value })}
        >
          {Object.entries(ZONE_TYPES).map(([key, info]) => (
            <option key={key} value={key}>
              {info.icon} {info.label}
            </option>
          ))}
        </select>

        <label style={labelStyle}>Privacy Level</label>
        <select
          style={inputStyle}
          value={formData.privacyLevel}
          onChange={(e) => setFormData({ ...formData, privacyLevel: e.target.value })}
        >
          {Object.entries(PRIVACY_LEVELS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.label} - {info.description}
            </option>
          ))}
        </select>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={formData.isEntryPoint}
            onChange={(e) => setFormData({ ...formData, isEntryPoint: e.target.checked })}
          />
          This is an entry point (door, gate, etc.)
        </label>
      </form>
    </Modal>
  );
}

export default ZonesSection;
