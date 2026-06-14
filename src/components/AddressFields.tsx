import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Check } from "lucide-react";

export interface AddressFieldsValue {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface SavedAddressOption {
  id: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default?: boolean;
}

export interface AddressFieldsProps {
  value: AddressFieldsValue;
  onChange: (value: AddressFieldsValue) => void;
  savedAddresses?: SavedAddressOption[];
  onSelectSavedAddress?: (addressId: string | null) => void;
  loading?: boolean;
  disabled?: boolean;
  hideSavedAddresses?: boolean;
  /** When true, street/neighborhood/city/state are read-only (auto-filled from ViaCEP) */
  readOnlyAddress?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) return digits.replace(/^(\d{5})(\d)/, "$1-$2");
  return digits;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function AddressFields({
  value,
  onChange,
  savedAddresses = [],
  onSelectSavedAddress,
  loading = false,
  disabled = false,
  hideSavedAddresses = false,
  readOnlyAddress = false,
}: AddressFieldsProps) {
  const [cepLoading, setCepLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // Auto-select default address when savedAddresses are loaded and nothing is selected yet
  useEffect(() => {
    if (savedAddresses.length > 0 && selectedAddressId === null) {
      const def = savedAddresses.find(a => a.is_default) ?? savedAddresses[0];
      if (def) {
        handleSelectAddress(def.id);
      }
    }
    // Only run when savedAddresses length changes from 0 to >0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddresses.length]);

  const update = (partial: Partial<AddressFieldsValue>) => {
    onChange({ ...value, ...partial });
  };

  const lookupCep = useCallback(async (cep: string) => {
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (!d.erro) {
        onChange({
          ...value,
          cep,
          street: d.logradouro || value.street,
          neighborhood: d.bairro || value.neighborhood,
          city: d.localidade || value.city,
          state: d.uf || value.state,
        });
      }
    } catch {
      // silencioso
    } finally {
      setCepLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    update({ cep: raw });
    if (raw.length === 8) lookupCep(raw);
  };

  const handleSelectAddress = (addressId: string | null) => {
    setSelectedAddressId(addressId);
    onSelectSavedAddress?.(addressId);
    if (addressId === null) return;
    const addr = savedAddresses.find(a => a.id === addressId);
    if (addr) {
      onChange({
        cep: addr.cep,
        street: addr.street,
        number: addr.number,
        complement: addr.complement || "",
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Saved addresses selector */}
      {!hideSavedAddresses && savedAddresses.length > 0 && (
        <div className="space-y-1.5">
          <Label>Usar endereço salvo</Label>
          <div className="space-y-1">
            {savedAddresses.map((addr) => (
              <label
                key={addr.id}
                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer ${
                  selectedAddressId === addr.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40"
                }`}
                onClick={() => handleSelectAddress(addr.id)}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedAddressId === addr.id ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                }`}>
                  {selectedAddressId === addr.id && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <MapPin className="w-3 h-3 inline mr-1 text-muted-foreground" />
                    {addr.street}, {addr.number} — {addr.neighborhood}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {addr.city}/{addr.state} — CEP: {formatCEP(addr.cep)}
                  </p>
                </div>
              </label>
            ))}
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer ${
                selectedAddressId === null
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => handleSelectAddress(null)}
            >
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selectedAddressId === null ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              }`}>
                {selectedAddressId === null && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span className="flex-1 text-sm font-medium">
                Digitar manualmente
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Manual address fields — hidden when a saved address is selected */}
      {selectedAddressId === null && (
      <>
        {/* CEP + Número */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="address-cep">CEP</Label>
            <div className="relative">
              <Input
                id="address-cep"
                inputMode="numeric"
                placeholder="00000-000"
                value={formatCEP(value.cep)}
                onChange={handleCepChange}
                autoComplete="postal-code"
                disabled={disabled || loading}
              />
              {cepLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ...
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address-number">Número</Label>
            <Input
              id="address-number"
              placeholder="Nº"
              value={value.number}
              onChange={(e) => update({ number: e.target.value })}
              autoComplete="off"
              disabled={disabled || loading}
            />
          </div>
        </div>

        {/* Logradouro */}
        {readOnlyAddress ? (
          value.street ? (
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">{value.street}</p>
              <p>
                {value.neighborhood && <>{value.neighborhood} — </>}
                {value.city}/{value.state}
              </p>
              <p className="text-xs">CEP: {formatCEP(value.cep)}</p>
            </div>
          ) : null
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="address-street">Logradouro</Label>
              <Input
                id="address-street"
                placeholder="Rua, Av..."
                value={value.street}
                onChange={(e) => update({ street: e.target.value })}
                disabled={disabled || loading}
              />
            </div>

            {/* Bairro + Cidade + UF */}
            <div className="grid grid-cols-[1fr_1fr_80px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="address-neighborhood">Bairro</Label>
                <Input
                  id="address-neighborhood"
                  placeholder="Bairro"
                  value={value.neighborhood}
                  onChange={(e) => update({ neighborhood: e.target.value })}
                  disabled={disabled || loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address-city">Cidade</Label>
                <Input
                  id="address-city"
                  placeholder="Cidade"
                  value={value.city}
                  onChange={(e) => update({ city: e.target.value })}
                  disabled={disabled || loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address-state">UF</Label>
                <Input
                  id="address-state"
                  placeholder="UF"
                  maxLength={2}
                  value={value.state.toUpperCase()}
                  onChange={(e) => update({ state: e.target.value.toUpperCase() })}
                  disabled={disabled || loading}
                />
              </div>
            </div>
          </>
        )}

        {/* Complemento */}
        {!readOnlyAddress && (
          <div className="space-y-1.5">
            <Label htmlFor="address-complement">
              Complemento <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="address-complement"
              placeholder="Apto, bloco, etc."
              value={value.complement}
              onChange={(e) => update({ complement: e.target.value })}
              disabled={disabled || loading}
            />
          </div>
        )}
      </>
      )}
    </div>
  );
}
