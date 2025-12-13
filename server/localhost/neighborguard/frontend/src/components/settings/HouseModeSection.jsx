// ============================================================================
// HouseModeSection Component
// House mode selector for Settings page
// ============================================================================

import React, { useState } from 'react';
import { HOUSE_MODES, getHouseMode } from '../../constants';
import { homeAPI } from '../../services/api';

export function HouseModeSection({ home, circleId, onUpdate }) {
  const [updating, setUpdating] = useState(false);
  const currentMode = home?.houseMode || 'HOME';

  const handleModeChange = async (newMode) => {
    if (newMode === currentMode || updating) return;

    setUpdating(true);
    try {
      await homeAPI.setHouseMode(circleId, newMode);
      onUpdate?.({ ...home, houseMode: newMode });
    } catch (error) {
      console.error('Failed to update house mode:', error);
      alert('Failed to update house mode');
    } finally {
      setUpdating(false);
    }
  };

  const styles = {
    container: {
      margin: '0 16px 24px'
    },
    label: {
      padding: '8px 0',
      fontSize: '13px',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px'
    },
    modeCard: (isActive, color, bgColor) => ({
      background: isActive ? bgColor : 'white',
      border: `2px solid ${isActive ? color : '#e5e7eb'}`,
      borderRadius: '12px',
      padding: '16px',
      cursor: updating ? 'not-allowed' : 'pointer',
      opacity: updating ? 0.7 : 1,
      transition: 'all 0.2s ease',
      textAlign: 'center'
    }),
    modeIcon: {
      fontSize: '28px',
      marginBottom: '8px'
    },
    modeLabel: (isActive, color) => ({
      fontSize: '14px',
      fontWeight: '600',
      color: isActive ? color : '#374151',
      marginBottom: '4px'
    }),
    modeDesc: {
      fontSize: '12px',
      color: '#6b7280'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.label}>House Mode</div>
      <div style={styles.grid}>
        {HOUSE_MODES.map((mode) => {
          const isActive = currentMode === mode.value;
          return (
            <div
              key={mode.value}
              style={styles.modeCard(isActive, mode.color, mode.bgColor)}
              onClick={() => handleModeChange(mode.value)}
            >
              <div style={styles.modeIcon}>{mode.icon}</div>
              <div style={styles.modeLabel(isActive, mode.color)}>{mode.label}</div>
              <div style={styles.modeDesc}>{mode.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HouseModeSection;
