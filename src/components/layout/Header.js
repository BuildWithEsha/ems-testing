import React, { useState, useEffect, useRef } from 'react';
import { Bell, User, Search, LogOut, ChevronDown, Clock, Key } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TimerModal from '../ui/TimerModal';
import NotificationPanel from '../ui/NotificationPanel';
import AbsenceNotificationPanel from '../ui/AbsenceNotificationPanel';
import CLETNotificationPanel from '../ui/CLETNotificationPanel';
import MissedTaskNotificationPanel from '../ui/MissedTaskNotificationPanel';
import LessTrainedEmployeeNotificationPanel from '../ui/LessTrainedEmployeeNotificationPanel';
import OverEstimateTaskNotificationPanel from '../ui/OverEstimateTaskNotificationPanel';
import LowHoursNotificationPanel from '../ui/LowHoursNotificationPanel';
import LowIdleNotificationPanel from '../ui/LowIdleNotificationPanel';
import NotificationBell from '../ui/NotificationBell';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import { useNotifications } from '../../hooks/useNotifications';
import { useAbsenceNotifications } from '../../hooks/useAbsenceNotifications';
import { useCLETNotifications } from '../../hooks/useCLETNotifications';
import { useMissedTaskNotifications } from '../../hooks/useMissedTaskNotifications';
import { useIdleAccountabilitySummary } from '../../hooks/useIdleAccountabilitySummary';
import { useLessTrainedEmployeeNotifications } from '../../hooks/useLessTrainedEmployeeNotifications';
import { useOverEstimateTaskNotifications } from '../../hooks/useOverEstimateTaskNotifications';
import { useLowHoursNotifications } from '../../hooks/useLowHoursNotifications';
import { useLowIdleNotifications } from '../../hooks/useLowIdleNotifications';

