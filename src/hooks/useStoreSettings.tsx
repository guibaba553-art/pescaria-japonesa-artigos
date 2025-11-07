import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StoreSettings {
  id: string;
  store_name: string;
  store_logo_url?: string | null;
  store_description?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_whatsapp?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  hero_image_url?: string | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  footer_text?: string | null;
  cep_origin?: string | null;
  mercado_pago_public_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const useStoreSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["store-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .single();

      if (error) throw error;
      return data as StoreSettings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<StoreSettings>) => {
      if (!settings?.id) throw new Error("Settings not found");

      const { data, error } = await supabase
        .from("store_settings")
        .update(newSettings)
        .eq("id", settings.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações da loja foram atualizadas com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending,
  };
};
