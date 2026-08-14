import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Evita a "tela branca": qualquer erro de render mostra uma mensagem amigável
 * com opção de recarregar (importante em celulares antigos).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">
            Algo deu errado ao carregar a página
          </h1>
          <p className="text-sm text-muted-foreground">
            Tente recarregar. Se o problema continuar, atualize o navegador do seu
            aparelho para a versão mais recente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
