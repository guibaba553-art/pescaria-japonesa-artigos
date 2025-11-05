import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ShoppingCart, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  DollarSign, 
  CreditCard,
  Banknote,
  ArrowLeft,
  Check
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  category: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function PDV() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCPF, setCustomerCPF] = useState('');

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isEmployee, isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .gt('stock', 0)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingProducts(false);
    }
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${product.stock} unidades disponíveis`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }

    toast({
      title: 'Produto adicionado',
      description: `${product.name} adicionado ao carrinho`,
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return item;
        if (newQuantity > item.product.stock) {
          toast({
            title: 'Estoque insuficiente',
            description: `Apenas ${item.product.stock} unidades disponíveis`,
            variant: 'destructive'
          });
          return item;
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  };

  const calculateChange = () => {
    if (paymentMethod !== 'cash') return 0;
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - calculateTotal());
  };

  const finalizeSale = async () => {
    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione produtos antes de finalizar',
        variant: 'destructive'
      });
      return;
    }

    if (paymentMethod === 'cash') {
      const received = parseFloat(cashReceived) || 0;
      if (received < calculateTotal()) {
        toast({
          title: 'Valor insuficiente',
          description: 'O valor recebido é menor que o total',
          variant: 'destructive'
        });
        return;
      }
    }

    setProcessing(true);
    try {
      // Criar pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user!.id,
          total_amount: calculateTotal(),
          shipping_cost: 0,
          status: 'entregado',
          delivery_type: 'pickup',
          shipping_address: 'Venda Presencial',
          shipping_cep: '00000000'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Criar itens do pedido
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        price_at_purchase: item.product.price
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Atualizar estoque
      for (const item of cart) {
        const { error: stockError } = await supabase
          .from('products')
          .update({ 
            stock: item.product.stock - item.quantity 
          })
          .eq('id', item.product.id);

        if (stockError) throw stockError;
      }

      toast({
        title: 'Venda finalizada!',
        description: `Pedido #${order.id.slice(0, 8)} criado com sucesso`,
      });

      // Limpar carrinho
      setCart([]);
      setCashReceived('');
      setCustomerName('');
      setCustomerCPF('');
      loadProducts();

    } catch (error: any) {
      toast({
        title: 'Erro ao finalizar venda',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || loadingProducts) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isEmployee && !isAdmin) {
    return null;
  }

  const total = calculateTotal();
  const change = calculateChange();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <div className="container mx-auto p-6 pt-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-8 h-8" />
            Ponto de Venda (PDV)
          </h1>
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Admin
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Produtos */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produtos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Buscar produto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <ScrollArea className="h-[600px]">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredProducts.map(product => (
                      <Card
                        key={product.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => addToCart(product)}
                      >
                        <CardContent className="p-3 space-y-2">
                          {product.image_url && (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-24 object-cover rounded"
                            />
                          )}
                          <div>
                            <h3 className="font-semibold text-sm line-clamp-2">
                              {product.name}
                            </h3>
                            <Badge variant="outline" className="text-xs mt-1">
                              {product.category}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-primary">
                              R$ {product.price.toFixed(2)}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {product.stock} un
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Carrinho e Pagamento */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Carrinho</span>
                  <Badge variant="secondary">{cart.length} itens</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] mb-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Carrinho vazio</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map(item => (
                        <div key={item.product.id} className="flex items-center gap-2 p-2 border rounded">
                          <div className="flex-1">
                            <p className="font-medium text-sm line-clamp-1">
                              {item.product.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              R$ {item.product.price.toFixed(2)} × {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product.id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product.id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeFromCart(item.product.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="font-bold">
                            R$ {(item.product.price * item.quantity).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                <Separator className="my-4" />

                <div className="space-y-2 text-lg">
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span className="text-2xl text-primary">
                      R$ {total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {cart.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pagamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cliente (opcional)</Label>
                    <Input
                      placeholder="Nome do cliente"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Tabs value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="cash">
                          <Banknote className="w-4 h-4 mr-2" />
                          Dinheiro
                        </TabsTrigger>
                        <TabsTrigger value="card">
                          <CreditCard className="w-4 h-4 mr-2" />
                          Cartão
                        </TabsTrigger>
                        <TabsTrigger value="pix">
                          <DollarSign className="w-4 h-4 mr-2" />
                          PIX
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {paymentMethod === 'cash' && (
                    <>
                      <div className="space-y-2">
                        <Label>Valor Recebido</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={cashReceived}
                          onChange={(e) => setCashReceived(e.target.value)}
                        />
                      </div>
                      {cashReceived && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span>Troco:</span>
                            <span className="font-bold text-lg">
                              R$ {change.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <Button
                    onClick={finalizeSale}
                    disabled={processing}
                    className="w-full"
                    size="lg"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    {processing ? 'Processando...' : 'Finalizar Venda'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
