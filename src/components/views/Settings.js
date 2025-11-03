import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PermissionsManager from './PermissionsManager';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('roles');

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

      {/* Roles & Permissions Tab */}
      {activeTab === 'roles' && <PermissionsManager />}
    </div>
  );
} 