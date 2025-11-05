import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { NFESettings } from './NFESettings';
import { TGASettings } from './TGASettings';
import { NFEList } from './NFEList';
import { XMLExporter } from './XMLExporter';
import { FileText, Settings, Download, TrendingUp } from 'lucide-react';

interface FiscalSettings {
  id: string;
  nfe_enabled: boolean;
  nfe_api_key: string | null;
  nfe_company_id: string | null;
  tga_enabled: boolean;
  tga_api_url: string | null;
  tga_username: string | null;
  tga_password: string | null;
  auto_emit_nfe: boolean;
  auto_sync_tga: boolean;
}

export function FiscalSystem() {
  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('fiscal_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
      } else {
        // Criar configuração inicial se não existir
        const { data: newSettings, error: insertError } = await supabase
          .from('fiscal_settings')
          .insert({
            nfe_enabled: false,
            tga_enabled: false,
            auto_emit_nfe: false,
            auto_sync_tga: false
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar configurações',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando sistema fiscal...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sistema Fiscal Completo
          </CardTitle>
          <CardDescription>
            Gerencie notas fiscais, integração TGA e exportação de XMLs para contabilidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="nfe" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="nfe" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Notas Fiscais
              </TabsTrigger>
              <TabsTrigger value="settings-nfe" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Config. NFe
              </TabsTrigger>
              <TabsTrigger value="settings-tga" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Config. TGA
              </TabsTrigger>
              <TabsTrigger value="export" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exportar XMLs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="nfe" className="space-y-4">
              <NFEList settings={settings} onRefresh={loadSettings} />
            </TabsContent>

            <TabsContent value="settings-nfe" className="space-y-4">
              <NFESettings settings={settings} onUpdate={loadSettings} />
            </TabsContent>

            <TabsContent value="settings-tga" className="space-y-4">
              <TGASettings settings={settings} onUpdate={loadSettings} />
            </TabsContent>

            <TabsContent value="export" className="space-y-4">
              <XMLExporter />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
