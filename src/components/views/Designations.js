import React, { useState, useEffect } from 'react';
import { Plus, Upload, Search, Edit, Trash2, Briefcase } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import * as XLSX from 'xlsx';

const Designations = () => {
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    department: '',
    level: '',
    status: 'Active'
  });
  const [errors, setErrors] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    fetchDesignations();
  }, []);

  const fetchDesignations = async () => {
    try {
      const response = await fetch('/api/designations');
      if (response.ok) {
        const data = await response.json();
        setDesignations(data);
      } else {
        console.error('Failed to fetch designations');
      }
    } catch (error) {
      console.error('Error fetching designations:', error);
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
      newErrors.name = 'Designation name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      const url = editingDesignation 
        ? `/api/designations/${editingDesignation.id}`
        : '/api/designations';
      
      const method = editingDesignation ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchDesignations();
        closeModal();
        setFormData({
          name: '',
          description: '',
          department: '',
          level: '',
          status: 'Active'
        });
        setEditingDesignation(null);
      } else {
        console.error('Failed to save designation');
      }
    } catch (error) {
      console.error('Error saving designation:', error);
    }
  };

  const handleEdit = (designation) => {
    setEditingDesignation(designation);
    setFormData({
      name: designation.name,
      description: designation.description || '',
      department: designation.department || '',
      level: designation.level || '',
      status: designation.status
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this designation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/designations/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDesignations();
      } else {
        console.error('Failed to delete designation');
      }
    } catch (error) {
      console.error('Error deleting designation:', error);
    }
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
      const response = await fetch('/api/designations/import', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setImportResult(result);
        await fetchDesignations();
        setSelectedFile(null);
        setTimeout(() => {
          setShowImportModal(false);
          setImportResult(null);
        }, 3000);
      } else {
        const error = await response.json();
        alert(`Import failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Error importing designations:', error);
      alert('Import failed. Please try again.');
    }
  };

  const handleDownloadSample = () => {
    const wsData = [
      ['Name', 'Description', 'Department', 'Level', 'Status'],
      ['Software Engineer', 'Develops software applications', 'IT Department', 'Mid-level', 'Active'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Designations');
    XLSX.writeFile(wb, 'designation_template.xlsx');
  };

  const closeModal = () => {
    setShowAddModal(false);
    setShowImportModal(false);
    setEditingDesignation(null);
    setFormData({
      name: '',
      description: '',
      department: '',
      level: '',
      status: 'Active'
    });
    setErrors({});
    setSelectedFile(null);
    setImportResult(null);
  };

  const filteredDesignations = designations.filter(designation =>
    designation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    designation.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    designation.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    designation.level?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading designations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Designations</h1>
          <p className="text-gray-600">Manage your organization's job designations</p>
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
            <span>Add Designation</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search designations..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Designations Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Designation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level
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
              {filteredDesignations.length > 0 ? (
                filteredDesignations.map((designation) => (
                  <tr key={designation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {designation.name}
                        </div>
                        {designation.description && (
                          <div className="text-sm text-gray-500">
                            {designation.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {designation.department || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {designation.level || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        designation.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {designation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(designation)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(designation.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    {searchTerm ? 'No designations found matching your search.' : 'No designations found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Designation Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title={editingDesignation ? 'Edit Designation' : 'Add New Designation'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Designation Name"
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
              placeholder="Enter designation description..."
            />
          </div>

          <Input
            label="Department"
            name="department"
            value={formData.department}
            onChange={handleInputChange}
            placeholder="Associated department"
          />

          <Input
            label="Level"
            name="level"
            value={formData.level}
            onChange={handleInputChange}
            placeholder="Job level (e.g., Junior, Senior, Lead)"
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
              {editingDesignation ? 'Update Designation' : 'Add Designation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={closeModal}
        title="Import Designations"
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
                <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
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
                  <li>• <strong>Name</strong> (required) - Designation name</li>
                  <li>• <strong>Description</strong> (optional) - Designation description</li>
                  <li>• <strong>Department</strong> (optional) - Associated department</li>
                  <li>• <strong>Level</strong> (optional) - Job level</li>
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
                  Import Designations
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Designations; 