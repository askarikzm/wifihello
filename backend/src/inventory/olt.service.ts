import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';
import { AdminUser } from '../common/types/admin-user';
import { OltListItemDto } from './dto/olt-list-item.dto';
import { OltDetailDto } from './dto/olt-detail.dto';
import { PaginatedResponse, PaginationMeta } from './dto/paginated-response.dto';

interface OltListFilters {
  regionId?: string;
  cityId?: string;
  districtId?: string;
  areaId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class OltService {
  private readonly logger = new Logger(OltService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async listOlts(user: AdminUser, filters: OltListFilters): Promise<PaginatedResponse<OltListItemDto>> {
    const client = this.supabase.getClient();
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);

    let query: any = client
      .from('olt_devices')
      .select(
        `id, hostname, vendor, mgmt_ip, site_label, is_active, status, region_id, city_id, district_id, area_id`,
        { count: 'exact' },
      )
      .order('hostname', { ascending: true });

    query = this.applyScope(query, user);
    query = this.applyGeoFilters(query, filters);

    const searchTerm = filters.search?.trim();
    if (searchTerm) {
      if (this.isUuid(searchTerm)) {
        query = query.eq('id', searchTerm);
      } else {
        query = query.textSearch('olt_search_vector', this.sanitizeSearch(searchTerm), {
          type: 'websearch',
          config: 'simple',
        });
      }
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      this.logger.error('Failed to fetch OLT inventory', error);
      throw new InternalServerErrorException('Unable to fetch OLT inventory');
    }

    const items = await this.enrichOlts(data || []);
    await this.logAudit(user.id, searchTerm ? 'SEARCH_OLT' : 'VIEW_OLT_LIST', {
      filters: { ...filters, search: searchTerm },
      returned: items.length,
      page,
      limit,
    });

    return {
      items,
      pagination: this.buildPagination(count ?? items.length, page, limit),
    };
  }

  async getOlt(user: AdminUser, oltId: string): Promise<OltDetailDto> {
    const client = this.supabase.getClient();

    let query: any = client
      .from('olt_devices')
      .select(
        `id, hostname, vendor, mgmt_ip, site_label, is_active, status, region_id, city_id, district_id, area_id`,
      )
      .eq('id', oltId);

    query = this.applyScope(query, user);

    const { data, error } = await query.single();
    if (error || !data) {
      this.logger.warn(`OLT ${oltId} not found or inaccessible`, error);
      throw new NotFoundException('OLT not found');
    }

    const [dto] = await this.enrichOlts([data]);
    const totalOnus = await this.countOnus(oltId);

    await this.logAudit(user.id, 'VIEW_OLT_DETAIL', { oltId }, oltId);

    return {
      ...dto,
      totalOnus,
      onlineOnus: null,
      notes: null,
    };
  }

  async searchOlts(user: AdminUser, search: string): Promise<PaginatedResponse<OltListItemDto>> {
    return this.listOlts(user, { search, page: 1, limit: 10 });
  }

  private applyGeoFilters(query: any, filters: OltListFilters) {
    if (filters.areaId) {
      query = query.eq('area_id', filters.areaId);
    }
    if (filters.districtId) {
      query = query.eq('district_id', filters.districtId);
    }
    if (filters.cityId) {
      query = query.eq('city_id', filters.cityId);
    }
    if (filters.regionId) {
      query = query.eq('region_id', filters.regionId);
    }
    return query;
  }

  private async enrichOlts(rows: any[]): Promise<OltListItemDto[]> {
    if (!rows.length) {
      return [];
    }

    const regionIds = new Set<string>();
    const cityIds = new Set<string>();
    const districtIds = new Set<string>();
    const areaIds = new Set<string>();

    rows.forEach((row) => {
      if (row.region_id) {
        regionIds.add(row.region_id);
      }
      if (row.city_id) {
        cityIds.add(row.city_id);
      }
      if (row.district_id) {
        districtIds.add(row.district_id);
      }
      if (row.area_id) {
        areaIds.add(row.area_id);
      }
    });

    const [regionMap, cityMap, districtMap, areaMap] = await Promise.all([
      this.fetchGeoNameMap('geo_regions', regionIds),
      this.fetchGeoNameMap('geo_cities', cityIds),
      this.fetchGeoNameMap('geo_districts', districtIds),
      this.fetchGeoNameMap('geo_areas', areaIds),
    ]);

    return rows.map((row) => ({
      id: row.id,
      hostname: row.hostname,
      vendor: row.vendor ?? null,
      mgmtIp: row.mgmt_ip ?? null,
      siteLabel: row.site_label ?? null,
      isActive: row.is_active ?? true,
      status: row.status ?? (row.is_active ? 'active' : 'inactive'),
      regionId: row.region_id ?? null,
      regionName: row.region_id ? regionMap.get(row.region_id) ?? null : null,
      cityId: row.city_id ?? null,
      cityName: row.city_id ? cityMap.get(row.city_id) ?? null : null,
      districtId: row.district_id ?? null,
      districtName: row.district_id ? districtMap.get(row.district_id) ?? null : null,
      areaId: row.area_id ?? null,
      areaName: row.area_id ? areaMap.get(row.area_id) ?? null : null,
    }));
  }

  private async fetchGeoNameMap(table: string, ids: Set<string>): Promise<Map<string, string>> {
    if (!ids.size) {
      return new Map();
    }

    const client = this.supabase.getClient();
    const { data, error } = await client
      .from(table)
      .select('id, name')
      .in('id', Array.from(ids));

    if (error) {
      this.logger.error(`Failed to fetch geo labels from ${table}`, error);
      throw new InternalServerErrorException('Unable to resolve geo labels');
    }

    return new Map((data || []).map((row) => [row.id, row.name]));
  }

  private async countOnus(oltId: string): Promise<number> {
    const client = this.supabase.getClient();
    const { count, error } = await client
      .from('onu_mapping')
      .select('id', { count: 'exact', head: true })
      .eq('olt_id', oltId);

    if (error) {
      this.logger.warn(`Failed to count ONUs for ${oltId}`, error);
      return 0;
    }

    return count ?? 0;
  }

  private buildPagination(total: number, page: number, limit: number): PaginationMeta {
    return {
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    };
  }

  private normalizePage(page?: number): number {
    if (!page || Number.isNaN(page) || page < 1) {
      return 1;
    }
    return page;
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || Number.isNaN(limit) || limit < 1) {
      return 25;
    }
    return Math.min(limit, 100);
  }

