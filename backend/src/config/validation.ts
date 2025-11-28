import * as Joi from 'joi';

export default Joi.object({
  PORT: Joi.number().default(9000),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_JWKS_URL: Joi.string().uri().required(),
  SUPABASE_JWT_AUD: Joi.string().default('authenticated'),
  PAYMENT_WEBHOOK_SECRET: Joi.string().required(),
  PAYFAST_MERCHANT_ID: Joi.string().allow(''),
  PAYFAST_PASSPHRASE: Joi.string().allow(''),
  NETWORK_SERVICE_URL: Joi.string().uri().default('http://network-service:9100'),
  NETWORK_SERVICE_API_KEY: Joi.string().required(),
});
