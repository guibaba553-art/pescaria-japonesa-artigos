import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface CompanySettings {
  logo_url?: string;
  trade_name?: string;
  legal_name?: string;
  cnpj?: string;
  ie?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram_url?: string;
}

function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 5) return digits.replace(/^(\d{5})(\d)/, '$1-$2');
  return digits;
}

export function CompanySettingsForm() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepSearching, setCepSearching] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_settings' as any)
      .select('key, value');

    if (!error && data) {
      const map: CompanySettings = {};
      for (const row of (data as any[])) {
        (map as any)[row.key] = row.value;
      }
      setSettings(map);
    }
    setLoading(false);
  };

  const handleChange = (key: keyof CompanySettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const lookupCep = useCallback(async (cep: string) => {
    if (cep.replace(/\D/g, '').length !== 8) return;
    setCepSearching(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setSettings((prev) => ({
          ...prev,
          street: d.logradouro || prev.street || '',
          neighborhood: d.bairro || prev.neighborhood || '',
          city: d.localidade || prev.city || '',
          state: d.uf || prev.state || '',
        }));
        toast({ title: 'CEP encontrado', description: `${d.localidade}/${d.uf}` });
      } else {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao buscar CEP', variant: 'destructive' });
    } finally {
      setCepSearching(false);
    }
  }, [toast]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    handleChange('cep', raw);
    if (raw.length === 8) lookupCep(raw);
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value: value || '' }));

    const { error } = await supabase
      .from('company_settings' as any)
      .upsert(entries, { onConflict: 'key' });

    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações salvas' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Empresa</CardTitle>
        <CardDescription>
          Esses dados aparecem em comprovantes de reembolso, notas fiscais e documentos oficiais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="logo_url">URL da Logo</Label>
          <Input id="logo_url" placeholder="https://...logo.png"
            value={settings.logo_url || ''} onChange={(e) => handleChange('logo_url', e.target.value)} />
          {settings.logo_url && (
            <div className="mt-2 p-2 bg-muted rounded-lg inline-block">
              <img src={settings.logo_url} alt="Logo preview" className="h-10 object-contain" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            URL pública da logo. Aparece no cabeçalho do comprovante de reembolso.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="trade_name">Nome Fantasia</Label>
          <Input id="trade_name" placeholder="Nome comercial"
            value={settings.trade_name || ''} onChange={(e) => handleChange('trade_name', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="legal_name">Razão Social</Label>
          <Input id="legal_name" placeholder="Nome jurídico completo"
            value={settings.legal_name || ''} onChange={(e) => handleChange('legal_name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" placeholder="00.000.000/0001-00"
              value={settings.cnpj || ''} onChange={(e) => handleChange('cnpj', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie">Inscrição Estadual</Label>
            <Input id="ie" placeholder="00.000.000-0"
              value={settings.ie || ''} onChange={(e) => handleChange('ie', e.target.value)} />
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-3">Endereço</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <div className="relative">
                <Input id="cep" inputMode="numeric" placeholder="00000-000"
                  value={formatCEP(settings.cep || '')} onChange={handleCepChange} />
                {cepSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="number">Número</Label>
              <Input id="number" placeholder="Nº"
                value={settings.number || ''} onChange={(e) => handleChange('number', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            <Label htmlFor="street">Logradouro</Label>
            <Input id="street" placeholder="Rua, Av..."
              value={settings.street || ''} onChange={(e) => handleChange('street', e.target.value)} />
          </div>

          <div className="grid grid-cols-[1fr_1fr_80px] gap-3 mt-3">
            <div className="space-y-1.5">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input id="neighborhood" placeholder="Bairro"
                value={settings.neighborhood || ''} onChange={(e) => handleChange('neighborhood', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" placeholder="Cidade"
                value={settings.city || ''} onChange={(e) => handleChange('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">UF</Label>
              <Input id="state" placeholder="UF" maxLength={2}
                value={(settings.state || '').toUpperCase()} onChange={(e) => handleChange('state', e.target.value.toUpperCase())} />
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            <Label htmlFor="complement">Complemento <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="complement" placeholder="Apto, bloco, etc."
              value={settings.complement || ''} onChange={(e) => handleChange('complement', e.target.value)} />
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-3">Contato</p>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="sac@empresa.com.br"
              value={settings.email || ''} onChange={(e) => handleChange('email', e.target.value)} />
          </div>

          <div className="space-y-1.5 mt-3">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" placeholder="(11) 0000-0000"
              value={settings.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} />
          </div>

          <div className="space-y-1.5 mt-3">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" placeholder="5566999211712"
              value={settings.whatsapp || ''} onChange={(e) => handleChange('whatsapp', e.target.value)} />
            <p className="text-xs text-muted-foreground">Número completo com DDD e DDI.</p>
          </div>

          <div className="space-y-1.5 mt-3">
            <Label htmlFor="instagram_url">Instagram (URL)</Label>
            <Input id="instagram_url" placeholder="https://www.instagram.com/seu-perfil/"
              value={settings.instagram_url || ''} onChange={(e) => handleChange('instagram_url', e.target.value)} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
