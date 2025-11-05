import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, Send, AlertCircle } from 'lucide-react';
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
}

interface NFEListProps {
  settings: any;
  onRefresh: () => void;
}

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
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const emitNFE = async (orderId: string) => {
    try {
      toast({
        title: 'Emitindo NF-e...',
        description: 'Aguarde enquanto processamos a nota fiscal.',
      });

      const { data, error } = await supabase.functions.invoke('emit-nfe', {
        body: { orderId }
      });

      if (error) throw error;

      toast({
        title: 'NF-e emitida!',
        description: 'A nota fiscal foi emitida com sucesso.',
      });

      loadNFEs();
    } catch (error: any) {
      toast({
        title: 'Erro ao emitir NF-e',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (!settings?.nfe_enabled) {
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

  if (nfes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Nenhuma nota fiscal emitida ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Número NF-e</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Emitida em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfes.map((nfe) => (
              <TableRow key={nfe.id}>
                <TableCell className="font-mono text-xs">
                  {nfe.order_id.slice(0, 8)}...
                </TableCell>
                <TableCell>
                  {nfe.nfe_number || '-'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {nfe.nfe_key ? `${nfe.nfe_key.slice(0, 8)}...` : '-'}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      nfe.status === 'success' ? 'default' :
                      nfe.status === 'pending' ? 'secondary' : 'destructive'
                    }
                  >
                    {nfe.status === 'success' ? 'Emitida' :
                     nfe.status === 'pending' ? 'Pendente' : 'Erro'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {nfe.emitted_at ? new Date(nfe.emitted_at).toLocaleString('pt-BR') : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {nfe.status === 'success' && nfe.nfe_xml_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(nfe.nfe_xml_url!, '_blank')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      XML
                    </Button>
                  )}
                  {nfe.status === 'error' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => emitNFE(nfe.order_id)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Reemitir
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
