import { Component } from 'react';

/**
 * Evita la "pantalla en blanco": si un error escapa durante el render, React 18+
 * desmonta todo el árbol y deja el documento vacío sin ningún aviso visible.
 * Este límite de error muestra en su lugar un mensaje legible y el detalle
 * técnico, para que el fallo sea diagnosticable en lugar de invisible.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Gandía] Error no controlado durante el render:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error__card">
          <h1>La experiencia no se ha podido cargar</h1>
          <p>
            Ha ocurrido un error inesperado al iniciar la aplicación. Vuelve a cargar la
            página; si el problema continúa, comparte el detalle técnico siguiente.
          </p>
          <pre>{String(error?.stack || error?.message || error)}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
