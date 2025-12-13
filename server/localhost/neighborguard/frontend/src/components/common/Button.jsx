// ============================================================================
// Button Component
// Reusable button with variants and sizes
// ============================================================================

import React from 'react';

const variants = {
  primary: {
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: 'white',
    border: 'none'
  },
  secondary: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb'
  },
  danger: {
    background: '#ef4444',
    color: 'white',
    border: 'none'
  },
  success: {
    background: '#22c55e',
    color: 'white',
    border: 'none'
  },
  ghost: {
    background: 'transparent',
    color: '#667eea',
    border: 'none'
  },
  outline: {
    background: 'transparent',
    color: '#667eea',
    border: '1px solid #667eea'
  }
};

const sizes = {
  sm: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '6px'
  },
  md: {
    padding: '10px 16px',
    fontSize: '14px',
    borderRadius: '8px'
  },
  lg: {
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '10px'
  },
  full: {
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '10px',
    width: '100%'
  }
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon = null,
  onClick,
  style = {},
  className = '',
  type = 'button',
  ...props
}) {
  const variantStyle = variants[variant] || variants.primary;
  const sizeStyle = sizes[size] || sizes.md;

  const buttonStyle = {
    ...variantStyle,
    ...sizeStyle,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: '500',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all 0.2s ease',
    ...style
  };

  return (
    <button
      type={type}
      style={buttonStyle}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      {...props}
    >
      {loading && (
        <span style={{ 
          width: '16px', 
          height: '16px', 
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      )}
      {!loading && icon}
      {children}
    </button>
  );
}

export default Button;
