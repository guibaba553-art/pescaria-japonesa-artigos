import { Instagram, Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import japaLogo from "@/assets/japa-logo.png";

interface FooterSettings {
  trade_name?: string;
  legal_name?: string;
  cnpj?: string;
  ie?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram_url?: string;
  logo_url?: string;
  google_maps_url?: string;
}

function formatCEP(cep: string): string {
  const digits = cep.replace(/\D/g, '');
  if (digits.length === 8) return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return cep;
}

// Valores originais hardcoded como fallback
const DEFAULTS: FooterSettings = {
  legal_name: 'JAPA PESCA E CONVENIENCIA LTDA',
  trade_name: 'G. SEITI GARCIA BABA LTDA',
  cnpj: '33.169.502/0001-08',
  ie: '13.900.915-9',
  street: 'Av. das Itaúbas',
  number: '2281',
  neighborhood: 'Jardim Paraíso',
  city: 'Sinop',
  state: 'MT',
  cep: '78556100',
  phone: '(66) 99921-1712',
  whatsapp: '5566999211712',
  email: 'robertobaba2@gmail.com',
  instagram_url: 'https://www.instagram.com/japafishing_/?hl=en',
  google_maps_url: 'https://www.google.com/maps/place/JAPA+PESCA+E+CONVENIENCIA/@-11.8707654,-55.5063804,13z',
};

const Footer = () => {
  const navigate = useNavigate();
  const [s, setSettings] = useState<FooterSettings>(DEFAULTS);

  useEffect(() => {
    supabase
      .from('company_settings' as any)
      .select('key, value')
      .then(({ data, error }: any) => {
        if (!error && data) {
          const map = { ...DEFAULTS };
          for (const row of data) {
            if (row.value) (map as any)[row.key] = row.value;
          }
          setSettings(map);
        }
      });
  }, []);

  const address = [
    s.street, s.number,
    s.neighborhood ? `— ${s.neighborhood}` : null,
    s.city && s.state ? `— ${s.city}/${s.state}` : null,
    s.cep ? `— CEP ${formatCEP(s.cep)}` : null,
  ].filter(Boolean).join(' ');

  const logoImg = s.logo_url || japaLogo;
  const brandName = s.trade_name === 'G. SEITI GARCIA BABA LTDA' ? 'JAPAS' : (s.trade_name || 'JAPAS').split(' ')[0];

  return (
    <footer className="bg-background border-t border-border">
      <div className="container mx-auto pt-20 pb-10">
        {/* Top: CTA */}
        <div className="border-b border-border pb-16 mb-16">
          <div className="grid lg:grid-cols-2 gap-10 items-end">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-balance leading-[1.05]">
              Pronto pra<br />
              <span className="text-primary">pescar de verdade?</span>
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 lg:justify-end">
              <a
                href={`https://wa.me/${s.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-foreground text-background font-medium text-sm hover:bg-foreground/90 transition-colors btn-press"
              >
                Falar no WhatsApp
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => navigate('/produtos')}
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-border bg-background font-medium text-sm hover:bg-muted transition-colors btn-press"
              >
                Ver catálogo
              </button>
            </div>
          </div>
        </div>

        {/* Middle: Links */}
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 mb-16">
          <div className="col-span-2 lg:col-span-4">
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5 mb-5">
              <img src={logoImg} alt={s.trade_name || 'JAPAS Pesca'} className="h-9 w-9 object-contain" />
              <span className="text-lg font-display font-bold tracking-tight">
                {brandName}<span className="text-primary">.</span>
              </span>
            </button>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              Loja especializada em artigos de pesca em {s.city}, {s.state}. Equipamentos
              selecionados, atendimento de quem entende, frete pra todo Brasil.
            </p>
            <div className="flex gap-2">
              {s.instagram_url && (
                <a href={s.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {s.whatsapp && (
                <a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                  className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all">
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 lg:col-start-6">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Loja</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/produtos')} className="hover:text-foreground transition-colors">Todos os produtos</button></li>
              <li><button onClick={() => navigate('/produtos?category=Iscas')} className="hover:text-foreground transition-colors">Iscas</button></li>
              <li><button onClick={() => navigate('/produtos?category=Anzóis')} className="hover:text-foreground transition-colors">Anzóis</button></li>
              <li><button onClick={() => navigate('/produtos?category=Varas')} className="hover:text-foreground transition-colors">Varas</button></li>
              <li><button onClick={() => navigate('/produtos?category=Linhas')} className="hover:text-foreground transition-colors">Linhas</button></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Conta</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/conta')} className="hover:text-foreground transition-colors">Minha conta</button></li>
              <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Entrar</button></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Institucional</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/politica-privacidade" className="hover:text-foreground transition-colors">Privacidade</Link></li>
              <li><Link to="/termos-de-uso" className="hover:text-foreground transition-colors">Termos de uso</Link></li>
              <li><Link to="/politica-de-trocas" className="hover:text-foreground transition-colors">Trocas e devoluções</Link></li>
              <li><Link to="/politica-de-frete" className="hover:text-foreground transition-colors">Política de frete</Link></li>
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Contato</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {s.phone && (
                <li>
                  <a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-2 hover:text-foreground transition-colors">
                    <Phone className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    <span>{s.phone}</span>
                  </a>
                </li>
              )}
              {s.email && (
                <li>
                  <a href={`mailto:${s.email}`} className="flex items-start gap-2 hover:text-foreground transition-colors">
                    <Mail className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    <span className="break-all">{s.email}</span>
                  </a>
                </li>
              )}
              {s.city && s.state && (
                <li>
                  {s.google_maps_url ? (
                    <a href={s.google_maps_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2 hover:text-foreground transition-colors">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                      <span>{s.city}, {s.state}</span>
                    </a>
                  ) : (
                    <span className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                      <span>{s.city}, {s.state}</span>
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border pt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">{s.legal_name}</p>
            <p>
              {[s.trade_name, s.cnpj ? `CNPJ ${s.cnpj}` : null, s.ie ? `IE ${s.ie}` : null]
                .filter(Boolean).join(' · ')}
            </p>
            <p>{address}</p>
          </div>
          <p>&copy; {new Date().getFullYear()} {brandName}. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
