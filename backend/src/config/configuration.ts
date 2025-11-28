export default () => ({
  port: Number(process.env.PORT ?? 9000),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwksUrl: process.env.SUPABASE_JWKS_URL ?? '',
    audience: process.env.SUPABASE_JWT_AUD ?? 'authenticated',
  },
  payment: {
    payfast: {
      merchantId: process.env.PAYFAST_MERCHANT_ID ?? '',
      passphrase: process.env.PAYFAST_PASSPHRASE ?? '',
    },
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
  },
  networkService: {
    baseUrl: process.env.NETWORK_SERVICE_URL ?? 'http://network-service:9100',
    apiKey: process.env.NETWORK_SERVICE_API_KEY ?? '',
  },
});
