import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { NgUser } from './ng-user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(NgUser) private readonly usersRepo: Repository<NgUser>,
    private readonly jwt: JwtService,
  ) {}

  async devLogin(email: string, displayName?: string) {
    let user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      user = this.usersRepo.create({
        id: crypto.randomUUID(),
        email,
        displayName: displayName ?? null,
      });
    } else if (displayName && user.displayName !== displayName) {
      user.displayName = displayName;
    }
    await this.usersRepo.save(user);

    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }
}
