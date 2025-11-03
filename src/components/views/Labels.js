import React, { useState, useEffect } from 'react';
import { Plus, Upload, Search, Edit, Trash2, Tag } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import * as XLSX from 'xlsx';

const Labels = () => {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    category: '',
    status: 'Active'
  });
  const [errors, setErrors] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    fetchLabels();
  }, []);

  const fetchLabels = async () => {
    try {
      const response = await fetch('/api/labels');
      if (response.ok) {
        const data = await response.json();
        setLabels(data);
      } else {
        console.error('Failed to fetch labels');
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
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
      newErrors.name = 'Label name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      const url = editingLabel 
        ? `/api/labels/${editingLabel.id}`
        : '/api/labels';
      
      const method = editingLabel ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchLabels();
        closeModal();
        setFormData({
          name: '',
          description: '',
          color: '#3B82F6',
          category: '',
          status: 'Active'
        });
        setEditingLabel(null);
      } else {
        console.error('Failed to save label');
      }
    } catch (error) {
      console.error('Error saving label:', error);
    }
  };

  const handleEdit = (label) => {
    setEditingLabel(label);
    setFormData({
      name: label.name,
      description: label.description || '',
      color: label.color || '#3B82F6',
      category: label.category || '',
      status: label.status
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this label?')) {
      return;
    }

    try {
      const response = await fetch(`/api/labels/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchLabels();
      } else {
        console.error('Failed to delete label');
      }
    } catch (error) {
      console.error('Error deleting label:', error);
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
      const response = await fetch('/api/labels/import', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setImportResult(result);
        await fetchLabels();
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
      console.error('Error importing labels:', error);
      alert('Import failed. Please try again.');
    }
  };

  const handleDownloadSample = () => {
    const wsData = [
      ['Name', 'Description', 'Color', 'Category', 'Status'],
      ['High Priority', 'Urgent tasks that need immediate attention', '#EF4444', 'Priority', 'Active'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Labels');
    XLSX.writeFile(wb, 'label_template.xlsx');
  };

  const closeModal = () => {
    setShowAddModal(false);
    setShowImportModal(false);
    setEditingLabel(null);
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      category: '',
      status: 'Active'
    });
    setErrors({});
    setSelectedFile(null);
    setImportResult(null);
  };

  const filteredLabels = labels.filter(label =>
    label.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    label.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    label.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading labels...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Labels</h1>
          <p className="text-gray-600">Manage your organization's labels and tags</p>
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
            <span>Add Label</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search labels..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Labels Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Label
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Color
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
              {filteredLabels.length > 0 ? (
                filteredLabels.map((label) => (
                  <tr key={label.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ backgroundColor: label.color }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {label.name}
                          </div>
                          {label.description && (
                            <div className="text-sm text-gray-500">
                              {label.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {label.category || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="text-sm text-gray-600 font-mono">
                          {label.color}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        label.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {label.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(label)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(label.id)}
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
                    {searchTerm ? 'No labels found matching your search.' : 'No labels found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Label Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title={editingLabel ? 'Edit Label' : 'Add New Label'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Label Name"
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
              placeholder="Enter label description..."
            />
          </div>

          <Input
            label="Category"
            name="category"
            value={formData.category}
            onChange={handleInputChange}
            placeholder="Label category (e.g., Priority, Type, Status)"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Color
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                name="color"
                value={formData.color}
                onChange={handleInputChange}
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleInputChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                placeholder="#3B82F6"
              />
            </div>
          </div>

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
              {editingLabel ? 'Update Label' : 'Add Label'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={closeModal}
        title="Import Labels"
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
                <Tag className="mx-auto h-12 w-12 text-gray-400" />
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
                  <li>• <strong>Name</strong> (required) - Label name</li>
                  <li>• <strong>Description</strong> (optional) - Label description</li>
                  <li>• <strong>Color</strong> (optional) - Hex color code (e.g., #3B82F6)</li>
                  <li>• <strong>Category</strong> (optional) - Label category</li>
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
                  Import Labels
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Labels; 