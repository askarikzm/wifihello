import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import configuration from '../config/configuration';

@Injectable()
export class SupabaseClientService {
  private readonly client: SupabaseClient;

  constructor(
    @Inject(configuration.KEY)
    config: ConfigType<typeof configuration>,
  ) {
    this.client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  getClient() {
    return this.client;
  }
}
