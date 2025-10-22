import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, CheckCircle2, Clock } from 'lucide-react';

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  is_from_user: boolean;
  replied: boolean;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface ConversationGroup {
  user_id: string;
  user_name: string;
  messages: ChatMessage[];
  lastMessage: string;
  hasUnreplied: boolean;
}

export function ChatManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationGroup | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    loadConversations();
    
    // Realtime subscription para novas mensagens
    const channel = supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages'
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadConversations = async () => {
    const { data: messagesData, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast({
        title: 'Erro ao carregar mensagens',
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    // Buscar perfis dos usuários
    const userIds = [...new Set(messagesData?.map(m => m.user_id) || [])];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    const profilesMap: Record<string, string> = {};
    profilesData?.forEach(p => {
      profilesMap[p.id] = p.full_name || 'Sem nome';
    });
    setProfiles(profilesMap);

    // Buscar nomes dos admins que responderam
    const repliedByIds = [...new Set(messagesData?.map(m => m.replied_by).filter(Boolean) || [])] as string[];
    if (repliedByIds.length > 0) {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', repliedByIds);

      adminProfiles?.forEach(p => {
        profilesMap[p.id] = p.full_name || 'Sem nome';
      });
    }

    // Mapear mensagens com perfis
    const messages: ChatMessage[] = messagesData?.map(msg => ({
      ...msg,
      profiles: {
        full_name: profilesMap[msg.user_id] || 'Sem nome'
      }
    })) || [];

    // Agrupar mensagens por usuário
    const grouped: Record<string, ConversationGroup> = {};
    messages.forEach(msg => {
      if (!grouped[msg.user_id]) {
        grouped[msg.user_id] = {
          user_id: msg.user_id,
          user_name: profilesMap[msg.user_id] || 'Usuário',
          messages: [],
          lastMessage: '',
          hasUnreplied: false
        };
      }
      grouped[msg.user_id].messages.push(msg);
      grouped[msg.user_id].lastMessage = msg.message;
      if (msg.is_from_user && !msg.replied) {
        grouped[msg.user_id].hasUnreplied = true;
      }
    });

    const conversationsList = Object.values(grouped);
    setConversations(conversationsList);

    // Atualizar conversa selecionada se houver
    if (selectedConversation) {
      const updated = conversationsList.find(c => c.user_id === selectedConversation.user_id);
      if (updated) {
        setSelectedConversation(updated);
      }
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !selectedConversation || !user) return;

    setSending(true);
    try {
      // Enviar mensagem de resposta
      const { error: insertError } = await supabase
        .from('chat_messages')
        .insert({
          user_id: selectedConversation.user_id,
          message: replyMessage,
          is_from_user: false
        });

      if (insertError) throw insertError;

      // Marcar mensagens do usuário como respondidas
      const userMessages = selectedConversation.messages
        .filter(m => m.is_from_user && !m.replied)
        .map(m => m.id);

      if (userMessages.length > 0) {
        const { error: updateError } = await supabase
          .from('chat_messages')
          .update({
            replied: true,
            replied_by: user.id,
            replied_at: new Date().toISOString()
          })
          .in('id', userMessages);

        if (updateError) throw updateError;
      }

      setReplyMessage('');
      toast({
        title: 'Resposta enviada',
        description: 'Sua mensagem foi enviada com sucesso.'
      });

      loadConversations();
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-250px)]">
      {/* Lista de Conversas */}
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Conversas</CardTitle>
          <CardDescription>
            {conversations.filter(c => c.hasUnreplied).length} não respondidas
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-350px)]">
            {conversations.map((conv) => (
              <div
                key={conv.user_id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-4 cursor-pointer hover:bg-accent transition-colors border-b ${
                  selectedConversation?.user_id === conv.user_id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      <p className="font-medium">{conv.user_name}</p>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {conv.lastMessage}
                    </p>
                  </div>
                  {conv.hasUnreplied && (
                    <Badge variant="destructive" className="ml-2">
                      <Clock className="w-3 h-3 mr-1" />
                      Novo
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Conversa Selecionada */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>
            {selectedConversation ? selectedConversation.user_name : 'Selecione uma conversa'}
          </CardTitle>
          {selectedConversation && (
            <CardDescription>
              {selectedConversation.messages.length} mensagens
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedConversation ? (
            <>
              <ScrollArea className="h-[calc(100vh-500px)] border rounded-lg p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg) => (
                    <div key={msg.id}>
                      <div
                        className={`flex ${msg.is_from_user ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            msg.is_from_user
                              ? 'bg-muted'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs opacity-70">
                              {new Date(msg.created_at).toLocaleString('pt-BR')}
                            </p>
                            {msg.is_from_user && msg.replied && (
                              <Badge variant="outline" className="text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Respondida por {profiles[msg.replied_by!] || 'Admin'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator />

              <form onSubmit={(e) => { e.preventDefault(); sendReply(); }} className="flex gap-2">
                <Input
                  placeholder="Digite sua resposta..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  disabled={sending}
                />
                <Button type="submit" disabled={sending}>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </Button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center h-[calc(100vh-450px)] text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Selecione uma conversa para visualizar as mensagens</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}