import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async checkDb(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }
}
