import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, TrendingUp, ShoppingCart, DollarSign, Calculator,
  Package, ClipboardList, Users,
} from 'lucide-react';
import { Header } from '@/components/Header';

interface ProductLite {
  id: string;
  category: string;
  stock: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();
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
    { icon: TrendingUp, title: 'Dashboard', desc: 'Relatórios e análises', path: '/dashboard' },
    { icon: ShoppingCart, title: 'PDV', desc: 'Vendas presenciais', path: '/pdv' },
    { icon: DollarSign, title: 'Caixa', desc: 'Abertura e fechamento', path: '/fechamento-caixa' },
    { icon: Calculator, title: 'Fiscal', desc: 'IA, Excel e impostos', path: '/ferramentas-fiscais' },
  ];

  const sections: Array<{
    title: string;
    desc: string;
    icon: typeof Package;
    path: string;
    badge?: number;
    stats?: string;
    adminOnly?: boolean;
  }> = [
    {
      title: 'Catálogo',
      desc: 'Produtos, categorias, rascunhos e destaques',
      icon: Package,
      path: '/admin/catalogo',
      badge: draftCount,
      stats: `${visible.length} produtos · ${outOfStock} esgotados`,
    },
    {
      title: 'Pedidos',
      desc: 'Vendas online com filtros por dia',
      icon: ClipboardList,
      path: '/admin/pedidos',
    },
    {
      title: 'Funcionários',
      desc: 'Permissões e acessos da equipe',
      icon: Users,
      path: '/admin/funcionarios',
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

      <div className="max-w-7xl mx-auto space-y-6 p-6 -mt-4">
        {/* Acesso rápido (apenas admin) */}
        {isAdmin && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              Acesso rápido
            </p>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {quickAccess.map(({ icon: Icon, title, desc, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="group text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-display font-bold text-base">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gestão — páginas dedicadas */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Gestão
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections
              .filter((s) => !s.adminOnly || isAdmin)
              .map(({ title, desc, icon: Icon, path, badge, stats }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="group relative text-left bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="w-6 h-6" />
                    </div>
                    {badge !== undefined && badge > 0 && (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        {badge} {badge === 1 ? 'rascunho' : 'rascunhos'}
                      </Badge>
                    )}
                  </div>
                  <div className="font-display font-bold text-lg leading-tight">{title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{desc}</div>
                  {stats && (
                    <div className="text-xs text-muted-foreground mt-3 pt-3 border-t font-medium">
                      {stats}
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
