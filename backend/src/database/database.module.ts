import { Global, Module } from '@nestjs/common';

import { SupabaseClientService } from './supabase-client.service';

@Global()
@Module({
  providers: [SupabaseClientService],
  exports: [SupabaseClientService],
})
export class DatabaseModule {}
