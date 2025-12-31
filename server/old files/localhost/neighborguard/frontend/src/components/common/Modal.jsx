// ============================================================================
// Modal Component
// Reusable modal dialog
// ============================================================================

import React, { useEffect, useCallback } from 'react';

const sizes = {
  sm: { maxWidth: '400px' },
  md: { maxWidth: '500px' },
  lg: { maxWidth: '700px' },
  xl: { maxWidth: '900px' },
  full: { maxWidth: '95vw', maxHeight: '95vh' }
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  footer = null,
  style = {}
}) {
  // Handle ESC key
  const handleKeyDown = useCallback((e) => {
    if (closeOnEsc && e.key === 'Escape') {
      onClose();
    }
  }, [closeOnEsc, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const sizeStyle = sizes[size] || sizes.md;

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    animation: 'fadeIn 0.2s ease'
  };

  const modalStyle = {
    background: 'white',
    borderRadius: '16px',
    width: '100%',
    ...sizeStyle,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideUp 0.3s ease',
    ...style
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #f0f0f0'
  };

  const titleStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    margin: 0
  };

  const closeButtonStyle = {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px',
    lineHeight: 1,
    borderRadius: '8px',
    transition: 'background 0.2s'
  };

  const contentStyle = {
    padding: '20px',
    overflow: 'auto',
    flex: 1
  };

  const footerStyle = {
    padding: '16px 20px',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  };

  return (
    <div 
      style={overlayStyle}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div 
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div style={headerStyle}>
            {title && <h2 style={titleStyle}>{title}</h2>}
            {showCloseButton && (
              <button 
                style={closeButtonStyle}
                onClick={onClose}
                onMouseOver={(e) => e.target.style.background = '#f3f4f6'}
                onMouseOut={(e) => e.target.style.background = 'none'}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div style={contentStyle}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={footerStyle}>
            {footer}
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Confirm dialog helper
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) {
  const buttonColors = {
    danger: '#ef4444',
    warning: '#f59e0b',
    primary: '#667eea'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            style={{
              padding: '10px 20px',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            style={{
              padding: '10px 20px',
              background: buttonColors[variant] || buttonColors.primary,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p style={{ color: '#4b5563', margin: 0 }}>{message}</p>
    </Modal>
  );
}

export default Modal;
