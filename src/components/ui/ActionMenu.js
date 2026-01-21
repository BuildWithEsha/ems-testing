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
  const actionExecutingRef = useRef(false); // ✅ Track if action is executing

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault(); // ✅ Prevent default behavior
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
      // Reset flags when menu closes
      isClickingInsideRef.current = false;
      actionExecutingRef.current = false;
      return;
    }

    // ✅ Use mousedown instead of click for better timing
    const handleMouseDownOutside = (e) => {
      // ✅ Don't close if we're clicking inside or action is executing
      if (isClickingInsideRef.current || actionExecutingRef.current) {
        return;
      }
      
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target) && 
        buttonRef.current && 
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    // ✅ Completely disable scroll handler - it's causing too many issues
    // Only close on actual window resize or focus loss
    const handleBlur = () => {
      if (!actionExecutingRef.current) {
        setIsOpen(false);
      }
    };

    // ✅ Use longer delay and attach to mousedown instead of click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDownOutside);
      window.addEventListener('blur', handleBlur);
    }, 50); // ✅ Increased delay significantly
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleMouseDownOutside);
      window.removeEventListener('blur', handleBlur);
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
    // ✅ Mark that we're executing an action
    actionExecutingRef.current = true;
    isClickingInsideRef.current = true;
    
    // ✅ Close menu immediately
    setIsOpen(false);
    
    // ✅ Execute action with a small delay to ensure menu closes first
    setTimeout(() => {
      if (actionFn) {
        actionFn();
      }
      // ✅ Reset flag after action executes
      setTimeout(() => {
        actionExecutingRef.current = false;
        isClickingInsideRef.current = false;
      }, 100);
    }, 10);
  };

  return (
    <>
      <button 
        ref={buttonRef} 
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()} // ✅ Stop mousedown propagation
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
            zIndex: 9999 // ✅ Very high z-index to ensure it's on top
          }} 
          className="w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5" 
          onMouseDown={(e) => {
            e.stopPropagation();
            isClickingInsideRef.current = true; // ✅ Set flag on mousedown
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {/* View Action */}
            {!isErrorMenu && specificPermissions.canView && onSelect && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
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
                  e.preventDefault();
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
                  e.preventDefault();
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
