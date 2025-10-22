// Configurações centralizadas da aplicação

export const SHIPPING_CONFIG = {
  ORIGIN_CEP: '78550970', // Sinop - MT
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
  STORE_NAME: 'JAPA Pesca',
  CONTACT: {
    phone: '5566996579671',
    email: 'contato@japapesca.com.br',
    whatsapp: 'https://wa.me/5566996579671',
  },
} as const;

export const PRODUCT_CATEGORIES = [
  'Varas',
  'Molinetes',
  'Iscas Artificiais',
  'Iscas Naturais',
  'Anzóis',
  'Linhas',
  'Carretilhas',
  'Acessórios',
  'Roupas',
  'Equipamentos de Segurança'
] as const;
