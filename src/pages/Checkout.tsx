import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus, Minus, ShoppingCart, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ShippingCalculator } from '@/components/ShippingCalculator';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, removeItem, updateQuantity, total, itemCount } = useCart();
  const { toast } = useToast();
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingInfo, setShippingInfo] = useState<{ nome: string; prazoEntrega: number; codigo?: string } | null>(null);

  const handleProsseguir = () => {
    if (!user) {
      navigate('/auth?redirect=/checkout');
      return;
    }
    const params = new URLSearchParams();
    if (shippingInfo) {
      params.set('frete', shippingInfo.nome);
      params.set('frete_valor', shippingCost.toString());
    }
    navigate(`/checkout/entrega${params.toString() ? `?${params.toString()}` : ''}`);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto py-12 text-center">
          <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Seu carrinho está vazio</h1>
          <p className="text-muted-foreground mb-6">Adicione produtos antes de finalizar a compra.</p>
          <Button onClick={() => navigate('/produtos')}>Ver produtos</Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />
      <main className="flex-1 container mx-auto py-8">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <h1 className="text-2xl font-bold mb-6">Finalizar compra</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Produtos */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card rounded-xl border p-4">
              <h2 className="font-semibold mb-3">Produtos ({itemCount})</h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.cartItemKey} className="flex gap-3 items-center">
                    <img
                      src={item.image_url || 'https://placehold.co/80x80?text=?'}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">{item.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={() => updateQuantity(item.cartItemKey, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        onClick={async () => {
                          const { data: stockData } = await supabase
                            .from(item.variationId ? 'product_variations' : 'products')
                            .select('stock')
                            .eq('id', item.variationId || item.id)
                            .single();
                          if (!stockData || stockData.stock < item.quantity + 1) {
                            toast({ title: 'Estoque insuficiente', variant: 'destructive' });
                            return;
                          }
                          updateQuantity(item.cartItemKey, item.quantity + 1);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.cartItemKey)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Resumo */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border p-4 space-y-3 sticky top-20">
              <h2 className="font-semibold">Resumo</h2>

              {/* Calculadora de frete */}
              <ShippingCalculator
                products={items.map((it) => ({ id: it.id, variationId: it.variationId, quantity: it.quantity, price: it.price }))}
                onSelectShipping={(option) => {
                  setShippingCost(option.valor);
                  setShippingInfo({ nome: option.nome, prazoEntrega: option.prazoEntrega, codigo: option.codigo });
                }}
              />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})</span>
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
                  <span className="font-bold text-base">Total</span>
                  <span className="text-xl font-bold text-primary">
                    R$ {(total + shippingCost).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
              <Button className="w-full rounded-full font-bold" size="lg" onClick={handleProsseguir}>
                Prosseguir
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
