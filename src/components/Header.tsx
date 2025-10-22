import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cart } from '@/components/Cart';
import { ChatWindow } from '@/components/ChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, UserPlus, LogOut, User, UserCircle, MessageCircle } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function Header() {
  const navigate = useNavigate();
  const { user, signOut, isEmployee, isAdmin } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadUnreadCount();
      
      // Realtime subscription para atualizar contador
      const channel = supabase
        .channel('header-chat-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            loadUnreadCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadUnreadCount = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('is_from_user', false)
      .eq('read_by_user', false);

    if (!error && data) {
      setUnreadCount(data.length);
    }
  };

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
              
              <Button 
                variant="outline" 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="hidden sm:flex relative bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Suporte
                {unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Button>
              
              <Cart />
              
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
      
      <ChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </header>
  );
}