  private sanitizeSearch(term: string): string {
    return term.replace(/[!@:#&|]/g, ' ');
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private resolveRegionScope(user: AdminUser): string[] {
    return this.getMetadataScope(user, ['region_scope', 'regionIds', 'region_ids', 'regions']);
  }

  private resolveDistrictScope(user: AdminUser): string[] {
    return this.getMetadataScope(user, ['district_scope', 'districtIds', 'district_ids', 'districts']);
  }

  private getMetadataScope(user: AdminUser, keys: string[]): string[] {
    const sources = [user?.user_metadata, user?.app_metadata];
    for (const key of keys) {
      for (const source of sources) {
        const value = source?.[key];
        if (Array.isArray(value)) {
          return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
        }
        if (typeof value === 'string' && value.trim()) {
          return value
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
        }
      }
    }
    return [];
  }

  private applyScope(query: any, user: AdminUser) {
    const regionScope = this.resolveRegionScope(user);
    const districtScope = this.resolveDistrictScope(user);
    if (regionScope.length) {
      query = query.in('region_id', regionScope);
    }
    if (districtScope.length) {
      query = query.in('district_id', districtScope);
    }
    return query;
  }

  private async logAudit(
    userId: string,
    action: string,
    metadata: Record<string, unknown>,
    entityId?: string,
  ): Promise<void> {
    if (!userId) {
      return;
    }

    const client = this.supabase.getClient();
    const payload = {
      actor_user_id: userId,
      action,
      entity: 'olt_inventory',
      entity_id: entityId,
      metadata,
    };

    const { error } = await client.from('audit_logs').insert(payload);
    if (error) {
      this.logger.warn(`Failed to write audit log for ${action}`, error);
    }
  }
}
