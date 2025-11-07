import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ExcelImporter } from "@/components/ExcelImporter";
import { XMLImporter } from "@/components/XMLImporter";
import { FiscalCalculator } from "@/components/FiscalCalculator";
import { NFEList } from "@/components/NFEList";
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header Standalone */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Ferramentas Fiscais</h1>
              <p className="text-xs text-muted-foreground">Cálculos e Importação</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin')}
            >
              <Package className="w-4 h-4 mr-2" />
              Admin
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/pdv')}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              PDV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
            >
              <Home className="w-4 h-4 mr-2" />
              Loja
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
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
            <XMLImporter />
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
