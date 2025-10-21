import { Facebook, Instagram, Mail, Phone, MapPin } from "lucide-react";
import japaLogo from "@/assets/japa-logo.png";

const Footer = () => {
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
              <a href="#" className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary flex items-center justify-center transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary flex items-center justify-center transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">Categorias</h3>
            <ul className="space-y-2 text-secondary-foreground/80">
              <li><a href="#" className="hover:text-primary transition-colors">Iscas</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Anzóis</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Varas</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Linhas</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Acessórios</a></li>
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
                <span>(11) 9999-9999</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="w-5 h-5 mt-1 text-primary" />
                <span>contato@japapesca.com.br</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-5 h-5 mt-1 text-primary" />
                <span>São Paulo - SP</span>
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
