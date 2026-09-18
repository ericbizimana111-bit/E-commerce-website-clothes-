import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LanguageProvider, useLanguage } from './LanguageContext';

const TestConsumer = () => {
  const { currentLang, changeLanguage, t, getLocalizedField } = useLanguage();

  return (
    <div>
      <span data-testid="current-lang">{currentLang}</span>
      <span data-testid="brand-name">{t('brandName')}</span>
      <span data-testid="tagline">{t('brandTagline')}</span>
      <button data-testid="btn-lg" onClick={() => changeLanguage('lg')}>
        To Luganda
      </button>
      <span data-testid="localized-item">
        {getLocalizedField({ name: 'Beans', name_lg: 'Ebijanjaalo' }, 'name')}
      </span>
    </div>
  );
};

describe('LanguageContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('defaults to English and returns English brand and tagline', () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(screen.getByTestId('current-lang').textContent).toBe('en');
    expect(screen.getByTestId('brand-name').textContent).toBe('UgaMarket');
    expect(screen.getByTestId('tagline').textContent).toBe('home to home');
    expect(screen.getByTestId('localized-item').textContent).toBe('Beans');
  });

  test('switches to Luganda and localizes items', () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    act(() => {
      screen.getByTestId('btn-lg').click();
    });

    expect(screen.getByTestId('current-lang').textContent).toBe('lg');
    expect(screen.getByTestId('localized-item').textContent).toBe('Ebijanjaalo');
    expect(localStorage.getItem('ugamarket_lang')).toBe('lg');
  });
});
