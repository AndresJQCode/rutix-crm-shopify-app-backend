import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AppService } from './app.service';
import '@shopify/shopify-api/adapters/node';
import {
  shopifyApi,
  ApiVersion,
  ConfigParams,
  Shopify,
  ShopifyRestResources,
  DeliveryMethod,
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

  sessions = new Map<string, { internalCode: string; accessToken: string }>();

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
      callbackPath: `${this.configService.backendUrl}/auth/callback`,
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

    const internalCode = uuidv4();
    this.sessions.set(callbackResponse.session.shop, {
      internalCode,
      accessToken: callbackResponse.session.accessToken,
    });

    const url = this.configService.backendUrl;
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
      session: callbackResponse.session,
    });

    if (!response['ORDERS_CREATE'] || !response['ORDERS_CREATE'][0]?.success) {
      const msg = `Failed to register ORDER_CREATE webhook`;
      console.log(msg);
    }

    res.redirect(
      `${this.configService.dropflowUrl}/registro_usuario?code=${internalCode}&shop_url=${callbackResponse.session.shop}`,
    );
  }

  @Post('exchange-internal-code')
  async oauthShopifyCallback(@Body() body: OauthShopifyCallbackDto) {
    const { shop, code } = body;

    const findAccessTokenByShop = this.sessions.get(shop);

    if (findAccessTokenByShop.internalCode === code) {
      return {
        accessToken: findAccessTokenByShop.accessToken,
      };
    }

    throw new InternalServerErrorException('Error al encontrar la tienda');
  }
}
