import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class DevLoginDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
