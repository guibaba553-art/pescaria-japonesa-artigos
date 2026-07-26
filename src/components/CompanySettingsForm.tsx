import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface CompanySettings {
  legal_name?: string;
  cnpj?: string;
  address?: string;
  email?: string;
  phone?: string;
}

const FIELDS: { key: keyof CompanySettings; label: string; placeholder: string }[] = [
  { key: 'legal_name', label: 'Razão Social', placeholder: 'Nome jurídico completo da empresa' },
  { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  { key: 'address', label: 'Endereço', placeholder: 'Rua, número — Bairro — Cidade/UF — CEP' },
  { key: 'email', label: 'E-mail de Contato', placeholder: 'sac@empresa.com.br' },
  { key: 'phone', label: 'Telefone', placeholder: '(11) 0000-0000' },
];

export function CompanySettingsForm() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings).map(([key, value]) => ({ key, value: value || '' }));

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
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              placeholder={placeholder}
              value={settings[key] || ''}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}

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
