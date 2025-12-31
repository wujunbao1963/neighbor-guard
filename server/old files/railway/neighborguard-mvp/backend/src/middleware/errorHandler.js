// ============================================================================
// Error Handler Middleware
// ============================================================================

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

  // Log in development (but don't spam auth errors)
  if (process.env.NODE_ENV === 'development') {
    // For 401/403 errors, just log the message (not the stack)
    if (statusCode === 401 || statusCode === 403) {
      console.log(`Auth: ${message} [${req.method} ${req.path}]`);
    } else {
      console.error('Error:', err.message);
      if (err.stack) console.error(err.stack);
    }
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

  res.status(statusCode).json({
    success: false,
    error: { message, code }
  });
};

module.exports = { AppError, errorHandler };
