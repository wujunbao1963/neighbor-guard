import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NgUser } from './ng-user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(NgUser) private readonly usersRepo: Repository<NgUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret',
    });
  }

  async validate(payload: any) {
    const userId = payload?.sub as string | undefined;
    const email = payload?.email as string | undefined;
    if (!userId || !email) {
      return null;
    }
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    if (!u) return null;
    return { userId: u.id, email: u.email };
  }
}
