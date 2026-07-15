import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, FileCheck, X, Eye, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { XMLImporter } from "./XMLImporter";

interface NfePendente {
  id: string;
  chave_nfe: string;
  numero_nfe: string | null;
  serie: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  xml_content: string;
  status: string;
  manifestacao_status: string | null;
  created_at: string;
}

export function NfeEntradaPendentes() {
  const [pendentes, setPendentes] = useState<NfePendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'processado' | 'ignorado'>('pendente');
  const [xmlPreview, setXmlPreview] = useState<NfePendente | null>(null);
  const [importingXml, setImportingXml] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<any | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('nfe_entrada_pendentes')
      .select('*')
      .eq('status', filtroStatus)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar notas pendentes');
    } else {
      setPendentes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, [filtroStatus]);

  const buscarAgora = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-dfe-focus', {
        body: { manual: true },
      });
      if (error) throw error;
      setDiagnostico(data);
      if (data?.skipped) {
        toast.info(data.reason || 'Busca não executada');
      } else if ((data?.total_consultadas ?? 0) === 0) {
        toast.warning('A Focus retornou 0 notas. Veja o diagnóstico abaixo.');
      } else {
        toast.success(`${data.baixadas} nota(s) baixada(s), ${data.manifestadas} manifestada(s)`);
      }
      carregar();
    } catch (err: any) {
      toast.error(`Erro ao buscar: ${err.message || err}`);
    } finally {
      setFetching(false);
    }
  };

  const marcarComo = async (id: string, novoStatus: 'ignorado' | 'processado') => {
    const { error } = await supabase
      .from('nfe_entrada_pendentes')
      .update({
        status: novoStatus,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar');
    } else {
      toast.success(`Nota ${novoStatus === 'ignorado' ? 'ignorada' : 'processada'}`);
      carregar();
    }
  };

  const baixarXml = (item: NfePendente) => {
    const blob = new Blob([item.xml_content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfe-${item.chave_nfe}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);
  const baixarPdf = async (item: NfePendente) => {
    setBaixandoPdf(item.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão expirada');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-danfe-focus`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave: item.chave_nfe }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const dl = document.createElement('a');
      dl.href = URL.createObjectURL(blob);
      dl.download = `danfe-${item.chave_nfe}.pdf`;
      dl.click();
      URL.revokeObjectURL(dl.href);
      toast.success('DANFE baixada');
    } catch (e: any) {
      toast.error(`Erro ao baixar PDF: ${e.message}`);
    } finally {
      setBaixandoPdf(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['pendente', 'processado', 'ignorado'] as const).map((s) => (
            <Button
              key={s}
              variant={filtroStatus === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroStatus(s)}
            >
              {s === 'pendente' ? 'Pendentes' : s === 'processado' ? 'Processadas' : 'Ignoradas'}
            </Button>
          ))}
        </div>
        <Button onClick={buscarAgora} disabled={fetching} size="sm">
          {fetching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Buscar notas agora
        </Button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
        💡 O sistema busca automaticamente novas notas da Focus NFe a cada 1 hora.
        As notas baixadas ficam aqui aguardando sua revisão antes de atualizar o estoque.
      </div>

      {diagnostico && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <strong className="text-sm">Diagnóstico da última busca</strong>
              <Button size="sm" variant="ghost" onClick={() => setDiagnostico(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Consultadas na Focus</div>
                <div className="text-lg font-bold">{diagnostico.total_consultadas ?? 0}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Baixadas</div>
                <div className="text-lg font-bold text-green-600">{diagnostico.baixadas ?? 0}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Manifestadas</div>
                <div className="text-lg font-bold">{diagnostico.manifestadas ?? 0}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Erros</div>
                <div className={`text-lg font-bold ${diagnostico.erros ? 'text-destructive' : ''}`}>
                  {diagnostico.erros ?? 0}
                </div>
              </div>
            </div>

            {(diagnostico.total_consultadas ?? 0) === 0 && !diagnostico.skipped && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs space-y-1">
                <div className="font-semibold text-yellow-700 dark:text-yellow-400">
                  ⚠ A Focus NFe respondeu com sucesso, mas retornou 0 notas.
                </div>
                <div className="text-muted-foreground">Causas mais comuns:</div>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Serviço <strong>"Download automático de NFe (DFe)"</strong> não habilitado no painel da Focus para o seu CNPJ</li>
                  <li>Certificado digital A1 não enviado ou vencido na Focus</li>
                  <li>Não há NFes novas emitidas contra seu CNPJ desde a última consulta</li>
                  <li>NSU já está atualizado (todas as notas anteriores já foram baixadas)</li>
                </ul>
              </div>
            )}

            {diagnostico.detalhes && diagnostico.detalhes.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver detalhes ({diagnostico.detalhes.length})
                </summary>
                <pre className="mt-2 bg-muted p-2 rounded overflow-auto max-h-48 text-[10px]">
                  {JSON.stringify(diagnostico.detalhes, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : pendentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma nota {filtroStatus}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pendentes.map((item) => (
            <Card
              key={item.id}
              className={
                item.status === 'processado'
                  ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50'
                  : ''
              }
            >
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {item.fornecedor_nome || 'Fornecedor desconhecido'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        NF-e {item.numero_nfe || '?'} / Série {item.serie || '?'}
                      </Badge>
                      {item.manifestacao_status === 'ciencia' && (
                        <Badge variant="secondary" className="text-xs">
                          ✓ Ciência manifestada
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>CNPJ: {item.fornecedor_cnpj || '—'}</div>
                      <div>Chave: <code className="text-[10px]">{item.chave_nfe}</code></div>
                      <div>
                        Emitida em:{' '}
                        {item.data_emissao
                          ? new Date(item.data_emissao).toLocaleString('pt-BR')
                          : '—'}{' '}
                        • Valor:{' '}
                        <strong>
                          {(item.valor_total || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setXmlPreview(item)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => baixarXml(item)}
                      title="Baixar XML"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => baixarPdf(item)}
                      disabled={baixandoPdf === item.id}
                      title="Baixar DANFE (PDF)"
                    >
                      {baixandoPdf === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </Button>
                    {filtroStatus === 'pendente' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setImportingXml(item.xml_content)}
                        >
                          <FileCheck className="w-4 h-4 mr-1" />
                          Processar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => marcarComo(item.id, 'ignorado')}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Ignorar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview XML */}
      <Dialog open={!!xmlPreview} onOpenChange={() => setXmlPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>XML da NF-e</DialogTitle>
            <DialogDescription>{xmlPreview?.chave_nfe}</DialogDescription>
          </DialogHeader>
          <pre className="text-[10px] bg-muted p-3 rounded overflow-auto max-h-[60vh]">
            {xmlPreview?.xml_content}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Importar XML pré-carregado */}
      <Dialog open={!!importingXml} onOpenChange={() => setImportingXml(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Processar nota de entrada</DialogTitle>
            <DialogDescription>
              Revise os produtos e confirme para somar ao estoque.
            </DialogDescription>
          </DialogHeader>
          {importingXml && <XMLImporter prefilledXml={importingXml} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
