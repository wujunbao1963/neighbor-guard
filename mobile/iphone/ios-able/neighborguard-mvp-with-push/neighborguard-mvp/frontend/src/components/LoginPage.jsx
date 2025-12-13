import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { isValidEmail } from '../utils/helpers';
import LoadingSpinner from './LoadingSpinner';

export default function LoginPage() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  
  const { requestCode, login } = useAuth();
  const { resetCircle } = useCircle();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!isValidEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);
    try {
      await requestCode(email);
      setStep('code');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setLoading(true);
    try {
      // Reset circle state before login to clear previous user's selection
      resetCircle();
      await login(email, code);
      // App.jsx will automatically show main view when isAuthenticated becomes true
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setLoading(true);
    setError('');
    try {
      await requestCode(email);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '48px 24px 32px'
      }}>
        <div style={{ 
          width: '80px', height: '80px', 
          background: 'white', 
          borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          marginBottom: '24px'
        }}>
          <span style={{ fontSize: '40px' }}>🛡️</span>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
          NeighborGuard
        </h1>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>邻里守望</p>
      </div>

      {/* Login Form */}
      <div style={{ 
        background: 'white', 
        borderRadius: '24px 24px 0 0',
        padding: '32px 24px',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.1)'
      }}>
        <div style={{ maxWidth: '360px', margin: '0 auto' }}>
          {step === 'email' ? (
            <>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                欢迎回来
              </h2>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                请输入您的邮箱，我们将发送验证码
              </p>

              <form onSubmit={handleRequestCode}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px' }}>📧</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="form-input"
                      style={{ paddingLeft: '48px' }}
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div style={{ 
                    marginBottom: '16px', padding: '12px', 
                    background: '#fee2e2', borderRadius: '8px', 
                    color: '#dc2626', fontSize: '14px' 
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? <LoadingSpinner size="sm" /> : <>获取验证码 →</>}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                输入验证码
              </h2>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                验证码已发送至 <strong>{email}</strong>
              </p>

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px' }}>🔑</span>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6位数字验证码"
                      className="form-input"
                      style={{ paddingLeft: '48px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontFamily: 'monospace' }}
                      disabled={loading}
                      autoFocus
                      inputMode="numeric"
                    />
                  </div>
                </div>

                {error && (
                  <div style={{ 
                    marginBottom: '16px', padding: '12px', 
                    background: '#fee2e2', borderRadius: '8px', 
                    color: '#dc2626', fontSize: '14px' 
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? <LoadingSpinner size="sm" /> : <>登录 →</>}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setError(''); }}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
                  >
                    ← 更换邮箱
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || loading}
                    style={{ 
                      background: 'none', border: 'none', 
                      color: countdown > 0 ? '#999' : '#667eea', 
                      cursor: countdown > 0 ? 'default' : 'pointer' 
                    }}
                  >
                    {countdown > 0 ? `${countdown}秒后重发` : '重新发送'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Dev hint */}
          <div style={{ 
            marginTop: '32px', padding: '12px', 
            background: '#f9fafb', borderRadius: '8px', 
            fontSize: '12px', color: '#666' 
          }}>
            <p style={{ fontWeight: '500', marginBottom: '4px' }}>🧪 开发模式</p>
            <p>验证码会显示在后端控制台</p>
            <p>测试邮箱: wujunbao@test.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
