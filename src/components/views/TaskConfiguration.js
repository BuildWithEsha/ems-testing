import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTaskConfig } from '../../contexts/TaskConfigContext';
import { MoveUp, MoveDown, GripVertical } from 'lucide-react';

const TaskConfiguration = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('impact');
  const {
    scoringWeights,
    scoringPoints,
    updateScoringWeights,
    addScoringPoint,
    deleteScoringPoint,
    updateScoringPoints,
    reorderScoringPoint
  } = useTaskConfig();

  const [newValues, setNewValues] = useState({
    impact: '',
    priority: '',
    complexity: '',
    effort: '',
    labels: ''
  });

  const [newScores, setNewScores] = useState({
    impact: 50,
    priority: 50,
    complexity: 50,
    effort: 50,
    labels: 50
  });

  const [editingItem, setEditingItem] = useState(null);
  const [editingScore, setEditingScore] = useState(0);

  const tabs = [
    { id: 'impact', name: 'Impact', description: 'Business impact and strategic importance' },
    { id: 'priority', name: 'Priority', description: 'Urgency and importance level' },
    { id: 'complexity', name: 'Complexity', description: 'Task difficulty and complexity level' },
    { id: 'effort', name: 'Effort', description: 'Time and effort estimation' },
    { id: 'labels', name: 'Labels', description: 'Task categorization and tags' }
  ];

  const getFieldDescription = (field) => {
    const descriptions = {
      impact: 'Impact measures the business value and strategic importance of a task. Higher impact tasks contribute more to the overall score.',
      priority: 'Priority indicates the urgency and importance of task completion. Higher priority tasks get higher scoring weight.',
      complexity: 'Complexity reflects the difficulty and technical challenge of the task. More complex tasks may have different scoring approaches.',
      effort: 'Effort represents the estimated time and resources required to complete the task.',
      labels: 'Labels help categorize and organize tasks. They can add bonus points to the overall task score.'
    };
    return descriptions[field] || '';
  };

  const handleAddValue = (field) => {
    if (!newValues[field] || newValues[field].trim() === '') {
      alert('Please enter a value');
      return;
    }

    const newValue = newValues[field].trim();
    if (scoringPoints[field][newValue]) {
      alert('This value already exists');
      return;
    }

    addScoringPoint(field, newValue, newScores[field]);

    setNewValues(prev => ({ ...prev, [field]: '' }));
    setNewScores(prev => ({ ...prev, [field]: 50 }));
    
    // Show success message
    alert(`Successfully added "${newValue}" to ${field} with score ${newScores[field]}`);
  };

  const handleDeleteValue = (field, value) => {
    if (Object.keys(scoringPoints[field]).length <= 1) {
      alert('Cannot delete the last value. At least one option must remain.');
      return;
    }

    deleteScoringPoint(field, value);
  };

  const handleEditValue = (field, value, score) => {
    setEditingItem({ field, value });
    setEditingScore(score);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    updateScoringPoints(editingItem.field, editingItem.value, editingScore);

    setEditingItem(null);
    setEditingScore(0);
  };

  const handleWeightChange = (field, value) => {
    const newWeights = { ...scoringWeights };
    // Fix: Use Number() instead of parseInt() to handle decimal values properly
    // and ensure we don't lose the value due to parseInt() issues
    const parsedValue = Number(value);
    newWeights[field] = isNaN(parsedValue) ? 0 : parsedValue;
    updateScoringWeights(newWeights);
  };

  const handleMoveUp = (field, currentIndex) => {
    if (currentIndex > 0) {
      reorderScoringPoint(field, currentIndex, currentIndex - 1);
    }
  };

  const handleMoveDown = (field, currentIndex) => {
    const fieldEntries = Object.entries(scoringPoints[field]);
    if (currentIndex < fieldEntries.length - 1) {
      reorderScoringPoint(field, currentIndex, currentIndex + 1);
    }
  };

  const getTotalWeight = () => {
    return Object.values(scoringWeights).reduce((sum, weight) => sum + weight, 0);
  };

  const getWeightStatus = () => {
    const total = getTotalWeight();
    if (total === 100) return { status: 'Perfect', color: 'text-green-600' };
    if (total > 100) return { status: 'Over 100%', color: 'text-red-600' };
    return { status: 'Under 100%', color: 'text-orange-600' };
  };

  const weightStatus = getWeightStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Task Configuration Management</h1>
        <p className="text-gray-600">
          Centralized configuration for task dropdown options and scoring values. 
          Changes here automatically apply to task creation forms and calculations.
        </p>
      </div>

      {/* Scoring Weights Configuration */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Scoring Weights Configuration</h2>
        <p className="text-gray-600 mb-4">
          Configure how much each field contributes to the overall task score. Total should equal 100%.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(scoringWeights).map(([field, weight]) => (
            <div key={field} className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 capitalize">
                {field} Weight
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weight}
                onChange={(e) => handleWeightChange(field, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500">{weight}%</p>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Weight:</span>
            <span className={`text-lg font-bold ${weightStatus.color}`}>
              {getTotalWeight()}% - {weightStatus.status}
            </span>
          </div>
          {getTotalWeight() !== 100 && (
            <p className="text-sm text-gray-600 mt-2">
              {getTotalWeight() > 100 
                ? 'Total weight exceeds 100%. Please reduce some values.' 
                : 'Total weight is below 100%. You can increase some values for better distribution.'
              }
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {tabs.map((tab) => (
            <div key={tab.id} className={activeTab === tab.id ? 'block' : 'hidden'}>
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{tab.name} Configuration</h3>
                <p className="text-gray-600">{tab.description}</p>
                <p className="text-sm text-gray-500 mt-2">{getFieldDescription(tab.id)}</p>
              </div>

              {/* Add New Value */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="text-md font-medium text-gray-800 mb-3">Add New {tab.name} Value</h4>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value Name</label>
                    <input
                      type="text"
                      value={newValues[tab.id]}
                      onChange={(e) => setNewValues(prev => ({ ...prev, [tab.id]: e.target.value }))}
                      placeholder={`Enter new ${tab.id} value...`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Score</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newScores[tab.id]}
                      onChange={(e) => setNewScores(prev => ({ ...prev, [tab.id]: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => handleAddValue(tab.id)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

                             {/* Existing Values */}
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <h4 className="text-md font-medium text-gray-800">Existing {tab.name} Values</h4>
                   <div className="text-sm text-gray-500">
                     Order: Top to Bottom (First = Highest Priority)
                   </div>
                 </div>
                 <div className="space-y-3">
                   {Object.entries(scoringPoints[tab.id]).map(([value, score], index) => (
                     <div key={value} className="bg-white border border-gray-200 rounded-lg p-4">
                       <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center space-x-3">
                           <div className="text-gray-400 cursor-move">
                             <GripVertical size={16} />
                           </div>
                           <div className="flex items-center space-x-2">
                             <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                               #{index + 1}
                             </span>
                             <h5 className="font-medium text-gray-800">{value}</h5>
                           </div>
                         </div>
                         <div className="flex items-center space-x-2">
                           <div className="flex items-center space-x-1">
                             <button
                               onClick={() => handleMoveUp(tab.id, index)}
                               disabled={index === 0}
                               className={`p-1 rounded ${index === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'}`}
                               title="Move Up"
                             >
                               <MoveUp size={14} />
                             </button>
                             <button
                               onClick={() => handleMoveDown(tab.id, index)}
                               disabled={index === Object.entries(scoringPoints[tab.id]).length - 1}
                               className={`p-1 rounded ${index === Object.entries(scoringPoints[tab.id]).length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'}`}
                               title="Move Down"
                             >
                               <MoveDown size={14} />
                             </button>
                           </div>
                           <button
                             onClick={() => handleEditValue(tab.id, value, score)}
                             className="text-indigo-600 hover:text-indigo-800 text-sm"
                           >
                             Edit
                           </button>
                           <button
                             onClick={() => handleDeleteValue(tab.id, value)}
                             className="text-red-600 hover:text-red-800 text-sm"
                           >
                             Delete
                           </button>
                         </div>
                       </div>
                      
                      {editingItem?.field === tab.id && editingItem?.value === value ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editingScore}
                            onChange={(e) => setEditingScore(parseInt(e.target.value) || 0)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingItem(null)}
                            className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Score:</span>
                          <span className="text-lg font-bold text-indigo-600">{score}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">How This Works</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-700">
           <div>
             <h4 className="font-semibold mb-2 text-blue-800">Configuration Changes:</h4>
             <ul className="space-y-1">
               <li>• Add new dropdown options for any field</li>
               <li>• Set scoring values for each option</li>
               <li>• Adjust weight distribution between fields</li>
               <li>• Changes apply immediately to task forms</li>
             </ul>
           </div>
           <div>
             <h4 className="font-semibold mb-2 text-blue-800">Automatic Integration:</h4>
             <ul className="space-y-1">
               <li>• New values appear in task creation dropdowns</li>
               <li>• Scoring calculations automatically updated</li>
               <li>• No need to restart or refresh the system</li>
               <li>• All existing tasks continue to work normally</li>
             </ul>
           </div>
           <div>
             <h4 className="font-semibold mb-2 text-blue-800">Order Management:</h4>
             <ul className="space-y-1">
               <li>• Reorder values using Up/Down arrows</li>
               <li>• Order affects dropdown display sequence</li>
               <li>• First item appears at top of dropdown</li>
               <li>• Perfect for priority and impact ordering</li>
             </ul>
           </div>
         </div>
      </div>
    </div>
  );
};

export default TaskConfiguration;
