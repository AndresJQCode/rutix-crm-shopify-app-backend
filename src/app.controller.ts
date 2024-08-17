import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { AppService } from './app.service';
import '@shopify/shopify-api/adapters/node';
import {
  shopifyApi,
  ApiVersion,
  ConfigParams,
  Shopify,
  ShopifyRestResources,
  DeliveryMethod,
  RequestedTokenType,
} from '@shopify/shopify-api';
import { FutureFlags } from '@shopify/shopify-api/dist/ts/future/flags';
import { v4 as uuidv4 } from 'uuid';
import { OauthShopifyCallbackDto } from './dto/oauth-shopify-callback.dto';
import configurations from './core/config/configuration';
import { ConfigType } from '@nestjs/config';

@Controller()
export class AppController {
  shopify: Shopify<
    ConfigParams<ShopifyRestResources, FutureFlags>,
    ShopifyRestResources,
    FutureFlags
  > | null = null;

  sessions = new Map<string, { sessionId: string; accessToken: string }>();

  constructor(
    private readonly appService: AppService,
    @Inject(configurations.KEY)
    private readonly configService: ConfigType<typeof configurations>,
  ) {
    const shopifyInstance = shopifyApi({
      apiKey: this.configService.apiKey,
      apiSecretKey: this.configService.apiSecretKey,
      scopes: ['write_products,write_orders'],
      hostName: 'tunnel.lulochat.com',
      apiVersion: ApiVersion.July24,
      isEmbeddedApp: false,
      accessMode: 'offline',
    });
    this.shopify = shopifyInstance;
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('auth')
  async getAuth(@Req() req, @Res() res) {
    // https://tunnel.lulochat.com/auth?shop=test-qcode-2.myshopify.com
    await this.shopify.auth.begin({
      shop: this.shopify.utils.sanitizeShop(req.query.shop, true),
      callbackPath: `/auth/callback`,
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  }

  @Get('/auth/callback')
  async getAuthCallback(@Req() req, @Res() res) {
    // The library will automatically set the appropriate HTTP headers
    const callbackResponse = await this.shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const sessionId = uuidv4();
    this.sessions.set(callbackResponse.session.shop, {
      sessionId,
      accessToken: callbackResponse.session.accessToken,
    });

    // save accessToken in db

    // generate jwt token

    // create webhooks
    // Add handlers for the events you want to subscribe to. You don't need a callback if you're just using `validate`
    this.shopify.webhooks.addHandlers({
      APP_UNINSTALLED: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: '/webhooks',
        callback: async (topic, shop_domain) => console.log(topic, shop_domain),
      },
      ORDERS_CREATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: 'https://bu.com/webhooks',
        },
      ],
    });
    const response = await this.shopify.webhooks.register({
      session: callbackResponse.session,
    });

    if (!response['ORDERS_CREATE'] || !response['ORDERS_CREATE'][0]?.success) {
      const msg = `Failed to register ORDER_CREATE webhook`;
      console.log(msg);
    }

    res.redirect(`http://localhost:3000/sesion=${sessionId}`);
  }

  @Post('/oauth/shopify/callback')
  async oauthShopifyCallback(@Body() body: OauthShopifyCallbackDto) {
    const accessToken = await this.getAccessToken(body);

    return accessToken;
  }

  async getAccessToken(shopifyQuery: OauthShopifyCallbackDto): Promise<string> {
    const { code, shop } = shopifyQuery;

    const shopifyClient = this.shopify;

    if (!shopifyClient) return;

    const { session } = await shopifyClient.auth.tokenExchange({
      shop: shop,
      sessionToken: code,
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
    });

    const url = this.configService.backendUrl;

    this.shopify.webhooks.addHandlers({
      ORDERS_CREATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${url}/webhooks`,
        },
      ],
      ORDERS_UPDATED: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${url}/webhooks`,
        },
      ],
      CHECKOUTS_UPDATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${url}/webhooks`,
        },
      ],
    });
    const response = await this.shopify.webhooks.register({
      session,
    });

    if (!response['ORDERS_CREATE'] || !response['ORDERS_CREATE'][0]?.success) {
      const msg = `Failed to register ORDER_CREATE webhook`;
      console.log(msg);
    }

    if (
      !response['ORDERS_UPDATED'] ||
      !response['ORDERS_UPDATED'][0]?.success
    ) {
      const msg = `Failed to register ORDERS_UPDATED webhook`;
      console.log(msg);
    }

    return session.accessToken;
  }
}
