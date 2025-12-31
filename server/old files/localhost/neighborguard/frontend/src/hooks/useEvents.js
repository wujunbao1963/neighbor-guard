// ============================================================================
// useEvents Hook
// Manages security events state and operations
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useCircle } from '../context/CircleContext';
import { eventAPI } from '../services/api';

/**
 * Hook for managing security events
 * @param {Object} options - Hook options
 * @returns {Object} Events state and operations
 */
export function useEvents(options = {}) {
  const { currentCircle } = useCircle();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });

  const circleId = currentCircle?.id;

  /**
   * Fetch events with optional filters
   */
  const fetchEvents = useCallback(async (filters = {}) => {
    if (!circleId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = {
        page: filters.page || pagination.page,
        pageSize: filters.pageSize || pagination.pageSize,
        ...filters
      };

      const response = await eventAPI.getEvents(circleId, params);
      
      setEvents(response.data || []);
      setPagination({
        page: response.page || 1,
        pageSize: response.pageSize || 20,
        total: response.total || 0,
        totalPages: response.totalPages || 0
      });
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [circleId, pagination.page, pagination.pageSize]);

  /**
   * Fetch recent events for timeline
   */
  const fetchRecentEvents = useCallback(async (limit = 50) => {
    if (!circleId) return [];

    try {
      const response = await eventAPI.getRecentEvents(circleId, limit);
      return response.data || [];
    } catch (err) {
      console.error('Failed to fetch recent events:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Fetch open events
   */
  const fetchOpenEvents = useCallback(async () => {
    if (!circleId) return [];

    try {
      const response = await eventAPI.getOpenEvents(circleId);
      return response.data || [];
    } catch (err) {
      console.error('Failed to fetch open events:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Get single event details
   */
  const getEvent = useCallback(async (eventId) => {
    if (!circleId) return null;

    try {
      const response = await eventAPI.getEvent(circleId, eventId);
      return response.data;
    } catch (err) {
      console.error('Failed to get event:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Update event status
   */
  const updateEventStatus = useCallback(async (eventId, status) => {
    if (!circleId) return;

    try {
      const response = await eventAPI.updateStatus(circleId, eventId, status);
      
      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === eventId ? { ...e, status } : e
      ));
      
      return response.data;
    } catch (err) {
      console.error('Failed to update event status:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Submit event feedback
   */
  const submitFeedback = useCallback(async (eventId, feedback) => {
    if (!circleId) return;

    try {
      const response = await eventAPI.submitFeedback(circleId, eventId, feedback);
      return response.data;
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Create manual event
   */
  const createEvent = useCallback(async (eventData) => {
    if (!circleId) return;

    try {
      const response = await eventAPI.createEvent(circleId, eventData);
      
      // Add to local state
      setEvents(prev => [response.data, ...prev]);
      
      return response.data;
    } catch (err) {
      console.error('Failed to create event:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Delete event
   */
  const deleteEvent = useCallback(async (eventId) => {
    if (!circleId) return;

    try {
      await eventAPI.deleteEvent(circleId, eventId);
      
      // Remove from local state
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      console.error('Failed to delete event:', err);
      throw err;
    }
  }, [circleId]);

  /**
   * Change page
   */
  const goToPage = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  /**
   * Refresh events
   */
  const refresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-fetch on mount and circle change
  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchEvents();
    }
  }, [circleId, options.autoFetch]);

  return {
    // State
    events,
    loading,
    error,
    pagination,
    
    // Operations
    fetchEvents,
    fetchRecentEvents,
    fetchOpenEvents,
    getEvent,
    updateEventStatus,
    submitFeedback,
    createEvent,
    deleteEvent,
    goToPage,
    refresh
  };
}

export default useEvents;
