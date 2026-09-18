import React, { createContext, useContext, useState } from 'react';

const LanguageContext = createContext();

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇬' },
  { code: 'lg', name: 'Luganda', flag: '🇺🇬' },
  { code: 'sw', name: 'Kiswahili', flag: '🇹🇿' },
  { code: 'fr', name: 'Français', flag: '🇷🇼' }
];

const TRANSLATIONS = {
  en: {
    brandName: 'UgaMarket',
    brandTagline: 'home to home',
    home: 'Home',
    catalog: 'Food Catalog',
    categories: 'Categories',
    cart: 'Cart',
    login: 'Login',
    signup: 'Create Account',
    logout: 'Logout',
    account: 'My Account',
    orders: 'Orders',
    addresses: 'Addresses',
    notifications: 'Notifications',
    searchPlaceholder: 'Search fresh matooke, beans, maize flour...',
    allCategories: 'All Categories',
    inStockOnly: 'In Stock Only',
    minPrice: 'Min Price (UGX)',
    maxPrice: 'Max Price (UGX)',
    filter: 'Filter',
    reset: 'Reset',
    addToCart: 'Add to Cart',
    outOfStock: 'Out of Stock',
    inStock: 'In Stock',
    unit: 'Unit',
    checkout: 'Proceed to Checkout',
    emptyCart: 'Your cart is empty',
    emptyCartDesc: 'Explore fresh Ugandan food products directly from farms to your doorstep.',
    startShopping: 'Start Shopping',
    subtotal: 'Subtotal',
    fulfillmentMethod: 'Fulfillment Method',
    homeDelivery: 'Home Delivery',
    pickupStation: 'Pickup Station',
    deliveryFee: 'Delivery Fee',
    total: 'Total',
    placeOrder: 'Place Order',
    commitmentDeposit: 'Commitment Deposit (10%)',
    balancePayable: 'Remaining Balance (90%)',
    orderHistory: 'My Orders',
    orderTracking: 'Track Order',
    status: 'Status',
    date: 'Date',
    actions: 'Actions',
    viewDetails: 'View Details',
    payCommitment: 'Pay 10% Commitment',
    payBalance: 'Pay Remaining 90% Balance',
    cancelOrder: 'Cancel Order',
    orderCompleted: 'Order Completed',
    orderCancelled: 'Order Cancelled',
    qualityCheck: 'Quality Inspection',
    delivered: 'Delivered',
    pickedUp: 'Picked Up',
    howItWorks: 'How UgaMarket Works',
    howStep1Title: 'Order Fresh Produce',
    howStep1Desc: 'Browse verified Ugandan agricultural food staples, fruits, and vegetables.',
    howStep2Title: 'Pay 10% Commitment',
    howStep2Desc: 'Secure your harvest order with a small 10% deposit before preparation.',
    howStep3Title: 'Quality Checked & Delivered',
    howStep3Desc: 'Inspect your fresh order at home or pickup station and pay the remaining 90% upon fulfillment.'
  },
  lg: {
    brandName: 'UgaMarket',
    brandTagline: 'okuva ewaffe okutuuka ewammwe',
    home: 'Awaka',
    catalog: 'Ebyokulya Byonna',
    categories: 'Ebika by’Ebyokulya',
    cart: 'Ekiteeteeyi',
    login: 'Yingira',
    signup: 'Kola Akaunti',
    logout: 'Vaamu',
    account: 'Akaunti Yange',
    orders: 'Ebiwandiike Byange',
    addresses: 'Endagiriro',
    notifications: 'Obubaka',
    searchPlaceholder: 'Noonya matooke, ebijanjaalo, akawunga...',
    allCategories: 'Ebika Byonna',
    inStockOnly: 'Ebiriiwo Byokka',
    minPrice: 'Omuwendo Ogusembyeyo (UGX)',
    maxPrice: 'Omuwendo Oggwanidde (UGX)',
    filter: 'Sunsula',
    reset: 'Ddamu',
    addToCart: 'Yongera mu Kasawo',
    outOfStock: 'Biweddeeyo',
    inStock: 'Biriwo',
    unit: 'Kipimo',
    checkout: 'Genda Oyingize Omuwendo',
    emptyCart: 'Akasawo ko tekalina kintu',
    emptyCartDesc: 'Kwetegereze emmere nsiike okuva mu ffaamu okutuuka mu makubo go.',
    startShopping: 'Tandika Okugula',
    subtotal: 'Omugatte Omusozi',
    fulfillmentMethod: 'Enkuuma Y’Okukutuusaako',
    homeDelivery: 'Kutuusa Waka',
    pickupStation: 'Sitensheni Y’Okunonako',
    deliveryFee: 'Ebisale By’Okutuusa',
    total: 'Omugatte Gwonna',
    placeOrder: 'Mala Okulagira',
    commitmentDeposit: 'Ekitundu Ekisooka (10%)',
    balancePayable: 'Ebisigalidde (90%)',
    orderHistory: 'Ebiwandiike Byange',
    orderTracking: 'Goberera Ebyokulya Byo',
    status: 'Embeera',
    date: 'Olunaku',
    actions: 'Ebikolwa',
    viewDetails: 'Kebera Byonna',
    payCommitment: 'Sasula Ekitundu 10%',
    payBalance: 'Sasula Ebisigalidde 90%',
    cancelOrder: 'Sazaamu Olagiro',
    orderCompleted: 'Olagiro Liwedde Bulungi',
    orderCancelled: 'Olagiro Lisaziddwamu',
    qualityCheck: 'Okukebera Omutindo',
    delivered: 'Kituuse',
    pickedUp: 'Kinoneddwa',
    howItWorks: 'Enkola ya UgaMarket',
    howStep1Title: 'Londa Ebyokulya Ebibisi',
    howStep1Desc: 'Londa ku matooke, emmere ey’omutindo okuva ku bannansi.',
    howStep2Title: 'Sasula Ekikumu 10%',
    howStep2Desc: 'Teekawo 10% okulaga obuvunaanyizibwa nga tetunnabikunganya.',
    howStep3Title: 'Bikebere Olyoke Osasule 90%',
    howStep3Desc: 'Bwobimanya nti biri ku mutindo, sasula 90% ebisigadde.'
  },
  sw: {
    brandName: 'UgaMarket',
    brandTagline: 'nyumba hadi nyumba',
    home: 'Mwanzo',
    catalog: 'Bidhaa za Chakula',
    categories: 'Vitengo',
    cart: 'Kikapu',
    login: 'Ingia',
    signup: 'Fungua Akaunti',
    logout: 'Toka',
    account: 'Akaunti Yangu',
    orders: 'Maagizo Yangu',
    addresses: 'Anwani',
    notifications: 'Taarifa',
    searchPlaceholder: 'Tafuta matoke, maharage, unga wa sembe...',
    allCategories: 'Vitengo Vyote',
    inStockOnly: 'Zilizopo Tu',
    minPrice: 'Bei ya Chini (UGX)',
    maxPrice: 'Bei ya Juu (UGX)',
    filter: 'Chuja',
    reset: 'Weka Upya',
    addToCart: 'Weka Kikapuni',
    outOfStock: 'Imeisha',
    inStock: 'Ipo',
    unit: 'Kipimo',
    checkout: 'Endelea Kulipa',
    emptyCart: 'Kikapu chako kiko tupu',
    emptyCartDesc: 'Gundua bidhaa safi za shambani hadi mlangoni pako.',
    startShopping: 'Anza Kununua',
    subtotal: 'Jumla Ndogo',
    fulfillmentMethod: 'Njia ya Kupokea',
    homeDelivery: 'Kufikishiwa Nyumbani',
    pickupStation: 'Kituo cha Kuchukulia',
    deliveryFee: 'Ada ya Uwasilishaji',
    total: 'Jumla Kuu',
    placeOrder: 'Kamilisha Agizo',
    commitmentDeposit: 'Amana ya Awali (10%)',
    balancePayable: 'Salio Lililobaki (90%)',
    orderHistory: 'Historia ya Maagizo',
    orderTracking: 'Fuatilia Agizo',
    status: 'Hali',
    date: 'Tarehe',
    actions: 'Vitendo',
    viewDetails: 'Tazama Zaidi',
    payCommitment: 'Lipa Amana ya 10%',
    payBalance: 'Lipa Salio la 90%',
    cancelOrder: 'Ghairi Agizo',
    orderCompleted: 'Agizo Limekamilika',
    orderCancelled: 'Agizo Limeghairiwa',
    qualityCheck: 'Ukaguzi wa Ubora',
    delivered: 'Imewasilishwa',
    pickedUp: 'Imechukuliwa',
    howItWorks: 'Jinsi UgaMarket Inavyofanya Kazi',
    howStep1Title: 'Agiza Mazao Safi',
    howStep1Desc: 'Vinjari bidhaa safi za kilimo kutoka mashambani mwa Uganda.',
    howStep2Title: 'Lipa Amana ya 10%',
    howStep2Desc: 'Thibitisha agizo lako kwa kulipa amana ndogo ya 10% kabla ya kutayarishwa.',
    howStep3Title: 'Ukaguzi & Lipa 90%',
    howStep3Desc: 'Kagua bidhaa zako nyumbani au kituoni na ukamilishe salio la 90% baada ya kuridhika.'
  },
  fr: {
    brandName: 'UgaMarket',
    brandTagline: 'de maison à maison',
    home: 'Accueil',
    catalog: 'Catalogue Alimentaire',
    categories: 'Catégories',
    cart: 'Panier',
    login: 'Connexion',
    signup: 'Créer un Compte',
    logout: 'Déconnexion',
    account: 'Mon Compte',
    orders: 'Mes Commandes',
    addresses: 'Adresses',
    notifications: 'Notifications',
    searchPlaceholder: 'Rechercher matooke, haricots, farine...',
    allCategories: 'Toutes Catégories',
    inStockOnly: 'En Stock Seulement',
    minPrice: 'Prix Min (UGX)',
    maxPrice: 'Prix Max (UGX)',
    filter: 'Filtrer',
    reset: 'Réinitialiser',
    addToCart: 'Ajouter au Panier',
    outOfStock: 'Rupture de Stock',
    inStock: 'En Stock',
    unit: 'Unité',
    checkout: 'Passer à la Caisse',
    emptyCart: 'Votre panier est vide',
    emptyCartDesc: 'Découvrez des produits agricoles frais ougandais directement des fermes.',
    startShopping: 'Commencer vos Achats',
    subtotal: 'Sous-total',
    fulfillmentMethod: 'Mode de Livraison',
    homeDelivery: 'Livraison à Domicile',
    pickupStation: 'Point de Retrait',
    deliveryFee: 'Frais de Livraison',
    total: 'Total',
    placeOrder: 'Confirmer la Commande',
    commitmentDeposit: 'Acompte d\'Engagement (10%)',
    balancePayable: 'Solde Restant (90%)',
    orderHistory: 'Historique des Commandes',
    orderTracking: 'Suivi de Commande',
    status: 'Statut',
    date: 'Date',
    actions: 'Actions',
    viewDetails: 'Voir Détails',
    payCommitment: 'Payer 10% d\'Engagement',
    payBalance: 'Payer le Solde de 90%',
    cancelOrder: 'Annuler la Commande',
    orderCompleted: 'Commande Complétée',
    orderCancelled: 'Commande Annulée',
    qualityCheck: 'Contrôle de Qualité',
    delivered: 'Livré',
    pickedUp: 'Récupéré',
    howItWorks: 'Comment Fonctionne UgaMarket',
    howStep1Title: 'Commandez des Produits Frais',
    howStep1Desc: 'Sélectionnez des vivres agricoles directement des producteurs locaux.',
    howStep2Title: 'Payez 10% d\'Engagement',
    howStep2Desc: 'Sécurisez votre récolte avec un acompte initial de 10%.',
    howStep3Title: 'Contrôle Qualité & Solde 90%',
    howStep3Desc: 'Vérifiez la fraîcheur à la livraison et payez les 90% restants.'
  }
};

export const LanguageProvider = ({ children }) => {
  const [currentLang, setCurrentLang] = useState(() => {
    return localStorage.getItem('ugamarket_lang') || 'en';
  });

  const changeLanguage = (code) => {
    if (TRANSLATIONS[code]) {
      setCurrentLang(code);
      localStorage.setItem('ugamarket_lang', code);
    }
  };

  const t = (key) => {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
  };

  const getLocalizedField = (item, fieldName) => {
    if (!item) return '';
    if (currentLang !== 'en') {
      const localized = item[`${fieldName}_${currentLang}`];
      if (localized && typeof localized === 'string' && localized.trim()) {
        return localized;
      }
    }
    return item[fieldName] || '';
  };

  return (
    <LanguageContext.Provider
      value={{
        currentLang,
        changeLanguage,
        t,
        getLocalizedField,
        supportedLanguages: SUPPORTED_LANGUAGES
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
