import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
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

  const renderNFETable = (tipo: 'entrada' | 'saida') => {
    const filteredNfes = nfes.filter(nfe => nfe.tipo === tipo);

    if (filteredNfes.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma nota fiscal de {tipo} registrada</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tipo === 'entrada' ? 'Fornecedor' : 'Pedido'}</TableHead>
              <TableHead>Número NF-e</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredNfes.map((nfe) => (
              <TableRow key={nfe.id}>
                <TableCell>
                  {tipo === 'entrada' ? (
                    <div>
                      <div className="font-medium">{nfe.fornecedor_nome || '-'}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {nfe.fornecedor_cnpj || '-'}
                      </div>
                    </div>
                  ) : (
                    <span className="font-mono text-xs">
                      {nfe.order_id.slice(0, 8)}...
                    </span>
                  )}
                </TableCell>
                <TableCell>{nfe.nfe_number || '-'}</TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

  const nfesEntrada = nfes.filter(nfe => nfe.tipo === 'entrada').length;
  const nfesSaida = nfes.filter(nfe => nfe.tipo === 'saida').length;

  return (
    <Tabs defaultValue="saida" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="saida" className="flex items-center gap-2">
          <ArrowUp className="w-4 h-4" />
          Notas de Saída ({nfesSaida})
        </TabsTrigger>
        <TabsTrigger value="entrada" className="flex items-center gap-2">
          <ArrowDown className="w-4 h-4" />
          Notas de Entrada ({nfesEntrada})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="saida" className="space-y-4">
        {renderNFETable('saida')}
      </TabsContent>

      <TabsContent value="entrada" className="space-y-4">
        {renderNFETable('entrada')}
      </TabsContent>
    </Tabs>
  );
}
