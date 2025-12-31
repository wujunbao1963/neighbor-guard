import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../services/api';

// Role labels
const ADMIN_ROLE_LABELS = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员'
};

const MEMBER_ROLE_LABELS = {
  OWNER: '屋主',
  HOUSEHOLD: '同住人',
  NEIGHBOR: '邻居',
  RELATIVE: '亲友'
};

const HOUSE_TYPE_OPTIONS = [
  { value: 'DETACHED', label: '独立屋' },
  { value: 'SEMI', label: '半独立屋' },
  { value: 'ROW', label: '联排屋' },
  { value: 'APARTMENT', label: '公寓' }
];

export default function AdminPage() {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Admin info
  const [adminInfo, setAdminInfo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  // Users state
  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState('all'); // all, owners, noCircle
  
  // Make homeowner dialog
  const [showMakeHomeowner, setShowMakeHomeowner] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [homeownerForm, setHomeownerForm] = useState({
    homeName: '',
    houseType: 'DETACHED',
    city: ''
  });
  
  // Admins state
  const [admins, setAdmins] = useState([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Check admin status on mount
  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getMe();
      setAdminInfo(response.data.admin);
      setIsAdmin(true);
      setIsSuperAdmin(response.data.admin.adminRole === 'SUPER_ADMIN');
      
      // Load initial data
      await loadUsers();
      if (response.data.admin.adminRole === 'SUPER_ADMIN') {
        await loadAdmins();
      }
    } catch (err) {
      setIsAdmin(false);
      setError('您没有管理员权限');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await adminAPI.getUsers();
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadAdmins = async () => {
    try {
      const response = await adminAPI.getAdmins();
      setAdmins(response.data.admins || []);
    } catch (err) {
      console.error('Failed to load admins:', err);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Open make homeowner dialog
  const openMakeHomeowner = (user) => {
    setSelectedUser(user);
    setHomeownerForm({
      homeName: `${user.displayName}的家`,
      houseType: 'DETACHED',
      city: ''
    });
    setShowMakeHomeowner(true);
  };

  // Make user a homeowner
  const handleMakeHomeowner = async () => {
    if (!selectedUser) return;
    
    setSubmitting(true);
    try {
      await adminAPI.makeHomeowner(selectedUser.id, homeownerForm);
      await loadUsers();
      setShowMakeHomeowner(false);
      setSelectedUser(null);
      showMessage('success', `${selectedUser.displayName} 已设为屋主`);
    } catch (err) {
      showMessage('error', err.response?.data?.error?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Add admin
  const handleAddAdmin = async () => {
    if (!selectedUserId) {
      showMessage('error', '请选择用户');
      return;
    }
    
    setSubmitting(true);
    try {
      await adminAPI.addAdmin(selectedUserId);
      await loadAdmins();
      await loadUsers();
      setSelectedUserId('');
      setShowAddAdmin(false);
      showMessage('success', '已设置为管理员');
    } catch (err) {
      showMessage('error', err.response?.data?.error?.message || '设置失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove admin
  const handleRemoveAdmin = async (userId, email) => {
    if (!confirm(`确定要取消 ${email} 的管理员权限吗？`)) return;
    
    try {
      await adminAPI.removeAdmin(userId);
      await loadAdmins();
      await loadUsers();
      showMessage('success', '已取消管理员权限');
    } catch (err) {
      showMessage('error', err.response?.data?.error?.message || '操作失败');
    }
  };

  // Delete user
  const handleDeleteUser = async (user) => {
    const warning = user.isOwner 
      ? `⚠️ 该用户是屋主，删除后将同时删除其房屋、圈子和所有相关数据！\n\n确定要删除 ${user.displayName} (${user.email}) 吗？`
      : `确定要删除用户 ${user.displayName} (${user.email}) 吗？`;
    
    if (!confirm(warning)) return;
    
    try {
      await adminAPI.deleteUser(user.id);
      await loadUsers();
      if (isSuperAdmin) {
        await loadAdmins();
      }
      showMessage('success', `用户 ${user.email} 已删除`);
    } catch (err) {
      showMessage('error', err.response?.data?.error?.message || '删除失败');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p>加载中...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>🔒 无权限访问</h1>
        <p style={{ color: '#6b7280' }}>您没有管理员权限，无法访问此页面。</p>
      </div>
    );
  }

  const tabs = [
    { id: 'users', label: '👥 用户管理' },
    ...(isSuperAdmin ? [{ id: 'admins', label: '👑 管理员' }] : [])
  ];

  // Filter users
  const filteredUsers = users.filter(u => {
    if (userFilter === 'owners') return u.isOwner;
    if (userFilter === 'noCircle') return !u.isOwner && u.memberOf.length === 0;
    return true;
  });

  // Non-admin users for selection
  const nonAdminUsers = users.filter(u => !u.adminRole);

  // Stats
  const stats = {
    total: users.length,
    owners: users.filter(u => u.isOwner).length,
    noCircle: users.filter(u => !u.isOwner && u.memberOf.length === 0).length
  };

  return (
    <div style={{ paddingBottom: '24px' }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>管理员面板</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
          {adminInfo?.email} · {ADMIN_ROLE_LABELS[adminInfo?.adminRole]}
        </p>
      </div>

      {/* Message */}
      {message.text && (
        <div style={{
          margin: '0 16px 16px',
          padding: '12px',
          borderRadius: '8px',
          background: message.type === 'error' ? '#fee2e2' : '#d1fae5',
          color: message.type === 'error' ? '#dc2626' : '#059669'
        }}>
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid #e5e7eb', 
        padding: '0 16px',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
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
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{stats.total}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>总用户</div>
              </div>
              <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{stats.owners}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>屋主</div>
              </div>
              <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.noCircle}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>待分配</div>
              </div>
            </div>

            {/* Info */}
            <div style={{ 
              padding: '12px 16px', 
              background: '#f0f9ff', 
              borderRadius: '8px',
              fontSize: '14px',
              color: '#0369a1'
            }}>
              💡 任何人都可以注册登录。管理员可以将用户设为屋主，屋主可以邀请其他用户加入自己的圈子。
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { value: 'all', label: '全部' },
                { value: 'owners', label: '屋主' },
                { value: 'noCircle', label: '待分配' }
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setUserFilter(f.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: 'none',
                    background: userFilter === f.value ? '#667eea' : '#f3f4f6',
                    color: userFilter === f.value ? 'white' : '#374151',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Users List */}
            <div className="card" style={{ overflow: 'hidden' }}>
              {filteredUsers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  暂无用户
                </div>
              ) : (
                filteredUsers.map((u, idx) => (
                  <div key={u.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '12px 16px',
                    borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '500' }}>{u.displayName}</span>
                        {u.adminRole && (
                          <span style={{ 
                            fontSize: '10px', 
                            padding: '2px 6px', 
                            background: u.adminRole === 'SUPER_ADMIN' ? '#fef3c7' : '#e0e7ff',
                            color: u.adminRole === 'SUPER_ADMIN' ? '#92400e' : '#4338ca',
                            borderRadius: '4px'
                          }}>
                            {ADMIN_ROLE_LABELS[u.adminRole]}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: '#6b7280' }}>{u.email}</p>
                      {u.isOwner ? (
                        <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                          🏠 屋主: {u.ownedCircles.map(c => c.displayName).join(', ')}
                        </p>
                      ) : u.memberOf.length > 0 ? (
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          👥 成员: {u.memberOf.map(c => `${c.displayName}(${MEMBER_ROLE_LABELS[c.role]})`).join(', ')}
                        </p>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                          ⏳ 未加入任何圈子
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {!u.isOwner && (
                        <button
                          onClick={() => openMakeHomeowner(u)}
                          style={{
                            padding: '6px 12px',
                            background: '#667eea',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          设为屋主
                        </button>
                      )}
                      {u.adminRole !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          style={{
                            padding: '6px 10px',
                            background: 'none',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            color: '#ef4444',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          title="删除用户"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Admins Tab (Super Admin Only) */}
        {activeTab === 'admins' && isSuperAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                管理员可以将用户设为屋主
              </p>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddAdmin(true)}
                style={{ padding: '8px 16px', fontSize: '14px' }}
                disabled={nonAdminUsers.length === 0}
              >
                + 添加管理员
              </button>
            </div>

            {/* Add Admin Form */}
            {showAddAdmin && (
              <div className="card" style={{ padding: '16px' }}>
                <h3 style={{ fontWeight: '500', marginBottom: '12px' }}>设置管理员</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                      选择用户
                    </label>
                    <select
                      className="form-select"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">请选择...</option>
                      {nonAdminUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleAddAdmin} disabled={submitting || !selectedUserId}>
                      {submitting ? '设置中...' : '确认'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowAddAdmin(false)} disabled={submitting}>
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Admins List */}
            <div className="card" style={{ overflow: 'hidden' }}>
              {admins.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  暂无管理员
                </div>
              ) : (
                admins.map((admin, idx) => (
                  <div key={admin.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '12px 16px',
                    borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        background: admin.adminRole === 'SUPER_ADMIN' ? '#fef3c7' : '#f3f4f6',
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '18px'
                      }}>
                        {admin.adminRole === 'SUPER_ADMIN' ? '👑' : '🔑'}
                      </div>
                      <div>
                        <p style={{ fontWeight: '500' }}>{admin.displayName}</p>
                        <p style={{ fontSize: '12px', color: '#6b7280' }}>{admin.email}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="badge" style={{ 
                        background: admin.adminRole === 'SUPER_ADMIN' ? '#fef3c7' : '#e0e7ff',
                        color: admin.adminRole === 'SUPER_ADMIN' ? '#92400e' : '#4338ca'
                      }}>
                        {ADMIN_ROLE_LABELS[admin.adminRole]}
                      </span>
                      {admin.adminRole !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                          style={{
                            padding: '4px 12px',
                            background: 'none',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            color: '#ef4444',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          取消权限
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Make Homeowner Modal */}
      {showMakeHomeowner && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowMakeHomeowner(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>设为屋主</h2>
              <button className="modal-close" onClick={() => setShowMakeHomeowner(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', color: '#6b7280' }}>
                将 <strong>{selectedUser.displayName}</strong> ({selectedUser.email}) 设为屋主
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    房屋名称
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={homeownerForm.homeName}
                    onChange={(e) => setHomeownerForm(f => ({ ...f, homeName: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    房屋类型
                  </label>
                  <select
                    className="form-select"
                    value={homeownerForm.houseType}
                    onChange={(e) => setHomeownerForm(f => ({ ...f, houseType: e.target.value }))}
                    disabled={submitting}
                  >
                    {HOUSE_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    城市
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={homeownerForm.city}
                    onChange={(e) => setHomeownerForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="例如：北京、上海"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMakeHomeowner(false)} disabled={submitting}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleMakeHomeowner} disabled={submitting}>
                {submitting ? '处理中...' : '确认设为屋主'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
