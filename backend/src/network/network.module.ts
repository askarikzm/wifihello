import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

@Module({
  imports: [HttpModule],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
