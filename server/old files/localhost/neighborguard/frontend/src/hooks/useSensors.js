// ============================================================================
// useSensors Hook
// Manages sensors state and operations
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useCircle } from '../context/CircleContext';
import { sensorAPI } from '../services/api';

/**
 * Hook for managing sensors
 * @param {Object} options - Hook options
 * @returns {Object} Sensors state and operations
 */
export function useSensors(options = {}) {
  const { currentCircle } = useCircle();
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const circleId = currentCircle?.id;

  /**
   * Fetch all sensors for the circle
   */
  const fetchSensors = useCallback(async () => {
    if (!circleId) {
      setSensors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await sensorAPI.getSensors(circleId);
      setSensors(response.data || response || []);
    } catch (err) {
      console.error('Failed to fetch sensors:', err);
      setError(err.message || 'Failed to load sensors');
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  /**
   * Get sensors by zone
   */
  const getSensorsByZone = useCallback((zoneId) => {
    return sensors.filter(s => s.zoneId === zoneId);
  }, [sensors]);

  /**
   * Get sensors by type
   */
  const getSensorsByType = useCallback((sensorType) => {
    return sensors.filter(s => s.sensorType === sensorType);
  }, [sensors]);

  /**
   * Get sensors by status
   */
  const getSensorsByStatus = useCallback((status) => {
    return sensors.filter(s => s.status === status);
  }, [sensors]);

  /**
   * Get online sensors count
   */
  const getOnlineCount = useCallback(() => {
    return sensors.filter(s => s.status === 'ONLINE').length;
  }, [sensors]);

  /**
   * Get offline sensors count
   */
  const getOfflineCount = useCallback(() => {
    return sensors.filter(s => s.status === 'OFFLINE').length;
  }, [sensors]);

  /**
   * Create a new sensor
   */
  const createSensor = useCallback(async (sensorData) => {
    if (!circleId) return;

    try {
      const response = await sensorAPI.createSensor(circleId, sensorData);
      const newSensor = response.data || response;
      
      setSensors(prev => [...prev, newSensor]);
      return newSensor;
    } catch (err) {
      console.error('Failed to create sensor:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Update a sensor
   */
  const updateSensor = useCallback(async (sensorId, updateData) => {
    if (!circleId) return;

    try {
      const response = await sensorAPI.updateSensor(circleId, sensorId, updateData);
      const updatedSensor = response.data || response;
      
      setSensors(prev => prev.map(s => 
        s.id === sensorId ? { ...s, ...updatedSensor } : s
      ));
      
      return updatedSensor;
    } catch (err) {
      console.error('Failed to update sensor:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Delete a sensor
   */
  const deleteSensor = useCallback(async (sensorId) => {
    if (!circleId) return;

    try {
      await sensorAPI.deleteSensor(circleId, sensorId);
      setSensors(prev => prev.filter(s => s.id !== sensorId));
    } catch (err) {
      console.error('Failed to delete sensor:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Toggle sensor enabled state
   */
  const toggleSensor = useCallback(async (sensorId) => {
    const sensor = sensors.find(s => s.id === sensorId);
    if (!sensor) return;

    return updateSensor(sensorId, { isEnabled: !sensor.isEnabled });
  }, [sensors, updateSensor]);

  /**
   * Refresh sensors
   */
  const refresh = useCallback(() => {
    fetchSensors();
  }, [fetchSensors]);

  // Auto-fetch on mount and circle change
  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchSensors();
    }
  }, [circleId, options.autoFetch]);

  // Summary statistics
  const stats = {
    total: sensors.length,
    online: getOnlineCount(),
    offline: getOfflineCount(),
    lowBattery: sensors.filter(s => s.status === 'LOW_BATTERY').length,
    enabled: sensors.filter(s => s.isEnabled).length
  };

  return {
    // State
    sensors,
    loading,
    error,
    stats,
    
    // Filtered getters
    getSensorsByZone,
    getSensorsByType,
    getSensorsByStatus,
    
    // Operations
    fetchSensors,
    createSensor,
    updateSensor,
    deleteSensor,
    toggleSensor,
    refresh
  };
}

export default useSensors;
