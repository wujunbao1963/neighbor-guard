// ============================================================================
// Badge Component
// Status indicators and labels
// ============================================================================

import React from 'react';

const variants = {
  default: { background: '#f3f4f6', color: '#374151' },
  primary: { background: '#eff6ff', color: '#2563eb' },
  success: { background: '#f0fdf4', color: '#16a34a' },
  warning: { background: '#fffbeb', color: '#d97706' },
  danger: { background: '#fef2f2', color: '#dc2626' },
  info: { background: '#f0f9ff', color: '#0284c7' },
  purple: { background: '#faf5ff', color: '#9333ea' }
};

const sizes = {
  sm: { padding: '2px 6px', fontSize: '11px' },
  md: { padding: '4px 10px', fontSize: '12px' },
  lg: { padding: '6px 14px', fontSize: '14px' }
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  icon = null,
  style = {},
  ...props
}) {
  const variantStyle = variants[variant] || variants.default;
  const sizeStyle = sizes[size] || sizes.md;

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: '9999px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    ...variantStyle,
    ...sizeStyle,
    ...style
  };

  const dotStyle = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: variantStyle.color
  };

  return (
    <span style={badgeStyle} {...props}>
      {dot && <span style={dotStyle} />}
      {icon}
      {children}
    </span>
  );
}

/**
 * Status badge with predefined styles
 */
export function StatusBadge({ status, ...props }) {
  const statusConfig = {
    ONLINE: { variant: 'success', label: 'Online', dot: true },
    OFFLINE: { variant: 'danger', label: 'Offline', dot: true },
    LOW_BATTERY: { variant: 'warning', label: 'Low Battery' },
    UNKNOWN: { variant: 'default', label: 'Unknown' },
    OPEN: { variant: 'danger', label: 'Open' },
    ACKED: { variant: 'warning', label: 'Acknowledged' },
    WATCHING: { variant: 'info', label: 'Watching' },
    RESOLVED: { variant: 'success', label: 'Resolved' },
    FALSE_ALARM: { variant: 'default', label: 'False Alarm' }
  };

  const config = statusConfig[status] || { variant: 'default', label: status };

  return (
    <Badge variant={config.variant} dot={config.dot} {...props}>
      {config.label}
    </Badge>
  );
}

/**
 * Severity badge with predefined styles
 */
export function SeverityBadge({ severity, ...props }) {
  const severityConfig = {
    HIGH: { variant: 'danger', label: 'High' },
    MEDIUM: { variant: 'warning', label: 'Medium' },
    LOW: { variant: 'default', label: 'Low' }
  };

  const config = severityConfig[severity] || severityConfig.LOW;

  return (
    <Badge variant={config.variant} {...props}>
      {config.label}
    </Badge>
  );
}

/**
 * Count badge (for notifications, etc.)
 */
export function CountBadge({ count, max = 99, ...props }) {
  const displayCount = count > max ? `${max}+` : count;

  if (count <= 0) return null;

  return (
    <Badge 
      variant="danger" 
      size="sm"
      style={{ 
        minWidth: '18px', 
        textAlign: 'center',
        padding: '2px 5px'
      }}
      {...props}
    >
      {displayCount}
    </Badge>
  );
}

export default Badge;
