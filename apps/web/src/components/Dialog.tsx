import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Ventana modal basada en <dialog> nativo (foco atrapado y tecla Esc incluidos).
 * Se abre al montarse: el padre la muestra u oculta renderizándola o no.
 * `onRequestClose` decide si se cierra (por ejemplo, para confirmar cambios sin guardar).
 */
export function Dialog(props: {
  title: string;
  onRequestClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onRequestClose();
      }}
      className={`m-auto w-full rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40 ${props.className ?? 'max-w-2xl'}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {props.title}
        </h2>
        <button
          type="button"
          onClick={props.onRequestClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{props.children}</div>
      {props.footer && (
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{props.footer}</div>
      )}
    </dialog>
  );
}
