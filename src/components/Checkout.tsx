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
import { PixPaymentDialog } from '@/components/PixPaymentDialog';

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
  const [pixData, setPixData] = useState<{qrCode: string; qrCodeBase64: string; orderId: string} | null>(null);
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

  const validateCardData = () => {
    const errors: string[] = [];

    // Validar número do cartão
    const cardNumber = cardData.number.replace(/\s/g, '');
    if (!cardNumber) {
      errors.push('Número do cartão é obrigatório');
    } else if (!/^\d{13,19}$/.test(cardNumber)) {
      errors.push('Número do cartão inválido (deve ter entre 13 e 19 dígitos)');
    }

    // Validar nome
    if (!cardData.name || cardData.name.trim().length < 3) {
      errors.push('Nome no cartão deve ter pelo menos 3 caracteres');
    }

    // Validar validade
    if (!cardData.expiry) {
      errors.push('Data de validade é obrigatória');
    } else {
      const [month, year] = cardData.expiry.split('/');
      if (!month || !year || month.length !== 2 || year.length !== 2) {
        errors.push('Data de validade inválida (use MM/AA)');
      } else {
        const monthNum = parseInt(month);
        const yearNum = parseInt(`20${year}`);
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        if (monthNum < 1 || monthNum > 12) {
          errors.push('Mês inválido (deve ser entre 01 e 12)');
        }
        if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
          errors.push('Cartão vencido');
        }
      }
    }

    // Validar CVV
    if (!cardData.cvv) {
      errors.push('CVV é obrigatório');
    } else if (!/^\d{3,4}$/.test(cardData.cvv)) {
      errors.push('CVV inválido (deve ter 3 ou 4 dígitos)');
    }

    return errors;
  };

  const handleFinishPurchase = async () => {
    setIsProcessing(true);
    
    try {
      // Validar dados do cartão se for pagamento com cartão
      if (paymentMethod === 'credit' || paymentMethod === 'debit') {
        const validationErrors = validateCardData();
        if (validationErrors.length > 0) {
          throw new Error(`Dados do cartão inválidos:\n${validationErrors.map(e => `• ${e}`).join('\n')}`);
        }

        if (!mpLoaded || !(window as any).MercadoPago) {
          throw new Error('Sistema de pagamento ainda não está pronto. Aguarde alguns segundos e tente novamente.');
        }
      }

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
        console.log('Criando token do cartão...');
        const mp = new (window as any).MercadoPago(APP_CONFIG.MERCADO_PAGO_PUBLIC_KEY);
        
        const [month, year] = cardData.expiry.split('/');

        try {
          cardToken = await mp.createCardToken({
            cardNumber: cardData.number.replace(/\s/g, ''),
            cardholderName: cardData.name,
            cardExpirationMonth: month,
            cardExpirationYear: `20${year}`,
            securityCode: cardData.cvv,
          });

          // Token created successfully - not logging for security

          if (cardToken.error) {
            console.error('Erro ao criar token:', cardToken.error);
            const errorMsg = cardToken.error.message || 'Erro ao processar cartão';
            throw new Error(`Erro no cartão: ${errorMsg}`);
          }
        } catch (error) {
          console.error('Erro na criação do token:', error);
          throw new Error('Erro ao validar cartão. Verifique os dados e tente novamente.');
        }
      }

      // Buscar CEP do usuário do perfil
      const { data: profileData } = await supabase
        .from('profiles')
        .select('cep')
        .eq('id', user.id)
        .maybeSingle();

      // Validar CEP para entregas (não validar para retirada na loja)
      if (shippingInfo?.nome !== 'Retirar na Loja' && (!profileData?.cep || profileData.cep === '00000-000')) {
        throw new Error('Por favor, cadastre seu CEP no perfil antes de finalizar a compra com entrega.');
      }

      // Validar estoque ANTES de criar o pedido
      for (const item of items) {
        const { data: productData, error: stockError } = await supabase
          .from(item.variationId ? 'product_variations' : 'products')
          .select('stock, name')
          .eq('id', item.variationId || item.id)
          .single();

        if (stockError || !productData) {
          throw new Error(`Erro ao verificar estoque de ${item.name}`);
        }

        if (productData.stock < item.quantity) {
          throw new Error(`Estoque insuficiente para ${item.name}. Disponível: ${productData.stock}, solicitado: ${item.quantity}`);
        }
      }

      // Criar pedido no banco de dados
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          total_amount: finalTotal,
          shipping_cost: shippingCost,
          shipping_address: shippingInfo?.nome || 'Endereço não informado',
          shipping_cep: profileData?.cep || '00000-000',
          status: 'aguardando_pagamento',
          delivery_type: shippingInfo?.nome === 'Retirar na Loja' ? 'pickup' : 'delivery'
        })
        .select()
        .single();

      if (orderError || !orderData) {
        throw new Error('Erro ao criar pedido');
      }

      // Criar itens do pedido - incluir variationId se existir
      const orderItems = items.map(item => ({
        order_id: orderData.id,
        product_id: item.variationId || item.id, // Usar variationId se existir
        quantity: item.quantity,
        price_at_purchase: item.price
      }));

      await supabase.from('order_items').insert(orderItems);

      // Processar pagamento com o orderId
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount: finalTotal,
          paymentMethod,
          shippingCost,
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            variationId: item.variationId
          })),
          cardData: cardToken ? {
            token: cardToken.id,
            paymentMethodId: cardToken.payment_method_id,
            cardNumber: cardData.number.replace(/\s/g, ''),
            cardholderName: cardData.name,
            expirationDate: cardData.expiry,
            securityCode: cardData.cvv
          } : null,
          installments: paymentMethod === 'credit' ? installments : '1',
          userEmail: user?.email,
          userCpf: profile?.cpf,
          userName: profile?.full_name || user?.user_metadata?.full_name,
          orderId: orderData.id
        }
      });

      if (error) {
        // Se falhar, deletar o pedido criado
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        console.error('Edge function error:', error);
        throw new Error(`Erro ao processar pagamento: ${error.message}`);
      }

      if (data.success) {
        if (paymentMethod === 'pix') {
          setPixData({
            qrCode: data.qrCode,
            qrCodeBase64: data.qrCodeBase64,
            orderId: orderData.id
          });
          toast({
            title: 'PIX gerado com sucesso!',
            description: 'Escaneie o QR Code para pagar. O status será atualizado automaticamente.',
          });
        } else {
          // Para cartão, verificar se foi aprovado instantaneamente
          if (data.status === 'approved') {
            toast({
              title: '✅ Pagamento aprovado!',
              description: 'Redirecionando para seus pedidos...',
            });
            clearCart();
            onOpenChange(false);
            // Redirecionar para conta após 1 segundo
            setTimeout(() => {
              window.location.href = '/conta';
            }, 1000);
          } else {
            toast({
              title: 'Pagamento em análise',
              description: `Pagamento via ${paymentMethod === 'credit' ? 'crédito' : 'débito'} está sendo processado. Redirecionando...`,
            });
            clearCart();
            onOpenChange(false);
            setTimeout(() => {
              window.location.href = '/conta';
            }, 2000);
          }
        }
      } else {
        // Se falhar, deletar o pedido criado
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        
        // Mostrar erro específico retornado pela API
        const errorMessage = data.error || 'Erro ao processar pagamento';
        const errorDetails = data.details || '';
        throw new Error(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
      }
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao processar pagamento';
      
      // Mapear erros comuns do Mercado Pago para mensagens amigáveis
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('cc_rejected_bad_filled')) {
        friendlyMessage = 'Dados do cartão incorretos. Verifique número, nome, validade e CVV.';
      } else if (errorMessage.includes('cc_rejected_insufficient_amount')) {
        friendlyMessage = 'Saldo insuficiente no cartão.';
      } else if (errorMessage.includes('cc_rejected_max_attempts')) {
        friendlyMessage = 'Você excedeu o número de tentativas permitidas.';
      } else if (errorMessage.includes('Card Token not found')) {
        friendlyMessage = 'Erro ao processar cartão. Verifique os dados e tente novamente.';
      }

      toast({
        title: '❌ Erro no pagamento',
        description: friendlyMessage,
        variant: 'destructive',
        duration: 6000,
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
    <>
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
          {paymentMethod === 'pix' && (
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

          <Button
                className="w-full" 
                size="lg"
                onClick={handleFinishPurchase}
                disabled={
                  isProcessing || 
                  !shippingInfo || 
                  ((paymentMethod === 'credit' || paymentMethod === 'debit') && (
                    !mpLoaded || 
                    !cardData.number || 
                    !cardData.name || 
                    !cardData.expiry || 
                    !cardData.cvv
                  ))
                }
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
                ) : ((paymentMethod === 'credit' || paymentMethod === 'debit') && (!cardData.number || !cardData.name || !cardData.expiry || !cardData.cvv)) ? (
                  '⚠️ Preencha todos os dados do cartão'
                ) : (
                  `Confirmar Pagamento - R$ ${finalTotal.toFixed(2)}`
                )}
              </Button>
              {!shippingInfo && (
                <p className="text-sm text-destructive text-center font-medium">
                  Você precisa selecionar uma opção de entrega no carrinho antes de finalizar
                </p>
              )}
        </div>
      </DialogContent>
    </Dialog>

    {/* PIX Payment Dialog separado */}
    {pixData && (
      <PixPaymentDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleClosePix();
        }}
        qrCode={pixData.qrCode}
        qrCodeBase64={pixData.qrCodeBase64}
        orderId={pixData.orderId}
      />
    )}
    </>
  );
}
