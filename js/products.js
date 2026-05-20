// 楊竹科技 — 產品資料庫與定價邏輯

const PRODUCTS = {
  thermos: {
    id: 'thermos',
    name: '客製化保溫杯',
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
