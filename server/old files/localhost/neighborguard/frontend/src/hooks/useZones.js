// ============================================================================
// useZones Hook
// Manages zones state and operations
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useCircle } from '../context/CircleContext';
import { zoneAPI } from '../services/api';

/**
 * Hook for managing zones
 * @param {Object} options - Hook options
 * @returns {Object} Zones state and operations
 */
export function useZones(options = {}) {
  const { currentCircle } = useCircle();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const circleId = currentCircle?.id;

  /**
   * Fetch all zones for the circle
   */
  const fetchZones = useCallback(async () => {
    if (!circleId) {
      setZones([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await zoneAPI.getZones(circleId);
      setZones(response.data || response || []);
    } catch (err) {
      console.error('Failed to fetch zones:', err);
      setError(err.message || 'Failed to load zones');
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  /**
   * Get zone by ID
   */
  const getZoneById = useCallback((zoneId) => {
    return zones.find(z => z.id === zoneId);
  }, [zones]);

  /**
   * Get zones by privacy level
   */
  const getZonesByPrivacy = useCallback((privacyLevel) => {
    return zones.filter(z => z.privacyLevel === privacyLevel);
  }, [zones]);

  /**
   * Get entry point zones
   */
  const getEntryPoints = useCallback(() => {
    return zones.filter(z => z.isEntryPoint);
  }, [zones]);

  /**
   * Create a new zone
   */
  const createZone = useCallback(async (zoneData) => {
    if (!circleId) return;

    try {
      const response = await zoneAPI.createZone(circleId, zoneData);
      const newZone = response.data || response;
      
      setZones(prev => [...prev, newZone]);
      return newZone;
    } catch (err) {
      console.error('Failed to create zone:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Update a zone
   */
  const updateZone = useCallback(async (zoneId, updateData) => {
    if (!circleId) return;

    try {
      const response = await zoneAPI.updateZone(circleId, zoneId, updateData);
      const updatedZone = response.data || response;
      
      setZones(prev => prev.map(z => 
        z.id === zoneId ? { ...z, ...updatedZone } : z
      ));
      
      return updatedZone;
    } catch (err) {
      console.error('Failed to update zone:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Delete a zone
   */
  const deleteZone = useCallback(async (zoneId) => {
    if (!circleId) return;

    try {
      await zoneAPI.deleteZone(circleId, zoneId);
      setZones(prev => prev.filter(z => z.id !== zoneId));
    } catch (err) {
      console.error('Failed to delete zone:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Refresh zones
   */
  const refresh = useCallback(() => {
    fetchZones();
  }, [fetchZones]);

  // Auto-fetch on mount and circle change
  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchZones();
    }
  }, [circleId, options.autoFetch]);

  return {
    // State
    zones,
    loading,
    error,
    
    // Getters
    getZoneById,
    getZonesByPrivacy,
    getEntryPoints,
    
    // Operations
    fetchZones,
    createZone,
    updateZone,
    deleteZone,
    refresh
  };
}

export default useZones;
