import { useState, useRef, useEffect } from 'react';

/**
 * Hook for making a modal draggable by its header.
 * Returns modalRef, modalStyle (for the inner modal box), and dragHandleProps (spread on the header div).
 * @param {boolean} isOpen - When true and modal is shown; pass to reset position when modal opens.
 */
export function useDraggableModal(isOpen = true) {
  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragRef.current.isDragging) return;
      setPosition({
        x: dragRef.current.startPosX + e.clientX - dragRef.current.startX,
        y: dragRef.current.startPosY + e.clientY - dragRef.current.startY,
      });
    };
    const onMouseUp = () => {
      dragRef.current.isDragging = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const modalStyle = {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
  };

  const dragHandleProps = {
    onMouseDown,
    style: { cursor: 'move' },
    role: 'button',
    'aria-label': 'Drag to move',
  };

  return { modalRef, modalStyle, dragHandleProps };
}
