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
  Check,
  Package
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock: number;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  category: string;
  sku?: string | null;
  minimum_quantity?: number;
  variations?: ProductVariation[];
}

interface CartItem {
  product: Product;
  quantity: number;
  variation?: ProductVariation;
  cartItemKey: string;
}

export default function PDV() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCPF, setCustomerCPF] = useState('');
  
  // Variações
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showVariationsDialog, setShowVariationsDialog] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          variations:product_variations(*)
        `)
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

  const handleProductClick = (product: Product) => {
    // Se tem variações, mostrar diálogo de seleção
    if (product.variations && product.variations.length > 0) {
      setSelectedProduct(product);
      setShowVariationsDialog(true);
    } else {
      addToCart(product, undefined);
    }
  };

  const addToCart = (product: Product, variation?: ProductVariation) => {
    const cartItemKey = variation 
      ? `${product.id}-${variation.id}`
      : product.id;
    
    const existingItem = cart.find(item => item.cartItemKey === cartItemKey);
    const minimumQty = product.minimum_quantity || 1;
    const availableStock = variation ? variation.stock : product.stock;
    const itemPrice = variation ? variation.price : product.price;
    
    if (existingItem) {
      if (existingItem.quantity >= availableStock) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${availableStock} unidades disponíveis`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart(cart.map(item =>
        item.cartItemKey === cartItemKey
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      if (availableStock < minimumQty) {
        toast({
          title: 'Estoque insuficiente',
          description: `Este produto requer no mínimo ${minimumQty} unidades, mas há apenas ${availableStock} em estoque`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart([...cart, { 
        product, 
        quantity: minimumQty, 
        variation,
        cartItemKey 
      }]);
      
      const itemName = variation ? `${product.name} - ${variation.name}` : product.name;
      
      if (minimumQty > 1) {
        toast({
          title: 'Produto adicionado',
          description: `${itemName} adicionado ao carrinho (quantidade mínima: ${minimumQty})`,
        });
      } else {
        toast({
          title: 'Produto adicionado',
          description: `${itemName} adicionado ao carrinho`,
        });
      }
      return;
    }

    const itemName = variation ? `${product.name} - ${variation.name}` : product.name;
    toast({
      title: 'Produto adicionado',
      description: `${itemName} adicionado ao carrinho`,
    });
  };

  const handleBarcodeSearch = async (barcode: string) => {
    if (!barcode.trim()) return;

    try {
      console.log('🔍 Buscando por código:', barcode.trim());
      
      // Primeiro buscar variação por SKU
      const { data: variation, error: varError } = await supabase
        .from('product_variations')
        .select('*, product:products(*)')
        .eq('sku', barcode.trim())
        .gt('stock', 0)
        .maybeSingle();

      if (varError) throw varError;

      if (variation) {
        console.log('✅ Variação encontrada:', variation.name);
        const product = variation.product as unknown as Product;
        
        // Carregar todas as variações do produto
        const { data: allVariations } = await supabase
          .from('product_variations')
          .select('*')
          .eq('product_id', product.id);
        
        product.variations = allVariations || [];
        
        addToCart(product, variation);
        setBarcodeInput('');
        
        // Som de "beep" para feedback
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZRQ0PVa7m77BfGAg+luLxwW0iBC5+y/LZhS8GHGu77OuYSg0MUqzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw==');
        audio.play().catch(() => {});
        return;
      }

      // Se não encontrou variação, buscar produto principal por SKU
      const { data: product, error: prodError } = await supabase
        .from('products')
        .select(`
          *,
          variations:product_variations(*)
        `)
        .eq('sku', barcode.trim())
        .gt('stock', 0)
        .maybeSingle();

      if (prodError) throw prodError;

      if (product) {
        console.log('✅ Produto encontrado:', product.name);
        addToCart(product, undefined);
        setBarcodeInput('');
        
        // Som de "beep" para feedback
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZRQ0PVa7m77BfGAg+luLxwW0iBC5+y/LZhS8GHGu77OuYSg0MUqzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw==');
        audio.play().catch(() => {});
      } else {
        console.log('❌ Nenhum produto ou variação encontrado');
        toast({
          title: 'Produto não encontrado',
          description: `Código de barras: ${barcode}`,
          variant: 'destructive'
        });
        setBarcodeInput('');
      }
    } catch (error: any) {
      console.error('❌ Erro ao buscar:', error);
      toast({
        title: 'Erro ao buscar produto',
        description: error.message,
        variant: 'destructive'
      });
      setBarcodeInput('');
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSearch(barcodeInput);
    }
  };

  const removeFromCart = (cartItemKey: string) => {
    setCart(cart.filter(item => item.cartItemKey !== cartItemKey));
  };

  const updateQuantity = (cartItemKey: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.cartItemKey === cartItemKey) {
        const newQuantity = item.quantity + delta;
        const minimumQty = item.product.minimum_quantity || 1;
        const availableStock = item.variation ? item.variation.stock : item.product.stock;
        
        if (newQuantity < minimumQty) {
          toast({
            title: 'Quantidade mínima',
            description: `Este produto requer no mínimo ${minimumQty} unidades`,
            variant: 'destructive'
          });
          return item;
        }
        
        if (newQuantity > availableStock) {
          toast({
            title: 'Estoque insuficiente',
            description: `Apenas ${availableStock} unidades disponíveis`,
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
    return cart.reduce((sum, item) => {
      const itemPrice = item.variation ? item.variation.price : item.product.price;
      return sum + (itemPrice * item.quantity);
    }, 0);
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
        product_id: item.variation ? item.variation.id : item.product.id,
        quantity: item.quantity,
        price_at_purchase: item.variation ? item.variation.price : item.product.price
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Atualizar estoque
      for (const item of cart) {
        if (item.variation) {
          // Atualizar estoque da variação
          const { error: stockError } = await supabase
            .from('product_variations')
            .update({ 
              stock: item.variation.stock - item.quantity 
            })
            .eq('id', item.variation.id);

          if (stockError) throw stockError;
        } else {
          // Atualizar estoque do produto
          const { error: stockError } = await supabase
            .from('products')
            .update({ 
              stock: item.product.stock - item.quantity 
            })
            .eq('id', item.product.id);

          if (stockError) throw stockError;
        }
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

  if (!isAdmin) {
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
                {/* Campo para Leitor de Código de Barras */}
                <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
                  <Label htmlFor="barcode" className="text-sm font-semibold mb-2 block">
                    Leitor de Código de Barras
                  </Label>
                  <div className="relative">
                    <Input
                      id="barcode"
                      placeholder="Escaneie ou digite o código de barras..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={handleBarcodeKeyPress}
                      className="text-lg font-mono"
                      autoFocus
                    />
                    <Badge 
                      variant="secondary" 
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      Pressione Enter
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Dica: Mantenha o cursor neste campo para usar o leitor de código de barras
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Buscar produto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <ScrollArea className="h-[520px]">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredProducts.map(product => (
                      <Card
                        key={product.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow relative"
                        onClick={() => handleProductClick(product)}
                      >
                        {product.variations && product.variations.length > 0 && (
                          <Badge 
                            variant="secondary" 
                            className="absolute top-2 right-2 z-10"
                          >
                            <Package className="w-3 h-3 mr-1" />
                            {product.variations.length}
                          </Badge>
                        )}
                        <CardContent className="p-3 space-y-2">
                          {product.image_url && (
                            <div className="w-full h-32 flex items-center justify-center bg-muted rounded overflow-hidden">
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-sm line-clamp-2">
                              {product.name}
                            </h3>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {product.category}
                              </Badge>
                              {product.minimum_quantity && product.minimum_quantity > 1 && (
                                <Badge variant="default" className="text-xs">
                                  Min: {product.minimum_quantity}
                                </Badge>
                              )}
                            </div>
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
                      {cart.map(item => {
                        const itemPrice = item.variation ? item.variation.price : item.product.price;
                        const itemName = item.variation 
                          ? `${item.product.name} - ${item.variation.name}` 
                          : item.product.name;
                        
                        return (
                          <div key={item.cartItemKey} className="flex items-center gap-2 p-2 border rounded">
                            <div className="flex-1">
                              <p className="font-medium text-sm line-clamp-1">
                                {itemName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                R$ {itemPrice.toFixed(2)} × {item.quantity}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateQuantity(item.cartItemKey, -1)}
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
                                onClick={() => updateQuantity(item.cartItemKey, 1)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeFromCart(item.cartItemKey)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="font-bold">
                            R$ {(itemPrice * item.quantity).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
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
      
      {/* Diálogo de seleção de variações */}
      <Dialog open={showVariationsDialog} onOpenChange={setShowVariationsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione a Variação</DialogTitle>
            <DialogDescription>
              Escolha uma variação de {selectedProduct?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedProduct?.variations?.map((variation) => (
              <Card
                key={variation.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => {
                  addToCart(selectedProduct, variation);
                  setShowVariationsDialog(false);
                }}
              >
                <CardContent className="p-4 space-y-3">
                  {variation.image_url && (
                    <img
                      src={variation.image_url}
                      alt={variation.name}
                      className="w-full h-32 object-cover rounded"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold">{variation.name}</h3>
                    {variation.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {variation.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      R$ {variation.price.toFixed(2)}
                    </span>
                    <Badge variant={variation.stock > 5 ? "secondary" : "destructive"} className="text-xs">
                      {variation.stock} un
                    </Badge>
                  </div>
                  {variation.sku && (
                    <p className="text-xs text-muted-foreground font-mono">
                      SKU: {variation.sku}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
