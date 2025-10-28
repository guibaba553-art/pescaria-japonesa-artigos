import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, QrCode, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  expiresAt?: string;
  orderId: string;
}

export function PixPaymentDialog({
  open,
  onOpenChange,
  qrCode,
  qrCodeBase64,
  ticketUrl,
  expiresAt,
  orderId
}: PixPaymentDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  // Verificar status do pagamento a cada 5 segundos
  useEffect(() => {
    if (!open || !orderId) return;

    const checkPaymentStatus = async () => {
      const { data } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      if (data && data.status !== 'aguardando_pagamento') {
        setIsPaid(true);
        setIsChecking(false);
        
        toast({
          title: '✅ Pagamento confirmado!',
          description: 'Redirecionando...',
        });

        setTimeout(() => {
          onOpenChange(false);
          navigate('/conta');
        }, 2000);
      }
    };

    // Verificar imediatamente e depois a cada 5 segundos
    checkPaymentStatus();
    const interval = setInterval(checkPaymentStatus, 5000);

    return () => clearInterval(interval);
  }, [open, orderId, onOpenChange, navigate, toast]);

  const handleCopyQRCode = () => {
    navigator.clipboard.writeText(qrCode);
    toast({
      title: 'Código copiado!',
      description: 'Cole no seu app de pagamento para finalizar',
    });
  };

  const formatExpirationDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Pagamento via PIX
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code ou copie o código para pagar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status do Pagamento */}
          {isPaid ? (
            <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-lg">
              <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
              <p className="text-lg font-semibold text-green-800">Pagamento Confirmado!</p>
              <p className="text-sm text-green-600">Redirecionando para seus pedidos...</p>
            </div>
          ) : (
            <>
              {/* QR Code Image */}
              <div className="flex justify-center p-4 bg-white rounded-lg relative">
                <img
                  src={`data:image/png;base64,${qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-64 h-64"
                />
                {isChecking && (
                  <div className="absolute top-2 right-2 flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Verificando...
                  </div>
                )}
              </div>
            </>
          )}

          {/* Expiration warning */}
          {expiresAt && (
            <div className="text-sm text-muted-foreground text-center bg-muted/50 p-2 rounded">
              Expira em: {formatExpirationDate(expiresAt)}
            </div>
          )}

          {/* Copy Code Button */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Código PIX (Copia e Cola)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrCode}
                readOnly
                className="flex-1 px-3 py-2 text-xs bg-muted rounded border font-mono truncate"
              />
              <Button onClick={handleCopyQRCode} size="sm">
                <Copy className="w-4 h-4 mr-2" />
                Copiar
              </Button>
            </div>
          </div>

          {/* Mercado Pago Link */}
          {ticketUrl && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(ticketUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir no Mercado Pago
            </Button>
          )}

          <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
            <p className="font-medium">Como pagar:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Abra o app do seu banco</li>
              <li>Escolha pagar com PIX</li>
              <li>Escaneie o QR Code ou cole o código</li>
              <li>Confirme o pagamento</li>
            </ol>
            <p className="mt-2 text-center font-medium">
              Seu pedido será processado automaticamente após a confirmação do pagamento
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
