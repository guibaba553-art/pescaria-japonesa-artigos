import { useState } from 'react';
import { CreditCard, Smartphone, DollarSign } from 'lucide-react';
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

interface CheckoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentMethod = 'pix' | 'credit' | 'debit';

export function Checkout({ open, onOpenChange }: CheckoutProps) {
  const { total, items, clearCart } = useCart();
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState('1');
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });

  const handleFinishPurchase = () => {
    // Aqui você integraria com o gateway de pagamento real
    toast({
      title: 'Pedido realizado com sucesso!',
      description: `Pagamento via ${
        paymentMethod === 'pix' ? 'PIX' : 
        paymentMethod === 'credit' ? `Crédito em ${installments}x` : 
        'Débito'
      } confirmado.`,
    });
    clearCart();
    onOpenChange(false);
  };

  const calculateInstallmentValue = (value: number) => {
    return (value / parseInt(value.toString())).toFixed(2);
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
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span className="text-primary">R$ {total.toFixed(2)}</span>
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
          {paymentMethod === 'pix' && (
            <div className="bg-accent/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Ao confirmar, você receberá o código PIX para realizar o pagamento.
                Após a confirmação do pagamento, seu pedido será processado.
              </p>
            </div>
          )}

          <Button 
            className="w-full" 
            size="lg"
            onClick={handleFinishPurchase}
          >
            Confirmar Pagamento - R$ {total.toFixed(2)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
