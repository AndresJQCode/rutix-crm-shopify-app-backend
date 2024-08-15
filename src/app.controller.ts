import { Controller, Get, Req, Res } from '@nestjs/common';
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

@Controller()
export class AppController {
  shopify: Shopify<
    ConfigParams<ShopifyRestResources, FutureFlags>,
    ShopifyRestResources,
    FutureFlags
  > | null = null;

  sessions = new Map<string, { sessionId: string; accessToken: string }>();

  constructor(private readonly appService: AppService) {
    const shopifyInstance = shopifyApi({
      apiKey: '46559f7f9cec7c5de3ed6918a4aeec6e',
      apiSecretKey: '56e751b8b67622a3fabd1c1c7de697ff',
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
}
