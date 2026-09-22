import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SearchInput from './SearchInput';

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const type = (text) => {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search things' }), { target: { value: text } });
  };
  const setup = (props = {}) => {
    const onSearch = vi.fn();
    const utils = render(<SearchInput label="Search things" onSearch={onSearch} {...props} />);
    return { onSearch, ...utils };
  };

  it('searches automatically once typing pauses, with a single call', () => {
    const { onSearch } = setup();
    type('m');
    type('ma');
    type('mat');
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('mat');
  });

  it('trims the term and skips searching when nothing changed', () => {
    const { onSearch } = setup({ value: 'beans' });
    type('  beans ');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('searches immediately on Enter', () => {
    const { onSearch } = setup();
    type('rice');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('rice');
  });

  it('clear button empties the box and searches for nothing straight away', () => {
    const { onSearch } = setup({ value: 'rice' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('follows the committed value when it is reset from outside', () => {
    const { rerender } = setup({ value: 'rice' });
    expect(screen.getByRole('searchbox')).toHaveValue('rice');
    rerender(<SearchInput label="Search things" value="" onSearch={() => {}} />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});
