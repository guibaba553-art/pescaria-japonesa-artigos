import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, TrendingUp, ShoppingCart, DollarSign, Calculator,
  Package, ClipboardList, Users, ShieldCheck, CalendarRange, ScanBarcode,
  FileUp,
} from 'lucide-react';
import { Header } from '@/components/Header';

interface ProductLite {
  id: string;
  category: string;
  stock: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, permissions, loading } = useAuth();
  const [products, setProducts] = useState<ProductLite[]>([]);

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isEmployee, isAdmin, loading, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('products').select('id, category, stock');
      setProducts(data || []);
    })();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isEmployee && !isAdmin) {
    return null;
  }

  const draftCount = products.filter((p) => p.category === 'Pendente Revisão').length;
  const visible = products.filter((p) => p.category !== 'Pendente Revisão');
  const outOfStock = visible.filter((p) => p.stock === 0).length;

  const quickAccess = [
    { icon: TrendingUp, title: 'Dashboard', desc: 'Relatórios e análises', path: '/dashboard', perm: 'dashboard' as const },
    { icon: ShoppingCart, title: 'PDV', desc: 'Vendas presenciais', path: '/pdv', perm: 'pdv' as const },
    { icon: DollarSign, title: 'Caixa', desc: 'Abertura e fechamento', path: '/fechamento-caixa', perm: 'cash_register' as const },
    { icon: Calculator, title: 'Fiscal', desc: 'IA, Excel e impostos', path: '/ferramentas-fiscais', perm: 'fiscal' as const },
  ];

  const sections: Array<{
    title: string;
    desc: string;
    icon: typeof Package;
    path: string;
    badge?: number;
    stats?: string;
    adminOnly?: boolean;
    perm?: keyof typeof permissions;
  }> = [
    {
      title: 'Catálogo',
      desc: 'Produtos, categorias, rascunhos e destaques',
      icon: Package,
      path: '/admin/catalogo',
      badge: draftCount,
      stats: `${visible.length} produtos · ${outOfStock} esgotados`,
      perm: 'catalog',
    },
    {
      title: 'Vendas',
      desc: 'Vendas por período (calendário) com somatória',
      icon: CalendarRange,
      path: '/admin/analise',
      perm: 'sales_analysis',
    },
    {
      title: 'Pedidos',
      desc: 'Vendas online com filtros por dia',
      icon: ClipboardList,
      path: '/admin/pedidos',
      perm: 'orders',
    },
    {
      title: 'Triagem',
      desc: 'Conferir retiradas e embalar envios por código de barras',
      icon: ScanBarcode,
      path: '/admin/triagem',
      perm: 'triagem',
    },
    {
      title: 'Funcionários',
      desc: 'Permissões e acessos da equipe',
      icon: Users,
      path: '/admin/funcionarios',
      adminOnly: true,
    },
    {
      title: 'LGPD / ROPA',
      desc: 'Registro de tratamento de dados',
      icon: ShieldCheck,
      path: '/admin/lgpd',
      adminOnly: true,
    },
    {
      title: 'Migração de Estoque',
      desc: 'Importar estoque antigo a partir de PDF',
      icon: FileUp,
      path: '/admin/migracao-estoque',
      adminOnly: true,
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider">Painel</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Painel Administrativo
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Gerencie catálogo, pedidos, equipe, caixa e ferramentas fiscais.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground self-start md:self-end"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Site
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 -mt-4">
        {(() => {
          const quickFiltered = quickAccess
            .filter((q) => isAdmin || permissions[q.perm])
            .map((q) => ({ icon: q.icon, title: q.title, desc: q.desc, path: q.path, badge: undefined as number | undefined }));
          const sectionsFiltered = sections
            .filter((s) => {
              if (s.adminOnly) return isAdmin;
              if (isAdmin) return true;
              return s.perm ? permissions[s.perm] : true;
            })
            .map((s) => ({ icon: s.icon, title: s.title, desc: s.desc, path: s.path, badge: s.badge }));
          const allItems = [...quickFiltered, ...sectionsFiltered];

          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {allItems.map(({ icon: Icon, title, desc, path, badge }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="group relative text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col h-full"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    {badge !== undefined && badge > 0 && (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        {badge}
                      </Badge>
                    )}
                  </div>
                  <div className="font-display font-bold text-base leading-tight">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{desc}</div>
                </button>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
