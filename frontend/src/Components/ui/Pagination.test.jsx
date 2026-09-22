import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination, { pageWindow } from './Pagination';
import { LanguageProvider } from '../../Context/LanguageContext';

describe('pageWindow', () => {
  test('shows every page when there are few', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test('collapses long ranges with gaps', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
  });
});

describe('Pagination', () => {
  const setup = (props) =>
    render(
      <LanguageProvider>
        <Pagination {...props} />
      </LanguageProvider>
    );

  test('renders nothing for a single page', () => {
    const { container } = setup({ page: 1, totalPages: 1, onChange: () => {} });
    expect(container).toBeEmptyDOMElement();
  });

  test('marks the current page and navigates', () => {
    const onChange = jest.fn();
    setup({ page: 2, totalPages: 5, onChange });
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test('disables previous on the first page', () => {
    setup({ page: 1, totalPages: 3, onChange: () => {} });
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });
});
