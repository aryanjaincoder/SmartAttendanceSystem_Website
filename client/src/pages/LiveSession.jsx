import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { QRCodeSVG } from 'qrcode.react';
import './LiveSession.css';

function LiveSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Core States
  const [sessionData, setSessionData] = useState(null);
  const [currentToken, setCurrentToken] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // BLE States
  const [nearbyDevices, setNearbyDevices] = useState(48);
  const [bleScanning, setBleScanning] = useState(true);

  // Settings & UI States
  const [livenessColor, setLivenessColor] = useState('#10b981');
  const [sessionPin] = useState(Math.floor(1000 + Math.random() * 9000));
  const [showPin, setShowPin] = useState(true);
  const [qrRefreshSpeed, setQrRefreshSpeed] = useState(3000);

  // Stats
  const [stats, setStats] = useState({
    scansPerMinute: 0,
    avgScanTime: 0
  });
  const [alerts, setAlerts] = useState([]);
  const [newAttendeeId, setNewAttendeeId] = useState(null);

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'];
  const intervalRef = useRef(null);
  const previousAttendeesCount = useRef(0);

  // Simulate BLE nearby devices (in real app, this comes from BLE scanning)
  useEffect(() => {
    if (!bleScanning || isPaused) return;

    const bleInterval = setInterval(() => {
      const variance = Math.floor(Math.random() * 5) - 2;
      setNearbyDevices(prev => Math.max(attendees.length, Math.min(60, prev + variance)));
    }, 3000);

    return () => clearInterval(bleInterval);
  }, [bleScanning, isPaused, attendees.length]);

  // QR Token Generation
  useEffect(() => {
    if (!sessionId || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const sessionDocRef = doc(db, "attendance_sessions", sessionId);

    const generateAndUpdateToken = async () => {
      try {
        const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newColor = colors[Math.floor(Math.random() * colors.length)];
        const timestamp = Date.now();

        setCurrentToken(newToken);
        setLivenessColor(newColor);

        await updateDoc(sessionDocRef, {
          currentToken: newToken,
          tokenExpiresAt: serverTimestamp(),
          sessionPin: sessionPin,
          lastTokenUpdate: timestamp,
          isPaused: false
        });
      } catch (err) {
        console.error("Token update error: ", err);
        setError('Failed to update token.');
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    generateAndUpdateToken();
    intervalRef.current = setInterval(generateAndUpdateToken, qrRefreshSpeed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, qrRefreshSpeed, sessionPin, isPaused]);

  // Session & Attendees Listener
  useEffect(() => {
    if (!sessionId) return;

    const sessionDocRef = doc(db, "attendance_sessions", sessionId);
    const unsubscribeSession = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSessionData(data);
        if (data.status === 'closed') {
          setError('Session closed.');
          setBleScanning(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          setCurrentToken(null);
        }
      } else {
        setError('Session not found.');
      }
    });

    const attendeesColRef = collection(db, "attendance_sessions", sessionId, "attendees");
    const attendeesQuery = query(attendeesColRef, orderBy("markedAt", "desc"));

    const unsubscribeAttendees = onSnapshot(attendeesQuery, (querySnapshot) => {
      const attendeesList = [];
      querySnapshot.forEach((doc) => {
        attendeesList.push({ id: doc.id, ...doc.data() });
      });
      
      // Detect new attendee for pulse animation
      if (attendeesList.length > previousAttendeesCount.current && attendeesList.length > 0) {
        setNewAttendeeId(attendeesList[0].id);
        setTimeout(() => setNewAttendeeId(null), 2000);
      }
      
      setAttendees(attendeesList);
      previousAttendeesCount.current = attendeesList.length;

      checkForAnomalies(attendeesList);
    });

    return () => {
      unsubscribeSession();
      unsubscribeAttendees();
    };
  }, [sessionId]);

  // Calculate Stats
  useEffect(() => {
    if (attendees.length > 1) {
      const times = attendees.map(a => a.markedAt?.toDate()).filter(Boolean);
      if (times.length > 1) {
        const timeDiffs = times.slice(1).map((t, i) => (times[i] - t) / 1000);
        const avgTime = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
        
        const firstTime = times[times.length - 1];
        const lastTime = times[0];
        const minutesDiff = (lastTime - firstTime) / 60000;
        const scansPerMin = minutesDiff > 0 ? (attendees.length / minutesDiff).toFixed(1) : 0;

        setStats({
          avgScanTime: avgTime.toFixed(1),
          scansPerMinute: scansPerMin
        });
      }
    }
  }, [attendees]);

  // Check for Anomalies
  const checkForAnomalies = (attendeesList) => {
    const newAlerts = [];
    const deviceMap = {};

    attendeesList.forEach(attendee => {
      if (attendee.deviceId) {
        deviceMap[attendee.deviceId] = (deviceMap[attendee.deviceId] || 0) + 1;
        if (deviceMap[attendee.deviceId] > 1) {
          newAlerts.push({
            message: `${attendee.name || attendee.email} - Multiple scans detected`,
            severity: 'high'
          });
        }
      }

      if (attendee.locationVerified === false) {
        newAlerts.push({
          message: `${attendee.name || attendee.email} - Location verification failed`,
          severity: 'high'
        });
      }

      if (attendee.bleRssi && attendee.bleRssi < -85) {
        newAlerts.push({
          message: `${attendee.name || attendee.email} - Weak BLE signal (possible proxy)`,
          severity: 'medium'
        });
      }
    });

    setAlerts(newAlerts.slice(0, 5));
  };

  // Pause/Resume Handler
  const handlePauseResume = async () => {
    if (!sessionId) return;
    
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    setBleScanning(!newPausedState);

    const sessionDocRef = doc(db, "attendance_sessions", sessionId);
    try {
      await updateDoc(sessionDocRef, {
        isPaused: newPausedState,
        currentToken: newPausedState ? null : currentToken
      });

      if (newPausedState) {
        setCurrentToken(null);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch (err) {
      console.error("Pause error: ", err);
    }
  };

  // Close Session
  const handleCloseSession = async () => {
    if (!sessionId || closing) return;

    const confirmClose = window.confirm('Are you sure you want to close this session?');
    if (!confirmClose) return;

    setClosing(true);
    setBleScanning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    const sessionDocRef = doc(db, "attendance_sessions", sessionId);
    try {
      await updateDoc(sessionDocRef, {
        status: "closed",
        currentToken: null,
        closedAt: serverTimestamp(),
        attendeeCount: attendees.length
      });
      navigate('/dashboard');
    } catch (err) {
      console.error("Error closing session: ", err);
      setError('Could not close session.');
      setClosing(false);
    }
  };

  // Export Report
  const generateReport = () => {
    const csvContent = [
      ["#", "Name", "Email", "Time", "Location", "BLE Signal", "Trust"],
      ...attendees.map((a, i) => [
        attendees.length - i,
        a.name || 'N/A',
        a.email || 'N/A',
        a.markedAt?.toDate().toLocaleTimeString() || 'N/A',
        a.locationVerified ? "Verified" : "Failed",
        a.bleRssi ? `${a.bleRssi} dBm` : 'N/A',
        getTrustScore(a)
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_${sessionData?.subject}_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  // Trust Score Calculator
  const getTrustScore = (attendee) => {
    let score = 0;
    if (attendee.locationVerified) score += 50;
    if (attendee.bleVerified) score += 30;
    if (attendee.faceVerified) score += 20;
    
    if (score >= 80) return "High";
    if (score >= 50) return "Medium";
    return "Low";
  };

  const getTrustColor = (attendee) => {
    const score = getTrustScore(attendee);
    if (score === "High") return "#10b981";
    if (score === "Medium") return "#f59e0b";
    return "#ef4444";
  };

  // Get BLE Signal Strength
  const getBleSignalStrength = (attendee) => {
    if (!attendee.bleRssi) return null;
    
    const rssi = attendee.bleRssi;
    if (rssi > -50) return { level: 'strong', bars: 3, color: '#10b981' };
    if (rssi > -70) return { level: 'medium', bars: 2, color: '#f59e0b' };
    return { level: 'weak', bars: 1, color: '#ef4444' };
  };

  // Get verification badges
  const getVerificationBadges = (attendee) => {
    const badges = [];
    if (attendee.locationVerified) badges.push('QR');
    if (attendee.bleVerified) badges.push('BLE');
    if (attendee.faceVerified) badges.push('Face');
    return badges;
  };

  const qrCodeData = JSON.stringify({
    sessionId: sessionId,
    token: currentToken,
    pin: sessionPin,
    timestamp: Date.now()
  });

  const expectedCount = sessionData?.expectedCount || 60;
  const attendancePercent = ((attendees.length / expectedCount) * 100).toFixed(0);
  const bleHealthPercent = ((nearbyDevices / expectedCount) * 100).toFixed(0);

  return (
    <div className="live-session-container">
      <div className="session-wrapper">
        
        {/* BLE Radar Widget */}
        <div className={`ble-radar-widget ${bleScanning ? 'scanning' : 'paused'}`}>
  <div className="radar-circle">
    <div className="radar-pulse"></div>
    <div className="radar-pulse pulse-2"></div>
    <div className="radar-center"></div>
  </div>
  <div className="radar-info">
    <div className="radar-status">
      {bleScanning ? 'Scanning Nearby Devices' : 'BLE Paused'}
    </div>
    <div className="radar-count">{Math.min(nearbyDevices, 3)} devices detected</div>  {/* ✅ YE LINE CHANGE KARO */}
  </div>
</div>

        {/* Top Bar */}
        <div className="top-bar">
          <div className="session-title-block">
            <h1 className="session-title">{sessionData?.subject || 'Loading Session...'}</h1>
            <div className="session-meta">
              <span className="meta-item">{sessionData?.class || 'N/A'}</span>
              {sessionData?.isGuestLecture && <span className="event-badge">Event</span>}
              <span className="meta-divider">•</span>
              <span className="meta-item">{new Date().toLocaleDateString('en-IN', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}</span>
            </div>
          </div>

          <div className="quick-stats">
            <div className="quick-stat-card stat-primary">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 14C8.13401 14 5 17.134 5 21H19C19 17.134 15.866 14 12 14Z" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-number">{attendees.length}<span className="stat-total">/{expectedCount}</span></div>
                <div className="stat-label">Marked Present</div>
                <div className="stat-progress">
                  <div className="stat-progress-fill" style={{width: `${attendancePercent}%`}}></div>
                </div>
              </div>
            </div>

           <div className="quick-stat-card stat-ble">
  <div className="stat-icon">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L17 7L12 12L17 17L12 22V2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M12 12L7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 12L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
  <div className="stat-content">
    <div className="stat-number">{Math.min(nearbyDevices, 3)}</div>  {/* ✅ YE LINE CHANGE KARO */}
    <div className="stat-label">Devices Nearby</div>
    <div className="stat-progress ble-progress">
      <div className="stat-progress-fill" style={{width: `${bleHealthPercent}%`}}></div>
    </div>
  </div>
</div>

            <div className="quick-stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 7V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-number">{stats.scansPerMinute}</div>
                <div className="stat-label">Scans/min</div>
              </div>
            </div>
          </div>
        </div>

        {/* Alert Section */}
        {alerts.length > 0 && (
          <div className="alert-section">
            <div className="alert-header">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>{alerts.length} Security Alert{alerts.length > 1 ? 's' : ''} Detected</span>
            </div>
            <div className="alert-list">
              {alerts.map((alert, idx) => (
                <div key={idx} className="alert-item-inline">{alert.message}</div>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="main-grid">
          
          {/* QR Code Panel */}
          <div className="qr-panel">
            <div className="panel-header">
              <h2 className="panel-title">Live QR Code</h2>
              <div className="status-indicator">
                <span className={`status-dot ${isPaused ? 'paused' : 'active'}`}></span>
                <span className="status-text">{isPaused ? 'Paused' : 'Active'}</span>
              </div>
            </div>

            <div className="qr-display-area">
              <div className={`qr-frame ${isPaused ? 'paused' : ''}`} 
     style={{ borderColor: isPaused ? '#64748b' : livenessColor }}>
  {!isPaused && currentToken && sessionData?.status === 'active' ? (
    <QRCodeSVG 
      value={qrCodeData} 
      size={380}              /* ✅ YAHA CHANGE KARO */
      level="H"
      includeMargin={false}
    />
  ) : (
    <div className="qr-inactive">
      {isPaused ? (
        <>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <rect x="6" y="5" width="4" height="14" fill="#64748b" rx="1"/>
            <rect x="14" y="5" width="4" height="14" fill="#64748b" rx="1"/>
          </svg>
          <p>Scanning Paused</p>
        </>
      ) : (
        <p>{error || 'Initializing...'}</p>
      )}
    </div>
  )}
</div>

              <div className="qr-info-grid">
                <div className="qr-info-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="#64748b" strokeWidth="1.5"/>
                    <path d="M8 5V8L10 10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span>Refreshes: {qrRefreshSpeed / 1000}s</span>
                </div>
                <div className="qr-info-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 8.5C9.38071 8.5 10.5 7.38071 10.5 6C10.5 4.61929 9.38071 3.5 8 3.5C6.61929 3.5 5.5 4.61929 5.5 6C5.5 7.38071 6.61929 8.5 8 8.5Z" stroke="#64748b" strokeWidth="1.5"/>
                    <path d="M13 13C13 10.7909 10.7614 9 8 9C5.23858 9 3 10.7909 3 13" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span>Geofencing: ON</span>
                </div>
              </div>
            </div>

            <div className="qr-controls-section">
              <div className="control-row">
                <label className="control-label">Refresh Speed</label>
                <select 
                  className="control-select"
                  value={qrRefreshSpeed} 
                  onChange={(e) => setQrRefreshSpeed(Number(e.target.value))}
                  disabled={isPaused || sessionData?.status === 'closed'}
                >
                  <option value={2000}>Fast - 2s</option>
                  <option value={3000}>Normal - 3s</option>
                  <option value={5000}>Slow - 5s</option>
                </select>
              </div>

              <div className="control-row">
                <label className="control-label">Session PIN</label>
                <div className="pin-control">
                  <span className="pin-value">{showPin ? sessionPin : '••••'}</span>
                  <button 
                    className="pin-toggle-btn"
                    onClick={() => setShowPin(!showPin)}
                  >
                    {showPin ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5C8.24 5 5.04 7.25 3.5 10.5C5.04 13.75 8.24 16 12 16C15.76 16 18.96 13.75 20.5 10.5C18.96 7.25 15.76 5 12 5Z" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="12" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M3 3L21 21M12 5C8.24 5 5.04 7.25 3.5 10.5C4.5 12.5 6 14 8 15M16 15C17.5 14 18.5 12.5 20.5 10.5C18.96 7.25 15.76 5 12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="action-buttons-grid">
              <button 
                className={`action-btn ${isPaused ? 'btn-resume' : 'btn-pause'}`}
                onClick={handlePauseResume}
                disabled={sessionData?.status === 'closed'}
              >
                {isPaused ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 2L13 8L3 14V2Z" fill="currentColor"/>
                    </svg>
                    Resume Scanning
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="2" width="4" height="12" fill="currentColor" rx="1"/>
                      <rect x="9" y="2" width="4" height="12" fill="currentColor" rx="1"/>
                    </svg>
                    Pause Scanning
                  </>
                )}
              </button>

              <button 
                className="action-btn btn-export"
                onClick={generateReport}
                disabled={attendees.length === 0}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Export Report
              </button>

              <button 
                className="action-btn btn-close"
                onClick={handleCloseSession}
                disabled={closing || sessionData?.status === 'closed'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="6" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 6V4C5 2.89543 5.89543 2 7 2H9C10.1046 2 11 2.89543 11 4V6" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                {closing ? 'Closing...' : 'End Session'}
              </button>
            </div>
          </div>

          {/* Attendees Panel */}
          <div className="attendees-panel">
            <div className="panel-header">
              <h2 className="panel-title">Real-Time Attendance</h2>
              <div className="attendee-header-badges">
  <span className="attendee-count-badge">{attendees.length} Marked</span>
  <span className="nearby-badge">{Math.min(nearbyDevices, 3)} Nearby</span>  {/* ✅ YE LINE CHANGE KARO */}
</div>
            </div>

            <div className="attendees-scroll">
              {attendees.length === 0 ? (
                <div className="empty-attendees">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4"/>
                    <circle cx="32" cy="24" r="8" stroke="#cbd5e1" strokeWidth="2"/>
                    <path d="M20 48C20 41.3726 25.3726 36 32 36C38.6274 36 44 41.3726 44 48" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <p className="empty-text">Waiting for students to mark attendance</p>
                  <p className="empty-subtext">QR scans will appear here in real-time</p>
                </div>
              ) : (
                attendees.map((attendee, index) => {
                  const bleSignal = getBleSignalStrength(attendee);
                  const badges = getVerificationBadges(attendee);
                  const isNew = attendee.id === newAttendeeId;
                  
                  return (
                    <div 
                      key={attendee.id || index} 
                      className={`attendee-row ${isNew ? 'new-entry' : ''}`}
                    >
                      <div className="attendee-index">#{attendees.length - index}</div>
                      
                      <div className="attendee-details">
                        <div className="attendee-name-row">
                          <span className="attendee-name">{attendee.name || attendee.email}</span>
                          
                          {badges.length === 3 && (
                            <span className="verified-3fa">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              3-FA
                            </span>
                          )}
                        </div>
                        
                        <div className="attendee-meta-row">
                          <span className="attendee-timestamp">
                            {attendee.markedAt?.toDate?.().toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            }) || 'Processing...'}
                          </span>

                          {bleSignal && (
                            <div className="ble-signal-indicator" style={{ color: bleSignal.color }}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M7 1L10.5 4.5L7 8L10.5 11.5L7 15V1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                <path d="M7 8L3.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                <path d="M7 8L3.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                              <span className="ble-signal-text">{bleSignal.level}</span>
                            </div>
                          )}
                        </div>

                        <div className="verification-badges">
                          {badges.map((badge, idx) => (
                            <span key={idx} className={`verify-badge badge-${badge.toLowerCase()}`}>
                              {badge === 'QR' && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <rect width="4" height="4" fill="currentColor"/>
                                  <rect x="6" width="4" height="4" fill="currentColor"/>
                                  <rect y="6" width="4" height="4" fill="currentColor"/>
                                </svg>
                              )}
                              {badge === 'BLE' && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M5 0L8 3L5 6L8 9L5 12V0Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                                  <path d="M5 6L2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                  <path d="M5 6L2 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                              )}
                              {badge === 'Face' && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
                                  <path d="M2 9C2 7.34315 3.34315 6 5 6C6.65685 6 8 7.34315 8 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                              )}
                              {badge}
                            </span>
                          ))}
                        </div>

                        {(attendee.locationVerified === false || attendee.attempts > 1 || (bleSignal && bleSignal.level === 'weak')) && (
                          <div className="warning-tags">
                            {attendee.locationVerified === false && (
                              <span className="warning-tag location-fail">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M6 1C3.79086 1 2 2.79086 2 5C2 7.5 6 11 6 11C6 11 10 7.5 10 5C10 2.79086 8.20914 1 6 1Z" stroke="currentColor" strokeWidth="1.2"/>
                                  <circle cx="6" cy="5" r="1" fill="currentColor"/>
                                </svg>
                                Location Failed
                              </span>
                            )}
                            {attendee.attempts > 1 && (
                              <span className="warning-tag multiple-attempts">
                                ⚠ {attendee.attempts} attempts
                              </span>
                            )}
                            {bleSignal && bleSignal.level === 'weak' && (
                              <span className="warning-tag weak-signal">
                                Weak BLE Signal
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div 
                        className="trust-indicator-dot"
                        style={{ backgroundColor: getTrustColor(attendee) }}
                        title={`Trust Score: ${getTrustScore(attendee)}`}
                      ></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default LiveSession;