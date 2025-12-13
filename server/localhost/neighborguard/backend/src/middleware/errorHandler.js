// ============================================================================
// Error Handler Middleware
// ============================================================================

const { logger } = require('../utils/logger');

// Legacy AppError class for backward compatibility
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';
  let details = err.details || null;

  // Log errors appropriately
  if (statusCode >= 500) {
    logger.error('Server error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  } else if (statusCode === 401 || statusCode === 403) {
    logger.debug('Auth error', { message, path: req.path });
  } else {
    logger.warn('Client error', { message, code, path: req.path });
  }

  // Prisma errors
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'Record already exists';
    code = 'DUPLICATE_ENTRY';
  }
  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
    code = 'NOT_FOUND';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  }

  // Validation errors from utils/errors.js
  if (err.name === 'ValidationError' && err.details) {
    details = err.details;
  }

  // Build response
  const response = {
    success: false,
    error: { message, code }
  };

  if (details) {
    response.error.details = details;
  }

  // Include stack in development
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
};

module.exports = { AppError, errorHandler, notFoundHandler };
