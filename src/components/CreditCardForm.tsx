import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from "react";
import { CreditCard, Lock, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

import {
  validateCardNumber,
  validateExpiry,
  validateCVV,
  validateHolderName,
  getBrandLabel,
} from "@/lib/creditCardValidation";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface SavedCard {
  id: string;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: string | null;
  cardExpYear: string | null;
  cardholderName: string | null;
  asaasCreditCardToken?: string;
}

export interface CreditCardFormData {
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
    phone: string;
    mobilePhone?: string;
  };
  installmentCount: number;
  saveCard: boolean;
  creditCardToken?: string;
}

export interface CreditCardFormHandle {
  /** Validate all fields and return error messages. Sets internal errors state. */
  validate: () => string[];
  /** Validate fields and return form data if valid, or null on validation failure. */
  getData: () => CreditCardFormData | null;
}

export interface CreditCardFormProps {
  totalAmount: number;
  onCardData?: (data: CreditCardFormData) => void;
  onInstallmentChange: (installmentCount: number) => void;
  saveCard?: boolean;
  onSaveCardChange?: (saveCard: boolean) => void;
  loading?: boolean;
  savedCards?: SavedCard[];
  onSelectSavedCard?: (cardId: string | null) => void;
  selectedSavedCardId?: string | null;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/**
 * Valida CPF com dígitos verificadores.
 * Algoritmo:
 * 1. Multiplica cada um dos primeiros 9 dígitos por (10 - posição), soma, obtém resto,
 *    primeiro dígito verificador = 11 - resto (se > 9, 0)
 * 2. Multiplica os primeiros 10 dígitos por (11 - posição), soma, obtém resto,
 *    segundo dígito verificador = 11 - resto (se > 9, 0)
 * 3. Compara dígitos calculados com os fornecidos.
 * Rejeita CPFs como 000.000.000-00, 111.111.111-11, etc.
 */
function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  // Rejeitar todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Calcular primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * (10 - i);
  }
  let firstDigit = 11 - (sum % 11);
  if (firstDigit > 9) firstDigit = 0;

  // Calcular segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i], 10) * (11 - i);
  }
  let secondDigit = 11 - (sum % 11);
  if (secondDigit > 9) secondDigit = 0;

  return (
    firstDigit === parseInt(digits[9], 10) &&
    secondDigit === parseInt(digits[10], 10)
  );
}

