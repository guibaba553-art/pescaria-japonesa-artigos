import { useState, useEffect } from "react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Store, Palette, Image, MessageSquare } from "lucide-react";

export function StoreSettingsForm() {
  const { settings, isLoading, updateSettings, isUpdating } = useStoreSettings();
  const [formData, setFormData] = useState({
    store_name: "",
    store_logo_url: "",
    store_description: "",
    contact_phone: "",
    contact_email: "",
    contact_whatsapp: "",
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    hero_image_url: "",
    hero_title: "",
    hero_subtitle: "",
    footer_text: "",
    cep_origin: "",
    mercado_pago_public_key: "",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        store_name: settings.store_name || "",
        store_logo_url: settings.store_logo_url || "",
        store_description: settings.store_description || "",
        contact_phone: settings.contact_phone || "",
        contact_email: settings.contact_email || "",
        contact_whatsapp: settings.contact_whatsapp || "",
        primary_color: settings.primary_color || "",
        secondary_color: settings.secondary_color || "",
        accent_color: settings.accent_color || "",
        hero_image_url: settings.hero_image_url || "",
        hero_title: settings.hero_title || "",
        hero_subtitle: settings.hero_subtitle || "",
        footer_text: settings.footer_text || "",
        cep_origin: settings.cep_origin || "",
        mercado_pago_public_key: settings.mercado_pago_public_key || "",
      });
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">
            <Store className="h-4 w-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="contact">
            <MessageSquare className="h-4 w-4 mr-2" />
            Contato
          </TabsTrigger>
          <TabsTrigger value="visual">
            <Image className="h-4 w-4 mr-2" />
            Visual
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Palette className="h-4 w-4 mr-2" />
            Integrações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
              <CardDescription>Configure as informações básicas da loja</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="store_name">Nome da Loja</Label>
                <Input
                  id="store_name"
                  value={formData.store_name}
                  onChange={(e) => handleChange("store_name", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="store_description">Descrição</Label>
                <Textarea
                  id="store_description"
                  value={formData.store_description}
                  onChange={(e) => handleChange("store_description", e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="cep_origin">CEP de Origem (para cálculo de frete)</Label>
                <Input
                  id="cep_origin"
                  value={formData.cep_origin}
                  onChange={(e) => handleChange("cep_origin", e.target.value)}
                  placeholder="00000000"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact">
          <Card>
            <CardHeader>
              <CardTitle>Informações de Contato</CardTitle>
              <CardDescription>Configure os canais de comunicação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="contact_phone">Telefone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => handleChange("contact_phone", e.target.value)}
                  placeholder="5511999999999"
                />
              </div>
              <div>
                <Label htmlFor="contact_email">E-mail</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => handleChange("contact_email", e.target.value)}
                  placeholder="contato@loja.com"
                />
              </div>
              <div>
                <Label htmlFor="contact_whatsapp">Link WhatsApp</Label>
                <Input
                  id="contact_whatsapp"
                  value={formData.contact_whatsapp}
                  onChange={(e) => handleChange("contact_whatsapp", e.target.value)}
                  placeholder="https://wa.me/5511999999999"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visual">
          <Card>
            <CardHeader>
              <CardTitle>Aparência e Imagens</CardTitle>
              <CardDescription>Personalize o visual da loja</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="store_logo_url">URL do Logo</Label>
                <Input
                  id="store_logo_url"
                  value={formData.store_logo_url}
                  onChange={(e) => handleChange("store_logo_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="hero_image_url">URL da Imagem Hero</Label>
                <Input
                  id="hero_image_url"
                  value={formData.hero_image_url}
                  onChange={(e) => handleChange("hero_image_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="hero_title">Título Hero</Label>
                <Input
                  id="hero_title"
                  value={formData.hero_title}
                  onChange={(e) => handleChange("hero_title", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="hero_subtitle">Subtítulo Hero</Label>
                <Input
                  id="hero_subtitle"
                  value={formData.hero_subtitle}
                  onChange={(e) => handleChange("hero_subtitle", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="footer_text">Texto do Rodapé</Label>
                <Input
                  id="footer_text"
                  value={formData.footer_text}
                  onChange={(e) => handleChange("footer_text", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="primary_color">Cor Primária (HSL)</Label>
                <Input
                  id="primary_color"
                  value={formData.primary_color}
                  onChange={(e) => handleChange("primary_color", e.target.value)}
                  placeholder="222.2 84% 4.9%"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formato: "H S% L%" (ex: 222.2 84% 4.9%)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrações</CardTitle>
              <CardDescription>Configure integrações de pagamento e outros serviços</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="mercado_pago_public_key">Chave Pública Mercado Pago</Label>
                <Input
                  id="mercado_pago_public_key"
                  value={formData.mercado_pago_public_key}
                  onChange={(e) => handleChange("mercado_pago_public_key", e.target.value)}
                  placeholder="APP_USR-..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={isUpdating}>
          {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </form>
  );
}
