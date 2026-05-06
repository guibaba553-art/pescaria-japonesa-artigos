import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Download, Info } from 'lucide-react';

export function SpedExporter() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    if (!startDate || !endDate) {
      toast({ title: 'Datas obrigatórias', description: 'Selecione o período', variant: 'destructive' });
      return;
    }
    setDownloading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão expirada — faça login novamente');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-sped-fiscal`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const count = res.headers.get('X-NFe-Count') || '0';
      const blob = await res.blob();
      const dl = document.createElement('a');
      dl.href = URL.createObjectURL(blob);
      const cnpjStub = 'empresa';
      dl.download = `SPED_FISCAL_${cnpjStub}_${startDate}_a_${endDate}.txt`;
      document.body.appendChild(dl);
      dl.click();
      dl.remove();

      toast({
        title: 'SPED gerado ✅',
        description: `${count} NF-e incluída(s). Envie o arquivo .txt para sua contadora.`,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar SPED', description: e.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" /> SPED Fiscal (EFD ICMS/IPI)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Gera o arquivo TXT do SPED Fiscal com todas as NF-e (modelo 55) autorizadas no período. Envie para sua contadora ou importe no PVA SPED.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          O arquivo gerado segue o layout oficial da EFD ICMS/IPI (Bloco 0, C e 9). A contadora pode validar e ajustar no programa <strong>PVA SPED Fiscal</strong> da Receita.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sped-start">Data inicial</Label>
          <Input id="sped-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sped-end">Data final</Label>
          <Input id="sped-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <Button onClick={handleDownload} disabled={downloading} className="w-full md:w-auto">
        <Download className="w-4 h-4 mr-2" />
        {downloading ? 'Gerando arquivo...' : 'Baixar SPED Fiscal (.txt)'}
      </Button>
    </div>
  );
}
