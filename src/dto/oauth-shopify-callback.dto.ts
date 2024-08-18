import { IsNotEmpty, IsString } from 'class-validator';

export class OauthShopifyCallbackDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  shop: string;
}
