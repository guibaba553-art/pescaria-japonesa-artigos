import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkout } from '@/components/Checkout';
import { ShippingCalculator } from '@/components/ShippingCalculator';
import { useToast } from '@/hooks/use-toast';

export function Cart() {
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingInfo, setShippingInfo] = useState<{ nome: string; prazoEntrega: number } | null>(null);

  const handleCheckout = () => {
    if (!user) {
      toast({
        title: "Login necessário",
        description: "Você precisa fazer login para finalizar a compra",
        variant: "destructive"
      });
      navigate('/auth');
      return;
    }
    setCheckoutOpen(true);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Carrinho de Compras</SheetTitle>
          <SheetDescription>
            {itemCount === 0
              ? 'Seu carrinho está vazio'
              : `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} no carrinho`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Adicione produtos ao carrinho para começar
              </p>
            </div>
          ) : (
            <>
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 py-4 border-b">
                  <img
                    src={item.image_url || 'https://placehold.co/100x100?text=Sem+Imagem'}
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold">{item.name}</h4>
                    <p className="text-sm text-primary font-bold">
                      R$ {item.price.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 ml-auto text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <Separator className="my-4" />

              <div className="space-y-4">
                <ShippingCalculator 
                  onSelectShipping={(option) => {
                    setShippingCost(option.valor);
                    setShippingInfo({ nome: option.nome, prazoEntrega: option.prazoEntrega });
                  }}
                />

                <Separator className="my-4" />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>R$ {total.toFixed(2)}</span>
                  </div>
                  {shippingInfo && (
                    <div className="flex justify-between text-sm">
                      <span>{shippingInfo.nome}:</span>
                      <span>R$ {shippingCost.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">R$ {(total + shippingCost).toFixed(2)}</span>
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleCheckout}
                  disabled={!shippingInfo}
                >
                  {!shippingInfo ? '⚠️ Escolha uma opção de entrega' : 'Finalizar Compra'}
                </Button>
                {!shippingInfo && (
                  <p className="text-sm text-muted-foreground text-center">
                    Selecione uma opção de entrega acima para continuar
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
      {user && (
        <Checkout 
          open={checkoutOpen} 
          onOpenChange={setCheckoutOpen}
          shippingCost={shippingCost}
          shippingInfo={shippingInfo}
        />
      )}
    </Sheet>
  );
}
