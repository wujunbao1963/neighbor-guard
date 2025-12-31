import { useState, useEffect } from 'react';
import { useCircle } from '../context/CircleContext';

// ============================================================================
// Dev Panel - Simulation Controls (Development Only)
// ============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Scenario display info
const SCENARIO_INFO = {
  night_backdoor_breakin: {
    icon: '🚨',
    name: 'Night Break-in',
    description: 'Door + PIR in NIGHT mode',
    expectedResult: 'R1_BREAKIN_DOOR_PIR → HIGH'
  },
  night_backyard_suspicious: {
    icon: '👤',
    name: 'Suspicious Person',
    description: 'Motion in private backyard',
    expectedResult: 'R3_SUSPICIOUS_PERSON → HIGH'
  },
  glass_break_alert: {
    icon: '🪟',
    name: 'Glass Break',
    description: 'Glass break sensor (any mode)',
    expectedResult: 'R2_BREAKIN_GLASS → HIGH'
  },
  home_pir_suppressed: {
    icon: '🔇',
    name: 'PIR Suppressed',
    description: 'Single PIR in HOME mode',
    expectedResult: 'Suppressed (no event)'
  },
  disarmed_door_suppressed: {
    icon: '🔓',
    name: 'Disarmed Door',
    description: 'Door open in DISARMED mode',
    expectedResult: 'Suppressed (no event)'
  },
  away_full_intrusion: {
    icon: '🏃',
    name: 'Full Intrusion',
    description: 'Driveway → Door → Living Room',
    expectedResult: 'R1_BREAKIN_DOOR_PIR → HIGH'
  }
};

const styles = {
  panel: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999
  },
  toggleButton: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    color: 'white',
    fontSize: '24px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  drawer: {
    position: 'absolute',
    bottom: '70px',
    right: '0',
    width: '340px',
    maxHeight: '70vh',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    overflow: 'hidden'
  },
  header: {
    padding: '16px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white'
  },
  body: {
    padding: '16px',
    maxHeight: '50vh',
    overflowY: 'auto'
  },
  scenarioCard: (isRunning) => ({
    padding: '12px',
    marginBottom: '10px',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    cursor: isRunning ? 'wait' : 'pointer',
    transition: 'all 0.2s',
    opacity: isRunning ? 0.7 : 1
  }),
  resultBox: (success) => ({
    marginTop: '12px',
    padding: '12px',
    borderRadius: '8px',
    background: success ? '#d1fae5' : '#fee2e2',
    border: `1px solid ${success ? '#10b981' : '#ef4444'}`,
    fontSize: '13px'
  }),
  stateBox: {
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  button: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  }
};

export default function DevPanel({ onEventCreated }) {
  const { currentCircleId } = useCircle();
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [runningScenario, setRunningScenario] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [currentState, setCurrentState] = useState(null);

  // Only show in development
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  
  if (!isDev) return null;

  // Load scenarios on open
  useEffect(() => {
    if (isOpen && scenarios.length === 0) {
      loadScenarios();
    }
    if (isOpen && currentCircleId) {
      loadState();
    }
  }, [isOpen, currentCircleId]);

  const loadScenarios = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dev/scenarios`);
      const data = await res.json();
      if (data.success) {
        setScenarios(data.scenarios);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  };

  const loadState = async () => {
    if (!currentCircleId) return;
    try {
      const res = await fetch(`${API_BASE}/api/dev/state/${currentCircleId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentState(data.state);
      }
    } catch (err) {
      console.error('Failed to load state:', err);
    }
  };

  const runScenario = async (scenarioId) => {
    if (!currentCircleId || runningScenario) return;
    
    setRunningScenario(scenarioId);
    setLastResult(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/dev/simulate/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioId, circleId: currentCircleId })
      });
      const data = await res.json();
      setLastResult({ scenarioId, ...data });
      
      // Refresh state
      await loadState();
      
      // Notify parent to refresh events
      if (data.success && onEventCreated) {
        onEventCreated();
      }
    } catch (err) {
      setLastResult({ scenarioId, success: false, error: err.message });
    } finally {
      setRunningScenario(null);
    }
  };

  const resetData = async () => {
    if (!currentCircleId || loading) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/dev/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: currentCircleId })
      });
      const data = await res.json();
      if (data.success) {
        setLastResult({ reset: true, ...data });
        await loadState();
        if (onEventCreated) onEventCreated();
      }
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.panel}>
      {/* Drawer */}
      {isOpen && (
        <div style={styles.drawer}>
          {/* Header */}
          <div style={styles.header}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '16px' }}>🧪 Dev Panel</div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Fusion Engine Testing</div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={styles.body}>
            {/* Current State */}
            {currentState && (
              <div style={styles.stateBox}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                  CURRENT STATE
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Mode:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{currentState.home?.houseMode || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Events:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{currentState.recentEvents?.length || 0}</span>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Tracks:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{currentState.openTracks?.length || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={resetData}
              disabled={loading || !currentCircleId}
              style={{
                ...styles.button,
                background: '#fee2e2',
                color: '#dc2626',
                width: '100%',
                marginBottom: '16px'
              }}
            >
              🗑️ Reset All Events & Tracks
            </button>

            {/* Scenarios */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '10px' }}>
              RUN SCENARIO
            </div>

            {!currentCircleId ? (
              <div style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                Select a circle first
              </div>
            ) : (
              scenarios.map(scenario => {
                const info = SCENARIO_INFO[scenario.id] || {};
                const isRunning = runningScenario === scenario.id;
                const isLastRun = lastResult?.scenarioId === scenario.id;

                return (
                  <div
                    key={scenario.id}
                    onClick={() => runScenario(scenario.id)}
                    style={{
                      ...styles.scenarioCard(isRunning),
                      background: isLastRun ? (lastResult.success ? '#f0fdf4' : '#fef2f2') : 'white',
                      borderColor: isLastRun ? (lastResult.success ? '#86efac' : '#fca5a5') : '#e5e7eb'
                    }}
                    onMouseOver={(e) => { if (!isRunning) e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseOut={(e) => { if (!isRunning && !isLastRun) e.currentTarget.style.background = 'white'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>{info.icon || '▶️'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>
                          {info.name || scenario.name}
                          {isRunning && <span style={{ marginLeft: '8px' }}>⏳</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                          {info.description || scenario.description}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          Expected: {info.expectedResult || scenario.expectedRule || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Result for this scenario */}
                    {isLastRun && lastResult && (
                      <div style={styles.resultBox(lastResult.success)}>
                        {lastResult.success ? (
                          <>
                            <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                              {lastResult.summary?.securityEventCreated ? '✅ Event Created' : '🔇 Suppressed'}
                            </div>
                            <div style={{ fontSize: '12px' }}>
                              Rule: {lastResult.summary?.ruleMatched || 'None'}<br />
                              Notification: {lastResult.summary?.notificationLevel || 'NONE'}
                            </div>
                          </>
                        ) : (
                          <div>❌ {lastResult.error?.message || 'Failed'}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...styles.toggleButton,
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }}
      >
        {isOpen ? '✕' : '🧪'}
      </button>
    </div>
  );
}
