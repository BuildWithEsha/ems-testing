import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Search } from 'lucide-react';

export default function MultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  className = "",
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
            handleOptionSelect(filteredOptions[focusedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearchTerm('');
          setFocusedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, filteredOptions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOptionSelect = (option) => {
    const isSelected = value.some(v => v.value === option.value);
    
    if (isSelected) {
      // Remove option
      onChange(value.filter(v => v.value !== option.value));
    } else {
      // Add option
      onChange([...value, option]);
    }
    
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  const handleRemoveOption = (optionToRemove) => {
    onChange(value.filter(option => option.value !== optionToRemove.value));
  };

  const handleToggleDropdown = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const getDisplayValue = () => {
    if (value.length === 0) return '';
    if (value.length === 1) return value[0].label;
    return `${value.length} selected`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Selected values display */}
      <div 
        className="min-h-[38px] border border-gray-300 rounded-md bg-white cursor-text"
        onClick={handleToggleDropdown}
      >
        <div className="flex flex-wrap gap-1 p-2">
          {value.map((option) => (
            <span
              key={option.value}
              className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded-md"
            >
              {option.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveOption(option);
                }}
                className="ml-1 text-blue-600 hover:text-blue-800"
                disabled={disabled}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          
          {/* Search input or placeholder */}
          <div className="flex-1 min-w-0">
            {isOpen ? (
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full outline-none text-sm"
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-gray-500 text-sm">
                {getDisplayValue() || placeholder}
              </span>
            )}
          </div>
        </div>
        
        {/* Dropdown toggle button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleDropdown();
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          disabled={disabled}
        >
          <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown options */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              No options found
            </div>
          ) : (
            <div>
              {filteredOptions.map((option, index) => {
                const isSelected = value.some(v => v.value === option.value);
                const isFocused = index === focusedIndex;
                
                return (
                  <div
                    key={option.value}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                      isSelected ? 'bg-blue-50 text-blue-900' : ''
                    } ${isFocused ? 'bg-gray-100' : ''}`}
                    onClick={() => handleOptionSelect(option)}
                  >
                    <div className="flex items-center justify-between">
                      <span>{option.label}</span>
                      {isSelected && (
                        <span className="text-blue-600">✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 