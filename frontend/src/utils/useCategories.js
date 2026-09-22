import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useLanguage } from '../Context/LanguageContext';

/**
 * Categories change rarely and several parts of the page need them
 * (header menu, home hero, catalog filters, footer). Cache one request per
 * language for the lifetime of the page instead of refetching each time.
 */
const cache = new Map(); // lang -> Promise<Category[]>

function fetchCategories(lang) {
  if (!cache.has(lang)) {
    const promise = apiClient
      .get(`/categories?lang=${lang}`)
      .then((res) => (Array.isArray(res?.data) ? res.data : []))
      .catch(() => {
        cache.delete(lang); // allow a retry on the next mount
        return [];
      });
    cache.set(lang, promise);
  }
  return cache.get(lang);
}

export default function useCategories() {
  const { currentLang } = useLanguage();
  const [state, setState] = useState({ lang: null, categories: [] });

  useEffect(() => {
    let active = true;
    fetchCategories(currentLang).then((categories) => {
      if (active) setState({ lang: currentLang, categories });
    });
    return () => {
      active = false;
    };
  }, [currentLang]);

  return {
    categories: state.categories,
    loading: state.lang !== currentLang
  };
}
