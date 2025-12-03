export interface PaginationMeta {
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface RegionDto {
  id: string;
  name: string;
  code: string | null;
}

export interface RegionListResponse {
  items: RegionDto[];
  pagination?: PaginationMeta;
}

export interface CityDto {
  id: string;
  name: string;
  code: string | null;
  regionId: string;
}

export interface DistrictDto {
  id: string;
  name: string;
  code: string | null;
  cityId: string;
  regionId: string;
}

export interface AreaDto {
  id: string;
  name: string;
  districtId: string;
  cityId: string;
  regionId: string;
}

export interface OltListItemDto {
  id: string;
  hostname: string;
  vendor: string | null;
  mgmtIp: string | null;
  siteLabel: string | null;
  isActive: boolean;
  status: string;
  regionId: string | null;
  regionName: string | null;
  cityId: string | null;
  cityName: string | null;
  districtId: string | null;
  districtName: string | null;
  areaId: string | null;
  areaName: string | null;
}

export interface OnuListItemDto {
  id: string;
  customerId: string | null;
  oltId: string;
  oltName: string | null;
  name: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  portLabel: string | null;
  statusNote: string | null;
  lastSync: string | null;
  lastInspectedAt: string | null;
  regionId: string | null;
  regionName: string | null;
  cityId: string | null;
  cityName: string | null;
  districtId: string | null;
  districtName: string | null;
  areaId: string | null;
  areaName: string | null;
}
