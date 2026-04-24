import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cart } from '@/components/Cart';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/integrations/supabase/client';
import { LogIn, UserPlus, LogOut, User, UserCircle, ShoppingCart, Search, Loader2, Package, Menu, X } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface Suggestion {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
}

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isEmployee, isAdmin, canAccessPdv } = useAuth();
  const { primaries } = useCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);

  // Scroll detection para header dinâmico
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch suggestions com debounce
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, image_url, category')
        .ilike('name', `%${query}%`)
        .limit(6);

      if (!error && data) setSuggestions(data);
      setLoadingSuggestions(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    setShowSuggestions(false);
    navigate(query ? `/produtos?search=${encodeURIComponent(query)}` : '/produtos');
  };

  const handleSelectSuggestion = (s: Suggestion) => {
    setShowSuggestions(false);
    setSearchQuery('');
    navigate(`/produto/${s.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const isHome = location.pathname === '/';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled || !isHome
          ? 'bg-background/80 backdrop-blur-xl border-b border-border/60'
          : 'bg-background/40 backdrop-blur-md border-b border-transparent'
      }`}
    >
      {/* Main bar */}
      <div className="container mx-auto h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-70 transition-opacity flex-shrink-0 btn-press"
          aria-label="Página inicial"
        >
          <img src={japaLogo} alt="JAPAS" className="h-9 w-9 object-contain" />
          <span className="text-lg font-display font-bold tracking-tight hidden sm:inline">
            JAPAS<span className="text-primary">.</span>
          </span>
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:flex" ref={containerRef}>
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar varas, anzóis, iscas, linhas..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
                setHighlightedIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              className="pl-11 pr-4 h-11 rounded-full bg-muted/60 border-transparent focus-visible:bg-background focus-visible:border-border transition-all"
              autoComplete="off"
            />

            {showSuggestions && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-2xl shadow-elevated overflow-hidden z-50 max-h-[28rem] overflow-y-auto animate-scale-in origin-top">
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="py-6 px-4 text-sm text-muted-foreground text-center">
                    Nenhum produto encontrado
                  </div>
                ) : (
                  <>
                    <ul className="py-2">
                      {suggestions.map((s, idx) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSuggestion(s);
                            }}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              idx === highlightedIndex ? 'bg-muted' : 'hover:bg-muted/60'
                            }`}
                          >
                            {s.image_url ? (
                              <img src={s.image_url} alt={s.name} className="w-11 h-11 rounded-lg object-cover flex-shrink-0 bg-muted" />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.category}</p>
                            </div>
                            <span className="text-sm font-semibold flex-shrink-0">
                              R$ {Number(s.price).toFixed(2).replace('.', ',')}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSearch(e as unknown as React.FormEvent);
                      }}
                      className="w-full px-4 py-3 text-sm font-medium text-primary border-t border-border hover:bg-muted/60 transition-colors text-center"
                    >
                      Ver todos os resultados para "{searchQuery.trim()}"
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => navigate('/produtos')}
            className="hidden md:inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            Produtos
          </button>

          {/* Cart visível só no desktop — no mobile fica na bottom nav */}
          <div className="hidden md:block">
            <Cart />
          </div>

          {user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/conta')}
                className="hidden sm:inline-flex rounded-full"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Conta
              </Button>
              {(isEmployee || isAdmin) && (
                <>
                  {(isAdmin || (isEmployee && canAccessPdv)) && (
                    <Button size="sm" onClick={() => navigate('/pdv')} className="rounded-full hidden sm:inline-flex">
                      PDV
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="rounded-full hidden lg:inline-flex">
                    Admin
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={signOut} className="rounded-full hidden sm:inline-flex" aria-label="Sair">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="hidden sm:inline-flex rounded-full">
                <LogIn className="w-4 h-4 mr-2" />
                Entrar
              </Button>
              <Button size="sm" onClick={() => navigate('/auth')} className="rounded-full hidden sm:inline-flex">
                <UserPlus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Criar conta</span>
              </Button>
            </>
          )}

          {/* Botão de busca mobile (substitui menu hamburguer — navegação fica na bottom nav) */}
          <button
            onClick={() => navigate('/produtos')}
            className="md:hidden h-10 w-10 rounded-full flex items-center justify-center text-foreground active:bg-muted transition-colors"
            aria-label="Buscar produtos"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Categorias bar (desktop) */}
      {primaries.length > 0 && (
        <nav className="hidden lg:block border-t border-border/40">
          <div className="container mx-auto h-11 flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => navigate('/produtos')}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-full whitespace-nowrap"
            >
              Todos
            </button>
            {primaries.slice(0, 8).map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/produtos?category=${encodeURIComponent(cat.name)}`)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full whitespace-nowrap"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
