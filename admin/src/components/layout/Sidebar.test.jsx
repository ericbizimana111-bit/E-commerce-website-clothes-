import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

const logout = vi.fn();

vi.mock('../../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => ({
      role: 'SUPER_ADMIN',
      admin: { fullName: 'Grace Nakato' },
      logout,
    }),
  };
});

describe('Sidebar sign out', () => {
  beforeEach(() => {
    logout.mockClear();
  });

  const setup = () =>
    render(
      <MemoryRouter>
        <Sidebar open onClose={() => {}} />
      </MemoryRouter>,
    );

  it('asks for confirmation instead of signing out immediately', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps the session when the dialog is cancelled', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs out once the dialog is confirmed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.querySelector('.btn--danger'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
