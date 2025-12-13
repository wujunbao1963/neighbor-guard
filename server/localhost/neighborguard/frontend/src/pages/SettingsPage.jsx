import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { homeAPI, zoneAPI, circleAPI, integrationAPI, sensorAPI } from '../services/api';

// ============================================================================
// CONSTANTS
// ============================================================================

const MEMBER_ROLES = {
  OWNER: 'Owner',
  HOUSEHOLD: 'Household',
  NEIGHBOR: 'Neighbor',
  RELATIVE: 'Family/Friend',
  OBSERVER: 'Observer'
};

const ROLE_OPTIONS = [
  { value: 'HOUSEHOLD', label: 'Household' },
  { value: 'NEIGHBOR', label: 'Neighbor' },
  { value: 'RELATIVE', label: 'Family/Friend' }
];

const HOUSE_MODES = [
  { value: 'DISARMED', label: 'Disarmed', icon: '🔓', color: '#22c55e', desc: 'All alerts off' },
  { value: 'HOME', label: 'Home', icon: '🏠', color: '#3b82f6', desc: 'Perimeter protection on' },
  { value: 'AWAY', label: 'Away', icon: '🛡️', color: '#f59e0b', desc: 'Full protection enabled' },
  { value: 'NIGHT', label: 'Night', icon: '🌙', color: '#8b5cf6', desc: 'Enhanced night mode' },
];

const EVENT_SEVERITY = {
  HIGH: { label: 'High', color: '#ef4444', desc: 'Break-in, perimeter damage' },
  MEDIUM: { label: 'Medium', color: '#f59e0b', desc: 'Suspicious activity' },
  LOW: { label: 'Low', color: '#64748b', desc: 'Package, unusual noise' }
};

const SENSOR_TYPES = {
  DOOR_CONTACT: { label: 'Door Contact', icon: '🚪' },
  PIR: { label: 'PIR Motion', icon: '👁️' },
  GLASS_BREAK: { label: 'Glass Break', icon: '🪟' },
  VIBRATION: { label: 'Vibration', icon: '📳' },
  SMOKE: { label: 'Smoke', icon: '🔥' },
  WATER_LEAK: { label: 'Water Leak', icon: '💧' },
  OTHER: { label: 'Other', icon: '📡' }
};

const SENSOR_STATUS = {
  ONLINE: { label: 'Online', color: '#22c55e' },
  OFFLINE: { label: 'Offline', color: '#ef4444' },
  LOW_BATTERY: { label: 'Low Battery', color: '#f59e0b' },
  UNKNOWN: { label: 'Unknown', color: '#6b7280' }
};

