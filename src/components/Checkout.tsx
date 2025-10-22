import { useState, useEffect } from 'react';
import { CreditCard, Smartphone, DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCart } from '@/hooks/useCart';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { APP_CONFIG } from '@/config/constants';

interface CheckoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shippingCost: number;
  shippingInfo: { nome: string; prazoEntrega: number } | null;
}

type PaymentMethod = 'pix' | 'credit' | 'debit';

export function Checkout({ open, onOpenChange, shippingCost, shippingInfo }: CheckoutProps) {
  const { total, items, clearCart } = useCart();
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState('1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pixData, setPixData] = useState<{qrCode: string; qrCodeBase64: string} | null>(null);
  const [mpLoaded, setMpLoaded] = useState(false);
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });

  // Calcular desconto de 5% para PIX
  const pixDiscount = paymentMethod === 'pix' ? (total + shippingCost) * 0.05 : 0;
  const finalTotal = (total + shippingCost) - pixDiscount;

  useEffect(() => {
    // Carregar SDK do Mercado Pago
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => {
      console.log('Mercado Pago SDK carregado');
      setMpLoaded(true);
    };
    script.onerror = () => {
      console.error('Erro ao carregar SDK do Mercado Pago');
      toast({
        title: 'Erro ao carregar SDK',
        description: 'Não foi possível carregar o sistema de pagamento. Recarregue a página.',
        variant: 'destructive'
      });
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleFinishPurchase = async () => {
    setIsProcessing(true);
    
    try {
      // Buscar dados do perfil do usuário
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('cpf, full_name')
        .eq('id', user.id)
        .maybeSingle();

      let cardToken = null;
      
      // Se for cartão, gerar token primeiro
      if (paymentMethod === 'credit' || paymentMethod === 'debit') {
        // Validar dados do cartão
        if (!cardData.number || !cardData.name || !cardData.expiry || !cardData.cvv) {
          throw new Error('Preencha todos os dados do cartão');
        }

        if (!mpLoaded || !(window as any).MercadoPago) {
          throw new Error('Sistema de pagamento ainda não está pronto. Aguarde alguns segundos e tente novamente.');
        }

        console.log('Criando token do cartão...');
        const mp = new (window as any).MercadoPago(APP_CONFIG.MERCADO_PAGO_PUBLIC_KEY);
        
        const [month, year] = cardData.expiry.split('/');
        
        if (!month || !year || month.length !== 2 || year.length !== 2) {
          throw new Error('Data de validade inválida. Use o formato MM/AA');
        }

        try {
          cardToken = await mp.createCardToken({
            cardNumber: cardData.number.replace(/\s/g, ''),
            cardholderName: cardData.name,
            cardExpirationMonth: month,
            cardExpirationYear: `20${year}`,
            securityCode: cardData.cvv,
          });

          console.log('Token do cartão criado:', cardToken);

          if (cardToken.error) {
            console.error('Erro ao criar token:', cardToken.error);
            throw new Error(cardToken.error.message || 'Erro ao processar cartão');
          }
        } catch (error) {
          console.error('Erro na criação do token:', error);
          throw error;
        }
      }

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount: finalTotal,
          paymentMethod,
          items: items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price
          })),
          cardData: cardToken ? {
            token: cardToken.id,
            paymentMethodId: cardToken.payment_method_id
          } : null,
          installments: paymentMethod === 'credit' ? installments : '1',
          userEmail: user?.email,
          userCpf: profile?.cpf,
          userName: profile?.full_name || user?.user_metadata?.full_name
        }
      });

      if (error) throw error;

      if (data.success) {
        // Criar pedido no banco de dados com status aguardando_pagamento
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert({
              user_id: user.id,
              total_amount: finalTotal,
              shipping_cost: shippingCost,
              shipping_address: shippingInfo?.nome || 'Endereço não informado',
              shipping_cep: '00000-000',
              status: 'aguardando_pagamento',
              payment_id: data.paymentId?.toString()
            })
            .select()
            .single();

          if (!orderError && orderData) {
            // Criar itens do pedido
            const orderItems = items.map(item => ({
              order_id: orderData.id,
              product_id: item.id,
              quantity: item.quantity,
              price_at_purchase: item.price
            }));

            await supabase.from('order_items').insert(orderItems);
          }
        }

        if (paymentMethod === 'pix') {
          setPixData({
            qrCode: data.qrCode,
            qrCodeBase64: data.qrCodeBase64
          });
          toast({
            title: 'PIX gerado com sucesso!',
            description: 'Após o pagamento, seu pedido será processado automaticamente.',
          });
        } else {
          toast({
            title: 'Pagamento processado!',
            description: `Pagamento via ${paymentMethod === 'credit' ? 'crédito' : 'débito'} em análise. Você receberá uma confirmação em breve.`,
          });
          clearCart();
          onOpenChange(false);
        }
      } else {
        throw new Error(data.error || 'Erro ao processar pagamento');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: 'Erro no pagamento',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClosePix = () => {
    setPixData(null);
    clearCart();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Pedido</DialogTitle>
          <DialogDescription>
            Escolha a forma de pagamento e conclua sua compra
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Resumo do Pedido */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Resumo do Pedido</h3>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.name} x {item.quantity}</span>
                  <span>R$ {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <Separator />
            {shippingInfo && (
              <div className="flex justify-between text-sm border-t pt-2">
                <span>{shippingInfo.nome} ({shippingInfo.prazoEntrega} dias úteis):</span>
                <span>R$ {shippingCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>R$ {(total + shippingCost).toFixed(2)}</span>
            </div>
            {paymentMethod === 'pix' && pixDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Desconto PIX (5%):</span>
                <span>- R$ {pixDiscount.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span className="text-primary">R$ {finalTotal.toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Seleção de Método de Pagamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Método de Pagamento</h3>
            <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
              <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="pix" id="pix" />
                <Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">PIX</p>
                    <p className="text-sm text-muted-foreground">Aprovação instantânea</p>
                  </div>
                  <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">
                    5% OFF
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="credit" id="credit" />
                <Label htmlFor="credit" className="flex items-center gap-2 cursor-pointer flex-1">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Cartão de Crédito</p>
                    <p className="text-sm text-muted-foreground">Parcele em até 12x</p>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="debit" id="debit" />
                <Label htmlFor="debit" className="flex items-center gap-2 cursor-pointer flex-1">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Cartão de Débito</p>
                    <p className="text-sm text-muted-foreground">À vista</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Formulário de Cartão */}
          {(paymentMethod === 'credit' || paymentMethod === 'debit') && (
            <div className="space-y-4">
              <h3 className="font-semibold">Dados do Cartão</h3>
              
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Número do Cartão</Label>
                <Input
                  id="cardNumber"
                  placeholder="0000 0000 0000 0000"
                  value={cardData.number}
                  onChange={(e) => setCardData({ ...cardData, number: e.target.value })}
                  maxLength={19}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cardName">Nome no Cartão</Label>
                <Input
                  id="cardName"
                  placeholder="Nome como está no cartão"
                  value={cardData.name}
                  onChange={(e) => setCardData({ ...cardData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiry">Validade</Label>
                  <Input
                    id="expiry"
                    placeholder="MM/AA"
                    value={cardData.expiry}
                    onChange={(e) => setCardData({ ...cardData, expiry: e.target.value })}
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    placeholder="000"
                    value={cardData.cvv}
                    onChange={(e) => setCardData({ ...cardData, cvv: e.target.value })}
                    maxLength={4}
                    type="password"
                  />
                </div>
              </div>

              {paymentMethod === 'credit' && (
                <div className="space-y-2">
                  <Label htmlFor="installments">Parcelamento</Label>
                  <Select value={installments} onValueChange={setInstallments}>
                    <SelectTrigger id="installments">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num}x de R$ {((total + shippingCost) / num).toFixed(2)}
                          {num === 1 ? ' à vista' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* PIX Info */}
          {paymentMethod === 'pix' && !pixData && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-1">
                🎉 Ganhe 5% de desconto pagando com PIX!
              </p>
              <p className="text-sm text-green-700">
                Ao confirmar, você receberá o código PIX para realizar o pagamento.
                Seu pedido será criado automaticamente após a confirmação do pagamento.
              </p>
            </div>
          )}

          {/* PIX QR Code */}
          {pixData && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg flex justify-center">
                <img 
                  src={`data:image/png;base64,${pixData.qrCodeBase64}`} 
                  alt="QR Code PIX"
                  className="w-64 h-64"
                />
              </div>
              <div className="bg-accent/50 p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">Código PIX Copia e Cola:</p>
                <code className="text-xs break-all block bg-background p-2 rounded">
                  {pixData.qrCode}
                </code>
              </div>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleClosePix}
              >
                Fechar
              </Button>
            </div>
          )}

          {!pixData && (
            <>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleFinishPurchase}
                disabled={isProcessing || !shippingInfo || ((paymentMethod === 'credit' || paymentMethod === 'debit') && !mpLoaded)}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : !shippingInfo ? (
                  '⚠️ Escolha uma opção de entrega'
                ) : ((paymentMethod === 'credit' || paymentMethod === 'debit') && !mpLoaded) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Carregando sistema de pagamento...
                  </>
                ) : (
                  `Confirmar Pagamento - R$ ${finalTotal.toFixed(2)}`
                )}
              </Button>
              {!shippingInfo && (
                <p className="text-sm text-destructive text-center font-medium">
                  Você precisa selecionar uma opção de entrega no carrinho antes de finalizar
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
