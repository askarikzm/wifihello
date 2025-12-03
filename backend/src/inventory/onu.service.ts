import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';
import { AdminUser } from '../common/types/admin-user';
import { OnuListItemDto } from './dto/onu-list-item.dto';
import { OnuDetailDto } from './dto/onu-detail.dto';
import { PaginatedResponse, PaginationMeta } from './dto/paginated-response.dto';

interface OnuListFilters {
  oltId?: string;
  regionId?: string;
  cityId?: string;
  districtId?: string;
  areaId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class OnuService {
  private readonly logger = new Logger(OnuService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async listOnus(user: AdminUser, filters: OnuListFilters): Promise<PaginatedResponse<OnuListItemDto>> {
    const client = this.supabase.getClient();
    const page = this.normalizePage(filters.page);
    const limit = this.normalizeLimit(filters.limit);

    let query: any = client
      .from('onu_mapping')
      .select(
        `
          id,
          customer_id,
          olt_id,
          serial,
          mac_address,
          frame,
          slot,
          port,
          onu_id,
          status_note,
          last_sync,
          last_inspected_at,
          installation_address,
          region_id,
          city_id,
          district_id,
          area_id,
          olt:olt_devices(id, hostname, site_label),
          customer:customers(id, full_name)
        `,
        { count: 'exact' },
      )
      .order('last_sync', { ascending: false, nullsLast: true })
      .order('serial', { ascending: true });

    query = this.applyScope(query, user);
    query = this.applyGeoFilters(query, filters);

    if (filters.oltId) {
      query = query.eq('olt_id', filters.oltId);
    }

    const searchTerm = filters.search?.trim();
    if (searchTerm) {
      query = this.applySearch(query, searchTerm);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      this.logger.error('Failed to fetch ONU inventory', error);
      throw new InternalServerErrorException('Unable to fetch ONU inventory');
    }

    const items = await this.enrichOnus(data || []);

    await this.logAudit(user.id, searchTerm ? 'SEARCH_ONU' : 'VIEW_ONU_LIST', {
      filters: { ...filters, search: searchTerm, page, limit },
      returned: items.length,
      page,
      limit,
    });

    return {
      items,
      pagination: this.buildPagination(count ?? items.length, page, limit),
    };
  }

  async getOnu(user: AdminUser, onuId: string): Promise<OnuDetailDto> {
    const client = this.supabase.getClient();

    let query: any = client
      .from('onu_mapping')
      .select(
        `
          id,
          customer_id,
          olt_id,
          serial,
          mac_address,
          frame,
          slot,
          port,
          onu_id,
          status_note,
          last_sync,
          last_inspected_at,
          installation_address,
          region_id,
          city_id,
          district_id,
          area_id,
          olt:olt_devices(id, hostname, site_label),
          customer:customers(id, full_name)
        `,
      )
      .eq('id', onuId);

    query = this.applyScope(query, user);

    const { data, error } = await query.single();
    if (error || !data) {
      this.logger.warn(`ONU ${onuId} not found or inaccessible`, error);
      throw new NotFoundException('ONU not found');
    }

    const [dto] = await this.enrichOnus([data]);

    await this.logAudit(user.id, 'VIEW_ONU_DETAIL', { onuId }, onuId);

    return {
      ...dto,
      installationAddress: data.installation_address ?? null,
      lastSeen: data.last_sync ?? null,
      notes: data.status_note ?? null,
    };
  }

  async searchOnus(user: AdminUser, search: string): Promise<PaginatedResponse<OnuListItemDto>> {
    return this.listOnus(user, { search, page: 1, limit: 10 });
  }

  private applyGeoFilters(query: any, filters: OnuListFilters) {
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

  private applySearch(query: any, term: string) {
    if (this.isUuid(term)) {
      return query.eq('id', term);
    }

    if (this.isMacAddress(term)) {
      return this.applyMacSearch(query, term);
    }

    if (this.isSerial(term)) {
      return query.ilike('serial', term);
    }

    return query.textSearch('onu_search_vector', this.sanitizeSearch(term), {
      type: 'websearch',
      config: 'simple',
    });
  }

  private applyMacSearch(query: any, term: string) {
    const candidates = this.buildMacCandidates(term);
    if (candidates.length === 1) {
      return query.eq('mac_address', candidates[0]);
    }

    const clause = candidates.map((candidate) => `mac_address.eq.${candidate}`).join(',');
    return clause ? query.or(clause) : query.eq('mac_address', candidates[0]);
  }

  private buildMacCandidates(term: string): string[] {
    const normalized = term.replace(/[^a-f0-9]/gi, '').toLowerCase();
    const pairs = normalized.match(/.{2}/g);
    const colonized = pairs?.join(':');
    const dashed = pairs?.join('-');

    const variants = new Set<string>();
    variants.add(term);
    variants.add(term.toLowerCase());
    variants.add(term.toUpperCase());
    variants.add(normalized);
    if (colonized) {
      variants.add(colonized);
      variants.add(colonized.toUpperCase());
    }
    if (dashed) {
      variants.add(dashed);
      variants.add(dashed.toUpperCase());
    }

    return Array.from(variants).filter((value) => value.length > 0);
  }

  private async enrichOnus(rows: any[]): Promise<OnuListItemDto[]> {
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
      customerId: row.customer_id ?? null,
      oltId: row.olt_id,
      oltName: row.olt?.site_label ?? row.olt?.hostname ?? null,
      name: row.customer?.full_name ?? null,
      serialNumber: row.serial ?? null,
      macAddress: row.mac_address ?? null,
      portLabel: this.composePortLabel(row),
      statusNote: row.status_note ?? null,
      lastSync: row.last_sync ?? null,
      lastInspectedAt: row.last_inspected_at ?? null,
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

  private composePortLabel(row: any): string | null {
    const parts = [row.frame, row.slot, row.port, row.onu_id]
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value));
    return parts.length ? parts.join('/') : null;
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

  private isMacAddress(value: string): boolean {
    const compact = value.replace(/[^a-f0-9]/gi, '');
    return compact.length === 12;
  }

  private isSerial(value: string): boolean {
    return /^[a-zA-Z0-9\-]{6,32}$/.test(value);
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
      entity: 'onu_inventory',
      entity_id: entityId,
      metadata,
    };

    const { error } = await client.from('audit_logs').insert(payload);
    if (error) {
      this.logger.warn(`Failed to write audit log for ${action}`, error);
    }
  }
}
