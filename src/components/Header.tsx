import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cart } from '@/components/Cart';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LogIn, UserPlus, LogOut, User, UserCircle, ShoppingCart, Search, Loader2, Package } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';

interface Suggestion {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
}

export function Header() {
  const navigate = useNavigate();
  const { user, signOut, isEmployee, isAdmin, canAccessPdv } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions with debounce
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

      if (!error && data) {
        setSuggestions(data);
      }
      setLoadingSuggestions(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close suggestions on outside click
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
    if (query) {
      navigate(`/produtos?search=${encodeURIComponent(query)}`);
    } else {
      navigate('/produtos');
    }
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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
          onClick={() => navigate('/')}
        >
          <img src={japaLogo} alt="JAPAS" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold text-foreground hidden sm:inline">JAPAS Pesca</span>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-md flex items-center gap-2" ref={containerRef}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar produtos..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
                setHighlightedIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              className="pl-9"
              autoComplete="off"
            />

            {showSuggestions && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="py-4 px-3 text-sm text-muted-foreground text-center">
                    Nenhum produto encontrado
                  </div>
                ) : (
                  <>
                    <ul className="py-1">
                      {suggestions.map((s, idx) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSuggestion(s);
                            }}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                              idx === highlightedIndex
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50'
                            }`}
                          >
                            {s.image_url ? (
                              <img
                                src={s.image_url}
                                alt={s.name}
                                className="w-10 h-10 rounded object-cover flex-shrink-0 bg-muted"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.category}</p>
                            </div>
                            <span className="text-sm font-semibold text-primary flex-shrink-0">
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
                      className="w-full px-3 py-2 text-sm font-medium text-primary border-t border-border hover:bg-accent/50 transition-colors text-center"
                    >
                      Ver todos os resultados para "{searchQuery.trim()}"
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <Button type="submit" size="icon" variant="default" aria-label="Buscar">
            <Search className="w-4 h-4" />
          </Button>
        </form>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Cart />
          
          {user ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => navigate('/conta')}
                className="hidden sm:flex"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Minha Conta
              </Button>
              {(isEmployee || isAdmin) && (
                <>
                  {(isAdmin || (isEmployee && canAccessPdv)) && (
                    <Button 
                      variant="default" 
                      onClick={() => navigate('/pdv')}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      PDV
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => navigate('/admin')}
                  >
                    <User className="w-4 h-4 mr-2" />
                    Painel Admin
                  </Button>
                </>
              )}
              <Button 
                variant="ghost" 
                onClick={signOut}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="ghost" 
                onClick={() => navigate('/auth')}
                className="hidden sm:flex"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Entrar
              </Button>
              <Button 
                onClick={() => navigate('/auth')}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Criar Conta
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
