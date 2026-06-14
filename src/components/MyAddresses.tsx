import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCEP } from "@/utils/validation";
import { AddressFields } from "@/components/AddressFields";

export interface UserAddress {
  id: string;
  user_id: string;
  label: string;
  recipient_name: string;
  recipient_phone: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  is_default: boolean;
  created_at: string;
}

interface FormState {
  id?: string;
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

interface MyAddressesProps {
  /** Quando informado, mostra checkbox compacto e ao salvar/escolher chama onSelect com o endereço */
  onSelect?: (address: UserAddress) => void;
  selectedId?: string;
  /** Reduz o título — útil para uso em diálogos/checkout */
  compact?: boolean;
  /** Oculta o botão "Novo endereço" do header — útil quando o contexto pai já provê um */
  hideAddButton?: boolean;
}

export function MyAddresses({ onSelect, selectedId, compact, hideAddButton = false }: MyAddressesProps) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar endereços");
    } else {
      setAddresses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Load profile name for auto-fill
    if (user) {
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.full_name) setProfileName(data.full_name);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openNew = () => {
    setForm({ ...emptyForm, is_default: addresses.length === 0, recipient_name: profileName || emptyForm.recipient_name });
    setDialogOpen(true);
  };

  const openEdit = (a: UserAddress) => {
    setForm({
      id: a.id,
      label: a.label,
      recipient_name: a.recipient_name,
      recipient_phone: a.recipient_phone || "",
      cep: a.cep,
      street: a.street,
      number: a.number,
      complement: a.complement || "",
      neighborhood: a.neighborhood,
      city: a.city,
      state: a.state,
      is_default: a.is_default,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.recipient_name.trim()) return toast.error("Informe o destinatário");
    if (form.cep.length !== 8) return toast.error("CEP inválido");
    if (!form.street.trim() || !form.number.trim() || !form.neighborhood.trim() || !form.city.trim() || form.state.length !== 2) {
      return toast.error("Preencha o endereço completo");
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      label: form.label.trim() || "Endereço",
      recipient_name: form.recipient_name.trim(),
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

    let result;
    if (form.id) {
      result = await supabase.from("user_addresses").update(payload).eq("id", form.id).select().single();
    } else {
      result = await supabase.from("user_addresses").insert(payload).select().single();
    }
    setSaving(false);

    if (result.error) {
      toast.error("Erro ao salvar: " + result.error.message);
      return;
    }
    toast.success(form.id ? "Endereço atualizado" : "Endereço salvo");
    setDialogOpen(false);
    await load();
    if (onSelect && result.data) onSelect(result.data as UserAddress);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("user_addresses").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Endereço excluído");
      await load();
    }
    setDeleteId(null);
  };

  const setDefault = async (id: string) => {
    const { error } = await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    if (error) toast.error("Erro ao definir padrão");
    else {
      toast.success("Endereço padrão atualizado");
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {!compact && (
          <div>
            <h2 className="text-xl font-display font-black tracking-tight">Meus Endereços</h2>
            <p className="text-sm text-muted-foreground">Salve vários endereços para agilizar seu checkout.</p>
          </div>
        )}
        {!hideAddButton && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-full ml-auto" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Novo endereço
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar endereço" : "Novo endereço"}</DialogTitle>
              <DialogDescription>Esses dados serão usados para entregas.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="addr-label" className="text-xs uppercase tracking-wider text-muted-foreground">Apelido</Label>
                  <Input id="addr-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Casa, Trabalho..." />
                </div>
                <div>
                  <Label htmlFor="addr-recipient" className="text-xs uppercase tracking-wider text-muted-foreground">Destinatário</Label>
                  <Input id="addr-recipient" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="addr-label" className="text-xs uppercase tracking-wider text-muted-foreground">Apelido</Label>
                  <Input id="addr-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Casa, Trabalho..." />
                </div>
                <div>
                  <Label htmlFor="addr-phone" className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</Label>
                  <Input id="addr-phone" value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} placeholder="(00) 00000-0000" />
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
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : addresses.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="p-8 text-center">
            <MapPin className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-semibold mb-1">Nenhum endereço salvo</p>
            <p className="text-sm text-muted-foreground mb-4">
              Cadastre seu primeiro endereço para fazer pedidos rapidamente.
            </p>
            <Button onClick={openNew} size="sm" className="rounded-full">
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar endereço
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => {
            const isSelected = selectedId === a.id;
            return (
              <Card
                key={a.id}
                className={`rounded-2xl transition-all ${
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
                } ${onSelect ? "cursor-pointer hover:border-primary/60" : ""}`}
                onClick={() => onSelect?.(a)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-semibold">
                      <MapPin className="w-3 h-3 mr-1" /> {a.label}
                    </Badge>
                    {a.is_default && (
                      <Badge className="bg-primary text-primary-foreground">
                        <Star className="w-3 h-3 mr-1 fill-current" /> Padrão
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold">{a.recipient_name}</p>
                    <p className="text-muted-foreground">
                      {a.street}, {a.number}
                      {a.complement ? ` — ${a.complement}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {a.neighborhood} · {a.city}/{a.state}
                    </p>
                    <p className="text-muted-foreground">CEP {formatCEP(a.cep)}</p>
                    {a.recipient_phone && <p className="text-muted-foreground">Tel: {a.recipient_phone}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!a.is_default && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDefault(a.id);
                        }}
                      >
                        <Star className="w-3.5 h-3.5 mr-1" /> Tornar padrão
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(a);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(a.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir endereço?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
