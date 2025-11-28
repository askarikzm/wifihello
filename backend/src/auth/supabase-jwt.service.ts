import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTVerifyResult } from 'jose';

import configuration from '../config/configuration';

@Injectable()
export class SupabaseJwtService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly audience: string;

  constructor(
    @Inject(configuration.KEY)
    config: ConfigType<typeof configuration>,
  ) {
    this.jwks = createRemoteJWKSet(new URL(config.supabase.jwksUrl));
    this.audience = config.supabase.audience;
  }

  async verify(token: string): Promise<JWTVerifyResult['payload']> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `${process.env.SUPABASE_URL}/auth/v1`,
        audience: this.audience,
      });
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid Supabase token');
    }
  }
}
