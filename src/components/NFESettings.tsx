import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Save, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NFESettingsProps {
  settings: any;
  onUpdate: () => void;
}

export function NFESettings({ settings, onUpdate }: NFESettingsProps) {
  const [nfeEnabled, setNfeEnabled] = useState(settings?.nfe_enabled || false);
  const [companyId, setCompanyId] = useState(settings?.nfe_company_id || '');
  const [autoEmit, setAutoEmit] = useState(settings?.auto_emit_nfe || false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('fiscal_settings')
        .update({
          nfe_enabled: nfeEnabled,
          nfe_company_id: companyId || null,
          auto_emit_nfe: autoEmit
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: 'Configurações salvas!',
        description: 'As configurações de NF-e foram atualizadas com sucesso.',
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
          <strong>NFe.io:</strong> Sistema de emissão de notas fiscais eletrônicas.
          <br />
          Para obter suas credenciais, acesse: <a href="https://nfe.io" target="_blank" rel="noopener noreferrer" className="underline">nfe.io</a>
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Habilitar NF-e</Label>
            <p className="text-sm text-muted-foreground">
              Ativar sistema de emissão de notas fiscais
            </p>
          </div>
          <Switch
            checked={nfeEnabled}
            onCheckedChange={setNfeEnabled}
          />
        </div>

        {nfeEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="company-id">ID da Empresa (NFe.io)</Label>
              <Input
                id="company-id"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="ex: 5f8c9d7e4b3a2c1d0e8f9g0h"
              />
              <p className="text-xs text-muted-foreground">
                Encontre no painel NFe.io em: Empresas → Sua Empresa → ID
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                A <strong>chave da API NFe.io</strong> agora é armazenada de forma segura no cofre de segredos do servidor (não mais no banco). Solicite ao suporte da Lovable a configuração da variável de ambiente <code>NFEIO_API_KEY</code>.
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between pt-4">
              <div className="space-y-0.5">
                <Label>Emissão Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Emitir NF-e automaticamente quando pedido for pago
                </p>
              </div>
              <Switch
                checked={autoEmit}
                onCheckedChange={setAutoEmit}
              />
            </div>
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
