import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const ActionMenu = ({ onSelect, onEdit, onDelete, isErrorMenu = false, itemType = 'item' }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null); // ✅ Add ref for menu container

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
    if (!isOpen) return;

    // ✅ Fix: Only close if click is outside both button and menu
    const handleClickOutside = (e) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target) && 
        buttonRef.current && 
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    // ✅ Fix: Only close on significant scroll, and use passive listener
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Only close if scroll is significant (more than 5px) to avoid closing on minor layout shifts
      if (Math.abs(currentScrollY - lastScrollY) > 5) {
        setIsOpen(false);
      }
      lastScrollY = currentScrollY;
    };

    // ✅ Use setTimeout to ensure this runs after the current click event
    // This prevents the menu from closing immediately when opened
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
      window.addEventListener('scroll', handleScroll, { passive: true });
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
      window.removeEventListener('scroll', handleScroll);
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

  return (
    <>
      <button 
        ref={buttonRef} 
        onClick={handleToggle} 
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      
      {isOpen && (
        <div 
          ref={menuRef} // ✅ Add ref to menu container
          style={{ 
            position: 'fixed', 
            top: `${position.top}px`, 
            left: `${position.left}px` 
          }} 
          className="w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()} // ✅ Prevent mouseDown from bubbling
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {/* View Action */}
            {!isErrorMenu && specificPermissions.canView && onSelect && (
              <button
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation(); // ✅ Stop propagation
                  setIsOpen(false); // Close first
                  // ✅ Use setTimeout to ensure menu closes before action executes
                  setTimeout(() => {
                    onSelect(); 
                  }, 0);
                }} 
                onMouseDown={(e) => e.stopPropagation()} // ✅ Prevent mouseDown
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
                  e.stopPropagation(); // ✅ Stop propagation
                  setIsOpen(false); // Close first
                  // ✅ Use setTimeout to ensure menu closes before action executes
                  setTimeout(() => {
                    onEdit(); 
                  }, 0);
                }} 
                onMouseDown={(e) => e.stopPropagation()} // ✅ Prevent mouseDown
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
                  e.stopPropagation(); // ✅ Stop propagation
                  setIsOpen(false); // Close first
                  // ✅ Use setTimeout to ensure menu closes before action executes
                  setTimeout(() => {
                    onDelete(); 
                  }, 0);
                }} 
                onMouseDown={(e) => e.stopPropagation()} // ✅ Prevent mouseDown
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
