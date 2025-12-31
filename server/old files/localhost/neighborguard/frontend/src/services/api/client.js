// ============================================================================
// API Client
// Axios instance with interceptors for authentication
// ============================================================================

import axios from 'axios';

// Base URL from environment or default
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Token storage keys
const ACCESS_TOKEN_KEY = 'neighborguard_access_token';
const REFRESH_TOKEN_KEY = 'neighborguard_refresh_token';
const USER_ID_KEY = 'neighborguard_user_id';
const CIRCLE_ID_KEY = 'neighborguard_circle_id';

/**
 * Get stored access token
 */
export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Set access token
 */
export function setAccessToken(token) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

/**
 * Get stored refresh token
 */
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Set refresh token
 */
export function setRefreshToken(token) {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

/**
 * Get stored user ID
 */
export function getUserId() {
  return localStorage.getItem(USER_ID_KEY);
}

/**
 * Set user ID
 */
export function setUserId(id) {
  if (id) {
    localStorage.setItem(USER_ID_KEY, id);
  } else {
    localStorage.removeItem(USER_ID_KEY);
  }
}

/**
 * Get current circle ID
 */
export function getCircleId() {
  return localStorage.getItem(CIRCLE_ID_KEY);
}

/**
 * Set current circle ID
 */
export function setCircleId(id) {
  if (id) {
    localStorage.setItem(CIRCLE_ID_KEY, id);
  } else {
    localStorage.removeItem(CIRCLE_ID_KEY);
  }
}

/**
 * Clear all auth data
 */
export function clearAuthData() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

// Request interceptor - add auth headers
client.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const circleId = getCircleId();
    if (circleId) {
      config.headers['X-Circle-Id'] = circleId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors and token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      const userId = getUserId();

      if (!refreshToken || !userId) {
        clearAuthData();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken,
          userId
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.tokens;

        setAccessToken(accessToken);
        if (newRefreshToken) {
          setRefreshToken(newRefreshToken);
        }

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthData();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Generic API request wrapper
 */
export async function request(method, url, data = null, config = {}) {
  try {
    const response = await client({
      method,
      url,
      data,
      ...config
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error?.message 
      || error.message 
      || 'An error occurred';
    
    const apiError = new Error(message);
    apiError.code = error.response?.data?.error?.code;
    apiError.status = error.response?.status;
    
    throw apiError;
  }
}

export default client;
