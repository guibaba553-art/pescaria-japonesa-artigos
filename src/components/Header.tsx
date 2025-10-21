import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Cart } from '@/components/Cart';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, UserPlus, LogOut, User } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';

export function Header() {
  const navigate = useNavigate();
  const { user, signOut, isEmployee, isAdmin } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/')}
        >
          <img src={japaLogo} alt="JAPA" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold text-foreground">JAPA Pesca</span>
        </div>

        <div className="flex items-center gap-3">
          <Cart />
          
          {user ? (
            <>
              {(isEmployee || isAdmin) && (
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/admin')}
                  className="hidden sm:flex"
                >
                  <User className="w-4 h-4 mr-2" />
                  Painel Admin
                </Button>
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
