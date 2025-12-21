import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { NgTopoMap } from './ng-topomap.entity';

@Injectable()
export class TopoMapService {
  constructor(
    @InjectRepository(NgTopoMap)
    private readonly repo: Repository<NgTopoMap>,
  ) {}

  async upsert(circleId: string, payload: { version: number; data: unknown }): Promise<void> {
    const existing = await this.repo.findOne({ where: { circle_id: circleId } });

    const entity = this.repo.create({
      topo_map_id: existing?.topo_map_id ?? randomUUID(),
      circle_id: circleId,
      version: payload.version,
      data: payload.data,
    });

    await this.repo.save(entity);
  }

  async get(circleId: string): Promise<{ version: number; data: unknown } | null> {
    const row = await this.repo.findOne({ where: { circle_id: circleId } });
    if (!row) return null;
    return { version: row.version, data: row.data };
  }
}
