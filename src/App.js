import React, { useState, useEffect, Suspense, lazy, startTransition } from 'react';
import { initialData } from './data/initialData';
import { generateId, validateFormData } from './utils/dataHandlers';

// Authentication
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskConfigProvider } from './contexts/TaskConfigContext';
import Login from './components/auth/Login';

// Layout Components
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

// Lazy load view components for better performance
const Dashboard = lazy(() => import('./components/views/Dashboard'));
const Employees = lazy(() => import('./components/views/Employees'));
const Departments = lazy(() => import('./components/views/Departments'));
const DepartmentDashboard = lazy(() => import('./components/views/DepartmentDashboard'));
const Designations = lazy(() => import('./components/views/Designations'));
const Labels = lazy(() => import('./components/views/Labels'));
const Tasks = lazy(() => import('./components/views/Tasks'));
const Reports = lazy(() => import('./components/views/Reports'));
const NoticeBoard = lazy(() => import('./components/views/NoticeBoard'));
const Tickets = lazy(() => import('./components/views/Tickets'));
const Errors = lazy(() => import('./components/views/Errors'));
const Issues = lazy(() => import('./components/views/Issues'));
const Appreciations = lazy(() => import('./components/views/Appreciations'));
const WarningLetters = lazy(() => import('./components/views/WarningLetters'));
const Attendance = lazy(() => import('./components/views/Attendance'));
const Settings = lazy(() => import('./components/views/Settings'));
const Leaves = lazy(() => import('./components/views/Leaves'));
const ShiftRoster = lazy(() => import('./components/views/ShiftRoster'));
const Holiday = lazy(() => import('./components/views/Holiday'));
const LeavesCalendar = lazy(() => import('./components/views/LeavesCalendar'));
const HealthDashboard = lazy(() => import('./components/views/HealthDashboard'));
const EmployeeHealth = lazy(() => import('./components/views/EmployeeHealth'));
const TaskConfiguration = lazy(() => import('./components/views/TaskConfiguration'));
const EarnTrack = lazy(() => import('./components/views/EarnTrack'));
const EarnTrackWages = lazy(() => import('./components/views/EarnTrackWages'));

// UI Components
import Modal from './components/ui/Modal';
import Button from './components/ui/Button';

