import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface CompanySettings {
  logo_url?: string;
  legal_name?: string;
  cnpj?: string;
  cep?: string;
  address?: string;
  email?: string;
  phone?: string;
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_settings')
      .select('key, value');

    if (!error && data) {
      const map: CompanySettings = {};
      for (const row of data) {
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
        const addr = [
          d.logradouro || '',
          d.bairro ? `— ${d.bairro}` : '',
          d.localidade && d.uf ? `— ${d.localidade}/${d.uf}` : '',
          `— CEP ${formatCEP(cep)}`,
        ].filter(Boolean).join(' ');
        setSettings((prev) => ({
          ...prev,
          address: addr,
        }));
        toast({ title: 'CEP encontrado', description: `${d.localidade}/${d.uf} — ${d.logradouro || d.bairro}` });
      } else {
        toast({ title: 'CEP não encontrado', description: 'Verifique o número e tente novamente.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao buscar CEP', description: 'Verifique sua conexão.', variant: 'destructive' });
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
      .from('company_settings')
      .upsert(entries, { onConflict: 'key' });

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações salvas', description: 'Os dados da empresa foram atualizados.' });
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
          <Input
            id="logo_url"
            placeholder="https://...logo.png"
            value={settings.logo_url || ''}
            onChange={(e) => handleChange('logo_url', e.target.value)}
          />
          {settings.logo_url && (
            <div className="mt-2 p-2 bg-muted rounded-lg inline-block">
              <img src={settings.logo_url} alt="Logo preview" className="h-10 object-contain" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            URL pública da imagem da logo. Aparece no cabeçalho do comprovante de reembolso.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="legal_name">Razão Social</Label>
          <Input
            id="legal_name"
            placeholder="Nome jurídico completo da empresa"
            value={settings.legal_name || ''}
            onChange={(e) => handleChange('legal_name', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input
            id="cnpj"
            placeholder="00.000.000/0001-00"
            value={settings.cnpj || ''}
            onChange={(e) => handleChange('cnpj', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cep">CEP</Label>
          <div className="relative">
            <Input
              id="cep"
              inputMode="numeric"
              placeholder="00000-000"
              value={formatCEP(settings.cep || '')}
              onChange={handleCepChange}
            />
            {cepSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </span>
            )}
            {!cepSearching && (settings.cep || '').replace(/\D/g, '').length === 8 && (
              <button
                type="button"
                onClick={() => lookupCep(settings.cep || '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                title="Buscar CEP novamente"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Digite o CEP para preencher o endereço automaticamente.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Endereço Completo</Label>
          <Textarea
            id="address"
            placeholder="Rua, número — Bairro — Cidade/UF — CEP 00000-000"
            value={settings.address || ''}
            onChange={(e) => handleChange('address', e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail de Contato</Label>
          <Input
            id="email"
            type="email"
            placeholder="sac@empresa.com.br"
            value={settings.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            placeholder="(11) 0000-0000"
            value={settings.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
