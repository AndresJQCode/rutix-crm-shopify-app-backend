import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  Headers,
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
import verifyWebhook from './utilities/verify-webhook';
import Session from './models/session.type';
import axios from 'axios';

@Controller()
export class AppController {
  shopify: Shopify<
    ConfigParams<ShopifyRestResources, FutureFlags>,
    ShopifyRestResources,
    FutureFlags
  > | null = null;

  sessions = new Map<string, Session>();

  constructor(
    private readonly appService: AppService,
    @Inject(configurations.KEY)
    private readonly configService: ConfigType<typeof configurations>,
  ) {
    const shopifyInstance = shopifyApi({
      apiKey: this.configService.apiKey,
      apiSecretKey: this.configService.apiSecretKey,
      scopes: ['write_products,write_orders'],
      hostName: this.configService.backendUrl,
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

    const internalCode = uuidv4();
    this.sessions.set(callbackResponse.session.shop, {
      internalCode,
      accessToken: callbackResponse.session.accessToken,
    });

    const url = `https://${this.configService.backendUrl}`;
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
      DRAFT_ORDERS_CREATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${url}/webhooks`,
        },
      ],
    });
    const responseCreate = await this.shopify.webhooks.register({
      session: callbackResponse.session,
    });

    console.log('responseCreate', responseCreate);

    if (!responseCreate?.['ORDERS_CREATE']?.[0]?.success) {
      const msg = `Failed to register ORDER_CREATE webhook`;
      console.log(msg);
    }

    res.redirect(
      `${this.configService.dropflowUrl}/inicio_de_sesion?code=${internalCode}&shop_url=${callbackResponse.session.shop}`,
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

    throw new BadRequestException('Código inválido');
  }

  @Post('webhooks')
  async webhooks(
    @Body() body,
    @Headers('x-shopify-topic') topic,
    @Headers('x-shopify-shop-domain') shopDomain,
    @Headers('X-Shopify-Hmac-SHA256') hmac,
    @Headers('X-Shopify-Webhook-Id') webhookId,
    @Headers('X-Shopify-Api-Version') apiVersion,
  ) {
    console.log('-----------------');
    console.log('shop', shopDomain);
    console.log('hmac', hmac);
    console.log('webhookId', webhookId);
    console.log('apiVersion', apiVersion);
    console.log('topic', topic);

    // rawBody is the raw request body string
    const rawBody = JSON.stringify(body);
    console.log('rawBody', rawBody);

    const isValidSign = verifyWebhook(
      hmac,
      rawBody,
      this.configService.apiSecretKey,
    );
    console.log('isValidSign', isValidSign);

    if (!isValidSign) {
      console.log('Invalid sign');
      return;
    }

    if (topic === 'orders/create' || topic === 'orders/update') {
      try {
        const responseOrderCreated = await axios.post(
          'http://api.dropxflow.com/shopify/orders/create',
          {
            shopDomain,
            webhookId,
            order: body,
          },
        );
        console.log('responseOrderCreated', responseOrderCreated.data);
      } catch (error) {
        console.log('error', error);
      }
    }

    if (topic === 'draft_orders/create') {
      try {
        const responseCheckoutUpdate = await axios.post(
          'http://api.dropxflow.com/shopify/orders/abandoned/create',
          {
            shopDomain,
            webhookId,
            checkout: body,
          },
        );
        console.log('responseCheckoutUpdate', responseCheckoutUpdate.data);
      } catch (error) {
        console.log('error', error);
      }
    }
    console.log(body);
    return;
  }
}
