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
    phone: '5566996579671',
    email: 'robertobaba2@gmail.com',
    whatsapp: 'https://wa.me/5566996579671',
  },
  MERCADO_PAGO_PUBLIC_KEY: 'APP_USR-e5c56f4f-38de-4133-a073-2fac9c458485',
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
