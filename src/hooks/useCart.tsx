import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  variationId?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: { id: string; name: string; price: number; image_url: string | null }, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { toast } = useToast();

  // Carregar carrinho do localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setItems(JSON.parse(savedCart));
    }
  }, []);

  // Salvar carrinho no localStorage
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product: { id: string; name: string; price: number; image_url: string | null }, quantity: number = 1) => {
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

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id);
      
      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > 100) {
          toast({
            title: 'Quantidade máxima atingida',
            description: 'Você atingiu a quantidade máxima para este produto',
            variant: 'destructive'
          });
          return currentItems.map((item) =>
            item.id === product.id
              ? { ...item, quantity: 100 }
              : item
          );
        }

        toast({
          title: 'Quantidade atualizada',
          description: `${product.name} - quantidade aumentada`
        });
        return currentItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: newQuantity }
            : item
        );
      }

      toast({
        title: 'Produto adicionado!',
        description: `${product.name} foi adicionado ao carrinho`
      });

      return [...currentItems, { ...product, quantity }];
    });
  };

  const removeItem = (id: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
    toast({
      title: 'Produto removido',
      description: 'Item removido do carrinho'
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(id);
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
          item.id === id ? { ...item, quantity: 100 } : item
        )
      );
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, quantity } : item
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
