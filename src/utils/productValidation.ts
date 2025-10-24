import { ProductVariation } from '@/types/product';

/**
 * Validações centralizadas para produtos
 */

export interface ProductFormData {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  images?: File[];
  variations?: ProductVariation[];
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Valida dados do formulário de produto
 */
export function validateProductForm(data: ProductFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Nome obrigatório
  if (!data.name.trim()) {
    errors.push({
      field: 'name',
      message: 'Nome do produto é obrigatório'
    });
  }

  // Descrição é opcional agora
  // Removido validação obrigatória

  // Categoria obrigatória
  if (!data.category) {
    errors.push({
      field: 'category',
      message: 'Categoria é obrigatória'
    });
  }

  // Se não tem variações, preço e estoque são obrigatórios
  if (!data.variations || data.variations.length === 0) {
    // Validar preço
    const priceNum = parseFloat(data.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      errors.push({
        field: 'price',
        message: 'Preço deve ser maior que zero'
      });
    }

    // Validar estoque
    const stockNum = parseInt(data.stock);
    if (isNaN(stockNum) || stockNum < 0) {
      errors.push({
        field: 'stock',
        message: 'Estoque não pode ser negativo'
      });
    }
  }

  // Validar imagens (se fornecidas)
  if (data.images && data.images.length === 0) {
    errors.push({
      field: 'images',
      message: 'Adicione pelo menos uma imagem do produto'
    });
  }

  return errors;
}

/**
 * Valida uma variação individual
 */
export function validateVariation(variation: Partial<ProductVariation>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!variation.name || !variation.name.trim()) {
    errors.push({
      field: 'name',
      message: 'Nome da variação é obrigatório'
    });
  }

  if (!variation.price || variation.price <= 0) {
    errors.push({
      field: 'price',
      message: 'Preço deve ser maior que zero'
    });
  }

  if (variation.stock === undefined || variation.stock < 0) {
    errors.push({
      field: 'stock',
      message: 'Estoque não pode ser negativo'
    });
  }

  return errors;
}

/**
 * Valida quantidade para carrinho
 */
export function validateQuantity(quantity: number, maxQuantity: number): {
  isValid: boolean;
  error?: string;
  adjustedQuantity?: number;
} {
  if (isNaN(quantity) || quantity < 1) {
    return {
      isValid: false,
      error: 'Quantidade mínima é 1',
      adjustedQuantity: 1
    };
  }

  if (quantity > maxQuantity) {
    return {
      isValid: false,
      error: `Quantidade máxima disponível é ${maxQuantity}`,
      adjustedQuantity: maxQuantity
    };
  }

  if (quantity > 100) {
    return {
      isValid: false,
      error: 'Quantidade máxima por item é 100',
      adjustedQuantity: 100
    };
  }

  return { isValid: true };
}

/**
 * Valida comentário de review
 */
export function validateReviewComment(comment: string): {
  isValid: boolean;
  error?: string;
} {
  if (!comment.trim()) {
    return {
      isValid: false,
      error: 'Comentário é obrigatório'
    };
  }

  if (comment.trim().length < 10) {
    return {
      isValid: false,
      error: 'Comentário deve ter pelo menos 10 caracteres'
    };
  }

  if (comment.length > 500) {
    return {
      isValid: false,
      error: 'Comentário não pode ter mais de 500 caracteres'
    };
  }

  return { isValid: true };
}
