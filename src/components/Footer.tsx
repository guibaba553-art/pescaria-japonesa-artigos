import { Instagram, Mail, Phone, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import japaLogo from "@/assets/japa-logo.png";

const Footer = () => {
  const navigate = useNavigate();

  return (
    <footer className="bg-secondary text-secondary-foreground pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <img 
              src={japaLogo} 
              alt="JAPA" 
              className="w-32 h-32 object-contain mb-4"
            />
            <p className="text-secondary-foreground/80 mb-4">
              Sua loja completa de artigos de pesca com os melhores produtos e atendimento especializado.
            </p>
            <div className="flex gap-4">
              <a 
                href="https://www.instagram.com/japafishing_/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary flex items-center justify-center transition-colors"
                aria-label="Instagram JAPA Fishing"
              >
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">Categorias</h3>
            <ul className="space-y-2 text-secondary-foreground/80">
              <li>
                <button 
                  onClick={() => navigate('/produtos?category=Iscas')}
                  className="hover:text-primary transition-colors"
                >
                  Iscas
                </button>
              </li>
              <li>
                <button 
                  onClick={() => navigate('/produtos?category=Anzóis')}
                  className="hover:text-primary transition-colors"
                >
                  Anzóis
                </button>
              </li>
              <li>
                <button 
                  onClick={() => navigate('/produtos?category=Varas')}
                  className="hover:text-primary transition-colors"
                >
                  Varas
                </button>
              </li>
              <li>
                <button 
                  onClick={() => navigate('/produtos?category=Linhas')}
                  className="hover:text-primary transition-colors"
                >
                  Linhas
                </button>
              </li>
              <li>
                <button 
                  onClick={() => navigate('/produtos?category=Acessórios')}
                  className="hover:text-primary transition-colors"
                >
                  Acessórios
                </button>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">Atendimento</h3>
            <ul className="space-y-2 text-secondary-foreground/80">
              <li><a href="#" className="hover:text-primary transition-colors">Sobre Nós</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Política de Troca</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Envio e Entrega</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Formas de Pagamento</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">FAQ</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">Contato</h3>
            <ul className="space-y-3 text-secondary-foreground/80">
              <li className="flex items-start gap-2">
                <Phone className="w-5 h-5 mt-1 text-primary" />
                <a 
                  href="https://wa.me/5566996579671" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  (66) 99657-9671
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="w-5 h-5 mt-1 text-primary" />
                <a 
                  href="mailto:contato@japapesca.com.br"
                  className="hover:text-primary transition-colors"
                >
                  contato@japapesca.com.br
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-5 h-5 mt-1 text-primary" />
                <a 
                  href="https://share.google/gPlcDOAHvaHZKYSmI" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  Sinop - MT
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-secondary-foreground/20 pt-8 text-center text-secondary-foreground/60">
          <p>&copy; 2025 JAPA - Pesca e Conveniência. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
