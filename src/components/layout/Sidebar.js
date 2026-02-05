import React from 'react';
import { 
  Home, 
  Users, 
  Briefcase, 
  BarChart2, 
  Building,
  Calendar,
  Settings,
  Award,
  Tag,
  AlertTriangle,
  Clock,
  ThumbsUp,
  ChevronDown,
  MessageSquare,
  Heart,
  Megaphone,
  Wallet,
  DollarSign,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TicketMenuItem from './TicketMenuItem';
import NoticeBoardMenuItem from './NoticeBoardMenuItem';

const Sidebar = ({ currentView, onViewChange }) => {
  const { user } = useAuth();
  const [hrOpen, setHROpen] = React.useState(true);
  const [tmOpen, setTMOpen] = React.useState(true);
  
  // Check if user has specific permission
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

  // Manager by designation (can access Reports for consolidated log only)
  const isManagerByDesignation = () => {
    if (!user || !user.designation) return false;
    return String(user.designation).trim().toLowerCase() === 'manager';
  };

  // Reports menu: show if user has reports permission OR is manager by designation
  const canAccessReports = () => hasPermission('view_reports_menu') || isManagerByDesignation();

  const isAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.user_role === 'admin' || user?.user_role === 'Admin';
  const isManager = !!user?.is_manager || (user?.designation && String(user.designation).toLowerCase().includes('manager'));

  // Define menu items with permission filtering
  const getMenuItems = () => {
    const allMenuItems = [
      // Hide My Health for admin user since they don't have health data
      ...(user?.email !== 'admin@daataadirect.co.uk' ? [{ id: 'myHealth', label: 'My Health', icon: Heart, permission: 'view_own_health' }] : []),
      { 
        id: 'dashboard', 
        label: 'Dashboard', 
        icon: Home,
        permission: 'view_dashboard_menu'
      },
      { 
        group: 'tm', 
        label: 'Task Management', 
        icon: Briefcase,
        permission: 'view_tasks_menu',
        children: [
          { id: 'tasks', label: 'Tasks', icon: Briefcase, permission: 'view_tasks_submenu' },
          { id: 'labels', label: 'Labels', icon: Tag, permission: 'view_labels_submenu' },
          { id: 'taskConfiguration', label: 'Task Configuration', icon: Settings, permission: 'view_task_config_submenu' },
        ]
      },
      { 
        group: 'hr', 
        label: 'HR', 
        icon: Users,
        permission: 'view_hr_menu',
        children: [
          { id: 'employees', label: 'Employees', icon: Users, permission: 'view_employees_submenu' },
          { id: 'errors', label: 'Errors', icon: AlertTriangle, permission: 'view_errors_submenu' },
          { id: 'issues', label: 'Issues', icon: AlertTriangle, permission: 'view_errors_submenu' },
          { id: 'leaves', label: 'Leaves', icon: Calendar, permission: 'view_leaves_submenu' },
          // Manager/admin-only subsections under Leaves
          ...(isAdmin || isManager
            ? [
                { id: 'leaves_department_pending', label: 'Dept Pending Leaves', icon: Eye, permission: 'view_leaves_submenu' },
                { id: 'leaves_department_approved', label: 'Dept Approved Leaves', icon: Eye, permission: 'view_leaves_submenu' },
                { id: 'leaves_department_rejected', label: 'Dept Rejected Leaves', icon: Eye, permission: 'view_leaves_submenu' },
                { id: 'leaves_mark_uninformed', label: 'Mark Uninformed Leaves', icon: EyeOff, permission: 'view_leaves_submenu' },
              ]
            : []),
          { id: 'shiftRoster', label: 'Shift Roster', icon: Clock, permission: 'view_shift_roster_submenu' },
          { id: 'attendance', label: 'Attendance', icon: Clock, permission: 'view_attendance_submenu' },
          { id: 'holiday', label: 'Holiday', icon: Calendar, permission: 'view_holiday_submenu' },
          { id: 'designations', label: 'Designations', icon: Award, permission: 'view_designations_submenu' },
          { id: 'departments', label: 'Departments', icon: Building, permission: 'view_departments_submenu' },
          { id: 'appreciations', label: 'Appreciations', icon: ThumbsUp, permission: 'view_appreciations_submenu' },
          { id: 'warning-letters', label: 'Warning Letters', icon: AlertTriangle, permission: 'view_warning_letters_submenu' },
        ]
      },
      { id: 'healthDashboard', label: 'Health Dashboard', icon: AlertTriangle, permission: 'view_health_dashboard_menu' },
      { id: 'reports', label: 'Reports', icon: BarChart2, permission: 'view_reports_menu', specialAccess: canAccessReports },
      { id: 'earntrack', label: 'EarnTrack', icon: Wallet, permission: null },
      { id: 'earnTrackWages', label: 'Wages Tracker', icon: DollarSign, adminOnly: true },
      { id: 'noticeBoard', label: 'Notice Board', icon: Megaphone, permission: 'view_notice_board_menu', isSpecial: true },
      { id: 'tickets', label: 'Tickets', icon: MessageSquare, permission: null, isSpecial: true },
      { id: 'calendar', label: 'Calendar', icon: Calendar, permission: 'view_calendar_menu' },
      { id: 'settings', label: 'Settings', icon: Settings, permission: 'view_settings_menu' },
    ];

    // Filter menu items based on user permissions
    const isAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.user_role === 'admin' || user?.user_role === 'Admin';
    return allMenuItems.filter(item => {
      // Admin-only items (e.g. Earn Track Wages) show only for admins
      if (item.adminOnly) return isAdmin;
      // If item has no permission requirement, show it
      if (!item.permission) return true;
      // If item has specialAccess (e.g. Reports for managers by designation), show when that passes
      if (typeof item.specialAccess === 'function' && item.specialAccess()) return true;
      // Check if user has the required permission
      return hasPermission(item.permission);
    }).map(item => {
      // If it's a group with children, filter the children too
      if (item.children) {
        return {
          ...item,
          children: item.children.filter(child => {
            if (!child.permission) return true;
            return hasPermission(child.permission);
          })
        };
      }
      return item;
    }).filter(item => {
      // Remove groups that have no visible children
      if (item.children && item.children.length === 0) {
        return false;
      }
      return true;
    });
  };

  const menuItems = getMenuItems();

  return (
    <div className="w-64 flex flex-col bg-white shadow-lg h-screen overflow-hidden">
      <div className="flex-shrink-0 p-6">
        <h1 className="text-2xl font-bold text-indigo-600">EMS</h1>
        <p className="text-sm text-gray-500">Employee Management System</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto mt-2 pb-4">
        {menuItems.map((item) => {
          if (item.group === 'hr') {
            const Icon = item.icon;
            return (
              <div key="hr" className="mb-2">
                <button
                  onClick={() => setHROpen(!hrOpen)}
                  className={`w-full flex items-center justify-between px-6 py-3 text-left transition-colors ${
                    hrOpen ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center">
                    <Icon className="w-5 h-5 mr-3" />
                    {item.label}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${hrOpen ? 'rotate-180' : ''}`} />
                </button>
                {hrOpen && (
                  <div className="ml-10 mt-2 space-y-1">
                    {item.children.map((child) => {
                      const CIcon = child.icon;
                      const isActive = currentView === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => onViewChange(child.id)}
                          className={`w-full flex items-center px-2 py-2 text-left text-sm rounded ${isActive ? 'text-indigo-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                          <CIcon className="w-4 h-4 mr-2" /> {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          if (item.group === 'tm') {
            const Icon = item.icon;
            return (
              <div key="tm" className="mb-2">
                <button
                  onClick={() => setTMOpen(!tmOpen)}
                  className={`w-full flex items-center justify-between px-6 py-3 text-left transition-colors ${
                    tmOpen ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center">
                    <Icon className="w-5 h-5 mr-3" />
                    {item.label}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${tmOpen ? 'rotate-180' : ''}`} />
                </button>
                {tmOpen && (
                  <div className="ml-10 mt-2 space-y-1">
                    {item.children.map((child) => {
                      const CIcon = child.icon;
                      const isActive = currentView === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => onViewChange(child.id)}
                          className={`w-full flex items-center px-2 py-2 text-left text-sm rounded ${isActive ? 'text-indigo-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                          <CIcon className="w-4 h-4 mr-2" /> {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Handle special menu items
          if (item.isSpecial && item.id === 'tickets') {
            return <TicketMenuItem key={item.id} currentView={currentView} onViewChange={onViewChange} />;
          }
          
          if (item.isSpecial && item.id === 'noticeBoard') {
            return <NoticeBoardMenuItem key={item.id} currentView={currentView} onViewChange={onViewChange} />;
          }

          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`
                w-full flex items-center px-6 py-3 text-left transition-colors
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Sidebar; 