function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) return digits.replace(/^(\d{5})(\d)/, "$1-$2");
  return digits;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length > 7) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (digits.length > 2) {
    return digits.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  }
  if (digits.length > 0) {
    return digits.replace(/^(\d{0,2})/, "($1");
  }
  return digits;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export const CreditCardForm = forwardRef<CreditCardFormHandle, CreditCardFormProps>(
  function CreditCardForm({
    totalAmount,
    onCardData,
    onInstallmentChange,
    saveCard: saveCardProp,
    onSaveCardChange,
    loading = false,
    savedCards = [],
    onSelectSavedCard,
    selectedSavedCardId: selectedSavedCardIdProp,
    error: externalError,
  }, ref) {
  /* -------- Mode -------- */
  const hasSavedCards = savedCards.length > 0;
  const [mode, setMode] = useState<"new" | "saved">(
    hasSavedCards && selectedSavedCardIdProp ? "saved" : "new"
  );

  // When savedCards list changes, adjust mode
  useEffect(() => {
    if (!hasSavedCards) {
      setMode("new");
    }
  }, [hasSavedCards]);

  /* -------- Internal selected card -------- */
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedSavedCardIdProp ?? null
  );

  const selectedId = selectedSavedCardIdProp ?? internalSelectedId;

  const handleSelectSavedCard = useCallback(
    (id: string | null) => {
      setInternalSelectedId(id);
      onSelectSavedCard?.(id);
      if (id === null) {
        setMode("new");
      } else {
        const card = savedCards.find(c => c.id === id);
        // Only enter saved mode if the card actually has a token
        if (card?.asaasCreditCardToken) {
          setMode("saved");
          if (card.cardholderName) setHolderName(card.cardholderName);
        } else {
          // No token — force new card form, pre-fill what we have
          setMode("new");
          if (card?.cardholderName) setHolderName(card.cardholderName);
          if (card?.cardExpMonth) setExpiryMonth(card.cardExpMonth);
          if (card?.cardExpYear) setExpiryYear(card.cardExpYear);
        }
      }
    },
    [onSelectSavedCard, savedCards]
  );

  /* -------- Form fields -------- */
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");

  const [holderName, setHolderName] = useState("");
  const [email, setEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [phone, setPhone] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");

  const [installmentCount, setInstallmentCount] = useState("1");
  const [saveCard, setSaveCard] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const touchedRef = useRef<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = useCallback((field: string) => {
    touchedRef.current = { ...touchedRef.current, [field]: true };
    setTouched(touchedRef.current);
  }, []);

  /* -------- Validation -------- */
  const validate = useCallback((dirtyOnly = false, localTouched?: Record<string, boolean>): string[] => {
    const isTouched = (field: string) => !dirtyOnly || (localTouched ?? touched)[field];

    const errs: string[] = [];

    if (mode === "new") {
      // Card number
      const cleanedNumber = cardNumber.replace(/\D/g, "");
      if (isTouched("cardNumber")) {
        if (!cleanedNumber) {
          errs.push("Número do cartão é obrigatório.");
        } else {
          const { valid, brand } = validateCardNumber(cleanedNumber);
          if (!valid) errs.push("Número do cartão inválido. Verifique os dígitos.");
          else if (!brand) errs.push("Bandeira do cartão não reconhecida.");
        }
      }

      // Holder name on card
      if (isTouched("cardHolderName")) {
        if (!validateHolderName(cardHolderName))
          errs.push("Nome no cartão deve ter pelo menos 3 caracteres.");
      }

      // Expiry
      if (isTouched("expiry")) {
        if (!validateExpiry(expiryMonth, expiryYear))
          errs.push("Data de validade inválida ou cartão vencido.");
      }

      // CVV
      if (isTouched("cvv")) {
        if (!validateCVV(cvv)) errs.push("CVV inválido (3 ou 4 dígitos).");
      }
    }

    // Holder info (only required for new cards — saved cards skip this)
    if (mode !== "saved") {
      if (isTouched("holderName")) {
        if (!holderName.trim() || holderName.trim().length < 3)
          errs.push("Nome completo é obrigatório (mín. 3 caracteres).");
      }

      if (isTouched("email")) {
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          errs.push("E-mail inválido.");
      }

      if (isTouched("cpf")) {
        const cleanCpf = cpfCnpj.replace(/\D/g, "");
        if (cleanCpf.length !== 11) {
          errs.push("CPF deve ter 11 dígitos.");
        } else if (!validateCPF(cleanCpf)) {
          errs.push("CPF inválido. Verifique os dígitos.");
        }
      }

      if (isTouched("cep")) {
        const cleanCep = postalCode.replace(/\D/g, "");
        if (cleanCep.length !== 8)
          errs.push("CEP deve ter 8 dígitos.");
      }

      if (isTouched("addressNumber")) {
        if (!addressNumber.trim())
          errs.push("Número do endereço é obrigatório.");
      }

      if (isTouched("phone")) {
        const cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone.length < 10 || cleanPhone.length > 11)
          errs.push("Telefone inválido (mín. 10 dígitos com DDD).");
      }
    }

    return errs;
  }, [
    mode,
    touched,
    cardNumber,
    cardHolderName,
    expiryMonth,
    expiryYear,
    cvv,
    holderName,
    email,
    cpfCnpj,
    postalCode,
    addressNumber,
    phone,
  ]);

  const handleBlur = useCallback((field: string) => {
    markTouched(field);
    // Valida considerando touched atual + campo recém-saído do blur
    const localTouched = { ...touchedRef.current };
    const errs = validate(/* dirtyOnly */ true, localTouched);
    setErrors(errs);
  }, [markTouched, validate]);

  // Limpa erro de um campo específico quando o usuário começa a editar
  const clearFieldError = useCallback((field: string) => {
    setErrors(prev => prev.filter(e => !e.toLowerCase().includes(field.toLowerCase())));
  }, []);

  /* -------- Derived: brand -------- */
  const cardBrand = useMemo(() => {
    const cleaned = cardNumber.replace(/\D/g, "");
    if (cleaned.length < 6) return null;
    const { brand } = validateCardNumber(cleaned);
    return brand;
  }, [cardNumber]);

  /* -------- Installment options -------- */
  const installmentOptions = useMemo(() => {
    const maxInstallments = Math.min(10, Math.floor(totalAmount / 5));
    const count = Math.max(1, maxInstallments);
    const options: { value: string; label: string }[] = [];
    for (let i = 1; i <= count; i++) {
      const value = totalAmount / i;
      options.push({
        value: String(i),
        label: `${i}x de ${fmtBRL(value)}`,
      });
    }
    return options;
  }, [totalAmount]);

  // Sync selected installment
  useEffect(() => {
    const current = parseInt(installmentCount, 10);
    const max = Math.max(1, Math.min(10, Math.floor(totalAmount / 5)));
    if (current > max) {
      setInstallmentCount(String(max));
    }
  }, [installmentOptions, installmentCount, totalAmount]);

  /* -------- Controlled saveCard -------- */
  const isSaveCardChecked = saveCardProp ?? saveCard;
  const handleSaveCardChange = (checked: boolean) => {
    setSaveCard(checked);
    onSaveCardChange?.(checked);
  };

  /* -------- Build form data -------- */
  const buildFormData = useCallback((): CreditCardFormData => {
    const data: CreditCardFormData = {
      creditCard: {
        holderName: cardHolderName,
        number: cardNumber.replace(/\D/g, ""),
        expiryMonth,
        expiryYear,
        ccv: cvv,
      },
      creditCardHolderInfo: {
        name: holderName.trim(),
        email: email.trim(),
        cpfCnpj: cpfCnpj.replace(/\D/g, ""),
        postalCode: postalCode.replace(/\D/g, ""),
        addressNumber: addressNumber.trim(),
        addressComplement: addressComplement.trim() || undefined,
        phone: phone.replace(/\D/g, ""),
        mobilePhone: mobilePhone.replace(/\D/g, "") || undefined,
      },
      installmentCount: parseInt(installmentCount, 10),
      saveCard: isSaveCardChecked,
    };

    if (mode === "saved" && selectedId) {
      const selectedCard = savedCards.find(c => c.id === selectedId);
      if (selectedCard?.asaasCreditCardToken) {
        data.creditCardToken = selectedCard.asaasCreditCardToken;
        delete data.creditCardHolderInfo;
      }
    }

    return data;
  }, [
    cardHolderName,
    cardNumber,
    expiryMonth,
    expiryYear,
    cvv,
    holderName,
    email,
    cpfCnpj,
    postalCode,
    addressNumber,
    addressComplement,
    phone,
    mobilePhone,
    installmentCount,
    isSaveCardChecked,
    mode,
    selectedId,
    savedCards,
  ]);

  /* -------- Expose imperative handle for parent -------- */
  useImperativeHandle(ref, () => ({
    validate: () => {
      const errs = validate();
      setErrors(errs);
      return errs;
    },
    getData: () => {
      const errs = validate();
      if (errs.length > 0) {
        setErrors(errs);
        return null;
      }
      setErrors([]);
      return buildFormData();
    },
  }), [validate, buildFormData]);

  /* -------- Field change handlers -------- */
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 19);
    setCardNumber(raw);
    clearFieldError("cardNumber");
  };

  const handleExpiryMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setExpiryMonth(raw);
    clearFieldError("expiry");
  };

  const handleExpiryYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setExpiryYear(raw);
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCvv(raw);
    clearFieldError("cvv");
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setCpfCnpj(raw);
    clearFieldError("cpf");
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setPostalCode(raw);
    clearFieldError("cep");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setPhone(raw);
    clearFieldError("phone");
  };

  const handleMobilePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setMobilePhone(raw);
  };

  /* -------- Installment change -------- */
  const handleInstallmentChange = (value: string) => {
    setInstallmentCount(value);
    onInstallmentChange(parseInt(value, 10));
  };

  /* -------- Render -------- */
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Cartão de Crédito
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---------- Saved Cards ---------- */}
        {hasSavedCards && (
          <div className="space-y-3">
            <Label>Cartões salvos</Label>
            <RadioGroup
              value={selectedId ?? "new"}
              onValueChange={(val) => {
                if (val === "new") {
                  handleSelectSavedCard(null);
                } else {
                  handleSelectSavedCard(val);
                }
              }}
              className="gap-2"
            >
              {savedCards.map((sc) => (
                <label
                  key={sc.id}
                  htmlFor={`saved-${sc.id}`}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    selectedId === sc.id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <RadioGroupItem value={sc.id} id={`saved-${sc.id}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm">
                        {sc.cardBrand ?? "Cartão"}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        •••• {sc.cardLast4 ?? "????"}
                      </span>
                      {sc.cardExpMonth && sc.cardExpYear && (
                        <span className="text-xs text-muted-foreground">
                          Val. {sc.cardExpMonth}/{sc.cardExpYear}
                        </span>
                      )}
                    </div>
                    {sc.cardholderName && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {sc.cardholderName}
                      </p>
                    )}
                  </div>
                </label>
              ))}

              {/* Use new card option */}
              <label
                htmlFor="saved-new"
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                  selectedId === null || !hasSavedCards
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <RadioGroupItem value="new" id="saved-new" className="mt-0.5" />
                <span className="flex-1 text-sm font-medium">
                  Usar novo cartão
                </span>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* ---------- New Card Fields ---------- */}
        {mode === "new" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Dados do cartão
            </h3>

            {/* Card holder name */}
            <div className="space-y-1.5">
              <Label htmlFor="card-holder-name">Nome no cartão</Label>
              <Input
                id="card-holder-name"
                placeholder="Como impresso no cartão"
                autoComplete="cc-name"
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value.toUpperCase())}
                maxLength={100}
                disabled={loading}
              />
            </div>

            {/* Card number */}
            <div className="space-y-1.5">
              <Label htmlFor="card-number">Número do cartão</Label>
              <div className="relative">
                <Input
                  id="card-number"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="0000 0000 0000 0000"
                  value={formatCardNumber(cardNumber)}
                  onChange={handleCardNumberChange}
                  onBlur={() => handleBlur("cardNumber")}
                  className="pr-24 font-mono tracking-wider"
                  disabled={loading}
                />
                {cardBrand && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded border">
                    {getBrandLabel(cardBrand)}
                  </span>
                )}
              </div>
            </div>

            {/* Expiry + CVV */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="expiry-month">Validade</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="expiry-month"
                    inputMode="numeric"
                    placeholder="MM"
                    value={expiryMonth}
                    onChange={handleExpiryMonthChange}
                    maxLength={2}
                    className="w-full font-mono text-center"
                    disabled={loading}
                  />
                  <span className="text-muted-foreground text-sm">/</span>
                  <Input
                    id="expiry-year"
                    inputMode="numeric"
                    placeholder="AA"
                    value={expiryYear}
                    onChange={handleExpiryYearChange}
                    onBlur={() => handleBlur("expiry")}
                    maxLength={2}
                    className="w-full font-mono text-center"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cvv">CVV</Label>
                <Input
                  id="cvv"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={cvv}
                  onChange={handleCvvChange}
                  maxLength={4}
                  className="font-mono text-center"
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        )}

        {/* ---------- Holder Info — only for new cards ---------- */}
        {mode !== "saved" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Dados do titular
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="holder-name">Nome completo</Label>
            <Input
              id="holder-name"
              placeholder="Seu nome completo"
              autoComplete="name"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              onBlur={() => handleBlur("holderName")}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur("email")}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={formatCPF(cpfCnpj)}
              onChange={handleCpfChange}
              onBlur={() => handleBlur("cpf")}
              autoComplete="off"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                inputMode="numeric"
                placeholder="00000-000"
                value={formatCEP(postalCode)}
                onChange={handleCepChange}
                onBlur={() => handleBlur("cep")}
                autoComplete="postal-code"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address-number">Número</Label>
              <Input
                id="address-number"
                placeholder="Nº"
                value={addressNumber}
                onChange={(e) => setAddressNumber(e.target.value)}
                onBlur={() => handleBlur("addressNumber")}
                autoComplete="off"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address-complement">
              Complemento <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="address-complement"
              placeholder="Apto, bloco, etc."
              value={addressComplement}
              onChange={(e) => setAddressComplement(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={formatPhone(phone)}
                onChange={handlePhoneChange}
                onBlur={() => handleBlur("phone")}
                autoComplete="tel"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-phone">
                Celular <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="mobile-phone"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={formatPhone(mobilePhone)}
                onChange={handleMobilePhoneChange}
                autoComplete="tel"
                disabled={loading}
              />
            </div>
          </div>
        </div>
        )}

        {/* ---------- Installments ---------- */}
        <div className="space-y-1.5">
          <Label htmlFor="installments">Parcelas</Label>
          <Select
            value={installmentCount}
            onValueChange={handleInstallmentChange}
            disabled={loading || installmentOptions.length === 0}
          >
            <SelectTrigger id="installments" className="w-full">
              <SelectValue placeholder="Selecione o número de parcelas" />
            </SelectTrigger>
            <SelectContent>
              {installmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {totalAmount < 5 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" />
              Valor mínimo por parcela é R$ 5,00.
            </p>
          )}
        </div>

        {/* ---------- Save Card Checkbox — only for new cards ---------- */}
        {mode === "new" && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="save-card"
              checked={isSaveCardChecked}
              onCheckedChange={(checked) => handleSaveCardChange(checked === true)}
              disabled={loading}
            />
            <Label htmlFor="save-card" className="text-sm leading-tight cursor-pointer">
              Salvar cartão para compras futuras
            </Label>
          </div>
        )}

        {/* ---------- Lock notice ---------- */}
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Seus dados são protegidos com criptografia. Nós nunca armazenamos o
            número completo do cartão ou o CVV.
          </p>
        </div>

        {/* ---------- Errors ---------- */}
        {(errors.length > 0 || externalError) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
            {externalError && (
              <p className="text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {externalError}
              </p>
            )}
            {errors.length > 0 && (
              <ul className="list-disc list-inside text-sm text-destructive space-y-0.5">
                {errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------- Hint ---------- */}
        <p className="text-xs text-center text-muted-foreground">
          Revise os dados e clique em <strong>Finalizar Pedido</strong> no resumo ao lado.
        </p>
      </CardContent>
    </Card>
  );
});
