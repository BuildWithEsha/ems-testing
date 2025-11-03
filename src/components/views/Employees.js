import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { 
  Users, 
  User, 
  Building,
  Home,
  Clock,
  GraduationCap,
  Plus, 
  Upload, 
  Edit, 
  Trash2, 
  Eye,
  MoreVertical,
  Download,
  Filter,
  Search,
  ChevronDown,
  Settings
} from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import useWorkload from '../../hooks/useWorkload';
import { formatHM } from '../../utils/workload';
import Input from '../ui/Input';
import MultiSelect from '../ui/MultiSelect';
import ActionMenu from '../ui/ActionMenu';
import * as XLSX from 'xlsx';

const Employees = memo(() => {
  // Consolidated data state
  const [dataState, setDataState] = useState({
    employees: [],
    departments: [],
    designations: [],
    roles: [],
    stats: {
      total: 0,
      managers: 0,
      teamLeaders: 0,
      operators: 0,
      staff: 0,
      admin: 0,
      officeEmployees: 0,
      remoteEmployees: 0,
      fullTimeEmployees: 0,
      partTimeEmployees: 0,
      internEmployees: 0
    }
  });

  // Consolidated UI state
  const [uiState, setUiState] = useState({
    loading: true,
    searchTerm: '',
    selectedEmployee: null,
    showPassword: false,
    showColumnModal: false,
    showCategoryModal: false,
    selectedCategory: null,
    categorySearchTerm: '',
    filteredCategoryEmployees: [],
    sortKey: null,
    sortDirection: 'asc'
  });

  // Consolidated modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    isImportOpen: false,
    showDetail: false,
    editingEmployee: null,
    selectedFile: null,
    importLoading: false
  });

  // Consolidated form state
  const [formState, setFormState] = useState({
    formPhotoPreview: null,
    formPhotoFile: null
  });

  // Column visibility state (kept separate for localStorage functionality)
  const [visibleColumns, setVisibleColumns] = useState({
    employee_id: true,
    name: true,
    email: true,
    user_role: true,
    department: true,
    joining_date: true,
    work_from: true,
    status: true,
    designation: false,
    mobile: false,
    gender: false,
    date_of_birth: false,
    reporting_to: false,
    language: false,
    hourly_rate: false,
    employment_type: false,
    marital_status: false,
    job_title: false,
    emergency_contact_number: false,
    emergency_contact_relation: false
  });

  // Helper functions for state updates
  const updateDataState = (updates) => {
    setDataState(prev => ({ ...prev, ...updates }));
  };

  const updateUiState = (updates) => {
    setUiState(prev => ({ ...prev, ...updates }));
  };

  const updateModalState = (updates) => {
    setModalState(prev => ({ ...prev, ...updates }));
  };

  const updateFormState = (updates) => {
    setFormState(prev => ({ ...prev, ...updates }));
  };

  // Destructured state for easier access
  const { employees, departments, designations, roles, stats } = dataState;
  const { loading, searchTerm, selectedEmployee, showPassword, showColumnModal, showCategoryModal, selectedCategory, categorySearchTerm, filteredCategoryEmployees, sortKey, sortDirection } = uiState;
  const { isOpen: isModalOpen, isImportOpen: isImportModalOpen, showDetail: showDetailModal, editingEmployee, selectedFile, importLoading } = modalState;
  const { formPhotoPreview: formPhotoPreview, formPhotoFile: formPhotoFile } = formState;

  // Form state
  const [formData, setFormData] = useState({
    employee_id: '',
    salutation: '',
    name: '',
    email: '',
    password: '',
    designation: '',
    department: '',
    work_from: '',
    country: '',
    mobile: '',
    gender: '',
    joining_date: '',
    date_of_birth: '',
    reporting_to: '',
    language: [],
    user_role: '',
    address: '',
    about: '',
    photo: '',
    login_allowed: true,
    email_notifications: true,
    hourly_rate: '',
    slack_member_id: '',
    skills: '',
    probation_end_date: '',
    notice_period_start_date: '',
    notice_period_end_date: '',
    employment_type: '',
    marital_status: '',
    business_address: '',
    status: 'Active',
    working_hours: 8,
    job_title: '',
    emergency_contact_number: '',
    emergency_contact_relation: ''
  });

  // Fetch employees
  const fetchEmployees = async () => {
    try {
      // Fetch all employees by setting a high limit
      const response = await fetch('/api/employees?limit=1000');
      const data = await response.json();
      // Handle both paginated and non-paginated responses
      const employeesData = data.data || data;
      // Ensure employeesData is always an array
      const safeEmployeesData = Array.isArray(employeesData) ? employeesData : [];
      updateDataState({ employees: safeEmployeesData });
    } catch (error) {
      console.error('Error fetching employees:', error);
      // Set empty array on error
      updateDataState({ employees: [] });
    } finally {
      updateUiState({ loading: false });
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/employees/stats');
      const data = await response.json();
      updateDataState({ stats: data || {} });
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Set default stats on error
      updateDataState({ 
        stats: {
          total: 0,
          managers: 0,
          teamLeaders: 0,
          operators: 0,
          staff: 0,
          admin: 0,
          officeEmployees: 0,
          remoteEmployees: 0,
          fullTimeEmployees: 0,
          partTimeEmployees: 0,
          internEmployees: 0
        }
      });
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchStats();
    // Load dropdown data
    (async () => {
      try {
        const [deptRes, desigRes, rolesRes] = await Promise.all([
          fetch('/api/departments'),
          fetch('/api/designations'),
          fetch('/api/roles'),
        ]);
        if (deptRes.ok) updateDataState({ departments: await deptRes.json() });
        if (desigRes.ok) updateDataState({ designations: await desigRes.json() });
        if (rolesRes.ok) updateDataState({ roles: await rolesRes.json() });
      } catch (e) { /* ignore */ }
    })();
  }, []);

  // Handle form input changes
  const handleInputChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Open modal for add/edit
  const openModal = (employee = null) => {
    updateUiState({ showPassword: false });
    if (employee) {
      updateModalState({ editingEmployee: employee });
      // Convert database integer values to boolean for form
      const employeeData = {
        ...employee,
        login_allowed: Boolean(employee.login_allowed),
        email_notifications: Boolean(employee.email_notifications)
      };
      setFormData({
        ...employeeData,
        language: (employee.language ? String(employee.language).split(',').map(s => ({ value: s.trim(), label: s.trim() })) : [])
      });
      updateFormState({ formPhotoPreview: employee.photo || null });
    } else {
      updateModalState({ editingEmployee: null });
      setFormData({
        employee_id: '',
        salutation: '',
        name: '',
        email: '',
        password: '',
        designation: '',
        department: '',
        work_from: '',
        country: '',
        mobile: '',
        gender: '',
        joining_date: '',
        date_of_birth: '',
        reporting_to: '',
        language: [],
        user_role: '',
        address: '',
        about: '',
        photo: '',
        login_allowed: true,
        email_notifications: true,
        hourly_rate: '',
        slack_member_id: '',
        skills: '',
        probation_end_date: '',
        notice_period_start_date: '',
        notice_period_end_date: '',
        employment_type: '',
        marital_status: '',
        business_address: '',
        status: 'Active',
        working_hours: 8,
        job_title: '',
        emergency_contact_number: '',
        emergency_contact_relation: ''
      });
      updateFormState({ formPhotoPreview: null });
    }
    updateModalState({ isOpen: true });
  };

  // Close modal
  const closeModal = () => {
    updateModalState({ isOpen: false, editingEmployee: null });
    updateFormState({ formPhotoFile: null, formPhotoPreview: null });
    updateUiState({ showPassword: false });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingEmployee 
        ? `/api/employees/${editingEmployee.id}`
        : '/api/employees';
      
      const method = editingEmployee ? 'PUT' : 'POST';
      
      const payload = {
        ...formData,
        language: Array.isArray(formData.language) ? formData.language.map(l => l.label || l.value).join(', ') : formData.language,
      };

      if (!payload.hourly_rate || String(payload.hourly_rate).trim() === '') {
        alert('Hourly rate is required');
        return;
      }

      if (payload.employment_type === 'Part-time' || payload.employment_type === 'Intern') {
        if (!payload.working_hours || Number(payload.working_hours) <= 0) {
          alert('Please enter working hours for selected employment type');
          return;
        }
      } else {
        payload.working_hours = 8;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        closeModal();
        fetchEmployees();
        fetchStats();
      } else {
        let message = 'Error saving employee';
        try {
          const text = await response.text();
          try {
            const error = JSON.parse(text);
            if (error?.error) message = error.error;
          } catch {
            if (text) message = text;
          }
        } catch (_) {}
        alert(message);
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('Error saving employee');
    }
  };

  // Handle delete employee
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    
    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchEmployees();
        fetchStats();
      } else {
        alert('Error deleting employee');
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Error deleting employee');
    }
  };

  // Handle file selection for import
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
  };

  // Handle photo file selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      updateFormState({ formPhotoFile: file });
      const reader = new FileReader();
      reader.onload = (e) => {
        updateFormState({ formPhotoPreview: e.target.result });
        setFormData(prev => ({ ...prev, photo: e.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear photo
  const clearPhoto = () => {
    updateFormState({ formPhotoFile: null, formPhotoPreview: null });
    setFormData(prev => ({ ...prev, photo: '' }));
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setImportLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/employees/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(result.message);
        updateModalState({ isImportOpen: false });
        setSelectedFile(null);
        fetchEmployees();
        fetchStats();
      } else {
        alert(result.error || 'Error importing employees');
      }
    } catch (error) {
      console.error('Error importing employees:', error);
      alert('Error importing employees');
    } finally {
      setImportLoading(false);
    }
  };

  // Add this function inside the Employees component
  const handleDownloadSample = async () => {
    try {
      // Fetch current dropdown values
      const [designationsRes, departmentsRes, rolesRes, employeesRes] = await Promise.all([
        fetch('/api/designations'),
        fetch('/api/departments'),
        fetch('/api/roles'),
        fetch('/api/employees')
      ]);

      const designations = designationsRes.ok ? await designationsRes.json() : [];
      const departments = departmentsRes.ok ? await departmentsRes.json() : [];
      const roles = rolesRes.ok ? await rolesRes.json() : [];
      const employees = employeesRes.ok ? await employeesRes.json() : [];

      // Get dropdown values as arrays
      const designationOptions = designations.map(d => d.name);
      const departmentOptions = departments.map(d => d.name);
      const roleOptions = roles.map(r => r.name);
      const employeeOptions = (employees || []).map(e => e.name);

      const wsData = [
        [
          'Name*', 'Email*', 'Employee ID', 'Salutation', 'Password', 'Designation', 'Department', 'Work From', 'Country', 'Mobile', 'Gender', 'Joining Date', 'Date of Birth', 'Reporting To', 'Language', 'User Role', 'Address', 'About', 'Login Allowed', 'Email Notifications', 'Hourly Rate*', 'Slack Member ID', 'Skills', 'Probation End Date', 'Notice Period Start Date', 'Notice Period End Date', 'Employment Type', 'Marital Status', 'Business Address', 'Status', 'Working Hours', 'Job Title', 'Emergency Contact Number', 'Emergency Contact Relation'
        ],
        [
          'John Doe', 'john.doe@company.com', 'EMP001', 'Mr.', 'password123', 'Software Engineer', 'IT', 'Remote', 'USA', '1234567890', 'Male', '2023-01-01', '1990-01-01', 'Jane Smith', 'English', 'Employee', '123 Main St', 'About John', 'TRUE', 'TRUE', '50.00', 'SLACK123', 'JavaScript,React', '2023-06-01', '2023-07-01', '2023-08-01', 'Full-time', 'Single', '456 Business Rd', 'Active', '8', 'Software Engineer', '03001234567', 'Brother'
        ],
        [
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]
      ];

      // Add dropdown options as separate rows
      wsData.push([
        'OPTIONS:', '', '', '', '', `Available: ${designationOptions.join(' | ')}`, `Available: ${departmentOptions.join(' | ')}`, 'Remote | Office | Hybrid', '', '', 'Male | Female', '', '', `Available: ${employeeOptions.join(' | ')}`, 'English | Urdu | Punjabi | Sindhi | Pashto | Balochi | Arabic', `Available: ${roleOptions.join(' | ')}`, '', '', 'TRUE | FALSE', 'TRUE | FALSE', '', '', '', '', '', '', 'Full-time | Part-time | Intern', 'Single | Married', '', 'Active | Resigned | Terminated | Inactive', '', '', '', ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Create a separate sheet for dropdown options with named ranges
      const dropdownSheetData = [
        ['Designation_Options'],
        ...designationOptions.map(opt => [opt]),
        [''],
        ['Department_Options'],
        ...departmentOptions.map(opt => [opt]),
        [''],
        ['WorkFrom_Options'],
        ['Remote'],
        ['Office'],
        ['Hybrid'],
        [''],
        ['Gender_Options'],
        ['Male'],
        ['Female'],
        [''],
        ['ReportingTo_Options'],
        ...employeeOptions.map(opt => [opt]),
        [''],
        ['Language_Options'],
        ['English'],
        ['Urdu'],
        ['Punjabi'],
        ['Sindhi'],
        ['Pashto'],
        ['Balochi'],
        ['Arabic'],
        [''],
        ['UserRole_Options'],
        ...roleOptions.map(opt => [opt]),
        [''],
        ['Boolean_Options'],
        ['TRUE'],
        ['FALSE'],
        [''],
        ['EmploymentType_Options'],
        ['Full-time'],
        ['Part-time'],
        ['Intern'],
        [''],
        ['MaritalStatus_Options'],
        ['Single'],
        ['Married'],
        [''],
        ['Status_Options'],
        ['Active'],
        ['Resigned'],
        ['Terminated'],
        ['Inactive']
      ];

      const dropdownWs = XLSX.utils.aoa_to_sheet(dropdownSheetData);
      
      // Create workbook first
      const wb = XLSX.utils.book_new();
      
      // Add named ranges to the workbook
      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.Names) wb.Workbook.Names = [];
      
      // Helper function to add named range
      const addNamedRange = (name, sheetName, startRow, endRow, col) => {
        wb.Workbook.Names.push({
          Name: name,
          Ref: `${sheetName}!$${String.fromCharCode(65 + col)}$${startRow}:$${String.fromCharCode(65 + col)}$${endRow}`
        });
      };
      
      // Calculate ranges for each option list
      let currentRow = 1;
      
      // Designation options
      const designationStart = currentRow + 1;
      const designationEnd = currentRow + designationOptions.length;
      addNamedRange('Designation_Options', 'Dropdown Options', designationStart, designationEnd, 0);
      currentRow = designationEnd + 2;
      
      // Department options
      const departmentStart = currentRow + 1;
      const departmentEnd = currentRow + departmentOptions.length;
      addNamedRange('Department_Options', 'Dropdown Options', departmentStart, departmentEnd, 0);
      currentRow = departmentEnd + 2;
      
      // Work From options
      const workFromStart = currentRow + 1;
      const workFromEnd = currentRow + 3;
      addNamedRange('WorkFrom_Options', 'Dropdown Options', workFromStart, workFromEnd, 0);
      currentRow = workFromEnd + 2;
      
      // Gender options
      const genderStart = currentRow + 1;
      const genderEnd = currentRow + 2;
      addNamedRange('Gender_Options', 'Dropdown Options', genderStart, genderEnd, 0);
      currentRow = genderEnd + 2;
      
      // Reporting To options
      const reportingStart = currentRow + 1;
      const reportingEnd = currentRow + employeeOptions.length;
      addNamedRange('ReportingTo_Options', 'Dropdown Options', reportingStart, reportingEnd, 0);
      currentRow = reportingEnd + 2;
      
      // Language options
      const languageStart = currentRow + 1;
      const languageEnd = currentRow + 7;
      addNamedRange('Language_Options', 'Dropdown Options', languageStart, languageEnd, 0);
      currentRow = languageEnd + 2;
      
      // User Role options
      const roleStart = currentRow + 1;
      const roleEnd = currentRow + roleOptions.length;
      addNamedRange('UserRole_Options', 'Dropdown Options', roleStart, roleEnd, 0);
      currentRow = roleEnd + 2;
      
      // Boolean options
      const booleanStart = currentRow + 1;
      const booleanEnd = currentRow + 2;
      addNamedRange('Boolean_Options', 'Dropdown Options', booleanStart, booleanEnd, 0);
      currentRow = booleanEnd + 2;
      
      // Employment Type options
      const employmentStart = currentRow + 1;
      const employmentEnd = currentRow + 3;
      addNamedRange('EmploymentType_Options', 'Dropdown Options', employmentStart, employmentEnd, 0);
      currentRow = employmentEnd + 2;
      
      // Marital Status options
      const maritalStart = currentRow + 1;
      const maritalEnd = currentRow + 2;
      addNamedRange('MaritalStatus_Options', 'Dropdown Options', maritalStart, maritalEnd, 0);
      currentRow = maritalEnd + 2;
      
      // Status options
      const statusStart = currentRow + 1;
      const statusEnd = currentRow + 4;
      addNamedRange('Status_Options', 'Dropdown Options', statusStart, statusEnd, 0);
      
      // Try a different approach for data validation that's more compatible
      try {
        if (!ws['!dataValidations']) ws['!dataValidations'] = [];
        
        // Add data validation using a more basic approach
        const validations = [
          { col: 5, options: designationOptions, name: 'Designation' },
          { col: 6, options: departmentOptions, name: 'Department' },
          { col: 7, options: ['Remote', 'Office', 'Hybrid'], name: 'Work From' },
          { col: 10, options: ['Male', 'Female'], name: 'Gender' },
          { col: 13, options: employeeOptions, name: 'Reporting To' },
          { col: 14, options: ['English', 'Urdu', 'Punjabi', 'Sindhi', 'Pashto', 'Balochi', 'Arabic'], name: 'Language' },
          { col: 15, options: roleOptions, name: 'User Role' },
          { col: 18, options: ['TRUE', 'FALSE'], name: 'Login Allowed' },
          { col: 19, options: ['TRUE', 'FALSE'], name: 'Email Notifications' },
          { col: 26, options: ['Full-time', 'Part-time', 'Intern'], name: 'Employment Type' },
          { col: 27, options: ['Single', 'Married'], name: 'Marital Status' },
          { col: 29, options: ['Active', 'Resigned', 'Terminated', 'Inactive'], name: 'Status' }
        ];

        validations.forEach(validation => {
          if (validation.options && validation.options.length > 0) {
            const colLetter = String.fromCharCode(65 + validation.col);
            const range = `${colLetter}3:${colLetter}1000`;
            
            ws['!dataValidations'].push({
              sqref: range,
              type: 'list',
              formula1: `"${validation.options.join(',')}"`,
              allowBlank: true,
              showErrorMessage: true,
              errorTitle: 'Invalid Value',
              error: `Please select a valid ${validation.name}.`,
              showInputMessage: true,
              promptTitle: `Select ${validation.name}`,
              prompt: `Please select a value from the dropdown list.`
            });
          }
        });
      } catch (error) {
        console.warn('Data validation could not be added:', error);
      }

      // Add manual setup instructions since automatic dropdowns aren't working reliably
      wsData.push([
        'INSTRUCTIONS:', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '1. Required fields are marked with * (Name, Email, Hourly Rate)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '2. To add dropdowns manually in Excel:', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '   a) Select column (e.g., F for Designation)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '   b) Go to Data > Data Validation', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '   c) Set Allow: List, Source: use values from OPTIONS row', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '3. For languages, separate multiple values with commas (e.g., "English, Urdu")', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '4. Dates should be in YYYY-MM-DD format (e.g., 2023-01-01)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '5. For Part-time or Intern employment, Working Hours field is required', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '6. See "Dropdown Options" sheet for all available values', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);
      wsData.push([
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ]);

      XLSX.utils.book_append_sheet(wb, ws, 'Employees');
      XLSX.utils.book_append_sheet(wb, dropdownWs, 'Dropdown Options');
      XLSX.writeFile(wb, 'employee_template.xlsx');
    } catch (error) {
      console.error('Error generating sample file:', error);
      alert('Error generating sample file. Please try again.');
    }
  };

  // Handle employee detail view
  const handleEmployeeClick = (employee) => {
    updateUiState({ selectedEmployee: employee });
    updateModalState({ showDetail: true });
  };

  const closeDetailModal = () => {
    updateModalState({ showDetail: false });
    updateUiState({ selectedEmployee: null });
  };

  // Handle category card click
  const handleCategoryClick = (category) => {
    updateUiState({ selectedCategory: category, categorySearchTerm: '' });
    
    // Filter employees based on category
    let filtered = [];
    switch (category.key) {
      case 'managers':
        filtered = (employees || []).filter(emp => emp.designation === 'Manager');
        break;
      case 'teamLeaders':
        filtered = (employees || []).filter(emp => emp.designation === 'Team Leader');
        break;
      case 'operators':
        filtered = (employees || []).filter(emp => emp.designation === 'Operator');
        break;
      case 'staff':
        filtered = (employees || []).filter(emp => emp.designation === 'Staff');
        break;
      case 'admin':
        filtered = (employees || []).filter(emp => emp.designation === 'Admin');
        break;
      case 'officeEmployees':
        filtered = (employees || []).filter(emp => emp.work_from === 'Office');
        break;
      case 'remoteEmployees':
        filtered = (employees || []).filter(emp => emp.work_from === 'Remote');
        break;
      case 'fullTimeEmployees':
        filtered = (employees || []).filter(emp => emp.employment_type === 'Full-time');
        break;
      case 'partTimeEmployees':
        filtered = (employees || []).filter(emp => emp.employment_type === 'Part-time');
        break;
      case 'internEmployees':
        filtered = (employees || []).filter(emp => emp.employment_type === 'Intern');
        break;
      case 'total':
        filtered = employees || [];
        break;
      default:
        filtered = employees || [];
    }
    
    updateUiState({ filteredCategoryEmployees: filtered, showCategoryModal: true });
  };

  // Close category modal
  const closeCategoryModal = () => {
    updateUiState({ 
      showCategoryModal: false, 
      selectedCategory: null, 
      filteredCategoryEmployees: [], 
      categorySearchTerm: '' 
    });
  };

  // Filter category employees based on search
  const getFilteredCategoryEmployees = () => {
    if (!categorySearchTerm) return filteredCategoryEmployees;
    
    return filteredCategoryEmployees.filter(employee =>
      employee.name?.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
      employee.employee_id?.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
      employee.department?.toLowerCase().includes(categorySearchTerm.toLowerCase())
    );
  };

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  };

  const toggleSort = (columnKey) => {
    setUiState(prev => {
      const nextDirection = prev.sortKey === columnKey && prev.sortDirection === 'asc' ? 'desc' : 'asc';
      return { ...prev, sortKey: columnKey, sortDirection: nextDirection };
    });
  };

  const getColumnDisplayName = (key) => {
    const displayNames = {
      employee_id: 'Employee ID',
      name: 'Name',
      email: 'Email',
      user_role: 'User Role',
      department: 'Department',
      joining_date: 'Joining Date',
      work_from: 'Work From',
      status: 'Status',
      designation: 'Designation',
      mobile: 'Mobile',
      gender: 'Gender',
      date_of_birth: 'Date of Birth',
      reporting_to: 'Reporting To',
      language: 'Language',
      hourly_rate: 'Hourly Rate',
      employment_type: 'Employment Type',
      marital_status: 'Marital Status',
      job_title: 'Job Title',
      emergency_contact_number: 'Emergency Contact',
      emergency_contact_relation: 'Emergency Relation'
    };
    return displayNames[key] || key;
  };

  const getColumnValue = (employee, columnKey) => {
    switch (columnKey) {
      case 'joining_date':
      case 'date_of_birth':
        return employee[columnKey] ? new Date(employee[columnKey]).toLocaleDateString() : 'N/A';
      case 'hourly_rate':
        return employee[columnKey] ? `$${employee[columnKey]}` : 'N/A';
      case 'status':
        return (
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
            employee.status === 'Active' ? 'bg-green-100 text-green-800' :
            employee.status === 'Resigned' ? 'bg-yellow-100 text-yellow-800' :
            employee.status === 'Terminated' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {employee.status || 'Active'}
          </span>
        );
      default:
        return employee[columnKey] || 'N/A';
    }
  };

  // Get plain text value for exports (no JSX)
  const getColumnExportValue = (employee, columnKey) => {
    switch (columnKey) {
      case 'joining_date':
      case 'date_of_birth':
        return employee[columnKey] ? new Date(employee[columnKey]).toISOString().slice(0, 10) : '';
      case 'hourly_rate':
        return employee[columnKey] != null && employee[columnKey] !== '' ? String(employee[columnKey]) : '';
      case 'status':
        return employee.status || 'Active';
      case 'language':
        return Array.isArray(employee.language) ? employee.language.join(', ') : (employee.language || '');
      default:
        return employee[columnKey] != null ? String(employee[columnKey]) : '';
    }
  };

  // Export visible columns for filtered employees as XLSX
  const handleExportEmployees = () => {
    try {
      const activeColumns = Object.keys(visibleColumns).filter((key) => visibleColumns[key]);
      const headerMap = activeColumns.reduce((acc, key) => {
        acc[key] = getColumnDisplayName(key);
        return acc;
      }, {});

      const rows = (filteredEmployees || []).map((emp) => {
        const row = {};
        activeColumns.forEach((key) => {
          row[headerMap[key]] = getColumnExportValue(emp, key);
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
      XLSX.writeFile(workbook, 'employees_export.xlsx');
    } catch (error) {
      console.error('Error exporting employees:', error);
      alert('Export failed. Please try again.');
    }
  };

  // Filter employees based on search term
  const filteredEmployees = (employees || []).filter(employee =>
    employee.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getComparableValue = (employee, key) => {
    if (!employee) return '';
    switch (key) {
      case 'joining_date':
      case 'date_of_birth':
        return employee[key] ? Date.parse(employee[key]) || 0 : 0;
      case 'hourly_rate':
      case 'working_hours':
        return employee[key] != null && employee[key] !== '' ? Number(employee[key]) : -Infinity;
      case 'language':
        return Array.isArray(employee.language)
          ? employee.language.join(', ').toLowerCase()
          : String(employee.language || '').toLowerCase();
      case 'status':
      case 'employment_type':
      case 'user_role':
      case 'department':
      case 'designation':
      case 'work_from':
      case 'marital_status':
      case 'job_title':
      case 'reporting_to':
      case 'name':
      case 'email':
      case 'employee_id':
        return String(employee[key] || '').toLowerCase();
      default:
        return String(employee[key] ?? '').toLowerCase();
    }
  };

  const sortedEmployees = React.useMemo(() => {
    if (!sortKey) return filteredEmployees;
    const copy = [...filteredEmployees];
    const dir = sortDirection === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const av = getComparableValue(a, sortKey);
      const bv = getComparableValue(b, sortKey);
      if (av > bv) return 1 * dir;
      if (av < bv) return -1 * dir;
      return 0;
    });
    return copy;
  }, [filteredEmployees, sortKey, sortDirection]);

  const statCards = [
    {
      title: 'Total Employees',
      value: stats.total,
      icon: Users,
      color: 'bg-blue-500',
      key: 'total'
    },
    {
      title: 'Managers',
      value: stats.managers,
      icon: User,
      color: 'bg-purple-500',
      key: 'managers'
    },
    {
      title: 'Team Leaders',
      value: stats.teamLeaders,
      icon: User,
      color: 'bg-indigo-500',
      key: 'teamLeaders'
    },
    {
      title: 'Operators',
      value: stats.operators,
      icon: User,
      color: 'bg-cyan-500',
      key: 'operators'
    },
    {
      title: 'Staff',
      value: stats.staff,
      icon: User,
      color: 'bg-emerald-500',
      key: 'staff'
    },
    {
      title: 'Admin',
      value: stats.admin,
      icon: User,
      color: 'bg-red-500',
      key: 'admin'
    },
    {
      title: 'Office Employees',
      value: stats.officeEmployees,
      icon: Building,
      color: 'bg-green-500',
      key: 'officeEmployees'
    },
    {
      title: 'Remote Employees',
      value: stats.remoteEmployees,
      icon: Home,
      color: 'bg-orange-500',
      key: 'remoteEmployees'
    },
    {
      title: 'Full Time',
      value: stats.fullTimeEmployees,
      icon: Clock,
      color: 'bg-teal-500',
      key: 'fullTimeEmployees'
    },
    {
      title: 'Part Time',
      value: stats.partTimeEmployees,
      icon: Clock,
      color: 'bg-yellow-500',
      key: 'partTimeEmployees'
    },
    {
      title: 'Interns',
      value: stats.internEmployees,
      icon: GraduationCap,
      color: 'bg-pink-500',
      key: 'internEmployees'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
        <div className="flex space-x-3">
          <Button 
            variant="secondary" 
            onClick={() => updateModalState({ isImportOpen: true })}
            className="flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </Button>
          <Button 
            onClick={() => openModal()}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Employee</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-11 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index} 
              className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:scale-105 transform"
              onClick={() => handleCategoryClick(stat)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search employees..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
              value={searchTerm}
              onChange={(e) => updateUiState({ searchTerm: e.target.value })}
            />
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" className="flex items-center space-x-2" onClick={() => updateUiState({ showColumnModal: true })}>
              <Settings className="w-4 h-4" />
              <span>Customize Columns</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2" onClick={handleExportEmployees}>
              <Filter className="w-4 h-4" />
              <span>Filter</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2" onClick={handleExportEmployees}>
              <Download className="w-4 h-4" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Employees Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                {Object.keys(visibleColumns).map(columnKey => 
                  visibleColumns[columnKey] && (
                    <th key={columnKey} className="px-6 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort(columnKey)}
                        className="flex items-center space-x-2 group select-none cursor-pointer text-gray-700 hover:text-gray-900"
                        title={`Sort by ${getColumnDisplayName(columnKey)}`}
                      >
                        <span>{getColumnDisplayName(columnKey)}</span>
                        <span className="text-xs opacity-60 group-hover:opacity-100">
                          {sortKey === columnKey ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    </th>
                  )
                )}
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="px-6 py-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="px-6 py-4 text-center text-gray-500">
                    No employees found
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((employee) => (
                  <tr key={employee.id} className="bg-white border-b hover:bg-gray-50">
                    {Object.keys(visibleColumns).map(columnKey => 
                      visibleColumns[columnKey] && (
                        <td key={columnKey} className="px-6 py-4">
                          {columnKey === 'name' ? (
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                                {employee.photo ? (
                                  <img 
                                    src={employee.photo} 
                                    alt={employee.name} 
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-indigo-600 flex items-center justify-center">
                                    <span className="text-white text-sm font-medium">
                                      {employee.name?.charAt(0) || 'U'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => handleEmployeeClick(employee)}
                                className="font-medium text-gray-900 hover:text-blue-600 cursor-pointer"
                              >
                                {employee.name}
                              </button>
                            </div>
                          ) : (
                            getColumnValue(employee, columnKey)
                          )}
                        </td>
                      )
                    )}
                    <td className="px-6 py-4">
                      <ActionMenu
                        onSelect={() => { updateUiState({ selectedEmployee: employee }); updateModalState({ showDetail: true }); }}
                        onEdit={() => openModal(employee)}
                        onDelete={() => handleDelete(employee.id)}
                        itemType="employee"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Employee Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`${editingEmployee ? 'Edit' : 'Add'} Employee`}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo Upload Section */}
          <div className="col-span-full mb-6">
            <div className="flex items-center space-x-6">
              <div className="flex-shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-300 flex items-center justify-center">
                  {formPhotoPreview ? (
                    <img 
                      src={formPhotoPreview} 
                      alt="Employee photo" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-400">
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employee Photo
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {formPhotoPreview && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="px-3 py-2 text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Upload a profile photo (JPG, PNG, GIF up to 5MB)
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Employee ID"
              name="employee_id"
              value={formData.employee_id}
              onChange={(e) => handleInputChange('employee_id', e.target.value)}
              placeholder="e.g. Employee ID"
            />
            <Input
              label="Salutation"
              name="salutation"
              value={formData.salutation}
              onChange={(e) => handleInputChange('salutation', e.target.value)}
              placeholder="Select..."
            />
            <Input
              label="Employee Name"
              name="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g. Employee Name"
              required
            />
            <Input
              label="Employee Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="e.g. Employee Email"
              required
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => updateUiState({ showPassword: !showPassword })}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <select value={formData.designation} onChange={(e)=>handleInputChange('designation', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select value={formData.department} onChange={(e)=>handleInputChange('department', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work From</label>
              <select value={formData.work_from} onChange={(e)=>handleInputChange('work_from', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                <option>Remote</option>
                <option>Office</option>
                <option>Hybrid</option>
              </select>
            </div>
            <Input
              label="Country"
              name="country"
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
              placeholder="e.g. Country"
            />
            <Input
              label="Mobile"
              name="mobile"
              value={formData.mobile}
              onChange={(e) => handleInputChange('mobile', e.target.value)}
              placeholder="e.g. Mobile"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select value={formData.gender} onChange={(e)=>handleInputChange('gender', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <Input
              label="Joining Date"
              name="joining_date"
              type="date"
              value={formData.joining_date}
              onChange={(e) => handleInputChange('joining_date', e.target.value)}
            />
            <Input
              label="Date of Birth"
              name="date_of_birth"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reporting To</label>
              <select value={formData.reporting_to} onChange={(e)=>handleInputChange('reporting_to', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                {(employees || []).map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Languages</label>
              <MultiSelect
                options={[ 'English','Urdu','Punjabi','Sindhi','Pashto','Balochi','Arabic' ].map(l=>({ value:l, label:l }))}
                value={formData.language}
                onChange={(val)=>handleInputChange('language', val)}
                placeholder="Select languages"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User Role</label>
              <select value={formData.user_role} onChange={(e)=>handleInputChange('user_role', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Address"
              name="address"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="e.g. Address"
              className="md:col-span-2"
            />
            <Input
              label="About"
              name="about"
              value={formData.about}
              onChange={(e) => handleInputChange('about', e.target.value)}
              placeholder="e.g. About"
              className="md:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Login Allowed?</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="login_allowed"
                    value="true"
                    checked={formData.login_allowed === true}
                    onChange={(e) => handleInputChange('login_allowed', e.target.value === 'true')}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="login_allowed"
                    value="false"
                    checked={formData.login_allowed === false}
                    onChange={(e) => handleInputChange('login_allowed', e.target.value === 'true')}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Receive email notifications?</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="email_notifications"
                    value="true"
                    checked={formData.email_notifications === true}
                    onChange={(e) => handleInputChange('email_notifications', e.target.value === 'true')}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="email_notifications"
                    value="false"
                    checked={formData.email_notifications === false}
                    onChange={(e) => handleInputChange('email_notifications', e.target.value === 'true')}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
            <Input
              label="Hourly Rate*"
              name="hourly_rate"
              value={formData.hourly_rate}
              onChange={(e) => handleInputChange('hourly_rate', e.target.value)}
              placeholder="e.g. 50"
              required
            />
            <Input
              label="Slack Member ID"
              name="slack_member_id"
              value={formData.slack_member_id}
              onChange={(e) => handleInputChange('slack_member_id', e.target.value)}
              placeholder="e.g. Slack Member ID"
            />
            <Input
              label="Skills"
              name="skills"
              value={formData.skills}
              onChange={(e) => handleInputChange('skills', e.target.value)}
              placeholder="e.g. Skills"
            />
            <Input
              label="Probation End Date"
              name="probation_end_date"
              type="date"
              value={formData.probation_end_date}
              onChange={(e) => handleInputChange('probation_end_date', e.target.value)}
            />
            <Input
              label="Notice Period Start Date"
              name="notice_period_start_date"
              type="date"
              value={formData.notice_period_start_date}
              onChange={(e) => handleInputChange('notice_period_start_date', e.target.value)}
            />
            <Input
              label="Notice Period End Date"
              name="notice_period_end_date"
              type="date"
              value={formData.notice_period_end_date}
              onChange={(e) => handleInputChange('notice_period_end_date', e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={formData.employment_type} onChange={(e)=>handleInputChange('employment_type', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Intern</option>
              </select>
            </div>
            {(formData.employment_type === 'Part-time' || formData.employment_type === 'Intern') && (
              <Input
                label="Working Hours"
                name="working_hours"
                value={formData.working_hours}
                onChange={(e) => handleInputChange('working_hours', e.target.value)}
                placeholder="e.g. 4"
              />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marital Status</label>
              <select value={formData.marital_status} onChange={(e)=>handleInputChange('marital_status', e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                <option>Single</option>
                <option>Married</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={formData.status} onChange={(e)=>handleInputChange('status', e.target.value)} className="w-full border rounded px-3 py-2">
                <option>Active</option>
                <option>Resigned</option>
                <option>Terminated</option>
                <option>Inactive</option>
              </select>
            </div>
            <Input
              label="Job Title"
              name="job_title"
              value={formData.job_title}
              onChange={(e) => handleInputChange('job_title', e.target.value)}
              placeholder="e.g. Software Engineer"
            />
            <Input
              label="Emergency Contact Number"
              name="emergency_contact_number"
              value={formData.emergency_contact_number}
              onChange={(e) => handleInputChange('emergency_contact_number', e.target.value)}
              placeholder="e.g. 03001234567"
            />
            <Input
              label="Emergency Contact Relation"
              name="emergency_contact_relation"
              value={formData.emergency_contact_relation}
              onChange={(e) => handleInputChange('emergency_contact_relation', e.target.value)}
              placeholder="e.g. Brother"
            />
          </div>

          <Input
            label="Business Address"
            name="business_address"
            value={formData.business_address}
            onChange={(e) => handleInputChange('business_address', e.target.value)}
            placeholder="e.g. Business Address"
            className="md:col-span-2"
          />

          <div className="flex justify-end space-x-3 pt-6">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">
              {editingEmployee ? 'Update' : 'Create'} Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => updateModalState({ isImportOpen: false })}
        title="Import Employees"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleDownloadSample}>
              Download Sample File
            </Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Excel File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">File Format Requirements:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• File should be in Excel format (.xlsx or .xls)</li>
              <li>• First row should contain column headers</li>
              <li>• Required columns: Name*, Email*, Hourly Rate*</li>
              <li>• All columns are included in the sample file with current dropdown options</li>
              <li>• Dropdown values are automatically updated when you download the sample file</li>
              <li>• Use exact values from the OPTIONS row for dropdown fields</li>
              <li>• For languages, separate multiple values with commas</li>
              <li>• Dates should be in YYYY-MM-DD format</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-3">
            <Button 
              variant="secondary" 
              onClick={() => updateModalState({ isImportOpen: false })}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleImport}
              disabled={!selectedFile || importLoading}
            >
              {importLoading ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Employee Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        title="Employee Details"
        size="xl"
      >
        {selectedEmployee && (
          <div className="space-y-6">
            {/* Employee Header */}
            <div className="flex items-center space-x-4 pb-4 border-b border-gray-200">
              <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center">
                {selectedEmployee.photo ? (
                  <img 
                    src={selectedEmployee.photo} 
                    alt={selectedEmployee.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-indigo-600 flex items-center justify-center">
                    <span className="text-white text-xl font-medium">
                      {selectedEmployee.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900">{selectedEmployee.name}</h2>
                <p className="text-gray-600">{selectedEmployee.designation}</p>
                <p className="text-sm text-gray-500">{selectedEmployee.department}</p>
              </div>
              <div className="ml-auto">
                <CompactWorkloadBadge employee={selectedEmployee} />
              </div>
            </div>

            {/* Employee Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.employee_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Mobile</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.mobile || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Gender</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.country || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Employment Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Employment Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">User Role</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.user_role || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Work From</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.work_from || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Joining Date</label>
                    <p className="text-sm text-gray-900">
                      {selectedEmployee.joining_date ? new Date(selectedEmployee.joining_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                    <p className="text-sm text-gray-900">
                      {selectedEmployee.date_of_birth ? new Date(selectedEmployee.date_of_birth).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Employment Type</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.employment_type || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Additional Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Reporting To</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.reporting_to || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Language</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.language || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Hourly Rate</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.hourly_rate ? `$${selectedEmployee.hourly_rate}` : 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Slack Member ID</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.slack_member_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Marital Status</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.marital_status || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Skills and Dates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Skills & Dates</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Skills</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.skills || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Probation End Date</label>
                    <p className="text-sm text-gray-900">
                      {selectedEmployee.probation_end_date ? new Date(selectedEmployee.probation_end_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notice Period Start</label>
                    <p className="text-sm text-gray-900">
                      {selectedEmployee.notice_period_start_date ? new Date(selectedEmployee.notice_period_start_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notice Period End</label>
                    <p className="text-sm text-gray-900">
                      {selectedEmployee.notice_period_end_date ? new Date(selectedEmployee.notice_period_end_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Removed secondary workload panel to avoid duplication */}
            </div>

            {/* Addresses */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Addresses</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Personal Address</label>
                  <p className="text-sm text-gray-900">{selectedEmployee.address || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Business Address</label>
                  <p className="text-sm text-gray-900">{selectedEmployee.business_address || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* About */}
            {selectedEmployee.about && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">About</h3>
                <p className="text-sm text-gray-900">{selectedEmployee.about}</p>
              </div>
            )}

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Login Allowed</label>
                  <p className="text-sm text-gray-900">{selectedEmployee.login_allowed ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Notifications</label>
                  <p className="text-sm text-gray-900">{selectedEmployee.email_notifications ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button variant="secondary" onClick={closeDetailModal}>
                Close
              </Button>
              <Button onClick={() => {
                closeDetailModal();
                openModal(selectedEmployee);
              }}>
                Edit Employee
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Customize Columns Modal */}
      <Modal
        isOpen={showColumnModal}
        onClose={() => updateUiState({ showColumnModal: false })}
        title="Customize Table Columns"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Select which columns you want to display in the employee table:
          </p>
          
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {Object.keys(visibleColumns).map(columnKey => (
              <label key={columnKey} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleColumns[columnKey]}
                  onChange={() => toggleColumn(columnKey)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {getColumnDisplayName(columnKey)}
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => {
                setVisibleColumns({
                  employee_id: true,
                  name: true,
                  email: true,
                  user_role: true,
                  department: true,
                  joining_date: true,
                  work_from: true,
                  status: true,
                  designation: false,
                  mobile: false,
                  gender: false,
                  date_of_birth: false,
                  reporting_to: false,
                  language: false,
                  hourly_rate: false,
                  employment_type: false,
                  marital_status: false,
                  job_title: false,
                  emergency_contact_number: false,
                  emergency_contact_relation: false
                });
              }}
            >
              Reset to Default
            </Button>
            <div className="flex space-x-3">
              <Button variant="secondary" onClick={() => updateUiState({ showColumnModal: false })}>
                Cancel
              </Button>
              <Button onClick={() => updateUiState({ showColumnModal: false })}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Category Filter Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={closeCategoryModal}
        title={`${selectedCategory?.title} - ${filteredCategoryEmployees.length} Employees`}
        size="xl"
      >
        <div className="space-y-4">
          {/* Search within category */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={`Search within ${selectedCategory?.title?.toLowerCase()}...`}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
              value={categorySearchTerm}
              onChange={(e) => updateUiState({ categorySearchTerm: e.target.value })}
            />
          </div>

          {/* Category employees table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Designation</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Work From</th>
                  <th className="px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredCategoryEmployees().length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      {categorySearchTerm ? 'No employees found matching your search' : 'No employees in this category'}
                    </td>
                  </tr>
                ) : (
                  getFilteredCategoryEmployees().map((employee) => (
                    <tr key={employee.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                            {employee.photo ? (
                              <img 
                                src={employee.photo} 
                                alt={employee.name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-indigo-600 flex items-center justify-center">
                                <span className="text-white text-sm font-medium">
                                  {employee.name?.charAt(0) || 'U'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{employee.name}</p>
                            <p className="text-sm text-gray-500">{employee.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{employee.department || 'N/A'}</td>
                      <td className="px-6 py-4">{employee.designation || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          employee.status === 'Active' ? 'bg-green-100 text-green-800' :
                          employee.status === 'Resigned' ? 'bg-yellow-100 text-yellow-800' :
                          employee.status === 'Terminated' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {employee.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4">{employee.work_from || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              closeCategoryModal();
                              handleEmployeeClick(employee);
                            }}
                            className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              closeCategoryModal();
                              openModal(employee);
                            }}
                            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                            title="Edit Employee"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Modal footer */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {getFilteredCategoryEmployees().length} of {filteredCategoryEmployees.length} employees
            </p>
            <div className="flex space-x-3">
              <Button variant="secondary" onClick={closeCategoryModal}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
});

Employees.displayName = 'Employees';

export default Employees; 

function EmployeeWorkloadPanel({ employee }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,10);
  });
  const { workload, loading } = useWorkload({ employee, anchorDate });

  const dayOverload = (workload?.day?.deltaMinutes || 0) > 0;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Workload</h3>
      <div className="flex items-center space-x-3">
        <label className="text-sm text-gray-700">Anchor Date</label>
        <input
          type="date"
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      {loading && (
        <div className="text-sm text-gray-500">Loading workload...</div>
      )}

      {!loading && workload && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Total Workload</div>
                <div className={`text-2xl font-bold ${dayOverload ? 'text-red-600' : 'text-gray-900'}`}>{formatHM(workload.day.totalMinutes)}</div>
                <div className="text-xs text-gray-500">Date: {workload.day.dateISO} • Shift: {workload.shiftHours}h</div>
              </div>
              <div className="text-right text-sm text-gray-600">Daily + Weekly + Monthly</div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
              <div
                className={`${dayOverload ? 'bg-red-500' : 'bg-indigo-600'} h-2 rounded-full`}
                style={{ width: `${Math.min(100, (workload.day.totalMinutes / (workload.shiftHours*60)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactWorkloadBadge({ employee }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,10);
  });
  const { workload, loading } = useWorkload({ employee, anchorDate });
  const dayOverload = (workload?.day?.deltaMinutes || 0) > 0;
  return (
    <div className="flex flex-col items-end space-y-1">
      <div className="text-xs font-medium text-gray-700 uppercase tracking-wide">Workload</div>
      <div className="flex items-center space-x-2">
        <input type="date" value={anchorDate} onChange={(e)=>setAnchorDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${dayOverload ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {loading ? '...' : formatHM(workload?.day?.totalMinutes || 0)}
        </span>
      </div>
    </div>
  );
}