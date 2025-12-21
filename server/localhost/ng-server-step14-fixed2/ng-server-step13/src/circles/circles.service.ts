import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { In, Repository } from 'typeorm';
import { NgCircle } from './ng-circle.entity';
import { NgCircleMember } from './ng-circle-member.entity';
import { NgUser } from '../auth/ng-user.entity';
import { NgHttpError, NgErrorCodes } from '../common/errors/ng-http-error';

@Injectable()
export class CirclesService {
  constructor(
    @InjectRepository(NgCircle) private readonly circlesRepo: Repository<NgCircle>,
    @InjectRepository(NgCircleMember) private readonly membersRepo: Repository<NgCircleMember>,
    @InjectRepository(NgUser) private readonly usersRepo: Repository<NgUser>,
  ) {}

  async createCircle(ownerUserId: string, name: string) {
    const user = await this.usersRepo.findOne({ where: { id: ownerUserId } });
    if (!user) {
      throw new NgHttpError({
        statusCode: 401,
        error: 'Unauthorized',
        code: NgErrorCodes.UNAUTHORIZED,
        message: 'User not found',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }

    const circleId = crypto.randomUUID();
    const circle = this.circlesRepo.create({ id: circleId, name });
    await this.circlesRepo.save(circle);

    const member = this.membersRepo.create({
      circleId,
      userId: ownerUserId,
      role: 'owner',
    });
    await this.membersRepo.save(member);

    return { circleId, name, createdAt: circle.createdAt.toISOString() };
  }

  async listMyCircles(userId: string) {
    const memberships = await this.membersRepo.find({ where: { userId } });
    const circleIds = memberships.map((m) => m.circleId);
    if (circleIds.length === 0) {
      return { circles: [] as Array<{ id: string; name: string }>, count: 0 };
    }
    const circles = await this.circlesRepo.find({ where: { id: In(circleIds) } });
    const byId = new Map(circles.map((c) => [c.id, c]));
    const ordered = circleIds.map((id) => byId.get(id)).filter(Boolean) as NgCircle[];
    return { circles: ordered.map((c) => ({ id: c.id, name: c.name })), count: ordered.length };
  }

  async listMembers(requesterUserId: string, circleId: string) {
    await this.mustBeMember(requesterUserId, circleId);

    const members = await this.membersRepo.find({ where: { circleId } });
    const userIds = members.map((m) => m.userId);
    const users = userIds.length ? await this.usersRepo.find({ where: { id: In(userIds) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      members: members.map((m) => ({
        userId: m.userId,
        email: byId.get(m.userId)?.email ?? null,
        displayName: byId.get(m.userId)?.displayName ?? null,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      count: members.length,
    };
  }

  async addMember(
    requesterUserId: string,
    circleId: string,
    dto: { email: string; role: string; clientRequestId?: string },
  ) {
    await this.mustHaveRole(requesterUserId, circleId, ['owner', 'household']);

    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new NgHttpError({
        statusCode: 404,
        error: 'Not Found',
        code: NgErrorCodes.NOT_FOUND,
        message: 'User not found',
        timestamp: new Date().toISOString(),
        retryable: false,
        details: { email: dto.email },
      });
    }

    const existing = await this.membersRepo.findOne({ where: { circleId, userId: user.id } });
    if (existing) {
      return { created: false, member: { userId: existing.userId, role: existing.role } };
    }

    const member = this.membersRepo.create({
      circleId,
      userId: user.id,
      role: dto.role,
    });
    await this.membersRepo.save(member);
    return { created: true, member: { userId: member.userId, role: member.role } };
  }

  async mustBeMember(userId: string, circleId: string) {
    const m = await this.membersRepo.findOne({ where: { userId, circleId } });
    if (!m) {
      throw new NgHttpError({
        statusCode: 403,
        error: 'Forbidden',
        code: NgErrorCodes.FORBIDDEN,
        message: 'Not a circle member',
        timestamp: new Date().toISOString(),
        retryable: false,
      });
    }
    return m;
  }

  async mustHaveRole(userId: string, circleId: string, allowed: string[]) {
    const m = await this.mustBeMember(userId, circleId);
    if (!allowed.includes(m.role)) {
      throw new NgHttpError({
        statusCode: 403,
        error: 'Forbidden',
        code: NgErrorCodes.FORBIDDEN,
        message: 'Insufficient role for this action',
        timestamp: new Date().toISOString(),
        retryable: false,
        details: { role: m.role, allowed },
      });
    }
    return m;
  }
}
