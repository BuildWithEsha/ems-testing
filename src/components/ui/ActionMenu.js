import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const ActionMenu = ({ onSelect, onEdit, onDelete, isErrorMenu = false, itemType = 'item' }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const isClickingInsideRef = useRef(false);
  const actionExecutingRef = useRef(false);
  const closeTimeoutRef = useRef(null); // Track close timeout

  const handleToggle = (e) => {
    e.stopPropagation();
    // Remove preventDefault to allow normal button behavior
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ 
        top: rect.bottom + 2, 
        left: rect.right - 160 
      });
    }
    setIsOpen(prev => !prev);
  };

  useEffect(() => {
    if (!isOpen) {
      // CRITICAL FIX: Don't reset flags immediately - they might still be needed
      // Only reset if action is not executing
      if (!actionExecutingRef.current) {
        // Delay reset to ensure any pending actions complete
        const resetTimeout = setTimeout(() => {
          isClickingInsideRef.current = false;
          actionExecutingRef.current = false;
        }, 500); // Long delay to ensure action completes
        return () => clearTimeout(resetTimeout);
      }
      return;
    }

    // Use click with capture phase for better control
    const handleClickOutside = (e) => {
      // CRITICAL: Check flags FIRST before any other logic
      if (actionExecutingRef.current) {
        return; // Never close during action execution
      }
      
      if (isClickingInsideRef.current) {
        // Reset flag after checking
        isClickingInsideRef.current = false;
        return;
      }
      
      // Check if clicking inside menu or button
      if (menuRef.current?.contains(e.target)) {
        return;
      }
      
      if (buttonRef.current?.contains(e.target)) {
        return;
      }
      
      // Only close if truly outside
      setIsOpen(false);
    };

    // Attach listener immediately (no delay needed with proper flag handling)
    document.addEventListener('click', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isOpen]);

  // All actions are accessible (no permission restrictions)
  const canView = true;
  const canEdit = true;
  const canDelete = true;

  // All permissions are granted (no restrictions)
  const getSpecificPermissions = () => {
    return {
      canView: true,
      canEdit: true,
      canDelete: true
    };
  };

  const specificPermissions = getSpecificPermissions();

  // Debug the final permission check
  console.log('🔍 Final Permission Check:', specificPermissions);
  console.log('🔍 Can View:', specificPermissions.canView);
  console.log('🔍 Can Edit:', specificPermissions.canEdit);
  console.log('🔍 Can Delete:', specificPermissions.canDelete);

  // Always show the menu (no permission restrictions)

  const handleMenuAction = (actionFn) => {
    // CRITICAL FIX: Set flags BEFORE any async operations
    actionExecutingRef.current = true;
    isClickingInsideRef.current = true;
    
    // CRITICAL FIX: Don't close menu immediately - delay it
    // This prevents useEffect cleanup from resetting flags too early
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    
    // Close menu after a delay to let click event complete
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 50);
    
    // Execute action immediately (don't wait)
    if (actionFn) {
      try {
        actionFn();
      } catch (error) {
        console.error('Error executing menu action:', error);
      }
    }
    
    // Reset flags after action has time to execute and menu closes
    setTimeout(() => {
      actionExecutingRef.current = false;
      isClickingInsideRef.current = false;
      closeTimeoutRef.current = null;
    }, 500); // Long delay to ensure everything completes
  };

  return (
    <>
      <button 
        ref={buttonRef} 
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      
      {isOpen && (
        <div 
          ref={menuRef}
          style={{ 
            position: 'fixed', 
            top: `${position.top}px`, 
            left: `${position.left}px`,
            zIndex: 9999
          }} 
          className="w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5" 
          onMouseDown={(e) => {
            e.stopPropagation();
            isClickingInsideRef.current = true;
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {/* View Action */}
            {!isErrorMenu && specificPermissions.canView && onSelect && (
              <button
                onMouseDown={(e) => {
                  // CRITICAL FIX: Remove preventDefault to allow scrolling
                  e.stopPropagation();
                  isClickingInsideRef.current = true;
                }}
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation();
                  handleMenuAction(onSelect);
                }} 
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors" 
                role="menuitem"
              >
                <Eye size={14} className="mr-3 flex-shrink-0"/> 
                View
              </button>
            )}
            
            {/* Edit Action */}
            {specificPermissions.canEdit && onEdit && (
              <button
                onMouseDown={(e) => {
                  // CRITICAL FIX: Remove preventDefault to allow scrolling
                  e.stopPropagation();
                  isClickingInsideRef.current = true;
                }}
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation();
                  handleMenuAction(onEdit);
                }} 
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors" 
                role="menuitem"
              >
                <Edit size={14} className="mr-3 flex-shrink-0"/> 
                Edit
              </button>
            )}
            
            {/* Delete Action */}
            {specificPermissions.canDelete && onDelete && (
              <button
                onMouseDown={(e) => {
                  // CRITICAL FIX: Remove preventDefault to allow scrolling
                  e.stopPropagation();
                  isClickingInsideRef.current = true;
                }}
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation();
                  handleMenuAction(onDelete);
                }} 
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100 transition-colors" 
                role="menuitem"
              >
                <Trash2 size={14} className="mr-3 flex-shrink-0"/> 
                Delete
              </button>
            )}
            
            {/* Show message if no actions available */}
            {!specificPermissions.canView && !specificPermissions.canEdit && !specificPermissions.canDelete && (
              <div className="px-4 py-2 text-sm text-gray-500 italic">
                No actions available
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ActionMenu;
