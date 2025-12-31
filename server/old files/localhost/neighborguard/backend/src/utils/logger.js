// ============================================================================
// Logger Utility
// Structured logging for NeighborGuard
// ============================================================================

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Format log message with timestamp and context
 * @param {string} level 
 * @param {string} message 
 * @param {Object} context 
 * @returns {string}
 */
function formatMessage(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 
    ? ` ${JSON.stringify(context)}` 
    : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Logger class with structured logging support
 */
class Logger {
  constructor(namespace = 'app') {
    this.namespace = namespace;
  }

  /**
   * Create a child logger with additional namespace
   * @param {string} childNamespace 
   * @returns {Logger}
   */
  child(childNamespace) {
    return new Logger(`${this.namespace}:${childNamespace}`);
  }

  /**
   * Log error message
   * @param {string} message 
   * @param {Object|Error} contextOrError 
   */
  error(message, contextOrError = {}) {
    if (currentLevel >= LOG_LEVELS.error) {
      const context = contextOrError instanceof Error
        ? { error: contextOrError.message, stack: contextOrError.stack }
        : contextOrError;
      console.error(formatMessage('error', `[${this.namespace}] ${message}`, context));
    }
  }

  /**
   * Log warning message
   * @param {string} message 
   * @param {Object} context 
   */
  warn(message, context = {}) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', `[${this.namespace}] ${message}`, context));
    }
  }

  /**
   * Log info message
   * @param {string} message 
   * @param {Object} context 
   */
  info(message, context = {}) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatMessage('info', `[${this.namespace}] ${message}`, context));
    }
  }

  /**
   * Log debug message
   * @param {string} message 
   * @param {Object} context 
   */
  debug(message, context = {}) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', `[${this.namespace}] ${message}`, context));
    }
  }

  /**
   * Log trace message (most verbose)
   * @param {string} message 
   * @param {Object} context 
   */
  trace(message, context = {}) {
    if (currentLevel >= LOG_LEVELS.trace) {
      console.log(formatMessage('trace', `[${this.namespace}] ${message}`, context));
    }
  }

  /**
   * Log request information
   * @param {Object} req - Express request object
   */
  request(req) {
    this.info('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
      userId: req.user?.id
    });
  }

  /**
   * Log response information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} duration - Request duration in ms
   */
  response(req, res, duration) {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    this[level]('Response sent', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  }
}

// Create default logger instance
const logger = new Logger('neighborguard');

// Create specialized loggers
const fusionLogger = logger.child('fusion');
const authLogger = logger.child('auth');
const apiLogger = logger.child('api');
const notificationLogger = logger.child('notification');

module.exports = {
  Logger,
  logger,
  fusionLogger,
  authLogger,
  apiLogger,
  notificationLogger
};
