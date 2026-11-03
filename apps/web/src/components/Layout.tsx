import {
  FileSpreadsheet,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Printer,
  Tag,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard },
  { to: '/productos', label: 'Catálogo', icon: Package },
  { to: '/importar', label: 'Importación', icon: FileSpreadsheet },
  { to: '/etiquetas', label: 'Etiquetas', icon: Printer },
  { to: '/historial', label: 'Historial', icon: History },
];

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Tag className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Etiquetas</p>
            <p className="text-xs text-slate-500">de góndola</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8">
        {/* Al cambiar de sección se reinicia: un error en una pantalla no bloquea las demás. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
