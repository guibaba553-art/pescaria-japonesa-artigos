import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Save, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export function FocusNFeSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCsc, setShowCsc] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const [form, setForm] = useState({
    enabled: false,
    ambiente: 'homologacao' as 'homologacao' | 'producao',
    csc_id: '',
    csc_token: '',
    serie_nfce: 1,
    serie_nfe: 1,
    cfop_padrao: '5102',
    cfop_interestadual: '6102',
    csosn_padrao: '102',
    origem_padrao: '0',
    unidade_padrao: 'UN',
    ncm_padrao: '',
    auto_emit_nfce_pdv: false,
    auto_emit_nfe_pedido_pago: false,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('focus_nfe_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        setForm({
          enabled: data.enabled,
          ambiente: data.ambiente as 'homologacao' | 'producao',
          csc_id: data.csc_id || '',
          csc_token: data.csc_token || '',
          serie_nfce: data.serie_nfce,
          serie_nfe: data.serie_nfe,
          cfop_padrao: data.cfop_padrao,
          cfop_interestadual: data.cfop_interestadual,
          csosn_padrao: data.csosn_padrao,
          origem_padrao: data.origem_padrao,
          unidade_padrao: data.unidade_padrao,
          ncm_padrao: data.ncm_padrao || '',
          auto_emit_nfce_pdv: data.auto_emit_nfce_pdv,
          auto_emit_nfe_pedido_pago: data.auto_emit_nfe_pedido_pago,
        });
      }
    } catch (e: any) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settingsId) {
        const { error } = await supabase
          .from('focus_nfe_settings')
          .update(form)
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('focus_nfe_settings')
          .insert(form)
          .select()
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      toast({
        title: '✅ Configurações salvas!',
        description: 'Focus NFe configurada com sucesso.',
      });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Focus NFe + SEFAZ-MT:</strong> Configure aqui o CSC obtido no portal da SEFAZ-MT
          e os parâmetros fiscais padrão. Comece sempre em <strong>Homologação</strong> para testes.
        </AlertDescription>
      </Alert>

      {/* Status geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {form.enabled ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
            )}
            Status do Sistema Fiscal
          </CardTitle>
          <CardDescription>Habilite quando estiver tudo configurado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Habilitar emissão de NFC-e/NF-e</Label>
              <p className="text-sm text-muted-foreground">
                Ativa a integração com Focus NFe
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select
              value={form.ambiente}
              onValueChange={(v: 'homologacao' | 'producao') => setForm({ ...form, ambiente: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">🧪 Homologação (testes — sem valor fiscal)</SelectItem>
                <SelectItem value="producao">🚀 Produção (emissão real)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.ambiente === 'producao'
                ? '⚠️ ATENÇÃO: Em produção, NFC-e tem valor fiscal real!'
                : '✅ Use homologação para todos os testes iniciais.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CSC SEFAZ-MT */}
      <Card>
        <CardHeader>
          <CardTitle>CSC — Código de Segurança SEFAZ-MT</CardTitle>
          <CardDescription>
            Obtido no portal SEFAZ-MT após credenciamento como emissor de NFC-e
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csc_id">CSC ID</Label>
            <Input
              id="csc_id"
              value={form.csc_id}
              onChange={(e) => setForm({ ...form, csc_id: e.target.value })}
              placeholder="ex: 1 ou 000001"
            />
            <p className="text-xs text-muted-foreground">
              Geralmente um número curto (1, 2, 000001...)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csc_token">CSC Token</Label>
            <div className="relative">
              <Input
                id="csc_token"
                type={showCsc ? 'text' : 'password'}
                value={form.csc_token}
                onChange={(e) => setForm({ ...form, csc_token: e.target.value })}
                placeholder="String longa ~36 caracteres"
                className="pr-10 font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowCsc(!showCsc)}
              >
                {showCsc ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Séries */}
      <Card>
        <CardHeader>
          <CardTitle>Numeração</CardTitle>
          <CardDescription>Série dos documentos fiscais</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="serie_nfce">Série NFC-e (modelo 65)</Label>
            <Input
              id="serie_nfce"
              type="number"
              min="1"
              value={form.serie_nfce}
              onChange={(e) => setForm({ ...form, serie_nfce: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serie_nfe">Série NF-e (modelo 55)</Label>
            <Input
              id="serie_nfe"
              type="number"
              min="1"
              value={form.serie_nfe}
              onChange={(e) => setForm({ ...form, serie_nfe: parseInt(e.target.value) || 1 })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Padrões fiscais */}
      <Card>
        <CardHeader>
          <CardTitle>Valores Fiscais Padrão</CardTitle>
          <CardDescription>
            Usados quando o produto não tem dados fiscais próprios cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cfop_padrao">CFOP Estadual</Label>
            <Input
              id="cfop_padrao"
              value={form.cfop_padrao}
              onChange={(e) => setForm({ ...form, cfop_padrao: e.target.value })}
              placeholder="5102"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cfop_interestadual">CFOP Interestadual</Label>
            <Input
              id="cfop_interestadual"
              value={form.cfop_interestadual}
              onChange={(e) => setForm({ ...form, cfop_interestadual: e.target.value })}
              placeholder="6102"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="csosn_padrao">CSOSN (Simples Nacional)</Label>
            <Input
              id="csosn_padrao"
              value={form.csosn_padrao}
              onChange={(e) => setForm({ ...form, csosn_padrao: e.target.value })}
              placeholder="102"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="origem_padrao">Origem</Label>
            <Input
              id="origem_padrao"
              value={form.origem_padrao}
              onChange={(e) => setForm({ ...form, origem_padrao: e.target.value })}
              placeholder="0 = Nacional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unidade_padrao">Unidade Comercial</Label>
            <Input
              id="unidade_padrao"
              value={form.unidade_padrao}
              onChange={(e) => setForm({ ...form, unidade_padrao: e.target.value })}
              placeholder="UN"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ncm_padrao">NCM Padrão</Label>
            <Input
              id="ncm_padrao"
              value={form.ncm_padrao}
              onChange={(e) => setForm({ ...form, ncm_padrao: e.target.value })}
              placeholder="ex: 95079000"
            />
          </div>
        </CardContent>
      </Card>

      {/* Automações */}
      <Card>
        <CardHeader>
          <CardTitle>Emissão Automática</CardTitle>
          <CardDescription>Configure quando emitir notas automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Emitir NFC-e automaticamente no PDV</Label>
              <p className="text-sm text-muted-foreground">
                Ao finalizar venda no PDV, emite NFC-e automaticamente
              </p>
            </div>
            <Switch
              checked={form.auto_emit_nfce_pdv}
              onCheckedChange={(v) => setForm({ ...form, auto_emit_nfce_pdv: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Emitir NF-e quando pedido for pago</Label>
              <p className="text-sm text-muted-foreground">
                Pedidos online: emite NF-e ao confirmar pagamento
              </p>
            </div>
            <Switch
              checked={form.auto_emit_nfe_pedido_pago}
              onCheckedChange={(v) => setForm({ ...form, auto_emit_nfe_pedido_pago: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
