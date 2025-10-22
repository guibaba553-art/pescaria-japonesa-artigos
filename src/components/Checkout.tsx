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
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });

  useEffect(() => {
    // Carregar SDK do Mercado Pago
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleFinishPurchase = async () => {
    setIsProcessing(true);
    
    try {
      let cardToken = null;
      
      // Se for cartão, gerar token primeiro
      if (paymentMethod === 'credit' || paymentMethod === 'debit') {
        const mp = new (window as any).MercadoPago(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY);
        
        const [month, year] = cardData.expiry.split('/');
        
        cardToken = await mp.createCardToken({
          cardNumber: cardData.number.replace(/\s/g, ''),
          cardholderName: cardData.name,
          cardExpirationMonth: month,
          cardExpirationYear: `20${year}`,
          securityCode: cardData.cvv,
        });

        if (cardToken.error) {
          throw new Error(cardToken.error.message || 'Erro ao processar cartão');
        }
      }

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount: total + shippingCost,
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
          installments: paymentMethod === 'credit' ? installments : '1'
        }
      });

      if (error) throw error;

      if (data.success) {
        if (paymentMethod === 'pix') {
          setPixData({
            qrCode: data.qrCode,
            qrCodeBase64: data.qrCodeBase64
          });
          toast({
            title: 'PIX gerado com sucesso!',
            description: 'Use o QR Code abaixo para pagar.',
          });
        } else {
          toast({
            title: 'Pagamento processado!',
            description: `Pagamento via ${paymentMethod === 'credit' ? 'crédito' : 'débito'} confirmado.`,
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
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span className="text-primary">R$ {(total + shippingCost).toFixed(2)}</span>
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
                  <div>
                    <p className="font-medium">PIX</p>
                    <p className="text-sm text-muted-foreground">Aprovação instantânea</p>
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
                          {num}x de R$ {(total / num).toFixed(2)}
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
            <div className="bg-accent/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Ao confirmar, você receberá o código PIX para realizar o pagamento.
                Após a confirmação do pagamento, seu pedido será processado.
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
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleFinishPurchase}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                `Confirmar Pagamento - R$ ${(total + shippingCost).toFixed(2)}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
