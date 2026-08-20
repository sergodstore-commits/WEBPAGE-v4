import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as identityApi from '../identity/api.js';
import * as supabaseBrowser from '../identity/supabase-browser.js';
import { App } from './App.js';

describe('IdentityAccess email callback presentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a confirmed implicit session to the API before clearing it', async () => {
    window.history.replaceState({}, '', '/auth/callback/confirm');
    const read = vi
      .spyOn(supabaseBrowser, 'readEmailCallbackAccessToken')
      .mockResolvedValue('callback-access');
    const complete = vi
      .spyOn(identityApi, 'completeEmailCallback')
      .mockResolvedValue('REGISTRATION_CONFIRMED');
    const clear = vi
      .spyOn(supabaseBrowser, 'clearEmailCallbackSession')
      .mockResolvedValue(undefined);

    render(<App />);

    expect(await screen.findByText('Correo confirmado. Ya puedes iniciar sesión.')).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith('callback-access');
    expect(clear).toHaveBeenCalledTimes(1);
    const completeOrder = complete.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const clearOrder = clear.mock.invocationCallOrder[0] ?? 0;
    expect(completeOrder).toBeLessThan(clearOrder);
  });

  it('shows the callback error and does not call the backend without valid credentials', async () => {
    window.history.replaceState({}, '', '/auth/callback/confirm');
    vi.spyOn(supabaseBrowser, 'readEmailCallbackAccessToken').mockRejectedValue(
      new Error('El enlace de correo expiró. Solicita uno nuevo.'),
    );
    const complete = vi.spyOn(identityApi, 'completeEmailCallback');
    vi.spyOn(supabaseBrowser, 'clearEmailCallbackSession').mockResolvedValue(undefined);

    render(<App />);

    expect(
      await screen.findByText('El enlace de correo expiró. Solicita uno nuevo.'),
    ).toBeVisible();
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps the shared callback reader working for a confirmed email change', async () => {
    window.history.replaceState({}, '', '/auth/callback/email-change');
    vi.spyOn(supabaseBrowser, 'readEmailCallbackAccessToken').mockResolvedValue(
      'email-change-access',
    );
    const complete = vi
      .spyOn(identityApi, 'completeEmailCallback')
      .mockResolvedValue('EMAIL_CHANGE_CONFIRMED');
    const clear = vi
      .spyOn(supabaseBrowser, 'clearEmailCallbackSession')
      .mockResolvedValue(undefined);

    render(<App />);

    expect(
      await screen.findByText('Cambio de correo confirmado. Inicia sesión nuevamente.'),
    ).toBeVisible();
    expect(complete).toHaveBeenCalledWith('email-change-access');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('retains the recovery token until password replacement succeeds and then clears it', async () => {
    window.history.replaceState({}, '', '/auth/callback/recovery');
    vi.spyOn(supabaseBrowser, 'readEmailCallbackAccessToken').mockResolvedValue('recovery-access');
    const complete = vi.spyOn(identityApi, 'completeRecovery').mockResolvedValue(undefined);
    const clear = vi
      .spyOn(supabaseBrowser, 'clearEmailCallbackSession')
      .mockResolvedValue(undefined);

    render(<App />);
    expect(await screen.findByText('Define una contraseña nueva.')).toBeVisible();
    expect(clear).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith('recovery-access', {
        newPassword: 'new-password',
        newPasswordConfirmation: 'new-password',
      }),
    );
    expect(
      await screen.findByText('Contraseña actualizada. Inicia sesión nuevamente.'),
    ).toBeVisible();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
