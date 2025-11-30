import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { SupabaseJwtService } from '../../auth/supabase-jwt.service';

interface AuthenticatedRequest extends Request {
  user?: any;
}

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly supabaseJwt: SupabaseJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('Missing authorization header');
    }
    request.user = await this.supabaseJwt.verify(token);
    return true;
  }

  private extractBearer(request: Request): string | null {
    const auth = request.headers.authorization ?? '';
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }
}
