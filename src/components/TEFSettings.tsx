import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Loader2 } from 'lucide-react';

interface TefSettings {
  id?: string;
  enabled: boolean;
  mode: 'connect' | 'api';
  stone_code: string | null;
  agent_url: string | null;
  environment: 'sandbox' | 'production';
  auto_print_receipt: boolean;
}

const DEFAULTS: TefSettings = {
  enabled: false,
  mode: 'connect',
  stone_code: '',
  agent_url: 'http://localhost:9999',
  environment: 'sandbox',
  auto_print_receipt: true,
};

export function TEFSettings() {
  const [settings, setSettings] = useState<TefSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tef_settings').select('*').limit(1).maybeSingle();
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else if (data) {
      setSettings(data as TefSettings);
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...settings };
    const query = settings.id
      ? supabase.from('tef_settings').update(payload).eq('id', settings.id)
      : supabase.from('tef_settings').insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações salvas' });
      load();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          TEF Stone
        </CardTitle>
        <CardDescription>
          Configurações da maquininha Stone (Ton/Stone) para pagamentos no PDV.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Habilitar TEF</Label>
            <p className="text-xs text-muted-foreground">Ativa o pagamento via maquininha no PDV</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
          />
        </div>

        <div className="space-y-2">
          <Label>Modo de operação</Label>
          <Select
            value={settings.mode}
            onValueChange={(v: 'connect' | 'api') => setSettings({ ...settings, mode: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="connect">Stone Connect (agente local na máquina)</SelectItem>
              <SelectItem value="api">Stone Open API (nuvem)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {settings.mode === 'connect'
              ? 'Comunica com a maquininha via agente local (Stone Connect / PayGo). Requer instalação no computador do caixa.'
              : 'Comunica via API da Stone na nuvem. Funciona em qualquer dispositivo, inclusive tablet.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Stone Code (afiliação)</Label>
          <Input
            value={settings.stone_code ?? ''}
            onChange={(e) => setSettings({ ...settings, stone_code: e.target.value })}
            placeholder="Ex: 123456789"
          />
        </div>

        {settings.mode === 'connect' && (
          <div className="space-y-2">
            <Label>URL do agente local</Label>
            <Input
              value={settings.agent_url ?? ''}
              onChange={(e) => setSettings({ ...settings, agent_url: e.target.value })}
              placeholder="http://localhost:9999"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Ambiente</Label>
          <Select
            value={settings.environment}
            onValueChange={(v: 'sandbox' | 'production') => setSettings({ ...settings, environment: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Homologação (testes)</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Imprimir comprovante automaticamente</Label>
            <p className="text-xs text-muted-foreground">Após aprovação da transação</p>
          </div>
          <Switch
            checked={settings.auto_print_receipt}
            onCheckedChange={(v) => setSettings({ ...settings, auto_print_receipt: v })}
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong>Importante:</strong> enquanto as credenciais oficiais da Stone (CLIENT_ID/SECRET) não forem configuradas,
          o sistema opera em <strong>modo simulação</strong> — útil para testar o fluxo do PDV sem maquininha real.
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar configurações
        </Button>
      </CardContent>
    </Card>
  );
}
