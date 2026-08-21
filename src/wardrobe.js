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

  // Store prices are deliberately steep — these are meant to be a genuine
  // long-term savings goal across many pictures, not a one-puzzle impulse
  // buy, so they're priced against the level curve in points.js rather than
  // against how many cells a single picture has.
  { id: 'shirt-vneck', slot: 'shirt', style: 'vneck', name: 'V-Neck Shirt', price: 250, source: 'store' },
  { id: 'shirt-tank', slot: 'shirt', style: 'tank', name: 'Tank Top', price: 220, source: 'store' },
  { id: 'shirt-hoodie', slot: 'shirt', style: 'hoodie', name: 'Hoodie', price: 350, source: 'store' },
  { id: 'bottoms-shorts', slot: 'bottoms', style: 'shorts', name: 'Shorts', price: 200, source: 'store' },
  { id: 'bottoms-capri', slot: 'bottoms', style: 'capri', name: 'Capri Pants', price: 260, source: 'store' },
  { id: 'dress-basic', slot: 'dress', style: 'basic', name: 'Simple Dress', price: 400, source: 'store' },
  { id: 'dress-mini', slot: 'dress', style: 'mini', name: 'Mini Dress', price: 380, source: 'store' },
  { id: 'socks-tall', slot: 'socks', style: 'tall', name: 'Tall Socks', price: 150, source: 'store' },
  { id: 'socks-ankle', slot: 'socks', style: 'ankle', name: 'Ankle Socks', price: 120, source: 'store' },
  { id: 'shoes-sandals', slot: 'shoes', style: 'sandals', name: 'Sandals', price: 300, source: 'store' },
  { id: 'shoes-heels', slot: 'shoes', style: 'heels', name: 'Heels', price: 450, source: 'store' },

  // New cuts — a bigger, more distinct catalogue. Coin prices sit against the
  // level curve like the rest, unchanged by the progression rebalance (coins
  // are a separate axis from levelling).
  { id: 'shirt-buttonup', slot: 'shirt', style: 'buttonup', name: 'Button-Up Shirt', price: 300, source: 'store' },
  { id: 'shirt-polo', slot: 'shirt', style: 'polo', name: 'Polo Shirt', price: 240, source: 'store' },
  { id: 'shirt-sweater', slot: 'shirt', style: 'sweater', name: 'Knit Sweater', price: 320, source: 'store' },
  { id: 'bottoms-skirt', slot: 'bottoms', style: 'skirt', name: 'A-Line Skirt', price: 260, source: 'store' },
  { id: 'bottoms-joggers', slot: 'bottoms', style: 'joggers', name: 'Joggers', price: 220, source: 'store' },
  { id: 'dress-sundress', slot: 'dress', style: 'sundress', name: 'Sundress', price: 420, source: 'store' },
  { id: 'shoes-flats', slot: 'shoes', style: 'flats', name: 'Ballet Flats', price: 200, source: 'store' },
  { id: 'shoes-maryjane', slot: 'shoes', style: 'maryjane', name: 'Mary Janes', price: 260, source: 'store' },

  // A second wave — new silhouettes, same recolour-wash treatment.
  { id: 'shirt-turtleneck', slot: 'shirt', style: 'turtleneck', name: 'Turtleneck', price: 300, source: 'store' },
  { id: 'shirt-crop', slot: 'shirt', style: 'crop', name: 'Fitted Tee', price: 210, source: 'store' },
  { id: 'dress-wrap', slot: 'dress', style: 'wrap', name: 'Wrap Dress', price: 440, source: 'store' },
  { id: 'dress-pinafore', slot: 'dress', style: 'pinafore', name: 'Pinafore', price: 380, source: 'store' },
  { id: 'socks-knee', slot: 'socks', style: 'knee', name: 'Knee Socks', price: 160, source: 'store' },
  { id: 'shoes-loafers', slot: 'shoes', style: 'loafers', name: 'Loafers', price: 280, source: 'store' },

  { id: 'dress-flowy', slot: 'dress', style: 'flowy', name: 'Flowy Dress', price: 500, source: 'achievement' },
  { id: 'shoes-boots', slot: 'shoes', style: 'boots', name: 'Sturdy Boots', price: 500, source: 'achievement' },
  { id: 'dress-gown', slot: 'dress', style: 'gown', name: 'Evening Gown', price: 1500, source: 'achievement' },
];
