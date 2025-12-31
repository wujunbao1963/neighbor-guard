// ============================================================================
// Card Component
// Reusable card container with variants
// ============================================================================

import React from 'react';

const variants = {
  default: {
    background: 'white',
    border: 'none',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  },
  elevated: {
    background: 'white',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
  },
  outlined: {
    background: 'white',
    border: '1px solid #e5e7eb',
    boxShadow: 'none'
  },
  gradient: {
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    border: 'none',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
    color: 'white'
  },
  danger: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    boxShadow: 'none'
  },
  warning: {
    background: '#fffbeb',
    border: '1px solid #fed7aa',
    boxShadow: 'none'
  },
  success: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    boxShadow: 'none'
  }
};

export function Card({
  children,
  variant = 'default',
  padding = '16px',
  margin = '0',
  borderRadius = '12px',
  onClick,
  style = {},
  className = '',
  ...props
}) {
  const variantStyle = variants[variant] || variants.default;

  const cardStyle = {
    ...variantStyle,
    padding,
    margin,
    borderRadius,
    cursor: onClick ? 'pointer' : 'default',
    transition: onClick ? 'transform 0.2s ease, box-shadow 0.2s ease' : 'none',
    ...style
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card Header component
 */
export function CardHeader({ children, style = {}, ...props }) {
  return (
    <div 
      style={{ 
        marginBottom: '12px',
        ...style 
      }} 
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card Title component
 */
export function CardTitle({ children, style = {}, ...props }) {
  return (
    <h3 
      style={{ 
        fontSize: '16px',
        fontWeight: '600',
        color: '#1f2937',
        margin: 0,
        ...style 
      }} 
      {...props}
    >
      {children}
    </h3>
  );
}

/**
 * Card Description component
 */
export function CardDescription({ children, style = {}, ...props }) {
  return (
    <p 
      style={{ 
        fontSize: '14px',
        color: '#6b7280',
        margin: '4px 0 0 0',
        ...style 
      }} 
      {...props}
    >
      {children}
    </p>
  );
}

/**
 * Card Content component
 */
export function CardContent({ children, style = {}, ...props }) {
  return (
    <div style={style} {...props}>
      {children}
    </div>
  );
}

/**
 * Card Footer component
 */
export function CardFooter({ children, style = {}, ...props }) {
  return (
    <div 
      style={{ 
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        ...style 
      }} 
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
