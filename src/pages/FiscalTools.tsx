import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, Calculator, Receipt, Loader2, Package, ShoppingCart, BarChart3, LogOut, Settings, TrendingUp, ArrowDownToLine, FileSpreadsheet } from "lucide-react";

const NFEList = lazy(() =>
  import("@/components/NFEList").then((m) => ({ default: m.NFEList }))
);
const FiscalSystem = lazy(() =>
  import("@/components/FiscalSystem").then((m) => ({ default: m.FiscalSystem }))
);
const TaxProjection = lazy(() =>
  import("@/components/TaxProjection").then((m) => ({ default: m.TaxProjection }))
);
const NfeEntradaPendentes = lazy(() =>
  import("@/components/NfeEntradaPendentes").then((m) => ({ default: m.NfeEntradaPendentes }))
);
const XMLImporter = lazy(() =>
  import("@/components/XMLImporter").then((m) => ({ default: m.XMLImporter }))
);
const AccountantReport = lazy(() =>
  import("@/components/AccountantReport").then((m) => ({ default: m.AccountantReport }))
);

const FiscalTabFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" />
    Carregando módulo fiscal...
  </div>
);

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
  const { isAdmin, permissions, loading, signOut } = useAuth();
  const canView = isAdmin || permissions.fiscal;
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [fiscalSettings, setFiscalSettings] = useState<any>(null);
  const [kpis, setKpis] = useState<FiscalKpis>({
    emittedToday: 0, emittedMonth: 0, pending: 0, errors: 0, cancelled: 0, totalValueMonth: 0,
  });

  useEffect(() => {
    if (!loading && !canView) {
      navigate('/admin');
    }
  }, [canView, loading, navigate]);

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
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="contador">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Contador</span>
            </TabsTrigger>
            <TabsTrigger value="system">
              <Settings className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Sistema Fiscal</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="taxes">
            <Suspense fallback={<FiscalTabFallback />}>
              <TaxProjection />
            </Suspense>
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
                <Suspense fallback={<FiscalTabFallback />}>
                  <NFEList settings={fiscalSettings} onRefresh={loadFiscalSettings} />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entrada">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5" />
                  Notas Fiscais de Entrada
                </CardTitle>
                <CardDescription>
                  Revise as notas baixadas automaticamente da Focus NFe ou importe manualmente um XML/PDF de uma nota recebida.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="auto" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="auto">Recebidas automaticamente</TabsTrigger>
                    <TabsTrigger value="manual">Importar manualmente</TabsTrigger>
                  </TabsList>
                  <TabsContent value="auto">
                    <Suspense fallback={<FiscalTabFallback />}>
                      <NfeEntradaPendentes />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="manual">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 mb-4">
                      📄 Use esta opção quando receber uma NF-e que não foi baixada automaticamente
                      (ex.: fornecedor enviou o XML por e-mail). Faça upload do XML (.xml) ou do
                      DANFE em PDF — o sistema extrai os produtos, permite ajustar a margem de lucro
                      e soma ao estoque, marcando os novos itens como pendentes de etiqueta.
                    </div>
                    <Suspense fallback={<FiscalTabFallback />}>
                      <XMLImporter />
                    </Suspense>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contador">
            <Suspense fallback={<FiscalTabFallback />}>
              <AccountantReport />
            </Suspense>
          </TabsContent>

          <TabsContent value="system">
            <Suspense fallback={<FiscalTabFallback />}>
              <FiscalSystem />
            </Suspense>
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