// Date formatting helpers (module-level so always in scope in production build)
const formatShortDate = (value) => {
  if (!value) return '';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const datePart = str.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toISOString().slice(0, 10);
};
const formatPrettyDate = (value) => {
  const ymd = formatShortDate(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
};

// Main App Component with Authentication
const AppContent = () => {
  const { isAuthenticated, isLoading, login } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  // Show main app if authenticated
  return <AuthenticatedApp />;
};

// Authenticated App Component
const AuthenticatedApp = () => {
  const { logout, user } = useAuth();
  
  // Consolidated state management
  const [appState, setAppState] = useState({
    view: user?.email === 'admin@daataadirect.co.uk' ? 'dashboard' : 'myHealth',
    searchTerm: '',
    taskToOpen: null,
    loading: true,
    openDepartment: null
  });

  const [dataState, setDataState] = useState({
    employees: [],
    departments: [],
    designations: [],
    tasks: [],
    taskCategories: [],
    projects: [],
    taskLabels: [],
    milestones: [],
    errors: {}
  });

  // Helper functions for state updates
  const updateAppState = (updates) => {
    setAppState(prev => ({ ...prev, ...updates }));
  };

  const updateDataState = (updates) => {
    setDataState(prev => {
      const newState = { ...prev, ...updates };
      // Ensure tasks is always an array
      if (newState.tasks !== undefined && !Array.isArray(newState.tasks)) {
        newState.tasks = [];
      }
      // Ensure employees is always an array
      if (newState.employees !== undefined && !Array.isArray(newState.employees)) {
        newState.employees = [];
      }
      return newState;
    });
  };

  // Destructured state for easier access
  const { view, searchTerm, taskToOpen, loading, openDepartment } = appState;
  const { employees, departments, designations, tasks, taskCategories, projects, taskLabels, milestones, errors } = dataState;

  // Timer functions
  const startTimer = async (taskId) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/start-timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Refresh tasks to get updated timer data
        const tasksHeaders = {};
        if (user) {
          tasksHeaders['user-role'] = user.role || 'employee';
          tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
          tasksHeaders['user-name'] = user.name || '';
        }
        const tasksResponse = await fetch('/api/tasks', { headers: tasksHeaders });
        if (tasksResponse.ok) {
          const updatedTasks = await tasksResponse.json();
          updateDataState({ tasks: updatedTasks });
        }
      } else {
        console.error('Failed to start timer');
      }
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  };

  const stopTimer = async (taskId) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/stop-timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loggedSeconds: 0 }),
      });

      if (response.ok) {
        // Refresh tasks to get updated timer data
        const tasksHeaders = {};
        if (user) {
          tasksHeaders['user-role'] = user.role || 'employee';
          tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
          tasksHeaders['user-name'] = user.name || '';
        }
        const tasksResponse = await fetch('/api/tasks', { headers: tasksHeaders });
        if (tasksResponse.ok) {
          const updatedTasks = await tasksResponse.json();
          updateDataState({ tasks: updatedTasks });
        }
      } else {
        console.error('Failed to stop timer');
      }
    } catch (error) {
      console.error('Error stopping timer:', error);
    }
  };

  // Fetch data based on user role with optimized loading
  useEffect(() => {
    const fetchData = async () => {
      try {
        updateAppState({ loading: true });
        
        // Fetch dashboard data from new endpoint
        const dashboardResponse = await fetch('/api/dashboard');
        
        if (dashboardResponse.ok) {
          const dashboardData = await dashboardResponse.json();
          
          // Set dashboard data with additional safety checks
          updateDataState({
            tasks: Array.isArray(dashboardData.recentTasks) ? dashboardData.recentTasks : [],
            employees: Array.isArray(dashboardData.recentEmployees) ? dashboardData.recentEmployees : []
          });
          
          // Also fetch departments separately for other views
          const departmentsResponse = await fetch('/api/departments');
          if (departmentsResponse.ok) {
            const departmentsData = await departmentsResponse.json();
            updateDataState({ departments: departmentsData });
          }
        } else {
          // Fallback to individual endpoints if dashboard fails with pagination
          let tasksUrl = '/api/tasks?all=true';
          if (user) {
            const params = new URLSearchParams({
              user_id: user.id,
              role: user.role,
              employee_name: user.name || '',
              all: 'true'
            });
            tasksUrl = `/api/tasks?${params.toString()}`;
          }
          
          // Prepare headers with user permissions for the tasks request (same as TimerModal)
          const tasksHeaders = {};
          if (user) {
            tasksHeaders['user-role'] = user.role || 'employee';
            tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
            tasksHeaders['user-name'] = user.name || '';
          }
          
          const [tasksResponse, employeesResponse, departmentsResponse] = await Promise.all([
            fetch(tasksUrl, { headers: tasksHeaders }),
            fetch('/api/employees?page=1&limit=20'),
            fetch('/api/departments')
          ]);

          if (tasksResponse.ok && employeesResponse.ok && departmentsResponse.ok) {
            const tasksData = await tasksResponse.json();
            const employeesData = await employeesResponse.json();
            const departmentsData = await departmentsResponse.json();

            // Handle paginated responses
            updateDataState({
              tasks: Array.isArray(tasksData.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []),
              employees: Array.isArray(employeesData.data) ? employeesData.data : (Array.isArray(employeesData) ? employeesData : []),
              departments: Array.isArray(departmentsData) ? departmentsData : []
            });
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        updateAppState({ loading: false });
      }
    };

    fetchData();
  }, [user]);

  // Global check for pending leave actions (swap / acknowledge / rejected-swap for booker)
  // so that modals are shown regardless of the current view. Poll so the booker
  // sees "you can set your date back" soon after admin rejects.
  useEffect(() => {
    const checkPendingLeaves = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`/api/leaves/pending-actions?employee_id=${user.id}`, {
          headers: {
            'x-user-role': user.role || 'employee',
            'x-user-id': String(user.id),
          },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const swap = (data.swapRequests || [])[0] || null;
        const ack = (data.acknowledgeRequests || [])[0] || null;
        const rejected = data.rejected_swap_notifications || [];
        setLeaveRejectedSwapNotifications(rejected);
        if (ack && (user.role === 'admin' || user.role === 'Admin')) {
          setLeavePendingModal({ type: 'ack', data: ack });
        } else if (swap) {
          setLeavePendingModal({ type: 'swap', data: swap });
        } else {
          setLeavePendingModal(null);
        }
      } catch {
        // ignore failures here; user can still navigate to Leaves manually
      }
    };

    checkPendingLeaves();
    const interval = setInterval(checkPendingLeaves, 90 * 1000); // poll every 90s so booker gets "revert date" popup after admin rejects
    return () => clearInterval(interval);
  }, [user]);

  // Listen to department open events
  useEffect(() => {
    const handler = (e) => {
      startTransition(() => {
        updateAppState({ openDepartment: e.detail.department, view: 'departments' });
      });
    };
    window.addEventListener('open-department-dashboard', handler);
    return () => window.removeEventListener('open-department-dashboard', handler);
  }, []);

  // Modal states
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: '',
    editingItem: null
  });

  // Destructure modal state
  const { isOpen: isModalOpen, type: modalType, editingItem } = modalState;

  // Global leave pending modal (swap / acknowledge) – shown regardless of current view
  const [leavePendingModal, setLeavePendingModal] = useState(null); // { type: 'swap'|'ack', data }
  const [leaveRejectedSwapNotifications, setLeaveRejectedSwapNotifications] = useState([]); // booker: "you can set date back"

  // Filter states
  const [filters, setFilters] = useState({});

  // Handle view changes
  const handleViewChange = (newView) => {
    console.log('View changing from', view, 'to', newView);
    updateAppState({ view: newView });
  };

  // Handle search
  const handleSearch = (term) => {
    updateAppState({ searchTerm: term });
  };

  // Modal controls
  const openModal = (type, item = null) => {
    setModalState({ isOpen: true, type, editingItem: item });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, type: '', editingItem: null });
  };

  // Data handling
  const handleFormSubmit = (itemData, type, shouldClose = true) => {
    const errors = validateFormData(itemData, type);
    
    if (Object.keys(errors).length > 0) {
      updateDataState({ errors });
      return;
    }

    const newItem = {
      ...itemData,
      id: editingItem?.id || generateId(),
      createdAt: editingItem?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const setters = {
      employee: (data) => updateDataState({ employees: data }),
      department: (data) => updateDataState({ departments: data }),
      designation: (data) => updateDataState({ designations: data }),
      task: (data) => updateDataState({ tasks: data }),
      taskCategory: (data) => updateDataState({ taskCategories: data }),
      project: (data) => updateDataState({ projects: data }),
      taskLabel: (data) => updateDataState({ taskLabels: data }),
      milestone: (data) => updateDataState({ milestones: data }),
    };

    const setter = setters[type];
    if (setter) {
      setter(prev => {
        if (editingItem) {
          return prev.map(item => item.id === editingItem.id ? newItem : item);
        } else {
          return [...prev, newItem];
        }
      });
    }

    updateDataState({ errors: {} });
    if (shouldClose) {
      closeModal();
    }
  };

  // PHASE 2: Check if user has specific permission
  const hasPermission = (permission) => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role && user.role.toLowerCase() === 'admin') return true;
    if (user.user_role && user.user_role.toLowerCase() === 'admin') return true;
    if (user.permissions && Array.isArray(user.permissions) && user.permissions.includes('all')) return true;
    
    // Check specific permission
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }
    
    return false;
  };

  // PHASE 2: NoAccess component for users without sidebar access
  const NoAccess = () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="text-gray-400 mb-6">
          <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Access Restricted</h2>
        <p className="text-gray-600 mb-6">
          You don't have permission to access this section of the application.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700">
            <strong>Phase 2 Sidebar Control Active:</strong> Access is controlled by specific permissions.
            Please contact your system administrator for access.
          </p>
        </div>
        <div className="mt-6 text-xs text-gray-400">
          Logged in as: {user?.name || user?.email || 'Unknown User'} 
          <br />
          Role: {user?.role || user?.user_role || 'No Role Assigned'}
          <br />
          Has sidebar access: {hasPermission('view_sidebar') ? 'Yes' : 'No'}
        </div>
      </div>
    </div>
  );

  // Loading component for Suspense
  const LoadingFallback = () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      <span className="ml-3 text-gray-600">Loading...</span>
    </div>
  );

  // Render current view
  const renderCurrentView = () => {
    console.log('Current view:', view);
    
    // PHASE 2: Block all views for users without sidebar access
    if (!hasPermission('view_sidebar')) {
      return <NoAccess />;
    }
    
    switch (view) {
      case 'dashboard':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Dashboard 
              employees={employees}
              tasks={tasks}
              departments={departments}
            />
          </Suspense>
        );
      case 'employees':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Employees />
          </Suspense>
        );
      case 'tasks':
        console.log('Rendering Tasks component');
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Tasks 
              initialOpenTask={taskToOpen}
              onConsumeInitialOpenTask={() => updateAppState({ taskToOpen: null })}
            />
          </Suspense>
        );
      case 'departments':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Departments />
          </Suspense>
        );
      case 'designations':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Designations />
          </Suspense>
        );
      case 'labels':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Labels />
          </Suspense>
        );
      case 'taskConfiguration':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <TaskConfiguration />
          </Suspense>
        );
      case 'leaves':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Leaves
              key="leaves"
              initialManagerSection={user?.role === 'admin' || user?.role === 'Admin' ? 'department' : undefined}
            />
          </Suspense>
        );
      case 'leaves_main':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Leaves
              key="leaves_main"
              initialManagerSection={user?.role === 'admin' || user?.role === 'Admin' ? 'department' : undefined}
            />
          </Suspense>
        );
      case 'leaves_acknowledge':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Leaves key="leaves_acknowledge" initialTab="acknowledge" initialManagerSection="department" />
          </Suspense>
        );
      case 'leaves_acknowledge_history':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Leaves key="leaves_acknowledge_history" initialTab="ack_history" initialManagerSection="department" />
          </Suspense>
        );
      case 'shiftRoster':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ShiftRoster />
          </Suspense>
        );
      case 'holiday':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Holiday />
          </Suspense>
        );
      case 'myHealth':
        // Redirect admin@daataadirect.co.uk to dashboard since they don't have health data
        if (user?.email === 'admin@daataadirect.co.uk') {
          updateAppState({ view: 'dashboard' });
          return (
            <Suspense fallback={<LoadingFallback />}>
              <Dashboard 
                employees={employees}
                tasks={tasks}
                departments={departments}
              />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EmployeeHealth employeeId={user?.id} />
          </Suspense>
        );
      case 'healthDashboard':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <HealthDashboard />
          </Suspense>
        );
      case 'reports':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Reports />
          </Suspense>
        );
      case 'earntrack':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EarnTrack />
          </Suspense>
        );
      case 'earnTrackWages':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EarnTrackWages />
          </Suspense>
        );
      case 'noticeBoard':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <NoticeBoard />
          </Suspense>
        );
      case 'tickets':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Tickets />
          </Suspense>
        );
      case 'errors':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Errors />
          </Suspense>
        );
      case 'issues':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Issues />
          </Suspense>
        );
      case 'appreciations':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Appreciations />
          </Suspense>
        );
      case 'warning-letters':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <WarningLetters />
          </Suspense>
        );
      case 'attendance':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Attendance />
          </Suspense>
        );
      case 'calendar':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LeavesCalendar />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Settings />
          </Suspense>
        );
      default:
        // Default to dashboard for admin@daataadirect.co.uk, health for others
        if (user?.email === 'admin@daataadirect.co.uk') {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <Dashboard 
                employees={employees}
                tasks={tasks}
                departments={departments}
              />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EmployeeHealth employeeId={user?.id} />
          </Suspense>
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar - flex-shrink-0 so it keeps fixed width and doesn't participate in overflow */}
      <div className="flex-shrink-0 h-screen">
        <Sidebar currentView={view} onViewChange={handleViewChange} />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          onSearch={handleSearch} 
          onLogout={logout}
          tasks={tasks}
          employees={employees}
          onStartTimer={startTimer}
          onStopTimer={stopTimer}
          onOpenTask={(task) => {
            updateAppState({ taskToOpen: task, view: 'tasks' });
          }}
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading...</p>
              </div>
            </div>
          ) : (
            openDepartment ? (
              <DepartmentDashboard department={openDepartment} onClose={() => updateAppState({ openDepartment: null })} />
            ) : (
              renderCurrentView()
            )
          )}
        </main>
      </div>

      {/* Generic CRUD Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`${editingItem ? 'Edit' : 'Add'} ${modalType}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            {modalType} form will be implemented here.
          </p>
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary">
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Global leave swap / acknowledge modal – shown regardless of current view */}
      {leavePendingModal && leavePendingModal.type === 'swap' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" aria-modal="true" role="dialog">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200/80">
            <div className="px-6 py-5 bg-amber-50 border-b border-amber-100">
              <h3 className="text-lg font-semibold text-gray-900">Leave swap request</h3>
              <p className="text-sm text-amber-800 mt-1">A colleague has requested leave on dates you currently have booked.</p>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Your booked leave</div>
                <div className="font-medium text-gray-900">
                  {formatPrettyDate(leavePendingModal.data.my_start_date)}
                  {leavePendingModal.data.my_end_date && String(formatShortDate(leavePendingModal.data.my_end_date)) !== String(formatShortDate(leavePendingModal.data.my_start_date))
                    ? ` – ${formatPrettyDate(leavePendingModal.data.my_end_date)}`
                    : ''}
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <div className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-1">Requested period</div>
                <div className="font-medium text-gray-900">
                  {formatPrettyDate(leavePendingModal.data.start_date)}
                  {leavePendingModal.data.end_date && String(formatShortDate(leavePendingModal.data.end_date)) !== String(formatShortDate(leavePendingModal.data.start_date))
                    ? ` – ${formatPrettyDate(leavePendingModal.data.end_date)}`
                    : ''}
                </div>
                {leavePendingModal.data.emergency_type && (
                  <div className="mt-1 text-xs text-amber-800">
                    Reason: {leavePendingModal.data.emergency_type}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600">
                To respond, open the <span className="font-semibold">Leaves</span> screen and use the swap popup there.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setLeavePendingModal(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {leavePendingModal && leavePendingModal.type === 'ack' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" aria-modal="true" role="dialog">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200/80">
            <div className="px-6 py-5 bg-gradient-to-b from-amber-50 to-amber-50/80 border-b border-amber-100">
              <h3 className="text-lg font-semibold text-gray-900">Leave requires acknowledgment</h3>
              <p className="text-sm text-amber-800 mt-1">An employee has a leave request on an important or booked date.</p>
            </div>
            <div className="px-6 py-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-500">Employee</span>
                <span className="text-gray-900">{leavePendingModal.data.employee_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-500">Dates</span>
                <span className="text-gray-900">
                  {formatPrettyDate(leavePendingModal.data.start_date)}
                  {leavePendingModal.data.end_date && String(formatShortDate(leavePendingModal.data.end_date)) !== String(formatShortDate(leavePendingModal.data.start_date))
                    ? ` – ${formatPrettyDate(leavePendingModal.data.end_date)}`
                    : ''}
                </span>
              </div>
              {(leavePendingModal.data.emergency_type || leavePendingModal.data.reason) && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Reason</span>
                  <span className="text-gray-900">{leavePendingModal.data.emergency_type || leavePendingModal.data.reason}</span>
                </div>
              )}
              {leavePendingModal.data.requested_swap_with_leave_id != null && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Booker has swapped</span>
                  <span className="text-gray-900 font-medium">
                    {leavePendingModal.data.booker_has_swapped === true ? 'Yes' : leavePendingModal.data.booker_has_swapped === false ? 'No' : '—'}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-600 mt-2">
                Open the <span className="font-semibold">Department → Acknowledge</span> section to review and either acknowledge or reject this leave.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setLeavePendingModal(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booker: leave request that asked to swap with your leave was rejected – you can set your date back */}
      {leaveRejectedSwapNotifications.length > 0 && (user?.role !== 'admin' && user?.role !== 'Admin') && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" aria-modal="true" role="dialog">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200/80">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Request rejected</h3>
              <p className="text-sm text-gray-600 mt-1">
                The following leave request(s) that asked to swap with your leave have been rejected. You can set your date back if you had moved it.
              </p>
            </div>
            <div className="px-6 py-4">
              <ul className="text-sm text-gray-700 space-y-1">
                {leaveRejectedSwapNotifications.map((n) => (
                  <li key={n.rejected_leave_id}>
                    Request for {formatPrettyDate(n.start_date)}
                    {n.end_date && formatShortDate(n.end_date) !== formatShortDate(n.start_date) ? ` – ${formatPrettyDate(n.end_date)}` : ''} was rejected.
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-6 py-4 flex justify-end bg-gray-50/80 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setLeaveRejectedSwapNotifications([])}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main App Component
export default function App() {
  return (
    <AuthProvider>
      <TaskConfigProvider>
        <AppContent />
      </TaskConfigProvider>
    </AuthProvider>
  );
} 