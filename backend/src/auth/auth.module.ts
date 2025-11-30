import { Global, Module } from '@nestjs/common';

import { SupabaseJwtService } from './supabase-jwt.service';
import { SupabaseJwtGuard } from '../common/guards/supabase-jwt.guard';

@Global()
@Module({
  providers: [SupabaseJwtService, SupabaseJwtGuard],
  exports: [SupabaseJwtService, SupabaseJwtGuard],
})
export class AuthModule {}
