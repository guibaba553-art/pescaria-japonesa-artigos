import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, Loader2, Download, CheckCircle, Save, Eye, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export function XMLImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [nfeData, setNfeData] = useState<NFEData | null>(null);
  const [loading, setLoading] = useState(false);
  const [margemLucro, setMargemLucro] = useState<number>(30);
  const [processando, setProcessando] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [produtosComMargem, setProdutosComMargem] = useState<NFEProduct[]>([]);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const isXml = selectedFile.name.endsWith('.xml');
      const isPdf = selectedFile.name.endsWith('.pdf');
      
      if (!isXml && !isPdf) {
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
          setProdutosComMargem(data.produtos.map(p => ({ ...p, margem_lucro: margemLucro })));
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
          setProdutosComMargem(data.produtos.map(p => ({ ...p, margem_lucro: margemLucro })));
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

  const aplicarMargemTodos = () => {
    setProdutosComMargem(prev => prev.map(p => ({ ...p, margem_lucro: margemLucro })));
    toast({
      title: 'Margem aplicada!',
      description: `Margem de ${margemLucro}% aplicada a todos os produtos.`,
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

          {nfeData && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  NFe processada com sucesso
                </div>
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
                  <Label htmlFor="margem-lucro">Margem de Lucro Padrão (%)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="margem-lucro"
                      type="number"
                      min="0"
                      max="500"
                      step="0.1"
                      value={margemLucro}
                      onChange={(e) => setMargemLucro(parseFloat(e.target.value) || 0)}
                      className="flex-1"
                    />
                    <Button onClick={aplicarMargemTodos} variant="outline">
                      Aplicar a Todos
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define a margem de lucro padrão. Você pode personalizar cada produto na tabela abaixo.
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
            </div>
          )}
        </CardContent>
      </Card>

      {nfeData && nfeData.produtos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Produtos Extraídos</CardTitle>
                <CardDescription>
                  {nfeData.produtos.length} produto(s) encontrado(s) na NFe
                </CardDescription>
              </div>
              <Button onClick={exportToExcel} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>NCM</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Margem %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosComMargem.map((produto, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs">{produto.sku || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{produto.ean || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{produto.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{produto.ncm || '-'}</TableCell>
                      <TableCell className="text-right">{produto.quantidade}</TableCell>
                      <TableCell className="text-right">R$ {produto.valor_unitario.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">R$ {produto.valor_total.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          max="500"
                          step="0.1"
                          value={produto.margem_lucro || margemLucro}
                          onChange={(e) => updateMargemProduto(index, parseFloat(e.target.value) || 0)}
                          className="w-20 text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
}