import { useEffect, useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, QrCode, Loader2, CheckCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { PAYMENT_CONFIG } from '@/config/constants';

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  expiresAt?: string;
  orderId: string;
  gateway?: 'abacatepay' | 'asaas';
  onRefreshPix?: () => void;
  onPaymentConfirmed?: () => void;
}

export function PixPaymentDialog({
  open,
  onOpenChange,
  qrCode,
  qrCodeBase64,
  ticketUrl,
  expiresAt,
  orderId,
  gateway = 'abacatepay',
  onRefreshPix,
  onPaymentConfirmed,
}: PixPaymentDialogProps) {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [hasNotified, setHasNotified] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);
  const POLLING_MAX_MS = PAYMENT_CONFIG.POLLING_MAX_MINUTES * 60 * 1000;

  // Calcular tempo restante para expiração
  useEffect(() => {
    if (!expiresAt || isPaid) return;

    const updateTimeLeft = () => {
      const now = new Date().getTime();
      const exp = new Date(expiresAt).getTime();
      const diff = exp - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expirado');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')} min`);
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, isPaid]);

  // Polling de status do pagamento
  const checkPaymentStatus = useCallback(async () => {
    if (!open || !orderId || isPaid) return;

    setIsChecking(true);

    try {
      const { data: result, error } = await supabase.functions.invoke('verify-payment', {
        body: { orderId, gateway },
      });

      if (error) {
        setIsChecking(false);
        return;
      }

      // Se pagamento foi aprovado
      if (result?.status === 'approved' && !hasNotified) {
        // Verificar se o diálogo ainda está aberto antes de prosseguir
        if (!open) return;

        setIsPaid(true);
        setIsChecking(false);
        setHasNotified(true);

        onPaymentConfirmed?.();

        toast.success('✅ Pagamento confirmado!', { description: 'Redirecionando...' });

        setTimeout(() => {
          onOpenChange(false);
          navigate('/conta');
        }, 2000);
      } else {
        setIsChecking(false);
      }
    } catch (err) {
      console.error('Erro ao verificar pagamento:', err);
      setIsChecking(false);
    }
  }, [open, orderId, isPaid, hasNotified, gateway, onOpenChange, navigate, toast]);

  useEffect(() => {
    if (!open || !orderId || isPaid) return;

    // Marcar início do polling
    pollingStartRef.current = Date.now();

    // Verificar imediatamente
    checkPaymentStatus();

    // Polling a cada 5 segundos com limite de 15 minutos
    pollingRef.current = setInterval(() => {
      // Parar polling após 15 minutos
      if (Date.now() - pollingStartRef.current > POLLING_MAX_MS) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setIsChecking(false);
        return;
      }
      checkPaymentStatus();
    }, PAYMENT_CONFIG.POLLING_INTERVAL_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [open, orderId, isPaid, checkPaymentStatus]);

  const handleCopyQRCode = () => {
    navigator.clipboard.writeText(qrCode);
    toast.success('Código copiado!', { description: 'Cole no seu app de pagamento para finalizar' });
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

  const handleRefreshPix = () => {
    if (onRefreshPix) {
      onRefreshPix();
    }
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
          {/* Status do Pagamento ou PIX Expirado */}
          {isPaid ? (
            <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-lg">
              <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
              <p className="text-lg font-semibold text-green-800">Pagamento Confirmado!</p>
              <p className="text-sm text-green-600">Redirecionando para seus pedidos...</p>
            </div>
          ) : isExpired ? (
            <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-lg">
              <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
              <p className="text-lg font-semibold text-red-800">PIX Expirado</p>
              <p className="text-sm text-red-600 mb-4">O tempo para pagamento expirou.</p>
              {onRefreshPix && (
                <Button onClick={handleRefreshPix} variant="outline" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Gerar novo PIX
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* QR Code Image */}
              <div className="flex justify-center p-4 bg-white rounded-lg relative">
                <img
                  src={qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
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

          {/* Tempo restante / Expiração */}
          {expiresAt && !isPaid && (
            <div className={`text-sm text-center p-2 rounded flex items-center justify-center gap-2 ${
              isExpired ? 'bg-red-50 text-red-600' : 'bg-muted/50 text-muted-foreground'
            }`}>
              <Clock className="w-4 h-4" />
              {isExpired ? 'Expirado' : `Expira em ${timeLeft}`}
            </div>
          )}

          {/* Copy Code Button — só exibe se não expirou */}
          {!isExpired && !isPaid && (
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
          )}

          {/* Link externo */}
          {ticketUrl && !isPaid && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(ticketUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir no {gateway === 'asaas' ? 'Asaas' : 'Mercado Pago'}
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
