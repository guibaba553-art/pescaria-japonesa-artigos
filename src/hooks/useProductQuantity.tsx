import { useState } from 'react';

/**
 * Hook customizado para gerenciar quantidades de produtos
 * Permite controlar a quantidade de múltiplos produtos independentemente
 */
export function useProductQuantity() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const getQuantity = (productId: string): number => {
    return quantities[productId] || 1;
  };

  const setQuantity = (productId: string, quantity: number): void => {
    setQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  const incrementQuantity = (productId: string, max: number): void => {
    const current = getQuantity(productId);
    setQuantity(productId, Math.min(max, current + 1));
  };

  const decrementQuantity = (productId: string): void => {
    const current = getQuantity(productId);
    setQuantity(productId, Math.max(1, current - 1));
  };

  const resetQuantity = (productId: string): void => {
    setQuantities(prev => {
      const newQuantities = { ...prev };
      delete newQuantities[productId];
      return newQuantities;
    });
  };

  return {
    getQuantity,
    setQuantity,
    incrementQuantity,
    decrementQuantity,
    resetQuantity
  };
}
