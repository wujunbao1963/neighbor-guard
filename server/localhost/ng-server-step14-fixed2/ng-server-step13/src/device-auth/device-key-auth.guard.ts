import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceAuthService } from './device-auth.service';

@Injectable()
export class DeviceKeyAuthGuard implements CanActivate {
  constructor(private readonly auth: DeviceAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Device authorization required');
    }

    const [schemeRaw, ...rest] = authHeader.trim().split(/\s+/);
    const scheme = (schemeRaw ?? '').toLowerCase();
    const token = rest.join(' ');

    if (scheme !== 'device' || !token) {
      throw new UnauthorizedException('Invalid device authorization header');
    }

    const device = await this.auth.validateDeviceKey(token);

    // Optional: if the route is scoped by circleId, enforce match.
    const circleIdParam = req.params?.circleId;
    if (circleIdParam && circleIdParam !== device.circleId) {
      throw new ForbiddenException('circleId mismatch');
    }

    req.ngDevice = device;
    return true;
  }
}
