import { AreaDto } from './area.dto';
import { CityDto } from './city.dto';
import { DistrictDto } from './district.dto';
import { RegionDto } from './region.dto';

export interface GeoTreeAreaDto extends AreaDto {}

export interface GeoTreeDistrictDto extends DistrictDto {
  areas: GeoTreeAreaDto[];
}

export interface GeoTreeCityDto extends CityDto {
  districts: GeoTreeDistrictDto[];
}

export interface GeoTreeRegionDto extends RegionDto {
  cities: GeoTreeCityDto[];
}
