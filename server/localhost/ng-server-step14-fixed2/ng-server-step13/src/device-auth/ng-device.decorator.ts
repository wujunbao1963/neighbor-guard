import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Access the authenticated Edge device (attached by DeviceKeyAuthGuard).
 */
export const NgDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req: any = ctx.switchToHttp().getRequest();
    return req.ngDevice ?? null;
  },
);
