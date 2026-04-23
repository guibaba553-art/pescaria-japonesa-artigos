import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, AlertCircle, ArrowDown, ArrowUp, Calendar, Hash, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NFE {
  id: string;
  order_id: string;
  nfe_number: string | null;
  nfe_key: string | null;
  nfe_xml_url: string | null;
  status: string;
  error_message: string | null;
  emitted_at: string | null;
  created_at: string;
  tipo: string;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
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
  return {
    cls: 'bg-destructive/15 text-destructive border-destructive/30',
    accent: 'border-l-destructive',
    label: 'Erro',
  };
};

export function NFEList({ settings, onRefresh }: NFEListProps) {
  const [nfes, setNfes] = useState<NFE[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadNFEs();
  }, []);

  const loadNFEs = async () => {
    try {
      const { data, error } = await supabase
        .from('nfe_emissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNfes(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar NF-es',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderNFEGrid = (tipo: 'entrada' | 'saida') => {
    const filtered = nfes.filter((nfe) => nfe.tipo === tipo);

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
          <FileText className="w-14 h-14 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhuma nota fiscal de {tipo} registrada</p>
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
                    {tipo === 'entrada' ? (
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
                          NF-e {nfe.nfe_number || '—'}
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
                  {nfe.status === 'success' && (
                    <div className="flex items-center gap-1.5">
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
                    </div>
                  )}
                </div>

                {nfe.error_message && (
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

  const nfesEntrada = nfes.filter((nfe) => nfe.tipo === 'entrada').length;
  const nfesSaida = nfes.filter((nfe) => nfe.tipo === 'saida').length;

  return (
    <Tabs defaultValue="saida" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 h-11">
        <TabsTrigger value="saida" className="gap-2">
          <ArrowUp className="w-4 h-4" />
          Notas de Saída
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{nfesSaida}</Badge>
        </TabsTrigger>
        <TabsTrigger value="entrada" className="gap-2">
          <ArrowDown className="w-4 h-4" />
          Notas de Entrada
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{nfesEntrada}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="saida">{renderNFEGrid('saida')}</TabsContent>
      <TabsContent value="entrada">{renderNFEGrid('entrada')}</TabsContent>
    </Tabs>
  );
}
