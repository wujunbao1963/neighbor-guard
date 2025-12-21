import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DevLoginDto } from './dto/dev-login.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Dev-only login for local tests and early integration.
   * Creates/updates a user record and returns a signed JWT.
   */
  @Post('dev/login')
  async devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto.email, dto.displayName);
  }
}
