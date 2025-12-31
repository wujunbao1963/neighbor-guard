import { IsString, Length } from 'class-validator';

export class CreateCircleDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}
