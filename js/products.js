// 楊竹科技 — 產品資料庫與定價邏輯

const PRODUCTS = {
  thermos: {
    id: 'thermos',
    name: '客製化隨行杯',
    nameEn: 'Custom Thermos',
    icon: '🍵',
    image: 'assets/photos/thermos.png',
    badge: '台灣製造',
    badgeColor: '#B87333',
    description: '304不鏽鋼真空保溫，雷射雕刻客製文字，送禮自用首選',
    size: { w: 850, h: 465, unit: '' },  // canvas 比例 = 印刷尺寸 85×46.5mm
    displaySize: '印刷範圍 85 × 46.5 mm',
    // 印刷區 = 整個 canvas（邊緣留 2% 間距）
    labelArea: { xRatio: 0.02, yRatio: 0.02, wRatio: 0.96, hRatio: 0.96 },
    // 文字放置位置（相對 canvas 高度）
    textLayout: {
      title:    { yRatio: 0.38, sizeRatio: 0.13 },
      subtitle: { yRatio: 0.65, sizeRatio: 0.09 }
    },
    materialLabel: '顏色',
    materials: [
      { id: 'mint_green',  name: '薄荷奶綠', priceBase: 480, image: 'assets/thermos/mint_green.png' },
      { id: 'cherry_pink', name: '櫻花淺粉', priceBase: 480, image: 'assets/thermos/cherry_pink.png' },
      { id: 'oat_tea',     name: '燕麥奶茶', priceBase: 480, image: 'assets/thermos/oat_tea.png' },
      { id: 'milk_purple', name: '夢幻奶紫', priceBase: 480, image: 'assets/thermos/milk_purple.png' }
    ],
    finishes: [
      { id: 'uv_print', name: 'UV彩色噴印', price: 0 }
    ],
    qtyBreaks: [
      { min: 1,   max: 49,   price: 0 },
      { min: 50,  max: 99,   price: -30 },
      { min: 100, max: 299,  price: -60 },
      { min: 300, max: 9999, price: -100 }
    ],
    minQty: 1,
    leadDays: 20,
    color: '#B87333',
    textOnly: true
  },

  mug: {
    id: 'mug',
    name: '質感原木金屬馬克杯',
    nameEn: 'Wood Metal Mug',
    icon: '☕',
    image: 'assets/photos/mug.png',
    badge: '質感禮品',
    badgeColor: '#8B6F47',
    description: '雙層真空不鏽鋼製造，UV彩色噴印客製文字',
    size: { w: 600, h: 600, unit: '' },
    displaySize: '印刷範圍 待確認',
    labelArea: { xRatio: 0.18, yRatio: 0.20, wRatio: 0.55, hRatio: 0.55 },
    textLayout: {
      title:    { yRatio: 0.42, sizeRatio: 0.11 },
      subtitle: { yRatio: 0.62, sizeRatio: 0.08 }
    },
    materialLabel: '顏色',
    materials: [
      { id: 'charcoal_mist',  name: '灰夜奶霧', priceBase: 580, image: 'assets/mug/charcoal_mist.png' },
      { id: 'roasted_latte',  name: '焙茶拿鐵', priceBase: 580, image: 'assets/mug/roasted_latte.png' },
      { id: 'cloud_milk',     name: '雲朵牛奶', priceBase: 580, image: 'assets/mug/cloud_milk.png' },
      { id: 'mint_green',     name: '薄荷奶綠', priceBase: 580, image: 'assets/mug/mint_green.png' }
    ],
    finishes: [
      { id: 'uv_print', name: 'UV彩色噴印', price: 0 }
    ],
    qtyBreaks: [
      { min: 1,   max: 49,   price: 0 },
      { min: 50,  max: 99,   price: -30 },
      { min: 100, max: 299,  price: -60 },
      { min: 300, max: 9999, price: -100 }
    ],
    minQty: 1,
    leadDays: 20,
    color: '#8B6F47',
    textOnly: true
  },

  acrylic_charm: {
    id: 'acrylic_charm',
    name: '壓克力吊飾',
    nameEn: 'Acrylic Charm',
    icon: '✨',
    image: 'assets/photos/acrylic_charm.png',
    badge: '測試中',
    badgeColor: '#888888',
    description: '客製化壓克力吊飾，UV彩色噴印，造型多樣',
    password: '79969123',
    size: { w: 600, h: 600, unit: '' },
    displaySize: '印刷範圍 待確認',
    labelArea: { xRatio: 0.05, yRatio: 0.05, wRatio: 0.90, hRatio: 0.90 },
    textLayout: {
      title:    { yRatio: 0.42, sizeRatio: 0.11 },
      subtitle: { yRatio: 0.62, sizeRatio: 0.08 }
    },
    materialLabel: '規格',
    materials: [
      { id: 'standard', name: '標準款', priceBase: 150, image: 'assets/photos/acrylic_charm.png' }
    ],
    finishes: [
      { id: 'uv_print', name: 'UV彩色噴印', price: 0 }
    ],
    qtyBreaks: [
      { min: 1,   max: 49,   price: 0 },
      { min: 50,  max: 99,   price: -10 },
      { min: 100, max: 9999, price: -20 }
    ],
    minQty: 100,
    leadDays: 14,
    color: '#888888',
    textOnly: true
  }
};

// 報價計算函式
function calcQuote(productId, materialId, finishId, qty, capacityId = null) {
  const p = PRODUCTS[productId];
  if (!p) return null;

  const material = p.materials.find(m => m.id === materialId) || p.materials[0];
  const finish   = p.finishes.find(f => f.id === finishId)     || p.finishes[0];
  const capacity = p.capacities ? (p.capacities.find(c => c.id === capacityId) || p.capacities[0]) : null;

  let unitPrice = material.priceBase + finish.price + (capacity ? capacity.price : 0);

  // 數量折扣
  const qb = p.qtyBreaks.slice().reverse().find(b => qty >= b.min);
  if (qb) unitPrice += qb.price;

  const subtotal = unitPrice * qty;
  const setupFee = 800; // 製版費
  const total = subtotal + setupFee;

  return {
    unitPrice: Math.max(unitPrice, 1),
    subtotal,
    setupFee,
    total,
    leadDays: p.leadDays,
    qty
  };
}
