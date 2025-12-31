import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type StorageMode = 'mock' | 's3';

type AwsDeps = {
  S3Client: typeof import('@aws-sdk/client-s3').S3Client;
  PutObjectCommand: typeof import('@aws-sdk/client-s3').PutObjectCommand;
  GetObjectCommand: typeof import('@aws-sdk/client-s3').GetObjectCommand;
  getSignedUrl: typeof import('@aws-sdk/s3-request-presigner').getSignedUrl;
};

@Injectable()
export class EvidenceStorageService {
  private readonly mode: StorageMode;
  private readonly expiresSec: number;

  // S3 config (only used when mode === 's3')
  private readonly bucket?: string;
  private readonly region?: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle?: boolean;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;

  // Lazily loaded AWS deps (prevents Jest from requiring smithy packages in mock mode)
  private aws?: AwsDeps;
  private s3Client?: import('@aws-sdk/client-s3').S3Client;

  constructor(private readonly config: ConfigService) {
    this.mode = (this.config.get<string>('EVIDENCE_STORAGE_MODE') ?? 'mock') as StorageMode;
    this.expiresSec = Number(this.config.get<string>('EVIDENCE_URL_EXPIRES_SEC') ?? '900');

    if (this.mode === 's3') {
      this.bucket = this.mustGet('EVIDENCE_S3_BUCKET');
      this.region = this.config.get<string>('EVIDENCE_S3_REGION') ?? 'auto';
      this.endpoint = this.config.get<string>('EVIDENCE_S3_ENDPOINT') ?? undefined;
      this.forcePathStyle = (this.config.get<string>('EVIDENCE_S3_FORCE_PATH_STYLE') ?? 'false') === 'true';
      this.accessKeyId = this.mustGet('EVIDENCE_S3_ACCESS_KEY_ID');
      this.secretAccessKey = this.mustGet('EVIDENCE_S3_SECRET_ACCESS_KEY');
    }
  }

  async presignUploadUrl(args: {
    circleId: string;
    eventId: string;
    sha256: string;
    contentType: string;
  }): Promise<{ url: string; objectKey: string; expiresAt: string }> {
    const key = this.objectKey(args.circleId, args.eventId, args.sha256);
    const expiresAt = new Date(Date.now() + this.expiresSec * 1000).toISOString();

    if (this.mode === 'mock') {
      return {
        url: `https://mock.neighborguard.local/upload/${args.sha256}?key=${encodeURIComponent(key)}`,
        objectKey: key,
        expiresAt,
      };
    }

    const { PutObjectCommand, getSignedUrl } = await this.ensureAws();
    const s3 = await this.ensureS3();
    const bucket = this.bucket!;
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: args.contentType,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: this.expiresSec });
    return { url, objectKey: key, expiresAt };
  }

  async presignDownloadUrl(args: {
    circleId: string;
    eventId: string;
    sha256: string;
  }): Promise<{ url: string; expiresAt: string }> {
    const key = this.objectKey(args.circleId, args.eventId, args.sha256);
    const expiresAt = new Date(Date.now() + this.expiresSec * 1000).toISOString();

    if (this.mode === 'mock') {
      return { url: `https://mock.neighborguard.local/download/${args.sha256}?key=${encodeURIComponent(key)}`, expiresAt };
    }

    const { GetObjectCommand, getSignedUrl } = await this.ensureAws();
    const s3 = await this.ensureS3();
    const bucket = this.bucket!;
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: this.expiresSec });
    return { url, expiresAt };
  }

  private async ensureAws(): Promise<AwsDeps> {
    if (this.aws) return this.aws;

    // Dynamic import keeps mock-mode tests from requiring smithy deps.
    const s3mod = await import('@aws-sdk/client-s3');
    const presigner = await import('@aws-sdk/s3-request-presigner');

    this.aws = {
      S3Client: s3mod.S3Client,
      PutObjectCommand: s3mod.PutObjectCommand,
      GetObjectCommand: s3mod.GetObjectCommand,
      getSignedUrl: presigner.getSignedUrl,
    };
    return this.aws;
  }

  private async ensureS3(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (this.s3Client) return this.s3Client;
    const { S3Client } = await this.ensureAws();

    this.s3Client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: this.accessKeyId!,
        secretAccessKey: this.secretAccessKey!,
      },
    });

    return this.s3Client;
  }

  private objectKey(circleId: string, eventId: string, sha256: string): string {
    return `circles/${circleId}/events/${eventId}/${sha256}`;
  }

  private mustGet(name: string): string {
    const v = this.config.get<string>(name);
    if (!v) {
      throw new Error(`${name} is required when EVIDENCE_STORAGE_MODE=s3`);
    }
    return v;
  }
}
