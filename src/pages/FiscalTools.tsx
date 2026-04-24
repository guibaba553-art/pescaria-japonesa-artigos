import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ExcelImporter } from "@/components/ExcelImporter";
import { XMLImporter } from "@/components/XMLImporter";
import { FiscalCalculator } from "@/components/FiscalCalculator";
import { NFEList } from "@/components/NFEList";
import { NFEHistory } from "@/components/NFEHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, Calculator, FileSpreadsheet, Receipt, Loader2, Package, ShoppingCart, BarChart3, LogOut } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  cost?: number;
}

export default function FiscalTools() {
  const navigate = useNavigate();
  const { isAdmin, loading, signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [fiscalSettings, setFiscalSettings] = useState<any>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
    loadFiscalSettings();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadFiscalSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('fiscal_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      setFiscalSettings(data);
    } catch (error) {
      console.error('Erro ao carregar configurações fiscais:', error);
    }
  };

  const handleExcelImport = (data: any[]) => {
    console.log('Dados importados do Excel:', data);
    // Aqui você pode processar e salvar os dados importados
  };

  if (loading || loadingProducts) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky utility bar */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            <span className="font-display font-bold text-sm">Ferramentas Fiscais</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="rounded-full">
              <Package className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/pdv')} className="rounded-full">
              <ShoppingCart className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDV</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="rounded-full">
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="rounded-full">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Loja</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="rounded-full">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Commercial dark banner */}
      <div className="bg-foreground text-background py-8">
        <div className="container mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Fiscal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
            Ferramentas Fiscais
          </h1>
          <p className="text-sm text-background/60 mt-1">
            Calculadora, importação XML/Excel e emissão de NFe.
          </p>
        </div>
      </div>

      <div className="container mx-auto p-6 -mt-4 space-y-6">
        <Tabs defaultValue="calculator" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="calculator">
              <Calculator className="w-4 h-4 mr-2" />
              Calculadora Fiscal
            </TabsTrigger>
            <TabsTrigger value="xml">
              <Receipt className="w-4 h-4 mr-2" />
              Importar XML NFe
            </TabsTrigger>
            <TabsTrigger value="excel">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Importar Excel
            </TabsTrigger>
            <TabsTrigger value="nfe">
              <Receipt className="w-4 h-4 mr-2" />
              Notas Fiscais
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <FiscalCalculator products={products} />
          </TabsContent>

          <TabsContent value="xml">
            <div className="space-y-6">
              <XMLImporter />
              <NFEHistory />
            </div>
          </TabsContent>

          <TabsContent value="excel">
            <ExcelImporter
              onDataImported={handleExcelImport}
              expectedColumns={['nome', 'preco', 'custo', 'estoque', 'categoria']}
            />
            
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Formato Esperado</CardTitle>
                <CardDescription>
                  Sua planilha deve conter as seguintes colunas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>nome</strong>: Nome do produto</li>
                  <li><strong>preco</strong>: Preço de venda (número)</li>
                  <li><strong>custo</strong>: Custo do produto (número, opcional)</li>
                  <li><strong>estoque</strong>: Quantidade em estoque (número)</li>
                  <li><strong>categoria</strong>: Categoria do produto</li>
                  <li><strong>sku</strong>: Código do produto (opcional)</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nfe">
            <Card>
              <CardHeader>
                <CardTitle>Notas Fiscais Emitidas</CardTitle>
                <CardDescription>
                  Visualize notas de entrada e saída separadamente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NFEList settings={fiscalSettings} onRefresh={loadFiscalSettings} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
