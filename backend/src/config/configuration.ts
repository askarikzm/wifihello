export default () => ({
  port: Number(process.env.PORT ?? 9000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwksUrl: process.env.SUPABASE_JWKS_URL ?? '',
    audience: process.env.SUPABASE_JWT_AUD ?? 'authenticated',
  },
  
  // Payment Gateway Configuration
  payment: {
    payfast: {
      merchantId: process.env.PAYFAST_MERCHANT_ID ?? '',
      merchantKey: process.env.PAYFAST_MERCHANT_KEY ?? '',
      passphrase: process.env.PAYFAST_PASSPHRASE ?? '',
      sandbox: process.env.PAYFAST_SANDBOX === 'true',
    },
    jazzcash: {
      merchantId: process.env.JAZZCASH_MERCHANT_ID ?? '',
      password: process.env.JAZZCASH_PASSWORD ?? '',
      integritySalt: process.env.JAZZCASH_INTEGRITY_SALT ?? '',
      sandbox: process.env.JAZZCASH_SANDBOX === 'true',
    },
    easypaisa: {
      storeId: process.env.EASYPAISA_STORE_ID ?? '',
      hashKey: process.env.EASYPAISA_HASH_KEY ?? '',
      sandbox: process.env.EASYPAISA_SANDBOX === 'true',
    },
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
    returnUrl: process.env.PAYMENT_RETURN_URL ?? 'https://portal.netaxis.co.za/payments/callback',
    cancelUrl: process.env.PAYMENT_CANCEL_URL ?? 'https://portal.netaxis.co.za/payments/cancelled',
    notifyUrl: process.env.PAYMENT_NOTIFY_URL ?? 'https://api.netaxis.co.za/api/payments/webhook',
  },
  
  // Network/OLT Service Configuration
  networkService: {
    baseUrl: process.env.NETWORK_SERVICE_URL ?? 'http://network-service:9100',
    apiKey: process.env.NETWORK_SERVICE_API_KEY ?? '',
  },
  
  // RADIUS Service Configuration
  radius: {
    baseUrl: process.env.RADIUS_SERVICE_URL ?? 'http://radius-service:9200',
    sharedSecret: process.env.RADIUS_SHARED_SECRET ?? '',
  },
  
  // SMS Gateway Configuration
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'clickatell', // clickatell, twilio, bulksms
    apiKey: process.env.SMS_API_KEY ?? '',
    apiUrl: process.env.SMS_API_URL ?? '',
    senderId: process.env.SMS_SENDER_ID ?? 'NetAxis',
  },
  
  // Email Configuration
  email: {
    provider: process.env.EMAIL_PROVIDER ?? 'smtp', // smtp, sendgrid
    smtp: {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY ?? '',
    },
    from: {
      name: process.env.EMAIL_FROM_NAME ?? 'NetAxis ISP',
      address: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@netaxis.co.za',
    },
  },
  
  // Frontend URLs for email templates
  frontend: {
    baseUrl: process.env.FRONTEND_URL ?? 'https://portal.netaxis.co.za',
    loginUrl: process.env.FRONTEND_LOGIN_URL ?? 'https://portal.netaxis.co.za/login',
    dashboardUrl: process.env.FRONTEND_DASHBOARD_URL ?? 'https://portal.netaxis.co.za/dashboard',
    paymentUrl: process.env.FRONTEND_PAYMENT_URL ?? 'https://portal.netaxis.co.za/payments',
  },
  
  // Monitoring & Alerting
  monitoring: {
    prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus:9090',
    grafanaUrl: process.env.GRAFANA_URL ?? 'http://grafana:3000',
    lokiUrl: process.env.LOKI_URL ?? 'http://loki:3100',
  },
  
  // Rate Limiting
  rateLimit: {
    ttl: Number(process.env.RATE_LIMIT_TTL ?? 60),
    limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
  },

  // NADRA Verisys KYC Configuration (Optional Module)
  verisys: {
    baseUrl: process.env.VERISYS_BASE_URL ?? '',
    clientId: process.env.VERISYS_CLIENT_ID ?? '',
    clientSecret: process.env.VERISYS_CLIENT_SECRET ?? '',
    timeoutMs: Number(process.env.VERISYS_TIMEOUT_MS ?? 10000),
    verifyEndpoint: process.env.VERISYS_VERIFY_ENDPOINT ?? '/cnic/verify',
    maxRetries: Number(process.env.VERISYS_MAX_RETRIES ?? 2),
    retryDelayMs: Number(process.env.VERISYS_RETRY_DELAY_MS ?? 1000),
    maxAttemptsPerDay: Number(process.env.VERISYS_MAX_ATTEMPTS_PER_DAY ?? 3),
    kycExpiryDays: Number(process.env.KYC_EXPIRY_DAYS ?? 365),
  },
  
  // Feature Flags
  features: {
    kycRequiredForActivation: process.env.KYC_REQUIRED_FOR_ACTIVATION === 'true',
    verisysEnabled: !!process.env.VERISYS_BASE_URL,
  },
});
