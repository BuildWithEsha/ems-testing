import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const ActionMenu = ({ onSelect, onEdit, onDelete, isErrorMenu = false, itemType = 'item' }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const handleToggle = (e) => {
    e.stopPropagation();
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
      return;
    }

    const handleClickOutside = (e) => {
      // CRITICAL: Check if clicking on a menu item button FIRST
      // This prevents closing when clicking menu items
      const clickedMenuItem = e.target.closest('button[role="menuitem"]');
      if (clickedMenuItem && menuRef.current?.contains(clickedMenuItem)) {
        // Clicking on a menu item - don't close, let the onClick handle it
        return;
      }
      
      // Check if clicking inside menu container
      if (menuRef.current?.contains(e.target)) {
        return;
      }
      
      // Check if clicking on the toggle button
      if (buttonRef.current?.contains(e.target)) {
        return;
      }
      
      // Only close if truly outside
      setIsOpen(false);
    };

    // Use bubble phase so menu item onClick runs first
    document.addEventListener('click', handleClickOutside, false);
    
    return () => {
      document.removeEventListener('click', handleClickOutside, false);
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
    // Close menu first
    setIsOpen(false);
    
    // Execute action after menu closes
    setTimeout(() => {
      if (actionFn) {
        try {
          actionFn();
        } catch (error) {
          console.error('Error executing menu action:', error);
        }
      }
    }, 0);
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
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {/* View Action */}
            {!isErrorMenu && specificPermissions.canView && onSelect && (
              <button
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
