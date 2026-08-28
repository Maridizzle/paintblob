// Pure data: the wardrobe catalogue. `style` selects which shape variant
// avatar.js draws for that slot (see styleOf() there); `price` is spent in
// points via the store, or `source: 'achievement'` for one tied to an
// ACHIEVEMENTS entry's `outfit` field instead. A starter item (price 0,
// source 'starter') is unlocked from the very first save.
//
// `line` is an optional collection tag (street/formal/cozy/sport) shown in the
// shop and nothing else — no logic branches on it, so an item may omit it. The
// four newest slots (outerwear/headwear/eyewear/neckwear) are optional layers:
// like `dress` they default to nothing worn and are removed by tapping the
// equipped item.

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

  // ---- The wardrobe drop: four lines, four new slots ----------------------
  // Every garment below carries baked-in contrast accents (own-fill panels,
  // stroke="none") so it reads as multicolour while its body stays dyeable.
  // Reskins of existing slots first, then the four new optional layers.

  // Streetwear
  { id: 'shirt-oversized', slot: 'shirt', style: 'oversized', name: 'Oversized Tee', price: 210, source: 'store', line: 'street' },
  { id: 'bottoms-cargos', slot: 'bottoms', style: 'cargos', name: 'Cargo Pants', price: 260, source: 'store', line: 'street' },
  { id: 'shoes-hightops', slot: 'shoes', style: 'hightops', name: 'High-Tops', price: 320, source: 'store', line: 'street' },
  { id: 'outerwear-denim', slot: 'outerwear', style: 'denim', name: 'Denim Jacket', price: 360, source: 'store', line: 'street' },
  { id: 'outerwear-bomber', slot: 'outerwear', style: 'bomber', name: 'Bomber Jacket', price: 380, source: 'store', line: 'street' },
  { id: 'headwear-cap', slot: 'headwear', style: 'cap', name: 'Ball Cap', price: 180, source: 'store', line: 'street' },
  { id: 'eyewear-shades', slot: 'eyewear', style: 'shades', name: 'Sunglasses', price: 160, source: 'store', line: 'street' },
  { id: 'neckwear-chain', slot: 'neckwear', style: 'chain', name: 'Chain Necklace', price: 200, source: 'store', line: 'street' },

  // Formalwear
  { id: 'shirt-blouse', slot: 'shirt', style: 'blouse', name: 'Silk Blouse', price: 320, source: 'store', line: 'formal' },
  { id: 'bottoms-slacks', slot: 'bottoms', style: 'slacks', name: 'Dress Slacks', price: 300, source: 'store', line: 'formal' },
  { id: 'shoes-oxfords', slot: 'shoes', style: 'oxfords', name: 'Oxfords', price: 340, source: 'store', line: 'formal' },
  { id: 'outerwear-blazer', slot: 'outerwear', style: 'blazer', name: 'Blazer', price: 420, source: 'store', line: 'formal' },
  { id: 'headwear-beret', slot: 'headwear', style: 'beret', name: 'Beret', price: 200, source: 'store', line: 'formal' },
  { id: 'eyewear-round', slot: 'eyewear', style: 'round', name: 'Round Glasses', price: 140, source: 'store', line: 'formal' },
  { id: 'neckwear-tie', slot: 'neckwear', style: 'tie', name: 'Necktie', price: 160, source: 'store', line: 'formal' },
  { id: 'neckwear-bowtie', slot: 'neckwear', style: 'bowtie', name: 'Bow Tie', price: 150, source: 'store', line: 'formal' },

  // Cozy / lounge
  { id: 'shirt-flannel', slot: 'shirt', style: 'flannel', name: 'Flannel Shirt', price: 280, source: 'store', line: 'cozy' },
  { id: 'bottoms-sweatpants', slot: 'bottoms', style: 'sweatpants', name: 'Sweatpants', price: 220, source: 'store', line: 'cozy' },
  { id: 'shoes-slippers', slot: 'shoes', style: 'slippers', name: 'Slippers', price: 150, source: 'store', line: 'cozy' },
  { id: 'outerwear-cardigan', slot: 'outerwear', style: 'cardigan', name: 'Chunky Cardigan', price: 320, source: 'store', line: 'cozy' },
  { id: 'outerwear-puffer', slot: 'outerwear', style: 'puffer', name: 'Puffer Coat', price: 460, source: 'store', line: 'cozy' },
  { id: 'headwear-beanie', slot: 'headwear', style: 'beanie', name: 'Beanie', price: 160, source: 'store', line: 'cozy' },
  { id: 'neckwear-scarf', slot: 'neckwear', style: 'scarf', name: 'Knit Scarf', price: 180, source: 'store', line: 'cozy' },

  // Athletic / sport
  { id: 'shirt-jersey', slot: 'shirt', style: 'jersey', name: 'Sports Jersey', price: 240, source: 'store', line: 'sport' },
  { id: 'bottoms-leggings', slot: 'bottoms', style: 'leggings', name: 'Leggings', price: 200, source: 'store', line: 'sport' },
  { id: 'shoes-runners', slot: 'shoes', style: 'runners', name: 'Runners', price: 280, source: 'store', line: 'sport' },
  { id: 'outerwear-track', slot: 'outerwear', style: 'track', name: 'Track Jacket', price: 340, source: 'store', line: 'sport' },
  { id: 'eyewear-visor', slot: 'eyewear', style: 'visor', name: 'Sport Visor', price: 120, source: 'store', line: 'sport' },

  // Unaligned extras
  { id: 'headwear-sunhat', slot: 'headwear', style: 'sunhat', name: 'Sun Hat', price: 220, source: 'store' },
  { id: 'headwear-crown', slot: 'headwear', style: 'crown', name: 'Paper Crown', price: 260, source: 'store' },
];
