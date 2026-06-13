import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { UserAddress } from "@/components/MyAddresses";
import { AddressFields } from "@/components/AddressFields";

interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após salvar com sucesso, recebendo o endereço criado/atualizado */
  onSaved?: (address: UserAddress) => void;
  /** Pré-preenche o CEP (útil quando o usuário já calculou frete para um CEP) */
  initialCep?: string;
}

interface FormState {
  label: string;
  recipient_name: string;
  recipient_phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default: boolean;
}

const emptyForm: FormState = {
  label: "Casa",
  recipient_name: "",
  recipient_phone: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  is_default: false,
};

export function AddressFormDialog({ open, onOpenChange, onSaved, initialCep }: AddressFormDialogProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");

  // Carregar nome do perfil
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name);
      });
  }, [user]);

  // Resetar e (opcionalmente) pré-preencher CEP ao abrir
  useEffect(() => {
    if (open) {
      const cep = (initialCep || "").replace(/\D/g, "").slice(0, 8);
      setForm({ ...emptyForm, cep, recipient_name: profileName || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!user) {
      toast.error("Você precisa estar logado para salvar endereços");
      return;
    }
    if (form.cep.length !== 8) return toast.error("CEP inválido");
    if (
      !form.street.trim() ||
      !form.number.trim() ||
      !form.neighborhood.trim() ||
      !form.city.trim() ||
      form.state.length !== 2
    ) {
      return toast.error("Preencha o endereço completo");
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      label: form.label.trim() || "Endereço",
      recipient_name: form.recipient_name.trim() || profileName || "Cliente",
      recipient_phone: form.recipient_phone.trim() || null,
      cep: form.cep,
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim() || null,
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.toUpperCase(),
      is_default: form.is_default,
    };

    const { data, error } = await supabase
      .from("user_addresses")
      .insert(payload)
      .select()
      .single();
    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Endereço salvo");
    onOpenChange(false);
    if (onSaved && data) onSaved(data as UserAddress);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar endereço</DialogTitle>
          <DialogDescription>Preencha os dados do endereço de entrega.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Apelido</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Casa, Trabalho..."
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</Label>
              <Input
                value={form.recipient_phone}
                onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <AddressFields
            value={{
              cep: form.cep,
              street: form.street,
              number: form.number,
              complement: form.complement,
              neighborhood: form.neighborhood,
              city: form.city,
              state: form.state,
            }}
            onChange={(addr) => setForm({ ...form, ...addr })}
            hideSavedAddresses
          />

          <label className="flex items-center gap-2 text-sm pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="rounded"
            />
            Tornar este o endereço padrão
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar endereço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
