import axios from 'axios';

const API_BASE = '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          const { accessToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// ============================================================================
// Auth API
// ============================================================================
export const authAPI = {
  requestCode: (email) => api.post('/auth/request-code', { email }),
  login: (email, code) => api.post('/auth/login', { email, code }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data)
};

// ============================================================================
// Config API
// ============================================================================
export const configAPI = {
  getZones: (houseType) => api.get('/config/zones', { params: { houseType } }),
  getEventTypes: () => api.get('/config/event-types'),
  getEventZoneWhitelist: () => api.get('/config/event-zone-whitelist'),
  getHouseTypes: () => api.get('/config/house-types'),
  getSeverities: () => api.get('/config/severities'),
  getStatuses: () => api.get('/config/statuses'),
  getRoles: () => api.get('/config/roles')
};

// ============================================================================
// Circle API
// ============================================================================
export const circleAPI = {
  getAll: () => api.get('/circles'),
  getOne: (circleId) => api.get(`/circles/${circleId}`),
  create: (data) => api.post('/circles', data),
  update: (circleId, data) => api.put(`/circles/${circleId}`, data),
  delete: (circleId) => api.delete(`/circles/${circleId}`),
  addMember: (circleId, data) => api.post(`/circles/${circleId}/members`, data),
  updateMember: (circleId, memberId, data) => api.put(`/circles/${circleId}/members/${memberId}`, data),
  removeMember: (circleId, memberId) => api.delete(`/circles/${circleId}/members/${memberId}`),
  leave: (circleId) => api.post(`/circles/${circleId}/leave`)
};

// ============================================================================
// Home API
// ============================================================================
export const homeAPI = {
  get: (circleId) => api.get(`/homes/${circleId}`),
  update: (circleId, data) => api.put(`/homes/${circleId}`, data)
};

// ============================================================================
// Zone API
// ============================================================================
export const zoneAPI = {
  getAll: (circleId, params) => api.get(`/zones/${circleId}`, { params }),
  getOne: (circleId, zoneId) => api.get(`/zones/${circleId}/${zoneId}`),
  update: (circleId, zoneId, data) => api.put(`/zones/${circleId}/${zoneId}`, data),
  batchUpdate: (circleId, zones) => api.put(`/zones/${circleId}/batch`, { zones }),
  reorder: (circleId, zoneIds) => api.post(`/zones/${circleId}/reorder`, { zoneIds }),
  enableAll: (circleId) => api.post(`/zones/${circleId}/enable-all`),
  disableAll: (circleId) => api.post(`/zones/${circleId}/disable-all`),
  resetDefaults: (circleId) => api.post(`/zones/${circleId}/reset-defaults`),
  init: (circleId) => api.post(`/zones/${circleId}/init`)
};

// ============================================================================
// Event API
// ============================================================================
export const eventAPI = {
  getAll: (circleId, params) => api.get(`/events/${circleId}`, { params }),
  getOne: (circleId, eventId) => api.get(`/events/${circleId}/${eventId}`),
  create: (circleId, data) => api.post(`/events/${circleId}`, data),
  update: (circleId, eventId, data) => api.put(`/events/${circleId}/${eventId}`, data),
  updateStatus: (circleId, eventId, status) => api.put(`/events/${circleId}/${eventId}/status`, { status }),
  updatePolice: (circleId, eventId, data) => api.put(`/events/${circleId}/${eventId}/police`, data),
  delete: (circleId, eventId) => api.delete(`/events/${circleId}/${eventId}`),
  getNotes: (circleId, eventId) => api.get(`/events/${circleId}/${eventId}/notes`),
  addNote: (circleId, eventId, data) => api.post(`/events/${circleId}/${eventId}/notes`, data)
};

// ============================================================================
// Upload API
// ============================================================================
export const uploadAPI = {
  upload: (circleId, eventId, files, sourceType = 'USER_UPLOAD') => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('sourceType', sourceType);
    
    return api.post(`/uploads/${circleId}/${eventId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAll: (circleId, eventId) => api.get(`/uploads/${circleId}/${eventId}`),
  delete: (circleId, mediaId) => api.delete(`/uploads/${circleId}/${mediaId}`),
  
  // Download media for ONE event as zip
  downloadEvent: (circleId, eventId) => {
    const token = localStorage.getItem('accessToken');
    return `${API_BASE}/uploads/${circleId}/${eventId}/download?token=${token}`;
  },
  
  // Download all media for circle as zip
  downloadAll: (circleId, startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    // Return URL for direct download
    const token = localStorage.getItem('accessToken');
    return `${API_BASE}/uploads/${circleId}/download-all?${params.toString()}&token=${token}`;
  }
};

// ============================================================================
// Admin API
// ============================================================================
export const adminAPI = {
  // Get current admin info
  getMe: () => api.get('/auth/admin/me'),
  
  // User management
  getUsers: () => api.get('/auth/admin/users'),
  deleteUser: (userId) => api.delete(`/auth/admin/users/${userId}`),
  makeHomeowner: (userId, data) => api.post('/auth/admin/make-homeowner', { userId, ...data }),
  
  // Whitelist management (optional now - anyone can register)
  getWhitelist: () => api.get('/auth/admin/whitelist'),
  addWhitelist: (email, notes) => api.post('/auth/admin/whitelist', { email, notes }),
  removeWhitelist: (email) => api.delete(`/auth/admin/whitelist/${encodeURIComponent(email)}`),
  
  // Circle management
  getCircles: () => api.get('/auth/admin/circles'),
  
  // Admin user management (super admin only)
  getAdmins: () => api.get('/auth/admin/admins'),
  addAdmin: (email) => api.post('/auth/admin/admins', { email }),
  removeAdmin: (userId) => api.delete(`/auth/admin/admins/${userId}`)
};

export default api;
