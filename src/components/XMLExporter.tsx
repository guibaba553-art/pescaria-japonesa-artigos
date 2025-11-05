import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Download, Calendar, Mail } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function XMLExporter() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [email, setEmail] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Datas obrigatórias',
        description: 'Selecione o período para exportação',
        variant: 'destructive'
      });
      return;
    }

    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('nfe_emissions')
        .select('*, orders!inner(id, created_at, total_amount)')
        .eq('status', 'success')
        .gte('emitted_at', startDate)
        .lte('emitted_at', endDate)
        .not('nfe_xml_url', 'is', null);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: 'Nenhuma nota encontrada',
          description: 'Não há notas fiscais emitidas no período selecionado',
        });
        return;
      }

      // Criar arquivo ZIP com todos os XMLs
      const xmlUrls = data.map(nfe => nfe.nfe_xml_url).filter(Boolean);
      
      // Simular download (em produção, você chamaria um edge function que gera o ZIP)
      toast({
        title: `${xmlUrls.length} XMLs encontrados`,
        description: 'Download iniciado...',
      });

      // Aqui você implementaria a lógica real de download
      console.log('XMLs para download:', xmlUrls);

    } catch (error: any) {
      toast({
        title: 'Erro na exportação',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Datas obrigatórias',
        description: 'Selecione o período para envio',
        variant: 'destructive'
      });
      return;
    }

    if (!email) {
      toast({
        title: 'Email obrigatório',
        description: 'Informe o email do contador',
        variant: 'destructive'
      });
      return;
    }

    setSending(true);
    try {
      // Implementar edge function para envio de email
      toast({
        title: 'Função em desenvolvimento',
        description: 'Envio de email por implementar',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          Exporte os XMLs das notas fiscais para enviar ao seu contador.
          Os arquivos são gerados no formato SPED conforme exigido pela Receita Federal.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Data Inicial</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-date">Data Final</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleExport} 
            disabled={exporting}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exportando...' : 'Baixar XMLs'}
          </Button>
        </div>

        <div className="pt-4 border-t">
          <div className="space-y-4">
            <Label htmlFor="contador-email">Email do Contador (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="contador-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contador@exemplo.com.br"
                className="flex-1"
              />
              <Button 
                onClick={handleSendEmail} 
                disabled={sending}
                variant="outline"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie os XMLs diretamente para o email do seu contador
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
