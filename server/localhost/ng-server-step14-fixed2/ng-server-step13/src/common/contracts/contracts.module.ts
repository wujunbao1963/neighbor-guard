import { Module } from '@nestjs/common';
import { ContractsValidatorService } from './contracts-validator.service';

@Module({
  providers: [ContractsValidatorService],
  exports: [ContractsValidatorService],
})
export class ContractsModule {}
