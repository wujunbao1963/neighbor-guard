// ============================================================================
// Notification Service - Send push notifications to circle members
// ============================================================================

const prisma = require('../config/database');
const apnsService = require('./apnsService');

class NotificationService {
  
  // Send notification to all members of a circle (except excludeUserId)
  async notifyCircleMembers(circleId, payload, options = {}) {
    const { excludeUserId, severityFilter } = options;
    
    console.log(`\n📤 notifyCircleMembers called:`);
    console.log(`   circleId: ${circleId}`);
    console.log(`   excludeUserId: ${excludeUserId}`);
    console.log(`   severityFilter: ${severityFilter}`);
    console.log(`   APNs configured: ${apnsService.isConfigured()}`);
    
    if (!apnsService.isConfigured()) {
      console.log('⏭️ APNs not configured, skipping notifications');
      return { sent: 0, failed: 0 };
    }
    
    try {
      // Get circle info
      const circle = await prisma.circle.findUnique({
        where: { id: circleId },
        select: { displayName: true }
      });
      
      if (!circle) {
        console.error(`❌ Circle not found: ${circleId}`);
        return { sent: 0, failed: 0 };
      }
      
      console.log(`   Circle name: ${circle.displayName}`);
      
      // Build query for members who should receive notifications
      const memberWhere = {
        circleId,
        leftAt: null
      };
      
      // Filter by severity preference
      if (severityFilter === 'HIGH') {
        memberWhere.notifyOnHighSeverity = true;
      } else if (severityFilter === 'MEDIUM') {
        memberWhere.notifyOnMediumSeverity = true;
      } else if (severityFilter === 'LOW') {
        memberWhere.notifyOnLowSeverity = true;
      }
      
      // Get members with their device tokens
      const members = await prisma.circleMember.findMany({
        where: memberWhere,
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              displayName: true,
              deviceTokens: {
                where: { isActive: true },
                select: { token: true, id: true }
              }
            }
          }
        }
      });
      
      console.log(`   Found ${members.length} members matching criteria`);
      
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      
      for (const member of members) {
        // Skip excluded user (usually the event creator)
        if (excludeUserId && member.userId === excludeUserId) {
          console.log(`   ⏭️ Skipping ${member.user.displayName} (event creator)`);
          skipped++;
          continue;
        }
        
        const tokenCount = member.user.deviceTokens.length;
        console.log(`   👤 ${member.user.displayName}: ${tokenCount} device(s)`);
        
        // Send to all active devices of this member
        for (const device of member.user.deviceTokens) {
          console.log(`      📱 Sending to token: ${device.token.substring(0, 20)}...`);
          const result = await apnsService.sendNotification(device.token, payload);
          
          if (result.success) {
            sent++;
            console.log(`      ✅ Sent successfully`);
          } else {
            failed++;
            console.log(`      ❌ Failed: ${result.error}`);
            
            // Remove invalid tokens
            if (result.shouldRemoveToken) {
              console.log(`      🗑️ Removing invalid token`);
              await prisma.deviceToken.delete({
                where: { id: device.id }
              }).catch(() => {});
            }
          }
        }
      }
      
      console.log(`📊 Notification Summary: ${sent} sent, ${failed} failed, ${skipped} skipped\n`);
      return { sent, failed, skipped };
      
    } catch (error) {
      console.error('❌ Error sending notifications:', error);
      return { sent: 0, failed: 0, error: error.message };
    }
  }
  
  // Notify about a new event
  async notifyNewEvent(event, circle, excludeUserId) {
    const payload = apnsService.buildEventPayload(event, circle.displayName);
    
    return this.notifyCircleMembers(event.circleId, payload, {
      excludeUserId,
      severityFilter: event.severity
    });
  }
  
  // Notify about event update (resolved, new comment, etc.)
  async notifyEventUpdate(event, circle, updateType, excludeUserId) {
    const payload = apnsService.buildEventUpdatePayload(event, circle.displayName, updateType);
    
    return this.notifyCircleMembers(event.circleId, payload, {
      excludeUserId
    });
  }
}

module.exports = new NotificationService();
