import { IsString, IsEnum, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject!: string;

  @IsEnum(['billing', 'technical', 'general', 'complaint', 'request'])
  category!: string;

  @IsEnum(['low', 'normal', 'high', 'urgent'])
  @IsOptional()
  priority?: string = 'normal';

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}

export class AddMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

export class UpdateTicketStatusDto {
  @IsEnum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])
  status!: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}
