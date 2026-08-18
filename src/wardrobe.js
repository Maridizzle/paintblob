// Pure data: the wardrobe catalogue. `style` selects which shape variant
// avatar.js draws for that slot (see styleOf() there); `price` is spent in
// points via the store, or `source: 'achievement'` for one tied to an
// ACHIEVEMENTS entry's `outfit` field instead. A starter item (price 0,
// source 'starter') is unlocked from the very first save.

export const WARDROBE_ITEMS = [
  { id: 'shirt-basic', slot: 'shirt', style: 'basic', name: 'Plain Shirt', price: 0, source: 'starter' },
  { id: 'bottoms-basic', slot: 'bottoms', style: 'basic', name: 'Plain Trousers', price: 0, source: 'starter' },
  { id: 'socks-basic', slot: 'socks', style: 'basic', name: 'Plain Socks', price: 0, source: 'starter' },
  { id: 'shoes-basic', slot: 'shoes', style: 'basic', name: 'Plain Shoes', price: 0, source: 'starter' },

  { id: 'shirt-vneck', slot: 'shirt', style: 'vneck', name: 'V-Neck Shirt', price: 40, source: 'store' },
  { id: 'bottoms-shorts', slot: 'bottoms', style: 'shorts', name: 'Shorts', price: 30, source: 'store' },
  { id: 'dress-basic', slot: 'dress', style: 'basic', name: 'Simple Dress', price: 60, source: 'store' },
  { id: 'socks-tall', slot: 'socks', style: 'tall', name: 'Tall Socks', price: 20, source: 'store' },

  { id: 'dress-flowy', slot: 'dress', style: 'flowy', name: 'Flowy Dress', price: 90, source: 'achievement' },
  { id: 'shoes-boots', slot: 'shoes', style: 'boots', name: 'Sturdy Boots', price: 50, source: 'achievement' },
];
