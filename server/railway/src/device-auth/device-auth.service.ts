import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { NgEdgeDevice } from '../edge-devices/ng-edge-device.entity';

function hmacSha256Hex(pepper: string, value: string): string {
  return crypto.createHmac('sha256', pepper).update(value).digest('hex');
}

@Injectable()
export class DeviceAuthService {
  constructor(
    @InjectRepository(NgEdgeDevice)
    private readonly repo: Repository<NgEdgeDevice>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validates a plaintext deviceKey from `Authorization: Device <deviceKey>`.
   * Throws UnauthorizedException if invalid or revoked.
   */
  async validateDeviceKey(deviceKey: string): Promise<NgEdgeDevice> {
    const pepper = this.config.get<string>('DEVICE_KEY_PEPPER') ?? 'dev-pepper';
    const deviceKeyHash = hmacSha256Hex(pepper, deviceKey);

    const device = await this.repo.findOne({
      where: {
        deviceKeyHash,
        revokedAt: IsNull(),
      },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid device key');
    }

    // Update lastSeenAt opportunistically. Do not block on errors.
    const now = new Date();
    device.lastSeenAt = now;
    await this.repo.update({ id: device.id }, { lastSeenAt: now });

    return device;
  }
}
