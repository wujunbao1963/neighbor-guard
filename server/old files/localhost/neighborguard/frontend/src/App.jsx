import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useCircle } from './context/CircleContext';
import LoginPage from './components/LoginPage';
import HomePage from './pages/HomePage';
import TimelinePage from './pages/TimelinePage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import CreateEventModal from './components/CreateEventModal';
import EventDetailModal from './components/EventDetailModal';
import LoadingSpinner from './components/LoadingSpinner';
import DevPanel from './components/DevPanel'; // Phase 2: Dev simulation panel

function App() {
  const { user, circles, loading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentCircle, currentCircleId, selectCircle, loading: circleLoading, resetCircle } = useCircle();
  
  const [currentView, setCurrentView] = useState('home');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Phase 2: Trigger refresh after dev simulation
  
  // Check if user is admin
  const isAdmin = user?.adminRole === 'SUPER_ADMIN' || user?.adminRole === 'ADMIN';

  // Handle logout
  const handleLogout = async () => {
    resetCircle();
    await logout();
  };

  // Auto-select circle - prioritize circles where user is OWNER or HOUSEHOLD
  useEffect(() => {
    if (!isAuthenticated) return; // Don't try to load circles if not logged in
    if (circles.length === 0) return;
    
    // Always prioritize user's home circle (where they are OWNER or HOUSEHOLD)
    const homeCircle = circles.find(c => c.role === 'OWNER' || c.role === 'HOUSEHOLD');
    
    if (!currentCircleId) {
      // No saved circle, select home or first
      const defaultCircle = homeCircle || circles[0];
      selectCircle(defaultCircle.id);
    } else if (!currentCircle && !circleLoading) {
      // Have saved circleId but no loaded circle yet
      const validCircle = circles.find(c => c.id === currentCircleId);
      
      if (validCircle) {
        // Saved circle is valid for this user
        // But if user has a home circle and saved circle is not their home, switch to home
        if (homeCircle && currentCircleId !== homeCircle.id) {
          selectCircle(homeCircle.id);
        } else {
          selectCircle(currentCircleId);
        }
      } else {
        // Saved circle not valid for this user, select home or first
        const defaultCircle = homeCircle || circles[0];
        selectCircle(defaultCircle.id);
      }
    }
  }, [isAuthenticated, circles, currentCircleId, currentCircle, circleLoading, selectCircle]);

  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const getRoleLabel = (role) => {
    const labels = {
      OWNER: 'Owner',
      HOUSEHOLD: 'Household',
      NEIGHBOR: 'Neighbor',
      RELATIVE: 'Family/Friend',
      OBSERVER: 'Observer'
    };
    return labels[role] || role;
  };

  const handleViewEvent = (event) => {
    setSelectedEvent(event);
  };

  const handleCircleChange = (circleId) => {
    selectCircle(circleId);
  };

  // Navigate to settings with specific tab
  const handleNavigateToSettings = (tab) => {
    setCurrentView('settings');
    // The SettingsPage will handle the tab via its own state
  };

  // Get current user's role in current circle
  const currentMembership = circles.find(c => c.id === currentCircleId);
  const currentRole = currentMembership?.role || 'NEIGHBOR';

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>🛡️ NeighborGuard</h1>
            <div className="header-subtitle">
              {user?.displayName} ({getRoleLabel(currentRole)}) · {currentCircle?.displayName || 'Loading...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Circle Selector */}
            {circles.length > 1 && (
              <select
                className="header-select"
                value={currentCircleId || ''}
                onChange={(e) => handleCircleChange(e.target.value)}
              >
                {circles.map(circle => (
                  <option key={circle.id} value={circle.id}>
                    {circle.displayName} - {getRoleLabel(circle.role)}
                  </option>
                ))}
              </select>
            )}
            {/* Logout Button */}
            <button 
              onClick={handleLogout}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs">
        {[
          { id: 'home', label: 'Dashboard', icon: '🏠' },
          { id: 'timeline', label: 'Events', icon: '📅' },
          { id: 'settings', label: 'Settings', icon: '⚙️' },
          ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: '👑' }] : [])
        ].map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${currentView === tab.id ? 'active' : ''}`}
            onClick={() => setCurrentView(tab.id)}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="content">
        {currentView === 'admin' && isAdmin ? (
          <AdminPage />
        ) : circleLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <LoadingSpinner size="lg" />
          </div>
        ) : !currentCircle ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏠</div>
            <div style={{ marginBottom: '8px' }}>You haven't joined any circles yet</div>
            <p style={{ fontSize: '14px', color: '#6b7280', maxWidth: '300px', textAlign: 'center' }}>
              Please wait for a homeowner to invite you to their circle, or contact an admin to set you up as a homeowner.
            </p>
          </div>
        ) : (
          <>
            {currentView === 'home' && (
              <HomePage
                key={`home-${refreshKey}`}
                onCreateEvent={() => setShowCreateModal(true)}
                onViewEvent={handleViewEvent}
                onNavigateToSettings={handleNavigateToSettings}
              />
            )}
            {currentView === 'timeline' && (
              <TimelinePage key={`timeline-${refreshKey}`} onViewEvent={handleViewEvent} />
            )}
            {currentView === 'settings' && (
              <SettingsPage />
            )}
          </>
        )}
      </div>

      {/* Phase 2: Dev Panel for simulation testing */}
      <DevPanel onEventCreated={() => setRefreshKey(k => k + 1)} />

      {/* Create Event Modal */}
      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(event) => {
            setShowCreateModal(false);
            setSelectedEvent(event);
          }}
        />
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          eventId={selectedEvent.id}
          circleId={selectedEvent.circleId || currentCircleId}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

export default App;
