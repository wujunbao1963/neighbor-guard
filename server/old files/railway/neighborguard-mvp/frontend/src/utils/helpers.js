import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// ============================================================================
// Date Formatting
// ============================================================================
export function formatDate(date) {
  const d = new Date(date);
  return format(d, 'yyyy-MM-dd HH:mm', { locale: zhCN });
}

export function formatRelativeTime(date) {
  const d = new Date(date);
  return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
}

export function formatSmartDate(date) {
  const d = new Date(date);
  
  if (isToday(d)) {
    return `今天 ${format(d, 'HH:mm')}`;
  }
  
  if (isYesterday(d)) {
    return `昨天 ${format(d, 'HH:mm')}`;
  }
  
  return format(d, 'M月d日 HH:mm', { locale: zhCN });
}

// ============================================================================
// Severity Helpers
// ============================================================================
export const SEVERITY_CONFIG = {
  HIGH: {
    label: '高',
    labelEn: 'High',
    color: 'red',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-red-200',
    dotClass: 'bg-red-500'
  },
  MEDIUM: {
    label: '中',
    labelEn: 'Medium',
    color: 'amber',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500'
  },
  LOW: {
    label: '低',
    labelEn: 'Low',
    color: 'green',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    borderClass: 'border-green-200',
    dotClass: 'bg-green-500'
  }
};

export function getSeverityConfig(severity) {
  return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.LOW;
}

// ============================================================================
// Status Helpers
// ============================================================================
export const STATUS_CONFIG = {
  OPEN: {
    label: '待处理',
    labelEn: 'Open',
    color: 'red',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700'
  },
  ACKED: {
    label: '已确认',
    labelEn: 'Acknowledged',
    color: 'blue',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-700'
  },
  WATCHING: {
    label: '观察中',
    labelEn: 'Watching',
    color: 'amber',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-700'
  },
  RESOLVED_OK: {
    label: '已解决',
    labelEn: 'Resolved',
    color: 'green',
    bgClass: 'bg-green-100',
    textClass: 'text-green-700'
  },
  RESOLVED_WARNING: {
    label: '已解决(有损失)',
    labelEn: 'Resolved with Loss',
    color: 'orange',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-700'
  },
  ESCALATED: {
    label: '已升级',
    labelEn: 'Escalated',
    color: 'purple',
    bgClass: 'bg-purple-100',
    textClass: 'text-purple-700'
  },
  FALSE_ALARM: {
    label: '误报',
    labelEn: 'False Alarm',
    color: 'gray',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-700'
  }
};

export function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
}

export function isActiveStatus(status) {
  return ['OPEN', 'ACKED', 'WATCHING', 'ESCALATED'].includes(status);
}

// ============================================================================
// Event Type Helpers
// ============================================================================
export const EVENT_TYPE_CONFIG = {
  break_in_attempt: {
    label: '闯入未遂',
    icon: '🚨',
    defaultSeverity: 'HIGH'
  },
  perimeter_damage: {
    label: '边界损坏',
    icon: '🔨',
    defaultSeverity: 'HIGH'
  },
  suspicious_person: {
    label: '可疑人员',
    icon: '🕵️',
    defaultSeverity: 'MEDIUM'
  },
  suspicious_vehicle: {
    label: '可疑车辆',
    icon: '🚗',
    defaultSeverity: 'MEDIUM'
  },
  unusual_noise: {
    label: '异常声响',
    icon: '🔊',
    defaultSeverity: 'MEDIUM'
  },
  package_event: {
    label: '包裹相关',
    icon: '📦',
    defaultSeverity: 'LOW'
  },
  custom: {
    label: '其他',
    icon: '📝',
    defaultSeverity: 'LOW'
  }
};

export function getEventTypeConfig(eventType) {
  return EVENT_TYPE_CONFIG[eventType] || EVENT_TYPE_CONFIG.custom;
}

// ============================================================================
// Role Helpers
// ============================================================================
export const ROLE_CONFIG = {
  OWNER: { label: '屋主', color: 'purple' },
  HOUSEHOLD: { label: '同住人', color: 'blue' },
  NEIGHBOR: { label: '邻居', color: 'green' },
  RELATIVE: { label: '亲属', color: 'orange' },
  OBSERVER: { label: '观察者', color: 'gray' }
};

export function getRoleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.OBSERVER;
}

// ============================================================================
// File Helpers
// ============================================================================
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function isImageFile(mimeType) {
  return mimeType?.startsWith('image/');
}

export function isVideoFile(mimeType) {
  return mimeType?.startsWith('video/');
}

// ============================================================================
// Validation
// ============================================================================
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
