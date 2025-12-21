import { IsBoolean } from 'class-validator';

export class UpdateEdgeDeviceDto {
  @IsBoolean()
  enabled!: boolean;
}
