import { Link } from 'react-router';
import { PageHeader } from '../components/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <Link to="/" className="text-sm font-medium text-emerald-700 hover:underline">
        Volver al inicio
      </Link>
    </>
  );
}
