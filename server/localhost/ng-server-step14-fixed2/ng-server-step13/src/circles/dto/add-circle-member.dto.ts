import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class AddCircleMemberDto {
  @IsEmail()
  email!: string;

  /**
   * MVP roles. Keep it small for now; extend later.
   */
  @IsString()
  @IsIn(['owner', 'household', 'neighbor', 'relative', 'community_admin'])
  role!: string;

  /**
   * Optional idempotency key from client to safely retry.
   */
  @IsOptional()
  @IsString()
  clientRequestId?: string;
}
