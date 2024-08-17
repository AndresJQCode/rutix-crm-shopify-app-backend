import { Injectable } from '@nestjs/common';
import { OauthShopifyCallbackDto } from './dto/oauth-shopify-callback.dto';
import {
  ConfigParams,
  RequestedTokenType,
  Shopify,
  ShopifyRestResources,
} from '@shopify/shopify-api';
import { FutureFlags } from '@shopify/shopify-api/dist/ts/future/flags';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Pong!';
  }

  async getAccessToken(
    shopifyQuery: OauthShopifyCallbackDto,
    shopifyClient: Shopify<
      ConfigParams<ShopifyRestResources, FutureFlags>,
      ShopifyRestResources,
      FutureFlags
    >,
  ): Promise<string> {
    const { code, shop } = shopifyQuery;

    if (!shopifyClient) return;

    const { session } = await shopifyClient.auth.tokenExchange({
      shop: shop,
      sessionToken: code,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
    });

    return session.accessToken;
  }
}
