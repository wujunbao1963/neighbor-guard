import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCircle } from '../context/CircleContext';
import { homeAPI, zoneAPI, circleAPI } from '../services/api';

// Role labels
const ROLE_LABELS = {
  OWNER: '屋主',
  HOUSEHOLD: '同住人',
  NEIGHBOR: '邻居',
  RELATIVE: '亲友'
};

// Role options for adding members
const ROLE_OPTIONS = [
  { value: 'HOUSEHOLD', label: '同住人' },
  { value: 'NEIGHBOR', label: '邻居' },
  { value: 'RELATIVE', label: '亲友' }
];

export default function SettingsPage() {
  const { user, updateProfile, refreshCircles } = useAuth();
  const { currentCircle, home, zones, canEdit, isOwner, refreshHome, refreshZones, refreshCircle } = useCircle();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingHome, setEditingHome] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const [homeForm, setHomeForm] = useState({
    displayName: home?.displayName || '',
    addressLine1: home?.addressLine1 || '',
    city: home?.city || ''
  });

  // Member management state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('NEIGHBOR');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Update form when home changes
  useEffect(() => {
    if (home) {
      setHomeForm({
        displayName: home.displayName || '',
        addressLine1: home.addressLine1 || '',
        city: home.city || ''
      });
    }
  }, [home]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName, phone });
      setEditingProfile(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHome = async () => {
    if (!currentCircle) return;
    setSaving(true);
    try {
      await homeAPI.update(currentCircle.id, homeForm);
      await refreshHome();
      await refreshCircle(); // Refresh current circle details
      await refreshCircles(); // Refresh circles list (for dropdown)
      setEditingHome(false);
    } catch (err) {
      alert(err.response?.data?.error?.message || '保存失败');
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
      alert(err.response?.data?.error?.message || '更新失败');
    }
  };

  // Add member
  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      setMemberError('请输入邮箱');
      return;
    }
    
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail.trim())) {
      setMemberError('请输入有效的邮箱地址');
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
      setMemberError(err.response?.data?.error?.message || '添加成员失败');
    } finally {
      setAddingMember(false);
    }
  };

  // Remove member
  const handleRemoveMember = async (memberId, memberName) => {
    if (!confirm(`确定要移除 ${memberName} 吗？`)) return;
    
    try {
      await circleAPI.removeMember(currentCircle.id, memberId);
      await refreshCircle();
    } catch (err) {
      alert(err.response?.data?.error?.message || '移除成员失败');
    }
  };

  const tabs = [
    { id: 'profile', label: '👤 个人' },
    { id: 'home', label: '🏠 房屋' },
    { id: 'zones', label: '📍 防区' },
    { id: 'members', label: '👥 成员' }
  ];

  // Filter tabs based on role - only OWNER and HOUSEHOLD can see home tab
  const visibleTabs = tabs.filter(tab => {
    if (tab.id === 'home') {
      return canEdit; // Only OWNER and HOUSEHOLD
    }
    return true;
  });

  return (
    <div style={{ paddingBottom: '24px' }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>设置</h1>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid #e5e7eb', 
        padding: '0 16px',
        overflowX: 'auto'
      }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 16px',
              borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent',
              marginBottom: '-1px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? '#667eea' : '#6b7280',
              fontWeight: activeTab === tab.id ? '600' : '400',
              whiteSpace: 'nowrap',
              fontSize: '14px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontWeight: '500' }}>个人信息</h2>
              {!editingProfile ? (
                <button onClick={() => setEditingProfile(true)} style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer' }}>
                  编辑
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setEditingProfile(false)} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
                    取消
                  </button>
                  <button onClick={handleSaveProfile} disabled={saving} style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500' }}>
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>邮箱</label>
                <p>{user?.email}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>昵称</label>
                {editingProfile ? (
                  <input type="text" className="form-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                ) : (
                  <p>{user?.displayName}</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>电话</label>
                {editingProfile ? (
                  <input type="tel" className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="可选" />
                ) : (
                  <p>{user?.phone || '未设置'}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Home Tab - Only visible to OWNER and HOUSEHOLD */}
        {activeTab === 'home' && canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!currentCircle ? (
              <p style={{ color: '#6b7280' }}>请先选择一个圈子</p>
            ) : (
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontWeight: '500' }}>房屋信息</h2>
                  {!editingHome ? (
                    <button
                      onClick={() => {
                        setHomeForm({
                          displayName: home?.displayName || '',
                          addressLine1: home?.addressLine1 || '',
                          city: home?.city || ''
                        });
                        setEditingHome(true);
                      }}
                      style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      编辑
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => setEditingHome(false)} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>取消</button>
                      <button onClick={handleSaveHome} disabled={saving} style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500' }}>
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>名称</label>
                    {editingHome ? (
                      <input type="text" className="form-input" value={homeForm.displayName} onChange={(e) => setHomeForm(f => ({ ...f, displayName: e.target.value }))} />
                    ) : (
                      <p>{home?.displayName}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>房屋类型</label>
                    <p>
                      {home?.houseType === 'DETACHED' && '独立屋'}
                      {home?.houseType === 'SEMI' && '半独立屋'}
                      {home?.houseType === 'ROW' && '联排屋'}
                      {home?.houseType === 'APARTMENT' && '公寓'}
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>地址</label>
                    {editingHome ? (
                      <input type="text" className="form-input" value={homeForm.addressLine1} onChange={(e) => setHomeForm(f => ({ ...f, addressLine1: e.target.value }))} />
                    ) : (
                      <p>{home?.addressLine1 || '未设置'}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>城市</label>
                    {editingHome ? (
                      <input type="text" className="form-input" value={homeForm.city} onChange={(e) => setHomeForm(f => ({ ...f, city: e.target.value }))} />
                    ) : (
                      <p>{home?.city || '未设置'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Zones Tab */}
        {activeTab === 'zones' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!currentCircle ? (
              <p style={{ color: '#6b7280' }}>请先选择一个圈子</p>
            ) : (
              <>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>
                  启用的防区可以在创建事件时选择
                  {!canEdit && '（只有屋主和同住人可以修改）'}
                </p>
                
                <div className="card" style={{ overflow: 'hidden' }}>
                  {zones.map((zone, idx) => (
                    <div key={zone.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '16px',
                      borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{zone.icon || '📍'}</span>
                        <div>
                          <p style={{ fontWeight: '500' }}>{zone.displayName}</p>
                          <p style={{ fontSize: '12px', color: '#6b7280' }}>{zone.zoneGroup}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleZone(zone)}
                        disabled={!canEdit}
                        className="toggle-switch"
                        style={{
                          background: zone.isEnabled ? '#667eea' : '#e5e7eb',
                          opacity: !canEdit ? 0.5 : 1,
                          cursor: canEdit ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <div className="toggle-thumb" style={{
                          transform: zone.isEnabled ? 'translateX(24px)' : 'translateX(0)'
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!currentCircle ? (
              <p style={{ color: '#6b7280' }}>请先选择一个圈子</p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#6b7280' }}>
                    圈子成员可以查看和参与事件讨论
                  </p>
                  {isOwner && !showAddMember && (
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowAddMember(true)}
                      style={{ padding: '8px 16px', fontSize: '14px' }}
                    >
                      + 添加成员
                    </button>
                  )}
                </div>

                {/* Add Member Form */}
                {isOwner && showAddMember && (
                  <div className="card" style={{ padding: '16px' }}>
                    <h3 style={{ fontWeight: '500', marginBottom: '12px' }}>添加新成员</h3>
                    
                    {memberError && (
                      <div style={{ 
                        padding: '8px 12px', 
                        background: '#fee2e2', 
                        color: '#dc2626', 
                        borderRadius: '6px',
                        marginBottom: '12px',
                        fontSize: '14px'
                      }}>
                        {memberError}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                          邮箱地址 *
                        </label>
                        <input
                          type="email"
                          className="form-input"
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                          placeholder="member@example.com"
                          disabled={addingMember}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                          角色
                        </label>
                        <select
                          className="form-select"
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value)}
                          disabled={addingMember}
                        >
                          {ROLE_OPTIONS.map(role => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={handleAddMember}
                          disabled={addingMember || !newMemberEmail.trim()}
                        >
                          {addingMember ? '添加中...' : '添加'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setShowAddMember(false);
                            setNewMemberEmail('');
                            setNewMemberRole('NEIGHBOR');
                            setMemberError('');
                          }}
                          disabled={addingMember}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Members List */}
                <div className="card" style={{ overflow: 'hidden' }}>
                  {currentCircle.members?.map((member, idx) => (
                    <div key={member.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '16px',
                      borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          background: '#f3f4f6', 
                          borderRadius: '50%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center'
                        }}>
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                          ) : (
                            <span style={{ color: '#6b7280' }}>{member.displayName?.[0]}</span>
                          )}
                        </div>
                        <div>
                          <p style={{ fontWeight: '500' }}>{member.displayName}</p>
                          <p style={{ fontSize: '12px', color: '#6b7280' }}>{member.email}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="badge" style={{ background: '#f3f4f6', color: '#374151' }}>
                          {ROLE_LABELS[member.role] || member.role}
                        </span>
                        {/* Remove button - only for owner, can't remove self or other owner */}
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
                            移除
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
