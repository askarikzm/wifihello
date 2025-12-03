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
