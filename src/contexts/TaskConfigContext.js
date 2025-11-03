import React, { createContext, useContext, useState, useEffect } from 'react';

const TaskConfigContext = createContext();

export const useTaskConfig = () => {
  const context = useContext(TaskConfigContext);
  if (!context) {
    throw new Error('useTaskConfig must be used within a TaskConfigProvider');
  }
  return context;
};

export const TaskConfigProvider = ({ children }) => {
  const [scoringWeights, setScoringWeights] = useState({
    impact: 40,
    priority: 25,
    complexity: 15,
    effort: 10,
    labels: 10
  });

  const [scoringPoints, setScoringPoints] = useState({
    impact: {
      'Compliance & Risk': 100,
      'Revenue Growth': 90,
      'Customer Experience': 80,
      'Cost Reduction': 70,
      'Efficiency & Process': 60,
      'Innovation & Development': 50,
      'Knowledge & Training': 40
    },
    priority: {
      'High': 100,
      'Medium': 60,
      'Low': 30
    },
    complexity: {
      'High': 40,
      'Medium': 70,
      'Low': 100
    },
    effort: {
      '1 Day': 100,
      '1 Week': 70,
      '1 Month': 40
    },
    labels: {
      'Deadline': 100,
      'Money': 95,
      'Sale': 90,
      'Improvements': 70,
      'Daily Operations': 50,
      'Daily Task': 50,
      'Weekly Task': 40,
      'Monthly Task': 30
    }
  });

  // Track if data has been loaded from database to prevent saving during initial load
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Load configuration from database on mount
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const response = await fetch('/api/task-config', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
        
        if (response.ok) {
          const config = await response.json();
          setScoringWeights(config.scoringWeights);
          setScoringPoints(config.scoringPoints);
          setIsDataLoaded(true);
        } else {
          throw new Error(`API call failed with status ${response.status}`);
        }
      } catch (error) {
        console.error('Error loading task configuration:', error);
        
        // Fallback to localStorage if database fails
        const savedWeights = localStorage.getItem('taskScoringWeights');
        const savedPoints = localStorage.getItem('taskScoringPoints');
        
        if (savedWeights) {
          try {
            const weights = JSON.parse(savedWeights);
            setScoringWeights(weights);
          } catch (error) {
            console.error('Error loading scoring weights from localStorage:', error);
          }
        }
        
        if (savedPoints) {
          try {
            const points = JSON.parse(savedPoints);
            setScoringPoints(points);
          } catch (error) {
            console.error('Error loading scoring points from localStorage:', error);
          }
        }
        
        setIsDataLoaded(true);
      }
    };

    loadConfiguration();
  }, []);

  // Save configuration to database whenever it changes (but only after initial load)
  useEffect(() => {
    // Don't save during initial load
    if (!isDataLoaded) {
      return;
    }

    const saveConfiguration = async () => {
      try {
        console.log('💾 Saving configuration:', scoringWeights);
        const response = await fetch('/api/task-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scoringWeights,
            scoringPoints
          })
        });
        
        if (response.ok) {
          console.log('✅ Task configuration saved to database');
        } else {
          console.error('❌ Failed to save task configuration to database');
          // Fallback to localStorage
          localStorage.setItem('taskScoringWeights', JSON.stringify(scoringWeights));
          localStorage.setItem('taskScoringPoints', JSON.stringify(scoringPoints));
        }
      } catch (error) {
        console.error('❌ Error saving task configuration:', error);
        // Fallback to localStorage
        localStorage.setItem('taskScoringWeights', JSON.stringify(scoringWeights));
        localStorage.setItem('taskScoringPoints', JSON.stringify(scoringPoints));
      }
    };

    saveConfiguration();
  }, [scoringWeights, scoringPoints, isDataLoaded]);

  const updateScoringWeights = (newWeights) => {
    setScoringWeights(newWeights);
  };

  const updateScoringPoints = (category, key, value) => {
    setScoringPoints(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: parseInt(value) || 0
      }
    }));
  };

  const addScoringPoint = (category, key, value) => {
    setScoringPoints(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: parseInt(value) || 0
      }
    }));
  };

  const deleteScoringPoint = (category, key) => {
    setScoringPoints(prev => {
      const newPoints = { ...prev };
      delete newPoints[category][key];
      return newPoints;
    });
  };

  const reorderScoringPoint = (category, fromIndex, toIndex) => {
    setScoringPoints(prev => {
      const categoryPoints = { ...prev[category] };
      const entries = Object.entries(categoryPoints);
      
      // Remove item from current position
      const [removed] = entries.splice(fromIndex, 1);
      
      // Insert at new position
      entries.splice(toIndex, 0, removed);
      
      // Convert back to object maintaining order
      const newCategoryPoints = {};
      entries.forEach(([key, value]) => {
        newCategoryPoints[key] = value;
      });
      
      return {
        ...prev,
        [category]: newCategoryPoints
      };
    });
  };

  const getDropdownOptions = (category) => {
    return Object.keys(scoringPoints[category] || {});
  };

  const getScore = (category, key) => {
    return scoringPoints[category]?.[key] || 0;
  };

  const getWeight = (category) => {
    return scoringWeights[category] || 0;
  };

  const calculateTaskScore = (task) => {
    const impactScore = scoringPoints.impact[task.impact] || 0;
    const priorityScore = scoringPoints.priority[task.priority] || 0;
    const complexityScore = scoringPoints.complexity[task.complexity] || 0;
    const effortScore = scoringPoints.effort[task.effortEstimateLabel] || 0;
    const labelScore = scoringPoints.labels[task.labels] || 25;
    
    const finalScore = (
      (impactScore * scoringWeights.impact / 100) +
      (priorityScore * scoringWeights.priority / 100) +
      (complexityScore * scoringWeights.complexity / 100) +
      (effortScore * scoringWeights.effort / 100) +
      (labelScore * scoringWeights.labels / 100)
    );
    
    return Math.round(finalScore);
  };

  const getScoreBreakdown = (task) => {
    const impactScore = scoringPoints.impact[task.impact] || 0;
    const priorityScore = scoringPoints.priority[task.priority] || 0;
    const complexityScore = scoringPoints.complexity[task.complexity] || 0;
    const effortScore = scoringPoints.effort[task.effortEstimateLabel] || 0;
    const labelScore = scoringPoints.labels[task.labels] || 25;
    
    return {
      impact: Math.round((impactScore * scoringWeights.impact / 100) * 10) / 10,
      priority: Math.round((priorityScore * scoringWeights.priority / 100) * 10) / 10,
      complexity: Math.round((complexityScore * scoringWeights.complexity / 100) * 10) / 10,
      effort: Math.round((effortScore * scoringWeights.effort / 100) * 10) / 10,
      labels: Math.round((labelScore * scoringWeights.labels / 100) * 10) / 10
    };
  };

  const value = {
    scoringWeights,
    scoringPoints,
    updateScoringWeights,
    updateScoringPoints,
    addScoringPoint,
    deleteScoringPoint,
    reorderScoringPoint,
    getDropdownOptions,
    getScore,
    getWeight,
    calculateTaskScore,
    getScoreBreakdown
  };

  return (
    <TaskConfigContext.Provider value={value}>
      {children}
    </TaskConfigContext.Provider>
  );
};
