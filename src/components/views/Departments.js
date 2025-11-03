import React, { useState, useEffect } from 'react';
import { Plus, Upload, Search, Edit, Trash2, Building } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import ActionMenu from '../ui/ActionMenu';
import * as XLSX from 'xlsx';

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    manager: '',
    location: '',
    status: 'Active'
  });
  const [errors, setErrors] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/departments');
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      } else {
        console.error('Failed to fetch departments');
        // Show user-friendly error
        alert('Failed to load departments. Please refresh the page.');
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
      // Show user-friendly error
      alert('Error loading departments. Please check your connection and refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Department name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      const url = editingDepartment 
        ? `/api/departments/${editingDepartment.id}`
        : '/api/departments';
      
      const method = editingDepartment ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchDepartments();
        closeModal();
        setFormData({
          name: '',
          description: '',
          manager: '',
          location: '',
          status: 'Active'
        });
        setEditingDepartment(null);
      } else {
        console.error('Failed to save department');
      }
    } catch (error) {
      console.error('Error saving department:', error);
    }
  };

  const handleEdit = (department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      description: department.description || '',
      manager: department.manager || '',
      location: department.location || '',
      status: department.status
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this department?')) {
      return;
    }

    // Prevent multiple rapid delete clicks
    if (deletingId) {
      return;
    }

    setDeletingId(id);
    
    // Retry mechanism for delete operation
    const deleteWithRetry = async (retryCount = 0) => {
      try {
        const response = await fetch(`/api/departments/${id}`, {
          method: 'DELETE',
        });

        if (response.status === 503) {
          // Database connection lost, retry after delay
          if (retryCount < 3) {
            console.log(`Delete attempt ${retryCount + 1} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return deleteWithRetry(retryCount + 1);
          } else {
            throw new Error('Database connection lost after multiple retries');
          }
        }

        if (response.ok) {
          // Add a small delay to ensure the delete operation completes
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Fetch updated departments with timeout protection
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Fetch timeout')), 10000)
          );
          
          await Promise.race([
            fetchDepartments(),
            timeoutPromise
          ]);
        } else {
          console.error('Failed to delete department');
          // Show user-friendly error
          alert('Failed to delete department. Please try again.');
        }
      } catch (error) {
        console.error('Error deleting department:', error);
        
        if (error.message === 'Database connection lost after multiple retries') {
          alert('Database connection issue. Please refresh the page and try again.');
        } else if (error.message === 'Fetch timeout') {
          alert('Department deleted but there was a delay loading the updated list. Please refresh the page.');
          // Force refresh the departments list
          setLoading(true);
          try {
            await fetchDepartments();
          } catch (refreshError) {
            console.error('Failed to refresh departments:', refreshError);
            setLoading(false);
          }
        } else {
          alert('Error deleting department. Please try again.');
        }
      }
    };

    await deleteWithRetry();
    setDeletingId(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                  file.type === 'application/vnd.ms-excel')) {
      setSelectedFile(file);
    } else {
      alert('Please select a valid Excel file (.xlsx or .xls)');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/departments/import', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setImportResult(result);
        await fetchDepartments();
        setSelectedFile(null);
        setTimeout(() => {
          setShowImportModal(false);
          setImportResult(null);
        }, 5000);
      } else {
        const error = await response.json();
        console.error('Import error:', error);
        alert(`Import failed: ${error.error || 'Unknown error occurred'}`);
      }
    } catch (error) {
      console.error('Error importing departments:', error);
      alert('Import failed. Please check your connection and try again.');
    }
  };

  const handleDownloadSample = () => {
    const wsData = [
      ['Name', 'Description', 'Manager', 'Location', 'Status'],
      ['IT Department', 'Information Technology Department', 'John Smith', 'Floor 2', 'Active'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Departments');
    XLSX.writeFile(wb, 'department_template.xlsx');
  };

  const closeModal = () => {
    setShowAddModal(false);
    setShowImportModal(false);
    setEditingDepartment(null);
    setFormData({
      name: '',
      description: '',
      manager: '',
      location: '',
      status: 'Active'
    });
    setErrors({});
    setSelectedFile(null);
    setImportResult(null);
  };

  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.manager?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading departments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-600">Manage your organization's departments</p>
        </div>
        <div className="flex space-x-3">
          <Button
            onClick={() => setShowImportModal(true)}
            variant="secondary"
            className="flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Department</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search departments..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Departments Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDepartments.length > 0 ? (
                filteredDepartments.map((department) => (
                  <tr key={department.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open-department-dashboard', { detail: { department } }))}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {department.name}
                        </div>
                        {department.description && (
                          <div className="text-sm text-gray-500">
                            {department.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {department.manager || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {department.location || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        department.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {department.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <ActionMenu
                        onEdit={() => handleEdit(department)}
                        onDelete={() => handleDelete(department.id)}
                        itemType="department"
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    {searchTerm ? 'No departments found matching your search.' : 'No departments found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Department Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title={editingDepartment ? 'Edit Department' : 'Add New Department'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Department Name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            error={errors.name}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter department description..."
            />
          </div>

          <Input
            label="Manager"
            name="manager"
            value={formData.manager}
            onChange={handleInputChange}
            placeholder="Department manager name"
          />

          <Input
            label="Location"
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            placeholder="Department location"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editingDepartment ? 'Update Department' : 'Add Department'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={closeModal}
        title="Import Departments"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleDownloadSample}>
              Download Sample File
            </Button>
          </div>
          {importResult ? (
            <div className={`p-4 rounded-lg ${
              importResult.errorCount > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
            }`}>
              <p className="font-medium">{importResult.message}</p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc list-inside text-sm">
                    {importResult.errors.slice(0, 5).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Building className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-indigo-600 hover:text-indigo-500 font-medium">
                      Choose an Excel file
                    </span>
                    <span className="text-gray-500"> or drag and drop</span>
                  </label>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Excel files only (.xlsx, .xls)
                </p>
              </div>

              {selectedFile && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-700">
                    Selected file: <span className="font-medium">{selectedFile.name}</span>
                  </p>
                </div>
              )}

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Expected Excel Format:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Name</strong> (required) - Department name</li>
                  <li>• <strong>Description</strong> (optional) - Department description</li>
                  <li>• <strong>Manager</strong> (optional) - Department manager</li>
                  <li>• <strong>Location</strong> (optional) - Department location</li>
                  <li>• <strong>Status</strong> (optional) - Active or Inactive</li>
                </ul>
              </div>

              <div className="flex justify-end space-x-3">
                <Button variant="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile}
                >
                  Import Departments
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Departments; 