import { createContext, useContext, useState, useCallback } from 'react';
import { circleAPI, zoneAPI, homeAPI } from '../services/api';

const CircleContext = createContext(null);

export function CircleProvider({ children }) {
  const [currentCircle, setCurrentCircle] = useState(null);
  const [currentCircleId, setCurrentCircleId] = useState(() => {
    return localStorage.getItem('currentCircleId') || null;
  });
  const [zones, setZones] = useState([]);
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(false);

  // Select circle
  const selectCircle = useCallback(async (circleId) => {
    if (!circleId) {
      setCurrentCircle(null);
      setCurrentCircleId(null);
      setZones([]);
      setHome(null);
      localStorage.removeItem('currentCircleId');
      return;
    }

    setLoading(true);
    try {
      const [circleRes, zonesRes, homeRes] = await Promise.all([
        circleAPI.getOne(circleId),
        zoneAPI.getAll(circleId),
        homeAPI.get(circleId)
      ]);

      setCurrentCircle(circleRes.data.circle);
      setHome(homeRes.data.home);
      setCurrentCircleId(circleId);
      localStorage.setItem('currentCircleId', circleId);

      // Auto-init zones if empty (for circles created before zone init was added)
      let loadedZones = zonesRes.data.zones;
      if (loadedZones.length === 0) {
        console.log('No zones found, initializing...');
        try {
          const initRes = await zoneAPI.init(circleId);
          loadedZones = initRes.data.zones || [];
          console.log(`Initialized ${loadedZones.length} zones`);
        } catch (initErr) {
          console.error('Failed to init zones:', initErr);
        }
      }
      setZones(loadedZones);
    } catch (err) {
      console.error('Failed to load circle:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh zones
  const refreshZones = useCallback(async () => {
    if (!currentCircleId) return;
    const response = await zoneAPI.getAll(currentCircleId);
    setZones(response.data.zones);
    return response.data.zones;
  }, [currentCircleId]);

  // Refresh home
  const refreshHome = useCallback(async () => {
    if (!currentCircleId) return;
    const response = await homeAPI.get(currentCircleId);
    setHome(response.data.home);
    return response.data.home;
  }, [currentCircleId]);

  // Refresh current circle
  const refreshCircle = useCallback(async () => {
    if (!currentCircleId) return;
    const response = await circleAPI.getOne(currentCircleId);
    setCurrentCircle(response.data.circle);
    return response.data.circle;
  }, [currentCircleId]);

  // Get enabled zones only
  const enabledZones = zones.filter(z => z.isEnabled);

  // Get zone by ID
  const getZoneById = useCallback((zoneId) => {
    return zones.find(z => z.id === zoneId);
  }, [zones]);

  // Check if user can edit (OWNER or HOUSEHOLD)
  const canEdit = currentCircle?.myRole === 'OWNER' || currentCircle?.myRole === 'HOUSEHOLD';
  const isOwner = currentCircle?.myRole === 'OWNER';

  // Reset circle state (called on logout)
  const resetCircle = useCallback(() => {
    setCurrentCircle(null);
    setCurrentCircleId(null);
    setZones([]);
    setHome(null);
    localStorage.removeItem('currentCircleId');
  }, []);

  const value = {
    currentCircle,
    currentCircleId,
    zones,
    enabledZones,
    home,
    loading,
    canEdit,
    isOwner,
    selectCircle,
    refreshZones,
    refreshHome,
    refreshCircle,
    getZoneById,
    setZones,
    setHome,
    resetCircle
  };

  return (
    <CircleContext.Provider value={value}>
      {children}
    </CircleContext.Provider>
  );
}

export function useCircle() {
  const context = useContext(CircleContext);
  if (!context) {
    throw new Error('useCircle must be used within CircleProvider');
  }
  return context;
}
