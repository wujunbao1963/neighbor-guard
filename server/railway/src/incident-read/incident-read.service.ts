import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NgIncidentManifest } from '../edge-events/ng-incident-manifest.entity';

@Injectable()
export class IncidentReadService {
  constructor(
    @InjectRepository(NgIncidentManifest)
    private readonly repo: Repository<NgIncidentManifest>,
  ) {}

  async getManifest(circleId: string, eventId: string) {
    return this.repo.findOne({ where: { circleId, eventId } });
  }
}
