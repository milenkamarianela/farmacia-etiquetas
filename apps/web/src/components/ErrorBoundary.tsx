import { AlertOctagon } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Si una pantalla falla al dibujarse, muestra un mensaje en lugar de dejar la página en blanco.
 * El resto de la aplicación (menú) sigue funcionando; se reinicia al cambiar de sección.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla:', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center">
        <AlertOctagon className="mx-auto mb-3 size-10 text-red-500" />
        <h1 className="text-lg font-semibold">Algo salió mal en esta pantalla</h1>
        <p className="mt-2 text-sm text-slate-600">
          No se perdió información guardada. Probá recargar la página; si el problema sigue, anotá qué estabas haciendo.
        </p>
        <p className="mt-3 rounded bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-500">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Recargar
        </button>
      </div>
    );
  }
}
