import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, AlertCircle, ArrowDown, ArrowUp, Calendar, Hash, Eye, Ban, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface NFE {
  id: string;
  order_id: string;
  nfe_number: string | null;
  nfe_key: string | null;
  nfe_xml_url: string | null;
  danfe_url: string | null;
  status: string;
  error_message: string | null;
  emitted_at: string | null;
  created_at: string;
  tipo: string;
  modelo: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  valor_total: number | null;
  customer_name: string | null;
  customer_company_name: string | null;
}

interface NFEListProps {
  settings: any;
  onRefresh: () => void;
}

const statusBadge = (status: string) => {
  if (status === 'success')
    return {
      cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      accent: 'border-l-emerald-500',
      label: 'Emitida',
    };
  if (status === 'pending')
    return {
      cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      accent: 'border-l-amber-500',
      label: 'Pendente',
    };
  if (status === 'cancelled')
    return {
      cls: 'bg-muted text-muted-foreground border-muted-foreground/30',
      accent: 'border-l-muted-foreground',
      label: 'Cancelada',
    };
  return {
    cls: 'bg-destructive/15 text-destructive border-destructive/30',
    accent: 'border-l-destructive',
    label: 'Erro',
  };
};

export function NFEList({ settings, onRefresh }: NFEListProps) {
  const [nfes, setNfes] = useState<NFE[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<NFE | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCheckStatus = async (nfe: NFE) => {
    setCheckingId(nfe.id);
    try {
      const { data, error } = await supabase.functions.invoke('check-nfe-status');
      if (error) throw error;
      const result = (data as any)?.results?.find((r: any) => r.id === nfe.id);
      await loadNFEs();
      if (result?.focusStatus === 'autorizado' || result?.updated) {
        toast({ title: 'Status atualizado', description: `SEFAZ: ${result.focusStatus || 'atualizado'}` });
      } else {
        toast({ title: 'Ainda em processamento', description: 'A SEFAZ ainda não retornou autorização. Tente novamente em alguns segundos.' });
      }
      onRefresh?.();
    } catch (err: any) {
      toast({ title: 'Erro ao verificar', description: err?.message || 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setCheckingId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 15) {
      toast({
        title: 'Justificativa muito curta',
        description: 'A SEFAZ exige no mínimo 15 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-nfe', {
        body: { nfe_id: cancelTarget.id, justificativa: cancelReason.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: 'NF-e cancelada',
        description: `Protocolo: ${(data as any)?.protocolo_cancelamento || 'OK'}`,
      });
      setCancelTarget(null);
      setCancelReason('');
      await loadNFEs();
      onRefresh?.();
    } catch (err: any) {
      toast({
        title: 'Falha no cancelamento',
        description: err?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    loadNFEs();

    // Realtime: atualiza a lista assim que qualquer NF-e mudar (status, cancelamento, etc.)
    const channel = supabase
      .channel('nfe-emissions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nfe_emissions' },
        () => loadNFEs(),
      )
      .subscribe();

    // Fallback: refetch a cada 30s e quando a aba volta ao foco
    const interval = setInterval(() => loadNFEs(), 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadNFEs();
    };
    const onFocus = () => loadNFEs();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const loadNFEs = async (attempt = 0) => {
    try {
      const { data, error } = await supabase
        .from('nfe_emissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNfes(data || []);
    } catch (error: any) {
      const msg = String(error?.message || '');
      const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network');
      // Retry silencioso até 3x para falhas transitórias de rede
      if (isNetwork && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return loadNFEs(attempt + 1);
      }
      // Só exibe toast se não for falha de rede transitória
      if (!isNetwork) {
        toast({
          title: 'Erro ao carregar NF-es',
          description: msg,
          variant: 'destructive',
        });
      } else {
        console.warn('[NFEList] Falha de rede ao carregar NF-es (silenciada):', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderNFEGrid = (filterFn: (nfe: NFE) => boolean, emptyLabel: string, isEntrada = false, labelPrefix = 'NF-e') => {
    const filtered = nfes.filter(filterFn);

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
          <FileText className="w-14 h-14 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhuma {emptyLabel} registrada</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((nfe) => {
          const s = statusBadge(nfe.status);
          return (
            <Card
              key={nfe.id}
              className={`border-l-4 ${s.accent} transition-all hover:shadow-md`}
            >
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isEntrada ? (
                      <>
                        <p className="font-semibold truncate">
                          {nfe.fornecedor_nome || 'Fornecedor não informado'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {nfe.fornecedor_cnpj || '-'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">
                          {labelPrefix} {nfe.nfe_number || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          Pedido #{nfe.order_id.slice(0, 8)}
                        </p>
                      </>
                    )}
                  </div>
                  <Badge variant="outline" className={s.cls}>
                    {s.label}
                  </Badge>
                </div>

                {nfe.nfe_key && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <Hash className="w-3 h-3" />
                    <span className="truncate">{nfe.nfe_key}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {nfe.emitted_at
                      ? new Date(nfe.emitted_at).toLocaleString('pt-BR')
                      : new Date(nfe.created_at).toLocaleString('pt-BR')}
                  </span>
                  {nfe.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCheckStatus(nfe)}
                      disabled={checkingId === nfe.id}
                      className="h-7 gap-1"
                    >
                      {checkingId === nfe.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Verificar status
                    </Button>
                  )}
                  {nfe.status === 'success' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {nfe.danfe_url && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => window.open(nfe.danfe_url!, '_blank')}
                          className="h-7 gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Visualizar
                        </Button>
                      )}
                      {nfe.nfe_xml_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(nfe.nfe_xml_url!, '_blank')}
                          className="h-7 gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          XML
                        </Button>
                      )}
                      {!isEntrada && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setCancelTarget(nfe); setCancelReason(''); }}
                          className="h-7 gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {nfe.status === 'error' && nfe.error_message && (
                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {nfe.error_message}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  if (!settings?.nfe_enabled && nfes.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Sistema de NF-e está desabilitado. Ative nas configurações para começar a emitir notas fiscais.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando notas fiscais...</div>;
  }

  const isNfe = (n: NFE) => n.tipo === 'saida' && (n.modelo === '55' || !n.modelo);
  const isNfce = (n: NFE) => n.tipo === 'saida' && n.modelo === '65';
  const isEntrada = (n: NFE) => n.tipo === 'entrada';

  const countNfe = nfes.filter(isNfe).length;
  const countNfce = nfes.filter(isNfce).length;
  const countEntrada = nfes.filter(isEntrada).length;

  return (
    <>
      <Tabs defaultValue="nfe" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-11">
          <TabsTrigger value="nfe" className="gap-2">
            <ArrowUp className="w-4 h-4" />
            NF-e
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{countNfe}</Badge>
          </TabsTrigger>
          <TabsTrigger value="nfce" className="gap-2">
            <ArrowUp className="w-4 h-4" />
            NFC-e
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{countNfce}</Badge>
          </TabsTrigger>
          <TabsTrigger value="entrada" className="gap-2">
            <ArrowDown className="w-4 h-4" />
            Entrada
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{countEntrada}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nfe">{renderNFEGrid(isNfe, 'NF-e de saída', false, 'NF-e')}</TabsContent>
        <TabsContent value="nfce">{renderNFEGrid(isNfce, 'NFC-e', false, 'NFC-e')}</TabsContent>
        <TabsContent value="entrada">{renderNFEGrid(isEntrada, 'nota de entrada', true)}</TabsContent>
      </Tabs>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open && !cancelling) { setCancelTarget(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar NF-e {cancelTarget?.nfe_number ? `nº ${cancelTarget.nfe_number}` : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento só é aceito pela SEFAZ até <strong>24 horas após a autorização</strong>.
              Informe uma justificativa (mínimo 15 caracteres).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-reason">Justificativa</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value.slice(0, 255))}
              placeholder="Ex: Erro na quantidade de produtos lançados na nota fiscal"
              rows={3}
              disabled={cancelling}
            />
            <p className="text-xs text-muted-foreground text-right">{cancelReason.length}/255 (mín. 15)</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancel(); }}
              disabled={cancelling || cancelReason.trim().length < 15}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelando...</>) : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
