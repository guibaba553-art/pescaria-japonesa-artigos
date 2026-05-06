import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  variationId?: string;
  cartItemKey: string; // Chave única combinando id + variationId
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: { id: string; name: string; price: number; image_url: string | null; variationId?: string }, quantity?: number) => Promise<void>;
  removeItem: (cartItemKey: string) => void;
  updateQuantity: (cartItemKey: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { toast } = useToast();

  // Carregar carrinho do localStorage e VALIDAR contra o banco
  // (remove itens cujo produto/variação não existem mais; atualiza preços que mudaram).
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (!savedCart) return;
    let parsedCart: CartItem[] = [];
    try {
      parsedCart = JSON.parse(savedCart);
    } catch (error) {
      console.error('Error loading cart:', error);
      setItems([]);
      return;
    }

    const migrated = parsedCart.map((item) => ({
      ...item,
      cartItemKey:
        item.cartItemKey ||
        (item.variationId ? `${item.id}-${item.variationId}` : item.id),
    }));
    setItems(migrated);

    (async () => {
      try {
        const { validateSiteCart } = await import('@/utils/siteCartValidation');
        const result = await validateSiteCart(migrated);
        if (result.removeKeys.length > 0) {
          setItems((curr) => curr.filter((i) => !result.removeKeys.includes(i.cartItemKey)));
          toast({
            title: 'Carrinho atualizado',
            description: `${result.removeKeys.length} item(ns) indisponível(eis) foram removidos do seu carrinho.`,
          });
        }
        const priceChanges = result.issues.filter(
          (i) => i.reason === 'price_changed' && i.newPrice != null,
        );
        if (priceChanges.length > 0) {
          setItems((curr) =>
            curr.map((i) => {
              const change = priceChanges.find((p) => p.cartItemKey === i.cartItemKey);
              return change && change.newPrice != null ? { ...i, price: change.newPrice } : i;
            }),
          );
        }
      } catch (e) {
        console.error('Cart validation failed:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salvar carrinho no localStorage
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addItem = async (product: { id: string; name: string; price: number; image_url: string | null; variationId?: string }, quantity: number = 1) => {
    // Validação de quantidade
    if (quantity < 1) {
      toast({
        title: 'Quantidade inválida',
        description: 'A quantidade deve ser pelo menos 1',
        variant: 'destructive'
      });
      return;
    }

    if (quantity > 100) {
      toast({
        title: 'Quantidade muito alta',
        description: 'Quantidade máxima por item é 100',
        variant: 'destructive'
      });
      return;
    }

    // Criar chave única para o item
    const cartItemKey = product.variationId 
      ? `${product.id}-${product.variationId}` 
      : product.id;

    // Verificar estoque atual no banco antes de adicionar
    const existingItem = items.find((item) => item.cartItemKey === cartItemKey);
    const currentInCart = existingItem?.quantity ?? 0;
    const desiredTotal = currentInCart + quantity;

    try {
      const { data: stockData, error } = await supabase
        .from(product.variationId ? 'product_variations' : 'products')
        .select('stock')
        .eq('id', product.variationId || product.id)
        .maybeSingle();

      if (error || !stockData) {
        toast({
          title: 'Erro ao verificar estoque',
          description: 'Tente novamente',
          variant: 'destructive'
        });
        return;
      }

      if (stockData.stock < desiredTotal) {
        const available = stockData.stock - currentInCart;
        toast({
          title: 'Estoque insuficiente',
          description: available > 0
            ? `Apenas ${stockData.stock} unidades em estoque (você já tem ${currentInCart} no carrinho)`
            : `Você já tem o estoque máximo (${stockData.stock}) deste produto no carrinho`,
          variant: 'destructive'
        });
        return;
      }
    } catch (e) {
      toast({
        title: 'Erro ao verificar estoque',
        description: 'Tente novamente',
        variant: 'destructive'
      });
      return;
    }

    setItems((currentItems) => {
      const existing = currentItems.find((item) => item.cartItemKey === cartItemKey);
      
      if (existing) {
        const newQuantity = existing.quantity + quantity;
        if (newQuantity > 100) {
          toast({
            title: 'Quantidade máxima atingida',
            description: 'Você atingiu a quantidade máxima para este produto',
            variant: 'destructive'
          });
          return currentItems.map((item) =>
            item.cartItemKey === cartItemKey
              ? { ...item, quantity: 100 }
              : item
          );
        }

        toast({
          title: 'Quantidade atualizada',
          description: `${product.name} - quantidade aumentada`
        });
        return currentItems.map((item) =>
          item.cartItemKey === cartItemKey
            ? { ...item, quantity: newQuantity }
            : item
        );
      }

      toast({
        title: 'Produto adicionado!',
        description: `${product.name} foi adicionado ao carrinho`
      });

      return [...currentItems, { ...product, quantity, cartItemKey }];
    });
  };

  const removeItem = (cartItemKey: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.cartItemKey !== cartItemKey));
    toast({
      title: 'Produto removido',
      description: 'Item removido do carrinho'
    });
  };

  const updateQuantity = (cartItemKey: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(cartItemKey);
      return;
    }

    // Validação de quantidade máxima
    if (quantity > 100) {
      toast({
        title: 'Quantidade máxima',
        description: 'Quantidade máxima por item é 100',
        variant: 'destructive'
      });
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.cartItemKey === cartItemKey ? { ...item, quantity: 100 } : item
        )
      );
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.cartItemKey === cartItemKey ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    toast({
      title: 'Carrinho limpo',
      description: 'Todos os itens foram removidos'
    });
  };

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        total,
        itemCount
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
