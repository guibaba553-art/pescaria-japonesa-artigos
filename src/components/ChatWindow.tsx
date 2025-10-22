import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  message: string;
  is_from_user: boolean;
  created_at: string;
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatWindow({ isOpen, onClose }: ChatWindowProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && isOpen) {
      loadMessages();
      markMessagesAsRead();
      
      // Realtime subscription para novas mensagens
      const channel = supabase
        .channel('chat-window-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const markMessagesAsRead = async () => {
    if (!user) return;

    await supabase
      .from('chat_messages')
      .update({ read_by_user: true })
      .eq('user_id', user.id)
      .eq('is_from_user', false)
      .eq('read_by_user', false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user) return;

    setSending(true);
    const userMessage = inputMessage;
    setInputMessage('');

    try {
      // Salvar mensagem do usuário
      const { error: insertError } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          message: userMessage,
          is_from_user: true
        });

      if (insertError) throw insertError;

      // Simular resposta automática simples
      const autoResponses = [
        'Obrigado pela sua mensagem! Um de nossos atendentes entrará em contato em breve.',
        'Recebemos sua dúvida sobre o produto. Vamos te responder o mais rápido possível!',
        'Sua mensagem foi registrada. Em breve um especialista te ajudará com isso.'
      ];

      const randomResponse = autoResponses[Math.floor(Math.random() * autoResponses.length)];

      setTimeout(async () => {
        await supabase
          .from('chat_messages')
          .insert({
            user_id: user.id,
            message: randomResponse,
            is_from_user: false
          });

        loadMessages();
      }, 1000);

      loadMessages();
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Card className="fixed top-20 right-6 w-96 shadow-2xl z-50 border-orange-500 border-2">
      <CardHeader className="flex flex-row items-center justify-between pb-4 bg-orange-500 text-white rounded-t-lg">
        <div>
          <CardTitle>Suporte</CardTitle>
          <CardDescription className="text-orange-50">Como podemos ajudar?</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover:bg-orange-600 text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-0">
        <ScrollArea ref={scrollRef} className="h-96 px-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm">
                Envie uma mensagem para iniciar o atendimento
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_from_user ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.is_from_user
                        ? 'bg-orange-500 text-white'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <form onSubmit={sendMessage} className="flex gap-2 p-4 border-t">
          <Input
            placeholder="Digite sua mensagem..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending} className="bg-orange-500 hover:bg-orange-600">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}