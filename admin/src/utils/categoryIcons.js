import {
  Apple,
  Baby,
  Beef,
  Bug,
  Carrot,
  CookingPot,
  CupSoda,
  Droplets,
  Dumbbell,
  Flame,
  Hammer,
  Laptop,
  LeafyGreen,
  Milk,
  Package,
  Paintbrush,
  Pencil,
  Refrigerator,
  Scissors,
  Shirt,
  Smartphone,
  Sparkles,
  SprayCan,
  Sprout,
  Tractor,
  Truck,
  Tv,
  Wheat,
  Wrench,
  Zap
} from 'lucide-react';

/**
 * Icon keys stored on categories/services (backend `icon` column) mapped to
 * Lucide icons. Unknown or missing keys fall back to a neutral package icon,
 * so the admin can add new categories without a frontend release.
 */
const ICONS = {
  apple: Apple,
  baby: Baby,
  beef: Beef,
  bug: Bug,
  carrot: Carrot,
  'cooking-pot': CookingPot,
  'cup-soda': CupSoda,
  droplets: Droplets,
  dumbbell: Dumbbell,
  flame: Flame,
  hammer: Hammer,
  laptop: Laptop,
  'leafy-green': LeafyGreen,
  milk: Milk,
  package: Package,
  paintbrush: Paintbrush,
  pencil: Pencil,
  refrigerator: Refrigerator,
  scissors: Scissors,
  shirt: Shirt,
  smartphone: Smartphone,
  sparkles: Sparkles,
  'spray-can': SprayCan,
  sprout: Sprout,
  tractor: Tractor,
  truck: Truck,
  tv: Tv,
  wheat: Wheat,
  wrench: Wrench,
  zap: Zap
};

export function iconFor(key) {
  return ICONS[key] || Package;
}

export const ICON_KEYS = Object.keys(ICONS);
