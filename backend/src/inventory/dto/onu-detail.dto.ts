import { OnuListItemDto } from './onu-list-item.dto';

export interface OnuDetailDto extends OnuListItemDto {
  installationAddress: string | null;
  lastSeen: string | null;
  notes: string | null;
}
