import React, { useState } from 'react';
import Employees from './Employees';
import Errors from './Errors';
import Issues from './Issues';
import Attendance from './Attendance';
import Appreciations from './Appreciations';
import WarningLetters from './WarningLetters';
import Departments from './Departments';
import Designations from './Designations';

export default function HR() {
  const [tab, setTab] = useState('employees');

  const tabs = [
    { id: 'employees', label: 'Employees' },
    { id: 'errors', label: 'Errors' },
    { id: 'issues', label: 'Issues' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'appreciations', label: 'Appreciations' },
    { id: 'warning-letters', label: 'Warning Letters' },
    { id: 'departments', label: 'Departments' },
    { id: 'designations', label: 'Designations' },
  ];

  const render = () => {
    switch (tab) {
      case 'employees':
        return <Employees />;
      case 'errors':
        return <Errors />;
      case 'issues':
        return <Issues />;
      case 'attendance':
        return <Attendance />;
      case 'appreciations':
        return <Appreciations />;
      case 'warning-letters':
        return <WarningLetters />;
      case 'departments':
        return <Departments />;
      case 'designations':
        return <Designations />;
      default:
        return <Employees />;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <div className="flex border-b border-gray-200 bg-white rounded-t">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">{render()}</div>
    </div>
  );
}












