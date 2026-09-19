import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import DataTable from './DataTable';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import { EmptyState, ErrorState } from './states';

describe('StatusBadge', () => {
  it('renders readable labels for order/delivery/payment statuses', () => {
    render(
      <>
        <StatusBadge status="COMPLETED" />
        <StatusBadge status="OUT_FOR_DELIVERY" kind="delivery" />
        <StatusBadge status="SUCCESS" kind="payment" />
      </>,
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Out for Delivery')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('never renders raw enum text or emoji', () => {
    const { container } = render(<StatusBadge status="PENDING_PAYMENT" />);
    expect(container.textContent).toBe('Pending Payment');
    expect(container.textContent).not.toMatch(/PENDING_PAYMENT/);
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'qty', header: 'Qty', render: (row) => String(row.qty) },
  ];
  const rows = [
    { id: '1', name: 'Matooke', qty: 5 },
    { id: '2', name: 'Beans', qty: 2 },
  ];

  it('renders headers and rows from real data', () => {
    render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Matooke')).toBeInTheDocument();
    expect(screen.getByText('Beans')).toBeInTheDocument();
  });

  it('renders the empty state, never fake rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        emptyState={<EmptyState title="No rows" message="Nothing here." />}
      />,
    );
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(screen.queryByText('Matooke')).not.toBeInTheDocument();
  });

  it('renders the skeleton while loading', () => {
    const { container } = render(
      <DataTable columns={columns} rows={rows} isLoading skeleton={<div data-testid="skel" />} />,
    );
    expect(screen.getByTestId('skel')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Matooke');
  });
});

describe('ConfirmDialog', () => {
  it('renders only when open and fires confirm/cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <ConfirmDialog
        open
        title="Deactivate product?"
        message="This hides it from customers."
        confirmLabel="Deactivate"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('This hides it from customers.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables actions while busy (prevents duplicate submission)', () => {
    render(
      <ConfirmDialog open message="Working" busy onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('Pagination', () => {
  it('hides itself for a single page', () => {
    const { container } = render(
      <Pagination pagination={{ page: 1, totalPages: 1, total: 5 }} onPageChange={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('navigates between pages and reports total records', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={{ page: 2, totalPages: 4, total: 80 }}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText(/Page 2 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/80 records/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

describe('state blocks', () => {
  it('ErrorState offers a retry action', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Network down" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('EmptyState renders an honest empty message', () => {
    render(<EmptyState title="No orders yet" message="Orders appear as customers check out." />);
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });
});
