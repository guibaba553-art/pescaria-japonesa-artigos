import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { sanitizeNumericInput, formatCPF, formatCEP, formatPhone } from "@/utils/validation";
import { User, Mail, Pencil, Save, X } from "lucide-react";

interface Profile {
  full_name: string | null;
  cpf: string | null;
  cep: string | null;
  phone: string | null;
}

export function MyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [phone, setPhone] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("full_name, cpf, cep, phone")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      setProfile(data);
      setFullName(data.full_name || "");
      setCpf(data.cpf || "");
      setCep(data.cep || "");
      setPhone(data.phone || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    if (cpf && cpf.length !== 11) return toast.error("CPF inválido");
    if (cep && cep.length !== 8) return toast.error("CEP inválido");
    if (phone && (phone.length < 10 || phone.length > 11)) return toast.error("Telefone inválido");

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        cpf: cpf || null,
        cep: cep || null,
        phone: phone || null,
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Dados atualizados");
    setEditing(false);
    load();
  };

  const handleCancel = () => {
    setFullName(profile?.full_name || "");
    setCpf(profile?.cpf || "");
    setCep(profile?.cep || "");
    setPhone(profile?.phone || "");
    setEditing(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-black tracking-tight">Meus Dados</h2>
          <p className="text-sm text-muted-foreground">Informações pessoais usadas em seus pedidos.</p>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="rounded-full">
            <Pencil className="w-4 h-4 mr-1.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving} className="rounded-full">
              <X className="w-4 h-4 mr-1.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="rounded-full">
              <Save className="w-4 h-4 mr-1.5" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{profile?.full_name || "—"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {user?.email}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Nome completo"
              value={fullName}
              displayValue={profile?.full_name || "—"}
              editing={editing}
              onChange={setFullName}
            />
            <Field
              label="Email"
              value={user?.email || ""}
              displayValue={user?.email || "—"}
              editing={false}
              onChange={() => {}}
              hint="Para alterar o email, contate o suporte."
            />
            <Field
              label="CPF"
              value={formatCPF(cpf)}
              displayValue={cpf ? formatCPF(cpf) : "—"}
              editing={editing}
              onChange={(v) => setCpf(sanitizeNumericInput(v))}
              maxLength={14}
            />
            <Field
              label="Telefone"
              value={formatPhone(phone)}
              displayValue={phone ? formatPhone(phone) : "—"}
              editing={editing}
              onChange={(v) => setPhone(sanitizeNumericInput(v))}
              maxLength={15}
            />
            <Field
              label="CEP principal"
              value={formatCEP(cep)}
              displayValue={cep ? formatCEP(cep) : "—"}
              editing={editing}
              onChange={(v) => setCep(sanitizeNumericInput(v))}
              maxLength={9}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  displayValue,
  editing,
  onChange,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  displayValue: string;
  editing: boolean;
  onChange: (v: string) => void;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {editing ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} className="h-10 rounded-xl" />
      ) : (
        <p className="h-10 px-3 flex items-center rounded-xl bg-muted/40 text-sm font-medium">{displayValue}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
