// ============================================================================
// APNS Channel
// Apple Push Notification Service integration
// ============================================================================

const { notificationLogger } = require('../../utils/logger');

// APNS configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.neighborguard.app';
const APNS_ENVIRONMENT = process.env.APNS_ENVIRONMENT || 'development';

class APNSChannel {
  constructor() {
    this.enabled = !!(APNS_KEY_ID && APNS_TEAM_ID);
    this.provider = null;
    
    if (this.enabled) {
      this._initProvider();
    } else {
      notificationLogger.warn('APNS not configured - notifications disabled');
    }
  }

  /**
   * Initialize APNS provider
   * @private
   */
  _initProvider() {
    try {
      // Dynamic import to avoid errors when apn is not configured
      const apn = require('apn');
      
      const keyPath = process.env.APNS_KEY_PATH || './apns-key.p8';
      
      this.provider = new apn.Provider({
        token: {
          key: keyPath,
          keyId: APNS_KEY_ID,
          teamId: APNS_TEAM_ID
        },
        production: APNS_ENVIRONMENT === 'production'
      });

      notificationLogger.info('APNS provider initialized', {
        environment: APNS_ENVIRONMENT,
        bundleId: APNS_BUNDLE_ID
      });
    } catch (error) {
      notificationLogger.error('Failed to initialize APNS', error);
      this.enabled = false;
    }
  }

  /**
   * Send push notification via APNS
   * @param {string} deviceToken - Device token
   * @param {Object} payload - Notification payload
   * @returns {Promise<Object>}
   */
  async send(deviceToken, payload) {
    if (!this.enabled || !this.provider) {
      notificationLogger.debug('APNS send skipped - not enabled');
      return { sent: false, reason: 'NOT_ENABLED' };
    }

    try {
      const apn = require('apn');
      
      const notification = new apn.Notification();
      
      // Set alert content
      notification.alert = {
        title: payload.title,
        body: payload.body
      };
      
      // Set other properties
      notification.sound = payload.sound || 'default';
      notification.badge = payload.badge || 1;
      notification.topic = APNS_BUNDLE_ID;
      notification.payload = payload.data || {};
      
      // Set priority
      notification.priority = payload.priority === 'high' ? 10 : 5;
      
      // Set expiry (TTL)
      if (payload.ttl) {
        notification.expiry = Math.floor(Date.now() / 1000) + payload.ttl;
      }

      // Send notification
      const result = await this.provider.send(notification, deviceToken);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        notificationLogger.warn('APNS send failed', {
          device: deviceToken.substring(0, 10) + '...',
          error: failure.response?.reason || 'Unknown error'
        });
        
        throw new Error(failure.response?.reason || 'APNS send failed');
      }

      notificationLogger.debug('APNS notification sent', {
        device: deviceToken.substring(0, 10) + '...'
      });

      return { sent: true };
    } catch (error) {
      notificationLogger.error('APNS send error', error);
      throw error;
    }
  }

  /**
   * Send silent notification (background refresh)
   * @param {string} deviceToken - Device token
   * @param {Object} data - Data payload
   * @returns {Promise<Object>}
   */
  async sendSilent(deviceToken, data) {
    if (!this.enabled || !this.provider) {
      return { sent: false, reason: 'NOT_ENABLED' };
    }

    try {
      const apn = require('apn');
      
      const notification = new apn.Notification();
      notification.contentAvailable = true;
      notification.topic = APNS_BUNDLE_ID;
      notification.payload = data;
      notification.priority = 5;

      const result = await this.provider.send(notification, deviceToken);

      if (result.failed.length > 0) {
        throw new Error(result.failed[0].response?.reason || 'APNS silent send failed');
      }

      return { sent: true };
    } catch (error) {
      notificationLogger.error('APNS silent send error', error);
      throw error;
    }
  }

  /**
   * Shutdown provider connection
   */
  shutdown() {
    if (this.provider) {
      this.provider.shutdown();
      notificationLogger.info('APNS provider shutdown');
    }
  }
}

// Export singleton
module.exports = new APNSChannel();
