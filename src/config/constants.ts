// Configurações centralizadas da aplicação

export const SHIPPING_CONFIG = {
  ORIGIN_CEP: '78556100', // Sinop - MT
  DEFAULT_WEIGHT: 500, // gramas
  DEFAULT_FORMAT: 1, // 1=caixa/pacote, 2=rolo/prisma, 3=envelope
  DEFAULT_DIMENSIONS: {
    length: 30, // cm
    height: 20, // cm
    width: 20, // cm
  },
  SERVICES: {
    SEDEX: '04014',
    PAC: '04510',
  },
} as const;

export const VALIDATION_RULES = {
  CPF_LENGTH: 11,
  CEP_LENGTH: 8,
  PHONE_MIN_LENGTH: 10,
  PHONE_MAX_LENGTH: 11,
  PASSWORD_MIN_LENGTH: 6,
} as const;

export const APP_CONFIG = {
  STORE_NAME: 'JAPAS Pesca',
  CONTACT: {
    phone: '5566992111712',
    email: 'robertobaba2@gmail.com',
    whatsapp: 'https://wa.me/5566992111712',
  },
  MERCADO_PAGO_PUBLIC_KEY: import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? 'APP_USR-e5c56f4f-38de-4133-a073-2fac9c458485',
} as const;

export const ASAAS_CONFIG = {
  ENVIRONMENT: import.meta.env.VITE_ASAAS_ENVIRONMENT ?? 'sandbox',
  // NOTA: ASAAS_API_KEY nunca vai no frontend — apenas nas edge functions
} as const;

export const PAYMENT_CONFIG = {
  PIX_EXPIRATION_MINUTES: 30,
  STOCK_RESERVE_TTL_MINUTES: 30,
  CARD_RETRY_MAX_ATTEMPTS: 3,
  CARD_RETRY_WINDOW_MINUTES: 10,
  PENDING_ORDER_CANCEL_HOURS: 24,
  POLLING_INTERVAL_MS: 5000,
  POLLING_MAX_MINUTES: 15,
  ASAAS_TIMEOUT_MS: 60000,
  MAX_INSTALLMENTS: 10,
  MIN_INSTALLMENT_VALUE: 5,
} as const;

export const PRODUCT_CATEGORIES = [
  'Varas',
  'Molinetes e Carretilhas',
  'Iscas',
  'Anzóis',
  'Linhas',
  'Acessórios',
  'Roupas',
  'Variedades'
] as const;
