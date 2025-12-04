import * as Joi from 'joi';

export default Joi.object({
  // Core
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(9000),
  
  // Supabase - Required
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_JWKS_URL: Joi.string().uri().required(),
  SUPABASE_JWT_AUD: Joi.string().default('authenticated'),
  
  // Payment Gateway - PayFast
  PAYFAST_MERCHANT_ID: Joi.string().allow(''),
  PAYFAST_MERCHANT_KEY: Joi.string().allow(''),
  PAYFAST_PASSPHRASE: Joi.string().allow(''),
  PAYFAST_SANDBOX: Joi.boolean().default(true),
  
  // Payment Gateway - JazzCash
  JAZZCASH_MERCHANT_ID: Joi.string().allow(''),
  JAZZCASH_PASSWORD: Joi.string().allow(''),
  JAZZCASH_INTEGRITY_SALT: Joi.string().allow(''),
  JAZZCASH_SANDBOX: Joi.boolean().default(true),
  
  // Payment Gateway - Easypaisa
  EASYPAISA_STORE_ID: Joi.string().allow(''),
  EASYPAISA_HASH_KEY: Joi.string().allow(''),
  EASYPAISA_SANDBOX: Joi.boolean().default(true),
  
  // Payment URLs
  PAYMENT_WEBHOOK_SECRET: Joi.string().required(),
  PAYMENT_RETURN_URL: Joi.string().uri().allow(''),
  PAYMENT_CANCEL_URL: Joi.string().uri().allow(''),
  PAYMENT_NOTIFY_URL: Joi.string().uri().allow(''),
  
  // Network Service
  NETWORK_SERVICE_URL: Joi.string().uri().default('http://network-service:9100'),
  NETWORK_SERVICE_API_KEY: Joi.string().required(),
  
  // RADIUS Service
  RADIUS_SERVICE_URL: Joi.string().uri().default('http://radius-service:9200'),
  RADIUS_SHARED_SECRET: Joi.string().allow(''),
  
  // SMS Gateway
  SMS_PROVIDER: Joi.string().valid('clickatell', 'twilio', 'bulksms').default('clickatell'),
  SMS_API_KEY: Joi.string().allow(''),
  SMS_API_URL: Joi.string().uri().allow(''),
  SMS_SENDER_ID: Joi.string().default('NetAxis'),
  
  // Email - SMTP
  EMAIL_PROVIDER: Joi.string().valid('smtp', 'sendgrid').default('smtp'),
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow(''),
  SMTP_PASS: Joi.string().allow(''),
  
  // Email - SendGrid
  SENDGRID_API_KEY: Joi.string().allow(''),
  
  // Email From
  EMAIL_FROM_NAME: Joi.string().default('NetAxis ISP'),
  EMAIL_FROM_ADDRESS: Joi.string().email().default('noreply@netaxis.co.za'),
  
  // Frontend URLs
  FRONTEND_URL: Joi.string().uri().default('https://portal.netaxis.co.za'),
  FRONTEND_LOGIN_URL: Joi.string().uri().allow(''),
  FRONTEND_DASHBOARD_URL: Joi.string().uri().allow(''),
  FRONTEND_PAYMENT_URL: Joi.string().uri().allow(''),
  
  // Monitoring
  PROMETHEUS_URL: Joi.string().uri().default('http://prometheus:9090'),
  GRAFANA_URL: Joi.string().uri().default('http://grafana:3000'),
  LOKI_URL: Joi.string().uri().default('http://loki:3100'),
  
  // Rate Limiting
  RATE_LIMIT_TTL: Joi.number().default(60),
  RATE_LIMIT_MAX: Joi.number().default(100),
});
