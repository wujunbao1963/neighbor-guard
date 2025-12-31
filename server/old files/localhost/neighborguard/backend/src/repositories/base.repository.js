// ============================================================================
// Base Repository
// Abstract data access layer for NeighborGuard
// ============================================================================

const prisma = require('../config/database');
const { NotFoundError, DatabaseError } = require('../utils/errors');
const { logger } = require('../utils/logger');

/**
 * Base repository class providing common CRUD operations
 */
class BaseRepository {
  /**
   * @param {string} modelName - Prisma model name (e.g., 'event', 'sensor')
   */
  constructor(modelName) {
    this.modelName = modelName;
    this.model = prisma[modelName];
    this.logger = logger.child(modelName);
    
    if (!this.model) {
      throw new Error(`Invalid model name: ${modelName}`);
    }
  }

  /**
   * Find a record by ID
   * @param {string} id - Record ID
   * @param {Object} options - Additional options { include, select }
   * @returns {Promise<Object>} Found record
   * @throws {NotFoundError} If record not found
   */
  async findById(id, options = {}) {
    try {
      const record = await this.model.findUnique({
        where: { id },
        ...options
      });
      
      if (!record) {
        throw new NotFoundError(this.modelName, id);
      }
      
      return record;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      this.logger.error('findById failed', { id, error });
      throw new DatabaseError(`Failed to find ${this.modelName}`, error);
    }
  }

  /**
   * Find a single record by criteria
   * @param {Object} where - Query criteria
   * @param {Object} options - Additional options
   * @returns {Promise<Object|null>} Found record or null
   */
  async findOne(where, options = {}) {
    try {
      return await this.model.findFirst({
        where,
        ...options
      });
    } catch (error) {
      this.logger.error('findOne failed', { where, error });
      throw new DatabaseError(`Failed to find ${this.modelName}`, error);
    }
  }

  /**
   * Find multiple records
   * @param {Object} params - Query parameters { where, orderBy, skip, take, include, select }
   * @returns {Promise<Array>} Array of records
   */
  async findMany(params = {}) {
    try {
      return await this.model.findMany(params);
    } catch (error) {
      this.logger.error('findMany failed', { params, error });
      throw new DatabaseError(`Failed to find ${this.modelName} records`, error);
    }
  }

  /**
   * Find records with pagination
   * @param {Object} params - Query parameters
   * @param {Object} pagination - { skip, take }
   * @returns {Promise<{ data: Array, total: number, page: number, pageSize: number }>}
   */
  async findPaginated(params = {}, pagination = { skip: 0, take: 20 }) {
    try {
      const [data, total] = await Promise.all([
        this.model.findMany({
          ...params,
          skip: pagination.skip,
          take: pagination.take
        }),
        this.model.count({ where: params.where })
      ]);

      return {
        data,
        total,
        page: Math.floor(pagination.skip / pagination.take) + 1,
        pageSize: pagination.take,
        totalPages: Math.ceil(total / pagination.take)
      };
    } catch (error) {
      this.logger.error('findPaginated failed', { params, error });
      throw new DatabaseError(`Failed to find ${this.modelName} records`, error);
    }
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Created record
   */
  async create(data, options = {}) {
    try {
      const record = await this.model.create({
        data,
        ...options
      });
      
      this.logger.debug('Record created', { id: record.id });
      return record;
    } catch (error) {
      this.logger.error('create failed', { data, error });
      throw new DatabaseError(`Failed to create ${this.modelName}`, error);
    }
  }

  /**
   * Create multiple records
   * @param {Array} dataArray - Array of record data
   * @returns {Promise<{ count: number }>}
   */
  async createMany(dataArray) {
    try {
      const result = await this.model.createMany({
        data: dataArray,
        skipDuplicates: true
      });
      
      this.logger.debug('Records created', { count: result.count });
      return result;
    } catch (error) {
      this.logger.error('createMany failed', { count: dataArray.length, error });
      throw new DatabaseError(`Failed to create ${this.modelName} records`, error);
    }
  }

  /**
   * Update a record by ID
   * @param {string} id - Record ID
   * @param {Object} data - Update data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data, options = {}) {
    try {
      const record = await this.model.update({
        where: { id },
        data,
        ...options
      });
      
      this.logger.debug('Record updated', { id });
      return record;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundError(this.modelName, id);
      }
      this.logger.error('update failed', { id, data, error });
      throw new DatabaseError(`Failed to update ${this.modelName}`, error);
    }
  }

  /**
   * Update multiple records
   * @param {Object} where - Query criteria
   * @param {Object} data - Update data
   * @returns {Promise<{ count: number }>}
   */
  async updateMany(where, data) {
    try {
      const result = await this.model.updateMany({
        where,
        data
      });
      
      this.logger.debug('Records updated', { count: result.count });
      return result;
    } catch (error) {
      this.logger.error('updateMany failed', { where, data, error });
      throw new DatabaseError(`Failed to update ${this.modelName} records`, error);
    }
  }

  /**
   * Upsert a record
   * @param {Object} where - Unique identifier
   * @param {Object} create - Data for creation
   * @param {Object} update - Data for update
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Upserted record
   */
  async upsert(where, create, update, options = {}) {
    try {
      return await this.model.upsert({
        where,
        create,
        update,
        ...options
      });
    } catch (error) {
      this.logger.error('upsert failed', { where, error });
      throw new DatabaseError(`Failed to upsert ${this.modelName}`, error);
    }
  }

  /**
   * Delete a record by ID
   * @param {string} id - Record ID
   * @returns {Promise<Object>} Deleted record
   */
  async delete(id) {
    try {
      const record = await this.model.delete({
        where: { id }
      });
      
      this.logger.debug('Record deleted', { id });
      return record;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundError(this.modelName, id);
      }
      this.logger.error('delete failed', { id, error });
      throw new DatabaseError(`Failed to delete ${this.modelName}`, error);
    }
  }

  /**
   * Delete multiple records
   * @param {Object} where - Query criteria
   * @returns {Promise<{ count: number }>}
   */
  async deleteMany(where) {
    try {
      const result = await this.model.deleteMany({ where });
      
      this.logger.debug('Records deleted', { count: result.count });
      return result;
    } catch (error) {
      this.logger.error('deleteMany failed', { where, error });
      throw new DatabaseError(`Failed to delete ${this.modelName} records`, error);
    }
  }

  /**
   * Count records
   * @param {Object} where - Query criteria
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    try {
      return await this.model.count({ where });
    } catch (error) {
      this.logger.error('count failed', { where, error });
      throw new DatabaseError(`Failed to count ${this.modelName} records`, error);
    }
  }

  /**
   * Check if a record exists
   * @param {Object} where - Query criteria
   * @returns {Promise<boolean>}
   */
  async exists(where) {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Execute a transaction with this repository
   * @param {Function} fn - Transaction function
   * @returns {Promise<*>}
   */
  async transaction(fn) {
    return prisma.$transaction(fn);
  }
}

module.exports = BaseRepository;
