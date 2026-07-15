import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, Loader2, Download, CheckCircle, Save, Eye, X, Link2, Unlink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { LinkExistingProductDialog, type ExistingProductMatch } from './LinkExistingProductDialog';

interface NFEProduct {
  sku: string;
  ean: string;
  nome: string;
  ncm: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  icms?: number;
  ipi?: number;
  pis?: number;
  cofins?: number;
  margem_lucro?: number;
  margem_lucro_pdv?: number;
  margem_lucro_site?: number;
  /** ID de produto já cadastrado para receber o estoque (vínculo manual) */
  vincular_produto_id?: string | null;
  /** Nome do produto vinculado, só para exibição */
  vincular_produto_nome?: string | null;
}

interface NFEData {
  numero: string;
  serie: string;
  data_emissao: string;
  fornecedor: {
    nome: string;
    cnpj: string;
  };
  produtos: NFEProduct[];
  valor_total: number;
  valor_frete?: number;
  chave_acesso?: string;
}

interface XMLImporterProps {
  prefilledXml?: string;
}

export function XMLImporter({ prefilledXml }: XMLImporterProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [nfeData, setNfeData] = useState<NFEData | null>(null);
  const [loading, setLoading] = useState(false);
  const [margemLucro, setMargemLucro] = useState<number>(30);
  const [margemLucroPdv, setMargemLucroPdv] = useState<number>(30);
  const [margemLucroSite, setMargemLucroSite] = useState<number>(30);
  const [processando, setProcessando] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [produtosComMargem, setProdutosComMargem] = useState<NFEProduct[]>([]);
  const [linkingIndex, setLinkingIndex] = useState<number | null>(null);
  const { toast } = useToast();

  // Auto-processar XML pré-carregado (vindo de NfeEntradaPendentes)
  useEffect(() => {
    if (!prefilledXml) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('parse-nfe-xml', {
          body: { xmlContent: prefilledXml },
        });
        const serverError = (data as any)?.error;
        if (error || serverError) {
          let msg = serverError || error?.message || 'Falha';
          try {
            const ctx = (error as any)?.context;
            if (ctx?.json) { const j = await ctx.json(); if (j?.error) msg = j.error; }
            else if (ctx?.text) { const t = await ctx.text(); if (t) msg = t; }
          } catch {}
          throw new Error(msg);
        }
        if (data) {
          setNfeData(data);
          setProdutosComMargem(data.produtos.map((p: NFEProduct) => ({ ...p, margem_lucro: margemLucro, margem_lucro_pdv: margemLucroPdv, margem_lucro_site: margemLucroSite })));
        }
      } catch (err: any) {
        toast({
          title: 'Erro ao processar XML',
          description: err.message || 'Falha',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledXml]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Security: File size validation (10MB max)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast({
          title: 'Arquivo muito grande',
          description: 'Tamanho máximo permitido: 10MB',
          variant: 'destructive',
        });
        return;
      }

      const isXml = selectedFile.name.endsWith('.xml');
      const isPdf = selectedFile.name.endsWith('.pdf');
      
      // Security: MIME type validation
      const allowedTypes = ['application/pdf', 'text/xml', 'application/xml'];
      const isValidMimeType = allowedTypes.includes(selectedFile.type);
      
      if (!isXml && !isPdf && !isValidMimeType) {
        toast({
          title: 'Formato inválido',
          description: 'Por favor, selecione um arquivo XML ou PDF.',
          variant: 'destructive',
        });
        return;
      }
      
      setFile(selectedFile);
      setNfeData(null);
      
      // Se for PDF, criar preview
      if (isPdf) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPdfPreview(e.target?.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPdfPreview(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    try {
      if (file.name.endsWith('.pdf')) {
        // Para PDF, ler como texto e enviar
        const reader = new FileReader();
        const textPromise = new Promise<string>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const arrayBuffer = reader.result as ArrayBuffer;
              const uint8Array = new Uint8Array(arrayBuffer);
              const text = new TextDecoder().decode(uint8Array);
              resolve(text);
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = reject;
        });
        reader.readAsArrayBuffer(file);
        
        const pdfText = await textPromise;
        
        const { data, error } = await supabase.functions.invoke('parse-nfe-xml', {
          body: { 
            xmlContent: pdfText,
            isPdf: true,
            fileName: file.name
          }
        });

        if (error) throw error;
        
        if (data) {
          setNfeData(data);
          setProdutosComMargem(data.produtos.map(p => ({ ...p, margem_lucro: margemLucro, margem_lucro_pdv: margemLucroPdv, margem_lucro_site: margemLucroSite })));
          toast({
            title: 'PDF processado!',
            description: `${data.produtos?.length || 0} produto(s) encontrado(s).`,
          });
        }
      } else {
        // Para XML, processar como texto
        const xmlContent = await file.text();
        
        const { data, error } = await supabase.functions.invoke('parse-nfe-xml', {
          body: { xmlContent }
        });

        if (error) throw error;
        
        if (data) {
          setNfeData(data);
          setProdutosComMargem(data.produtos.map(p => ({ ...p, margem_lucro: margemLucro, margem_lucro_pdv: margemLucroPdv, margem_lucro_site: margemLucroSite })));
          toast({
            title: 'XML processado!',
            description: `${data.produtos?.length || 0} produto(s) encontrado(s).`,
          });
        }
      }
    } catch (error: any) {
      console.error('Erro ao processar arquivo:', error);
      toast({
        title: 'Erro ao processar arquivo',
        description: error.message || 'Não foi possível processar o arquivo. Para PDFs complexos, tente fazer upload diretamente no chat.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const registrarProdutos = async () => {
    if (!nfeData) return;

    setProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-nfe-entrada', {
        body: { 
          nfeData: {
            ...nfeData,
            produtos: produtosComMargem
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Produtos registrados!',
        description: data.message,
      });

      // Limpar dados após registro
      setNfeData(null);
      setFile(null);
      setProdutosComMargem([]);
    } catch (error: any) {
      console.error('Erro ao registrar produtos:', error);
      toast({
        title: 'Erro ao registrar produtos',
        description: error.message || 'Não foi possível registrar os produtos.',
        variant: 'destructive',
      });
    } finally {
      setProcessando(false);
    }
  };

  const updateMargemProduto = (index: number, margem: number) => {
    setProdutosComMargem(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], margem_lucro: margem };
      return updated;
    });
  };

  const updateMargemPdvProduto = (index: number, margem: number) => {
    setProdutosComMargem(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], margem_lucro_pdv: margem };
      return updated;
    });
  };

  const updateMargemSiteProduto = (index: number, margem: number) => {
    setProdutosComMargem(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], margem_lucro_site: margem };
      return updated;
    });
  };

  const setLinkedProduct = (index: number, linked: ExistingProductMatch | null) => {
    setProdutosComMargem(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        vincular_produto_id: linked?.id ?? null,
        vincular_produto_nome: linked?.name ?? null,
      };
      return updated;
    });
    if (linked) {
      toast({
        title: 'Produto vinculado',
        description: `Estoque será somado em "${linked.name}".`,
      });
    } else {
      toast({ title: 'Vínculo removido' });
    }
  };

  const aplicarMargemTodos = () => {
    setProdutosComMargem(prev => prev.map(p => ({ ...p, margem_lucro: margemLucro, margem_lucro_pdv: margemLucroPdv, margem_lucro_site: margemLucroSite })));
    toast({
      title: 'Margem aplicada!',
      description: `Margem PDV ${margemLucroPdv}% e Site ${margemLucroSite}% aplicadas a todos os produtos.`,
    });
  };

  const exportToExcel = () => {
    if (!nfeData) return;

    const csvContent = [
      ['SKU', 'EAN', 'Nome', 'NCM', 'Quantidade', 'Valor Unitário', 'Valor Total'].join(','),
      ...nfeData.produtos.map(p => 
        [p.sku, p.ean, `"${p.nome}"`, p.ncm, p.quantidade, p.valor_unitario, p.valor_total].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nfe_${nfeData.numero}_produtos.csv`;
    link.click();

    toast({
      title: 'Exportado!',
      description: 'Os dados foram exportados para CSV.',
    });
  };

  return (
    <div className="space-y-4">
      {!prefilledXml && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Importar XML da NFe
            </CardTitle>
            <CardDescription>
              Faça upload do arquivo XML ou PDF da Nota Fiscal Eletrônica para extrair automaticamente os dados dos produtos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="file"
                  accept=".xml,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="xml-upload"
                />
                <label
                  htmlFor="xml-upload"
                  className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {file ? file.name : 'Selecionar arquivo XML ou PDF'}
                </label>
              </div>
              
              {pdfPreview && (
                <Button
                  onClick={() => setShowPreview(true)}
                  variant="outline"
                  className="sm:w-auto w-full"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Visualizar PDF
                </Button>
              )}
              
              <Button
                onClick={handleUpload}
                disabled={!file || loading}
                className="sm:w-auto w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Processar
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {nfeData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              NFe processada com sucesso
            </CardTitle>
            <CardDescription>
              Revise os produtos abaixo e confirme para somar ao estoque
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-primary/5 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Número:</span> {nfeData.numero}
                </div>
                <div>
                  <span className="text-muted-foreground">Série:</span> {nfeData.serie}
                </div>
                <div>
                  <span className="text-muted-foreground">Data:</span> {new Date(nfeData.data_emissao).toLocaleDateString('pt-BR')}
                </div>
                <div>
                  <span className="text-muted-foreground">Valor Total:</span> R$ {nfeData.valor_total.toFixed(2)}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Fornecedor:</span> {nfeData.fornecedor.nome} ({nfeData.fornecedor.cnpj})
                </div>
                {nfeData.valor_frete && nfeData.valor_frete > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Frete:</span> R$ {nfeData.valor_frete.toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border rounded-lg space-y-3">
              <div className="space-y-2">
                <Label>Margens de Lucro Padrão (%)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="margem-pdv" className="text-xs text-muted-foreground">Margem PDV (%)</Label>
                    <Input
                      id="margem-pdv"
                      type="number"
                      min="0"
                      max="500"
                      step="0.1"
                      value={margemLucroPdv}
                      onChange={(e) => setMargemLucroPdv(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="margem-site" className="text-xs text-muted-foreground">Margem Site (%)</Label>
                    <Input
                      id="margem-site"
                      type="number"
                      min="0"
                      max="500"
                      step="0.1"
                      value={margemLucroSite}
                      onChange={(e) => setMargemLucroSite(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <Button onClick={aplicarMargemTodos} variant="outline" className="w-full">
                  Aplicar a Todos
                </Button>
                <p className="text-xs text-muted-foreground">
                  Define as margens padrão para preço de PDV e preço do site. Você pode personalizar cada produto na tabela abaixo.
                </p>
              </div>


              <Button 
                onClick={registrarProdutos} 
                disabled={processando}
                className="w-full"
                size="lg"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando produtos...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Registrar {nfeData.produtos.length} Produto(s) Automaticamente
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {nfeData && nfeData.produtos.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Produtos Extraídos</CardTitle>
                <CardDescription className="text-xs">
                  {nfeData.produtos.length} item(ns) — revise margens e vínculos
                </CardDescription>
              </div>
              <Button onClick={exportToExcel} variant="outline" size="sm">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="border rounded-lg divide-y max-h-[55vh] overflow-y-auto">
              {produtosComMargem.map((produto, index) => (
                <div
                  key={index}
                  className="p-2.5 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/30"
                >
                  {/* Nome + metadados */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={produto.nome}>
                      {produto.nome}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                      {produto.sku && <span>SKU {produto.sku}</span>}
                      {produto.ean && <span>EAN {produto.ean}</span>}
                      {produto.ncm && <span>NCM {produto.ncm}</span>}
                    </div>
                    {produto.vincular_produto_id && (
                      <Badge variant="secondary" className="text-[10px] mt-1 max-w-full">
                        <Link2 className="w-3 h-3 mr-1 shrink-0" />
                        <span className="truncate">→ {produto.vincular_produto_nome}</span>
                      </Badge>
                    )}
                  </div>

                  {/* Valores */}
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">Qtd</div>
                      <div className="font-semibold">{produto.quantidade}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">Unit.</div>
                      <div>R$ {produto.valor_unitario.toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">Total</div>
                      <div className="font-semibold">R$ {produto.valor_total.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Margens */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div>
                      <div className="text-[10px] text-muted-foreground leading-tight">PDV %</div>
                      <Input
                        type="number"
                        min="0"
                        max="500"
                        step="0.1"
                        value={produto.margem_lucro_pdv ?? margemLucroPdv}
                        onChange={(e) => updateMargemPdvProduto(index, parseFloat(e.target.value) || 0)}
                        className="w-16 h-8 text-right text-xs px-2"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground leading-tight">Site %</div>
                      <Input
                        type="number"
                        min="0"
                        max="500"
                        step="0.1"
                        value={produto.margem_lucro_site ?? margemLucroSite}
                        onChange={(e) => updateMargemSiteProduto(index, parseFloat(e.target.value) || 0)}
                        className="w-16 h-8 text-right text-xs px-2"
                      />
                    </div>
                  </div>

                  {/* Ação */}
                  <div className="shrink-0">
                    {produto.vincular_produto_id ? (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setLinkedProduct(index, null)}>
                        <Unlink className="w-3.5 h-3.5 mr-1" />
                        Desvincular
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setLinkingIndex(index)}>
                        <Link2 className="w-3.5 h-3.5 mr-1" />
                        Já existe?
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Dialog de Preview do PDF */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Pré-visualização do PDF</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPreview(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh] w-full">
            {pdfPreview && (
              <iframe
                src={pdfPreview}
                className="w-full h-full min-h-[600px] border rounded"
                title="PDF Preview"
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Dialog de vincular a produto existente */}
      {linkingIndex !== null && produtosComMargem[linkingIndex] && (
        <LinkExistingProductDialog
          open={linkingIndex !== null}
          onOpenChange={(open) => !open && setLinkingIndex(null)}
          nfeProductName={produtosComMargem[linkingIndex].nome}
          nfeProductCode={produtosComMargem[linkingIndex].ean || produtosComMargem[linkingIndex].sku}
          currentLinkedId={produtosComMargem[linkingIndex].vincular_produto_id ?? null}
          onSelect={(p) => setLinkedProduct(linkingIndex, p)}
        />
      )}
    </div>
  );
}