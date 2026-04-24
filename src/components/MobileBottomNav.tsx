import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutGrid, Search, ShoppingBag, User } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Cart } from '@/components/Cart';

/**
 * Bottom navigation fixa para mobile (visível apenas em < md).
 * Estilo app nativo: Home, Categorias, Buscar, Carrinho, Conta.
 */
export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount } = useCart();
  const { user } = useAuth();
  const { primaries } = useCategories();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (path: string) => location.pathname === path;
  const isProductsActive = location.pathname === '/produtos';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    setSearchQuery('');
    navigate(q ? `/produtos?search=${encodeURIComponent(q)}` : '/produtos');
  };

  const goCategory = (name: string) => {
    setCategoriesOpen(false);
    navigate(`/produtos?category=${encodeURIComponent(name)}`);
  };

  const NavItem = ({
    icon: Icon,
    label,
    onClick,
    active,
    badge,
  }: {
    icon: typeof Home;
    label: string;
    onClick: () => void;
    active?: boolean;
    badge?: number;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors active:scale-95"
      aria-label={label}
    >
      <div className="relative">
        <Icon
          className={`w-[22px] h-[22px] transition-colors ${
            active ? 'text-primary' : 'text-muted-foreground'
          }`}
          strokeWidth={active ? 2.4 : 2}
        />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span
        className={`text-[10px] font-semibold leading-none ${
          active ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </button>
  );

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navegação principal"
      >
        <div className="flex h-14 items-stretch">
          <NavItem icon={Home} label="Início" onClick={() => navigate('/')} active={isActive('/')} />
          <NavItem
            icon={LayoutGrid}
            label="Categorias"
            onClick={() => setCategoriesOpen(true)}
            active={isProductsActive}
          />
          <NavItem icon={Search} label="Buscar" onClick={() => setSearchOpen(true)} />

          {/* Cart - usa o componente real Cart como trigger via wrapper */}
          <div className="relative flex-1 h-full">
            <CartTrigger badge={itemCount} />
          </div>

          <NavItem
            icon={User}
            label={user ? 'Conta' : 'Entrar'}
            onClick={() => navigate(user ? '/conta' : '/auth')}
            active={isActive('/conta') || isActive('/auth')}
          />
        </div>
      </nav>

      {/* Drawer de Categorias */}
      <Sheet open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-left text-xl font-display font-bold">
              Categorias
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            <button
              onClick={() => {
                setCategoriesOpen(false);
                navigate('/produtos');
              }}
              className="w-full text-left px-4 py-3.5 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-between"
            >
              <span>Todos os produtos</span>
              <span className="text-xs">→</span>
            </button>
            {primaries.map((cat) => (
              <button
                key={cat.id}
                onClick={() => goCategory(cat.name)}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-muted active:bg-muted/80 font-medium flex items-center justify-between transition-colors"
              >
                <span>{cat.name}</span>
                <span className="text-xs text-muted-foreground">→</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Drawer de Busca */}
      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="top" className="rounded-b-3xl">
          <SheetHeader>
            <SheetTitle className="text-left">Buscar produtos</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSearch} className="mt-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                autoFocus
                type="search"
                placeholder="O que você procura?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 rounded-full bg-muted border-transparent text-base"
              />
            </div>
            <button
              type="submit"
              className="mt-3 w-full h-12 rounded-full bg-primary text-primary-foreground font-bold active:scale-[0.98] transition-transform"
            >
              Buscar
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Wrapper invisível: reusa o componente Cart (que é um Sheet) com label estilo bottom nav.
 */
function CartTrigger({ badge }: { badge: number }) {
  return (
    <div className="relative h-full w-full flex items-center justify-center">
      {/* Posiciona o Cart absoluto e estiliza o trigger interno */}
      <div className="[&_button]:!h-full [&_button]:!w-full [&_button]:!rounded-none [&_button]:flex [&_button]:flex-col [&_button]:items-center [&_button]:justify-center [&_button]:gap-0.5 [&_svg]:w-[22px] [&_svg]:h-[22px] [&_button]:!text-muted-foreground h-full w-full">
        <Cart />
      </div>
      <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-muted-foreground">
        Carrinho
      </span>
    </div>
  );
}
