import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { SupabaseClientService } from '../database/supabase-client.service';
import { AdminUser } from '../common/types/admin-user';
import { AreaDto } from './dto/area.dto';
import { CityDto } from './dto/city.dto';
import { DistrictDto } from './dto/district.dto';
import { GeoTreeRegionDto } from './dto/geo-tree.dto';
import { RegionDto } from './dto/region.dto';

interface PaginationMeta {
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface RegionListResponse {
  items: RegionDto[];
  pagination?: PaginationMeta;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private readonly supabase: SupabaseClientService) {}

  async listRegions(user: AdminUser, params: { page?: number; limit?: number }): Promise<RegionListResponse> {
    const client = this.supabase.getClient();
    const page = this.normalizePage(params.page);
    const limit = this.normalizeLimit(params.limit);

    let query = client
      .from('geo_regions')
      .select('id, name, code', { count: limit ? 'exact' : undefined })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    query = this.applyRegionScope(query, user, 'id');

    if (limit) {
      const start = (page - 1) * limit;
      query = query.range(start, start + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) {
      this.logger.error('Failed to fetch regions', error);
      throw new InternalServerErrorException('Unable to fetch regions');
    }

    const items = (data || []).map((row) => this.mapRegion(row));
    if (limit) {
      return {
        items,
        pagination: this.buildPagination(count ?? items.length, page, limit),
      };
    }

    return { items };
  }

  async listCities(user: AdminUser, regionId: string): Promise<CityDto[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('geo_cities')
      .select('id, name, code, region_id')
      .eq('region_id', regionId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    query = this.applyRegionScope(query, user, 'region_id');

    const { data, error } = await query;
    if (error) {
      this.logger.error('Failed to fetch cities', error);
      throw new InternalServerErrorException('Unable to fetch cities');
    }

    return (data || []).map((row) => this.mapCity(row));
  }

  async listDistricts(user: AdminUser, cityId: string): Promise<DistrictDto[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('geo_districts')
      .select('id, name, code, city_id, region_id')
      .eq('city_id', cityId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    query = this.applyRegionScope(query, user, 'region_id');

    const { data, error } = await query;
    if (error) {
      this.logger.error('Failed to fetch districts', error);
      throw new InternalServerErrorException('Unable to fetch districts');
    }

    return (data || []).map((row) => this.mapDistrict(row));
  }

  async listAreas(user: AdminUser, districtId: string): Promise<AreaDto[]> {
    const client = this.supabase.getClient();
    let query = client
      .from('geo_areas')
      .select('id, name, district_id, city_id, region_id')
      .eq('district_id', districtId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    query = this.applyRegionScope(query, user, 'region_id');

    const { data, error } = await query;
    if (error) {
      this.logger.error('Failed to fetch areas', error);
      throw new InternalServerErrorException('Unable to fetch areas');
    }

    return (data || []).map((row) => this.mapArea(row));
  }

  async getTree(user: AdminUser): Promise<GeoTreeRegionDto[]> {
    const client = this.supabase.getClient();

    const [regionsRes, citiesRes, districtsRes, areasRes] = await Promise.all([
      client
        .from('geo_regions')
        .select('id, name, code')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('geo_cities')
        .select('id, name, code, region_id')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('geo_districts')
        .select('id, name, code, city_id, region_id')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('geo_areas')
        .select('id, name, district_id, city_id, region_id')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);

    const responses = [regionsRes, citiesRes, districtsRes, areasRes];
    const failed = responses.find(({ error }) => error);
    if (failed?.error) {
      this.logger.error('Failed to build geo tree', failed.error);
      throw new InternalServerErrorException('Unable to build geo tree');
    }

    const regionScope = this.resolveRegionScope(user);
    const regions = (regionsRes.data || [])
      .filter((r) => !regionScope.length || regionScope.includes(r.id))
      .map((row) => this.mapRegion(row));

    const citiesByRegion = this.groupBy<any>(citiesRes.data || [], 'region_id');
    const districtsByCity = this.groupBy<any>(districtsRes.data || [], 'city_id');
    const areasByDistrict = this.groupBy<any>(areasRes.data || [], 'district_id');

    return regions.map((region) => ({
      ...region,
      cities: (citiesByRegion.get(region.id) || []).map((cityRow) => ({
        ...this.mapCity(cityRow),
        districts: (districtsByCity.get(cityRow.id) || []).map((districtRow) => ({
          ...this.mapDistrict(districtRow),
          areas: (areasByDistrict.get(districtRow.id) || []).map((areaRow) => this.mapArea(areaRow)),
        })),
      })),
    }));
  }

  private mapRegion(row: any): RegionDto {
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? null,
    };
  }

  private mapCity(row: any): CityDto {
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      regionId: row.region_id,
    };
  }

  private mapDistrict(row: any): DistrictDto {
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      cityId: row.city_id,
      regionId: row.region_id,
    };
  }

  private mapArea(row: any): AreaDto {
    return {
      id: row.id,
      name: row.name,
      districtId: row.district_id,
      cityId: row.city_id,
      regionId: row.region_id,
    };
  }

  private normalizePage(page?: number): number {
    if (!page || Number.isNaN(page) || page < 1) {
      return 1;
    }
    return page;
  }

  private normalizeLimit(limit?: number): number | undefined {
    if (!limit || Number.isNaN(limit) || limit < 1) {
      return undefined;
    }
    return Math.min(limit, 200);
  }

  private buildPagination(total: number, page: number, limit: number): PaginationMeta {
    return {
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    };
  }

  private resolveRegionScope(user: AdminUser): string[] {
    // Placeholder for future per-user region scoping. Currently unrestricted for admin roles.
    // TODO: integrate user-region mapping when available.
    void user;
    return [];
  }

  private applyRegionScope(
    query: any,
    user: AdminUser,
    column: string,
  ): any {
    const scope = this.resolveRegionScope(user);
    if (scope.length) {
      return query.in(column, scope);
    }
    return query;
  }

  private groupBy<T extends Record<string, any>>(rows: T[], key: keyof T): Map<string, T[]> {
    return rows.reduce((map, row) => {
      const value = row[key];
      if (!map.has(value)) {
        map.set(value, []);
      }
      map.get(value)!.push(row);
      return map;
    }, new Map<string, T[]>());
  }
}
