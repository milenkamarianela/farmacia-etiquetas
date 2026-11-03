import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no implementa las ventanas modales nativas: alcanza con marcarlas abiertas/cerradas.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.open = false;
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
