import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PermissionsManager from './PermissionsManager';
import { HelpCircle } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('roles');
  const [showHelp, setShowHelp] = useState(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'roles'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Roles & Permissions
          </button>
        </nav>
      </div>

      {/* Settings explanation (admin section) */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-2 w-full text-left font-medium text-gray-800 hover:text-blue-600"
        >
          <HelpCircle className="w-5 h-5 text-blue-600 shrink-0" />
          <span>What do these settings do?</span>
          <span className="ml-auto text-gray-500 text-sm font-normal">{showHelp ? 'Hide' : 'Show'}</span>
        </button>
        {showHelp && (
          <div className="mt-3 text-sm text-gray-700 space-y-2 pl-7">
            <p><strong>Roles & Permissions</strong> control what each user can see and do in the app.</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li><strong>Roles</strong> — Create and edit roles (e.g. Admin, Manager, Employee). Each role has a set of permissions.</li>
              <li><strong>Permissions</strong> — Fine-grained access (e.g. view tasks, create leaves, see notifications). They are grouped by area: Sidebar, Dashboard, Employees, Tasks, Attendance, Tickets, Notice Board, Reports, Notifications, etc.</li>
              <li><strong>Assigning</strong> — When you add or edit an employee, you choose their role. That role’s permissions define their menu items and actions (e.g. who can approve leaves, create tickets, or see LHE/OverEst notifications).</li>
              <li><strong>Admin</strong> — Users with the Admin role (or the &quot;all&quot; permission) have full access regardless of other permissions.</li>
            </ul>
          </div>
        )}
      </div>

      {/* Roles & Permissions Tab */}
      {activeTab === 'roles' && <PermissionsManager />}
    </div>
  );
} 