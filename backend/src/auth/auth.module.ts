import { Module } from '@nestjs/common';

import { SupabaseJwtService } from './supabase-jwt.service';

@Module({
  providers: [SupabaseJwtService],
  exports: [SupabaseJwtService],
})
export class AuthModule {}
