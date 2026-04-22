import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Save, Loader2 } from 'lucide-react';

export function FocusNFeSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>({
    enabled: false,
    ambiente: 'homologacao',
    csosn_padrao: '102',
    cfop_padrao: '5102',
    cfop_interestadual: '6102',
    origem_padrao: '0',
    unidade_padrao: 'UN',
    ncm_padrao: '95079000',
    auto_emit_nfce_pdv: false,
    auto_emit_nfe_pedido_pago: false,
    csc_id: '',
    csc_token: '',
    serie_nfe: 1,
    serie_nfce: 1,
  });
  const [company, setCompany] = useState<any>({
    cnpj: '', razao_social: '', nome_fantasia: '', inscricao_estadual: '', inscricao_municipal: '',
    regime_tributario: 'simples_nacional', cnae_principal: '', cep: '', logradouro: '', numero: '',
    complemento: '', bairro: '', municipio: '', codigo_municipio: '', uf: '', telefone: '', email: '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [s, c] = await Promise.all([
      supabase.from('focus_nfe_settings').select('*').limit(1).maybeSingle(),
      supabase.from('company_fiscal_data').select('*').limit(1).maybeSingle(),
    ]);
    if (s.data) setSettings(s.data);
    if (c.data) setCompany(c.data);
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      delete payload.id; delete payload.created_at; delete payload.updated_at;
      const { error } = settings.id
        ? await supabase.from('focus_nfe_settings').update(payload).eq('id', settings.id)
        : await supabase.from('focus_nfe_settings').insert(payload);
      if (error) throw error;
      toast({ title: 'Configurações salvas!' });
      load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const saveCompany = async () => {
    setSaving(true);
    try {
      const payload = { ...company };
      delete payload.id; delete payload.created_at; delete payload.updated_at;
      const { error } = company.id
        ? await supabase.from('company_fiscal_data').update(payload).eq('id', company.id)
        : await supabase.from('company_fiscal_data').insert(payload);
      if (error) throw error;
      toast({ title: 'Dados da empresa salvos!' });
      load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Focus NFe</strong> — Provedor homologado para emissão de NF-e/NFC-e válidas com a SEFAZ.
          Token de homologação já configurado. Para produção, adicione o token quando estiver pronto.
        </AlertDescription>
      </Alert>

      {/* Dados da empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Dados Fiscais da Empresa Emissora</CardTitle>
          <CardDescription>Informações que aparecerão na nota fiscal</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>CNPJ *</Label><Input value={company.cnpj} onChange={e => setCompany({...company, cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></div>
          <div><Label>Inscrição Estadual *</Label><Input value={company.inscricao_estadual} onChange={e => setCompany({...company, inscricao_estadual: e.target.value})} /></div>
          <div className="md:col-span-2"><Label>Razão Social *</Label><Input value={company.razao_social} onChange={e => setCompany({...company, razao_social: e.target.value})} /></div>
          <div className="md:col-span-2"><Label>Nome Fantasia</Label><Input value={company.nome_fantasia || ''} onChange={e => setCompany({...company, nome_fantasia: e.target.value})} /></div>
          <div><Label>Regime Tributário *</Label>
            <Select value={company.regime_tributario} onValueChange={v => setCompany({...company, regime_tributario: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                <SelectItem value="lucro_real">Lucro Real</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>CNAE Principal</Label><Input value={company.cnae_principal || ''} onChange={e => setCompany({...company, cnae_principal: e.target.value})} placeholder="4763-6/02" /></div>
          <div><Label>CEP *</Label><Input value={company.cep} onChange={e => setCompany({...company, cep: e.target.value})} /></div>
          <div><Label>UF *</Label><Input value={company.uf} maxLength={2} onChange={e => setCompany({...company, uf: e.target.value.toUpperCase()})} /></div>
          <div className="md:col-span-2"><Label>Logradouro *</Label><Input value={company.logradouro} onChange={e => setCompany({...company, logradouro: e.target.value})} /></div>
          <div><Label>Número *</Label><Input value={company.numero} onChange={e => setCompany({...company, numero: e.target.value})} /></div>
          <div><Label>Complemento</Label><Input value={company.complemento || ''} onChange={e => setCompany({...company, complemento: e.target.value})} /></div>
          <div><Label>Bairro *</Label><Input value={company.bairro} onChange={e => setCompany({...company, bairro: e.target.value})} /></div>
          <div><Label>Município *</Label><Input value={company.municipio} onChange={e => setCompany({...company, municipio: e.target.value})} /></div>
          <div><Label>Código IBGE Município</Label><Input value={company.codigo_municipio || ''} onChange={e => setCompany({...company, codigo_municipio: e.target.value})} placeholder="5107909" /></div>
          <div><Label>Telefone</Label><Input value={company.telefone || ''} onChange={e => setCompany({...company, telefone: e.target.value})} /></div>
          <div><Label>E-mail</Label><Input value={company.email || ''} onChange={e => setCompany({...company, email: e.target.value})} /></div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={saveCompany} disabled={saving}><Save className="w-4 h-4 mr-2" />Salvar Dados da Empresa</Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações Focus NFe */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações Focus NFe</CardTitle>
          <CardDescription>Defaults aplicados automaticamente em todas as notas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><Label>Emissão Habilitada</Label><p className="text-sm text-muted-foreground">Ativar emissão de NF-e/NFC-e</p></div>
            <Switch checked={settings.enabled} onCheckedChange={v => setSettings({...settings, enabled: v})} />
          </div>

          <div><Label>Ambiente</Label>
            <Select value={settings.ambiente} onValueChange={v => setSettings({...settings, ambiente: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">Homologação (testes — sem validade fiscal)</SelectItem>
                <SelectItem value="producao">Produção (notas válidas)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>CSOSN Padrão</Label><Input value={settings.csosn_padrao} onChange={e => setSettings({...settings, csosn_padrao: e.target.value})} /></div>
            <div><Label>CFOP Estadual</Label><Input value={settings.cfop_padrao} onChange={e => setSettings({...settings, cfop_padrao: e.target.value})} /></div>
            <div><Label>CFOP Interestadual</Label><Input value={settings.cfop_interestadual} onChange={e => setSettings({...settings, cfop_interestadual: e.target.value})} /></div>
            <div><Label>Origem (0=Nacional)</Label><Input value={settings.origem_padrao} onChange={e => setSettings({...settings, origem_padrao: e.target.value})} /></div>
            <div><Label>Unidade Padrão</Label><Input value={settings.unidade_padrao} onChange={e => setSettings({...settings, unidade_padrao: e.target.value})} /></div>
            <div><Label>NCM Padrão</Label><Input value={settings.ncm_padrao || ''} onChange={e => setSettings({...settings, ncm_padrao: e.target.value})} placeholder="95079000" /></div>
            <div><Label>Série NF-e</Label><Input type="number" value={settings.serie_nfe} onChange={e => setSettings({...settings, serie_nfe: parseInt(e.target.value)||1})} /></div>
            <div><Label>Série NFC-e</Label><Input type="number" value={settings.serie_nfce} onChange={e => setSettings({...settings, serie_nfce: parseInt(e.target.value)||1})} /></div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <p className="font-semibold text-sm">NFC-e (PDV/Balcão) — Código de Segurança do Contribuinte</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>CSC ID</Label><Input value={settings.csc_id || ''} onChange={e => setSettings({...settings, csc_id: e.target.value})} placeholder="000001" /></div>
              <div><Label>CSC Token</Label><Input type="password" value={settings.csc_token || ''} onChange={e => setSettings({...settings, csc_token: e.target.value})} /></div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div><Label>Emitir NFC-e automaticamente no PDV</Label><p className="text-sm text-muted-foreground">Ao finalizar venda no PDV</p></div>
              <Switch checked={settings.auto_emit_nfce_pdv} onCheckedChange={v => setSettings({...settings, auto_emit_nfce_pdv: v})} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Emitir NF-e quando pedido for pago</Label><p className="text-sm text-muted-foreground">Pedidos online pagos via PIX/cartão</p></div>
              <Switch checked={settings.auto_emit_nfe_pedido_pago} onCheckedChange={v => setSettings({...settings, auto_emit_nfe_pedido_pago: v})} />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveSettings} disabled={saving}><Save className="w-4 h-4 mr-2" />Salvar Configurações</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
