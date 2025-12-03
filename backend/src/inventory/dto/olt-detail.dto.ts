import { OltListItemDto } from './olt-list-item.dto';

export interface OltDetailDto extends OltListItemDto {
  totalOnus: number;
  onlineOnus: number | null;
  notes: string | null;
}
