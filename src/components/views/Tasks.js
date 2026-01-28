import React, { useState, useEffect, useMemo, useCallback, memo, startTransition, useRef } from 'react';
import { Plus, Edit, Trash2, Upload, Download, Search, Filter, Clock, CheckCircle, AlertTriangle, Briefcase, X, Play, Square, ChevronDown, Settings, Circle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import MultiSelect from '../ui/MultiSelect';
import ActionMenu from '../ui/ActionMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useTaskConfig } from '../../contexts/TaskConfigContext';
import performanceMonitor, { measureTaskLoading, measureTimerOperation, measureTaskDetails } from '../../utils/performanceMonitor';

const Tasks = memo(function Tasks({ initialOpenTask, onConsumeInitialOpenTask }) {
  const { user } = useAuth();
  
  // Debug: Log component initialization
  console.log('🚀 Tasks component initialized');
  
  // Consolidated data state
  const [dataState, setDataState] = useState({
    tasks: [],
    departments: [],
    employees: [],
    labels: [],
    loading: true,
    error: null
  });

  // Consolidated UI state
  const [uiState, setUiState] = useState({
    searchTerm: '',
    selectedTask: null,
    selectedTasks: new Set(),
    taskDetailTab: 'files',
    showModal: false,
    showImportModal: false,
    showFilterModal: false,
    showColumnModal: false,
    showDetailModal: false,
    showBulkStatusModal: false,
    showTaskCalculationModal: false,
    showStopTimerModal: false,
    showDeleteHistoryModal: false,
    showDeleteAllHistoryModal: false,
    showChecklistWarningModal: false,
    showExportModal: false,
    showUpdateModal: false,
    totalTasks: 0,
    currentPage: 1,
    hasMoreTasks: true,
    loadingMore: false,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0
  });

  // Consolidated task detail state
  const [taskDetailState, setTaskDetailState] = useState({
    files: [],
    subtasks: [],
    comments: [],
    timesheet: [],
    timesheetTotal: 0,
    notes: '',
    history: [],
    newComment: '',
    newSubtask: '',
    uploadedFile: null,
    editingSubtaskId: null,
    editingSubtaskTitle: '',
    editingCommentId: null,
    editingCommentText: ''
  });

  // Memoized timesheet total calculation for efficiency
  const taskTimesheetTotal = useMemo(() => {
    return taskDetailState.timesheet.reduce((total, entry) => {
      return total + (entry.hours_logged_seconds || 0);
    }, 0);
  }, [taskDetailState.timesheet]);


  // Consolidated form state
  const [formState, setFormState] = useState({
    editingTask: null,
    importLoading: false,
    selectedFile: null,
    importResult: null,
    bulkStatus: '',
    newValues: {
      impact: '',
      priority: '',
      complexity: '',
      effort: '',
      labels: ''
    },
    newScores: {
      impact: 50,
      priority: 50,
      complexity: 50,
      effort: 50,
      labels: 50
    },
    editingItem: null,
    editingScore: 0
  });

  // Consolidated filter state
  const [filterState, setFilterState] = useState({
    status: '',
    priority: '',
    complexity: '',
    impact: '',
    effortEstimateLabel: '',
    unit: '',
    target: '',
    department: '',
    assignedTo: [],
    labels: [],
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
    trained: []
  });

  // Consolidated timer state
  const [timerState, setTimerState] = useState({
    activeTimers: {},
    intervals: {},
    tick: 0, // Add tick counter to force re-renders
    stopTimerTaskId: null,
    stopTimerMemo: '',
    stopTimerStartTime: '',
    stopTimerEndTime: '',
    stopTimerTotalTime: ''
  });

  // Consolidated modal state
  const [modalState, setModalState] = useState({
    historyToDelete: null,
    checklistWarningTask: null,
    checklistCompletion: {}
  });

  // Column customization state (kept separate for localStorage functionality)
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(`taskColumns_${user?.id || 'default'}`);
      const defaultColumns = {
        checkbox: true,
        id: false,
        title: true,
        task: true, // Backward compatibility
        department: true,
        task_category: false,
        project: false,
        start_date: false,
        due_date: true,
        without_due_date: false,
        assigned_to: true,
        assignedTo: true, // Backward compatibility
        status: true,
        description: false,
        responsible: false,
        accountable: false,
        consulted: false,
        informed: false,
        trained: false,
        labels: true,
        label_id: false,
        milestones: false,
        priority: true,
        complexity: true,
        impact: true,
        unit: true,
        target: true,
        effort_estimate_label: true,
        effortEstimate: true, // Backward compatibility
        time_estimate: true,
        make_private: false,
        share: false,
        repeat: false,
        is_dependent: false,
        validation_by: false,
        effort_label: false,
        checklist: false,
        workflow_guide: false,
        timer_started_at: false,
        logged_seconds: true,
        timer: true, // Backward compatibility
        created_at: false,
        updated_at: false,
        score: true,
        actions: true
      };
      
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all columns exist in the saved data
        return { ...defaultColumns, ...parsed };
      }
      return defaultColumns;
    } catch (e) {
      return {
        checkbox: true,
        id: false,
        title: true,
        department: true,
        task_category: false,
        project: false,
        start_date: false,
        due_date: true,
        without_due_date: false,
        assigned_to: true,
        status: true,
        description: false,
        responsible: false,
        accountable: false,
        consulted: false,
        informed: false,
        trained: false,
        labels: true,
        label_id: false,
        milestones: false,
        priority: true,
        complexity: true,
        impact: true,
        unit: true,
        target: true,
        effort_estimate_label: true,
        time_estimate: true,
        make_private: false,
        share: false,
        repeat: false,
        is_dependent: false,
        validation_by: false,
        effort_label: false,
        checklist: false,
        workflow_guide: false,
        timer_started_at: false,
        logged_seconds: true,
        created_at: false,
        updated_at: false,
        score: true,
        actions: true
      };
    }
  });
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(`taskColumnWidths_${user?.id || 'default'}`);
      const defaultWidths = {
        checkbox: 60,
        id: 80,
        title: 300,
        task: 300, // Backward compatibility
        department: 120,
        task_category: 120,
        project: 120,
        start_date: 100,
        due_date: 100,
        without_due_date: 100,
        assigned_to: 150,
        assignedTo: 150, // Backward compatibility
        status: 100,
        description: 200,
        responsible: 120,
        accountable: 120,
        consulted: 120,
        informed: 120,
        trained: 120,
        labels: 120,
        label_id: 80,
        milestones: 120,
        priority: 100,
        complexity: 100,
        impact: 100,
        unit: 80,
        target: 80,
        effort_estimate_label: 120,
        effortEstimate: 120, // Backward compatibility
        time_estimate: 120,
        make_private: 100,
        share: 80,
        repeat: 80,
        is_dependent: 100,
        validation_by: 120,
        effort_label: 120,
        checklist: 150,
        workflow_guide: 150,
        timer_started_at: 120,
        logged_seconds: 100,
        timer: 120, // Backward compatibility
        created_at: 120,
        updated_at: 120,
        score: 80,
        actions: 100
      };
      
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultWidths, ...parsed };
      }
      return defaultWidths;
    } catch (e) {
              return {
          checkbox: 60,
          id: 80,
          title: 300,
          task: 300, // Backward compatibility
          department: 120,
          task_category: 120,
          project: 120,
          start_date: 100,
          due_date: 100,
          without_due_date: 100,
          assigned_to: 150,
          assignedTo: 150, // Backward compatibility
          status: 100,
          description: 200,
          responsible: 120,
          accountable: 120,
          consulted: 120,
          informed: 120,
          trained: 120,
          labels: 120,
          label_id: 80,
          milestones: 120,
          priority: 100,
          complexity: 100,
          impact: 100,
          unit: 80,
          target: 80,
          effort_estimate_label: 120,
          effortEstimate: 120, // Backward compatibility
          time_estimate: 120,
          make_private: 100,
          share: 80,
          repeat: 80,
          is_dependent: 100,
          validation_by: 120,
          effort_label: 120,
          checklist: 150,
          workflow_guide: 150,
          timer_started_at: 120,
          logged_seconds: 100,
          timer: 120, // Backward compatibility
          created_at: 120,
          updated_at: 120,
          score: 80,
          actions: 100
        };
    }
  });
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(`taskColumnOrder_${user?.id || 'default'}`);
      const defaultOrder = [
        'checkbox',
        'task', // Backward compatibility
        'title',
        'department',
        'assignedTo', // Backward compatibility  
        'assigned_to',
        'priority',
        'complexity',
        'impact',
        'effortEstimate', // Backward compatibility
        'effort_estimate_label',
        'time_estimate',
        'score',
        'unit',
        'target',
        'status',
        'timer', // Backward compatibility
        'logged_seconds',
        'actions',
        'id',
        'task_category',
        'project',
        'start_date',
        'due_date',
        'without_due_date',
        'description',
        'responsible',
        'accountable',
        'consulted',
        'informed',
        'trained',
        'labels',
        'label_id',
        'milestones',
        'make_private',
        'share',
        'repeat',
        'is_dependent',
        'validation_by',
        'effort_label',
        'checklist',
        'workflow_guide',
        'timer_started_at',
        'created_at',
        'updated_at'
      ];
      
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all new columns are included in saved order
        const missingColumns = defaultOrder.filter(col => !parsed.includes(col));
        return [...parsed, ...missingColumns];
      }
      
      return defaultOrder;
    } catch (e) {
      return [
        'checkbox',
        'task', // Backward compatibility
        'title',
        'department',
        'assignedTo', // Backward compatibility  
        'assigned_to',
        'priority',
        'complexity',
        'impact',
        'effortEstimate', // Backward compatibility
        'effort_estimate_label',
        'time_estimate',
        'score',
        'unit',
        'target',
        'status',
        'timer', // Backward compatibility
        'logged_seconds',
        'actions',
        'id',
        'task_category',
        'project',
        'start_date',
        'due_date',
        'without_due_date',
        'description',
        'responsible',
        'accountable',
        'consulted',
        'informed',
        'trained',
        'labels',
        'label_id',
        'milestones',
        'make_private',
        'share',
        'repeat',
        'is_dependent',
        'validation_by',
        'effort_label',
        'checklist',
        'workflow_guide',
        'timer_started_at',
        'created_at',
        'updated_at'
      ];
    }
  });
  
  // Open detail modal if App provided a task to open
  useEffect(() => {
    if (initialOpenTask) {
      updateUiState({ 
        selectedTask: initialOpenTask,
        showDetailModal: true 
      });
      startTransition(() => {
        loadTaskDetails(initialOpenTask.id);
      });
      if (onConsumeInitialOpenTask) onConsumeInitialOpenTask();
    }
  }, [initialOpenTask, onConsumeInitialOpenTask]);

  // Save column preferences to localStorage
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`taskColumns_${user.id}`, JSON.stringify(visibleColumns));
      localStorage.setItem(`taskColumnWidths_${user.id}`, JSON.stringify(columnWidths));
      localStorage.setItem(`taskColumnOrder_${user.id}`, JSON.stringify(columnOrder));
    }
  }, [visibleColumns, columnWidths, columnOrder, user?.id]);

  // Column customization helper functions
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  };



  const updateColumnWidth = (columnKey, width) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: Math.max(60, Math.min(500, width)) // Min 60px, Max 500px
    }));
  };

  const moveColumnUp = (columnKey) => {
    setColumnOrder(prev => {
      const newOrder = [...prev];
      const currentIndex = newOrder.indexOf(columnKey);
      if (currentIndex > 0) {
        [newOrder[currentIndex], newOrder[currentIndex - 1]] = [newOrder[currentIndex - 1], newOrder[currentIndex]];
      }
      return newOrder;
    });
  };

  const moveColumnDown = (columnKey) => {
    setColumnOrder(prev => {
      const newOrder = [...prev];
      const currentIndex = newOrder.indexOf(columnKey);
      if (currentIndex < newOrder.length - 1) {
        [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
      }
      return newOrder;
    });
  };

  const resetToDefault = () => {
    const defaultColumns = {
      checkbox: true,
      id: false,
      title: true,
      task: true, // Backward compatibility
      department: true,
      task_category: false,
      project: false,
      start_date: false,
      due_date: true,
      without_due_date: false,
      assigned_to: true,
      assignedTo: true, // Backward compatibility
      status: true,
      description: false,
      responsible: false,
      accountable: false,
      consulted: false,
      informed: false,
      trained: false,
      labels: false,
      label_id: false,
      milestones: false,
      priority: true,
      complexity: true,
      impact: true,
      unit: true,
      target: true,
      effort_estimate_label: true,
      effortEstimate: true, // Backward compatibility
      time_estimate: true,
      make_private: false,
      share: false,
      repeat: false,
      is_dependent: false,
      validation_by: false,
      effort_label: false,
      checklist: false,
      workflow_guide: false,
      timer_started_at: false,
      logged_seconds: true,
      timer: true, // Backward compatibility
      created_at: false,
      updated_at: false,
      score: true,
      actions: true
    };
    
    const defaultWidths = {
      checkbox: 60,
      id: 80,
      title: 300,
      department: 120,
      task_category: 120,
      project: 120,
      start_date: 100,
      due_date: 100,
      without_due_date: 100,
      assigned_to: 150,
      status: 100,
      description: 200,
      responsible: 120,
      accountable: 120,
      consulted: 120,
      informed: 120,
      trained: 120,
      labels: 120,
      label_id: 80,
      milestones: 120,
      priority: 100,
      complexity: 100,
      impact: 100,
      unit: 80,
      target: 80,
      effort_estimate_label: 120,
      time_estimate: 120,
      make_private: 100,
      share: 80,
      repeat: 80,
      is_dependent: 100,
      validation_by: 120,
      effort_label: 120,
      checklist: 150,
      workflow_guide: 150,
      timer_started_at: 120,
      logged_seconds: 100,
      created_at: 120,
      updated_at: 120,
      score: 80,
      actions: 100
    };
    
    const defaultOrder = [
      'checkbox',
      'task', // Backward compatibility
      'title',
      'department',
      'assignedTo', // Backward compatibility  
      'assigned_to',
      'priority',
      'complexity',
      'impact',
      'effortEstimate', // Backward compatibility
      'effort_estimate_label',
      'score',
      'unit',
      'target',
      'status',
      'timer', // Backward compatibility
      'logged_seconds',
      'actions',
      'id',
      'task_category',
      'project',
      'start_date',
      'due_date',
      'without_due_date',
      'description',
      'responsible',
      'accountable',
      'consulted',
      'informed',
      'trained',
      'labels',
      'label_id',
      'milestones',
      'make_private',
      'share',
      'repeat',
      'is_dependent',
      'validation_by',
      'effort_label',
      'checklist',
      'workflow_guide',
      'timer_started_at',
      'created_at',
      'updated_at'
    ];
    
    setVisibleColumns(defaultColumns);
    setColumnWidths(defaultWidths);
    setColumnOrder(defaultOrder);
    
    // Clear localStorage to force fresh start
    if (user?.id) {
      localStorage.removeItem(`taskColumns_${user.id}`);
      localStorage.removeItem(`taskColumnWidths_${user.id}`);
      localStorage.removeItem(`taskColumnOrder_${user.id}`);
    }
  };

  const getColumnDisplayName = (columnKey) => {
    const displayNames = {
      checkbox: 'Select',
      task: 'Task',
      assignedTo: 'Assigned To',
      priority: 'Priority',
      complexity: 'Complexity',
      impact: 'Impact',
      effortEstimate: 'Effort Estimate',
      score: 'Score',
      unit: 'Unit',
      target: 'Target',
      status: 'Status',
      timer: 'Timer / Time',
      actions: 'Actions'
    };
    return displayNames[columnKey] || columnKey;
  };

  // Get all available columns for the modal
  const getAllColumns = () => {
    return [
      { key: 'checkbox', name: 'Select' },
      { key: 'id', name: 'ID' },
      { key: 'title', name: 'Title' },
      { key: 'task', name: 'Task' }, // Backward compatibility
      { key: 'department', name: 'Department' },
      { key: 'task_category', name: 'Task Category' },
      { key: 'project', name: 'Project' },
      { key: 'start_date', name: 'Start Date' },
      { key: 'due_date', name: 'Due Date' },
      { key: 'without_due_date', name: 'Without Due Date' },
      { key: 'assigned_to', name: 'Assigned To' },
      { key: 'assignedTo', name: 'Assigned To' }, // Backward compatibility
      { key: 'status', name: 'Status' },
      { key: 'description', name: 'Description' },
      { key: 'responsible', name: 'Responsible' },
      { key: 'accountable', name: 'Accountable' },
      { key: 'consulted', name: 'Consulted' },
      { key: 'informed', name: 'Informed' },
      { key: 'trained', name: 'Trained' },
      { key: 'labels', name: 'Labels' },
      { key: 'label_id', name: 'Label ID' },
      { key: 'milestones', name: 'Milestones' },
      { key: 'priority', name: 'Priority' },
      { key: 'complexity', name: 'Complexity' },
      { key: 'impact', name: 'Impact' },
      { key: 'unit', name: 'Unit' },
      { key: 'target', name: 'Target' },
      { key: 'effort_estimate_label', name: 'Effort Estimate' },
      { key: 'effortEstimate', name: 'Effort Estimate' }, // Backward compatibility
      { key: 'time_estimate', name: 'Time Estimate' },
      { key: 'make_private', name: 'Make Private' },
      { key: 'share', name: 'Share' },
      { key: 'repeat', name: 'Repeat' },
      { key: 'is_dependent', name: 'Is Dependent' },
      { key: 'validation_by', name: 'Validation By' },
      { key: 'effort_label', name: 'Effort Label' },
      { key: 'checklist', name: 'Checklist' },
      { key: 'workflow_guide', name: 'Workflow Guide' },
      { key: 'timer_started_at', name: 'Timer Started At' },
      { key: 'logged_seconds', name: 'Logged Seconds' },
      { key: 'timer', name: 'Timer / Time' }, // Backward compatibility
      { key: 'created_at', name: 'Created At' },
      { key: 'updated_at', name: 'Updated At' },
      { key: 'score', name: 'Score' },
      { key: 'actions', name: 'Actions' }
    ];
  };

  // Task Calculation states
  const { scoringWeights, scoringPoints, updateScoringPoints } = useTaskConfig();

  // Helper functions for state updates
  const updateDataState = useCallback((updates) => {
    // ✅ FIX: Handle both function and object updates (like React's setState)
    if (typeof updates === 'function') {
      // If updates is a function, pass it directly to setState
      setDataState(updates);
    } else {
      // If updates is an object, merge it with previous state
      setDataState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const updateUiState = useCallback((updates) => {
    setUiState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateTaskDetailState = useCallback((updates) => {
    setTaskDetailState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateFormState = useCallback((updates) => {
    setFormState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateFilterState = useCallback((updates) => {
    setFilterState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateTimerState = useCallback((updates) => {
    // ✅ FIX: Handle both function and object updates (like React's setState)
    if (typeof updates === 'function') {
      // If updates is a function, pass it directly to setState
      setTimerState(updates);
    } else {
      // If updates is an object, merge it with previous state
      setTimerState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const updateModalState = useCallback((updates) => {
    setModalState(prev => ({ ...prev, ...updates }));
  }, []);

  // Destructured state for easier access
  const { tasks, departments, employees, labels, loading, error } = dataState;
  const { searchTerm, selectedTask, selectedTasks, taskDetailTab, showModal, showImportModal, showFilterModal, showColumnModal, showDetailModal, showBulkStatusModal, showTaskCalculationModal, showStopTimerModal, showDeleteHistoryModal, showDeleteAllHistoryModal, showChecklistWarningModal, showExportModal, showUpdateModal, totalTasks, currentPage, hasMoreTasks, loadingMore, completedTasks: completedTasksFromState, inProgressTasks: inProgressTasksFromState, pendingTasks: pendingTasksFromState, overdueTasks: overdueTasksFromState } = uiState;
  const { files: taskFiles, subtasks: taskSubtasks, comments: taskComments, timesheet: taskTimesheet, timesheetTotal, notes: taskNotes, history: taskHistory, newComment, newSubtask, uploadedFile, editingSubtaskId, editingSubtaskTitle, editingCommentId, editingCommentText } = taskDetailState;
  
  // Reconcile fallback assignees to real employee records when employees load
  useEffect(() => {
    if (!employees || employees.length === 0) return;
    setFormData(prev => {
      const current = prev.assignedTo || [];
      if (current.length === 0) return prev;
      let changed = false;
      const reconciled = current.map(item => {
        // If already a proper option with ID from employees (value numeric or label has employee_id), keep
        const hasEmployeeIdInLabel = typeof item.label === 'string' && item.label.includes('(');
        const isFallback = typeof item.value === 'string' && item.value.startsWith('fallback-');
        if (!isFallback && hasEmployeeIdInLabel) return item;
        // Try to map by name (before " (" part if present)
        const nameOnly = (item.label || '').split(' (')[0];
        const emp = employees.find(e => (e.name || '').toLowerCase() === nameOnly.toLowerCase());
        if (emp) {
          changed = true;
          return { value: emp.id, label: `${emp.name} (${emp.employee_id || ''})` };
        }
        return item;
      });
      return changed ? { ...prev, assignedTo: reconciled } : prev;
    });
  }, [employees]);
  

  // Individual setters for backward compatibility and efficiency
  const setTaskFiles = useCallback((files) => updateTaskDetailState({ files }), [updateTaskDetailState]);
  const setTaskComments = useCallback((comments) => {
    if (typeof comments === 'function') {
      // Handle function updates like setTaskComments(prev => [...prev, newItem])
      setTaskDetailState(prev => ({
        ...prev,
        comments: comments(prev.comments)
      }));
    } else {
      // Handle direct value updates like setTaskComments([...])
      const validComments = Array.isArray(comments) ? comments : [];
      updateTaskDetailState({ comments: validComments });
    }
  }, [updateTaskDetailState]);
  const setTaskSubtasks = useCallback((subtasks) => {
    if (typeof subtasks === 'function') {
      // Handle function updates like setTaskSubtasks(prev => [...prev, newItem])
      setTaskDetailState(prev => ({
        ...prev,
        subtasks: subtasks(prev.subtasks)
      }));
    } else {
      // Handle direct value updates like setTaskSubtasks([...])
      const validSubtasks = Array.isArray(subtasks) ? subtasks : [];
      updateTaskDetailState({ subtasks: validSubtasks });
    }
  }, [updateTaskDetailState]);
  const setTaskTimesheet = useCallback((timesheet) => updateTaskDetailState({ timesheet }), [updateTaskDetailState]);
  const setTaskTimesheetTotal = useCallback((timesheetTotal) => updateTaskDetailState({ timesheetTotal }), [updateTaskDetailState]);
  const setTaskNotes = useCallback((notes) => updateTaskDetailState({ notes }), [updateTaskDetailState]);
  const setTaskHistory = useCallback((history) => updateTaskDetailState({ history }), [updateTaskDetailState]);
  const setNewComment = useCallback((newComment) => updateTaskDetailState({ newComment }), [updateTaskDetailState]);
  const setNewSubtask = useCallback((newSubtask) => updateTaskDetailState({ newSubtask }), [updateTaskDetailState]);
  const setEditingSubtaskId = useCallback((editingSubtaskId) => updateTaskDetailState({ editingSubtaskId }), [updateTaskDetailState]);
  const setEditingSubtaskTitle = useCallback((editingSubtaskTitle) => updateTaskDetailState({ editingSubtaskTitle }), [updateTaskDetailState]);
  const setEditingCommentId = useCallback((editingCommentId) => updateTaskDetailState({ editingCommentId }), [updateTaskDetailState]);
  const setEditingCommentText = useCallback((editingCommentText) => updateTaskDetailState({ editingCommentText }), [updateTaskDetailState]);
  const { editingTask, importLoading, selectedFile, importResult, bulkStatus, newValues, newScores, editingItem, editingScore } = formState;
  const { status: filterStatus, priority: filterPriority, complexity: filterComplexity, impact: filterImpact, effortEstimateLabel: filterEffortEstimateLabel, unit: filterUnit, target: filterTarget, department: filterDepartment, assignedTo: filterAssignedTo, labels: filterLabels, responsible: filterResponsible, accountable: filterAccountable, consulted: filterConsulted, informed: filterInformed, trained: filterTrained } = filterState;
  const { activeTimers, intervals: timerIntervals, tick, stopTimerTaskId, stopTimerMemo, stopTimerStartTime, stopTimerEndTime, stopTimerTotalTime } = timerState;
  const { historyToDelete, checklistWarningTask, checklistCompletion } = modalState;

  // All timer and modal states are now consolidated above

  // Form states - matching the exact fields from the images
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    taskCategory: '',
    project: '',
    startDate: '',
    dueDate: '',
    withoutDueDate: false,
    assignedTo: [],
    status: '',
    description: '',
    // RACIT Matrix fields
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
    trained: [],
    // Other Details fields
    labels: '',
    milestones: '',
    priority: '',
    complexity: '',
    impact: '', // Added
    unit: '', // Added
    target: '', // Added
    effortEstimateLabel: '', // Added
    makePrivate: false,
    share: false,
    repeat: false,
    isDependent: false,
    validationBy: '',
    effortLabel: '',
    checklist: '',
    workflowGuide: '',
    fileLinks: '',
    videoLinks: '',
    // Time estimate fields
    timeEstimateHours: 0,
    timeEstimateMinutes: 0,
  });

  // Fetch all data from API with optimized pagination and server-side search/filtering
  const fetchAllData = async (skipLoadingState = false, page = 1, append = false, searchParams = {}) => {
    try {
      console.log('🔍 fetchAllData called with:', { skipLoadingState, page, append, searchParams });
      if (!skipLoadingState) {
        startTransition(() => {
          updateDataState({ loading: true });
        });
      }
      
      // Build tasks URL with user parameters and search/filter parameters
      let tasksUrl = '/api/tasks';
      if (user) {
        // Check if user has view_own_tasks permission
        const hasViewOwnTasks = user.permissions && user.permissions.includes('view_own_tasks');
        
        const params = new URLSearchParams({
          user_id: user.id,
          role: user.role,
          employee_name: user.name || '',
          // Force pagination for all users (admin gets higher limit of 500)
          limit: (user.role === 'admin' || user.role === 'Admin') ? 500 : 100,
          page: page,
          // Add search and filter parameters
          ...(searchParams.search && { search: searchParams.search }),
          ...(searchParams.status && { status: searchParams.status }),
          ...(searchParams.priority && { priority: searchParams.priority }),
          ...(searchParams.complexity && { complexity: searchParams.complexity }),
          ...(searchParams.impact && { impact: searchParams.impact }),
          ...(searchParams.effortEstimateLabel && { effortEstimateLabel: searchParams.effortEstimateLabel }),
          ...(searchParams.unit && { unit: searchParams.unit }),
          ...(searchParams.target && { target: searchParams.target }),
          ...(searchParams.labels && { labels: searchParams.labels }),
          ...(searchParams.assignedTo && { assignedTo: searchParams.assignedTo }),
          // Support snake_case for backend compatibility
          ...(searchParams.assignedTo && { assigned_to: searchParams.assignedTo }),
          ...(searchParams.department && { department: searchParams.department })
        });
        
        // If user has view_own_tasks permission, ensure employee_name is always provided
        if (hasViewOwnTasks && !user.name) {
          console.warn('⚠️ User has view_own_tasks permission but no name - this will cause API error');
        }
        
        tasksUrl += `?${params.toString()}`;
      }
      
      console.log('🔍 Final tasks URL:', tasksUrl);
      
      // Prepare headers with user permissions for the tasks request
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        tasksHeaders['user-name'] = user.name || '';
      }
      
      const [tasksResponse, departmentsResponse, employeesResponse, labelsResponse] = await Promise.all([
        measureTaskLoading(fetch(tasksUrl, { headers: tasksHeaders })),
        fetch('/api/departments'),
        fetch('/api/employees?all=true'), // Get all employees for task assignment
        fetch('/api/labels')
      ]);

      if (tasksResponse.ok && departmentsResponse.ok && employeesResponse.ok && labelsResponse.ok) {
        const tasksData = await tasksResponse.json();
        const departmentsData = await departmentsResponse.json();
        const employeesData = await employeesResponse.json();
        const labelsData = await labelsResponse.json();

        // Handle both paginated and non-paginated responses with batched state updates
        startTransition(() => {
          const newTasks = Array.isArray(tasksData.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []);
          
          updateDataState({ 
            tasks: append ? [...tasks, ...newTasks] : newTasks,
            departments: Array.isArray(departmentsData.data) ? departmentsData.data : (Array.isArray(departmentsData) ? departmentsData : []),
            employees: Array.isArray(employeesData.data) ? employeesData.data : (Array.isArray(employeesData) ? employeesData : []),
            labels: Array.isArray(labelsData) ? labelsData : []
          });
          
          // Update total tasks count for summary cards and pagination state
          if (tasksData.pagination) {
            const hasMore = (page * 100) < tasksData.pagination.total;
            updateUiState({
              totalTasks: tasksData.pagination.total,
              currentPage: page,
              hasMoreTasks: hasMore,
              loadingMore: false
            });
          } else if (user?.role === 'admin' || user?.role === 'Admin') {
            // Admin users get all tasks, so no more to load
            updateUiState({
              totalTasks: newTasks.length,
              hasMoreTasks: false,
              loadingMore: false
            });
          }
        });
      } else {
        startTransition(() => {
          updateDataState({ error: 'Failed to fetch data' });
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      startTransition(() => {
        updateDataState({ error: 'Failed to fetch data' });
      });
    } finally {
      if (!skipLoadingState) {
        startTransition(() => {
          updateDataState({ loading: false });
        });
      }
    }
  };

  // Optimized function to refresh only tasks (for timer operations)
  const refreshTasksOnly = async () => {
    try {
      let tasksUrl = '/api/tasks';
      if (user) {
        // ✅ FIX: Get current filter parameters to preserve filters when refreshing
        const filterParams = getSearchFilterParams();
        
        const params = new URLSearchParams({
          user_id: user.id,
          role: user.role,
          employee_name: user.name || '',
          limit: 100,
          page: 1
        });
        
        // ✅ FIX: Add filter parameters (only if they have values, consistent with fetchAllData)
        if (filterParams.search) params.append('search', filterParams.search);
        if (filterParams.status) params.append('status', filterParams.status);
        if (filterParams.priority) params.append('priority', filterParams.priority);
        if (filterParams.complexity) params.append('complexity', filterParams.complexity);
        if (filterParams.impact) params.append('impact', filterParams.impact);
        if (filterParams.effortEstimateLabel) params.append('effortEstimateLabel', filterParams.effortEstimateLabel);
        if (filterParams.unit) params.append('unit', filterParams.unit);
        if (filterParams.target) params.append('target', filterParams.target);
        if (filterParams.labels) params.append('labels', filterParams.labels);
        if (filterParams.assignedTo) {
          params.append('assignedTo', filterParams.assignedTo);
          // Support snake_case for backend compatibility
          params.append('assigned_to', filterParams.assignedTo);
        }
        if (filterParams.department) params.append('department', filterParams.department);
        
        tasksUrl += `?${params.toString()}`;
      }
      
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        tasksHeaders['user-name'] = user.name || '';
      }
      
      const tasksResponse = await measureTaskLoading(fetch(tasksUrl, { headers: tasksHeaders }));
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        startTransition(() => {
          updateDataState({ 
            tasks: Array.isArray(tasksData.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : [])
          });
        });
      }
    } catch (error) {
      console.error('Error refreshing tasks:', error);
    }
  };

  // Load more tasks function for pagination
  const loadMoreTasks = async () => {
    if (loadingMore || !hasMoreTasks || user?.role === 'admin' || user?.role === 'Admin') return;
    
    updateUiState({ loadingMore: true });
    const nextPage = currentPage + 1;
    const searchParams = getSearchFilterParams();
    await fetchAllData(true, nextPage, true, searchParams);
  };

  // Debounce timer for search
  const searchTimeoutRef = useRef(null);

  // Handle search with server-side filtering (with debounce)
  const handleSearch = useCallback(async (searchValue) => {
    console.log('🔍 Search triggered with value:', searchValue);
    updateUiState({ searchTerm: searchValue });
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(async () => {
      updateUiState({ currentPage: 1, hasMoreTasks: true });
      const searchParams = {
        search: searchValue,
        status: filterStatus || '',
        priority: filterPriority || '',
        complexity: filterComplexity || '',
        impact: filterImpact || '',
        effortEstimateLabel: filterEffortEstimateLabel || '',
        unit: filterUnit || '',
        target: filterTarget || '',
        labels: getLabelsFilterString(),
        assignedTo: getAssignedToFilterString(),
        department: filterDepartment || ''
      };
      console.log('🔍 Search params:', searchParams);
      await fetchAllData(true, 1, false, searchParams);
    }, 500); // 500ms debounce
  }, [filterStatus, filterPriority, filterComplexity, filterImpact, filterEffortEstimateLabel, filterUnit, filterTarget, filterLabels, filterAssignedTo, filterDepartment]);

  useEffect(() => {
    if (user) {
      const searchParams = getSearchFilterParams();
      fetchAllData(false, 1, false, searchParams);
      fetchTaskSummary(searchParams); // Pass filter params
    }
  }, [user]);

  // Fetch all tasks for dashboard when filters change
  useEffect(() => {
    if (user) {
      const searchParams = getSearchFilterParams();
      fetchAllTasksForDashboard(searchParams);
    }
  }, [searchTerm, filterStatus, filterPriority, filterComplexity, filterImpact, filterEffortEstimateLabel, filterUnit, filterTarget, filterDepartment, filterAssignedTo, filterLabels, filterResponsible, filterAccountable, filterConsulted, filterInformed, filterTrained]);

  // Restore activeTimers state from database when tasks are loaded (optimized)
  useEffect(() => {
    if (tasks.length > 0) {
      const restoredTimers = {};
      const restoredIntervals = {};
      
      // Only create intervals for tasks with active timers
      (tasks || []).forEach(task => {
        if (task.timer_started_at) {
          // Check if interval already exists to avoid duplicates
          if (!timerIntervals[task.id]) {
            const interval = setInterval(() => {
              updateTimerState(prev => ({ ...prev, tick: Date.now() })); // Update tick to force re-render
            }, 1000);
            
            restoredIntervals[task.id] = interval;
          }
        }
      });
      
      // Only update state if there are new intervals
      if (Object.keys(restoredIntervals).length > 0) {
        updateTimerState(prev => ({ 
          ...prev, 
          intervals: { ...prev.intervals, ...restoredIntervals } 
        }));
      }
    }
  }, [tasks, timerIntervals]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(timerIntervals).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, [timerIntervals]);

  // Optimized load task details function with parallel API calls
  const loadTaskDetails = async (taskId) => {
    try {
      // Load task attachments from server
      try {
        const attachmentsResponse = await fetch(`/api/tasks/${taskId}/attachments`);
        if (attachmentsResponse.ok) {
          const attachmentsData = await attachmentsResponse.json();
          setTaskFiles(attachmentsData.attachments || []);
        } else {
          setTaskFiles([]);
        }
      } catch (error) {
        console.error('Error loading task attachments:', error);
        setTaskFiles([]);
      }
      // Only set default comments if no comments exist yet
      setTaskComments(prev => {
        if (Array.isArray(prev) && prev.length > 0) {
          // Keep existing comments
          return prev;
        } else {
          // Set default comments only if none exist
          return [
            { id: 1, user: 'Junaid', comment: 'Started working on this task', timestamp: '2025-08-07 10:30' },
            { id: 2, user: 'Admin', comment: 'Please review the requirements', timestamp: '2025-08-07 11:00' }
          ];
        }
      });
      
      // Only set default subtasks if no subtasks exist yet
      setTaskSubtasks(prev => {
        if (Array.isArray(prev) && prev.length > 0) {
          // Keep existing subtasks
          return prev;
        } else {
          // Set default subtasks only if none exist
          return [
            { id: 1, title: 'Research requirements', completed: true },
            { id: 2, title: 'Create wireframes', completed: false },
            { id: 3, title: 'Implement frontend', completed: false }
          ];
        }
      });
      setTaskNotes('Important notes about this task implementation...');
      
      // Load timesheet and history data in parallel for better performance
      const [timesheetResponse, historyResponse] = await Promise.allSettled([
        measureTaskDetails(taskId, fetch(`/api/tasks/${taskId}/timesheet`)),
        measureTaskDetails(taskId, fetch(`/api/tasks/${taskId}/history`))
      ]);
      
      // Handle timesheet data
      if (timesheetResponse.status === 'fulfilled' && timesheetResponse.value.ok) {
        const timesheetData = await timesheetResponse.value.json();
        setTaskTimesheet(timesheetData);
        
        // Calculate total time (seconds)
        const totalSeconds = timesheetData.reduce((total, entry) => total + (entry.hours_logged_seconds ?? entry.hours_logged ?? 0), 0);
        setTaskTimesheetTotal(totalSeconds);
      } else {
        console.error('Failed to load task timesheet');
        setTaskTimesheet([]);
        setTaskTimesheetTotal(0);
      }
      
      // Handle history data
      if (historyResponse.status === 'fulfilled' && historyResponse.value.ok) {
        const historyData = await historyResponse.value.json();
        setTaskHistory(historyData);
      } else {
        console.error('Failed to load task history');
        setTaskHistory([]);
      }
    } catch (error) {
      console.error('Error loading task details:', error);
    }
  };

  // Load task details when selectedTask changes
  useEffect(() => {
    if (selectedTask && showDetailModal) {
      loadTaskDetails(selectedTask.id);
    }
  }, [selectedTask, showDetailModal]);

  // State for all tasks (for dashboard calculations)
  const [allTasks, setAllTasks] = useState([]);

  // Fetch task summary (counts only - optimized for dashboard)
  const fetchTaskSummary = async (filterParams = {}) => {
    try {
      let tasksUrl = '/api/tasks/summary';
      if (user) {
        const params = new URLSearchParams({
          user_id: user.id,
          role: user.role,
          employee_name: user.name || '',
          // Add filter parameters
          ...(filterParams.search && { search: filterParams.search }),
          ...(filterParams.status && { status: filterParams.status }),
          ...(filterParams.priority && { priority: filterParams.priority }),
          ...(filterParams.complexity && { complexity: filterParams.complexity }),
          ...(filterParams.impact && { impact: filterParams.impact }),
          ...(filterParams.effortEstimateLabel && { effortEstimateLabel: filterParams.effortEstimateLabel }),
          ...(filterParams.unit && { unit: filterParams.unit }),
          ...(filterParams.target && { target: filterParams.target }),
          ...(filterParams.labels && { labels: filterParams.labels }),
          ...(filterParams.assignedTo && { assignedTo: filterParams.assignedTo }),
          // Support snake_case for backend compatibility
          ...(filterParams.assignedTo && { assigned_to: filterParams.assignedTo }),
          ...(filterParams.department && { department: filterParams.department })
        });
        tasksUrl += `?${params.toString()}`;
      }
      
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        tasksHeaders['user-name'] = user.name || '';
      }
      
      const response = await fetch(tasksUrl, { headers: tasksHeaders });
      if (response.ok) {
        const summaryData = await response.json();
        // Update summary state directly instead of processing all tasks
        updateUiState({
          totalTasks: summaryData.total || 0,
          completedTasks: summaryData.completed || 0,
          inProgressTasks: summaryData.in_progress || 0,
          pendingTasks: summaryData.pending || 0,
          overdueTasks: summaryData.overdue || 0
        });
      }
    } catch (error) {
      console.error('Error fetching task summary:', error);
    }
  };

  // Build assignedTo filter string (comma-separated names) from selected employee IDs
  const getAssignedToFilterString = () => {
    try {
      if (!Array.isArray(filterAssignedTo) || filterAssignedTo.length === 0) return '';
      if (!Array.isArray(employees) || employees.length === 0) return '';
      const idToName = new Map((employees || []).map(emp => [emp.id, emp.name]));
      const names = filterAssignedTo
        .map(item => {
          const candidateId = typeof item === 'object' ? (item.value ?? item.id) : item;
          let name = idToName.get(candidateId);
          if (!name && typeof item === 'object' && typeof item.label === 'string') {
            name = item.label.split(' (')[0];
          }
          return name;
        })
        .filter(Boolean);
      return names.join(',');
    } catch (e) {
      return '';
    }
  };

  // Build labels filter string (comma-separated label names) from multi-select value
  const getLabelsFilterString = () => {
    try {
      if (!Array.isArray(filterLabels) || filterLabels.length === 0) return '';
      const names = filterLabels
        .map(item => {
          if (typeof item === 'object') {
            return typeof item.value === 'string' ? item.value : (item.label || '');
          }
          return item;
        })
        .filter(Boolean);
      return names.join(',');
    } catch (e) {
      return '';
    }
  };

  // Get current search and filter parameters for server-side filtering
  const getSearchFilterParams = () => {
    return {
      search: searchTerm || '',
      status: filterStatus || '',
      priority: filterPriority || '',
      complexity: filterComplexity || '',
      impact: filterImpact || '',
      effortEstimateLabel: filterEffortEstimateLabel || '',
      unit: filterUnit || '',
      target: filterTarget || '',
      labels: getLabelsFilterString(),
      assignedTo: getAssignedToFilterString(),
      department: filterDepartment || ''
    };
  };

  // Since we're now using server-side filtering, the displayed tasks are already filtered
  const getFilteredTasks = () => {
    return Array.isArray(tasks) ? tasks : [];
  };


  // Since we're using server-side filtering, all tasks are already filtered
  const getAllFilteredTasks = () => {
    return Array.isArray(allTasks) ? allTasks : [];
  };

  const filteredTasks = getFilteredTasks();
  const allFilteredTasks = getAllFilteredTasks();

  // Computed selectAll state based on filtered tasks
  const selectAll = useMemo(() => {
    return filteredTasks.length > 0 && filteredTasks.every(task => selectedTasks.has(task.id));
  }, [selectedTasks, filteredTasks]);


  // Use summary statistics from API (optimized - no need to process all tasks)
  const completedTasks = completedTasksFromState;
  const inProgressTasks = inProgressTasksFromState;
  const pendingTasks = pendingTasksFromState;
  const overdueTasks = overdueTasksFromState;



  const handleSelectTask = (taskId) => {
    setUiState(prev => {
      const newSelectedTasks = new Set(prev.selectedTasks);
      if (newSelectedTasks.has(taskId)) {
        newSelectedTasks.delete(taskId);
      } else {
        newSelectedTasks.add(taskId);
      }
      
      return {
        ...prev,
        selectedTasks: newSelectedTasks
      };
    });
  };

  // Filter functionality
  const handleApplyFilters = () => {
    
    updateUiState({ showFilterModal: false });
    // Reset pagination when filters are applied and fetch with new filters
    updateUiState({ currentPage: 1, hasMoreTasks: true });
    const searchParams = getSearchFilterParams();
    
    fetchAllData(true, 1, false, searchParams);
    fetchAllTasksForDashboard(searchParams); // Also update summary cards with filtered data
  };

  const handleClearFilters = () => {
    updateFilterState({
      status: '',
      priority: '',
      complexity: '',
      impact: '',
      effortEstimateLabel: '',
      unit: '',
      target: '',
      department: '',
      assignedTo: [],
      labels: [],
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
      trained: []
    });
    // Also clear search term and reset pagination
    updateUiState({ searchTerm: '' });
    updateUiState({ currentPage: 1, hasMoreTasks: true });
    fetchAllData(true, 1, false, {});
  };

  // Handle task detail view
  const handleTaskClick = async (task) => {
    try {
      // ✅ FIX: Initialize checklistCompletion IMMEDIATELY from list task
      const completedItems = parseChecklistCompleted(task.checklist_completed);
      setModalState(prev => ({
        ...prev,
        checklistCompletion: {
          ...prev.checklistCompletion,
          [task.id]: completedItems
        }
      }));
      
      // Save scroll position before opening modal to prevent scroll jump
      const scrollY = window.scrollY;
      
      // First set the task from list (for immediate UI update)
      updateUiState({ 
        selectedTask: task,
        showDetailModal: true 
      });
      
      // Restore scroll position after state update to prevent scroll jump
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
      
      // ✅ FIX: Fetch full task details including checklist from backend
      try {
        const fullTaskResponse = await fetch(`/api/tasks/${task.id}`);
        if (fullTaskResponse.ok) {
          const fullTask = await fullTaskResponse.json();
          // Update selectedTask with full data including checklist
          updateUiState({ 
            selectedTask: fullTask
          });
          
          // Load existing checklist completion state from full task data
          const completedItems = parseChecklistCompleted(fullTask.checklist_completed);
          setModalState(prev => ({
            ...prev,
            checklistCompletion: {
              ...prev.checklistCompletion,
              [task.id]: completedItems
            }
          }));
        } else {
          console.error('Failed to fetch full task details');
          // Fallback: Use checklist_completed from list task if available
          const completedItems = parseChecklistCompleted(task.checklist_completed);
          setModalState(prev => ({
            ...prev,
            checklistCompletion: {
              ...prev.checklistCompletion,
              [task.id]: completedItems
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching full task details:', error);
        // Fallback: Use checklist_completed from list task if available
        const completedItems = parseChecklistCompleted(task.checklist_completed);
        setModalState(prev => ({
          ...prev,
          checklistCompletion: {
            ...prev.checklistCompletion,
            [task.id]: completedItems
          }
        }));
      }
      
      // Load task details and history
      loadTaskDetails(task.id);
      
      // Load history directly
      fetch(`/api/tasks/${task.id}/history`)
        .then(response => response.json())
        .then(data => setTaskHistory(data))
        .catch(error => console.error('History API error:', error));
    } catch (error) {
      console.error('Error in handleTaskClick:', error);
    }
  };

  const closeDetailModal = () => {
    updateUiState({ 
      selectedTask: null,
      showDetailModal: false,
      taskDetailTab: 'files'
    });
  };


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedTask) return;

    // Show loading state
    const uploadButton = event.target.nextElementSibling;
    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.textContent = 'Uploading...';
    }

    try {
      const formData = new FormData();
      formData.append('attachments', file);
      formData.append('uploaded_by', user?.id || 1);

      const response = await fetch(`/api/tasks/${selectedTask.id}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        // Reload the task files from server to ensure consistency
        try {
          const attachmentsResponse = await fetch(`/api/tasks/${selectedTask.id}/attachments`);
          if (attachmentsResponse.ok) {
            const attachmentsData = await attachmentsResponse.json();
            setTaskFiles(attachmentsData.attachments || []);
          }
        } catch (reloadError) {
          console.error('Error reloading attachments:', reloadError);
          // Fallback: add the uploaded file to the list
          setTaskFiles(prev => [...(prev || []), ...(result.files || [])]);
        }
        // Clear the file input
        event.target.value = '';
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      // Reset loading state
      const uploadButton = event.target.nextElementSibling;
      if (uploadButton) {
        uploadButton.disabled = false;
        uploadButton.innerHTML = '<Plus className="w-4 h-4" /><span>Upload File</span>';
      }
    }
  };

  const handleRemoveFile = async (fileId) => {
    if (!selectedTask) return;

    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}/attachments/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Reload the task files from server to ensure consistency
        try {
          const attachmentsResponse = await fetch(`/api/tasks/${selectedTask.id}/attachments`);
          if (attachmentsResponse.ok) {
            const attachmentsData = await attachmentsResponse.json();
            setTaskFiles(attachmentsData.attachments || []);
          }
        } catch (reloadError) {
          console.error('Error reloading attachments:', reloadError);
          // Fallback: remove the file from the list
          setTaskFiles(prev => (prev || []).filter(file => file.id !== fileId));
        }
      } else {
        const error = await response.json();
        alert(`Delete failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Delete failed. Please try again.');
    }
  };

  const handleDownloadFile = async (file) => {
    if (!selectedTask) return;

    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}/attachments/${file.id}/download`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        alert(`Download failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed. Please try again.');
    }
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment = {
        id: Date.now(),
        user: user?.name || 'User',
        comment: newComment,
        timestamp: new Date().toLocaleString()
      };
      setTaskComments(prev => [...(Array.isArray(prev) ? prev : []), comment]);
      setNewComment('');
    }
  };

  const handleCommentDelete = (commentId) => {
    setTaskComments(prev => {
      const currentComments = Array.isArray(prev) ? prev : [];
      return currentComments.filter(comment => comment.id !== commentId);
    });
  };

  const handleCommentEdit = (commentId, newText) => {
    setTaskComments(prev => {
      const currentComments = Array.isArray(prev) ? prev : [];
      return currentComments.map(comment => 
        comment.id === commentId 
          ? { ...comment, comment: newText }
          : comment
      );
    });
  };

  const handleStartEditComment = (commentId, currentText) => {
    setEditingCommentId(commentId);
    setEditingCommentText(currentText);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  const handleSaveEditComment = () => {
    if (editingCommentId && editingCommentText.trim()) {
      handleCommentEdit(editingCommentId, editingCommentText.trim());
      handleCancelEditComment();
    }
  };

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      const subtask = {
        id: Date.now(),
        title: newSubtask,
        completed: false
      };
      setTaskSubtasks(prev => {
        const currentSubtasks = Array.isArray(prev) ? prev : [];
        return [...currentSubtasks, subtask];
      });
      setNewSubtask('');
    }
  };

  const handleSubtaskToggle = (subtaskId) => {
    setTaskSubtasks(prev => {
      const currentSubtasks = Array.isArray(prev) ? prev : [];
      return currentSubtasks.map(subtask => 
        subtask.id === subtaskId 
          ? { ...subtask, completed: !subtask.completed }
          : subtask
      );
    });
  };

  const handleSubtaskDelete = (subtaskId) => {
    setTaskSubtasks(prev => {
      const currentSubtasks = Array.isArray(prev) ? prev : [];
      return currentSubtasks.filter(subtask => subtask.id !== subtaskId);
    });
  };

  const handleSubtaskEdit = (subtaskId, newTitle) => {
    setTaskSubtasks(prev => {
      const currentSubtasks = Array.isArray(prev) ? prev : [];
      return currentSubtasks.map(subtask => 
        subtask.id === subtaskId 
          ? { ...subtask, title: newTitle }
          : subtask
      );
    });
  };

  const handleStartEditSubtask = (subtaskId, currentTitle) => {
    setEditingSubtaskId(subtaskId);
    setEditingSubtaskTitle(currentTitle);
  };

  const handleCancelEditSubtask = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  const handleSaveEditSubtask = () => {
    if (editingSubtaskId && editingSubtaskTitle.trim()) {
      handleSubtaskEdit(editingSubtaskId, editingSubtaskTitle.trim());
      handleCancelEditSubtask();
    }
  };

  const handleNotesChange = (notes) => {
    setTaskNotes(notes);
    // Here you would typically save to server
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('Form data before submission:', formData);
    
    // Validate required fields
    if (!formData.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    
    if (!formData.assignedTo || formData.assignedTo.length === 0) {
      alert('Please assign the task to at least one person. This ensures the task remains visible and manageable.');
      return;
    }
    
    try {
      const url = editingTask 
        ? `/api/tasks/${editingTask.id}`
        : '/api/tasks';
      
      const method = editingTask ? 'PUT' : 'POST';
      
      // Convert arrays back to strings for API
      const apiData = {
        ...formData,
        assigned_to: employeeArrayToString(formData.assignedTo),
        responsible: employeeArrayToString(formData.responsible),
        accountable: employeeArrayToString(formData.accountable),
        consulted: employeeArrayToString(formData.consulted),
        informed: employeeArrayToString(formData.informed),
        trained: employeeArrayToString(formData.trained),
        impact: formData.impact,
        complexity: formData.complexity,
        unit: formData.unit,
        target: formData.target,
        effort_estimate_label: formData.effortEstimateLabel,
        time_estimate_hours: formData.timeEstimateHours,
        time_estimate_minutes: formData.timeEstimateMinutes,
        checklist: formData.checklist !== undefined ? formData.checklist : '', // ✅ Always include checklist
        fileLinks: formData.fileLinks || '',
        videoLinks: formData.videoLinks || ''
      };

      // Remove undefined values to prevent API issues
      // But preserve checklist and other text fields even if empty (to allow clearing them)
      const fieldsToPreserve = ['checklist', 'description', 'workflow_guide', 'fileLinks', 'videoLinks']; // Fields that can be empty
      Object.keys(apiData).forEach(key => {
        if (apiData[key] === undefined) {
          delete apiData[key];
        }
        // ✅ Preserve certain fields even if empty
        if (fieldsToPreserve.includes(key)) {
          return; // Don't delete these fields
        }
        if (apiData[key] === '') {
          delete apiData[key];
        }
      });

      console.log('Sending task data to API:', apiData);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'employee',
          'user-permissions': JSON.stringify((user?.role === 'admin' || user?.role === 'Admin') ? ['all'] : (user?.permissions || []))
        },
        body: JSON.stringify(apiData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Task saved successfully:', result);
        startTransition(() => {
          fetchAllData();
        });
        handleCloseModal();
      } else {
        const errorText = await response.text();
        console.error('Failed to save task:', errorText);
        alert('Failed to save task: ' + errorText);
      }
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task');
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    // Find the task to check permissions
    const task = tasks.find(t => t.id === id);
    if (!task) {
      alert('Task not found');
      return;
    }

    // Check permissions before allowing delete
    if (!canDeleteTask(task)) {
      alert('You do not have permission to delete this task.');
      return;
    }

    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'employee',
          'user-permissions': JSON.stringify((user?.role === 'admin' || user?.role === 'Admin') ? ['all'] : (user?.permissions || []))
        },
        body: JSON.stringify({
          user_role: user?.role || 'employee',
          user_permissions: user?.permissions || []
        })
      });

      if (response.ok) {
        startTransition(() => {
          fetchAllData();
        });
        alert('Task deleted successfully');
      } else {
        const errorData = await response.json();
        if (response.status === 403) {
          alert(`Access denied: ${errorData.error}`);
        } else {
          alert(errorData.error || 'Failed to delete task');
        }
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedTasks.size} selected task(s)?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const selectedIds = Array.from(selectedTasks);
      
      const response = await fetch('/api/tasks/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'admin',
          'user-permissions': JSON.stringify(['all']),
          'user-name': user?.name || 'Admin'
        },
        body: JSON.stringify({ 
          ids: selectedIds
        }),
      });

      if (response.ok) {
        const result = await response.json();
        startTransition(() => {
          fetchAllData();
        });
        setUiState(prev => ({
          ...prev,
          selectedTasks: new Set()
        }));
        alert(result.message);
      } else {
        const error = await response.json();
        if (response.status === 403) {
          alert(`Access denied: ${error.error}`);
        } else {
          alert(error.error || 'Failed to delete tasks');
        }
      }
    } catch (error) {
      alert('Failed to delete tasks: ' + error.message);
    }
  };

  // Handle bulk status change
  const handleBulkStatusChange = async () => {
    if (selectedTasks.size === 0 || !bulkStatus) return;
    const confirmMessage = `Change status of ${selectedTasks.size} selected task(s) to "${bulkStatus}"?`;
    if (!confirm(confirmMessage)) return;
    try {
      const updatePromises = Array.from(selectedTasks).map(id =>
        fetch(`/api/tasks/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: bulkStatus, user_name: user?.name || 'Admin', user_id: user?.id || 1 })
        })
      );
      const responses = await Promise.all(updatePromises);
      const ok = responses.every(r => r.ok);
      if (!ok) throw new Error('One or more updates failed');
      // Refresh tasks list
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify(user.role === 'admin' ? ['all'] : (user.permissions || []));
      }
      
      // Build the same URL logic for consistency
      let refreshTasksUrl = '/api/tasks';
      if (user) {
        const params = new URLSearchParams({
          user_id: user.id,
          role: user.role,
          employee_name: user.name || ''
        });
        refreshTasksUrl += `?${params.toString()}`;
      }
      
      const tasksResponse = await fetch(refreshTasksUrl, { headers: tasksHeaders });
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        // Handle both paginated and non-paginated responses
        updateDataState({ tasks: Array.isArray(tasksData.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []) });
      }
      updateUiState({ showBulkStatusModal: false });
      updateFormState({ bulkStatus: '' });
      setUiState(prev => ({ ...prev, selectedTasks: new Set() }));
      
      // Refresh history if task detail modal is open
      if (selectedTask) {
        fetch(`/api/tasks/${selectedTask.id}/history`)
          .then(response => response.json())
          .then(data => setTaskHistory(data))
          .catch(error => console.error('Error refreshing history:', error));
      }
      
      alert('Status updated for selected tasks');
    } catch (error) {
      console.error('Bulk status change error:', error);
      alert('Failed to change status for selected tasks');
    }
  };

  // Handle delete task history entry (admin only)
  const handleDeleteHistory = async (historyId) => {
    // Find the history entry to show confirmation details
    const historyEntry = taskHistory.find(entry => entry.id === historyId);
    if (historyEntry) {
      updateModalState({ historyToDelete: historyEntry });
      updateUiState({ showDeleteHistoryModal: true });
    }
  };

  // Confirm and execute history deletion
  const confirmDeleteHistory = async () => {
    if (!historyToDelete) return;

    try {
      const response = await fetch(`/api/task-history/${historyToDelete.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_role: user?.role || 'employee'
        })
      });

      if (response.ok) {
        // Refresh the task history for the current task
        if (selectedTask) {
          await loadTaskDetails(selectedTask.id);
        }
        updateUiState({ showDeleteHistoryModal: false });
        updateModalState({ historyToDelete: null });
        alert('History entry deleted successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete history entry');
      }
    } catch (error) {
      console.error('Error deleting history entry:', error);
      alert('Failed to delete history entry');
    }
  };

  // Handle delete all history for a task (admin only)
  const handleDeleteAllHistory = () => {
    if (selectedTask && taskHistory.length > 0) {
      updateUiState({ showDeleteAllHistoryModal: true });
    }
  };

  // Confirm and execute delete all history
  const confirmDeleteAllHistory = async () => {
    if (!selectedTask) return;

    try {
      const response = await fetch(`/api/task-history/task/${selectedTask.id}/delete-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_role: user?.role || 'employee'
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Refresh the task history for the current task
        await loadTaskDetails(selectedTask.id);
        updateUiState({ showDeleteAllHistoryModal: false });
        alert(result.message);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete all history entries');
      }
    } catch (error) {
      console.error('Error deleting all history entries:', error);
      alert('Failed to delete all history entries');
    }
  };

  // Helper function to convert string to array of employee objects
  const stringToEmployeeArray = (str, employees) => {
    if (!str) return [];
    const names = str.split(',').map(name => name.trim()).filter(name => name);
    return names.map(name => {
      // Try to find employee by exact name match first
      let employee = employees.find(emp => emp.name === name);
      
      // If not found, try case-insensitive match
      if (!employee) {
        employee = employees.find(emp => emp.name?.toLowerCase() === name.toLowerCase());
      }
      
      // If still not found, try partial match
      if (!employee) {
        employee = employees.find(emp => emp.name?.toLowerCase().includes(name.toLowerCase()));
      }
      
      // If employee found, return the proper format
      if (employee) {
        return { value: employee.id, label: `${employee.name} (${employee.employee_id})` };
      }
      
      // If not found in employees list, create a minimal fallback entry using just the name
      // This avoids confusing "(Unknown)" labels while still preserving the assignee string
      return {
        value: `fallback-${name.replace(/\s+/g, '-').toLowerCase()}`,
        label: `${name}`
      };
    }).filter(Boolean);
  };

  // Helper function to convert array of employee objects to string
  const employeeArrayToString = (arr) => {
    return arr.map(item => item.label.split(' (')[0]).join(', ');
  };

  // Helper function to check if user has active timer
  const getUserActiveTimer = () => {
    return tasks.find(task => 
      task.timer_started_at && 
      task.assigned_to && 
      task.assigned_to.includes(user?.name || 'Admin')
    );
  };

  // Task Scoring Functions - Using Context
  const { calculateTaskScore: contextCalculateTaskScore } = useTaskConfig();
  
  const calculateTaskScore = (task) => {
    return contextCalculateTaskScore(task);
  };

  const getScoreCategory = (score) => {
    if (score >= 80) return 'Critical';
    if (score >= 65) return 'High';
    if (score >= 50) return 'Medium';
    if (score >= 35) return 'Low';
    return 'Very Low';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-red-100 text-red-800';
    if (score >= 65) return 'bg-orange-100 text-orange-800';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800';
    if (score >= 35) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-600';
  };

  const getImpactDescription = (impact) => {
    const descriptions = {
      'Compliance & Risk': 'Essential work that must be done to meet legal, regulatory, or contractual obligations and to avoid penalties or security threats.',
      'Revenue Growth': 'Tasks that are directly focused on increasing the company\'s income and sales.',
      'Customer Experience': 'Tasks aimed at improving customer satisfaction, loyalty, and retention. This focuses on making existing customers happier.',
      'Cost Reduction': 'Tasks that are directly focused on decreasing the company\'s expenses and improving profitability.',
      'Efficiency & Process': 'Work aimed at improving internal workflows, automating manual steps, and saving employee time. It makes the company run smoother.',
      'Innovation & Development': 'Tasks related to creating entirely new products, services, or capabilities for the future. This is forward-looking, research-and-development work.',
      'Knowledge & Training': 'Internal tasks focused on upskilling the team, creating documentation, and sharing information across the company.'
    };
    return descriptions[impact] || '';
  };

  const { getScoreBreakdown: contextGetScoreBreakdown } = useTaskConfig();
  
  const getScoreBreakdown = (task) => {
    return contextGetScoreBreakdown(task);
  };



  // Timer functions
  const startTimer = async (taskId) => {
    // Find the task to check permissions
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      alert('Task not found');
      return;
    }

    // Check permissions before allowing timer start
    if (!canStartTimer(task)) {
      alert('You do not have permission to start timer on this task.');
      return;
    }

    // ===== OPTIMISTIC UPDATE: Do this FIRST, before API call =====
    const currentTime = Date.now();
    let interval = null;
    
    // Start interval immediately
    interval = setInterval(() => {
      updateTimerState(prev => ({ ...prev, tick: Date.now() })); // Update tick to force re-render
    }, 1000);
    
    // Update ALL state synchronously (before await) for instant UI update
    updateTimerState(prev => ({ 
      ...prev, 
      activeTimers: { ...prev.activeTimers, [taskId]: currentTime },
      intervals: { ...prev.intervals, [taskId]: interval },
      tick: Date.now() // ✅ Use current time, not start time - ensures immediate count-up
    }));
    
    // Update tasks array optimistically to show timer is active
    updateDataState(prev => ({
      ...prev,
      tasks: prev.tasks.map(task => 
        task.id === taskId 
          ? { ...task, timer_started_at: new Date(currentTime).toISOString().replace('T', ' ').replace('.000Z', '') }
          : task
      )
    }));
    
    // ✅ Trigger immediate re-render with fresh tick for faster update
    setTimeout(() => {
      updateTimerState(prev => ({ ...prev, tick: Date.now() }));
    }, 10); // Reduced from 50ms for faster update

    // ===== NOW do API call (doesn't block UI) =====
    try {
      const response = await measureTimerOperation('Start', fetch(`/api/tasks/${taskId}/start-timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_name: user?.name || 'Admin',
          user_id: user?.id || 1
        }),
      }));

      if (!response.ok) {
        // Rollback on error
        if (interval) clearInterval(interval);
        updateTimerState(prev => {
          const newTimers = { ...prev.activeTimers };
          delete newTimers[taskId];
          const newIntervals = { ...prev.intervals };
          delete newIntervals[taskId];
          return { ...prev, activeTimers: newTimers, intervals: newIntervals };
        });
        updateDataState(prev => ({
          ...prev,
          tasks: prev.tasks.map(task => 
            task.id === taskId 
              ? { ...task, timer_started_at: null }
              : task
          )
        }));
        const errorData = await response.json();
        alert(`Failed to start timer: ${errorData.error || 'Unknown error'}`);
        return;
      }
      
      // Delay refresh to avoid overwriting optimistic state
      // Wait 500ms to ensure server has processed the request
      setTimeout(() => {
        refreshTasksOnly();
      }, 500);
        
        // Reload task details if task detail modal is open
        if (selectedTask && selectedTask.id === taskId) {
          loadTaskDetails(taskId);
          
          // Also refresh history directly
          fetch(`/api/tasks/${taskId}/history`)
            .then(response => response.json())
            .then(data => setTaskHistory(data))
            .catch(error => console.error('Error refreshing history:', error));
      }
    } catch (error) {
      // Rollback on network error
      if (interval) clearInterval(interval);
      updateTimerState(prev => {
        const newTimers = { ...prev.activeTimers };
        delete newTimers[taskId];
        const newIntervals = { ...prev.intervals };
        delete newIntervals[taskId];
        return { ...prev, activeTimers: newTimers, intervals: newIntervals };
      });
      updateDataState(prev => ({
        ...prev,
        tasks: prev.tasks.map(task => 
          task.id === taskId 
            ? { ...task, timer_started_at: null }
            : task
        )
      }));
      console.error('Error starting timer:', error);
      alert('❌ Failed to start timer: Network error');
    }
  };

  const stopTimerWithMemo = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.timer_started_at) return;
    
    // 🔒 FREEZE TIMER IMMEDIATELY - Clear interval first to stop count-up
    // ✅ FIX: Read directly from timerState, not destructured timerIntervals
    if (timerState.intervals[taskId]) {
      clearInterval(timerState.intervals[taskId]);
    }
    
    // ✅ PRESERVE start time before clearing - needed for handleStopTimerSubmit
    // ✅ FIX: Read directly from timerState, not destructured activeTimers
    const preservedStartTime = timerState.activeTimers[taskId] || new Date(task.timer_started_at).getTime();
    
    // 🔒 Freeze timer state - clear interval but KEEP activeTimers for calculation
    updateTimerState(prev => {
      const newIntervals = { ...prev.intervals };
      delete newIntervals[taskId];
      return {
        ...prev,
        intervals: newIntervals
        // ✅ DON'T delete activeTimers - we need it for handleStopTimerSubmit
      };
    });
    
    // Calculate start time based on current time minus elapsed time from timer display
    const endTime = new Date();
    let startTime;
    
    // ✅ FIX: Read directly from timerState, not destructured activeTimers
    if (timerState.activeTimers[taskId]) {
      // Use local timer state if available
      startTime = new Date(timerState.activeTimers[taskId]);
    } else {
      // Calculate start time from current time minus the elapsed time shown in timer display
      const elapsedSeconds = Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000);
      startTime = new Date(endTime.getTime() - (elapsedSeconds * 1000));
    }
    
    // Calculate total seconds, ensuring non-negative
    const totalSeconds = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
    
    updateTimerState({
      stopTimerTaskId: taskId,
      stopTimerStartTime: startTime.toLocaleTimeString('en-US', { hour12: false }),
      stopTimerEndTime: endTime.toLocaleTimeString('en-US', { hour12: false }),
      stopTimerTotalTime: `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`,
      stopTimerMemo: ''
    });
    updateUiState({ showStopTimerModal: true });
  };

  const handleStopTimerSubmit = async () => {
    // 🔍 DEBUG: Confirm function is being called
    console.log('🚀 handleStopTimerSubmit CALLED - stopTimerTaskId:', stopTimerTaskId, 'memo length:', stopTimerMemo?.length);
    
    if (!stopTimerMemo.trim()) {
      console.log('❌ Early return - memo is empty');
      alert('Please enter a memo before stopping the timer');
      return;
    }

    console.log('✅ Memo is valid, proceeding with stop timer...');

    try {
      console.log('🔄 Starting stop timer process...');
      // ===== CRITICAL: Calculate loggedSeconds BEFORE clearing activeTimers =====
      const task = tasks.find(t => t.id === stopTimerTaskId);
      console.log('🔍 Found task:', task?.id, 'timer_started_at:', task?.timer_started_at);
      // ✅ FIX: Read directly from timerState, not destructured activeTimers
      let startTime = timerState.activeTimers[stopTimerTaskId];
      
      // Fallback: If activeTimers doesn't have the start time, calculate from task.timer_started_at
      if (!startTime && task?.timer_started_at) {
        const timerStartDate = new Date(task.timer_started_at);
        startTime = timerStartDate.getTime();
        console.log('⚠️ Using fallback startTime from task.timer_started_at:', task.timer_started_at, 'converted to:', startTime); // Debug log
      }
      
      const loggedSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      const currentLoggedSeconds = task?.logged_seconds || 0;
      const newLoggedSeconds = currentLoggedSeconds + loggedSeconds;
      
      console.log('🛑 Stop timer calculation - startTime:', startTime, 'loggedSeconds:', loggedSeconds, 'currentLoggedSeconds:', currentLoggedSeconds, 'newLoggedSeconds:', newLoggedSeconds, 'task.timer_started_at:', task?.timer_started_at); // Debug log

      // ===== OPTIMISTIC UPDATE: Do this AFTER calculating loggedSeconds =====
      // Clear interval and local timer state IMMEDIATELY
      // ✅ FIX: Read directly from timerState, not destructured timerIntervals
      if (timerState.intervals[stopTimerTaskId]) {
        clearInterval(timerState.intervals[stopTimerTaskId]);
      }
      
      // ✅ Use same method as modal: Update both states together with tick for instant UI update
      // Clear activeTimers and intervals in a single state update
      updateTimerState(prev => {
        const newTimers = { ...prev.activeTimers };
        delete newTimers[stopTimerTaskId];
        const newIntervals = { ...prev.intervals };
        delete newIntervals[stopTimerTaskId];
        return { 
          ...prev, 
          activeTimers: newTimers,
          intervals: newIntervals,
          tick: Date.now() // Force re-render to show logged time immediately
        };
      });
      
      // OPTIMISTIC UPDATE: Update local tasks array immediately with new logged_seconds
      // This ensures getTimerDisplay shows logged_seconds instead of 00:00:00
      // ✅ CRITICAL FIX: Update both dataState and tick in sequence to force immediate re-render
      console.log('🔄 About to update dataState - clearing timer_started_at for task:', stopTimerTaskId);
      updateDataState(prev => {
        console.log('🔄 Inside updateDataState - prev.tasks length:', prev.tasks.length);
        const updatedTasks = prev.tasks.map(task => {
          if (task.id === stopTimerTaskId) {
            console.log('🔄 Updating task:', task.id, 'OLD timer_started_at:', task.timer_started_at);
            return { 
              ...task, 
              timer_started_at: null, // ✅ Clear timer_started_at to make stop button disappear
              logged_seconds: newLoggedSeconds // Update logged_seconds optimistically
            };
          }
          return task;
        });
        const updatedTask = updatedTasks.find(t => t.id === stopTimerTaskId);
        console.log('🔄 Optimistic update - ID:', updatedTask?.id, 'timer_started_at:', updatedTask?.timer_started_at, 'logged_seconds:', updatedTask?.logged_seconds);
        console.log('🔄 Returning updated state with', updatedTasks.length, 'tasks');
        return { ...prev, tasks: updatedTasks };
      });
      console.log('🔄 updateDataState called, waiting for React to process...');
      
      // ✅ CRITICAL: Update tick IMMEDIATELY after dataState to force re-render with new task object
      // This ensures the row re-renders (due to row key including tick) and the stop button condition reads the updated task.timer_started_at
      const newTick = Date.now();
      console.log('🔄 Updating tick to:', newTick, 'to force re-render');
      updateTimerState(prev => ({ ...prev, tick: newTick }));
      
      // ✅ CRITICAL: Force another tick update after a microtask to ensure React processes the state updates
      setTimeout(() => {
        const nextTick = Date.now();
        console.log('🔄 Second tick update:', nextTick);
        updateTimerState(prev => ({ ...prev, tick: nextTick }));
      }, 0);

      // ===== NOW do API call =====
      console.log('🔄 Making API call to stop timer...');
      const response = await fetch(`/api/tasks/${stopTimerTaskId}/stop-timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          loggedSeconds,
          user_name: user?.name || 'Admin',
          user_id: user?.id || 1,
          memo: stopTimerMemo.trim()
        }),
      });

      if (response.ok) {
        // Get the updated logged_seconds from server response
        const responseData = await response.json();
        console.log('✅ Server response after stop timer:', responseData); // Debug log
        const serverLoggedSeconds = responseData.logged_seconds || newLoggedSeconds;
        console.log('✅ Using logged_seconds:', serverLoggedSeconds, 'for task:', stopTimerTaskId); // Debug log
        
        // Update local task state immediately with server's logged_seconds
        // This ensures getTimerDisplay shows the correct total time instead of 00:00:00
        // ✅ CRITICAL FIX: Update both dataState and tick in sequence to force immediate re-render
        console.log('✅ About to update dataState after server response - clearing timer_started_at for task:', stopTimerTaskId);
        updateDataState(prev => {
          console.log('✅ Inside updateDataState (server response) - prev.tasks length:', prev.tasks.length);
          const updatedTasks = prev.tasks.map(task => {
            if (task.id === stopTimerTaskId) {
              console.log('✅ Updating task:', task.id, 'OLD timer_started_at:', task.timer_started_at);
              return { 
                ...task, 
                timer_started_at: null, // ✅ Clear timer_started_at to make stop button disappear
                logged_seconds: serverLoggedSeconds // Use server's logged_seconds
              };
            }
            return task;
          });
          const updatedTask = updatedTasks.find(t => t.id === stopTimerTaskId);
          console.log('✅ Server response update - ID:', updatedTask?.id, 'timer_started_at:', updatedTask?.timer_started_at, 'logged_seconds:', updatedTask?.logged_seconds);
          // 🔍 CRITICAL: Verify timer_started_at is actually null
          if (updatedTask?.timer_started_at !== null && updatedTask?.timer_started_at !== undefined) {
            console.error('❌ ERROR: timer_started_at is NOT null after update!', updatedTask?.timer_started_at);
          }
          console.log('✅ Returning updated state with', updatedTasks.length, 'tasks');
          return { ...prev, tasks: updatedTasks };
        });
        console.log('✅ updateDataState (server response) called, waiting for React to process...');
        
        // ✅ CRITICAL: Update tick IMMEDIATELY after dataState to force re-render with new task object
        // This ensures the row re-renders (due to row key including tick) and the stop button condition reads the updated task.timer_started_at
        updateTimerState(prev => ({ ...prev, tick: Date.now() }));
        
        // ✅ CRITICAL: Force another tick update after a microtask to ensure React processes the state updates
        // This ensures both state updates are processed before React evaluates the JSX condition
        setTimeout(() => {
          updateTimerState(prev => ({ ...prev, tick: Date.now() }));
        }, 0);
        
        // ✅ NO REFRESH - Local state is authoritative after stop
        // refreshTasksOnly() removed - prevents overwriting correct state
        
        // Reload task details if task detail modal is open
        if (selectedTask && selectedTask.id === stopTimerTaskId) {
          loadTaskDetails(stopTimerTaskId);
          
          // Also refresh history directly
          fetch(`/api/tasks/${stopTimerTaskId}/history`)
            .then(response => response.json())
            .then(data => setTaskHistory(data))
            .catch(error => console.error('Error refreshing history:', error));
        }
        
        // ✅ Use same method as modal: Close modal and update tick in single state update
        updateUiState({ showStopTimerModal: false });
        updateTimerState({
          stopTimerTaskId: null,
          stopTimerMemo: '',
          stopTimerStartTime: '',
          stopTimerEndTime: '',
          stopTimerTotalTime: '',
          tick: Date.now() // ✅ Force re-render to show updated state (same as modal)
        });
      } else {
        // Rollback on error - restore timer state
        const errorData = await response.json();
        // ✅ FIX: Read directly from timerState, not destructured activeTimers
        const startTime = timerState.activeTimers[stopTimerTaskId] || Date.now() - (loggedSeconds * 1000);
        const interval = setInterval(() => {
          updateTimerState(prev => ({ ...prev, tick: Date.now() }));
        }, 1000);
        updateTimerState(prev => ({
          ...prev,
          activeTimers: { ...prev.activeTimers, [stopTimerTaskId]: startTime },
          intervals: { ...prev.intervals, [stopTimerTaskId]: interval }
        }));
        updateDataState(prev => ({
          ...prev,
          tasks: prev.tasks.map(task => 
            task.id === stopTimerTaskId 
              ? { ...task, timer_started_at: task.timer_started_at, logged_seconds: currentLoggedSeconds }
              : task
          )
        }));
        alert(`Failed to stop timer: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      // Rollback on network error
      console.error('Error stopping timer:', error);
      // ✅ FIX: Read directly from timerState, not destructured activeTimers
      const startTime = timerState.activeTimers[stopTimerTaskId] || Date.now() - (loggedSeconds * 1000);
      const interval = setInterval(() => {
        updateTimerState(prev => ({ ...prev, tick: Date.now() }));
      }, 1000);
      updateTimerState(prev => ({
        ...prev,
        activeTimers: { ...prev.activeTimers, [stopTimerTaskId]: startTime },
        intervals: { ...prev.intervals, [stopTimerTaskId]: interval }
      }));
      updateDataState(prev => ({
        ...prev,
        tasks: prev.tasks.map(task => 
          task.id === stopTimerTaskId 
            ? { ...task, timer_started_at: task.timer_started_at, logged_seconds: currentLoggedSeconds }
            : task
        )
      }));
      alert('Failed to stop timer: Network error');
    }
  };

  const stopTimer = async (taskId) => {
    // Find the task to check permissions
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      alert('Task not found');
      return;
    }

    // Check permissions before allowing timer stop
    if (!canStopTimer(task)) {
      alert('You do not have permission to stop timer on this task.');
      return;
    }

    // Use the memo modal for stopping timers
    stopTimerWithMemo(taskId);
  };

  // Helper function to parse checklist_completed and filter by date
  const parseChecklistCompleted = (checklistCompletedString) => {
    if (!checklistCompletedString) {
      return [];
    }
    
    try {
      const parsed = JSON.parse(checklistCompletedString);
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Old format (array) → incomplete (no date means reset)
      if (Array.isArray(parsed)) {
        return [];
      }
      
      // New format → check if date matches today
      if (parsed.date && parsed.date === today && Array.isArray(parsed.indices)) {
        return parsed.indices; // Return indices only if date matches today
      }
      
      // Date doesn't match today or invalid format → incomplete
      return [];
    } catch (e) {
      console.error('Error parsing checklist completion:', e);
      return [];
    }
  };

  // Check if all checklist items are completed
  const areAllChecklistItemsCompleted = (task) => {
    if (!task.checklist || task.checklist.trim() === '') {
      return true; // No checklist means no validation needed
    }
    
    const checklistItems = task.checklist.split('\n').filter(item => item.trim() !== '');
    if (checklistItems.length === 0) {
      return true; // No items means complete
    }
    
    // Check local state first (for current session)
    const localCompleted = checklistCompletion[task.id] || [];
    if (localCompleted.length === checklistItems.length) {
      return true;
    }
    
    // Check if the task has checklist completion tracking in database
    if (task.checklist_completed) {
      const completedItems = parseChecklistCompleted(task.checklist_completed);
      return completedItems.length === checklistItems.length;
    }
    
    // If no completion tracking exists, consider incomplete
    return false;
  };

  // Check if unit is set and valid
  const isUnitValid = (task) => {
    // Check if unit exists and is a valid number greater than 0
    if (!task.unit) return false;
    const unitValue = parseFloat(task.unit);
    return !isNaN(unitValue) && unitValue > 0;
  };

  // Check if task can be completed (both checklist and unit validation)
  const canTaskBeCompleted = (task) => {
    // For the selected task, also check if the current input value is valid
    if (selectedTask && task.id === selectedTask.id) {
      return areAllChecklistItemsCompleted(task) && isUnitValid(selectedTask);
    }
    return areAllChecklistItemsCompleted(task) && isUnitValid(task);
  };

  // Handle checklist item toggle
  const handleChecklistItemToggle = async (taskId, itemIndex) => {
    // Calculate new completion state (optimistic update)
    const current = checklistCompletion[taskId] || [];
    let newCompletion;
    
    if (current.includes(itemIndex)) {
      // Remove item from completed list
      newCompletion = current.filter(i => i !== itemIndex);
    } else {
      // Add item to completed list
      newCompletion = [...current, itemIndex].sort((a, b) => a - b);
    }
    
    // Update local state immediately (optimistic update)
    setModalState(prev => ({
      ...prev,
      checklistCompletion: {
        ...prev.checklistCompletion,
        [taskId]: newCompletion
      }
    }));
    
    // ✅ FIX: Save to database
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'employee',
          'user-permissions': JSON.stringify((user?.role === 'admin' || user?.role === 'Admin') ? ['all'] : (user?.permissions || []))
        },
        body: JSON.stringify({
          checklist_completed: newCompletion
        }),
      });
      
      if (!response.ok) {
        // Rollback on error - restore previous state
        setModalState(prev => ({
          ...prev,
          checklistCompletion: {
            ...prev.checklistCompletion,
            [taskId]: current
          }
        }));
        console.error('Failed to save checklist completion');
        alert('Failed to save checklist completion. Please try again.');
      } else {
        // Update selectedTask if it's the current task
        if (selectedTask && selectedTask.id === taskId) {
          updateUiState({
            selectedTask: {
              ...selectedTask,
              checklist_completed: JSON.stringify(newCompletion)
            }
          });
        }
      }
    } catch (error) {
      // Rollback on error - restore previous state
      setModalState(prev => ({
        ...prev,
        checklistCompletion: {
          ...prev.checklistCompletion,
          [taskId]: current
        }
      }));
      console.error('Error saving checklist completion:', error);
      alert('Failed to save checklist completion. Please check your connection and try again.');
    }
  };

  // Check if a specific checklist item is completed
  const isChecklistItemCompleted = (taskId, itemIndex) => {
    const completed = checklistCompletion[taskId] || [];
    return completed.includes(itemIndex);
  };


  const formatTime = (seconds) => {
    // ✅ Extra safety: ensure non-negative values
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerDisplay = (task) => {
    // ✅ FIX: Read directly from timerState, not destructured activeTimers (prevents stale closure)
    const isActive = timerState.activeTimers[task.id];
    const isActiveFromDB = task.timer_started_at;
    
    let activeTime = 0;
    if (isActive) {
      // Timer is active in local state - use current time for real-time updates
      // ✅ Use tick in calculation to ensure React re-renders when tick changes
      const currentTime = timerState.tick || Date.now();
      activeTime = Math.floor((currentTime - isActive) / 1000);
    } else if (isActiveFromDB) {
      // Timer is active in database but not in local state (e.g., after page refresh)
      // ✅ Use tick to ensure re-renders
      const currentTime = timerState.tick || Date.now();
      const startTime = new Date(isActiveFromDB).getTime();
      activeTime = Math.floor((currentTime - startTime) / 1000);
    }
    
    // Clamp to 0 to prevent negative values (timezone mismatch protection)
    activeTime = Math.max(0, activeTime);
    
    // If timer is currently active, show only the current session time (starting from 00:00:00)
    // If timer is stopped, show the cumulative logged time
    if (isActive || isActiveFromDB) {
      return formatTime(activeTime);
    } else {
      const displayTime = formatTime(task.logged_seconds || 0);
      // Debug log when logged_seconds is 0 but we expect it to have a value
      if ((task.logged_seconds || 0) === 0 && task.id && !isActive && !isActiveFromDB) {
        console.log('⚠️ getTimerDisplay - Task ID:', task.id, 'logged_seconds:', task.logged_seconds, 'timer_started_at:', task.timer_started_at, 'isActive:', isActive, 'isActiveFromDB:', isActiveFromDB, 'displayTime:', displayTime);
      }
      return displayTime;
    }
  };

  // Helper function to check if user can edit a specific task
  const canEditTask = (task) => {
    if (!user || !user.permissions) return false;
    
    // Check for universal edit permission
    if (user.permissions.includes('all') || user.permissions.includes('edit_tasks')) {
      return true;
    }
    
    // Check for edit own tasks permission
    if (user.permissions.includes('edit_own_tasks')) {
      // Check if task is assigned to current user
      const assignedTo = task.assigned_to || '';
      return assignedTo.toLowerCase().includes(user.name?.toLowerCase() || '');
    }
    
    return false;
  };

  // Helper function to check if user can delete a specific task
  const canDeleteTask = (task) => {
    if (!user || !user.permissions) return false;
    
    // Check for universal delete permission
    if (user.permissions.includes('all') || user.permissions.includes('delete_tasks')) {
      return true;
    }
    
    // Check for delete own tasks permission
    if (user.permissions.includes('delete_own_tasks')) {
      // Check if task is assigned to current user
      const assignedTo = task.assigned_to || '';
      return assignedTo.toLowerCase().includes(user.name?.toLowerCase() || '');
    }
    
    return false;
  };

  // Helper function to check if user can start timer on a specific task
  const canStartTimer = (task) => {
    if (!user || !user.permissions) return false;
    
    // Check for universal start timer permission
    if (user.permissions.includes('all') || user.permissions.includes('start_timer')) {
      return true;
    }
    
    // Check for start own timer permission
    if (user.permissions.includes('start_own_timer')) {
      // Check if task is assigned to current user
      const assignedTo = task.assigned_to || '';
      return assignedTo.toLowerCase().includes(user.name?.toLowerCase() || '');
    }
    
    return false;
  };

  // Helper function to check if user can stop timer on a specific task
  const canStopTimer = (task) => {
    if (!user || !user.permissions) return false;
    
    // Check for universal stop timer permission
    if (user.permissions.includes('all') || user.permissions.includes('stop_timer')) {
      return true;
    }
    
    // Check for stop own timer permission
    if (user.permissions.includes('stop_own_timer')) {
      // Check if task is assigned to current user
      const assignedTo = task.assigned_to || '';
      return assignedTo.toLowerCase().includes(user.name?.toLowerCase() || '');
    }
    
    return false;
  };

  const canCreateTask = () => {
    if (!user || !user.permissions) return false;
    
    // Check for create tasks permission or admin access
    return user.permissions.includes('all') || 
           user.permissions.includes('create_tasks') || 
           user.role === 'admin';
  };

  // Validate status change before updating
  const validateStatusChange = (task, newStatus) => {
    // If changing to Completed, check completion requirements
    if (newStatus === 'Completed') {
      if (!canTaskBeCompleted(task)) {
        let errorMessage = 'Cannot complete task: ';
        const issues = [];
        
        if (!areAllChecklistItemsCompleted(task)) {
          issues.push('all checklist items must be completed');
        }
        if (!isUnitValid(task)) {
          issues.push('unit value must be set');
        }
        
        errorMessage += issues.join(' and ');
        return { isValid: false, message: errorMessage };
      }
    }
    
    return { isValid: true };
  };

  // Update task status with history tracking and validation
  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      // Find the current task to get the old status
      const currentTask = tasks.find(t => t.id === taskId);
      if (!currentTask) {
        alert('Task not found');
        return;
      }

      const oldStatus = currentTask.status;
      
      // Don't update if status is the same
      if (oldStatus === newStatus) {
        return;
      }

      // Validate the status change
      const validation = validateStatusChange(currentTask, newStatus);
      if (!validation.isValid) {
        alert(validation.message);
        return;
      }

      // Update task status on server
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: newStatus,
          user_name: user?.name || 'Admin',
          user_id: user?.id || 1,
          old_status: oldStatus
        }),
      });

      if (response.ok) {
        // Update local state
        updateDataState({
          tasks: tasks.map(task => 
            task.id === taskId 
              ? { ...task, status: newStatus }
              : task
          )
        });

        // If the task detail modal is open, update the selected task
        if (selectedTask && selectedTask.id === taskId) {
          updateUiState({
            selectedTask: { ...selectedTask, status: newStatus }
          });
          
          // Reload task details to get updated history
          startTransition(() => {
            loadTaskDetails(taskId);
          });
          
          // Also refresh history directly
          fetch(`/api/tasks/${taskId}/history`)
            .then(response => response.json())
            .then(data => setTaskHistory(data))
            .catch(error => console.error('Error refreshing history:', error));

          // Close the modal if task is marked as complete
          if (newStatus === 'Completed') {
            updateUiState({
              selectedTask: null,
              showDetailModal: false,
              taskDetailTab: 'files'
            });
          }
        }

        console.log(`Task ${taskId} status updated from ${oldStatus} to ${newStatus}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update task status');
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Failed to update task status');
    }
  };

  // Handle select all tasks
  const handleSelectAll = useCallback(() => {
    const filteredTasks = getFilteredTasks();
    const allTaskIds = new Set(filteredTasks.map(task => task.id));
    
    // If all tasks are selected, deselect all; otherwise select all
    const isAllSelected = filteredTasks.length > 0 && filteredTasks.every(task => selectedTasks.has(task.id));
    
    setUiState(prev => ({
      ...prev,
      selectedTasks: isAllSelected ? new Set() : allTaskIds
    }));
  }, [selectedTasks, getFilteredTasks]);


  // Handle edit
  const handleEdit = (task) => {
    // Check permissions before allowing edit
    if (!canEditTask(task)) {
      alert('You do not have permission to edit this task.');
      return;
    }
    updateFormState({ editingTask: task });
    // If description is just the assignee's name accidentally, clear it for UX
    const sanitizedDescription = (() => {
      const desc = (task.description || '').trim();
      const assignee = (task.assigned_to || '').trim();
      if (!desc) return '';
      if (assignee && desc.toLowerCase() === assignee.toLowerCase()) return '';
      if (user?.name && desc.toLowerCase() === user.name.toLowerCase()) return '';
      return task.description || '';
    })();

    setFormData({
      title: task.title || '',
      department: task.department || '',
      taskCategory: task.task_category || '',
      project: task.project || '',
      startDate: task.start_date || '',
      dueDate: task.due_date || '',
      withoutDueDate: task.without_due_date === 1,
      assignedTo: stringToEmployeeArray(task.assigned_to, employees),
      status: task.status || '',
      description: sanitizedDescription,
      responsible: stringToEmployeeArray(task.responsible, employees),
      accountable: stringToEmployeeArray(task.accountable, employees),
      consulted: stringToEmployeeArray(task.consulted, employees),
      informed: stringToEmployeeArray(task.informed, employees),
      trained: stringToEmployeeArray(task.trained, employees),
      labels: task.labels || '',
      milestones: task.milestones || '',
      priority: task.priority || '',
      complexity: task.complexity || '',
      impact: task.impact || '', // Added
      unit: task.unit || '', // Added
      target: task.target || '', // Added
      effortEstimateLabel: task.effort_estimate_label || '', // Added
      timeEstimateHours: task.time_estimate_hours || 0,
      timeEstimateMinutes: task.time_estimate_minutes || 0,
      makePrivate: task.make_private === 1,
      share: task.share === 1,
      repeat: task.repeat === 1,
      isDependent: task.is_dependent === 1,
      validationBy: task.validation_by || '',
      effortLabel: task.effort_label || '',
      checklist: task.checklist || '',
      workflowGuide: task.workflow_guide || '',
      fileLinks: task.file_links || '',
      videoLinks: task.video_links || '',
    });
    
    // Save scroll position before opening modal to prevent scroll jump
    const scrollY = window.scrollY;
    updateUiState({ showModal: true });
    
    // Restore scroll position after state update to prevent scroll jump
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  // Handle add
  const handleAdd = () => {
    updateFormState({ editingTask: null });
    
    // Default assignment to current user if available
    const defaultAssignedTo = user?.name ? [{
      value: user.id || 'current-user',
      label: `${user.name} (${user.employee_id || user.id || 'current-user'})`
    }] : [];
    
    setFormData({
      title: '',
      department: '',
      taskCategory: '',
      project: '',
      startDate: '',
      dueDate: '',
      withoutDueDate: false,
      assignedTo: defaultAssignedTo,
      status: '',
      description: '',
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
      trained: [],
      labels: '',
      milestones: '',
      priority: '',
      complexity: '',
      impact: '', // Added
      unit: '', // Added
      target: '', // Added
      effortEstimateLabel: '', // Added
      timeEstimateHours: 0,
      timeEstimateMinutes: 0,
      makePrivate: false,
      share: false,
      repeat: false,
      isDependent: false,
      validationBy: '',
      effortLabel: '',
      checklist: '',
      workflowGuide: '',
      fileLinks: '',
      videoLinks: '',
    });
    updateUiState({ showModal: true });
  };

  // Handle close modal
  const handleCloseModal = () => {
    updateUiState({ showModal: false });
    updateFormState({ editingTask: null });
    setFormData({
      title: '',
      department: '',
      taskCategory: '',
      project: '',
      startDate: '',
      dueDate: '',
      withoutDueDate: false,
      assignedTo: [],
      status: '',
      description: '',
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
      trained: [],
      labels: '',
      milestones: '',
      priority: '',
      complexity: '',
      impact: '', // Added
      unit: '', // Added
      target: '', // Added
      effortEstimateLabel: '', // Added
      timeEstimateHours: 0,
      timeEstimateMinutes: 0,
      makePrivate: false,
      share: false,
      repeat: false,
      isDependent: false,
      validationBy: '',
      effortLabel: '',
      checklist: '',
      workflowGuide: '',
    });
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    updateFormState({ importLoading: true });
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      console.log('Starting import...');
      const response = await fetch('/api/tasks/import', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Import result:', result);
        updateFormState({ importResult: result });
        startTransition(() => {
          fetchAllData();
        });
        updateFormState({ selectedFile: null });
        
        setTimeout(() => {
          updateFormState({ importResult: null });
          updateUiState({ showImportModal: false });
        }, 5000);
      } else {
        const errorText = await response.text();
        console.error('Import failed:', errorText);
        alert(`Import failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Error importing tasks:', error);
      alert('Import failed. Please check your connection and try again.');
    } finally {
      updateFormState({ importLoading: false });
    }
  };

  // Handle export
  const handleExport = async (format = 'csv') => {
    try {
      const response = await fetch(`/api/tasks/export?format=${format}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks-export-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        updateUiState({ showExportModal: false });
      } else {
        let errorMessage = 'Export failed';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        console.error('Export error:', errorMessage);
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error exporting tasks:', error);
      alert(`Export failed: ${error.message || 'Please check your connection and try again.'}`);
    }
  };

  // Handle update tasks
  const handleUpdateTasks = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    updateFormState({ importLoading: true });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/tasks/update', {
        method: 'POST',
        body: formData
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Update result:', result);
        updateFormState({ importResult: result });
        startTransition(() => {
          fetchAllData();
        });
        updateFormState({ selectedFile: null });
        
        setTimeout(() => {
          updateFormState({ importResult: null });
          updateUiState({ showUpdateModal: false });
        }, 5000);
      } else {
        const errorText = await response.text();
        console.error('Update failed:', errorText);
        alert(`Update failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Error updating tasks:', error);
      alert('Update failed. Please check your connection and try again.');
    } finally {
      updateFormState({ importLoading: false });
    }
  };

  // Handle download sample file
  const handleDownloadSample = () => {
    // Create sample data with all columns
    const sampleData = [
      {
        'Title': 'Sample Task 1',
        'Department': 'Engineering',
        'Task Category': 'Development',
        'Project': 'Project Alpha',
        'Start Date': '2025-01-15',
        'Due Date': '2025-01-30',
        'Created On': '2025-01-10',
        'Time Estimate Hours': '2',
        'Time Estimate Minutes': '30',
        'Without Due Date': 'No',
        'Assigned To': 'John Doe, Jane Smith',
        'Status': 'In Progress',
        'Description': 'This is a sample task description for demonstration purposes.',
        'Responsible': 'John Doe',
        'Accountable': 'Jane Smith',
        'Consulted': 'Mike Johnson',
        'Informed': 'Sarah Wilson',
        'Trained': 'Alex Brown',
        'Labels': 'Deadline, Improvements',
        'Milestones': 'Phase 1, Phase 2',
        'Priority': 'High',
        'Complexity': 'Medium',
        'Impact': 'Revenue Growth',
        'Unit': '5',
        'Target': 'Complete feature implementation',
        'Effort Estimate Label': '1 Week',
        'Make Private': 'No',
        'Share': 'Yes',
        'Repeat': 'No',
        'Task is dependent on another task': 'No',
        'Validation By': 'Project Manager',
        'Effort Label': 'Development',
        'Checklist': 'Requirements review\nDesign approval\nCode implementation\nTesting\nDeployment',
        'Workflow Guide': '1. Review requirements\n2. Create design\n3. Implement code\n4. Test thoroughly\n5. Deploy to production'
      },
      {
        'Title': 'Sample Task 2',
        'Department': 'Marketing',
        'Task Category': 'Campaign',
        'Project': 'Project Beta',
        'Start Date': '2025-01-20',
        'Due Date': '2025-02-15',
        'Created On': '2025-01-18',
        'Time Estimate Hours': '1',
        'Time Estimate Minutes': '0',
        'Without Due Date': 'No',
        'Assigned To': 'Sarah Wilson',
        'Status': 'Pending',
        'Description': 'Marketing campaign for Q1 product launch.',
        'Responsible': 'Sarah Wilson',
        'Accountable': 'Marketing Manager',
        'Consulted': 'Design Team',
        'Informed': 'Sales Team',
        'Trained': 'Marketing Team',
        'Labels': 'Money, Sale',
        'Milestones': 'Campaign Design, Launch, Analysis',
        'Priority': 'Medium',
        'Complexity': 'Low',
        'Impact': 'Customer Experience',
        'Unit': '3',
        'Target': 'Increase brand awareness by 25%',
        'Effort Estimate Label': '1 Month',
        'Make Private': 'No',
        'Share': 'Yes',
        'Repeat': 'Yes',
        'Task is dependent on another task': 'No',
        'Validation By': 'Marketing Director',
        'Effort Label': 'Campaign Management',
        'Checklist': 'Define target audience\nCreate campaign materials\nSet up tracking\nLaunch campaign\nMonitor performance',
        'Workflow Guide': '1. Research target audience\n2. Design campaign materials\n3. Set up analytics\n4. Launch campaign\n5. Monitor and optimize'
      },
      {
        'Title': 'Sample Task 3',
        'Department': 'Sales',
        'Task Category': 'Lead Generation',
        'Project': 'Project Gamma',
        'Start Date': '2025-01-25',
        'Due Date': '2025-02-10',
        'Time Estimate Hours': '0',
        'Time Estimate Minutes': '45',
        'Without Due Date': 'No',
        'Assigned To': 'Mike Johnson',
        'Status': 'Completed',
        'Description': 'Generate qualified leads for enterprise sales team.',
        'Responsible': 'Mike Johnson',
        'Accountable': 'Sales Manager',
        'Consulted': 'Marketing Team',
        'Informed': 'Product Team',
        'Trained': 'Sales Representatives',
        'Labels': 'Sale, Daily Operations',
        'Milestones': 'Lead Research, Outreach, Qualification',
        'Priority': 'Low',
        'Complexity': 'High',
        'Impact': 'Revenue Growth',
        'Unit': '10',
        'Target': 'Generate 50 qualified leads',
        'Effort Estimate Label': '1 Week',
        'Make Private': 'No',
        'Share': 'Yes',
        'Repeat': 'Yes',
        'Task is dependent on another task': 'No',
        'Validation By': 'Sales Director',
        'Effort Label': 'Lead Generation',
        'Checklist': 'Research potential clients\nCreate outreach strategy\nExecute outreach campaign\nQualify responses\nHand off to sales team',
        'Workflow Guide': '1. Research target companies\n2. Create personalized outreach\n3. Send initial emails\n4. Follow up with calls\n5. Qualify interest level'
      }
    ];

    // Convert to CSV
    const headers = Object.keys(sampleData[0]);
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_tasks_import.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'On Hold': return 'bg-orange-100 text-orange-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get complexity color
  const getComplexityColor = (complexity) => {
    switch (complexity) {
      case 'High': return 'bg-purple-100 text-purple-800';
      case 'Medium': return 'bg-orange-100 text-orange-800';
      case 'Low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get impact color
  const getImpactColor = (impact) => {
    switch (impact) {
      case 'Compliance & Risk': return 'bg-red-100 text-red-800';
      case 'Revenue Growth': return 'bg-green-100 text-green-800';
      case 'Customer Experience': return 'bg-blue-100 text-blue-800';
      case 'Cost Reduction': return 'bg-purple-100 text-purple-800';
      case 'Efficiency & Process': return 'bg-orange-100 text-orange-800';
      case 'Innovation & Development': return 'bg-indigo-100 text-indigo-800';
      case 'Knowledge & Training': return 'bg-teal-100 text-teal-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get impact tooltip content
  const getImpactTooltip = (impact) => {
    switch (impact) {
      case 'Compliance & Risk':
        return 'Essential work that must be done to meet legal, regulatory, or contractual obligations and to avoid penalties or security threats.';
      case 'Revenue Growth':
        return 'Tasks that are directly focused on increasing the company\'s income and sales.';
      case 'Customer Experience':
        return 'Tasks aimed at improving customer satisfaction, loyalty, and retention. This focuses on making existing customers happier.';
      case 'Cost Reduction':
        return 'Tasks that are directly focused on decreasing the company\'s expenses and improving profitability.';
      case 'Efficiency & Process':
        return 'Work aimed at improving internal workflows, automating manual steps, and saving employee time. It makes the company run smoother.';
      case 'Innovation & Development':
        return 'Tasks related to creating entirely new products, services, or capabilities for the future. This is forward-looking, research-and-development work.';
      case 'Knowledge & Training':
        return 'Internal tasks focused on upskilling the team, creating documentation, and sharing information across the company.';
      default:
        return '';
    }
  };

  // Get unique values for filter dropdowns
  const getUniqueValues = (field) => {
    const values = (tasks || []).map(task => task[field]).filter(Boolean);
    return [...new Set(values)];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  // Debug: Log render
  console.log('🎨 Tasks component rendering...');
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={() => updateUiState({ showColumnModal: true })}>
            <Settings className="w-4 h-4 mr-2" />
            Customize Columns
          </Button>
          <Button variant="secondary" onClick={() => updateUiState({ showTaskCalculationModal: true })}>
            <Filter className="w-4 h-4 mr-2" />
            Task Calculation
          </Button>
          <Button variant="secondary" onClick={() => updateUiState({ showFilterModal: true })}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          <Button variant="secondary" onClick={() => updateUiState({ showExportModal: true })}>
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
          <Button variant="secondary" onClick={() => updateUiState({ showImportModal: true })}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="secondary" onClick={() => updateUiState({ showUpdateModal: true })}>
            <Edit className="w-4 h-4 mr-2" />
            Update Tasks
          </Button>
          {canCreateTask() && (
            <Button variant="primary" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          )}
        </div>
      </div>



      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Briefcase className="w-8 h-8 text-purple-600 mr-3" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalTasks}</div>
              <div className="text-sm text-gray-600">
                Total Tasks
                {hasMoreTasks && user?.role !== 'admin' && (
                  <span className="text-blue-600 ml-1">({totalTasks} total)</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{completedTasks}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{inProgressTasks}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Circle className="w-8 h-8 text-yellow-600 mr-3" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{pendingTasks}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-red-600 mr-3" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{overdueTasks}</div>
              <div className="text-sm text-gray-600">Overdue</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Timer Warning */}
      {user?.role === 'employee' && getUserActiveTimer() && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                You have an active timer on task: "{getUserActiveTimer().title}"
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                You can only have one active timer at a time. Stop the current timer before starting a new one.
              </p>
            </div>
            <button
              onClick={() => stopTimer(getUserActiveTimer().id)}
              className="px-3 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 transition-colors"
            >
              Stop Timer
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => {
                  console.log('🔍 Input onChange triggered:', e.target.value);
                  handleSearch(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {selectedTasks.size > 0 && (
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                {selectedTasks.size} task(s) selected
              </div>
              <div className="relative inline-block text-left">
                <div className="flex gap-2">
                  <Button 
                    variant="danger" 
                    onClick={handleBulkDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => updateUiState({ showBulkStatusModal: true })}
                    className="flex items-center space-x-2"
                  >
                    <span>Actions</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Status Modal */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="text-lg font-semibold mb-4">Change Status for Selected Tasks</div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => updateFormState({ bulkStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => { updateUiState({ showBulkStatusModal: false }); updateFormState({ bulkStatus: '' }); }}>Cancel</Button>
                <Button variant="primary" onClick={handleBulkStatusChange}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columnOrder.map(columnKey => 
                  visibleColumns[columnKey] && (
                    <th 
                      key={columnKey}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      style={{ width: `${columnWidths[columnKey]}px` }}
                    >
                      {columnKey === 'checkbox' ? (
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300"
                          checked={selectAll}
                          onChange={handleSelectAll}
                        />
                      ) : (
                        getAllColumns().find(col => col.key === columnKey)?.name || columnKey
                      )}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-4 text-center text-gray-500">
                    No tasks found
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={`task-${task.id}`} className="hover:bg-gray-50">
                    {columnOrder.map(columnKey => 
                      visibleColumns[columnKey] && (
                        <td key={columnKey} className="px-6 py-4" style={{ width: `${columnWidths[columnKey]}px` }}>
                          {columnKey === 'checkbox' && (
                            <input 
                              type="checkbox" 
                              className="rounded border-gray-300 cursor-pointer"
                              checked={selectedTasks.has(task.id)}
                              onChange={(e) => {
                                e.stopPropagation(); // Stop event from bubbling up to the row
                                handleSelectTask(task.id);
                              }}
                              style={{ pointerEvents: 'auto', zIndex: 10 }}
                            />
                          )}
                          {columnKey === 'id' && (
                            <span className="text-sm text-gray-900">{task.id}</span>
                          )}
                          {columnKey === 'title' && (
                            <div>
                              <button 
                                onClick={() => handleTaskClick(task)}
                                className="text-sm font-medium text-gray-900 hover:text-blue-600 cursor-pointer text-left"
                              >
                                {task.title}
                              </button>
                              {task.description && (
                                <div className="text-sm text-gray-500 truncate max-w-xs">
                                  {task.description}
                                </div>
                              )}
                              {task.checklist && (
                                <div className="flex items-center space-x-1 mt-1">
                                  {areAllChecklistItemsCompleted(task) ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      <span className="text-xs text-green-600">Checklist complete</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                                      <span className="text-xs text-yellow-600">Checklist incomplete</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {!isUnitValid(task) && (
                                <div className="flex items-center space-x-1 mt-1">
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                  <span className="text-xs text-red-600">Unit required</span>
                                </div>
                              )}
                            </div>
                          )}
                          {columnKey === 'task' && (
                            <div>
                              <button 
                                onClick={() => handleTaskClick(task)}
                                className="text-sm font-medium text-gray-900 hover:text-blue-600 cursor-pointer text-left"
                              >
                                {task.title}
                              </button>
                              {task.description && (
                                <div className="text-sm text-gray-500 truncate max-w-xs">
                                  {task.description}
                                </div>
                              )}
                              {task.checklist && (
                                <div className="flex items-center space-x-1 mt-1">
                                  {areAllChecklistItemsCompleted(task) ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      <span className="text-xs text-green-600">Checklist complete</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                                      <span className="text-xs text-yellow-600">Checklist incomplete</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {!isUnitValid(task) && (
                                <div className="flex items-center space-x-1 mt-1">
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                  <span className="text-xs text-red-600">Unit required</span>
                                </div>
                              )}
                            </div>
                          )}
                          {columnKey === 'department' && (
                            <span className="text-sm text-gray-900">{task.department || '-'}</span>
                          )}
                          {columnKey === 'task_category' && (
                            <span className="text-sm text-gray-900">{task.task_category || '-'}</span>
                          )}
                          {columnKey === 'project' && (
                            <span className="text-sm text-gray-900">{task.project || '-'}</span>
                          )}
                          {columnKey === 'start_date' && (
                            <span className="text-sm text-gray-900">{task.start_date || '-'}</span>
                          )}
                          {columnKey === 'due_date' && (
                            <span className="text-sm text-gray-900">{task.due_date || '-'}</span>
                          )}
                          {columnKey === 'without_due_date' && (
                            <span className="text-sm text-gray-900">{task.without_due_date ? 'Yes' : 'No'}</span>
                          )}
                          {columnKey === 'assigned_to' && (
                            <span className="text-sm text-gray-900">
                              {task.assigned_to || '-'}
                            </span>
                          )}
                          {columnKey === 'assignedTo' && (
                            <span className="text-sm text-gray-900">
                              {task.assigned_to || '-'}
                            </span>
                          )}
                          {columnKey === 'status' && (
                            <div>
                              {(user?.role?.toLowerCase() === 'employee' || user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager' || user?.role?.toLowerCase() === 'team lead') ? (
                                <div className="relative">
                                  <select
                                    value={task.status}
                                    onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="Pending">Pending</option>
                                    <option value="In Progress">In Progress</option>
                                    <option 
                                      value="Completed" 
                                      disabled={!canTaskBeCompleted(task)}
                                      className={!canTaskBeCompleted(task) ? 'text-gray-400' : ''}
                                    >
                                      {!canTaskBeCompleted(task) ? 'Completed (Requirements not met)' : 'Completed'}
                                    </option>
                                    <option value="On Hold">On Hold</option>
                                    <option value="Cancelled">Cancelled</option>
                                  </select>
                                  {!canTaskBeCompleted(task) && task.status !== 'Completed' && (
                                    <div className="absolute -bottom-6 left-0 text-xs text-red-600 whitespace-nowrap">
                                      {!areAllChecklistItemsCompleted(task) && !isUnitValid(task) 
                                        ? 'Complete checklist & set unit to complete'
                                        : !areAllChecklistItemsCompleted(task)
                                        ? 'Complete checklist to finish'
                                        : 'Set unit value to complete'
                                      }
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                                  {task.status}
                                </span>
                              )}
                            </div>
                          )}
                          {columnKey === 'description' && (
                            <span className="text-sm text-gray-900 truncate max-w-xs">{task.description || '-'}</span>
                          )}
                          {columnKey === 'responsible' && (
                            <span className="text-sm text-gray-900">{task.responsible || '-'}</span>
                          )}
                          {columnKey === 'accountable' && (
                            <span className="text-sm text-gray-900">{task.accountable || '-'}</span>
                          )}
                          {columnKey === 'consulted' && (
                            <span className="text-sm text-gray-900">{task.consulted || '-'}</span>
                          )}
                          {columnKey === 'informed' && (
                            <span className="text-sm text-gray-900">{task.informed || '-'}</span>
                          )}
                          {columnKey === 'trained' && (
                            <span className="text-sm text-gray-900">{task.trained || '-'}</span>
                          )}
                          {columnKey === 'labels' && (
                            <span className="text-sm text-gray-900">{task.labels || '-'}</span>
                          )}
                          {columnKey === 'label_id' && (
                            <span className="text-sm text-gray-900">{task.label_id || '-'}</span>
                          )}
                          {columnKey === 'milestones' && (
                            <span className="text-sm text-gray-900">{task.milestones || '-'}</span>
                          )}
                          {columnKey === 'priority' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                          )}
                          {columnKey === 'complexity' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getComplexityColor(task.complexity)}`}>
                              {task.complexity || '-'}
                            </span>
                          )}
                          {columnKey === 'impact' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getImpactColor(task.impact)}`}>
                              {task.impact || '-'}
                            </span>
                          )}
                          {columnKey === 'unit' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.unit && task.unit > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {task.unit || 'Not set'}
                            </span>
                          )}
                          {columnKey === 'target' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.target ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                              {task.target || '-'}
                            </span>
                          )}
                          {columnKey === 'effort_estimate_label' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.effort_estimate_label ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                              {task.effort_estimate_label || '-'}
                            </span>
                          )}
                          {columnKey === 'effortEstimate' && (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.effort_estimate_label ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                              {task.effort_estimate_label || '-'}
                            </span>
                          )}
                          {columnKey === 'time_estimate' && (
                            <div className="flex items-center space-x-1">
                              <span className="text-sm text-gray-900">
                                {task.time_estimate_hours || 0}h {task.time_estimate_minutes || 0}m
                              </span>
                            </div>
                          )}
                          {columnKey === 'make_private' && (
                            <span className="text-sm text-gray-900">{task.make_private ? 'Yes' : 'No'}</span>
                          )}
                          {columnKey === 'share' && (
                            <span className="text-sm text-gray-900">{task.share ? 'Yes' : 'No'}</span>
                          )}
                          {columnKey === 'repeat' && (
                            <span className="text-sm text-gray-900">{task.repeat ? 'Yes' : 'No'}</span>
                          )}
                          {columnKey === 'is_dependent' && (
                            <span className="text-sm text-gray-900">{task.is_dependent ? 'Yes' : 'No'}</span>
                          )}
                          {columnKey === 'validation_by' && (
                            <span className="text-sm text-gray-900">{task.validation_by || '-'}</span>
                          )}
                          {columnKey === 'effort_label' && (
                            <span className="text-sm text-gray-900">{task.effort_label || '-'}</span>
                          )}
                          {columnKey === 'checklist' && (
                            <span className="text-sm text-gray-900">{task.checklist || '-'}</span>
                          )}
                          {columnKey === 'workflow_guide' && (
                            <span className="text-sm text-gray-900">{task.workflow_guide || '-'}</span>
                          )}
                          {columnKey === 'timer_started_at' && (
                            <span className="text-sm text-gray-900">{task.timer_started_at || '-'}</span>
                          )}
                          {columnKey === 'logged_seconds' && (
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1" key={`timer-display-${task.id}-${tick}`}>
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span className="text-xs font-mono">{getTimerDisplay(task)}</span>
                              </div>
                              {/* ✅ FIX: Use timerState.activeTimers directly to prevent stale closure in JSX */}
                              {canStopTimer(task) && (() => {
                                // 🔍 DEBUG: Log condition evaluation to diagnose stop button issue
                                const hasActiveTimer = timerState.activeTimers[task.id];
                                const hasTimerStarted = task.timer_started_at;
                                const shouldShow = hasActiveTimer || hasTimerStarted;
                                if (shouldShow) {
                                  console.log('🛑 Stop button condition (logged_seconds):', {
                                    taskId: task.id,
                                    hasActiveTimer,
                                    hasTimerStarted,
                                    condition: shouldShow,
                                    timerStateKeys: Object.keys(timerState.activeTimers),
                                    taskTimerStarted: task.timer_started_at,
                                    tick: tick
                                  });
                                }
                                return shouldShow;
                              })() && (
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => stopTimer(task.id)}
                                    className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                                    title="Stop Timer"
                                  >
                                    <Square className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              {canStartTimer(task) && !timerState.activeTimers[task.id] && !task.timer_started_at && (
                                <div className="flex space-x-1">
                                  {(() => {
                                    const userActiveTimer = getUserActiveTimer();
                                    const canStartTimerNow = !userActiveTimer;
                                    
                                    return (
                                      <button
                                        onClick={() => startTimer(task.id)}
                                        className={`p-1 rounded ${
                                          canStartTimerNow 
                                            ? 'bg-green-500 text-white hover:bg-green-600' 
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                        title={
                                          userActiveTimer 
                                            ? `You have an active timer on: ${userActiveTimer.title}`
                                            : "Start Timer"
                                        }
                                        disabled={!canStartTimerNow}
                                      >
                                        <Play className="w-3 h-3" />
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                          {columnKey === 'timer' && (
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1" key={`timer-display-${task.id}-${tick}`}>
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span className="text-xs font-mono">{getTimerDisplay(task)}</span>
                              </div>
                              {/* ✅ FIX: Use timerState.activeTimers directly to prevent stale closure in JSX */}
                              {canStopTimer(task) && (() => {
                                // 🔍 DEBUG: Log condition evaluation to diagnose stop button issue
                                const hasActiveTimer = timerState.activeTimers[task.id];
                                const hasTimerStarted = task.timer_started_at;
                                const shouldShow = hasActiveTimer || hasTimerStarted;
                                if (shouldShow) {
                                  console.log('🛑 Stop button condition (timer column):', {
                                    taskId: task.id,
                                    hasActiveTimer,
                                    hasTimerStarted,
                                    condition: shouldShow,
                                    timerStateKeys: Object.keys(timerState.activeTimers),
                                    taskTimerStarted: task.timer_started_at,
                                    tick: tick
                                  });
                                }
                                return shouldShow;
                              })() && (
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => stopTimer(task.id)}
                                    className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                                    title="Stop Timer"
                                  >
                                    <Square className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              {canStartTimer(task) && !timerState.activeTimers[task.id] && !task.timer_started_at && (
                                <div className="flex space-x-1">
                                  {(() => {
                                    const userActiveTimer = getUserActiveTimer();
                                    const canStartTimerNow = !userActiveTimer;
                                    
                                    return (
                                      <button
                                        onClick={() => startTimer(task.id)}
                                        className={`p-1 rounded ${
                                          canStartTimerNow 
                                            ? 'bg-green-500 text-white hover:bg-green-600' 
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                        title={
                                          userActiveTimer 
                                            ? `You have an active timer on: ${userActiveTimer.title}`
                                            : "Start Timer"
                                        }
                                        disabled={!canStartTimerNow}
                                      >
                                        <Play className="w-3 h-3" />
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                          {columnKey === 'created_at' && (
                            <span className="text-sm text-gray-900">{task.created_at || '-'}</span>
                          )}
                          {columnKey === 'updated_at' && (
                            <span className="text-sm text-gray-900">{task.updated_at || '-'}</span>
                          )}
                          {columnKey === 'score' && (
                            <div className="flex flex-col items-center space-y-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getScoreColor(calculateTaskScore(task))}`}>
                                {calculateTaskScore(task)}
                              </span>
                              <span className="text-xs text-gray-500">
                                {getScoreCategory(calculateTaskScore(task))}
                              </span>
                            </div>
                          )}
                          {columnKey === 'actions' && (
                            <ActionMenu
                              onSelect={() => handleTaskClick(task)}
                              onEdit={canEditTask(task) ? () => handleEdit(task) : undefined}
                              onDelete={canDeleteTask(task) ? () => handleDelete(task.id) : undefined}
                              itemType="task"
                            />
                          )}
                        </td>
                      )
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More Button for non-admin users */}
      {hasMoreTasks && user?.role !== 'admin' && user?.role !== 'Admin' && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={loadMoreTasks}
            disabled={loadingMore}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Loading More Tasks...
              </>
            ) : (
              `Load More Tasks (${totalTasks - tasks.length} remaining)`
            )}
          </Button>
        </div>
      )}

      {/* Add/Edit Task Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingTask ? 'Edit Task' : 'Add Task'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Info Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Task Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <Input
                  type="text"
                  placeholder="e.g. Title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <div className="flex">
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {(departments || []).map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" className="rounded-l-none">
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Category</label>
                <div className="flex">
                  <select
                    value={formData.taskCategory}
                    onChange={(e) => setFormData({ ...formData, taskCategory: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="Development">Development</option>
                    <option value="Design">Design</option>
                    <option value="Testing">Testing</option>
                    <option value="Documentation">Documentation</option>
                  </select>
                  <Button variant="secondary" className="rounded-l-none">
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <div className="flex">
                  <select
                    value={formData.project}
                    onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="Website Redesign">Website Redesign</option>
                    <option value="Mobile App">Mobile App</option>
                    <option value="System Upgrade">System Upgrade</option>
                  </select>
                  <Button variant="secondary" className="rounded-l-none">
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <div className="relative">
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                  <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <div className="relative">
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    disabled={formData.withoutDueDate}
                  />
                  <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                <div className="mt-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.withoutDueDate}
                      onChange={(e) => setFormData({ ...formData, withoutDueDate: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-600">Without due date</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                <MultiSelect
                  options={(() => {
                    const activeEmployees = employees.filter(emp => 
                      emp.status === 'Active' || emp.status === 'active' || emp.status === 1
                    );
                    
                    // Ensure current user is always in the list
                    const currentUserInList = activeEmployees.find(emp => 
                      emp.name === user?.name || emp.employee_id === user?.id
                    );
                    
                    if (!currentUserInList && user?.name) {
                      activeEmployees.unshift({
                        id: user.id || 'current-user',
                        name: user.name,
                        employee_id: user.employee_id || user.id || 'current-user',
                        status: 'Active'
                      });
                    }
                    
                    return activeEmployees.map(emp => ({
                      value: emp.id,
                      label: `${emp.name} (${emp.employee_id})`
                    }));
                  })()}
                  value={formData.assignedTo}
                  onChange={(value) => setFormData({ ...formData, assignedTo: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
                {/* Debug info removed for production */}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows="3"
                placeholder="Add task description..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* RACIT Matrix Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">RACIT Matrix</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsible</label>
                <MultiSelect
                  options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={formData.responsible}
                  onChange={(value) => setFormData({ ...formData, responsible: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accountable</label>
                <MultiSelect
                  options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={formData.accountable}
                  onChange={(value) => setFormData({ ...formData, accountable: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consulted</label>
                <MultiSelect
                  options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={formData.consulted}
                  onChange={(value) => setFormData({ ...formData, consulted: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Informed</label>
                <MultiSelect
                  options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={formData.informed}
                  onChange={(value) => setFormData({ ...formData, informed: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trained</label>
                <MultiSelect
                  options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={formData.trained}
                  onChange={(value) => setFormData({ ...formData, trained: value })}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>
            </div>
          </div>

          {/* Other Details Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Other Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                <div className="flex">
                  <select
                    value={formData.labels}
                    onChange={(e) => setFormData({ ...formData, labels: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {Object.keys(scoringPoints.labels).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    {(labels || []).map((label) => (
                      <option key={label.id} value={label.name}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" className="rounded-l-none">
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Milestones</label>
                <div className="flex">
                  <select
                    value={formData.milestones}
                    onChange={(e) => setFormData({ ...formData, milestones: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="Phase 1">Phase 1</option>
                    <option value="Phase 2">Phase 2</option>
                    <option value="Phase 3">Phase 3</option>
                  </select>
                  <Button variant="secondary" className="rounded-l-none">
                    Add
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {Object.keys(scoringPoints.priority).map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Estimate</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={formData.timeEstimateHours}
                    onChange={(e) => setFormData({ ...formData, timeEstimateHours: parseInt(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-600">hrs</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={formData.timeEstimateMinutes}
                    onChange={(e) => setFormData({ ...formData, timeEstimateMinutes: parseInt(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-600">mins</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
                <select
                  value={formData.complexity}
                  onChange={(e) => {
                    console.log('Complexity changed to:', e.target.value);
                    setFormData({ ...formData, complexity: e.target.value });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {Object.keys(scoringPoints.complexity).map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                  <select
                    value={formData.impact}
                    onChange={(e) => {
                      console.log('Impact changed to:', e.target.value);
                      setFormData({ ...formData, impact: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {Object.keys(scoringPoints.impact).map(option => (
                      <option key={option} value={option} title={getImpactDescription(option)}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effort Estimate Label</label>
                  <select
                    value={formData.effortEstimateLabel}
                    onChange={(e) => {
                      console.log('Effort Estimate Label changed to:', e.target.value);
                      setFormData({ ...formData, effortEstimateLabel: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {Object.keys(scoringPoints.effort).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="number"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Enter number of units"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                  <input
                    type="text"
                    value={formData.target}
                    onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                    placeholder="Enter target (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File Links</label>
                <textarea
                  value={formData.fileLinks}
                  onChange={(e) => setFormData({ ...formData, fileLinks: e.target.value })}
                  rows="3"
                  placeholder="Enter file links (one per line or comma-separated)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Enter file URLs, one per line or separated by commas</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video Links</label>
                <textarea
                  value={formData.videoLinks}
                  onChange={(e) => setFormData({ ...formData, videoLinks: e.target.value })}
                  rows="3"
                  placeholder="Enter video links (one per line or comma-separated)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Enter video URLs (YouTube, Vimeo, etc.), one per line or separated by commas</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.makePrivate}
                  onChange={(e) => setFormData({ ...formData, makePrivate: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-600">Make Private</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.share}
                  onChange={(e) => setFormData({ ...formData, share: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-600">Share</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.repeat}
                  onChange={(e) => setFormData({ ...formData, repeat: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-600">Repeat</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isDependent}
                  onChange={(e) => setFormData({ ...formData, isDependent: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-600">Task is dependent on another task</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validation By</label>
                <Input
                  type="text"
                  placeholder="e.g. Validation By"
                  value={formData.validationBy}
                  onChange={(e) => setFormData({ ...formData, validationBy: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effort Label</label>
                <Input
                  type="text"
                  placeholder="e.g. Effort Label"
                  value={formData.effortLabel}
                  onChange={(e) => setFormData({ ...formData, effortLabel: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Checklist</label>
                <textarea
                  value={formData.checklist}
                  onChange={(e) => setFormData({ ...formData, checklist: e.target.value })}
                  rows="3"
                  placeholder="Add checklist items, one per line."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Guide</label>
                <textarea
                  value={formData.workflowGuide}
                  onChange={(e) => setFormData({ ...formData, workflowGuide: e.target.value })}
                  rows="3"
                  placeholder="Add workflow guidance, one step per line."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save & Add More
            </Button>
            <Button variant="primary" type="submit">
              Save Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => updateUiState({ showImportModal: false })}
        title="Import Tasks"
        size="md"
      >
        <div className="space-y-4">
          {importResult ? (
            <div className={`p-4 rounded-md ${
              importResult.errorCount > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
            }`}>
              <div className="text-sm">
                <div className="font-medium">
                  {importResult.errorCount > 0 ? 'Import completed with errors' : 'Import completed successfully'}
                </div>
                <div className="mt-1">{importResult.message}</div>
                {importResult.errors && (
                  <div className="mt-2">
                    <div className="font-medium text-sm">Errors:</div>
                    <ul className="list-disc list-inside text-xs mt-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-600">
                <p>Upload an Excel file (.xlsx) or CSV file with the following columns:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><strong>Title</strong> (required) - Task title</li>
                  <li><strong>Department</strong> - Department name</li>
                  <li><strong>Task Category</strong> - Task category</li>
                  <li><strong>Project</strong> - Project name</li>
                  <li><strong>Start Date</strong> - Start date (YYYY-MM-DD)</li>
                  <li><strong>Due Date</strong> - Due date (YYYY-MM-DD)</li>
                  <li><strong>Without Due Date</strong> - Yes/No</li>
                  <li><strong>Assigned To</strong> - Person assigned to the task</li>
                  <li><strong>Status</strong> - Pending, In Progress, Completed, On Hold, Cancelled</li>
                  <li><strong>Description</strong> - Task description</li>
                  <li><strong>Responsible</strong> - RACI matrix - Responsible person</li>
                  <li><strong>Accountable</strong> - RACI matrix - Accountable person</li>
                  <li><strong>Consulted</strong> - RACI matrix - Consulted person</li>
                  <li><strong>Informed</strong> - RACI matrix - Informed person</li>
                  <li><strong>Trained</strong> - RACI matrix - Trained person</li>
                  <li><strong>Labels</strong> - Task labels (comma-separated)</li>
                  <li><strong>Milestones</strong> - Task milestones</li>
                  <li><strong>Priority</strong> - Low, Medium, High</li>
                  <li><strong>Complexity</strong> - Low, Medium, High</li>
                  <li><strong>Impact</strong> - Compliance & Risk, Revenue Growth, Customer Experience, Cost Reduction, Efficiency & Process, Innovation & Development, Knowledge & Training</li>
                  <li><strong>Unit</strong> - Numeric value for task completion</li>
                  <li><strong>Target</strong> - Target description</li>
                  <li><strong>Effort Estimate Label</strong> - 1 Day, 1 Week, 1 Month</li>
                  <li><strong>Make Private</strong> - Yes/No</li>
                  <li><strong>Share</strong> - Yes/No</li>
                  <li><strong>Repeat</strong> - Yes/No</li>
                  <li><strong>Task is dependent on another task</strong> - Yes/No</li>
                  <li><strong>Validation By</strong> - Person who validates the task</li>
                  <li><strong>Effort Label</strong> - Effort category</li>
                  <li><strong>Checklist</strong> - Checklist items (one per line)</li>
                  <li><strong>Workflow Guide</strong> - Workflow steps (one per line)</li>
                </ul>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-blue-800 text-xs">
                    <strong>Note:</strong> For a complete list of all available columns and sample data, 
                    download the sample file below.
                  </p>
                </div>
              </div>
              
              {/* Download Sample File Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Sample Import File</h4>
                    <p className="text-xs text-gray-500">Download a CSV file with all columns and sample data</p>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={handleDownloadSample}
                    className="flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Sample</span>
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => updateFormState({ selectedFile: e.target.files[0] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button variant="secondary" onClick={() => updateUiState({ showImportModal: false })} disabled={importLoading}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleImport} disabled={!selectedFile || importLoading}>
                  {importLoading ? 'Importing...' : 'Import Tasks'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Filter Modal */}
      <Modal
        isOpen={showFilterModal}
        onClose={() => updateUiState({ showFilterModal: false })}
        title="Filters"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={filterDepartment}
                onChange={(e) => startTransition(() => updateFilterState({ department: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {(departments || []).map((dept) => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => startTransition(() => updateFilterState({ status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterAssignedTo}
                onChange={(value) => startTransition(() => updateFilterState({ assignedTo: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => startTransition(() => updateFilterState({ priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
              <select
                value={filterComplexity}
                onChange={(e) => startTransition(() => updateFilterState({ complexity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
              <select
                value={filterImpact}
                onChange={(e) => startTransition(() => updateFilterState({ impact: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="Compliance & Risk" title="Essential work that must be done to meet legal, regulatory, or contractual obligations and to avoid penalties or security threats.">Compliance & Risk</option>
                <option value="Revenue Growth" title="Tasks that are directly focused on increasing the company's income and sales.">Revenue Growth</option>
                <option value="Customer Experience" title="Tasks aimed at improving customer satisfaction, loyalty, and retention. This focuses on making existing customers happier.">Customer Experience</option>
                <option value="Cost Reduction" title="Tasks that are directly focused on decreasing the company's expenses and improving profitability.">Cost Reduction</option>
                <option value="Efficiency & Process" title="Work aimed at improving internal workflows, automating manual steps, and saving employee time. It makes the company run smoother.">Efficiency & Process</option>
                <option value="Innovation & Development" title="Tasks related to creating entirely new products, services, or capabilities for the future. This is forward-looking, research-and-development work.">Innovation & Development</option>
                <option value="Knowledge & Training" title="Internal tasks focused on upskilling the team, creating documentation, and sharing information across the company.">Knowledge & Training</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effort Estimate Label</label>
              <select
                value={filterEffortEstimateLabel}
                onChange={(e) => startTransition(() => updateFilterState({ effortEstimateLabel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="1 Day">1 Day</option>
                <option value="1 Week">1 Week</option>
                <option value="1 Month">1 Month</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={filterUnit}
                  onChange={(e) => startTransition(() => updateFilterState({ unit: e.target.value }))}
                  placeholder="Filter by unit value"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
                <button
                  onClick={() => updateFilterState({ unit: '' })}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={filterTarget}
                  onChange={(e) => startTransition(() => updateFilterState({ target: e.target.value }))}
                  placeholder="Filter by target text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => updateFilterState({ target: '' })}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
              <MultiSelect
                options={(labels || []).map((label) => ({
                  value: label.name,
                  label: label.name
                }))}
                value={filterLabels}
                onChange={(value) => startTransition(() => updateFilterState({ labels: value }))}
                placeholder="Select labels..."
                searchPlaceholder="Search labels..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsible</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterResponsible}
                onChange={(value) => startTransition(() => updateFilterState({ responsible: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accountable</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterAccountable}
                onChange={(value) => startTransition(() => updateFilterState({ accountable: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consulted</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterConsulted}
                onChange={(value) => startTransition(() => updateFilterState({ consulted: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Informed</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterInformed}
                onChange={(value) => startTransition(() => updateFilterState({ informed: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trained</label>
              <MultiSelect
                options={employees.filter(emp => emp.status === 'Active').map(emp => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.employee_id})`
                }))}
                value={filterTrained}
                onChange={(value) => startTransition(() => updateFilterState({ trained: value }))}
                placeholder="Select employees..."
                searchPlaceholder="Search employees..."
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
            <Button variant="primary" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </div>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => updateUiState({ showExportModal: false })}
        title="Export Tasks"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Export Format</h3>
            <p className="text-sm text-gray-600 mb-4">Choose the format for your task export:</p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                id="csv-format"
                name="export-format"
                value="csv"
                defaultChecked
                className="w-4 h-4 text-blue-600"
              />
              <label htmlFor="csv-format" className="text-sm font-medium text-gray-700">
                CSV (Comma Separated Values)
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                id="excel-format"
                name="export-format"
                value="excel"
                className="w-4 h-4 text-blue-600"
              />
              <label htmlFor="excel-format" className="text-sm font-medium text-gray-700">
                Excel (.xlsx)
              </label>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Export Information</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>The export will include all task data including:</p>
                  <ul className="list-disc list-inside mt-1">
                    <li>Task details (title, description, status, priority)</li>
                    <li>Assignment information (assigned employees, department)</li>
                    <li>Time estimates and scoring data</li>
                    <li>Dates and timestamps</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={() => updateUiState({ showExportModal: false })}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={() => {
                const checkedRadio = document.querySelector('input[name="export-format"]:checked');
                const format = checkedRadio ? checkedRadio.value : 'csv';
                handleExport(format);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Tasks
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Tasks Modal */}
      <Modal
        isOpen={showUpdateModal}
        onClose={() => updateUiState({ showUpdateModal: false })}
        title="Update Existing Tasks"
        size="md"
      >
        <div className="space-y-4">
          {importResult ? (
            <div className={`p-4 rounded-md ${
              importResult.errorCount > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
            }`}>
              <div className="text-sm">
                <div className="font-medium">
                  {importResult.errorCount > 0 ? 'Update completed with errors' : 'Update completed successfully'}
                </div>
                <div className="mt-1">{importResult.message}</div>
                {importResult.errors && (
                  <div className="mt-2">
                    <div className="font-medium text-sm">Errors:</div>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index} className="text-red-600">{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Update Instructions</h3>
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <p className="text-sm text-gray-600 mb-2">
                    Upload a file with existing task data to update. The file must include a "Task ID" column 
                    to identify which tasks to update. Only the fields you provide will be updated.
                  </p>
                  <div className="mt-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Supported Fields:</h4>
                    <div className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                      <span>• Title</span>
                      <span>• Description</span>
                      <span>• Status</span>
                      <span>• Priority</span>
                      <span>• Complexity</span>
                      <span>• Impact</span>
                      <span>• Unit</span>
                      <span>• Target</span>
                      <span>• Effort Estimate</span>
                      <span>• Time Estimate (Hours)</span>
                      <span>• Time Estimate (Minutes)</span>
                      <span>• Due Date</span>
                      <span>• Start Date</span>
                      <span>• Assigned To</span>
                      <span>• Department</span>
                      <span>• Labels</span>
                      <span>• Checklist</span>
                      <span>• Workflow Guide</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload File</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="update-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                        <span>{selectedFile ? selectedFile.name : 'Select a file'}</span>
                        <input 
                          id="update-file-upload" 
                          name="update-file-upload" 
                          type="file" 
                          className="sr-only" 
                          onChange={(e) => updateFormState({ selectedFile: e.target.files[0] })} 
                          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                        />
                      </label>
                      <p className="pl-1">{!selectedFile && 'or drag and drop'}</p>
                    </div>
                    <p className="text-xs text-gray-500">CSV, XLSX, or XLS files only</p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button variant="secondary" onClick={() => updateUiState({ showUpdateModal: false })} disabled={importLoading}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleUpdateTasks} disabled={!selectedFile || importLoading}>
                  {importLoading ? 'Updating...' : 'Update Tasks'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Task Detail Modal */}
      {showDetailModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white sticky top-0 z-10">
              <div className="flex items-center space-x-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{selectedTask.title}</h2>
                  <p className="text-sm text-gray-500">Task ID: {selectedTask.id}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => updateTaskStatus(selectedTask.id, 'Completed')}
                  disabled={!canTaskBeCompleted(selectedTask)}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                    canTaskBeCompleted(selectedTask)
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title={
                    canTaskBeCompleted(selectedTask)
                      ? "Mark task as complete"
                      : !areAllChecklistItemsCompleted(selectedTask) && !isUnitValid(selectedTask)
                      ? "Cannot complete: Both checklist items and unit value must be completed"
                      : !areAllChecklistItemsCompleted(selectedTask)
                      ? "Cannot complete: All checklist items must be completed first"
                      : "Cannot complete: Unit value must be set"
                  }
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Mark As Complete</span>
                </button>
                {(() => {
                  // ✅ FIX: Read directly from timerState, not destructured activeTimers
                  const isTimerActive = timerState.activeTimers[selectedTask.id] || selectedTask.timer_started_at;
                  const userActiveTimer = getUserActiveTimer();
                  const canStartTimerNow = canStartTimer(selectedTask) && !userActiveTimer;
                  const canStopTimerNow = canStopTimer(selectedTask) && isTimerActive;
                  
                  // Only show timer button if user has any timer permissions
                  if (!canStartTimer(selectedTask) && !canStopTimer(selectedTask)) {
                    return null;
                  }
                  
                  return (
                    <button
                      onClick={() => isTimerActive ? stopTimerWithMemo(selectedTask.id) : startTimer(selectedTask.id)}
                      className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                        isTimerActive 
                          ? 'bg-red-500 text-white hover:bg-red-600' 
                          : canStartTimerNow
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!canStartTimerNow && !canStopTimerNow}
                      title={
                        userActiveTimer && !isTimerActive
                          ? `You have an active timer on: ${userActiveTimer.title}`
                          : isTimerActive
                            ? "Stop Timer"
                            : "Start Timer"
                      }
                    >
                      {isTimerActive ? (
                        <>
                          <Square className="w-4 h-4" />
                          <span>Stop Timer</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Start Timer</span>
                        </>
                      )}
                    </button>
                  );
                })()}
                <button
                  onClick={closeDetailModal}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex min-h-[calc(95vh-120px)]">
              {/* Left Side - Task Details */}
              <div className="w-2/3 p-6 border-r border-gray-200">
                {/* Task Properties */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Project</label>
                      <p className="text-gray-900">{selectedTask.project || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Priority</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.priority === 'High' ? 'bg-red-500' : selectedTask.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                        <span className="text-gray-900">{selectedTask.priority || 'Medium'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Complexity</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.complexity === 'High' ? 'bg-purple-500' : selectedTask.complexity === 'Medium' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                        <span className="text-gray-900">{selectedTask.complexity || 'Low'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Impact</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.impact === 'Compliance & Risk' ? 'bg-red-500' : selectedTask.impact === 'Revenue Growth' ? 'bg-green-500' : selectedTask.impact === 'Customer Experience' ? 'bg-blue-500' : selectedTask.impact === 'Cost Reduction' ? 'bg-purple-500' : selectedTask.impact === 'Efficiency & Process' ? 'bg-orange-500' : selectedTask.impact === 'Innovation & Development' ? 'bg-indigo-500' : selectedTask.impact === 'Knowledge & Training' ? 'bg-teal-500' : 'bg-gray-400'}`}></div>
                        <span className="text-gray-900">{selectedTask.impact || 'Not set'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Effort Estimate Label</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.effort_estimate_label ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                        <span className="text-gray-900">{selectedTask.effort_estimate_label || 'Not set'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Unit</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.unit && selectedTask.unit > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-gray-900">{selectedTask.unit || 'Not set'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Target</label>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${selectedTask.target ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                        <span className="text-gray-900">{selectedTask.target || 'Not set'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Assigned To</label>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {selectedTask.assigned_to ? selectedTask.assigned_to.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <span className="text-gray-900">{selectedTask.assigned_to || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Short Code</label>
                      <p className="text-gray-900">-</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Milestones</label>
                      <p className="text-gray-900">{selectedTask.milestones || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Assigned By</label>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-medium">
                          A
                        </div>
                        <span className="text-gray-900">Admin</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Label</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {selectedTask.labels || 'No Label'}
                    </span>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Task Category</label>
                    <p className="text-gray-900">{selectedTask.task_category || 'General'}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Description</label>
                    <p className="text-gray-900">{selectedTask.description || '-'}</p>
                  </div>

                  {/* File Links Section */}
                  {selectedTask.file_links && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">File Links</label>
                      <div className="space-y-1">
                        {selectedTask.file_links.split(/[,\n]/).filter(link => link.trim()).map((link, index) => {
                          const trimmedLink = link.trim();
                          const isUrl = trimmedLink.startsWith('http://') || trimmedLink.startsWith('https://');
                          return (
                            <div key={index} className="flex items-center space-x-2">
                              {isUrl ? (
                                <a
                                  href={trimmedLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 underline break-all"
                                >
                                  {trimmedLink}
                                </a>
                              ) : (
                                <span className="text-gray-900 break-all">{trimmedLink}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Video Links Section */}
                  {selectedTask.video_links && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Video Links</label>
                      <div className="space-y-1">
                        {selectedTask.video_links.split(/[,\n]/).filter(link => link.trim()).map((link, index) => {
                          const trimmedLink = link.trim();
                          const isUrl = trimmedLink.startsWith('http://') || trimmedLink.startsWith('https://');
                          return (
                            <div key={index} className="flex items-center space-x-2">
                              {isUrl ? (
                                <a
                                  href={trimmedLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 underline break-all"
                                >
                                  {trimmedLink}
                                </a>
                              ) : (
                                <span className="text-gray-900 break-all">{trimmedLink}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Checklist Section */}
                  {selectedTask.checklist && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">Checklist</label>
                        {areAllChecklistItemsCompleted(selectedTask) ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Incomplete
                          </span>
                        )}
                      </div>
                      <div className={`rounded-lg p-4 ${areAllChecklistItemsCompleted(selectedTask) ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                        {selectedTask.checklist.split('\n').filter(item => item.trim() !== '').map((item, index) => (
                          <div key={index} className="flex items-center space-x-2 mb-2">
                            <input
                              type="checkbox"
                              checked={isChecklistItemCompleted(selectedTask.id, index)}
                              onChange={() => handleChecklistItemToggle(selectedTask.id, index)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className={`${isChecklistItemCompleted(selectedTask.id, index) ? 'line-through text-gray-500' : !areAllChecklistItemsCompleted(selectedTask) ? 'text-yellow-800' : 'text-gray-900'}`}>
                              {item.trim()}
                            </span>
                          </div>
                        ))}
                        {!areAllChecklistItemsCompleted(selectedTask) && (
                          <div className="mt-3 p-2 bg-yellow-100 rounded text-xs text-yellow-800">
                            ⚠️ All checklist items must be completed before marking this task as complete.
                          </div>
                        )}
                        {areAllChecklistItemsCompleted(selectedTask) && (
                          <div className="mt-3 p-2 bg-green-100 rounded text-xs text-green-800">
                            ✅ All checklist items completed! You can now mark this task as complete.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                                    {/* Unit Validation Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">Unit Value</label>
                      <div className="flex items-center space-x-2">
                        {selectedTask.unit && parseFloat(selectedTask.unit) > 0 && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            <span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span>
                            Editable
                          </span>
                        )}
                        {isUnitValid(selectedTask) ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Required
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`rounded-lg p-4 ${isUnitValid(selectedTask) ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Enter Unit Value</label>
                          <input
                            type="number"
                            value={selectedTask?.unit || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              console.log('Unit input changed:', newValue);
                              // Update the selectedTask directly using setUiState
                              setUiState(prev => {
                                const updated = {
                                  ...prev,
                                  selectedTask: {
                                    ...prev.selectedTask,
                                    unit: newValue
                                  }
                                };
                                console.log('Updated state:', updated);
                                return updated;
                              });
                            }}
                            placeholder="Enter number of units"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="0.01"
                          />
                          <button
                            onClick={async () => {
                              try {
                                                                 const response = await fetch(`/api/tasks/${selectedTask.id}`, {
                                  method: 'PUT',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    unit: selectedTask.unit,
                                    user_name: user?.name || 'Admin',
                                    user_id: user?.id || 1
                                  }),
                                });
                                
                                if (response.ok) {
                                  // Update the local state immediately with the new unit value
                                  updateUiState(prev => ({
                                    ...prev,
                                    selectedTask: {
                                      ...prev.selectedTask,
                                      unit: selectedTask.unit
                                    }
                                  }));
                                  
                                  // Also update the task in the tasks array
                                  updateDataState({ 
                                    tasks: tasks.map(task => 
                                      task.id === selectedTask.id 
                                        ? { ...task, unit: selectedTask.unit }
                                        : task
                                    )
                                  });
                                  
                                  // Show success message
                                  alert('Unit value saved successfully!');
                                } else {
                                  alert('Failed to update unit value');
                                }
                              } catch (error) {
                                console.error('Error updating unit value:', error);
                                alert('Failed to update unit value');
                              }
                            }}
                            disabled={!selectedTask.unit || parseFloat(selectedTask.unit) <= 0}
                            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                          >
                            Save Unit Value
                          </button>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-medium text-gray-700 mb-1">Current Value:</span>
                          <span className={`text-lg font-bold ${isUnitValid(selectedTask) ? 'text-green-800' : 'text-red-800'}`}>
                            {selectedTask.unit || 'Not set'}
                          </span>
                        </div>
                      </div>
                      {!isUnitValid(selectedTask) && (
                        <div className="mt-3 p-2 bg-red-100 rounded text-xs text-red-800">
                          ⚠️ Unit value must be set to a number greater than 0 before marking this task as complete.
                        </div>
                      )}
                      {isUnitValid(selectedTask) && (
                        <div className="mt-3 p-2 bg-green-100 rounded text-xs text-green-800">
                          ✅ Unit value is valid! You can now mark this task as complete.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Workflow Guide Section */}
                  {selectedTask.workflow_guide && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Workflow Guide</label>
                      <div className="bg-gray-50 rounded-lg p-4">
                        {selectedTask.workflow_guide.split('\n').map((step, index) => (
                          <div key={index} className="flex items-start space-x-2 mb-2">
                            <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium mt-0.5">
                              {index + 1}
                            </span>
                            <span className="text-gray-900">{step.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Validation By</label>
                      <p className="text-gray-900">{selectedTask.validation_by || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Effort Label</label>
                      <p className="text-gray-900">{selectedTask.effort_label || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* RACI Matrix */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">RACIT Matrix</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Responsible</h4>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {selectedTask.responsible ? selectedTask.responsible.charAt(0).toUpperCase() : 'R'}
                        </div>
                        <span className="text-sm text-gray-900">{selectedTask.responsible || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Accountable</h4>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {selectedTask.accountable ? selectedTask.accountable.charAt(0).toUpperCase() : 'A'}
                        </div>
                        <span className="text-sm text-gray-900">{selectedTask.accountable || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Consulted</h4>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {selectedTask.consulted ? selectedTask.consulted.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <span className="text-sm text-gray-900">{selectedTask.consulted || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Informed</h4>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {selectedTask.informed ? selectedTask.informed.charAt(0).toUpperCase() : 'I'}
                        </div>
                        <span className="text-sm text-gray-900">{selectedTask.informed || 'Unassigned'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Due Date & Time */}
              <div className="w-1/3 p-6 bg-gray-50">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="font-medium text-gray-900">Due</span>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Created On</label>
                    <p className="text-gray-900">{new Date(selectedTask.created_at).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    })}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Start Date</label>
                    <p className="text-gray-900">{selectedTask.start_date ? new Date(selectedTask.start_date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    }) : '-'}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Due Date</label>
                    <p className="text-gray-900">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    }) : '-'}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Hours Logged</label>
                    <p className="text-gray-900">{selectedTask.logged_seconds ? `${Math.floor(selectedTask.logged_seconds / 3600)}h ${Math.floor((selectedTask.logged_seconds % 3600) / 60)}m` : '0s'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Tabs */}
            <div className="border-t border-gray-200">
              <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
                {['Files', 'Sub Task', 'Comment', 'Timesheet', 'Notes', 'History'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => updateUiState({ taskDetailTab: tab.toLowerCase().replace(' ', '') })}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      taskDetailTab === tab.toLowerCase().replace(' ', '')
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-6 min-h-[500px]">
                {taskDetailTab === 'files' && (
                  <div>
                    <div className="flex items-center space-x-4 mb-4">
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer flex items-center space-x-2"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Upload File</span>
                      </label>
                    </div>
                    <div className="space-y-2">
                      {(taskFiles || []).map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500">{file.size} • {file.uploadedAt}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => handleDownloadFile(file)}
                              className="text-blue-500 hover:text-blue-700" 
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRemoveFile(file.id)}
                              className="text-red-500 hover:text-red-700" 
                              title="Remove file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {taskDetailTab === 'subtask' && (
                  <div>
                    <div className="flex items-center space-x-4 mb-4">
                      <input
                        type="text"
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        placeholder="Add new subtask..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddSubtask}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {Array.isArray(taskSubtasks) ? taskSubtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={subtask.completed}
                            onChange={() => handleSubtaskToggle(subtask.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          {editingSubtaskId === subtask.id ? (
                            <div className="flex-1 flex items-center space-x-2">
                              <input
                                type="text"
                                value={editingSubtaskTitle}
                                onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onKeyPress={(e) => e.key === 'Enter' && handleSaveEditSubtask()}
                                autoFocus
                              />
                              <button
                                onClick={handleSaveEditSubtask}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEditSubtask}
                                className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className={`flex-1 ${subtask.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                {subtask.title}
                              </span>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleStartEditSubtask(subtask.id, subtask.title)}
                                  className="text-blue-500 hover:text-blue-700 transition-colors"
                                  title="Edit subtask"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleSubtaskDelete(subtask.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors"
                                  title="Delete subtask"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )) : null}
                    </div>
                  </div>
                )}

                {taskDetailTab === 'comment' && (
                  <div>
                    <div className="flex items-center space-x-4 mb-4">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddComment}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-3">
                      {Array.isArray(taskComments) ? taskComments.map((comment) => (
                        <div key={comment.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">{comment.user}</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500">{comment.timestamp}</span>
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => handleStartEditComment(comment.id, comment.comment)}
                                  className="text-blue-500 hover:text-blue-700 transition-colors"
                                  title="Edit comment"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleCommentDelete(comment.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors"
                                  title="Delete comment"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          {editingCommentId === comment.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows="3"
                                autoFocus
                              />
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={handleSaveEditComment}
                                  className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEditComment}
                                  className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-700">{comment.comment}</p>
                          )}
                        </div>
                      )) : null}
                    </div>
                  </div>
                )}

                {taskDetailTab === 'timesheet' && (
                  <div>
                    {/* Total Time Summary */}
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-blue-900">Total Time Spent</h3>
                          <p className="text-sm text-blue-700">All logged time entries for this task</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-900">
                            {Math.floor(taskTimesheetTotal / 60)}m {taskTimesheetTotal % 60}s
                          </div>
                          <div className="text-sm text-blue-600">
                            {taskTimesheet.length} time entries
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timesheet Table */}
                    {taskTimesheet.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 text-lg">No timesheet entries yet</p>
                        <p className="text-gray-400 text-sm mt-2">Time entries will appear here when timers are stopped</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                              <th className="px-4 py-3">Employee</th>
                              <th className="px-4 py-3">Start Time</th>
                              <th className="px-4 py-3">End Time</th>
                              <th className="px-4 py-3">Memo</th>
                              <th className="px-4 py-3">Hours Logged</th>
                            </tr>
                          </thead>
                          <tbody>
                            {taskTimesheet.map((entry) => (
                              <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-4 py-4">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {entry.employee_name ? entry.employee_name.charAt(0).toUpperCase() : 'U'}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-900">{entry.employee_name}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-gray-900">
                                  {entry.formatted_start_time || (entry.start_time ? new Date(entry.start_time).toLocaleString() : '-')}
                                </td>
                                <td className="px-4 py-4 text-gray-900">
                                  {entry.formatted_end_time || (entry.end_time ? new Date(entry.end_time).toLocaleString() : '-')}
                                </td>
                                <td className="px-4 py-4">
                                  <div className="max-w-xs">
                                    <p className="text-gray-700 truncate" title={entry.memo}>
                                      {entry.memo || 'No memo'}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <span className="font-mono text-blue-600 font-medium">
                                    {Math.floor(entry.hours_logged_seconds / 60)}m {entry.hours_logged_seconds % 60}s
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {taskDetailTab === 'notes' && (
                  <div>
                    <textarea
                      value={taskNotes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Add notes about this task..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                )}

                {taskDetailTab === 'history' && (
                  <div>
                    {/* Delete All History Button for Admins */}
                    {(user?.role === 'admin' || user?.role === 'Admin') && taskHistory.length > 0 && (
                      <div className="mb-4 flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-900">Task History</h3>
                        <button
                          onClick={handleDeleteAllHistory}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                          title="Delete all history for this task"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete All History
                        </button>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      {taskHistory.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-500 text-lg">No history available for this task</p>
                          <p className="text-gray-400 text-sm mt-2">History will appear here when actions are performed on this task</p>
                        </div>
                      ) : (
                        taskHistory.map((entry) => (
                          <div key={entry.id} className="flex items-start space-x-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                              {entry.user_name ? entry.user_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-gray-900 text-base">{entry.action}</span>
                                <span className="text-sm text-gray-500 font-medium">{entry.formatted_date}</span>
                              </div>
                              <p className="text-gray-700 mb-2">{entry.description}</p>
                              {entry.user_name && (
                                <p className="text-sm text-gray-600 font-medium">by {entry.user_name}</p>
                              )}
                              {entry.old_value && entry.new_value && (
                                <div className="mt-3 flex items-center space-x-3">
                                  <span className="text-sm text-gray-600 font-medium">Status:</span>
                                  <span className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                                    {entry.old_value}
                                  </span>
                                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                                    {entry.new_value}
                                  </span>
                                </div>
                              )}
                              
                              {/* Delete button for admins */}
                              {(user?.role === 'admin' || user?.role === 'Admin') && (
                                <div className="mt-3 flex justify-end">
                                  <button
                                    onClick={() => handleDeleteHistory(entry.id)}
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                                    title="Delete this history entry"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stop Timer Modal */}
      {showStopTimerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Stop Timer</h2>
              <button
                onClick={() => updateUiState({ showStopTimerModal: false })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="text"
                    value={stopTimerStartTime}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="text"
                    value={stopTimerEndTime}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-900"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Time</label>
                <input
                  type="text"
                  value={stopTimerTotalTime}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-900"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Memo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={stopTimerMemo}
                  onChange={(e) => updateTimerState({ stopTimerMemo: e.target.value })}
                  placeholder="Enter a memo about what you worked on..."
                  rows="4"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Please describe what you worked on during this time period.</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => updateUiState({ showStopTimerModal: false })}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStopTimerSubmit}
                disabled={!stopTimerMemo.trim()}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                  stopTimerMemo.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete History Confirmation Modal */}
      {showDeleteHistoryModal && historyToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Delete History Entry</h2>
              <button
                onClick={() => {
                  updateUiState({ showDeleteHistoryModal: false });
                  updateModalState({ historyToDelete: null });
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium">Are you sure you want to delete this history entry?</p>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Action:</span> {historyToDelete.action}
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  <span className="font-medium">Date:</span> {historyToDelete.formatted_date}
                </p>
                {historyToDelete.description && (
                  <p className="text-sm text-gray-700 mt-1">
                    <span className="font-medium">Description:</span> {historyToDelete.description}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  updateUiState({ showDeleteHistoryModal: false });
                  updateModalState({ historyToDelete: null });
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteHistory}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All History Confirmation Modal */}
      {showDeleteAllHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Delete All Task History</h2>
              <button
                onClick={() => updateUiState({ showDeleteAllHistoryModal: false })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium">Are you sure you want to delete ALL history for this task?</p>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone and will remove {taskHistory.length} history entries.</p>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <p className="text-sm font-medium text-red-800">Warning</p>
                </div>
                <p className="text-sm text-red-700 mt-2">
                  This will permanently delete all {taskHistory.length} history entries for "{selectedTask?.title}". 
                  This action cannot be undone and may affect task tracking and reporting.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => updateUiState({ showDeleteAllHistoryModal: false })}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAllHistory}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Warning Modal */}
      {showChecklistWarningModal && checklistWarningTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Checklist Incomplete</h2>
              <button
                onClick={() => {
                  updateUiState({ showChecklistWarningModal: false });
                  setChecklistWarningTask(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
                                    <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-gray-900 font-medium">Cannot Complete Task</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {!areAllChecklistItemsCompleted(checklistWarningTask) && !isUnitValid(checklistWarningTask) 
                              ? 'Both checklist items and unit value must be completed before marking this task as complete.'
                              : !areAllChecklistItemsCompleted(checklistWarningTask)
                              ? 'All checklist items must be completed before marking this task as complete.'
                              : 'Unit value must be set before marking this task as complete.'
                            }
                          </p>
                        </div>
                      </div>
              
                              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <p className="text-sm font-medium text-yellow-800">Task: {checklistWarningTask.title}</p>
                  </div>
                  
                  {/* Checklist Issues */}
                  {checklistWarningTask.checklist && !areAllChecklistItemsCompleted(checklistWarningTask) && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-yellow-800 mb-2">Checklist Items:</p>
                      <div className="space-y-1">
                        {checklistWarningTask.checklist.split('\n').filter(item => item.trim() !== '').map((item, index) => (
                          <div key={index} className="flex items-center space-x-2 text-sm text-yellow-700">
                            <div className="w-3 h-3 border-2 border-yellow-400 rounded-sm"></div>
                            <span>{item.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Unit Issues */}
                  {!isUnitValid(checklistWarningTask) && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-yellow-800 mb-2">Unit Value:</p>
                      <div className="flex items-center space-x-2 text-sm text-yellow-700">
                        <div className="w-3 h-3 border-2 border-yellow-400 rounded-sm"></div>
                        <span>Unit value is required and must be greater than 0</span>
                      </div>
                      <p className="text-sm text-yellow-700 mt-1">
                        Current value: {checklistWarningTask.unit || 'Not set'}
                      </p>
                    </div>
                  )}
                  
                  <p className="text-sm text-yellow-700 mt-3">
                    {!areAllChecklistItemsCompleted(checklistWarningTask) && !isUnitValid(checklistWarningTask) 
                      ? 'Please complete all checklist items and set a valid unit value before marking this task as complete.'
                      : !areAllChecklistItemsCompleted(checklistWarningTask)
                      ? 'Please complete all checklist items before marking this task as complete.'
                      : 'Please set a valid unit value before marking this task as complete.'
                    }
                  </p>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  updateUiState({ showChecklistWarningModal: false });
                  setChecklistWarningTask(null);
                }}
                className="px-4 py-2 text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Calculation Modal */}
      <Modal
        isOpen={showTaskCalculationModal}
        onClose={() => updateUiState({ showTaskCalculationModal: false })}
        title="Task Calculation & Scoring Configuration"
        size="6xl"
      >
        <div className="space-y-6">
          {/* Scoring Weights Configuration */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Scoring Weights (%)</h3>
            <div className="grid grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                <input
                  type="number"
                  value={scoringWeights.impact}
                  onChange={(e) => updateScoringWeights({...scoringWeights, impact: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={scoringWeights.priority}
                  onChange={(e) => updateScoringWeights({...scoringWeights, priority: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
                <input
                  type="number"
                  value={scoringWeights.complexity}
                  onChange={(e) => updateScoringWeights({...scoringWeights, complexity: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effort</label>
                <input
                  type="number"
                  value={scoringWeights.effort}
                  onChange={(e) => updateScoringWeights({...scoringWeights, effort: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Labels</label>
                <input
                  type="number"
                  value={scoringWeights.labels}
                  onChange={(e) => updateScoringWeights({...scoringWeights, labels: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                />
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Total: {Object.values(scoringWeights).reduce((sum, weight) => sum + weight, 0)}%
            </div>
          </div>

          {/* Scoring Points Configuration */}
          <div className="grid grid-cols-2 gap-6">
            {/* Impact Points */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Impact Points</h4>
              <div className="space-y-2">
                {Object.entries(scoringPoints.impact).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{key}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => updateScoringPoints('impact', key, e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Points */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Priority Points</h4>
              <div className="space-y-2">
                {Object.entries(scoringPoints.priority).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{key}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => updateScoringPoints('priority', key, e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Complexity Points */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Complexity Points</h4>
              <div className="space-y-2">
                {Object.entries(scoringPoints.complexity).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{key}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => updateScoringPoints('complexity', key, e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Effort Points */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Effort Points</h4>
              <div className="space-y-2">
                {Object.entries(scoringPoints.effort).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{key}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => updateScoringPoints('effort', key, e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Labels Points */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Labels Points</h4>
              <div className="space-y-2">
                {Object.entries(scoringPoints.labels).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{key}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => updateScoringPoints('labels', key, e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task Scores Table */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Task Scores</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tasks.slice(0, 10).map((task) => {
                    const score = calculateTaskScore(task);
                    const breakdown = getScoreBreakdown(task);
                    return (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{task.title}</div>
                          <div className="text-sm text-gray-500">{task.impact} • {task.priority} • {task.complexity}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getScoreColor(score)}`}>
                            {score}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">{getScoreCategory(score)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>Impact: {breakdown.impact}</div>
                            <div>Priority: {breakdown.priority}</div>
                            <div>Complexity: {breakdown.complexity}</div>
                            <div>Effort: {breakdown.effort}</div>
                            <div>Labels: {breakdown.labels}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* Customize Columns Modal */}
      <Modal
        isOpen={showColumnModal}
        onClose={() => updateUiState({ showColumnModal: false })}
        title="Customize Table Columns"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Select which columns you want to display, customize their widths, and set their order:
            </p>
            
            {/* Column Visibility */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Column Visibility</h3>
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {getAllColumns().map(column => (
                  <label key={column.key} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      onChange={() => toggleColumn(column.key)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {column.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Column Order */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Column Order</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {columnOrder.map((columnKey, index) => 
                  visibleColumns[columnKey] && (
                    <div key={columnKey} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500 w-8 text-center">#{index + 1}</span>
                        <span className="text-sm font-medium text-gray-700">
                          {getAllColumns().find(col => col.key === columnKey)?.name || columnKey}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => moveColumnUp(columnKey)}
                          disabled={index === 0}
                          className={`p-1 rounded ${index === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveColumnDown(columnKey)}
                          disabled={index === columnOrder.length - 1}
                          className={`p-1 rounded ${index === columnOrder.length - 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                          title="Move Down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Column Widths */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Column Widths</h3>
              <div className="space-y-3">
                {getAllColumns().map(column => 
                  visibleColumns[column.key] && (
                    <div key={column.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 w-32">
                        {column.name}
                      </span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="range"
                          min="60"
                          max="500"
                          value={columnWidths[column.key]}
                          onChange={(e) => updateColumnWidth(column.key, parseInt(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-sm text-gray-500 w-12 text-right">
                          {columnWidths[column.key]}px
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={resetToDefault}
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
    </div>
  );
});

Tasks.displayName = 'Tasks';

export default Tasks; 