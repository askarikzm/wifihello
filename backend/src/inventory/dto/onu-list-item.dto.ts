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
