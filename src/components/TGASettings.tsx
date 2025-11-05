import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Save, Eye, EyeOff, AlertCircle, TestTube } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TGASettingsProps {
  settings: any;
  onUpdate: () => void;
}

export function TGASettings({ settings, onUpdate }: TGASettingsProps) {
  const [tgaEnabled, setTgaEnabled] = useState(settings?.tga_enabled || false);
  const [apiUrl, setApiUrl] = useState(settings?.tga_api_url || '');
  const [username, setUsername] = useState(settings?.tga_username || '');
  const [password, setPassword] = useState(settings?.tga_password || '');
  const [autoSync, setAutoSync] = useState(settings?.auto_sync_tga || false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!apiUrl || !username || !password) {
      toast({
        title: 'Preencha todos os campos',
        description: 'URL, usuário e senha são obrigatórios para testar a conexão',
        variant: 'destructive'
      });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tga', {
        body: {
          action: 'test',
          credentials: { apiUrl, username, password }
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Conexão bem-sucedida!',
          description: 'A conexão com o TGA foi testada com sucesso.',
        });
      } else {
        throw new Error(data.message || 'Falha na conexão');
      }
    } catch (error: any) {
      toast({
        title: 'Erro na conexão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('fiscal_settings')
        .update({
          tga_enabled: tgaEnabled,
          tga_api_url: apiUrl || null,
          tga_username: username || null,
          tga_password: password || null,
          auto_sync_tga: autoSync
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: 'Configurações salvas!',
        description: 'As configurações do TGA foram atualizadas com sucesso.',
      });
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>TGA Sistemas:</strong> Integração com seu sistema de gestão local.
          <br />
          <strong>Requisitos:</strong> TGA instalado, módulo "TGA ON" ativo e servidor acessível pela internet.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Habilitar Integração TGA</Label>
            <p className="text-sm text-muted-foreground">
              Ativar sincronização com TGA Sistemas
            </p>
          </div>
          <Switch
            checked={tgaEnabled}
            onCheckedChange={setTgaEnabled}
          />
        </div>

        {tgaEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tga-url">URL do TGA</Label>
              <Input
                id="tga-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://seu-servidor.com:porta/tga/api"
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: http://192.168.1.100:8080/tga/api ou https://meudominio.com.br/tga/api
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tga-username">Usuário TGA</Label>
              <Input
                id="tga-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário do sistema"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tga-password">Senha</Label>
              <div className="relative">
                <Input
                  id="tga-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha do usuário"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="space-y-0.5">
                <Label>Sincronização Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Enviar pedidos automaticamente para o TGA quando pagos
                </p>
              </div>
              <Switch
                checked={autoSync}
                onCheckedChange={setAutoSync}
              />
            </div>

            <Button 
              onClick={handleTest} 
              disabled={testing}
              variant="outline"
              className="w-full"
            >
              <TestTube className="w-4 h-4 mr-2" />
              {testing ? 'Testando...' : 'Testar Conexão'}
            </Button>
          </>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </div>
    </div>
  );
}
