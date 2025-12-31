// ============================================================================
// Validators Utility
// Input validation helpers for NeighborGuard
// ============================================================================

const { ValidationError } = require('./errors');

/**
 * Validate that a value exists and is not empty
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {ValidationError}
 */
function required(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
  return value;
}

/**
 * Validate UUID format
 * @param {string} value - UUID string
 * @param {string} fieldName - Field name for error message
 * @returns {string} The validated UUID
 * @throws {ValidationError}
 */
function uuid(value, fieldName = 'ID') {
  required(value, fieldName);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }
  return value;
}

/**
 * Validate email format
 * @param {string} value - Email string
 * @param {string} fieldName - Field name for error message
 * @returns {string} The validated email
 * @throws {ValidationError}
 */
function email(value, fieldName = 'Email') {
  required(value, fieldName);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid email address`);
  }
  return value.toLowerCase();
}

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {string} fieldName - Field name for error message
 * @returns {string} The validated string
 * @throws {ValidationError}
 */
function stringLength(value, min, max, fieldName) {
  required(value, fieldName);
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  if (value.length < min || value.length > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  }
  return value;
}

/**
 * Validate value is in allowed list
 * @param {*} value - Value to check
 * @param {Array} allowedValues - Array of allowed values
 * @param {string} fieldName - Field name for error message
 * @returns {*} The validated value
 * @throws {ValidationError}
 */
function oneOf(value, allowedValues, fieldName) {
  required(value, fieldName);
  if (!allowedValues.includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
}

/**
 * Validate integer within range
 * @param {*} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} fieldName - Field name for error message
 * @returns {number} The validated integer
 * @throws {ValidationError}
 */
function intRange(value, min, max, fieldName) {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }
  if (num < min || num > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
  }
  return num;
}

/**
 * Validate date string
 * @param {string} value - Date string (ISO format)
 * @param {string} fieldName - Field name for error message
 * @returns {Date} The validated Date object
 * @throws {ValidationError}
 */
function dateString(value, fieldName) {
  required(value, fieldName);
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }
  return date;
}

/**
 * Validate array
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @param {number} minLength - Minimum array length (default 0)
 * @param {number} maxLength - Maximum array length (default Infinity)
 * @returns {Array} The validated array
 * @throws {ValidationError}
 */
function array(value, fieldName, minLength = 0, maxLength = Infinity) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must have at least ${minLength} items`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} must have at most ${maxLength} items`);
  }
  return value;
}

/**
 * Validate boolean
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @returns {boolean} The validated boolean
 * @throws {ValidationError}
 */
function boolean(value, fieldName) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 1) return true;
  if (value === 0) return false;
  throw new ValidationError(`${fieldName} must be a boolean`);
}

/**
 * Optional validator wrapper - only validates if value exists
 * @param {Function} validator - Validator function
 * @returns {Function} Wrapped validator
 */
function optional(validator) {
  return (value, ...args) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return validator(value, ...args);
  };
}

/**
 * Validate pagination parameters
 * @param {Object} query - Query parameters
 * @returns {Object} Validated pagination { page, pageSize, skip, take }
 */
function pagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10) || 20));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

/**
 * Validate and sanitize string input
 * @param {string} value - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Create a validation schema and validate an object
 * @param {Object} schema - Schema definition { field: validator }
 * @param {Object} data - Data to validate
 * @returns {Object} Validated data
 * @throws {ValidationError}
 */
function validateSchema(schema, data) {
  const result = {};
  const errors = [];

  for (const [field, validator] of Object.entries(schema)) {
    try {
      const value = validator(data[field], field);
      if (value !== undefined) {
        result[field] = value;
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        throw error;
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  return result;
}

module.exports = {
  required,
  uuid,
  email,
  stringLength,
  oneOf,
  intRange,
  dateString,
  array,
  boolean,
  optional,
  pagination,
  sanitizeString,
  validateSchema
};
