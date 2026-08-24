import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  // Sin punto de montaje no hay nada que React pueda renderizar: avisamos en vez
  // de fallar en silencio con un `null` y dejar la página vacía.
  console.error('[Gandía] No se ha encontrado el elemento #root en el documento.');
} else {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
