import React, { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  Calendar,
  BarChart3,
  Settings,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Bell
} from 'lucide-react';

const PermissionsManager = () => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [roleFormData, setRoleFormData] = useState({ name: '', description: '', permissions: [] });
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  // Dynamic permission structure - will be loaded from database
  const [permissionModules, setPermissionModules] = useState([]);

  // Simple permission toggle (no more complex scopes)
  const hasPermission = (role, permissionName) => {
    if (!role || !role.permissions) return false;
    
    let permissions;
    try {
      permissions = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;
    } catch (e) {
      permissions = [];
    }
    
    // Check for "all" permission first - this grants access to everything
    if (permissions.includes('all')) {
      return true;
    }
    
    return permissions.includes(permissionName);
  };

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, []);

  // Add effect to refresh data when component comes back into focus
  useEffect(() => {
    const handleFocus = () => {
      console.log('🔄 PermissionsManager component focused - refreshing data...');
      fetchRoles();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/roles');
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Fetched roles data:', data);
        
        // Debug: Check permissions format for each role
        data.forEach(role => {
          console.log(`🔍 Role "${role.name}" permissions:`, {
            type: typeof role.permissions,
            value: role.permissions,
            isArray: Array.isArray(role.permissions)
          });
        });
        
        setRoles(data);
        if (data.length > 0) {
          // If we have a selectedRole, update it with fresh data from database
          if (selectedRole) {
            const freshSelectedRole = data.find(r => r.id === selectedRole.id);
            if (freshSelectedRole) {
              setSelectedRole(freshSelectedRole);
            } else {
              // If selected role no longer exists, select first role
              setSelectedRole(data[0]);
            }
          } else {
            // No role selected yet, select first role
            setSelectedRole(data[0]);
          }
        }
      } else {
        throw new Error('Failed to fetch roles');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await fetch('/api/permissions');
      if (response.ok) {
        const permissions = await response.json();
        
        // Group permissions by module based on actual database categories
        const modules = [
          {
            id: 'sidebar',
            name: 'Sidebar Navigation',
            icon: Settings,
            description: 'PHASE 2: Control which sidebar menu items users can see',
            permissions: permissions.filter(p => p.category === 'Sidebar Navigation')
          },
          {
            id: 'dashboard',
            name: 'Dashboard',
            icon: BarChart3,
            description: 'Access to main dashboard and overview',
            permissions: permissions.filter(p => p.category === 'Dashboard' || p.name.includes('dashboard'))
          },
          {
            id: 'employees',
            name: 'Employees',
            icon: Users,
            description: 'Manage employee information and records',
            permissions: permissions.filter(p => p.category === 'Employees' || p.name.includes('employee'))
          },
          {
            id: 'tasks',
            name: 'Tasks',
            icon: FileText,
            description: 'Manage and assign tasks',
            permissions: permissions.filter(p => 
              p.category === 'Task Management' || 
              p.name.toLowerCase().includes('task') ||
              p.name.toLowerCase().includes('timer')
            )
          },
          {
            id: 'attendance',
            name: 'Attendance',
            icon: Calendar,
            description: 'Track employee attendance and time',
            permissions: permissions.filter(p => p.category === 'Attendance' || p.name.includes('attendance'))
          },
          {
            id: 'tickets',
            name: 'Tickets',
            icon: MessageSquare,
            description: 'Manage support tickets and communication',
            permissions: permissions.filter(p => p.category === 'Tickets' || p.name.includes('ticket'))
          },
          {
            id: 'notice_board',
            name: 'Notice Board',
            icon: Megaphone,
            description: 'Manage company notices and announcements',
            permissions: permissions.filter(p => p.category === 'Notice Board' || p.name.includes('notice'))
          },
          {
            id: 'reports',
            name: 'Reports',
            icon: BarChart3,
            description: 'Generate and view various reports',
            permissions: permissions.filter(p => p.category === 'Reports' || p.name.includes('report'))
          },
          {
            id: 'settings',
            name: 'Settings',
            icon: Settings,
            description: 'System configuration and user management',
            permissions: permissions.filter(p => p.category === 'Settings' || p.name.includes('setting'))
          },
          {
            id: 'notifications',
            name: 'Notifications',
            icon: Bell,
            description: 'Control access to different types of notifications',
            permissions: permissions.filter(p => p.category === 'Notifications' || p.name.includes('dwm_view') || p.name.includes('clet_view') || p.name.includes('ca_view'))
          }
        ];
        
        console.log('Loaded permissions from database:', permissions);
        console.log('Grouped into modules:', modules);
        
        // Debug: Log tasks module specifically
        const tasksModule = modules.find(m => m.id === 'tasks');
        if (tasksModule) {
          console.log('🔍 Tasks Module Debug:');
          console.log('  - Total permissions found:', tasksModule.permissions.length);
          console.log('  - Permissions:', tasksModule.permissions.map(p => `${p.name} (${p.category})`));
          
          // Additional debugging
          console.log('🔍 Raw permissions data:');
          console.log('  - All permissions count:', permissions.length);
          console.log('  - Permissions with "task" in name:', permissions.filter(p => p.name.toLowerCase().includes('task')).length);
          console.log('  - Permissions with "timer" in name:', permissions.filter(p => p.name.toLowerCase().includes('timer')).length);
          console.log('  - Permissions with category "Task Management":', permissions.filter(p => p.category === 'Task Management').length);
        }
        
        setPermissionModules(modules);
      } else {
        throw new Error('Failed to fetch permissions');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const getPermissionValue = (role, permissionName) => {
    if (!role || !role.permissions) {
      console.log(`🔍 getPermissionValue: No role or permissions for ${permissionName}`, { role });
      return false;
    }

    let permissions;
    try {
      // Handle different data types for permissions
      if (typeof role.permissions === 'string') {
        permissions = JSON.parse(role.permissions);
        console.log(`🔍 Parsed string permissions for role ${role.name}:`, permissions);
      } else if (Array.isArray(role.permissions)) {
        permissions = role.permissions;
        console.log(`🔍 Using array permissions for role ${role.name}:`, permissions);
      } else if (role.permissions === null || role.permissions === undefined) {
        permissions = [];
        console.log(`🔍 No permissions for role ${role.name}, using empty array`);
      } else {
        // Handle object format: { "permission_name": true/false }
        if (typeof role.permissions === 'object' && !Array.isArray(role.permissions)) {
          const result = role.permissions[permissionName] === true;
          console.log(`🔍 Object permissions for role ${role.name}, ${permissionName}: ${result}`);
          return result;
        }
        console.warn('Unexpected permissions format in getPermissionValue:', role.permissions);
        permissions = [];
      }
      
      // Ensure permissions is always an array for array-based logic
      if (!Array.isArray(permissions)) {
        console.warn('Permissions is not an array after parsing in getPermissionValue, resetting to empty array');
        permissions = [];
      }
    } catch (e) {
      console.error('Error parsing permissions in getPermissionValue:', e);
      permissions = [];
    }

    // Check for "all" permission first - this grants access to everything
    if (permissions.includes('all')) {
      console.log(`🔍 Permission check for ${permissionName} in role ${role.name}: true (permissions: all - universal grant)`);
      return true;
    }
    
    const hasPermission = permissions.includes(permissionName);
    console.log(`🔍 Permission check for ${permissionName} in role ${role.name}: ${hasPermission} (permissions: ${JSON.stringify(permissions)})`);
    console.log(`🔍 Looking for: "${permissionName}" in array: [${permissions.map(p => `"${p}"`).join(', ')}]`);
    return hasPermission;
  };

  const handlePermissionChange = (permissionName, checked) => {
    if (!selectedRole) return;

    let permissions;
    try {
      // Handle different data types for permissions
      if (typeof selectedRole.permissions === 'string') {
        permissions = JSON.parse(selectedRole.permissions);
      } else if (Array.isArray(selectedRole.permissions)) {
        permissions = [...selectedRole.permissions]; // Create a copy
      } else if (selectedRole.permissions === null || selectedRole.permissions === undefined) {
        permissions = {};
      } else if (typeof selectedRole.permissions === 'object' && !Array.isArray(selectedRole.permissions)) {
        // Handle object format: { "permission_name": true/false }
        permissions = { ...selectedRole.permissions }; // Create a copy
      } else {
        console.warn('Unexpected permissions format:', selectedRole.permissions);
        permissions = {};
      }
      
      // Handle object-based permissions
      if (typeof permissions === 'object' && !Array.isArray(permissions)) {
        permissions[permissionName] = checked;
        
        setSelectedRole({
          ...selectedRole,
          permissions: permissions
        });
        return;
      }
      
      // Handle array-based permissions (fallback)
      if (!Array.isArray(permissions)) {
        console.warn('Permissions is not an array after parsing, resetting to empty array');
        permissions = [];
      }

      if (checked) {
        // Add permission if not already present
        if (!permissions.includes(permissionName)) {
          permissions.push(permissionName);
        }
      } else {
        // Remove permission if present
        permissions = permissions.filter(p => p !== permissionName);
      }

      setSelectedRole({
        ...selectedRole,
        permissions: permissions
      });
    } catch (e) {
      console.error('Error parsing permissions:', e);
      permissions = {};
      
      // Set the permission directly
      permissions[permissionName] = checked;
      
      setSelectedRole({
        ...selectedRole,
        permissions: permissions
      });
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    try {
      setLoading(true);
      
      // Debug: Log what we're about to save
      console.log('💾 Saving permissions for role:', selectedRole.name);
      console.log('💾 Permissions being saved:', selectedRole.permissions);
      console.log('💾 Permissions type:', typeof selectedRole.permissions);
      
      const response = await fetch(`/api/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: selectedRole.name,
          description: selectedRole.description,
          permissions: selectedRole.permissions
        }),
      });

      if (response.ok) {
        const updatedRole = await response.json();
        setRoles(roles.map(r => r.id === updatedRole.id ? updatedRole : r));
        setSelectedRole(updatedRole);
        alert('Permissions saved successfully!');
      } else {
        throw new Error('Failed to save permissions');
      }
    } catch (err) {
      setError(err.message);
      alert('Error saving permissions: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleExpansion = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const handleAddRole = () => {
    setIsAddingRole(true);
    setRoleFormData({ name: '', description: '', permissions: [] });
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setRoleFormData({ 
      name: role.name, 
      description: role.description || '',
      permissions: role.permissions || []
    });
  };

  const handleRoleSubmit = async () => {
    try {
      setLoading(true);
      const url = editingRole
        ? `/api/roles/${editingRole.id}`
        : '/api/roles';

      const method = editingRole ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...roleFormData,
          permissions: roleFormData.permissions || []
        }),
      });

      if (response.ok) {
        await fetchRoles();
        setIsAddingRole(false);
        setEditingRole(null);
        setRoleFormData({ name: '', description: '', permissions: [] });
      } else {
        throw new Error('Failed to save role');
      }
    } catch (err) {
      setError(err.message);
      alert('Error saving role: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/roles/${roleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchRoles();
        if (selectedRole?.id === roleId) {
          setSelectedRole(roles.find(r => r.id !== roleId) || null);
        }
      } else {
        throw new Error('Failed to delete role');
      }
    } catch (err) {
      setError(err.message);
      alert('Error deleting role: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Debug: Log current state
  console.log('🔍 PermissionsManager render state:', {
    loading,
    rolesCount: roles.length,
    permissionModulesCount: permissionModules.length,
    selectedRole: selectedRole ? {
      id: selectedRole.id,
      name: selectedRole.name,
      permissionsType: typeof selectedRole.permissions,
      permissionsValue: selectedRole.permissions,
      permissionsCount: selectedRole.permissions ? 
        (Array.isArray(selectedRole.permissions) ? selectedRole.permissions.length : 'not array') : 
        'no permissions'
    } : 'no role selected'
  });
  
  // Debug: Log selected role permissions in detail
  if (selectedRole && selectedRole.permissions) {
    console.log('🔍 Selected Role Permissions Debug:', {
      roleName: selectedRole.name,
      permissionsType: typeof selectedRole.permissions,
      permissionsRaw: selectedRole.permissions,
      permissionsParsed: typeof selectedRole.permissions === 'string' ? JSON.parse(selectedRole.permissions) : selectedRole.permissions
    });
  }

  if (loading && (roles.length === 0 || permissionModules.length === 0)) {
    return <div className="flex justify-center items-center h-64">Loading permissions...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Roles & Permissions Management</h2>
        <p className="text-gray-600">Manage user roles and their access permissions across different modules</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - Role Management */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Roles</h3>
              <button
                onClick={handleAddRole}
                className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                Add Role
              </button>
            </div>

            {/* Role List */}
            <div className="space-y-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`p-3 rounded-md cursor-pointer transition-colors ${
                    selectedRole?.id === role.id
                      ? 'bg-blue-100 border border-blue-300'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-900">{role.name}</div>
                      {role.description && (
                        <div className="text-sm text-gray-500">{role.description}</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditRole(role);
                        }}
                        className="text-blue-600 hover:text-blue-800 p-1"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRole(role.id);
                        }}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add/Edit Role Form */}
            {(isAddingRole || editingRole) && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md">
                <h4 className="font-medium mb-3">
                  {editingRole ? 'Edit Role' : 'Add New Role'}
                </h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Role Name"
                    value={roleFormData.name}
                    onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={roleFormData.description}
                    onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRoleSubmit}
                      className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700"
                    >
                      {editingRole ? 'Update' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingRole(false);
                        setEditingRole(null);
                        setRoleFormData({ name: '', description: '', permissions: [] });
                      }}
                      className="bg-gray-500 text-white px-3 py-2 rounded-md text-sm hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Permissions Matrix */}
        <div className="lg:col-span-3">
          {selectedRole ? (
            <div className="bg-white rounded-lg shadow">
              {/* Header */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Permissions for: {selectedRole.name}
                    </h3>
                    {selectedRole.description && (
                      <p className="text-gray-600 mt-1">{selectedRole.description}</p>
                    )}
                  </div>
                  <button
                    onClick={handleSavePermissions}
                    disabled={loading}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle size={16} />
                    Save Changes
                  </button>
                </div>
              </div>

              {/* Permissions Matrix */}
              <div className="p-6">
                <div className="space-y-4">
                  {permissionModules.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 mb-4">
                        <Settings size={48} className="mx-auto" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Permissions</h3>
                      <p className="text-gray-600">Please wait while permissions are loaded from the database...</p>
                    </div>
                  ) : (
                    permissionModules.map((module) => {
                      const isExpanded = expandedModules.has(module.id);
                      const IconComponent = module.icon;

                      return (
                        <div key={module.id} className="border border-gray-200 rounded-lg">
                          {/* Module Header */}
                          <div
                            className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => toggleModuleExpansion(module.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <IconComponent className="text-blue-600" size={20} />
                                <div>
                                  <h4 className="font-medium text-gray-900">{module.name}</h4>
                                  <p className="text-sm text-gray-600">{module.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">
                                  {module.permissions.length} permissions
                                </span>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </div>
                            </div>
                          </div>

                          {/* Module Permissions */}
                          {isExpanded && (
                            <div className="p-4 border-t border-gray-200">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {module.permissions.map((permission) => (
                                  <div key={permission.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                    <div>
                                      <div className="font-medium text-gray-900">{permission.name}</div>
                                      <div className="text-sm text-gray-600">{permission.description}</div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={getPermissionValue(selectedRole, permission.name)}
                                        onChange={(e) => handlePermissionChange(permission.name, e.target.checked)}
                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                      />
                                      <span className="text-sm text-gray-600">Allow</span>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Settings size={48} className="mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Role</h3>
              <p className="text-gray-600">Choose a role from the left panel to manage its permissions</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
};

export default PermissionsManager;













