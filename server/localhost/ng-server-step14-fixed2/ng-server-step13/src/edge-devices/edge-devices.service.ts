import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { NgEdgeDevice } from './ng-edge-device.entity';
import { RegisterEdgeDeviceDto } from './dto/register-edge-device.dto';
import { CirclesService } from '../circles/circles.service';

export type RegisterEdgeDeviceResponse = {
  deviceId: string;
  deviceKey: string;
  pairedAt: string;
  capabilities: {
    fusion: boolean;
    evidenceUpload: boolean;
    topomap: boolean;
  };
};

function genDeviceKey(): string {
  // Contract describes Base64Secret; it does not enforce a pattern.
  // We use standard base64 (header-safe).
  const bytes = crypto.randomBytes(32);
  return bytes.toString('base64');
}

function hmacSha256Hex(pepper: string, value: string): string {
  return crypto.createHmac('sha256', pepper).update(value).digest('hex');
}

@Injectable()
export class EdgeDevicesService {
  constructor(
    @InjectRepository(NgEdgeDevice)
    private readonly repo: Repository<NgEdgeDevice>,
    private readonly config: ConfigService,
    private readonly circles: CirclesService,
  ) {}

  async register(userId: string, circleId: string, dto: RegisterEdgeDeviceDto): Promise<RegisterEdgeDeviceResponse> {
    await this.circles.mustHaveRole(userId, circleId, ['owner', 'household']);
    const deviceId = crypto.randomUUID();
    const deviceKey = genDeviceKey();

    const pepper = this.config.get<string>('DEVICE_KEY_PEPPER') ?? 'dev-pepper';
    const deviceKeyHash = hmacSha256Hex(pepper, deviceKey);

    const caps = {
      fusion: dto.capabilities?.fusion ?? false,
      evidenceUpload: dto.capabilities?.evidenceUpload ?? false,
      topomap: dto.capabilities?.topomap ?? false,
    };

    const metadata = {
      platform: dto.platform ?? null,
      haInstanceId: dto.haInstanceId ?? null,
      softwareVersion: dto.softwareVersion ?? null,
      publicKey: dto.publicKey ?? null,
    };

    const entity = this.repo.create({
      id: deviceId,
      circleId,
      name: dto.deviceName ?? null,
      deviceKeyHash,
      capabilities: caps,
      metadata,
      revokedAt: null,
      lastSeenAt: null,
    });

    await this.repo.save(entity);

    return {
      deviceId,
      deviceKey,
      pairedAt: new Date().toISOString(),
      capabilities: caps,
    };
  }

async list(userId: string, circleId: string): Promise<Array<{
  deviceId: string;
  name: string | null;
  enabled: boolean;
  pairedAt: string;
  lastSeenAt: string | null;
  capabilities: { fusion: boolean; evidenceUpload: boolean; topomap: boolean };
  metadata: Record<string, any> | null;
}>> {
  await this.circles.mustHaveRole(userId, circleId, ['owner', 'household']);
  const rows = await this.repo.find({
    where: { circleId },
    order: { createdAt: 'ASC' as any },
  });

  return rows.map((d) => ({
    deviceId: d.id,
    name: d.name ?? null,
    enabled: d.revokedAt == null,
    pairedAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    capabilities: {
      fusion: !!(d.capabilities as any)?.fusion,
      evidenceUpload: !!(d.capabilities as any)?.evidenceUpload,
      topomap: !!(d.capabilities as any)?.topomap,
    },
    metadata: d.metadata ?? null,
  }));
}

async setEnabled(
  userId: string,
  circleId: string,
  deviceId: string,
  enabled: boolean,
): Promise<{ deviceId: string; enabled: boolean }> {
  await this.circles.mustHaveRole(userId, circleId, ['owner']);
  const device = await this.repo.findOne({ where: { id: deviceId, circleId } });
  if (!device) {
    // keep error envelope consistent; controller will convert to NotFound if needed
    throw new Error('DEVICE_NOT_FOUND');
  }
  const revokedAt = enabled ? null : new Date();
  await this.repo.update({ id: deviceId }, { revokedAt });
  return { deviceId, enabled };
}

async rotateKey(
  userId: string,
  circleId: string,
  deviceId: string,
): Promise<{ deviceId: string; deviceKey: string; rotatedAt: string }> {
  await this.circles.mustHaveRole(userId, circleId, ['owner']);
  const device = await this.repo.findOne({ where: { id: deviceId, circleId } });
  if (!device) {
    throw new Error('DEVICE_NOT_FOUND');
  }
  const deviceKey = genDeviceKey();
  const pepper = this.config.get<string>('DEVICE_KEY_PEPPER') ?? 'dev-pepper';
  const deviceKeyHash = hmacSha256Hex(pepper, deviceKey);

  await this.repo.update({ id: deviceId }, { deviceKeyHash, revokedAt: null });

  return { deviceId, deviceKey, rotatedAt: new Date().toISOString() };
}

}
