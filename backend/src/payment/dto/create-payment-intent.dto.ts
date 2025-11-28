import { IsUUID, IsEnum, IsUrl, IsOptional } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  invoiceId!: string;

  @IsEnum(['payfast', 'jazzcash', 'easypaisa'])
  gateway!: string;

  @IsOptional()
  @IsUrl()
  callbackUrl?: string;
}