const Header = ({ onSearch, onLogout, tasks, employees, onStartTimer, onStopTimer, onOpenTask }) => {
  const { user } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showAbsenceNotificationPanel, setShowAbsenceNotificationPanel] = useState(false);
  const [showCLETNotificationPanel, setShowCLETNotificationPanel] = useState(false);
  const [showLessTrainedEmployeeNotificationPanel, setShowLessTrainedEmployeeNotificationPanel] = useState(false);
  const [showOverEstimateTaskNotificationPanel, setShowOverEstimateTaskNotificationPanel] = useState(false);
  const [showLowHoursNotificationPanel, setShowLowHoursNotificationPanel] = useState(false);
  const [showLowIdleNotificationPanel, setShowLowIdleNotificationPanel] = useState(false);
  const [showMissedTaskNotificationPanel, setShowMissedTaskNotificationPanel] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const userMenuRef = useRef(null);
  const [attendance, setAttendance] = useState({ active: false, entry: null });
  const [now, setNow] = useState(Date.now());
  
  // Notification system for admin users
  const [selectedNotificationDate, setSelectedNotificationDate] = useState(() => {
    // Default to yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const { notifications, hasNotifications, loading: notificationsLoading, refreshNotifications } = useNotifications(selectedNotificationDate);
  
  // Absence notification system for admin users
  const { absenceNotifications, hasAbsenceNotifications, loading: absenceNotificationsLoading } = useAbsenceNotifications();
  
  // CLET notification system for admin users
  const { cletNotifications, hasCLETNotifications, loading: cletNotificationsLoading } = useCLETNotifications();
  
  // LTE notification system for admin users
  const { lessTrainedEmployeeNotifications, hasLessTrainedEmployeeNotifications, loading: lessTrainedEmployeeNotificationsLoading, minTrainedThreshold, updateMinTrainedThreshold } = useLessTrainedEmployeeNotifications();
  
  // Over-estimate tasks notification system for admin users
  const {
    items: overEstimateNotifications,
    loading: overEstimateLoading,
    error: overEstimateError,
    startDate: overEstimateStart,
    endDate: overEstimateEnd,
    designation: overEstimateDesignation,
    minOverMinutes: overEstimateMinOver,
    hasAccess: hasOverEstimateAccess,
    updateFilters: updateOverEstimateFilters,
    refresh: refreshOverEstimateNotifications
  } = useOverEstimateTaskNotifications();
  
  // LHE (Low Hours Employees) notification system for admin users
  const { lowHoursNotifications, hasLowHoursNotifications, loading: lowHoursNotificationsLoading, minHoursThreshold, selectedDate: lowHoursSelectedDate, updateMinHoursThreshold, updateSelectedDate: updateLowHoursDate, updateSettings: updateLowHoursSettings } = useLowHoursNotifications();
  
  // Low Idle (Team Logger API) notification system for admin users
  const {
    lowIdleNotifications,
    hasLowIdleNotifications,
    loading: lowIdleNotificationsLoading,
    error: lowIdleError,
    startDate: lowIdleStartDate,
    endDate: lowIdleEndDate,
    minIdleHours: lowIdleMinHours,
    minIdleMinutes: lowIdleMinMinutes,
    updateSettings: updateLowIdleSettings,
    currentlyIdleList,
    currentlyIdleLoading,
    currentlyIdleError,
    currentlyIdleWindowMinutes,
    currentlyIdleMinMinutes,
    setCurrentlyIdleWindowMinutes,
    setCurrentlyIdleMinMinutes,
    refreshCurrentlyIdle,
    fetchCurrentlyIdle,
    accountabilitySummary
  } = useLowIdleNotifications();
  
  // MTW notification system for admin users
  const { missedTaskNotifications, hasMissedTaskNotifications, loading: missedTaskNotificationsLoading, daysThreshold, updateDaysThreshold } = useMissedTaskNotifications();
  const {
    pendingCount: idlePendingCount
  } = useIdleAccountabilitySummary();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Ticker for clocked-in duration display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load attendance status for current user
  useEffect(() => {
    const loadStatus = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`/api/attendance/status?employee_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setAttendance(data);
        }
      } catch (e) {
        console.warn('Failed to load attendance status:', e);
      }
    };
    
    // Load initial status
    loadStatus();
    
    // Refresh status every 30 seconds to keep timer accurate
    const interval = setInterval(loadStatus, 30000);
    
    return () => clearInterval(interval);
  }, [user?.id]);

  const formatHMS = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // Calculate total daily duration (completed sessions + current session if active)
  const totalDailyDuration = attendance.totalDailyDuration || 0;
  
  // Calculate current session duration properly
  const currentSessionDuration = attendance.active && attendance.entry
    ? (() => {
        try {
          // attendance.entry.clock_in can be either a TIME field (e.g., "14:46:20") or ISO timestamp
          let clockInDateTime;
          
          if (attendance.entry.clock_in.includes('T') || attendance.entry.clock_in.includes('Z')) {
            // Full ISO timestamp - server now stores Pakistan time, so parse as local time
            clockInDateTime = new Date(attendance.entry.clock_in);
          } else {
            // TIME field - combine with today's date
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            clockInDateTime = new Date(`${today}T${attendance.entry.clock_in}`);
          }
          
          // Check if the time is valid
          if (isNaN(clockInDateTime.getTime())) {
            console.warn('Invalid clock_in time:', attendance.entry.clock_in);
            return 0;
          }
          
          const duration = Math.max(0, Math.floor((now - clockInDateTime.getTime()) / 1000));
          
          // Debug: Log only once when duration changes significantly
          if (duration % 60 === 0) { // Log every minute
            console.log(`Clock-in: ${attendance.entry.clock_in} -> Current: ${new Date(now).toLocaleTimeString()} = ${Math.floor(duration/60)} minutes`);
          }
          
          return duration;
        } catch (error) {
          console.error('Error calculating current session duration:', error);
          return 0;
        }
      })()
    : 0;
    
  // For display purposes, show current session time when active, total when not active
  const totalElapsed = attendance.active ? currentSessionDuration : totalDailyDuration;

  const handleClockIn = async () => {
    if (!user?.id) return;
    try {
      // OPTIMISTIC UPDATE: Update UI immediately before API call
      const clockInTime = new Date().toISOString();
      setAttendance({
        active: true,
        entry: {
          clock_in: clockInTime,
          employee_id: user.id
        }
      });
      // Force immediate re-render by updating now
      setNow(Date.now());
      
      const res = await fetch('/api/attendance/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.id })
      });
      
      if (res.ok) {
        // Refresh with actual server data (in background)
        const statusRes = await fetch(`/api/attendance/status?employee_id=${user.id}`);
        if (statusRes.ok) {
          setAttendance(await statusRes.json());
          console.log('✅ Clocked in successfully');
        }
      } else {
        // Rollback on error
        setAttendance({ active: false, entry: null });
        const errorData = await res.json();
        console.error('❌ Clock in failed:', errorData.error);
        alert(`Clock in failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      // Rollback on error
      setAttendance({ active: false, entry: null });
      console.error('❌ Clock in error:', error);
      alert('Clock in failed: Network error');
    }
  };

  const handleClockOut = () => {
    if (!user?.id) return;
    const doClockOut = async () => {
      try {
        const res = await fetch('/api/attendance/clock-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: user.id })
        });
        
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const statusRes = await fetch(`/api/attendance/status?employee_id=${user.id}`);
          if (statusRes.ok) {
            setAttendance(await statusRes.json());
            console.log('✅ Clocked out successfully');
          }
          if (data.stopped_timer_task_ids && data.stopped_timer_task_ids.length > 0) {
            window.dispatchEvent(new CustomEvent('app:timer-stopped-on-clockout', {
              detail: { taskIds: data.stopped_timer_task_ids, stopped_timers: data.stopped_timers || [] }
            }));
          }
        } else {
          const errorData = await res.json();
          console.error('❌ Clock out failed:', errorData.error);
          alert(`Clock out failed: ${errorData.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('❌ Clock out error:', error);
        alert('Clock out failed: Network error');
      }
    };
    window.dispatchEvent(new CustomEvent('app:stop-timers-for-clockout', { detail: { callback: doClockOut } }));
  };

  // Get active timer count for notification badge - ensure tasks is an array
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const activeTimerCount = safeTasks.filter(task => task.timer_started_at).length;
  
  // Get department-wise timer counts
  const departmentTimerCounts = safeTasks
    .filter(task => task.timer_started_at)
    .reduce((acc, task) => {
      const dept = task.department || 'Unassigned';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});
  
  // Debug logging for timer count
  console.log('🔍 Header Debug - User permissions:', user?.permissions);
  console.log('🔍 Header Debug - User role:', user?.role);
  console.log('🔍 Header Debug - Total tasks:', safeTasks.length);
  console.log('🔍 Header Debug - Active timer count:', activeTimerCount);
  console.log('🔍 Header Debug - Department timer counts:', departmentTimerCounts);

  // Handle notification date change
  const handleNotificationDateChange = (date) => {
    setSelectedNotificationDate(date);
  };

  // Handle notification refresh
  const handleNotificationRefresh = (date) => {
    refreshNotifications(date);
  };

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Clock In/Out */}
            <div className="hidden md:flex items-center space-x-2 mr-2">
              {/* Current Session Timer - Show prominently when clocked in */}
              {attendance.active && (
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-500">Current Session</span>
                  <span className="text-lg font-mono font-bold text-blue-600" title="Current session duration">
                    {formatHMS(currentSessionDuration)}
                  </span>
                </div>
              )}
              
              {/* Total Daily Duration */}
              {totalElapsed > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-500">Total Today</span>
                  <span className="text-sm font-mono text-green-700" title="Total daily duration">
                    {formatHMS(totalElapsed)}
                  </span>
                </div>
              )}
              
              {/* Clock In/Out Button */}
              <button
                onClick={attendance.active ? handleClockOut : handleClockIn}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm transition-colors ${
                  attendance.active 
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
                }`}
                title={attendance.active ? 'Click to Clock Out' : 'Click to Clock In'}
              >
                {attendance.active ? 'Clock Out' : 'Clock In'}
              </button>
            </div>
            {/* Timer Button - Only show if user has timer permissions */}
            {(user?.permissions?.includes('start_timer') || user?.permissions?.includes('stop_timer') || user?.permissions?.includes('start_own_timer') || user?.permissions?.includes('stop_own_timer') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative group"
                onClick={() => setShowTimerModal(true)}
                title={`Timer Management - ${activeTimerCount} active timer${activeTimerCount !== 1 ? 's' : ''}`}
              >
              <Clock className="w-5 h-5 text-gray-600" />
              {activeTimerCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {activeTimerCount}
                </span>
              )}
              
              {/* Department-wise tooltip */}
              {activeTimerCount > 0 && (
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                  <div className="font-medium mb-1">Active Timers by Department:</div>
                  {Object.entries(departmentTimerCounts)
                    .sort(([,a], [,b]) => b - a)
                    .map(([dept, count]) => (
                      <div key={dept} className="flex justify-between items-center">
                        <span>{dept}:</span>
                        <span className="ml-2 font-bold">{count}</span>
                      </div>
                    ))}
                </div>
              )}
              </button>
            )}

            {/* DWM Notifications - Only show if user has dwm_view permission */}
            {(user?.permissions?.includes('dwm_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowNotificationPanel(true);
                }}
                title="DWM Task Notifications"
                disabled={notificationsLoading}
              >
                <span className={`text-sm font-medium ${notificationsLoading ? 'text-gray-400' : 'text-gray-600'}`}>DWM</span>
                {hasNotifications && !notificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {notifications.length}
                  </span>
                )}
                {notificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* CLET Notifications - Only show if user has clet_view permission */}
            {(user?.permissions?.includes('clet_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowCLETNotificationPanel(true);
                }}
                title="Tasks Missing Checklist or Estimated Time"
                disabled={cletNotificationsLoading}
              >
                <span className={`text-sm font-medium ${cletNotificationsLoading ? 'text-gray-400' : 'text-purple-600'}`}>CLET</span>
                {hasCLETNotifications && !cletNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {cletNotifications.length}
                  </span>
                )}
                {cletNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* LTE Notifications - Only show if user has lte_view permission */}
            {(user?.permissions?.includes('lte_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowLessTrainedEmployeeNotificationPanel(true);
                }}
                title="Less Trained Employees Notifications"
                disabled={lessTrainedEmployeeNotificationsLoading}
              >
                <span className={`text-sm font-medium ${lessTrainedEmployeeNotificationsLoading ? 'text-gray-400' : 'text-green-600'}`}>LTE</span>
                {hasLessTrainedEmployeeNotifications && !lessTrainedEmployeeNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {lessTrainedEmployeeNotifications.length}
                  </span>
                )}
                {lessTrainedEmployeeNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* LHE Notifications - Show for admin, manager role/designation, or lhe_view permission */}
            {(user?.permissions?.includes('lhe_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin' || user?.is_manager || (user?.role && String(user.role).toLowerCase() === 'manager') || (user?.designation && String(user.designation).toLowerCase().includes('manager'))) && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowLowHoursNotificationPanel(true);
                }}
                title="Low Hours Employees Notifications"
                disabled={lowHoursNotificationsLoading}
              >
                <span className={`text-sm font-medium ${lowHoursNotificationsLoading ? 'text-gray-400' : 'text-orange-600'}`}>LHE</span>
                {hasLowHoursNotifications && !lowHoursNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {lowHoursNotifications.length}
                  </span>
                )}
                {lowHoursNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* Over-estimate Tasks Notifications - Only show if user has view_overestimate_tasks or is admin */}
            {(hasOverEstimateAccess) && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => setShowOverEstimateTaskNotificationPanel(true)}
                title="Tasks Over Estimate Notifications"
                disabled={overEstimateLoading}
              >
                <span className={`text-sm font-medium ${overEstimateLoading ? 'text-gray-400' : 'text-amber-600'}`}>OverEst</span>
                {overEstimateNotifications.length > 0 && !overEstimateLoading && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full h-4 min-w-[1rem] px-1 flex items-center justify-center animate-pulse">
                    {overEstimateNotifications.length}
                  </span>
                )}
              </button>
            )}

            {/* Low Idle (Team Logger) - Only show if user has low_idle_view permission */}
            {(user?.permissions?.includes('low_idle_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => setShowLowIdleNotificationPanel(true)}
                title="Low Idle Employees (from tracking app)"
                disabled={lowIdleNotificationsLoading}
              >
                <span className={`text-sm font-medium ${lowIdleNotificationsLoading ? 'text-gray-400' : 'text-teal-600'}`}>Idle</span>
                {(hasLowIdleNotifications || idlePendingCount > 0) && !lowIdleNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-teal-500 text-white text-xs rounded-full h-4 min-w-[1rem] px-1 flex items-center justify-center">
                    {idlePendingCount > 0 ? idlePendingCount : lowIdleNotifications.length}
                  </span>
                )}
                {lowIdleNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    <div className="w-2 h-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </span>
                )}
              </button>
            )}

            {/* MTW Notifications - Only show if user has mtw_view permission */}
            {(user?.permissions?.includes('mtw_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowMissedTaskNotificationPanel(true);
                }}
                title="Missed Task Week Notifications"
                disabled={missedTaskNotificationsLoading}
              >
                <span className={`text-sm font-medium ${missedTaskNotificationsLoading ? 'text-gray-400' : 'text-purple-600'}`}>MTW</span>
                {hasMissedTaskNotifications && !missedTaskNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {missedTaskNotifications.length}
                  </span>
                )}
                {missedTaskNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* Consecutive Absence Notifications - Only show if user has ca_view permission */}
            {(user?.permissions?.includes('ca_view') || user?.permissions?.includes('all') || user?.role === 'admin' || user?.role === 'Admin') && (
              <button 
                className="p-2 rounded-lg hover:bg-gray-100 relative transition-colors"
                onClick={() => {
                  setShowAbsenceNotificationPanel(true);
                }}
                title="Consecutive Absence Notifications"
                disabled={absenceNotificationsLoading}
              >
                <span className={`text-sm font-medium ${absenceNotificationsLoading ? 'text-gray-400' : 'text-orange-600'}`}>CA</span>
                {hasAbsenceNotifications && !absenceNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {absenceNotifications.length}
                  </span>
                )}
                {absenceNotificationsLoading && (
                  <span className="absolute -top-1 -right-1 bg-gray-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </button>
            )}

            {/* Ticket Notifications Bell - Available for all users */}
            <NotificationBell />
            
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.email ? user.email.split('@')[0] : 'Admin User'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user?.email || 'admin@company.com'}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              
              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.email || 'admin@company.com'}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {user?.role || 'admin'} user
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowChangePasswordModal(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>Change Password</span>
                  </button>
                  <button
                    onClick={() => {
                      // Force refresh user session
                      localStorage.removeItem('user');
                      localStorage.removeItem('isAuthenticated');
                      window.location.reload();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <span>🔄 Refresh Session</span>
                  </button>
                  <button
                    onClick={() => {
                      onLogout();
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Timer Modal */}
      <TimerModal
        isOpen={showTimerModal}
        onClose={() => setShowTimerModal(false)}
        onStartTimer={onStartTimer}
        onStopTimer={onStopTimer}
        onOpenTask={(task) => {
          if (onOpenTask) onOpenTask(task);
          setShowTimerModal(false);
        }}
      />

      {/* Notification Panel */}
      <NotificationPanel
        isOpen={showNotificationPanel}
        onClose={() => setShowNotificationPanel(false)}
        notifications={notifications}
        selectedDate={selectedNotificationDate}
        onDateChange={handleNotificationDateChange}
        onRefresh={handleNotificationRefresh}
      />

      {/* Absence Notification Panel */}
      <AbsenceNotificationPanel
        isOpen={showAbsenceNotificationPanel}
        onClose={() => setShowAbsenceNotificationPanel(false)}
        absenceNotifications={absenceNotifications}
      />

      {/* CLET Notification Panel */}
      <CLETNotificationPanel
        isOpen={showCLETNotificationPanel}
        onClose={() => setShowCLETNotificationPanel(false)}
        cletNotifications={cletNotifications}
      />

      {/* LTE Notification Panel */}
      <LessTrainedEmployeeNotificationPanel
        isOpen={showLessTrainedEmployeeNotificationPanel}
        onClose={() => setShowLessTrainedEmployeeNotificationPanel(false)}
        lessTrainedEmployeeNotifications={lessTrainedEmployeeNotifications}
        minTrainedThreshold={minTrainedThreshold}
        onUpdateMinTrainedThreshold={updateMinTrainedThreshold}
      />

      {/* Tasks Over Estimate Notification Panel (admin/reporting view) */}
      <OverEstimateTaskNotificationPanel
        isOpen={showOverEstimateTaskNotificationPanel}
        onClose={() => setShowOverEstimateTaskNotificationPanel(false)}
        notifications={overEstimateNotifications}
        startDate={overEstimateStart}
        endDate={overEstimateEnd}
        designation={overEstimateDesignation}
        minOverMinutes={overEstimateMinOver}
        onUpdateFilters={updateOverEstimateFilters}
        loading={overEstimateLoading}
        error={overEstimateError}
      />

      {/* LHE (Low Hours Employees) Notification Panel */}
      <LowHoursNotificationPanel
        isOpen={showLowHoursNotificationPanel}
        onClose={() => setShowLowHoursNotificationPanel(false)}
        lowHoursNotifications={lowHoursNotifications}
        minHoursThreshold={minHoursThreshold}
        onUpdateMinHoursThreshold={updateMinHoursThreshold}
        selectedDate={lowHoursSelectedDate}
        onUpdateSelectedDate={updateLowHoursDate}
        onUpdateSettings={updateLowHoursSettings}
      />

      <LowIdleNotificationPanel
        isOpen={showLowIdleNotificationPanel}
        onClose={() => setShowLowIdleNotificationPanel(false)}
        lowIdleNotifications={lowIdleNotifications}
        startDate={lowIdleStartDate}
        endDate={lowIdleEndDate}
        minIdleHours={lowIdleMinHours}
        minIdleMinutes={lowIdleMinMinutes}
        onUpdateSettings={updateLowIdleSettings}
        loading={lowIdleNotificationsLoading}
        error={lowIdleError}
        currentlyIdleList={currentlyIdleList}
        currentlyIdleLoading={currentlyIdleLoading}
        currentlyIdleError={currentlyIdleError}
        currentlyIdleWindowMinutes={currentlyIdleWindowMinutes}
        currentlyIdleMinMinutes={currentlyIdleMinMinutes}
        onCurrentlyIdleWindowChange={setCurrentlyIdleWindowMinutes}
        onCurrentlyIdleMinMinutesChange={setCurrentlyIdleMinMinutes}
        onRefreshCurrentlyIdle={refreshCurrentlyIdle}
        onFetchCurrentlyIdle={fetchCurrentlyIdle}
        accountabilitySummary={accountabilitySummary}
      />

      {/* MTW Notification Panel */}
      <MissedTaskNotificationPanel
        isOpen={showMissedTaskNotificationPanel}
        onClose={() => setShowMissedTaskNotificationPanel(false)}
        missedTaskNotifications={missedTaskNotifications}
        daysThreshold={daysThreshold}
        onUpdateDaysThreshold={updateDaysThreshold}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        userEmail={user?.email || 'admin@daataadirect.co.uk'}
      />
    </>
  );
};

export default Header; 