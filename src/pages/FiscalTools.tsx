import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NFEList } from "@/components/NFEList";
import { FiscalSystem } from "@/components/FiscalSystem";
import { TaxProjection } from "@/components/TaxProjection";
import { XMLImporter } from "@/components/XMLImporter";
import { NfeEntradaPendentes } from "@/components/NfeEntradaPendentes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, Calculator, Receipt, Loader2, Package, ShoppingCart, BarChart3, LogOut, Settings, TrendingUp, ArrowDownToLine } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  cost?: number;
}

interface FiscalKpis {
  emittedToday: number;
  emittedMonth: number;
  pending: number;
  errors: number;
  cancelled: number;
  totalValueMonth: number;
}

export default function FiscalTools() {
  const navigate = useNavigate();
  const { isAdmin, loading, signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [fiscalSettings, setFiscalSettings] = useState<any>(null);
  const [kpis, setKpis] = useState<FiscalKpis>({
    emittedToday: 0, emittedMonth: 0, pending: 0, errors: 0, cancelled: 0, totalValueMonth: 0,
  });

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
    loadFiscalSettings();
    loadKpis();
  }, []);

  const loadKpis = async () => {
    try {
      const { data } = await supabase
        .from('nfe_emissions')
        .select('status, emitted_at, valor_total, created_at');
      if (!data) return;
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      let emittedToday = 0, emittedMonth = 0, pending = 0, errors = 0, cancelled = 0, totalValueMonth = 0;
      data.forEach((e: any) => {
        const status = (e.status || '').toLowerCase();
        const emittedAt = e.emitted_at ? new Date(e.emitted_at) : null;
        if (status === 'authorized' || status === 'autorizado' || status === 'emitida') {
          if (emittedAt && emittedAt >= startToday) emittedToday++;
          if (emittedAt && emittedAt >= startMonth) {
            emittedMonth++;
            totalValueMonth += Number(e.valor_total ?? 0);
          }
        } else if (status === 'pending' || status === 'processando') pending++;
        else if (status === 'error' || status === 'erro' || status === 'rejected') errors++;
        else if (status === 'cancelled' || status === 'cancelado') cancelled++;
      });
      setKpis({ emittedToday, emittedMonth, pending, errors, cancelled, totalValueMonth });
    } catch (err) {
      console.error('Erro ao carregar KPIs fiscais:', err);
    }
  };

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
        {/* KPIs fiscais */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiBox label="NFe hoje" value={String(kpis.emittedToday)} accent="text-green-600" icon={<Receipt className="w-4 h-4" />} />
          <KpiBox label="NFe no mês" value={String(kpis.emittedMonth)} accent="text-green-600" icon={<Receipt className="w-4 h-4" />} />
          <KpiBox label="Valor do mês" value={kpis.totalValueMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} icon={<Calculator className="w-4 h-4" />} />
          <KpiBox label="Pendentes" value={String(kpis.pending)} accent="text-yellow-600" icon={<Loader2 className="w-4 h-4" />} />
          <KpiBox label="Erros" value={String(kpis.errors)} accent="text-red-600" icon={<Receipt className="w-4 h-4" />} />
          <KpiBox label="Canceladas" value={String(kpis.cancelled)} accent="text-muted-foreground" icon={<Receipt className="w-4 h-4" />} />
        </div>

        <Tabs defaultValue="taxes" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="taxes">
              <TrendingUp className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Impostos</span>
            </TabsTrigger>
            <TabsTrigger value="nfe">
              <Receipt className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Notas Fiscais</span>
            </TabsTrigger>
            <TabsTrigger value="entrada">
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Notas de Entrada</span>
            </TabsTrigger>
            <TabsTrigger value="system">
              <Settings className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Sistema Fiscal</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="taxes">
            <TaxProjection />
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

          <TabsContent value="entrada">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5" />
                  Lançar Nota de Entrada
                </CardTitle>
                <CardDescription>
                  Importe o XML (ou PDF) da NF-e enviada pelo seu fornecedor. O sistema extrai os produtos, atualiza o estoque automaticamente e registra a nota no histórico.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <XMLImporter />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system">
            <FiscalSystem />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KpiBox({
  label, value, icon, accent,
}: { label: string; value: string; icon: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-lg font-bold mt-1 ${accent || ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
