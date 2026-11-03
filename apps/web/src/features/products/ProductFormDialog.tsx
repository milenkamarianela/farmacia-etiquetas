import {
  type CategoryDto,
  type ProductData,
  type ProductDto,
  centsToInputValue,
  formatARS,
  parsePriceToCents,
  productInputSchema,
} from '@etiquetas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button, ErrorMessage, Field, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { productKeys, productsApi } from './api';
import { PriceHistory } from './PriceHistory';

interface FormState {
  barcode: string;
  sku: string;
  name: string;
  brand: string;
  presentation: string;
  category: string;
  price: string;
  active: boolean;
}

type FormField = keyof FormState;

function initialState(product: ProductDto | null): FormState {
  return {
    barcode: product?.barcode ?? '',
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    presentation: product?.presentation ?? '',
    category: product?.category ?? '',
    price: product ? centsToInputValue(product.priceCents) : '',
    active: product?.active ?? true,
  };
}

/** Los errores del servidor vienen con el nombre del campo de la API; el formulario usa "price". */
function toFormField(apiField: string): FormField {
  return (apiField === 'priceCents' ? 'price' : apiField) as FormField;
}

export function ProductFormDialog(props: {
  product: ProductDto | null;
  categories: CategoryDto[];
  onClose: () => void;
}) {
  const { product } = props;
  const queryClient = useQueryClient();
  const [initial] = useState(() => initialState(product));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});

  const mutation = useMutation({
    mutationFn: (data: ProductData) => (product ? productsApi.update(product.id, data) : productsApi.create(data)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      props.onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(
          Object.fromEntries(Object.entries(error.fields).map(([field, messages]) => [toFormField(field), messages[0]])),
        );
      }
    },
  });

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  const parsedPrice = parsePriceToCents(form.price);

  function update<K extends FormField>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function requestClose() {
    if (mutation.isPending) return;
    if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    props.onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Partial<Record<FormField, string>> = {};
    if (!parsedPrice.ok) nextErrors.price = parsedPrice.error;

    const result = productInputSchema.safeParse({
      barcode: form.barcode,
      sku: form.sku,
      name: form.name,
      brand: form.brand,
      presentation: form.presentation,
      category: form.category,
      priceCents: parsedPrice.ok ? parsedPrice.cents : 0,
      active: form.active,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = toFormField(String(issue.path[0] ?? ''));
        nextErrors[field] ??= issue.message;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !result.success) return;
    mutation.mutate(result.data);
  }

  const generalError = mutation.error && !(mutation.error instanceof ApiError && mutation.error.fields);

  return (
    <Dialog
      title={product ? 'Editar producto' : 'Nuevo producto'}
      onRequestClose={requestClose}
      footer={
        <>
          <Button variant="secondary" onClick={requestClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {generalError && (
          <div className="sm:col-span-2">
            <ErrorMessage error={mutation.error} />
          </div>
        )}

        <Field label="Nombre" htmlFor="name" required error={errors.name} className="sm:col-span-2">
          <input
            id="name"
            className={inputClass}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={!!errors.name}
            autoFocus
            maxLength={200}
          />
        </Field>

        <Field label="Marca / laboratorio" htmlFor="brand" error={errors.brand}>
          <input id="brand" className={inputClass} value={form.brand} onChange={(e) => update('brand', e.target.value)} maxLength={100} />
        </Field>

        <Field label="Presentación" htmlFor="presentation" error={errors.presentation} hint="Ej: x 20 comprimidos">
          <input
            id="presentation"
            className={inputClass}
            value={form.presentation}
            onChange={(e) => update('presentation', e.target.value)}
            maxLength={100}
          />
        </Field>

        <Field
          label="Código de barras"
          htmlFor="barcode"
          error={errors.barcode}
          hint="EAN-13 u otro GTIN. Se verifica el último dígito."
        >
          <input
            id="barcode"
            className={`${inputClass} font-mono`}
            value={form.barcode}
            onChange={(e) => update('barcode', e.target.value)}
            aria-invalid={!!errors.barcode}
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>

        <Field label="Código interno" htmlFor="sku" error={errors.sku} hint="Obligatorio si no tiene código de barras.">
          <input
            id="sku"
            className={`${inputClass} font-mono`}
            value={form.sku}
            onChange={(e) => update('sku', e.target.value)}
            aria-invalid={!!errors.sku}
            maxLength={50}
            autoComplete="off"
          />
        </Field>

        <Field label="Categoría" htmlFor="category" error={errors.category} hint="Elegí una existente o escribí una nueva.">
          <input
            id="category"
            className={inputClass}
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
            list="category-options"
            maxLength={100}
            autoComplete="off"
          />
          <datalist id="category-options">
            {props.categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Precio"
          htmlFor="price"
          required
          error={errors.price}
          hint={parsedPrice.ok ? `Se guardará como ${formatARS(parsedPrice.cents)}` : 'Ej: 12.450,00'}
        >
          <input
            id="price"
            className={`${inputClass} tabular-nums`}
            value={form.price}
            onChange={(e) => update('price', e.target.value)}
            aria-invalid={!!errors.price}
            inputMode="decimal"
            autoComplete="off"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => update('active', e.target.checked)}
            className="size-4 accent-emerald-600"
          />
          Producto activo
          <span className="text-slate-500">(los inactivos no aparecen en el catálogo ni se imprimen)</span>
        </label>
      </form>

      {product && (
        <section className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Historial de precios</h3>
          <PriceHistory productId={product.id} />
        </section>
      )}
    </Dialog>
  );
}
