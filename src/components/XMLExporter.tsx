import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Download, Calendar, ShieldCheck, Archive } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function XMLExporter() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const handleBackup = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Datas obrigatórias',
        description: 'Selecione o período do backup',
        variant: 'destructive',
      });
      return;
    }

    setDownloading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão expirada — faça login novamente');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fiscal-backup`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const total = res.headers.get('X-Backup-Count') || '0';
      const ok = res.headers.get('X-Backup-Downloaded') || '0';
      const fail = res.headers.get('X-Backup-Failed') || '0';

      if (Number(total) === 0) {
        toast({
          title: 'Nenhuma nota encontrada',
          description: 'Não há NF-e/NFC-e autorizadas no período.',
        });
        return;
      }

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup-fiscal-${startDate}_a_${endDate}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);

      toast({
        title: '✅ Backup gerado',
        description: `${total} notas · ${ok} XMLs baixados${
          Number(fail) > 0 ? ` · ${fail} falhas` : ''
        }`,
      });
    } catch (e: any) {
      toast({
        title: 'Erro ao gerar backup',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const setPreset = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          <strong>Guarda obrigatória de 5 anos</strong> (Art. 173 do CTN e Art. 195 da CF/88).
          Gere um ZIP completo com todos os XMLs (entrada e saída), manifesto JSON e CSV resumo
          para enviar ao contador ou armazenar em mídia externa.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreset(1)}>Último mês</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset(3)}>Últimos 3 meses</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset(12)}>Último ano</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset(60)}>Últimos 5 anos</Button>
        </div>

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

        <Button
          onClick={handleBackup}
          disabled={downloading}
          className="w-full"
          size="lg"
        >
          {downloading ? (
            <>
              <Archive className="w-4 h-4 mr-2 animate-pulse" />
              Compactando XMLs e gerando ZIP...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Baixar Backup Fiscal Completo (.zip)
            </>
          )}
        </Button>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> O que vai dentro do ZIP:
          </div>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li><code>/xmls/saida/</code> — todas as NFC-e/NF-e emitidas</li>
            <li><code>/xmls/entrada/</code> — XMLs de notas de fornecedores</li>
            <li><code>manifest.json</code> — dados estruturados (chave, protocolo, valor)</li>
            <li><code>resumo.csv</code> — planilha pronta para o contador</li>
            <li><code>LEIA-ME.txt</code> — instruções de guarda legal</li>
          </ul>
          <div className="pt-2 text-amber-600 dark:text-amber-400">
            💡 Recomendação: faça este backup <strong>mensalmente</strong> e guarde em
            ao menos 2 lugares (HD externo + nuvem pessoal).
          </div>
        </div>
      </div>
    </div>
  );
}
