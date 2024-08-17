import { ConfigModuleOptions, registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface IConfig {
  backendUrl: string;
  apiKey: string;
  apiSecretKey: string;
  dropflowUrl: string;
}

const configurations = registerAs(
  'configEnvs',
  (): IConfig => ({
    backendUrl: process.env.BACKEND_URL,
    apiKey: process.env.API_KEY,
    apiSecretKey: process.env.API_SECRET_KEY,
    dropflowUrl: process.env.DROPFLOW_URL,
  }),
);

export default configurations;

export function configRoot(): ConfigModuleOptions {
  return {
    load: [configurations],
    isGlobal: true,
    validationSchema: Joi.object({
      BACKEND_URL: Joi.string().required(),
      API_KEY: Joi.string().required(),
      API_SECRET_KEY: Joi.string().required(),
      DROPFLOW_URL: Joi.string().required(),
    }),
  };
}
