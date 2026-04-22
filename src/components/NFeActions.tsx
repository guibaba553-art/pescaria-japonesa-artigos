import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Loader2, RefreshCw, XCircle, Download, FileText } from 'lucide-react';

interface Props {
  orderId: string;
  modelo?: '55' | '65';
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
  onEmitted?: () => void;
}

export function EmitNFeButton({ orderId, modelo = '55', variant = 'default', size = 'default', label, onEmitted }: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const emit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('emit-nfe-focus', {
        body: { orderId, modelo },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'NF-e enviada!', description: data.message });
      onEmitted?.();
    } catch (e: any) {
      toast({ title: 'Erro ao emitir', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <Button variant={variant} size={size} onClick={emit} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
      {label || (modelo === '65' ? 'Emitir NFC-e' : 'Emitir NF-e')}
    </Button>
  );
}

export function ConsultNFeButton({ emissionId, onUpdated }: { emissionId: string; onUpdated?: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const consult = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('consult-nfe-focus', { body: { emissionId } });
      if (error) throw error;
      toast({ title: 'Status atualizado', description: `Status: ${data?.data?.status || 'desconhecido'}` });
      onUpdated?.();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  return (
    <Button variant="outline" size="sm" onClick={consult} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
    </Button>
  );
}

export function CancelNFeButton({ emissionId, onCancelled }: { emissionId: string; onCancelled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const cancel = async () => {
    if (justificativa.length < 15) {
      toast({ title: 'Justificativa muito curta', description: 'Mínimo 15 caracteres', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-nfe-focus', {
        body: { emissionId, justificativa },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'NF-e cancelada com sucesso' });
      setOpen(false); setJustificativa('');
      onCancelled?.();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><XCircle className="w-4 h-4 mr-2" />Cancelar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancelar NF-e</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Justificativa (mínimo 15 caracteres)</Label>
          <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={4} placeholder="Ex: Pedido cancelado pelo cliente antes do envio..." />
          <p className="text-xs text-muted-foreground">Cancelamento permitido em até 24h após autorização (NF-e) ou 30min (NFC-e).</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
          <Button onClick={cancel} disabled={loading || justificativa.length < 15}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar Cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DownloadNFeButtons({ xmlUrl, danfeUrl }: { xmlUrl?: string | null; danfeUrl?: string | null }) {
  return (
    <div className="flex gap-2">
      {xmlUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={xmlUrl} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4 mr-2" />XML</a>
        </Button>
      )}
      {danfeUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={danfeUrl} target="_blank" rel="noopener noreferrer"><FileText className="w-4 h-4 mr-2" />DANFE</a>
        </Button>
      )}
    </div>
  );
}
