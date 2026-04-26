import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Tags, FileEdit, Star, Building2, Ticket, AlertTriangle, Tag } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';

// Cada aba é um pacote pesado — só baixa quando o usuário abre
const ProductsManagement = lazy(() =>
  import('@/components/ProductsManagement').then((m) => ({ default: m.ProductsManagement }))
);
const CategoriesManagement = lazy(() =>
  import('@/components/CategoriesManagement').then((m) => ({ default: m.CategoriesManagement }))
);
const DraftProducts = lazy(() =>
  import('@/components/DraftProducts').then((m) => ({ default: m.DraftProducts }))
);
const FeaturedManagement = lazy(() =>
  import('@/components/FeaturedManagement').then((m) => ({ default: m.FeaturedManagement }))
);
const SuppliersManagement = lazy(() =>
  import('@/components/SuppliersManagement').then((m) => ({ default: m.SuppliersManagement }))
);
const CouponsManagement = lazy(() =>
  import('@/components/CouponsManagement').then((m) => ({ default: m.CouponsManagement }))
);
const StockAlerts = lazy(() =>
  import('@/components/StockAlerts').then((m) => ({ default: m.StockAlerts }))
);
const LabelsManagement = lazy(() =>
  import('@/components/LabelsManagement').then((m) => ({ default: m.LabelsManagement }))
);

const TabFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" />
    Carregando...
  </div>
);

export default function AdminCatalog() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isEmployee, isAdmin, loading, navigate]);

  const loadDraftCount = async () => {
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'Pendente Revisão');
    setDraftCount(count ?? 0);
  };

  useEffect(() => {
    loadDraftCount();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!isEmployee && !isAdmin) return null;

  return (
    <AdminPageLayout
      icon={Package}
      eyebrow="Catálogo"
      title="Gestão de Catálogo"
      description="Gerencie produtos, categorias, rascunhos e destaques do seu e-commerce em um só lugar."
    >
      <Tabs defaultValue="products" className="space-y-4 md:space-y-6">
        <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto scrollbar-hide">
          <TabsList className="bg-background border border-border shadow-sm p-1 h-auto inline-flex md:flex flex-nowrap md:flex-wrap gap-1 w-max md:w-auto">
            <TabsTrigger value="products" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <Package className="w-4 h-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <AlertTriangle className="w-4 h-4" /> Alertas
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <Tags className="w-4 h-4" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <Building2 className="w-4 h-4" /> Fornecedores
            </TabsTrigger>
            <TabsTrigger value="coupons" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <Ticket className="w-4 h-4" /> Cupons
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2 relative shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <FileEdit className="w-4 h-4" /> Rascunhos
              {draftCount > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                  {draftCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="featured" className="gap-2 shrink-0 text-muted-foreground data-[state=active]:text-foreground">
              <Star className="w-4 h-4" /> Destaques
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products">
          <Suspense fallback={<TabFallback />}><ProductsManagement /></Suspense>
        </TabsContent>
        <TabsContent value="alerts">
          <Suspense fallback={<TabFallback />}><StockAlerts /></Suspense>
        </TabsContent>
        <TabsContent value="categories">
          <Suspense fallback={<TabFallback />}><CategoriesManagement /></Suspense>
        </TabsContent>
        <TabsContent value="suppliers">
          <Suspense fallback={<TabFallback />}><SuppliersManagement /></Suspense>
        </TabsContent>
        <TabsContent value="coupons">
          <Suspense fallback={<TabFallback />}><CouponsManagement /></Suspense>
        </TabsContent>
        <TabsContent value="drafts">
          <Suspense fallback={<TabFallback />}><DraftProducts onChange={loadDraftCount} /></Suspense>
        </TabsContent>
        <TabsContent value="featured">
          <Suspense fallback={<TabFallback />}><FeaturedManagement /></Suspense>
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
