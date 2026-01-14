import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [stats, setStats] = useState({
    totalSessionsToday: 0,
    totalStudentsPresent: 0,
    averageAttendance: 0,
  });
  const [loading, setLoading] = useState(true);
  
  // ✅ NEW: Session creation state
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    className: 'BCA-2024',
    subject: 'Data Structures',
    mode: 'QR',
    totalStudents: 60
  });

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(
      collection(db, 'attendance_sessions'),
      where('adminId', '==', userId),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = [];
      snapshot.forEach((doc) => {
        sessions.push({ id: doc.id, ...doc.data() });
      });
      setActiveSessions(sessions);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const fetchRecentSessions = async () => {
      const q = query(
        collection(db, 'attendance_sessions'),
        where('adminId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const snapshot = await getDocs(q);
      const sessions = [];
      snapshot.forEach((doc) => {
        sessions.push({ id: doc.id, ...doc.data() });
      });
      setRecentSessions(sessions);
    };

    fetchRecentSessions();
  }, []);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const fetchStats = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const q = query(
        collection(db, 'attendance_sessions'),
        where('adminId', '==', userId),
        where('startDate', '==', today)
      );

      const snapshot = await getDocs(q);
      let totalPresent = 0;
      let totalStudents = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        totalPresent += data.presentCount || 0;
        totalStudents += data.totalStudents || 0;
      });

      const avgAttendance = totalStudents > 0 
        ? Math.round((totalPresent / totalStudents) * 100) 
        : 0;

      setStats({
        totalSessionsToday: snapshot.size,
        totalStudentsPresent: totalPresent,
        averageAttendance: avgAttendance,
      });
    };

    fetchStats();
  }, []);

  // ✅ NEW: Create session function
  const handleCreateSession = async () => {
    if (!sessionForm.className || !sessionForm.subject || !sessionForm.mode) {
      alert('Please fill all required fields');
      return;
    }

    setIsCreatingSession(true);

    try {
      const userId = auth.currentUser?.uid;
      const today = new Date().toISOString().split('T')[0];

      const newSession = {
        adminId: userId,
        class: sessionForm.className,
        className: sessionForm.className,
        subject: sessionForm.subject,
        mode: sessionForm.mode,
        status: 'active', // ✅ This triggers notifications on mobile
        teacherName: auth.currentUser?.email?.split('@')[0] || 'Admin',
        createdAt: serverTimestamp(),
        startTime: serverTimestamp(),
        startDate: today,
        presentStudents: [],
        presentCount: 0,
        totalStudents: sessionForm.totalStudents || 0,
      };

      const docRef = await addDoc(collection(db, 'attendance_sessions'), newSession);
      
      console.log('✅ Session created successfully with ID:', docRef.id);
      
      setShowCreateModal(false);
      setIsCreatingSession(false);
      
      // Show success message
      alert(`✅ ${sessionForm.mode} session created successfully!\n\nStudents will receive notifications automatically.`);
      
      // Reset form
      setSessionForm({
        className: 'BCA-2024',
        subject: 'Data Structures',
        mode: 'QR',
        totalStudents: 60
      });

    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session: ' + error.message);
      setIsCreatingSession(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="status-badge status-active">Live</span>;
      case 'ended':
        return <span className="status-badge status-ended">Ended</span>;
      default:
        return <span className="status-badge status-pending">Pending</span>;
    }
  };

  const getModeBadge = (mode) => {
    const modeIcons = {
      QR: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect width="5" height="5" fill="currentColor"/>
          <rect x="9" width="5" height="5" fill="currentColor"/>
          <rect y="9" width="5" height="5" fill="currentColor"/>
        </svg>
      ),
      NFC: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1C3.68629 1 1 3.68629 1 7C1 10.3137 3.68629 13 7 13C10.3137 13 13 10.3137 13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      SOUND: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 5V9H5L9 12V2L5 5H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M11 4.5C11.5 5.5 11.5 8.5 11 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      P2P: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="4" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="10" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 12C2 10.3431 3.34315 9 5 9H9C10.6569 9 12 10.3431 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    };

    return (
      <span className={`mode-badge mode-${mode?.toLowerCase() || 'qr'}`}>
        {modeIcons[mode] || modeIcons.QR}
        {mode || 'QR'}
      </span>
    );
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      return timestamp.toDate().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      return timestamp.toDate().toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-state">
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <p className="loading-text">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-wrapper">
        
        {/* Header Section */}
        <div className="dashboard-header">
          <div className="header-content">
            <div className="header-text">
              <h1 className="dashboard-title">Admin Dashboard</h1>
              <p className="dashboard-subtitle">
                {new Date().toLocaleDateString('en-IN', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div className="header-actions">
              {/* ✅ NEW: Create Session Button */}
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="create-session-btn"
                style={{
                  backgroundColor: '#1E3A8A',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginRight: '12px'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Create Session
              </button>
              
              <div className="user-info">
                <div className="user-avatar">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 19C4 15.134 6.68629 12 10 12C13.3137 12 16 15.134 16 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="user-email">{auth.currentUser?.email?.split('@')[0] || 'Admin'}</span>
              </div>
              <button onClick={() => signOut(auth)} className="logout-btn">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M7 13L3 9M3 9L7 5M3 9H11M11 3H13C14.1046 3 15 3.89543 15 5V13C15 14.1046 14.1046 15 13 15H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* ✅ NEW: Create Session Modal */}
        {showCreateModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>
                Create New Session
              </h2>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Class ID
                </label>
                <input
                  type="text"
                  value={sessionForm.className}
                  onChange={(e) => setSessionForm({...sessionForm, className: e.target.value})}
                  placeholder="e.g., bca1"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Subject Name
                </label>
                <input
                  type="text"
                  value={sessionForm.subject}
                  onChange={(e) => setSessionForm({...sessionForm, subject: e.target.value})}
                  placeholder="e.g., Data Structures"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Total Students
                </label>
                <input
                  type="number"
                  value={sessionForm.totalStudents}
                  onChange={(e) => setSessionForm({...sessionForm, totalStudents: parseInt(e.target.value) || 0})}
                  placeholder="e.g., 60"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                  Attendance Mode
                </label>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {['QR', 'NFC', 'SOUND', 'P2P'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSessionForm({...sessionForm, mode})}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: sessionForm.mode === mode ? '2px solid #1E3A8A' : '1px solid #E5E7EB',
                        backgroundColor: sessionForm.mode === mode ? '#EFF6FF' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontWeight: sessionForm.mode === mode ? '600' : '400'
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreatingSession}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={isCreatingSession}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#1E3A8A',
                    color: 'white',
                    cursor: isCreatingSession ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: isCreatingSession ? 0.6 : 1
                  }}
                >
                  {isCreatingSession ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-section">
          <div className="stat-card stat-sessions">
            <div className="stat-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 6V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 6V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-details">
              <h3 className="stat-value">{stats.totalSessionsToday}</h3>
              <p className="stat-label">Sessions Today</p>
              <div className="stat-progress">
                <div className="stat-progress-bar" style={{width: `${Math.min((stats.totalSessionsToday / 10) * 100, 100)}%`}}></div>
              </div>
            </div>
          </div>

          <div className="stat-card stat-students">
            <div className="stat-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M6 21C6 17.134 8.68629 14 12 14C15.3137 14 18 17.134 18 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-details">
              <h3 className="stat-value">{stats.totalStudentsPresent}</h3>
              <p className="stat-label">Students Present</p>
              <div className="stat-progress">
                <div className="stat-progress-bar" style={{width: `${Math.min((stats.totalStudentsPresent / 100) * 100, 100)}%`}}></div>
              </div>
            </div>
          </div>

          <div className="stat-card stat-attendance">
            <div className="stat-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M3 21L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-details">
              <h3 className="stat-value">{stats.averageAttendance}%</h3>
              <p className="stat-label">Avg Attendance</p>
              <div className="stat-progress">
                <div className="stat-progress-bar" style={{width: `${stats.averageAttendance}%`}}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Sessions Section */}
        {activeSessions.length > 0 && (
          <div className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                <span className="pulse-dot"></span>
                Live Sessions
              </h2>
              <span className="session-count">{activeSessions.length} Active</span>
            </div>
            
            <div className="active-sessions-grid">
              {activeSessions.map((session) => {
                const attendancePercent = session.totalStudents > 0
                  ? Math.round((session.presentCount / session.totalStudents) * 100)
                  : 0;

                return (
                  <div key={session.id} className="active-session-card">
                    <div className="session-card-header">
                      <div className="session-info">
                        <h3 className="session-subject">{session.subject}</h3>
                        <p className="session-class">{session.className || session.class}</p>
                      </div>
                      {getModeBadge(session.mode || 'QR')}
                    </div>

                    <div className="session-metrics">
                      <div className="metric-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M3 14C3 11.7909 5.23858 10 8 10C10.7614 10 13 11.7909 13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span className="metric-value">{session.presentCount || 0}</span>
                        <span className="metric-label">Present</span>
                      </div>

                      <div className="metric-divider"></div>

                      <div className="metric-item">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span className="metric-value">{formatTime(session.createdAt)}</span>
                        <span className="metric-label">Started</span>
                      </div>
                    </div>

                    <div className="attendance-bar-section">
                      <div className="attendance-bar-header">
                        <span className="attendance-label">Attendance</span>
                        <span className="attendance-percent">{attendancePercent}%</span>
                      </div>
                      <div className="attendance-bar">
                        <div 
                          className="attendance-bar-fill" 
                          style={{width: `${attendancePercent}%`}}
                        ></div>
                      </div>
                      <p className="attendance-text">
                        {session.presentCount || 0} of {session.totalStudents || 0} students marked
                      </p>
                    </div>

                    <button 
                      onClick={() => navigate(`/session/${session.id}`)}
                      className="view-session-btn"
                    >
                      <span>View Live Session</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State for Active Sessions */}
        {activeSessions.length === 0 && (
          <div className="section-card empty-section">
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"/>
                  <rect x="20" y="20" width="24" height="24" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M26 28L30 32L38 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="empty-title">No Active Sessions</h3>
              <p className="empty-description">
                Click "Create Session" to start tracking attendance
              </p>
            </div>
          </div>
        )}

        {/* Recent Sessions Section */}
        <div className="section-card">
          <div className="section-header">
            <h2 className="section-title">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 5V10L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Recent Activity
            </h2>
            <Link to="/reports" className="view-all-link">
              View All
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          {recentSessions.length > 0 ? (
            <div className="recent-sessions-table">
              {recentSessions.map((session) => (
                <div key={session.id} className="recent-session-row">
                  <div className="recent-session-main">
                    <div className="recent-session-info">
                      <h4 className="recent-subject">{session.subject}</h4>
                      <p className="recent-meta">
                        {session.className || session.class} • {formatDate(session.createdAt)} at {formatTime(session.createdAt)}
                      </p>
                    </div>
                    
                    <div className="recent-session-badges">
                      {getModeBadge(session.mode || 'QR')}
                      {getStatusBadge(session.status)}
                    </div>
                  </div>

                  <div className="recent-session-stats">
                    <div className="recent-stat">
                      <span className="recent-stat-value">{session.presentCount || 0}/{session.totalStudents || 0}</span>
                      <span className="recent-stat-label">Attendance</span>
                    </div>
                    
                    <button 
                      onClick={() => navigate(`/session/${session.id}`)}
                      className="recent-view-btn"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-recent-sessions">
              <p>No recent sessions found</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="quick-actions-section">
          <Link to="/reports" className="quick-action-card">
            <div className="quick-action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 17H15M9 13H15M9 9H10M13 3H8.2C7.0799 3 6.51984 3 6.09202 3.21799C5.71569 3.40973 5.40973 3.71569 5.21799 4.09202C5 4.51984 5 5.0799 5 6.2V17.8C5 18.9201 5 19.4802 5.21799 19.908C5.40973 20.2843 5.71569 20.5903 6.09202 20.782C6.51984 21 7.0799 21 8.2 21H15.8C16.9201 21 17.4802 21 17.908 20.782C18.2843 20.5903 18.5903 20.2843 18.782 19.908C19 19.4802 19 18.9201 19 17.8V9M13 3L19 9M13 3V7.4C13 7.96005 13 8.24008 13.109 8.45399C13.2049 8.64215 13.3578 8.79513 13.546 8.89101C13.7599 9 14.0399 9 14.6 9H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="quick-action-content">
              <h3 className="quick-action-title">View Reports</h3>
              <p className="quick-action-desc">Access detailed attendance analytics</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="quick-action-arrow">
              <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;