/**
 * Helpers para operações comuns de produtos
 */

/**
 * Formata preço para exibição
 */
export function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2)}`;
}

/**
 * Calcula desconto percentual
 */
export function calculateDiscountPercentage(originalPrice: number, salePrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
}

/**
 * Verifica se promoção está ativa
 */
export function isPromotionActive(saleEndsAt?: string): boolean {
  if (!saleEndsAt) return false;
  return new Date(saleEndsAt) > new Date();
}

/**
 * Calcula preço final considerando promoção
 */
export function getFinalPrice(
  basePrice: number,
  onSale: boolean,
  salePrice?: number,
  saleEndsAt?: string
): number {
  if (onSale && salePrice && isPromotionActive(saleEndsAt)) {
    return salePrice;
  }
  return basePrice;
}

/**
 * Verifica se produto está com estoque baixo
 */
export function isLowStock(stock: number, threshold: number = 5): boolean {
  return stock > 0 && stock <= threshold;
}

/**
 * Verifica se produto está esgotado
 */
export function isOutOfStock(stock: number): boolean {
  return stock === 0;
}

/**
 * Formata data de validade de promoção
 */
export function formatPromotionEndDate(saleEndsAt: string): string {
  return new Date(saleEndsAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Gera mensagem de status de estoque
 */
export function getStockStatusMessage(stock: number): {
  message: string;
  type: 'success' | 'warning' | 'error';
} {
  if (isOutOfStock(stock)) {
    return {
      message: 'Produto esgotado',
      type: 'error'
    };
  }
  
  if (isLowStock(stock)) {
    return {
      message: `Apenas ${stock} ${stock === 1 ? 'unidade disponível' : 'unidades disponíveis'}`,
      type: 'warning'
    };
  }
  
  return {
    message: `${stock} unidades disponíveis`,
    type: 'success'
  };
}

/**
 * Calcula preço total com desconto PIX
 */
export function calculatePixPrice(total: number, discountPercent: number = 5): number {
  return total * (1 - discountPercent / 100);
}

/**
 * Valida se nome do arquivo é de imagem
 */
export function isImageFile(fileName: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  return imageExtensions.includes(ext);
}

/**
 * Gera slug a partir do nome do produto
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .trim();
}
