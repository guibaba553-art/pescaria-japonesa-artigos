import { Instagram, Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import japaLogo from "@/assets/japa-logo.png";

const Footer = () => {
  const navigate = useNavigate();

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
                href="https://wa.me/5566992111712"
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
              <img src={japaLogo} alt="JAPAS Pesca" className="h-9 w-9 object-contain" />
              <span className="text-lg font-display font-bold tracking-tight">
                JAPAS<span className="text-primary">.</span>
              </span>
            </button>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              Loja especializada em artigos de pesca em Sinop, MT. Equipamentos
              selecionados, atendimento de quem entende, frete pra todo Brasil.
            </p>
            <div className="flex gap-2">
              <a
                href="https://www.instagram.com/japafishing_/?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me/5566992111712"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-2 lg:col-start-6">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
              Loja
            </h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/produtos')} className="hover:text-foreground transition-colors">Todos os produtos</button></li>
              <li><button onClick={() => navigate('/produtos?category=Iscas')} className="hover:text-foreground transition-colors">Iscas</button></li>
              <li><button onClick={() => navigate('/produtos?category=Anzóis')} className="hover:text-foreground transition-colors">Anzóis</button></li>
              <li><button onClick={() => navigate('/produtos?category=Varas')} className="hover:text-foreground transition-colors">Varas</button></li>
              <li><button onClick={() => navigate('/produtos?category=Linhas')} className="hover:text-foreground transition-colors">Linhas</button></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
              Conta
            </h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/conta')} className="hover:text-foreground transition-colors">Minha conta</button></li>
              <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Entrar</button></li>
              <li><Link to="/meus-dados" className="hover:text-foreground transition-colors">Meus dados</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
              Institucional
            </h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/politica-privacidade" className="hover:text-foreground transition-colors">Privacidade</Link></li>
              <li><Link to="/termos-de-uso" className="hover:text-foreground transition-colors">Termos de uso</Link></li>
              <li><Link to="/politica-de-trocas" className="hover:text-foreground transition-colors">Trocas e devoluções</Link></li>
              <li><Link to="/politica-de-frete" className="hover:text-foreground transition-colors">Política de frete</Link></li>
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
              Contato
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="https://wa.me/5566992111712" target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:text-foreground transition-colors">
                  <Phone className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                  <span>(66) 99211-1712</span>
                </a>
              </li>
              <li>
                <a href="mailto:robertobaba2@gmail.com" className="flex items-start gap-2 hover:text-foreground transition-colors">
                  <Mail className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                  <span className="break-all">robertobaba2@gmail.com</span>
                </a>
              </li>
              <li>
                <a
                  href="https://www.google.com/maps/place/JAPA+PESCA+E+CONVENIENCIA/@-11.8707654,-55.5063804,13z/data=!4m6!3m5!1s0x93a77fbf26565e51:0x633b0bafc2828a26!8m2!3d-11.8646827!4d-55.5131974"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 hover:text-foreground transition-colors"
                >
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                  <span>Sinop, MT</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border pt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">JAPA PESCA E CONVENIENCIA LTDA</p>
            <p>G. SEITI GARCIA BABA LTDA · CNPJ 33.169.502/0001-08 · IE 13.900.915-9</p>
            <p>Av. das Itaúbas, 2281 — Jardim Paraíso, Sinop/MT — CEP 78556-100</p>
          </div>
          <p>&copy; {new Date().getFullYear()} JAPAS. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
