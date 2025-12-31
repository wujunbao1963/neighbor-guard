// ============================================================================
// APNs Service - Apple Push Notification Service
// ============================================================================

const http2 = require('http2');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

class APNsService {
  constructor() {
    console.log('🔔 Initializing APNs Service...');
    
    this.keyId = process.env.APNS_KEY_ID;
    this.teamId = process.env.APNS_TEAM_ID;
    this.bundleId = process.env.APNS_BUNDLE_ID || 'com.neighborguard.app';
    this.keyFile = process.env.APNS_KEY_FILE;
    this.isProduction = process.env.APNS_PRODUCTION === 'true';
    
    this.host = this.isProduction 
      ? 'api.push.apple.com' 
      : 'api.sandbox.push.apple.com';
    
    this.privateKey = null;
    this.jwtToken = null;
    this.jwtGeneratedAt = null;
    
    // Log configuration status
    console.log(`   APNS_KEY_ID: ${this.keyId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   APNS_TEAM_ID: ${this.teamId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   APNS_BUNDLE_ID: ${this.bundleId}`);
    console.log(`   APNS_KEY_FILE: ${this.keyFile || '(not set)'}`);
    console.log(`   APNS_KEY_BASE64: ${process.env.APNS_KEY_BASE64 ? '✅ Set' : '❌ Missing'}`);
    console.log(`   APNS_PRODUCTION: ${this.isProduction} → ${this.host}`);
    
    this.loadPrivateKey();
  }
  
  loadPrivateKey() {
    // Try base64 env var first (for Railway/cloud deployment)
    if (process.env.APNS_KEY_BASE64) {
      try {
        this.privateKey = Buffer.from(process.env.APNS_KEY_BASE64, 'base64').toString('utf8');
        console.log('✅ APNs private key loaded from APNS_KEY_BASE64');
        console.log(`   Key starts with: ${this.privateKey.substring(0, 30)}...`);
        return;
      } catch (error) {
        console.error('❌ Failed to decode APNS_KEY_BASE64:', error.message);
      }
    }
    
    // Try file path
    if (this.keyFile) {
      try {
        const keyPath = path.resolve(this.keyFile);
        console.log(`   Trying to load key from: ${keyPath}`);
        if (fs.existsSync(keyPath)) {
          this.privateKey = fs.readFileSync(keyPath, 'utf8');
          console.log('✅ APNs private key loaded from file:', keyPath);
          return;
        } else {
          console.log(`   File not found: ${keyPath}`);
        }
      } catch (error) {
        console.error('❌ Failed to load APNs key file:', error.message);
      }
    }
    
    console.warn('⚠️ APNs NOT configured - push notifications DISABLED');
    console.warn('   Set APNS_KEY_BASE64 or APNS_KEY_FILE environment variable');
  }
  
  isConfigured() {
    const configured = !!(this.privateKey && this.keyId && this.teamId);
    return configured;
  }
  
  generateJWT() {
    if (!this.privateKey) return null;
    
    // JWT is valid for 1 hour, regenerate if older than 50 minutes
    const now = Math.floor(Date.now() / 1000);
    if (this.jwtToken && this.jwtGeneratedAt && (now - this.jwtGeneratedAt) < 3000) {
      return this.jwtToken;
    }
    
    try {
      const token = jwt.sign(
        {
          iss: this.teamId,
          iat: now
        },
        this.privateKey,
        {
          algorithm: 'ES256',
          header: {
            alg: 'ES256',
            kid: this.keyId
          }
        }
      );
      
      this.jwtToken = token;
      this.jwtGeneratedAt = now;
      
      return token;
    } catch (error) {
      console.error('❌ Failed to generate APNs JWT:', error.message);
      return null;
    }
  }
  
  async sendNotification(deviceToken, payload) {
    if (!this.isConfigured()) {
      return { success: false, error: 'APNs not configured' };
    }
    
    const jwtToken = this.generateJWT();
    if (!jwtToken) {
      return { success: false, error: 'Failed to generate JWT' };
    }
    
    return new Promise((resolve) => {
      let client;
      
      try {
        client = http2.connect(`https://${this.host}`);
      } catch (err) {
        console.error('❌ APNs connection failed:', err.message);
        resolve({ success: false, error: err.message });
        return;
      }
      
      client.on('error', (err) => {
        console.error('❌ APNs connection error:', err.message);
        resolve({ success: false, error: err.message });
      });
      
      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${jwtToken}`,
        'apns-topic': this.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0'
      };
      
      const body = JSON.stringify(payload);
      
      const req = client.request(headers);
      
      let responseData = '';
      
      req.on('response', (headers) => {
        const status = headers[':status'];
        
        req.on('data', (chunk) => {
          responseData += chunk;
        });
        
        req.on('end', () => {
          client.close();
          
          if (status === 200) {
            console.log(`✅ Push sent to ${deviceToken.substring(0, 16)}...`);
            resolve({ success: true });
          } else {
            let errorReason = 'Unknown error';
            try {
              const parsed = JSON.parse(responseData);
              errorReason = parsed.reason || errorReason;
            } catch (e) {}
            
            console.error(`❌ APNs error (${status}): ${errorReason}`);
            resolve({ 
              success: false, 
              error: errorReason,
              status,
              shouldRemoveToken: ['BadDeviceToken', 'Unregistered', 'ExpiredToken'].includes(errorReason)
            });
          }
        });
      });
      
      req.on('error', (err) => {
        client.close();
        console.error('❌ APNs request error:', err.message);
        resolve({ success: false, error: err.message });
      });
      
      req.write(body);
      req.end();
    });
  }
  
  // Build notification payload for a new event
  buildEventPayload(event, circleName) {
    const severityEmoji = {
      'HIGH': '🚨',
      'MEDIUM': '⚠️',
      'LOW': 'ℹ️'
    };
    
    const emoji = severityEmoji[event.severity] || '📢';
    
    return {
      aps: {
        alert: {
          title: `${emoji} ${circleName}`,
          subtitle: event.title,
          body: event.description || 'New security event reported'
        },
        sound: event.severity === 'HIGH' ? 'default' : 'default',
        badge: 1,
        'mutable-content': 1,
        'thread-id': event.circleId
      },
      data: {
        type: 'new_event',
        eventId: event.id,
        circleId: event.circleId,
        severity: event.severity,
        eventType: event.eventType
      }
    };
  }
  
  // Build notification payload for event updates
  buildEventUpdatePayload(event, circleName, updateType) {
    const titles = {
      'resolved': '✅ Event Resolved',
      'false_alarm': 'ℹ️ False Alarm',
      'police_reported': '🚔 Police Notified',
      'new_note': '💬 New Comment',
      'new_media': '📷 New Evidence'
    };
    
    return {
      aps: {
        alert: {
          title: titles[updateType] || '📢 Event Update',
          subtitle: circleName,
          body: event.title
        },
        sound: 'default',
        'thread-id': event.circleId
      },
      data: {
        type: 'event_update',
        updateType,
        eventId: event.id,
        circleId: event.circleId
      }
    };
  }
}

module.exports = new APNsService();
