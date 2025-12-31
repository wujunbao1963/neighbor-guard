import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CapabilitiesDto {
  @IsOptional()
  @IsBoolean()
  fusion?: boolean;

  @IsOptional()
  @IsBoolean()
  evidenceUpload?: boolean;

  @IsOptional()
  @IsBoolean()
  topomap?: boolean;
}

export class RegisterEdgeDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['home_assistant', 'edge_agent', 'other'])
  platform?: 'home_assistant' | 'edge_agent' | 'other';

  // Contract defines HaInstanceId; here we validate basic string constraints.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  haInstanceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  softwareVersion?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  publicKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CapabilitiesDto)
  capabilities?: CapabilitiesDto;
}
