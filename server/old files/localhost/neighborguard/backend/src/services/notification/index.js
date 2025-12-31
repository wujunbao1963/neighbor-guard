// ============================================================================
// Notification Service
// Manages sending notifications through various channels
// ============================================================================

const apnsChannel = require('./channels/apns');
const { notificationLogger } = require('../../utils/logger');
const { NotificationLevel } = require('../../config/constants');

class NotificationService {
  constructor() {
    this.channels = {
      apns: apnsChannel
    };
    this.enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';
  }

  /**
   * Send notification for a security event
   * @param {Object} event - Security event
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} Send results
   */
  async sendEventNotification(event, options = {}) {
    if (!this.enabled) {
      notificationLogger.debug('Notifications disabled', { eventId: event.id });
      return { sent: false, reason: 'DISABLED' };
    }

    const { 
      level = NotificationLevel.NORMAL,
      recipients,
      circle
    } = options;

    // Skip NONE level
    if (level === NotificationLevel.NONE) {
      notificationLogger.debug('Notification level NONE, skipping', { eventId: event.id });
      return { sent: false, reason: 'LEVEL_NONE' };
    }

    // Build notification payload
    const payload = this._buildEventPayload(event, level);

    // Get recipients if not provided
    const targetRecipients = recipients || await this._getEventRecipients(event.circleId, level);

    if (targetRecipients.length === 0) {
      notificationLogger.debug('No recipients for notification', { eventId: event.id });
      return { sent: false, reason: 'NO_RECIPIENTS' };
    }

    // Send through channels
    const results = await this._sendToRecipients(targetRecipients, payload, level);

    notificationLogger.info('Event notification sent', {
      eventId: event.id,
      eventType: event.eventType,
      level,
      recipientCount: targetRecipients.length,
      successCount: results.successes
    });

    return {
      sent: true,
      level,
      recipientCount: targetRecipients.length,
      results
    };
  }

  /**
   * Build notification payload for an event
   * @private
   */
  _buildEventPayload(event, level) {
    const titles = {
      break_in_attempt: '🚨 Break-in Alert',
      perimeter_damage: '⚠️ Perimeter Alert',
      suspicious_person: '👤 Suspicious Person',
      suspicious_vehicle: '🚗 Suspicious Vehicle',
      unusual_noise: '🔊 Unusual Noise',
      package_delivered: '📦 Package Delivered',
      package_taken: '📦 Package Taken',
      fire_detected: '🔥 FIRE DETECTED',
      co_detected: '☣️ CO DETECTED',
      water_leak_detected: '💧 Water Leak',
      motion_detected: '👁️ Motion Detected'
    };

    const title = titles[event.eventType] || '🔔 Security Alert';
    const body = event.title || event.description || `${event.eventType} detected`;

    return {
      title,
      body,
      data: {
        eventId: event.id,
        eventType: event.eventType,
        severity: event.severity,
        zoneId: event.zoneId,
        circleId: event.circleId
      },
      // iOS specific
      sound: level === NotificationLevel.HIGH ? 'alarm.wav' : 'default',
      badge: 1,
      // Priority
      priority: level === NotificationLevel.HIGH ? 'high' : 'normal',
      // TTL (time to live)
      ttl: level === NotificationLevel.HIGH ? 3600 : 86400
    };
  }

  /**
   * Get notification recipients for an event
   * @private
   */
  async _getEventRecipients(circleId, level) {
    const prisma = require('../../config/database');
    
    // Get circle members with notification preferences
    const members = await prisma.circleMember.findMany({
      where: {
        circleId,
        leftAt: null,
        user: { isActive: true }
      },
      include: {
        user: {
          select: {
            id: true,
            apnsDeviceToken: true
            // Add FCM token when supported
          }
        }
      }
    });

    // Filter members with valid device tokens
    // TODO: Add notification preference filtering
    return members
      .filter(m => m.user.apnsDeviceToken)
      .map(m => ({
        userId: m.user.id,
        memberId: m.id,
        role: m.role,
        apnsToken: m.user.apnsDeviceToken
      }));
  }

  /**
   * Send to all recipients through appropriate channels
   * @private
   */
  async _sendToRecipients(recipients, payload, level) {
    const results = {
      successes: 0,
      failures: 0,
      errors: []
    };

    const sendPromises = recipients.map(async (recipient) => {
      try {
        // Send via APNS if token exists
        if (recipient.apnsToken) {
          await this.channels.apns.send(recipient.apnsToken, payload);
          results.successes++;
        }
        // TODO: Add FCM support
      } catch (error) {
        results.failures++;
        results.errors.push({
          userId: recipient.userId,
          error: error.message
        });
        notificationLogger.warn('Failed to send notification', {
          userId: recipient.userId,
          error: error.message
        });
      }
    });

    await Promise.allSettled(sendPromises);
    return results;
  }

  /**
   * Send a test notification
   * @param {string} deviceToken - Device token
   * @param {string} channel - Channel type ('apns' or 'fcm')
   * @returns {Promise<boolean>}
   */
  async sendTestNotification(deviceToken, channel = 'apns') {
    const payload = {
      title: '🔔 Test Notification',
      body: 'NeighborGuard notifications are working!',
      data: { test: true },
      sound: 'default'
    };

    try {
      if (channel === 'apns') {
        await this.channels.apns.send(deviceToken, payload);
      }
      // TODO: Add FCM support
      
      notificationLogger.info('Test notification sent', { channel });
      return true;
    } catch (error) {
      notificationLogger.error('Test notification failed', error);
      return false;
    }
  }

  /**
   * Register device token
   * @param {string} userId - User ID
   * @param {string} token - Device token
   * @param {string} platform - Platform ('ios' or 'android')
   */
  async registerDevice(userId, token, platform = 'ios') {
    const prisma = require('../../config/database');
    
    const updateData = platform === 'ios' 
      ? { apnsDeviceToken: token }
      : { fcmDeviceToken: token };

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    notificationLogger.info('Device registered', { userId, platform });
  }

  /**
   * Unregister device token
   * @param {string} userId - User ID
   * @param {string} platform - Platform
   */
  async unregisterDevice(userId, platform = 'ios') {
    const prisma = require('../../config/database');
    
    const updateData = platform === 'ios'
      ? { apnsDeviceToken: null }
      : { fcmDeviceToken: null };

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    notificationLogger.info('Device unregistered', { userId, platform });
  }
}

// Export singleton
module.exports = new NotificationService();
