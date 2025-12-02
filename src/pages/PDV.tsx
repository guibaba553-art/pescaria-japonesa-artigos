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
  Package,
  User,
  Save,
  FolderOpen,
  History
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  sold_by_weight?: boolean;
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'debit' | 'credit' | 'pix'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCPF, setCustomerCPF] = useState('');
  const [installments, setInstallments] = useState(1);
  
  // Variações
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showVariationsDialog, setShowVariationsDialog] = useState(false);
  
  // Peso
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('g'); // Padrão em gramas
  
  // Cliente
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    full_name: '',
    cpf: '',
    cep: '',
    street: '',
    number: '',
    neighborhood: ''
  });
  
  // Vendas salvas
  const [showSavedSalesDialog, setShowSavedSalesDialog] = useState(false);
  const [savedSales, setSavedSales] = useState<any[]>([]);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadSavedSales();
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

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadSavedSales = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedSales(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar vendas salvas:', error);
    }
  };

  const saveSale = async () => {
    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione produtos antes de salvar',
        variant: 'destructive'
      });
      return;
    }

    try {
      const saleData = {
        user_id: user!.id,
        cart_data: JSON.parse(JSON.stringify(cart)),
        customer_data: JSON.parse(JSON.stringify(selectedCustomer)),
        payment_method: paymentMethod,
        total_amount: calculateTotal(),
        notes: ''
      };

      if (currentSaleId) {
        // Atualizar venda existente
        const { error } = await supabase
          .from('saved_sales')
          .update(saleData)
          .eq('id', currentSaleId);

        if (error) throw error;

        toast({
          title: 'Venda atualizada!',
          description: 'A venda foi atualizada com sucesso'
        });
      } else {
        // Criar nova venda salva
        const { data, error } = await supabase
          .from('saved_sales')
          .insert([saleData])
          .select()
          .single();

        if (error) throw error;

        setCurrentSaleId(data.id);
        toast({
          title: 'Venda salva!',
          description: 'Você pode retomar esta venda depois'
        });
      }

      loadSavedSales();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar venda',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const loadSale = (sale: any) => {
    setCart(sale.cart_data);
    setSelectedCustomer(sale.customer_data);
    setPaymentMethod(sale.payment_method || 'cash');
    setCurrentSaleId(sale.id);
    setShowSavedSalesDialog(false);
    
    toast({
      title: 'Venda carregada!',
      description: `Total: R$ ${sale.total_amount.toFixed(2)}`
    });
  };

  const deleteSavedSale = async (saleId: string) => {
    try {
      const { error } = await supabase
        .from('saved_sales')
        .delete()
        .eq('id', saleId);

      if (error) throw error;

      loadSavedSales();
      
      if (currentSaleId === saleId) {
        setCurrentSaleId(null);
      }

      toast({
        title: 'Venda excluída',
        description: 'A venda salva foi removida'
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir venda',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const clearSale = () => {
    setCart([]);
    setCashReceived('');
    setSelectedCustomer(null);
    setPaymentMethod('cash');
    setInstallments(1);
    setCurrentSaleId(null);
  };

  const handleProductClick = (product: Product) => {
    // Se tem variações, mostrar diálogo de seleção
    if (product.variations && product.variations.length > 0) {
      setSelectedProduct(product);
      setShowVariationsDialog(true);
    } else if (product.sold_by_weight) {
      // Se é vendido por peso, mostrar diálogo de entrada de peso
      setSelectedProduct(product);
      setWeightInput('');
      setShowWeightDialog(true);
    } else {
      addToCart(product, undefined, 1);
    }
  };

  const addToCart = (product: Product, variation?: ProductVariation, quantity: number = 1) => {
    const cartItemKey = variation 
      ? `${product.id}-${variation.id}`
      : product.id;
    
    const existingItem = cart.find(item => item.cartItemKey === cartItemKey);
    const minimumQty = product.sold_by_weight ? 0.001 : (product.minimum_quantity || 1);
    const availableStock = variation ? variation.stock : product.stock;
    const itemPrice = variation ? variation.price : product.price;
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      
      if (newQuantity > availableStock) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${availableStock} ${product.sold_by_weight ? 'kg' : 'unidades'} disponíveis`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart(cart.map(item =>
        item.cartItemKey === cartItemKey
          ? { ...item, quantity: newQuantity }
          : item
      ));
    } else {
      if (quantity < minimumQty) {
        toast({
          title: 'Quantidade inválida',
          description: `Quantidade mínima: ${minimumQty} ${product.sold_by_weight ? 'kg' : 'unidades'}`,
          variant: 'destructive'
        });
        return;
      }
      
      if (quantity > availableStock) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${availableStock} ${product.sold_by_weight ? 'kg' : 'unidades'} disponíveis`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart([...cart, { 
        product, 
        quantity, 
        variation,
        cartItemKey 
      }]);
      
      const itemName = variation ? `${product.name} - ${variation.name}` : product.name;
      const unit = product.sold_by_weight ? 'kg' : (quantity > 1 ? 'unidades' : 'unidade');
      
      toast({
        title: 'Produto adicionado',
        description: `${itemName} - ${quantity} ${unit}`,
      });
      return;
    }

    const itemName = variation ? `${product.name} - ${variation.name}` : product.name;
    toast({
      title: 'Produto adicionado',
      description: `${itemName} adicionado ao carrinho`,
    });
  };

  const handleWeightSubmit = () => {
    if (!selectedProduct) return;
    
    const inputValue = parseFloat(weightInput.replace(',', '.'));
    
    if (isNaN(inputValue) || inputValue <= 0) {
      toast({
        title: 'Peso inválido',
        description: 'Digite um peso válido',
        variant: 'destructive'
      });
      return;
    }
    
    // Converter para kg se entrada foi em gramas
    const weightInKg = weightUnit === 'g' ? inputValue / 1000 : inputValue;
    
    addToCart(selectedProduct, undefined, weightInKg);
    setShowWeightDialog(false);
    setWeightInput('');
    setSelectedProduct(null);
  };

  // Função auxiliar para calcular peso em kg baseado na unidade
  const getWeightInKg = () => {
    const inputValue = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(inputValue) || inputValue <= 0) return 0;
    return weightUnit === 'g' ? inputValue / 1000 : inputValue;
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
        
        if (product.sold_by_weight) {
          setSelectedProduct(product);
          setWeightInput('');
          setShowWeightDialog(true);
          setBarcodeInput('');
        } else {
          addToCart(product, variation, 1);
          setBarcodeInput('');
        }
        
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
        if (product.sold_by_weight) {
          setSelectedProduct(product);
          setWeightInput('');
          setShowWeightDialog(true);
          setBarcodeInput('');
        } else {
          addToCart(product, undefined, 1);
          setBarcodeInput('');
        }
        
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
        const isByWeight = item.product.sold_by_weight;
        const increment = isByWeight ? 0.1 : 1; // 100g para produtos por peso
        const newQuantity = Math.max(0, item.quantity + (delta * increment));
        const minimumQty = isByWeight ? 0.001 : (item.product.minimum_quantity || 1);
        const availableStock = item.variation ? item.variation.stock : item.product.stock;
        const unit = isByWeight ? 'kg' : 'unidades';
        
        if (newQuantity < minimumQty) {
          toast({
            title: 'Quantidade mínima',
            description: `Este produto requer no mínimo ${minimumQty} ${unit}`,
            variant: 'destructive'
          });
          return item;
        }
        
        if (newQuantity > availableStock) {
          toast({
            title: 'Estoque insuficiente',
            description: `Apenas ${availableStock} ${unit} disponíveis`,
            variant: 'destructive'
          });
          return item;
        }
        return { ...item, quantity: parseFloat(newQuantity.toFixed(3)) };
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

  const handleSaveCustomer = async () => {
    // Validar campos
    if (!customerForm.full_name.trim() || !customerForm.cpf.trim() || 
        !customerForm.cep.trim() || !customerForm.street.trim() || 
        !customerForm.number.trim() || !customerForm.neighborhood.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos do cliente',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          ...customerForm,
          created_by: user!.id
        }])
        .select()
        .single();

      if (error) throw error;

      setSelectedCustomer(data);
      setShowCustomerDialog(false);
      setCustomerForm({
        full_name: '',
        cpf: '',
        cep: '',
        street: '',
        number: '',
        neighborhood: ''
      });

      toast({
        title: 'Cliente cadastrado!',
        description: `${data.full_name} foi adicionado com sucesso`
      });
      
      // Recarregar lista de clientes
      loadCustomers();
    } catch (error: any) {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleConsumidorFinal = () => {
    setSelectedCustomer(null);
    toast({
      title: 'Consumidor Final',
      description: 'Venda sem cadastro de cliente'
    });
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
          shipping_address: selectedCustomer ? `${selectedCustomer.street}, ${selectedCustomer.number} - ${selectedCustomer.neighborhood}` : 'Venda Presencial',
          shipping_cep: selectedCustomer ? selectedCustomer.cep : '00000000',
          customer_id: selectedCustomer?.id || null
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

      // Se a venda estava salva, deletar da lista de rascunhos
      if (currentSaleId) {
        await supabase
          .from('saved_sales')
          .delete()
          .eq('id', currentSaleId);
        loadSavedSales();
      }

      // Limpar carrinho
      clearSale();
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
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/pdv/sales-history')}
            >
              <History className="w-4 h-4 mr-2" />
              Histórico
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Admin
            </Button>
          </div>
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
                            <div className="w-full h-60 bg-muted rounded overflow-hidden">
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
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
                              {product.sold_by_weight && (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  Por kg
                                </Badge>
                              )}
                              {product.minimum_quantity && product.minimum_quantity > 1 && (
                                <Badge variant="default" className="text-xs">
                                  Min: {product.minimum_quantity}
                                </Badge>
                              )}
                            </div>
                          </div>
                           <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-primary">
                              R$ {product.price.toFixed(2)}{product.sold_by_weight && '/kg'}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {product.stock} {product.sold_by_weight ? 'kg' : 'un'}
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
                                R$ {itemPrice.toFixed(2)} × {item.product.sold_by_weight ? `${item.quantity.toFixed(3)} kg` : item.quantity}
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

                <div className="space-y-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-2xl text-primary">
                      R$ {total.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={saveSale}
                      variant="outline"
                      className="flex-1"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {currentSaleId ? 'Atualizar' : 'Salvar Venda'}
                    </Button>
                    <Button
                      onClick={() => setShowSavedSalesDialog(true)}
                      variant="outline"
                      className="flex-1"
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Vendas Salvas
                      {savedSales.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {savedSales.length}
                        </Badge>
                      )}
                    </Button>
                  </div>
                  
                  {currentSaleId && (
                    <Button
                      onClick={clearSale}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Limpar e Nova Venda
                    </Button>
                  )}
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
                    <Label>Cliente</Label>
                    {selectedCustomer ? (
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{selectedCustomer.full_name}</p>
                            <p className="text-sm text-muted-foreground">CPF: {selectedCustomer.cpf}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedCustomer.street}, {selectedCustomer.number} - {selectedCustomer.neighborhood}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedCustomer(null)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Select
                          value={selectedCustomer?.id || ''}
                          onValueChange={(customerId) => {
                            const customer = customers.find(c => c.id === customerId);
                            if (customer) {
                              setSelectedCustomer(customer);
                              toast({
                                title: 'Cliente selecionado',
                                description: customer.full_name
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar cliente cadastrado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4" />
                                  <div>
                                    <p className="font-medium">{customer.full_name}</p>
                                    <p className="text-xs text-muted-foreground">CPF: {customer.cpf}</p>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={() => setShowCustomerDialog(true)}
                            className="bg-orange-500 hover:bg-orange-600"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Cadastrar
                          </Button>
                          <Button
                            onClick={handleConsumidorFinal}
                            variant="outline"
                          >
                            Consumidor Final
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Tabs value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="cash">
                          <Banknote className="w-4 h-4 mr-2" />
                          Dinheiro
                        </TabsTrigger>
                        <TabsTrigger value="debit">
                          <CreditCard className="w-4 h-4 mr-2" />
                          Débito
                        </TabsTrigger>
                        <TabsTrigger value="credit">
                          <CreditCard className="w-4 h-4 mr-2" />
                          Crédito
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

                  {paymentMethod === 'credit' && (
                    <div className="space-y-2">
                      <Label>Número de Parcelas</Label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num}x de R$ {(total / num).toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <div className="p-3 bg-muted rounded-lg space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Valor da Parcela:</span>
                          <span className="font-bold">
                            R$ {(total / installments).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Total:</span>
                          <span>R$ {total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
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
            {selectedProduct?.variations?.map((variation) => {
              // Usar imagem da variação ou fallback para imagem do produto
              const imageUrl = variation.image_url || selectedProduct?.image_url;
              
              return (
                <Card
                  key={variation.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => {
                    if (variation.stock > 0) {
                      addToCart(selectedProduct, variation);
                      setShowVariationsDialog(false);
                    }
                  }}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="w-full h-24 bg-muted rounded overflow-hidden flex items-center justify-center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={variation.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{variation.name}</h3>
                      {variation.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {variation.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-primary">
                        R$ {variation.price.toFixed(2)}
                      </span>
                      <Badge variant={variation.stock > 5 ? "secondary" : variation.stock > 0 ? "outline" : "destructive"} className="text-xs">
                        {variation.stock > 0 ? `${variation.stock} un` : 'Esgotado'}
                      </Badge>
                    </div>
                    {variation.sku && (
                      <p className="text-xs text-muted-foreground font-mono">
                        SKU: {variation.sku}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de cadastro de cliente */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente para vincular à venda
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                placeholder="Nome completo do cliente"
                value={customerForm.full_name}
                onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                placeholder="000.000.000-00"
                value={customerForm.cpf}
                onChange={(e) => setCustomerForm({ ...customerForm, cpf: e.target.value })}
                maxLength={14}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cep">CEP *</Label>
              <Input
                id="cep"
                placeholder="00000-000"
                value={customerForm.cep}
                onChange={(e) => setCustomerForm({ ...customerForm, cep: e.target.value })}
                maxLength={9}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Rua *</Label>
              <Input
                id="street"
                placeholder="Nome da rua"
                value={customerForm.street}
                onChange={(e) => setCustomerForm({ ...customerForm, street: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number">Número *</Label>
                <Input
                  id="number"
                  placeholder="123"
                  value={customerForm.number}
                  onChange={(e) => setCustomerForm({ ...customerForm, number: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro *</Label>
                <Input
                  id="neighborhood"
                  placeholder="Bairro"
                  value={customerForm.neighborhood}
                  onChange={(e) => setCustomerForm({ ...customerForm, neighborhood: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowCustomerDialog(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveCustomer}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                <Check className="w-4 h-4 mr-2" />
                Salvar Cliente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de entrada de peso */}
      <Dialog open={showWeightDialog} onOpenChange={setShowWeightDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informe o Peso</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} - R$ {selectedProduct?.price.toFixed(2)}/kg
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Seletor de unidade */}
            <div className="flex gap-2">
              <Button
                variant={weightUnit === 'g' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  if (weightUnit === 'kg' && weightInput) {
                    // Converter de kg para g
                    const val = parseFloat(weightInput.replace(',', '.'));
                    if (!isNaN(val)) setWeightInput((val * 1000).toString());
                  }
                  setWeightUnit('g');
                }}
              >
                Gramas (g)
              </Button>
              <Button
                variant={weightUnit === 'kg' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  if (weightUnit === 'g' && weightInput) {
                    // Converter de g para kg
                    const val = parseFloat(weightInput.replace(',', '.'));
                    if (!isNaN(val)) setWeightInput((val / 1000).toString());
                  }
                  setWeightUnit('kg');
                }}
              >
                Quilos (kg)
              </Button>
            </div>

            {/* Botões de atalho para pesos comuns */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Atalhos rápidos</Label>
              <div className="grid grid-cols-4 gap-2">
                {weightUnit === 'g' 
                  ? [100, 150, 200, 250, 300, 400, 500, 750].map((weight) => (
                      <Button
                        key={weight}
                        variant="outline"
                        size="sm"
                        onClick={() => setWeightInput(weight.toString())}
                        className="text-xs"
                      >
                        {weight}g
                      </Button>
                    ))
                  : [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5].map((weight) => (
                      <Button
                        key={weight}
                        variant="outline"
                        size="sm"
                        onClick={() => setWeightInput(weight.toString())}
                        className="text-xs"
                      >
                        {weight}kg
                      </Button>
                    ))
                }
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight">Peso ({weightUnit})</Label>
              <div className="relative">
                <Input
                  id="weight"
                  type="text"
                  inputMode="decimal"
                  placeholder={weightUnit === 'g' ? '452' : '0.452'}
                  value={weightInput}
                  onChange={(e) => {
                    // Permite apenas números, ponto e vírgula
                    const value = e.target.value.replace(/[^0-9.,]/g, '');
                    setWeightInput(value);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleWeightSubmit();
                    }
                  }}
                  autoFocus
                  className="text-3xl font-bold text-center h-16 pr-12"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium">
                  {weightUnit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {weightUnit === 'g' 
                  ? 'Digite o peso em gramas (ex: 452 para 452g)'
                  : 'Digite o peso em kg (ex: 0.452 para 452g)'
                }
              </p>
            </div>

            {weightInput && !isNaN(parseFloat(weightInput.replace(',', '.'))) && parseFloat(weightInput.replace(',', '.')) > 0 && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Peso:</span>
                  <span className="font-medium">
                    {weightUnit === 'g' 
                      ? `${parseFloat(weightInput.replace(',', '.'))}g (${(parseFloat(weightInput.replace(',', '.')) / 1000).toFixed(3)}kg)`
                      : `${parseFloat(weightInput.replace(',', '.')).toFixed(3)}kg (${(parseFloat(weightInput.replace(',', '.')) * 1000).toFixed(0)}g)`
                    }
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-2xl text-primary">
                    R$ {(getWeightInKg() * (selectedProduct?.price || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowWeightDialog(false);
                  setWeightInput('');
                  setSelectedProduct(null);
                }}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleWeightSubmit}
                className="flex-1"
                disabled={!weightInput || isNaN(parseFloat(weightInput.replace(',', '.'))) || parseFloat(weightInput.replace(',', '.')) <= 0}
              >
                <Check className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de vendas salvas */}
      <Dialog open={showSavedSalesDialog} onOpenChange={setShowSavedSalesDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vendas Salvas</DialogTitle>
            <DialogDescription>
              Selecione uma venda salva para retomar
            </DialogDescription>
          </DialogHeader>
          
          {savedSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma venda salva</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedSales.map((sale) => (
                <Card 
                  key={sale.id} 
                  className={`cursor-pointer hover:shadow-lg transition-shadow ${currentSaleId === sale.id ? 'border-primary border-2' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">
                            Venda #{sale.id.slice(0, 8)}
                          </h3>
                          {currentSaleId === sale.id && (
                            <Badge variant="default">Atual</Badge>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>
                            <strong>Total:</strong> R$ {sale.total_amount.toFixed(2)}
                          </p>
                          <p>
                            <strong>Itens:</strong> {(sale.cart_data as any[]).length} produto(s)
                          </p>
                          {sale.customer_data && (
                            <p>
                              <strong>Cliente:</strong> {(sale.customer_data as any).full_name}
                            </p>
                          )}
                          <p>
                            <strong>Método:</strong> {
                              sale.payment_method === 'cash' ? 'Dinheiro' :
                              sale.payment_method === 'credit' ? 'Crédito' :
                              sale.payment_method === 'debit' ? 'Débito' :
                              sale.payment_method === 'pix' ? 'PIX' : 'N/A'
                            }
                          </p>
                          <p className="text-xs">
                            <strong>Salva em:</strong> {new Date(sale.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => loadSale(sale)}
                          disabled={currentSaleId === sale.id}
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          {currentSaleId === sale.id ? 'Carregada' : 'Carregar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSavedSale(sale.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
