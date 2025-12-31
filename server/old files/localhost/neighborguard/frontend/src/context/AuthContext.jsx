import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const response = await authAPI.getMe();
          setUser(response.data.user);
          setCircles(response.data.circles);
        } catch (err) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Request verification code
  const requestCode = useCallback(async (email) => {
    setError(null);
    try {
      const response = await authAPI.requestCode(email);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.error?.message || '发送验证码失败';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Login with code
  const login = useCallback(async (email, code) => {
    setError(null);
    try {
      const response = await authAPI.login(email, code);
      const { user, circles, tokens } = response.data;
      
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      // Clear old circle selection so new user gets their home circle
      localStorage.removeItem('currentCircleId');
      
      setUser(user);
      setCircles(circles);
      
      return response.data;
    } catch (err) {
      const message = err.response?.data?.error?.message || '登录失败';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await authAPI.logout(refreshToken);
      }
    } catch (err) {
      // Ignore logout errors
    }
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentCircleId');
    setUser(null);
    setCircles([]);
  }, []);

  // Update user profile
  const updateProfile = useCallback(async (data) => {
    const response = await authAPI.updateMe(data);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  // Refresh circles
  const refreshCircles = useCallback(async () => {
    const response = await authAPI.getMe();
    setCircles(response.data.circles);
    return response.data.circles;
  }, []);

  const value = {
    user,
    circles,
    loading,
    error,
    isAuthenticated: !!user,
    requestCode,
    login,
    logout,
    updateProfile,
    refreshCircles,
    setCircles
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
