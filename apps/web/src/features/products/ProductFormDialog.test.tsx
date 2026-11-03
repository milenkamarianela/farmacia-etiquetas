import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductFormDialog } from './ProductFormDialog';

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductFormDialog product={null} categories={[{ id: 1, name: 'Analgésicos', productCount: 3 }]} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

afterEach(() => vi.unstubAllGlobals());

describe('formulario de producto', () => {
  it('muestra cómo se va a guardar el precio mientras se escribe', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Precio/), '12.450');
    expect(screen.getByText('Se guardará como $ 12.450,00')).toBeTruthy();
  });

  it('valida antes de enviar: nombre, código y precio ambiguo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Código de barras/), '7791234567890');
    await userEvent.type(screen.getByLabelText(/Precio/), '12,345');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('El nombre es obligatorio')).toBeTruthy();
    expect(screen.getByText(/dígito verificador incorrecto/)).toBeTruthy();
    expect(screen.getByText(/más de 2 decimales/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía el precio en centavos y cierra al guardar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Ibuprofeno 400 mg');
    await userEvent.type(screen.getByLabelText(/Código interno/), 'IBU-400');
    await userEvent.type(screen.getByLabelText(/Precio/), '$ 12.450,50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/products');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Ibuprofeno 400 mg', sku: 'IBU-400', barcode: null, priceCents: 1_245_050 });
  });

  it('muestra en cada campo los errores que devuelve el servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Datos inválidos', fields: { priceCents: ['El precio supera el máximo'] } }), {
          status: 400,
        }),
      ),
    );
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Nombre/), 'X');
    await userEvent.type(screen.getByLabelText(/Código interno/), 'X1');
    await userEvent.type(screen.getByLabelText(/Precio/), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('El precio supera el máximo')).toBeTruthy();
  });
});