// ============================================================================
// STYLES
// ============================================================================
const styles = {
  page: {
    background: '#f2f2f7',
    minHeight: '100vh',
    paddingBottom: '24px'
  },
  header: {
    padding: '16px 16px 8px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937'
  },
  circleCard: {
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    borderRadius: '12px',
    padding: '12px 16px',
    color: 'white',
    margin: '0 16px 16px'
  },
  sectionLabel: {
    padding: '8px 16px',
    fontSize: '13px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  menuGroup: {
    margin: '0 16px',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: '24px'
  },
  menuItem: (isLast) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'white',
    cursor: 'pointer',
    borderBottom: isLast ? 'none' : '1px solid #f0f0f0'
  }),
  subHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 0'
  },
  subTitle: {
    marginLeft: 'auto',
    marginRight: 'auto',
    fontWeight: '600',
    fontSize: '17px',
    color: '#1f2937'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: '16px'
  },
  row: (isLast) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: isLast ? 'none' : '1px solid #f0f0f0'
  }),
  toggle: (active) => ({
    width: '44px',
    height: '24px',
    background: active ? '#667eea' : '#e5e7eb',
    borderRadius: '12px',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
    border: 'none'
  }),
  toggleKnob: (active) => ({
    position: 'absolute',
    top: '2px',
    left: active ? '22px' : '2px',
    width: '20px',
    height: '20px',
    background: 'white',
    borderRadius: '50%',
    transition: 'left 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  }),
  infoBox: {
    padding: '12px',
    background: '#f0f9ff',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#0369a1',
    marginBottom: '16px'
  },
  dangerButton: {
    width: '100%',
    padding: '14px',
    background: 'white',
    border: 'none',
    borderRadius: '12px',
    color: '#ef4444',
    fontSize: '16px',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginTop: '24px'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth();
  const { currentCircle, currentCircleId, home, zones, canEdit, isOwner, refreshHome, refreshZones, refreshCircle } = useCircle();

  // Navigation state
  const [settingsTab, setSettingsTab] = useState('menu');

  // Form states
  const [saving, setSaving] = useState(false);

  // Night mode settings (local state for editing)
  const [nightModeSettings, setNightModeSettings] = useState({
    nightModeAuto: false,
    nightModeStart: '22:00',
    nightModeEnd: '06:00',
    nightModeHighOnly: false
  });

  // Notification preferences (current user's own)
  const [myNotifyPrefs, setMyNotifyPrefs] = useState({
    high: true,
    medium: true,
    low: false
  });

  // Integrations and Sensors
  const [integrations, setIntegrations] = useState([]);
  const [sensors, setSensors] = useState([]);

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('NEIGHBOR');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Add integration state
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [newIntegrationName, setNewIntegrationName] = useState('');

  // Sensor editing state (Phase 2)
  const [editingSensor, setEditingSensor] = useState(null);
  const [sensorForm, setSensorForm] = useState({ name: '', sensorType: '', zoneId: '', isEnabled: true });

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Sync home settings when home data changes
  useEffect(() => {
    if (home) {
      setNightModeSettings({
        nightModeAuto: home.nightModeAuto || false,
        nightModeStart: home.nightModeStart || '22:00',
        nightModeEnd: home.nightModeEnd || '06:00',
        nightModeHighOnly: home.nightModeHighOnly || false
      });
    }
  }, [home]);

  // Load integrations and sensors
  useEffect(() => {
    if (currentCircle?.id && canEdit) {
      loadIntegrations();
      loadSensors();
    }
  }, [currentCircle?.id, canEdit]);

  // ============================================================================
  // API CALLS
  // ============================================================================

  const loadIntegrations = async () => {
    if (!currentCircle) return;
    try {
      const res = await integrationAPI.getAll(currentCircle.id);
      setIntegrations(res.data.integrations || []);
    } catch (err) {
      console.error('Failed to load integrations:', err);
    }
  };

  const loadSensors = async () => {
    if (!currentCircle) return;
    try {
      const res = await sensorAPI.getAll(currentCircle.id);
      setSensors(res.data.sensors || []);
    } catch (err) {
      console.error('Failed to load sensors:', err);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleChangeMode = async (newMode) => {
    if (!currentCircle) return;
    setSaving(true);
    try {
      await homeAPI.updateMode(currentCircle.id, newMode);
      await refreshHome();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to change mode');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNightMode = async () => {
    if (!currentCircle) return;
    setSaving(true);
    try {
      await homeAPI.updateNightMode(currentCircle.id, nightModeSettings);
      await refreshHome();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleZone = async (zone) => {
    if (!canEdit || !currentCircle) return;
    try {
      await zoneAPI.update(currentCircle.id, zone.id, { isEnabled: !zone.isEnabled });
      await refreshZones();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update');
    }
  };

  const handleAddIntegration = async () => {
    if (!newIntegrationName.trim() || !currentCircle) return;
    setSaving(true);
    try {
      await integrationAPI.create(currentCircle.id, {
        name: newIntegrationName.trim(),
        type: 'HOME_ASSISTANT'
      });
      await loadIntegrations();
      setNewIntegrationName('');
      setShowAddIntegration(false);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to add integration');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIntegration = async (integrationId, name) => {
    if (!confirm(`Delete integration "${name}"? All linked sensors will also be removed.`)) return;
    try {
      await integrationAPI.delete(currentCircle.id, integrationId);
      await loadIntegrations();
      await loadSensors();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete');
    }
  };

  const handleCopyWebhook = (url) => {
    navigator.clipboard.writeText(url);
    alert('Webhook URL copied to clipboard');
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      setMemberError('Please enter an email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail.trim())) {
      setMemberError('Please enter a valid email');
      return;
    }
    setAddingMember(true);
    setMemberError('');
    try {
      await circleAPI.addMember(currentCircle.id, {
        email: newMemberEmail.trim(),
        role: newMemberRole
      });
      await refreshCircle();
      setNewMemberEmail('');
      setNewMemberRole('NEIGHBOR');
      setShowAddMember(false);
    } catch (err) {
      setMemberError(err.response?.data?.error?.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!confirm(`Remove ${memberName} from this circle?`)) return;
    try {
      await circleAPI.removeMember(currentCircle.id, memberId);
      await refreshCircle();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to remove member');
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const currentModeInfo = HOUSE_MODES.find(m => m.value === home?.houseMode) || HOUSE_MODES[0];
  const enabledZonesCount = zones.filter(z => z.isEnabled).length;

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  // Sub-page header with back button
  const renderSubHeader = (title, groupName) => (
    <div style={styles.subHeader}>
      <button onClick={() => setSettingsTab('menu')} style={styles.backButton}>
        ‹ {groupName || 'Settings'}
      </button>
      <span style={styles.subTitle}>{title}</span>
      <div style={{ width: '60px' }} />
    </div>
  );

  // Toggle switch component
  const Toggle = ({ active, onToggle }) => (
    <button style={styles.toggle(active)} onClick={onToggle}>
      <div style={styles.toggleKnob(active)} />
    </button>
  );

  // ============================================================================
  // RENDER: Main Menu
  // ============================================================================
  const renderMenu = () => {
    const menuSections = [
      {
        group: 'ACCOUNT',
        items: [
          { id: 'profile', label: 'Profile', icon: '👤' },
          { id: 'myprefs', label: 'My Preferences', icon: '🔔', subtitle: 'Notifications for this circle' },
        ]
      },
      {
        group: 'HOME',
        show: canEdit,
        items: [
          { id: 'home', label: 'Home Info', icon: '🏠' },
          { id: 'mode', label: 'Mode', icon: '🛡️', subtitle: currentModeInfo.label },
          { id: 'zones', label: 'Zones', icon: '📍', subtitle: `${enabledZonesCount} active` },
        ]
      },
      {
        group: 'DEVICES',
        show: canEdit,
        items: [
          { id: 'sensors', label: 'Sensors', icon: '📡', subtitle: `${sensors.length} connected` },
          { id: 'integrations', label: 'Integrations', icon: '🔗', subtitle: `${integrations.length} configured` },
        ]
      },
      {
        group: 'CIRCLE',
        items: [
          { id: 'members', label: 'Members', icon: '👥', subtitle: `${currentCircle?.members?.length || 0} members` },
        ]
      }
    ];

    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Settings</h1>
        </div>

        {/* Current Circle Card */}
        {currentCircle && (
          <div style={styles.circleCard}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Current Circle</div>
            <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '2px' }}>
              🏠 {currentCircle.displayName}
            </div>
          </div>
        )}

        {/* Menu Sections */}
        {menuSections.filter(s => s.show !== false).map(section => (
          <div key={section.group}>
            <div style={styles.sectionLabel}>{section.group}</div>
            <div style={styles.menuGroup}>
              {section.items.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setSettingsTab(item.id)}
                  style={styles.menuItem(idx === section.items.length - 1)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '16px', color: '#1f2937' }}>{item.label}</div>
                      {item.subtitle && (
                        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#c7c7cc', fontSize: '20px' }}>›</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================================================
  // RENDER: Profile Sub-page
  // ============================================================================
  const renderProfile = () => (
    <div style={styles.page}>
      {renderSubHeader('Profile', 'Account')}
      <div style={{ padding: '16px' }}>
        <div style={styles.card}>
          <div style={styles.row(false)}>
            <span style={{ color: '#1f2937' }}>Display Name</span>
            <span style={{ color: '#6b7280' }}>{user?.displayName}</span>
          </div>
          <div style={styles.row(true)}>
            <span style={{ color: '#1f2937' }}>Email</span>
            <span style={{ color: '#6b7280' }}>{user?.email}</span>
          </div>
        </div>

        <button style={styles.dangerButton} onClick={logout}>
          Log Out
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: My Preferences Sub-page
  // ============================================================================
  const renderMyPrefs = () => (
    <div style={styles.page}>
      {renderSubHeader('My Preferences', 'Account')}
      <div style={{ padding: '16px' }}>
        {/* Circle context */}
        <div style={{ ...styles.card, padding: '14px 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Settings for</div>
          <div style={{ fontWeight: '600', marginTop: '2px' }}>🏠 {currentCircle?.displayName}</div>
        </div>

        <div style={styles.sectionLabel}>Notification Preferences</div>

        <div style={styles.card}>
          {Object.entries(EVENT_SEVERITY).map(([key, info], idx, arr) => (
            <div key={key} style={styles.row(idx === arr.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: info.color }} />
                <div>
                  <div style={{ color: '#1f2937' }}>{info.label} Severity</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>{info.desc}</div>
                </div>
              </div>
              <Toggle
                active={myNotifyPrefs[key.toLowerCase()]}
                onToggle={() => setMyNotifyPrefs(prev => ({ ...prev, [key.toLowerCase()]: !prev[key.toLowerCase()] }))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Home Info Sub-page
  // ============================================================================
  const renderHomeInfo = () => (
    <div style={styles.page}>
      {renderSubHeader('Home Info', 'Home')}
      <div style={{ padding: '16px' }}>
        <div style={styles.sectionLabel}>Basic Information</div>
        <div style={styles.card}>
          <div style={styles.row(false)}>
            <span style={{ color: '#1f2937' }}>Name</span>
            <span style={{ color: '#6b7280' }}>{home?.displayName}</span>
          </div>
          <div style={styles.row(false)}>
            <span style={{ color: '#1f2937' }}>House Type</span>
            <span style={{ color: '#6b7280' }}>
              {home?.houseType === 'DETACHED' && 'Detached House'}
              {home?.houseType === 'SEMI' && 'Semi-Detached'}
              {home?.houseType === 'ROW' && 'Row House'}
              {home?.houseType === 'APARTMENT' && 'Apartment'}
            </span>
          </div>
          <div style={styles.row(true)}>
            <span style={{ color: '#1f2937' }}>Address</span>
            <span style={{ color: '#6b7280' }}>{home?.addressLine1 || 'Not set'}</span>
          </div>
        </div>

        <div style={styles.sectionLabel}>Night Mode Automation</div>
        <div style={styles.card}>
          <div style={styles.row(false)}>
            <div>
              <div style={{ color: '#1f2937' }}>Auto Night Mode</div>
              <div style={{ fontSize: '13px', color: '#9ca3af' }}>Switch automatically</div>
            </div>
            <Toggle
              active={nightModeSettings.nightModeAuto}
              onToggle={() => setNightModeSettings(prev => ({ ...prev, nightModeAuto: !prev.nightModeAuto }))}
            />
          </div>

          {nightModeSettings.nightModeAuto && (
            <div style={styles.row(false)}>
              <span style={{ color: '#1f2937' }}>Schedule</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="time"
                  value={nightModeSettings.nightModeStart}
                  onChange={(e) => setNightModeSettings(prev => ({ ...prev, nightModeStart: e.target.value }))}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                />
                <span style={{ color: '#9ca3af' }}>to</span>
                <input
                  type="time"
                  value={nightModeSettings.nightModeEnd}
                  onChange={(e) => setNightModeSettings(prev => ({ ...prev, nightModeEnd: e.target.value }))}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                />
              </div>
            </div>
          )}

          <div style={styles.row(true)}>
            <div>
              <div style={{ color: '#1f2937' }}>Quiet Night Mode</div>
              <div style={{ fontSize: '13px', color: '#9ca3af' }}>High severity only at night</div>
            </div>
            <Toggle
              active={nightModeSettings.nightModeHighOnly}
              onToggle={() => setNightModeSettings(prev => ({ ...prev, nightModeHighOnly: !prev.nightModeHighOnly }))}
            />
          </div>
        </div>

        <button
          onClick={handleSaveNightMode}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            background: '#667eea',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
            marginTop: '16px'
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Mode Sub-page
  // ============================================================================
  const renderMode = () => (
    <div style={styles.page}>
      {renderSubHeader('Mode', 'Home')}
      <div style={{ padding: '16px' }}>
        <div style={styles.card}>
          {HOUSE_MODES.map((mode, idx) => (
            <div
              key={mode.value}
              onClick={() => !saving && handleChangeMode(mode.value)}
              style={{
                ...styles.row(idx === HOUSE_MODES.length - 1),
                cursor: saving ? 'wait' : 'pointer',
                background: home?.houseMode === mode.value ? `${mode.color}08` : 'white'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>{mode.icon}</span>
                <div>
                  <div style={{ color: '#1f2937', fontWeight: home?.houseMode === mode.value ? '600' : '400' }}>
                    {mode.label}
                  </div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>{mode.desc}</div>
                </div>
              </div>
              {home?.houseMode === mode.value && (
                <span style={{ color: mode.color, fontSize: '20px' }}>✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Zones Sub-page
  // ============================================================================
  const renderZones = () => (
    <div style={styles.page}>
      {renderSubHeader('Zones', 'Home')}
      <div style={{ padding: '16px' }}>
        <div style={styles.infoBox}>
          💡 Toggle zones on/off. Enabled zones can be linked to sensors and selected when creating events.
        </div>

        <div style={styles.card}>
          {zones.map((zone, idx) => (
            <div key={zone.id} style={styles.row(idx === zones.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>{zone.icon || '📍'}</span>
                <div>
                  <div style={{ color: '#1f2937' }}>{zone.displayName}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>{zone.zoneGroup}</div>
                </div>
              </div>
              <Toggle active={zone.isEnabled} onToggle={() => handleToggleZone(zone)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Sensors Sub-page
  // ============================================================================
  const renderSensors = () => {
    const handleEditSensor = (sensor) => {
      setEditingSensor(sensor.id);
      setSensorForm({
        name: sensor.name,
        sensorType: sensor.sensorType,
        zoneId: sensor.zone?.id || '',
        isEnabled: sensor.isEnabled
      });
    };

    const handleSaveSensor = async (sensorId) => {
      setSaving(true);
      try {
        await sensorAPI.update(currentCircleId, sensorId, {
          name: sensorForm.name,
          sensorType: sensorForm.sensorType,
          zoneId: sensorForm.zoneId || null,
          isEnabled: sensorForm.isEnabled
        });
        await loadSensors();
        setEditingSensor(null);
      } catch (err) {
        alert(err.response?.data?.error?.message || 'Failed to update sensor');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div style={styles.page}>
        {renderSubHeader('Sensors', 'Devices')}
        <div style={{ padding: '16px' }}>
          <div style={styles.infoBox}>
            💡 Sensors are auto-created when Home Assistant sends events. 
            <strong> Assign each sensor to a zone</strong> for the fusion engine to work correctly.
          </div>

          {sensors.length === 0 ? (
            <div style={{ ...styles.card, padding: '24px', textAlign: 'center', color: '#6b7280' }}>
              No sensors yet. Configure an integration first and trigger some events.
            </div>
          ) : (
            <div style={styles.card}>
              {sensors.map((sensor, idx) => (
                <div key={sensor.id} style={{
                  ...styles.row(idx === sensors.length - 1),
                  flexDirection: 'column',
                  alignItems: 'stretch'
                }}>
                  {editingSensor === sensor.id ? (
                    // Edit mode
                    <div style={{ padding: '8px 0' }}>
                      <input
                        type="text"
                        value={sensorForm.name}
                        onChange={(e) => setSensorForm({ ...sensorForm, name: e.target.value })}
                        placeholder="Sensor name"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <select
                          value={sensorForm.sensorType}
                          onChange={(e) => setSensorForm({ ...sensorForm, sensorType: e.target.value })}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px'
                          }}
                        >
                          {Object.entries(SENSOR_TYPES).map(([key, val]) => (
                            <option key={key} value={key}>{val.icon} {val.label}</option>
                          ))}
                        </select>
                        <select
                          value={sensorForm.zoneId}
                          onChange={(e) => setSensorForm({ ...sensorForm, zoneId: e.target.value })}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            background: sensorForm.zoneId ? 'white' : '#fef3c7'
                          }}
                        >
                          <option value="">⚠️ No Zone (required!)</option>
                          {zones.map(zone => (
                            <option key={zone.id} value={zone.id}>
                              {zone.icon} {zone.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={sensorForm.isEnabled}
                            onChange={(e) => setSensorForm({ ...sensorForm, isEnabled: e.target.checked })}
                          />
                          Enabled
                        </label>
                        <button
                          onClick={() => handleSaveSensor(sensor.id)}
                          disabled={saving}
                          style={{
                            padding: '8px 16px',
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingSensor(null)}
                          style={{
                            padding: '8px 16px',
                            background: '#f3f4f6',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div 
                      onClick={() => handleEditSensor(sensor)}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: 'pointer',
                        padding: '4px 0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: sensor.isEnabled 
                            ? (SENSOR_STATUS[sensor.status]?.color || '#6b7280')
                            : '#d1d5db'
                        }} />
                        <div>
                          <div style={{ 
                            color: sensor.isEnabled ? '#1f2937' : '#9ca3af',
                            textDecoration: sensor.isEnabled ? 'none' : 'line-through'
                          }}>
                            {SENSOR_TYPES[sensor.sensorType]?.icon} {sensor.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                            {SENSOR_TYPES[sensor.sensorType]?.label || sensor.sensorType}
                            {sensor.zone ? (
                              <span style={{ color: '#059669' }}> · {sensor.zone.icon} {sensor.zone.displayName}</span>
                            ) : (
                              <span style={{ color: '#dc2626', fontWeight: '500' }}> · ⚠️ No zone assigned!</span>
                            )}
                          </div>
                          {sensor.lastState && (
                            <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '2px' }}>
                              Last: {sensor.lastState} · {sensor.lastStateAt ? new Date(sensor.lastStateAt).toLocaleString() : 'Never'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${SENSOR_STATUS[sensor.status]?.color}20`,
                          color: SENSOR_STATUS[sensor.status]?.color
                        }}>
                          {SENSOR_STATUS[sensor.status]?.label || sensor.status}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: '18px' }}>›</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
              SENSOR STATUS
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
              {Object.entries(SENSOR_STATUS).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: val.color }} />
                  <span>{val.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER: Integrations Sub-page
  // ============================================================================
  const renderIntegrations = () => (
    <div style={styles.page}>
      {renderSubHeader('Integrations', 'Devices')}
      <div style={{ padding: '16px' }}>
        {/* Add Integration */}
        {!showAddIntegration ? (
          <button
            onClick={() => setShowAddIntegration(true)}
            style={{
              width: '100%',
              padding: '14px',
              background: '#667eea',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '16px',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            + Add Integration
          </button>
        ) : (
          <div style={{ ...styles.card, padding: '16px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Integration name (e.g., Home Assistant)"
              value={newIntegrationName}
              onChange={(e) => setNewIntegrationName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                marginBottom: '12px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddIntegration}
                disabled={saving || !newIntegrationName.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#667eea',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAddIntegration(false); setNewIntegrationName(''); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Integrations List */}
        {integrations.length === 0 ? (
          <div style={{ ...styles.card, padding: '24px', textAlign: 'center', color: '#6b7280' }}>
            No integrations configured yet.
          </div>
        ) : (
          integrations.map(integration => (
            <div key={integration.id} style={{ ...styles.card, padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#1f2937' }}>{integration.name}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                    {integration.type} · {integration.deviceCount} devices
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteIntegration(integration.id, integration.name)}
                  style={{
                    padding: '4px 12px',
                    background: 'none',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    color: '#ef4444',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Webhook URL */}
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Webhook URL</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <code style={{
                    flex: 1,
                    fontSize: '11px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#374151'
                  }}>
                    {integration.webhookUrl}
                  </code>
                  <button
                    onClick={() => handleCopyWebhook(integration.webhookUrl)}
                    style={{
                      padding: '6px 12px',
                      background: '#667eea',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Members Sub-page
  // ============================================================================
  const renderMembers = () => (
    <div style={styles.page}>
      {renderSubHeader('Members', 'Circle')}
      <div style={{ padding: '16px' }}>
        {/* Add Member (Owner only) */}
        {isOwner && !showAddMember && (
          <button
            onClick={() => setShowAddMember(true)}
            style={{
              width: '100%',
              padding: '14px',
              background: '#667eea',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '16px',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            + Add Member
          </button>
        )}

        {isOwner && showAddMember && (
          <div style={{ ...styles.card, padding: '16px', marginBottom: '16px' }}>
            {memberError && (
              <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', marginBottom: '12px', fontSize: '14px' }}>
                {memberError}
              </div>
            )}
            <input
              type="email"
              placeholder="Email address"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '16px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '16px', marginBottom: '12px', boxSizing: 'border-box' }}
            >
              {ROLE_OPTIONS.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddMember}
                disabled={addingMember}
                style={{ flex: 1, padding: '12px', background: '#667eea', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}
              >
                {addingMember ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAddMember(false); setNewMemberEmail(''); setMemberError(''); }}
                style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Members List */}
        <div style={styles.card}>
          {currentCircle?.members?.map((member, idx) => (
            <div key={member.id} style={styles.row(idx === currentCircle.members.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px'
                }}>
                  {member.displayName?.[0] || '?'}
                </div>
                <div>
                  <div style={{ color: '#1f2937' }}>{member.displayName}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>{member.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  color: '#374151'
                }}>
                  {MEMBER_ROLES[member.role] || member.role}
                </span>
                {isOwner && member.role !== 'OWNER' && (
                  <button
                    onClick={() => handleRemoveMember(member.id, member.displayName)}
                    style={{
                      padding: '4px 8px',
                      background: 'none',
                      border: '1px solid #ef4444',
                      borderRadius: '4px',
                      color: '#ef4444',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (!currentCircle) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Please select a circle first.
      </div>
    );
  }

  // Route to appropriate sub-page
  switch (settingsTab) {
    case 'profile': return renderProfile();
    case 'myprefs': return renderMyPrefs();
    case 'home': return renderHomeInfo();
    case 'mode': return renderMode();
    case 'zones': return renderZones();
    case 'sensors': return renderSensors();
    case 'integrations': return renderIntegrations();
    case 'members': return renderMembers();
    default: return renderMenu();
  }
}
