// Data handling utilities for CRUD operations

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const getSetter = (type) => {
  const setters = {
    employee: 'setEmployees',
    department: 'setDepartments',
    designation: 'setDesignations',
    task: 'setTasks',
    taskCategory: 'setTaskCategories',
    project: 'setProjects',
    taskLabel: 'setTaskLabels',
    milestone: 'setMilestones',
  };
  return setters[type];
};

export const validateFormData = (data, type) => {
  const errors = {};
  
  switch (type) {
    case 'employee':
      if (!data.name) errors.name = 'Name is required';
      if (!data.email) errors.email = 'Email is required';
      break;
    case 'task':
      if (!data.title) errors.title = 'Title is required';
      if (!data.department) errors.department = 'Department is required';
      break;
    case 'department':
      if (!data.name) errors.name = 'Department name is required';
      break;
  }
  
  return errors;
};

export const filterData = (data, filters) => {
  return data.filter(item => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value || value.length === 0) return true;
      
      const itemValue = item[key];
      if (Array.isArray(itemValue)) {
        return Array.isArray(value) ? value.some(v => itemValue.includes(v)) : itemValue.includes(value);
      }
      
      return Array.isArray(value) ? value.includes(itemValue) : itemValue === value;
    });
  });
}; 