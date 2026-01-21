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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:14',message:'handleToggle called',data:{isOpenBefore:isOpen,eventType:e.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    e.stopPropagation();
    e.preventDefault(); // ✅ Prevent default behavior
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ 
        top: rect.bottom + 2, 
        left: rect.right - 160 
      });
    }
    setIsOpen(prev => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:24',message:'setIsOpen state change',data:{from:prev,to:!prev},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return !prev;
    });
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:36',message:'handleMouseDownOutside called',data:{target:e.target?.tagName,isClickingInside:isClickingInsideRef.current,actionExecuting:actionExecutingRef.current,menuContains:menuRef.current?.contains(e.target),buttonContains:buttonRef.current?.contains(e.target)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // ✅ Don't close if we're clicking inside or action is executing
      if (isClickingInsideRef.current || actionExecutingRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:38',message:'handleMouseDownOutside blocked by flags',data:{isClickingInside:isClickingInsideRef.current,actionExecuting:actionExecutingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return;
      }
      
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target) && 
        buttonRef.current && 
        !buttonRef.current.contains(e.target)
      ) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:48',message:'handleMouseDownOutside closing menu',data:{target:e.target?.tagName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:61',message:'Attaching event listeners',data:{delay:50,isOpen:isOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:97',message:'handleMenuAction called',data:{hasActionFn:!!actionFn,isOpenBefore:isOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    // ✅ Mark that we're executing an action
    actionExecutingRef.current = true;
    isClickingInsideRef.current = true;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:100',message:'Flags set in handleMenuAction',data:{actionExecuting:actionExecutingRef.current,isClickingInside:isClickingInsideRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // ✅ Close menu immediately
    setIsOpen(false);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:103',message:'Menu closed in handleMenuAction',data:{isOpenAfter:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    // ✅ Execute action with a small delay to ensure menu closes first
    setTimeout(() => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:106',message:'Executing action function',data:{hasActionFn:!!actionFn},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      if (actionFn) {
        actionFn();
      }
      // ✅ Reset flag after action executes
      setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:111',message:'Resetting flags after action',data:{actionExecutingBefore:actionExecutingRef.current,isClickingInsideBefore:isClickingInsideRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:140',message:'Menu container mousedown',data:{target:e.target?.tagName,isClickingInsideBefore:isClickingInsideRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            e.stopPropagation();
            isClickingInsideRef.current = true; // ✅ Set flag on mousedown
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/8935d4b0-ae4d-43cf-854a-300784cb786c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionMenu.js:142',message:'Menu container flag set',data:{isClickingInsideAfter:isClickingInsideRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
