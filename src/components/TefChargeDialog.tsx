import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface TefApprovedResult {
  transaction_id: string;
  nsu: string | null;
  authorization_code: string | null;
  card_brand: string | null;
  card_last_digits: string | null;
}

interface Props {
  open: boolean;
  amount: number;
  paymentMethod: 'credit' | 'debit';
  installments?: number;
  onCancel: () => void;
  onApproved: (result: TefApprovedResult) => void;
}

type Phase = 'idle' | 'charging' | 'approved' | 'declined' | 'error';

export function TefChargeDialog({
  open,
  amount,
  paymentMethod,
  installments = 1,
  onCancel,
  onApproved,
}: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setPhase('idle');
      setMessage('');
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      setPhase('charging');
      setMessage('Aguardando maquininha aprovar o pagamento…');

      try {
        const { data, error } = await supabase.functions.invoke('tef-stone-charge', {
          body: {
            amount,
            payment_method: paymentMethod,
            installments,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Modo Connect: agente local processa
        if (data.mode === 'connect') {
          try {
            const resp = await fetch(data.agent_url + '/charge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data.payload),
            });
            const agentRes = await resp.json();
            if (agentRes.status !== 'approved') {
              setPhase('declined');
              setMessage(agentRes.message || 'Pagamento não aprovado');
              return;
            }
            await supabase.from('tef_transactions').update({
              status: 'approved',
              nsu: agentRes.nsu ?? null,
              authorization_code: agentRes.authorization_code ?? null,
              card_brand: agentRes.card_brand ?? null,
              card_last_digits: agentRes.card_last_digits ?? null,
              raw_response: agentRes,
            }).eq('id', data.transaction_id);
            setPhase('approved');
            setMessage('Pagamento aprovado!');
            setTimeout(() => onApproved({
              transaction_id: data.transaction_id,
              nsu: agentRes.nsu ?? null,
              authorization_code: agentRes.authorization_code ?? null,
              card_brand: agentRes.card_brand ?? null,
              card_last_digits: agentRes.card_last_digits ?? null,
            }), 600);
            return;
          } catch (agentErr: any) {
            setPhase('error');
            setMessage(`Falha ao falar com o agente local: ${agentErr.message}`);
            return;
          }
        }

        // Modo API (mock ou Stone Open API)
        if (data.status === 'approved') {
          setPhase('approved');
          setMessage(data.mock ? 'Pagamento aprovado (modo simulação)' : 'Pagamento aprovado!');
          setTimeout(() => onApproved({
            transaction_id: data.transaction_id,
            nsu: data.nsu ?? null,
            authorization_code: data.authorization_code ?? null,
            card_brand: data.card_brand ?? null,
            card_last_digits: data.card_last_digits ?? null,
          }), 600);
        } else {
          setPhase('declined');
          setMessage('Pagamento não aprovado pela maquininha');
        }
      } catch (err: any) {
        setPhase('error');
        setMessage(err.message || 'Erro ao processar pagamento');
        toast({
          title: 'Erro TEF',
          description: err.message || 'Falha ao iniciar transação',
          variant: 'destructive',
        });
      }
    })();
  }, [open, amount, paymentMethod, installments, onApproved, toast]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pagamento na maquininha
          </DialogTitle>
          <DialogDescription>
            Total: <strong>R$ {amount.toFixed(2).replace('.', ',')}</strong>
            {paymentMethod === 'credit' && installments > 1 && ` em ${installments}x`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {phase === 'charging' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center">{message}</p>
            </>
          )}
          {phase === 'approved' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-sm font-medium">{message}</p>
            </>
          )}
          {(phase === 'declined' || phase === 'error') && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-center">{message}</p>
            </>
          )}
        </div>

        {(phase === 'declined' || phase === 'error') && (
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>Fechar</Button>
          </DialogFooter>
        )}
        {phase === 'charging' && (
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
