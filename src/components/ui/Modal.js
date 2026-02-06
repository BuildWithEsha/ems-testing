import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true
}) => {
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const el = contentRef.current;
    const focusables = el.querySelectorAll(FOCUSABLE);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first) first.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusablesNow = el.querySelectorAll(FOCUSABLE);
      if (focusablesNow.length === 0) return;
      const firstNow = focusablesNow[0];
      const lastNow = focusablesNow[focusablesNow.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstNow) {
          e.preventDefault();
          lastNow?.focus();
        }
      } else {
        if (document.activeElement === lastNow) {
          e.preventDefault();
          firstNow?.focus();
        }
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id="modal-title" className="text-xl font-semibold text-gray-900">{title}</h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal; 