import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
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
import { ShippingCalculator } from '@/components/ShippingCalculator';
import { useToast } from '@/hooks/use-toast';

// Checkout só é carregado quando o usuário clica em "Finalizar compra"
// — evita baixar o SDK do Mercado Pago no carregamento inicial.
const Checkout = lazy(() =>
  import('@/components/Checkout').then((m) => ({ default: m.Checkout }))
);

interface CartProps {
  /** Quando fornecido, o Sheet é controlado externamente e o trigger interno é omitido. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Oculta o botão trigger padrão (útil quando o Sheet é aberto a partir de outro lugar). */
  hideTrigger?: boolean;
}

export function Cart({ open, onOpenChange, hideTrigger }: CartProps = {}) {
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

  const installment = total / 10;

  const isControlled = open !== undefined;

  return (
    <Sheet {...(isControlled ? { open, onOpenChange } : {})}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="relative rounded-full">
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <Badge
                className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center p-0 text-[10px] font-black bg-primary text-primary-foreground border-2 border-background"
              >
                {itemCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border bg-muted/30">
          <SheetTitle className="text-xl font-display font-black flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            Seu carrinho
          </SheetTitle>
          <SheetDescription className="text-xs">
            {itemCount === 0
              ? 'Seu carrinho está vazio'
              : `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Seu carrinho está vazio
              </p>
              <p className="text-xs text-muted-foreground">
                Adicione produtos para aproveitar as ofertas
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.cartItemKey} className="flex gap-3 p-3 rounded-xl bg-card border border-border">
                  <img
                    src={item.image_url || 'https://placehold.co/100x100?text=?'}
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded-lg shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold leading-tight line-clamp-2 mb-1">{item.name}</h4>
                    <p className="text-base font-display font-black text-primary leading-none">
                      R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={() => updateQuantity(item.cartItemKey, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-7 text-center text-sm font-bold">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={async () => {
                          try {
                            const { data: stockData } = await supabase
                              .from(item.variationId ? 'product_variations' : 'products')
                              .select('stock')
                              .eq('id', item.variationId || item.id)
                              .single();

                            if (!stockData || stockData.stock < item.quantity + 1) {
                              toast({
                                title: 'Estoque insuficiente',
                                description: `Apenas ${stockData?.stock || 0} unidades disponíveis`,
                                variant: 'destructive'
                              });
                              return;
                            }

                            updateQuantity(item.cartItemKey, item.quantity + 1);
                          } catch (error) {
                            toast({
                              title: 'Erro ao verificar estoque',
                              description: 'Tente novamente',
                              variant: 'destructive'
                            });
                          }
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.cartItemKey)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-3">
                <ShippingCalculator
                  products={items.map((it) => ({ id: it.id, quantity: it.quantity }))}
                  onSelectShipping={(option) => {
                    setShippingCost(option.valor);
                    setShippingInfo({ nome: option.nome, prazoEntrega: option.prazoEntrega });
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sticky bottom: total + CTA */}
        {items.length > 0 && (
          <div className="border-t border-border bg-background p-5 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
              {shippingInfo && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{shippingInfo.nome}</span>
                  <span>R$ {shippingCost.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-baseline">
                <span className="font-bold">Total</span>
                <span className="text-2xl font-display font-black text-primary tracking-tight">
                  R$ {(total + shippingCost).toFixed(2).replace('.', ',')}
                </span>
              </div>
              {total >= 50 && (
                <p className="text-xs text-muted-foreground text-right">
                  ou <strong className="text-foreground">10x de R$ {((total + shippingCost) / 10).toFixed(2).replace('.', ',')}</strong> sem juros
                </p>
              )}
            </div>

            <Button
              className="w-full h-12 rounded-full font-black text-base btn-press"
              onClick={handleCheckout}
              disabled={!shippingInfo}
            >
              {!shippingInfo ? 'Escolha o frete acima' : 'Finalizar compra'}
            </Button>
          </div>
        )}
      </SheetContent>
      {user && checkoutOpen && (
        <Suspense fallback={null}>
          <Checkout
            open={checkoutOpen}
            onOpenChange={setCheckoutOpen}
            shippingCost={shippingCost}
            shippingInfo={shippingInfo}
          />
        </Suspense>
      )}
    </Sheet>
  );
}
