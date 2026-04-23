import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cart } from '@/components/Cart';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, UserPlus, LogOut, User, UserCircle, ShoppingCart, Search } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';

export function Header() {
  const navigate = useNavigate();
  const { user, signOut, isEmployee, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      navigate(`/produtos?search=${encodeURIComponent(query)}`);
    } else {
      navigate('/produtos');
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

        <form onSubmit={handleSearch} className="flex-1 max-w-md flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar produtos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
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
                  {isAdmin && (
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
