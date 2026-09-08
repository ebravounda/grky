import { Component } from "react";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  reset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary" className="min-h-[60vh] grid place-items-center p-6">
          <div className="max-w-md text-center bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive mx-auto mb-4">
              <AlertTriangle size={26} />
            </span>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Algo no se pudo mostrar</h2>
            <p className="text-sm text-slate-500 mb-5">
              Ha ocurrido un error al cargar esta pantalla. Vuelve a intentarlo; si persiste, contacta con soporte.
            </p>
            <button
              data-testid="error-boundary-retry"
              onClick={this.reset}
              className="rounded-full bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:bg-primary/90 transition-colors">
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
