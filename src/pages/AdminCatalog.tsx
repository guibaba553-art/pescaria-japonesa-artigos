import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Package, Tags, FileEdit, Star, PackageX } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { ProductsManagement } from '@/components/ProductsManagement';
import { CategoriesManagement } from '@/components/CategoriesManagement';
import { DraftProducts } from '@/components/DraftProducts';
import { FeaturedManagement } from '@/components/FeaturedManagement';
import { RestockManagement } from '@/components/RestockManagement';

export default function AdminCatalog() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();
  const [draftCount, setDraftCount] = useState(0);
  const [restockCount, setRestockCount] = useState(0);

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
          <TabsList className="bg-muted/50 p-1 h-auto inline-flex md:flex flex-nowrap md:flex-wrap gap-1 w-max md:w-auto">
            <TabsTrigger value="products" className="gap-2 shrink-0">
              <Package className="w-4 h-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2 shrink-0">
              <Tags className="w-4 h-4" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2 relative shrink-0">
              <FileEdit className="w-4 h-4" /> Rascunhos
              {draftCount > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                  {draftCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="featured" className="gap-2 shrink-0">
              <Star className="w-4 h-4" /> Destaques
            </TabsTrigger>
            <TabsTrigger value="restock" className="gap-2 relative shrink-0">
              <PackageX className="w-4 h-4" /> Reestoque
              {restockCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                  {restockCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products"><ProductsManagement /></TabsContent>
        <TabsContent value="categories"><CategoriesManagement /></TabsContent>
        <TabsContent value="drafts"><DraftProducts onChange={loadDraftCount} /></TabsContent>
        <TabsContent value="featured"><FeaturedManagement /></TabsContent>
        <TabsContent value="restock"><RestockManagement onChange={() => {}} /></TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
