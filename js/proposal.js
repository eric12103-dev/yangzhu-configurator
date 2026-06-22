/**
 * 頌禮 — 業務快速提案模組 (proposal.js)
 * Phase 1：純瀏覽器端，不需後端 API
 *
 * 功能：
 *  1. initProposalMode()   — 在 Step 3 旁開啟提案側邊面板
 *  2. calcProposalPrice()  — 從 PRODUCTS / 提案設定計算報價（含數量階梯）
 *  3. generateProposalPDF()— jsPDF + html2canvas 生成 PDF（仿亞東彩印格式）
 *  4. downloadProposal()   — 觸發 PDF 下載
 *
 * ⚠️ 此模組只新增邏輯，不修改任何既有商品的流程
 */

'use strict';

/* ═══════════════════════════════════════════════════
   業務提案 — 報價基準（供業務修改）
   noPrice 商品的參考單價，格式：[最少數量, 單價]
   ═══════════════════════════════════════════════════ */
const PROPOSAL_PRICES = {
  // 電子票證類（noPrice 商品），數量階梯定價
  biz_card: {
    label: '卡片型電子票證',
    process: 'UV 全彩印刷 / 雷射切割 / 個人化定製',
    spec: '85.6 × 54 mm（標準信用卡尺寸）',
    unit: '張',
    tiers: [
      { min: 50,  max: 99,   price: 120 },
      { min: 100, max: 299,  price: 95  },
      { min: 300, max: 499,  price: 80  },
      { min: 500, max: 9999, price: 65  },
    ],
    note: '悠遊卡 / 一卡通 / 超級悠遊卡，最低起訂 50 張',
    leadDays: 14,
  },
  biz_leather_round: {
    label: '圓形皮革電子票證',
    process: 'UV 全彩印刷 / 皮革燙印 / 嵌入晶片',
    spec: '直徑 60 mm 圓形皮革（悠遊卡 / 一卡通）',
    unit: '個',
    tiers: [
      { min: 50,  max: 99,   price: 280 },
      { min: 100, max: 299,  price: 240 },
      { min: 300, max: 9999, price: 200 },
    ],
    note: '真皮材質，可選悠遊卡或一卡通晶片，最低起訂 50 個',
    leadDays: 21,
  },
  biz_leather_omamori: {
    label: '御守皮革電子票證',
    process: 'UV 全彩印刷 / 皮革燙印 / 嵌入晶片',
    spec: '御守形皮革（悠遊卡 / 一卡通）',
    unit: '個',
    tiers: [
      { min: 30,  max: 99,   price: 320 },
      { min: 100, max: 299,  price: 270 },
      { min: 300, max: 9999, price: 230 },
    ],
    note: '日式御守造型，可選悠遊卡或一卡通晶片，最低起訂 30 個',
    leadDays: 21,
  },
  biz_lightbox: {
    label: '圓形小燈箱',
    process: 'UV 全彩印刷 / LED 雙面發光 / 客製插圖',
    spec: '圓形雙面 LED 燈箱，直徑約 110 mm',
    unit: '組',
    tiers: [
      { min: 30,  max: 99,   price: 580 },
      { min: 100, max: 299,  price: 480 },
      { min: 300, max: 9999, price: 380 },
    ],
    note: 'USB 充電，雙面發光，最低起訂 30 組',
    leadDays: 21,
  },
  biz_thick: {
    label: '厚切電子票證',
    process: 'UV 全彩印刷 / 3D 雕刻 / 嵌入晶片',
    spec: '54 × 85.6 mm，厚度約 5-8 mm',
    unit: '張',
    tiers: [
      { min: 100, max: 299,  price: 350 },
      { min: 300, max: 499,  price: 280 },
      { min: 500, max: 9999, price: 240 },
    ],
    note: '立體厚切造型，重量感佳，最低起訂 100 張',
    leadDays: 28,
  },
  // 一般商品（products.js 已有 priceBase）
  thermos: {
    label: '客製化隨行杯',
    process: 'UV 彩色噴印 / 304不鏽鋼真空保溫',
    spec: '550ml 雙層保溫瓶，印刷範圍 85 × 46.5 mm',
    unit: '個',
    tiers: [
      { min: 1,   max: 49,   price: 480 },
      { min: 50,  max: 99,   price: 450 },
      { min: 100, max: 299,  price: 420 },
      { min: 300, max: 9999, price: 380 },
    ],
    note: '多色可選（薄荷奶綠 / 櫻花淺粉 / 燕麥奶茶 / 夢幻奶紫）',
    leadDays: 20,
  },
  mug: {
    label: '質感原木金屬馬克杯',
    process: 'UV 彩色噴印 / 雙層真空不鏽鋼',
    spec: '印刷範圍 51 × 71 mm',
    unit: '個',
    tiers: [
      { min: 1,   max: 49,   price: 580 },
      { min: 50,  max: 99,   price: 550 },
      { min: 100, max: 299,  price: 520 },
      { min: 300, max: 9999, price: 480 },
    ],
    note: '多色可選（灰夜奶霧 / 焙茶拿鐵 / 雲朵牛奶 / 薄荷奶綠）',
    leadDays: 20,
  },
};

/* ═══════════════════════════════════════════════════
   全域提案狀態
   ═══════════════════════════════════════════════════ */
const PROPOSAL_STATE = {
  open: false,
  productId: null,
  qty: 100,
  customerName: '',
  customerContact: '',
  salesperson: 'RAY',
  notes: '',
  validDays: 30,
  previewDataURL: null, // 合成後示意圖
};

/* ═══════════════════════════════════════════════════
   1. 初始化提案模式
   ═══════════════════════════════════════════════════ */
function initProposalMode(productId) {
  PROPOSAL_STATE.productId = productId || (window.STATE && STATE.productId) || null;
  if (!PROPOSAL_STATE.productId) {
    alert('請先選擇商品後再使用提案功能');
    return;
  }

  const panel = document.getElementById('proposal-panel');
  if (!panel) {
    console.error('[Proposal] #proposal-panel 不存在，請確認 HTML 已正確加入');
    return;
  }

  PROPOSAL_STATE.open = true;
  panel.classList.remove('proposal-panel--hidden');

  // 填入商品資訊
  _refreshProposalPanel();
  // 即時更新報價
  _updateProposalQuote();

  console.log('[Proposal] 提案模式開啟，商品：', PROPOSAL_STATE.productId);
}

function closeProposalPanel() {
  PROPOSAL_STATE.open = false;
  const panel = document.getElementById('proposal-panel');
  if (panel) panel.classList.add('proposal-panel--hidden');
}

/* ═══════════════════════════════════════════════════
   2. 報價計算
   ═══════════════════════════════════════════════════ */
function calcProposalPrice(productId, qty) {
  const cfg = PROPOSAL_PRICES[productId];
  if (!cfg) return null;

  let unitPrice = 0;
  for (const tier of cfg.tiers) {
    if (qty >= tier.min && qty <= tier.max) {
      unitPrice = tier.price;
      break;
    }
  }
  if (unitPrice === 0 && cfg.tiers.length > 0) {
    // 超過最大數量，取最後一個 tier
    unitPrice = cfg.tiers[cfg.tiers.length - 1].price;
  }

  const subtotal = unitPrice * qty;
  const tax      = Math.ceil(subtotal * 0.05);
  const total    = subtotal + tax;

  return { unitPrice, subtotal, tax, total, qty, cfg };
}

function _updateProposalQuote() {
  const pid = PROPOSAL_STATE.productId;
  const qty = parseInt(document.getElementById('proposal-qty')?.value || PROPOSAL_STATE.qty, 10);
  PROPOSAL_STATE.qty = qty;

  const result = calcProposalPrice(pid, qty);
  if (!result) return;

  const fmt = n => n.toLocaleString('zh-TW');

  _setText('proposal-unit-price',  `NT$ ${fmt(result.unitPrice)} / ${result.cfg.unit}`);
  _setText('proposal-subtotal',    `NT$ ${fmt(result.subtotal)}`);
  _setText('proposal-tax',         `NT$ ${fmt(result.tax)}`);
  _setText('proposal-total',       `NT$ ${fmt(result.total)}`);
  _setText('proposal-qty-display', `${fmt(qty)} ${result.cfg.unit}`);

  // 更新 qty input display
  const qtyInput = document.getElementById('proposal-qty');
  if (qtyInput) qtyInput.value = qty;
}

function onProposalQtyChange(val) {
  PROPOSAL_STATE.qty = parseInt(val, 10) || 100;
  _updateProposalQuote();
}

/* ═══════════════════════════════════════════════════
   3. 面板刷新
   ═══════════════════════════════════════════════════ */
function _refreshProposalPanel() {
  const pid = PROPOSAL_STATE.productId;
  const cfg = PROPOSAL_PRICES[pid];
  if (!cfg) return;

  _setText('proposal-product-name',  cfg.label);
  _setText('proposal-product-spec',  cfg.spec);
  _setText('proposal-product-note',  cfg.note);
  _setText('proposal-lead-days',     `確認訂單後 ${cfg.leadDays} 個工作天`);

  // 數量階梯 badge
  const tiersEl = document.getElementById('proposal-tiers');
  if (tiersEl) {
    tiersEl.innerHTML = cfg.tiers.map(t =>
      `<span class="proposal-tier-badge">${t.min.toLocaleString()}${t.max < 9999 ? '–' + t.max.toLocaleString() : '+'}${cfg.unit} → NT$${t.price}</span>`
    ).join('');
  }

  // 最小起訂量提示
  const minQty = cfg.tiers[0]?.min || 1;
  const qtyInput = document.getElementById('proposal-qty');
  if (qtyInput) {
    qtyInput.min   = minQty;
    qtyInput.value = Math.max(PROPOSAL_STATE.qty, minQty);
    PROPOSAL_STATE.qty = Math.max(PROPOSAL_STATE.qty, minQty);
  }
}

/* ═══════════════════════════════════════════════════
   4. 擷取目前 Canvas 作為示意圖
   ═══════════════════════════════════════════════════ */
async function _capturePreviewImage() {
  // 優先用 live-mockup-canvas（有的話）
  const liveMockup = document.getElementById('live-mockup-canvas');
  if (liveMockup && liveMockup.style.display !== 'none' && liveMockup.width > 0) {
    return liveMockup.toDataURL('image/png');
  }

  // 次選 mockup-canvas（Step 4）
  const mockupCanvas = document.getElementById('mockup-canvas');
  if (mockupCanvas && mockupCanvas.style.display !== 'none' && mockupCanvas.width > 0) {
    return mockupCanvas.toDataURL('image/png');
  }

  // 再選 canvas-2d（設計稿）
  const canvas2d = document.getElementById('canvas-2d');
  if (canvas2d && canvas2d.width > 0) {
    // 若有 get2DDataURL 函式，使用它
    if (typeof get2DDataURL === 'function') {
      try { return await get2DDataURL(); } catch(e) {}
    }
    return canvas2d.toDataURL('image/png');
  }

  return null;
}

/* ═══════════════════════════════════════════════════
   5. 生成 PDF（純瀏覽器 — 動態載入 jsPDF）
   ═══════════════════════════════════════════════════ */
async function generateProposalPDF() {
  // 蒐集表單資料
  PROPOSAL_STATE.customerName    = document.getElementById('proposal-customer-name')?.value?.trim()    || '（未填寫）';
  PROPOSAL_STATE.customerContact = document.getElementById('proposal-customer-contact')?.value?.trim() || '';
  PROPOSAL_STATE.salesperson     = document.getElementById('proposal-salesperson')?.value?.trim()      || 'RAY';
  PROPOSAL_STATE.notes           = document.getElementById('proposal-notes')?.value?.trim()            || '';
  PROPOSAL_STATE.validDays       = parseInt(document.getElementById('proposal-valid-days')?.value, 10) || 30;

  const qty    = PROPOSAL_STATE.qty;
  const pid    = PROPOSAL_STATE.productId;
  const result = calcProposalPrice(pid, qty);
  if (!result) { alert('無法取得報價資訊，請確認商品選擇'); return; }

  // 顯示生成中
  const btn = document.getElementById('btn-generate-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }

  try {
    // 動態載入 jsPDF（若尚未載入）
    await _loadJsPDF();

    // 擷取示意圖
    PROPOSAL_STATE.previewDataURL = await _capturePreviewImage();

    // 建立 PDF
    await _buildPDF(result);

  } catch (err) {
    console.error('[Proposal PDF] 錯誤：', err);
    alert('PDF 生成失敗：' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 生成提案 PDF'; }
  }
}

/* 動態載入 jsPDF CDN */
function _loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf || window.jsPDF) return resolve();

    // 載入 jsPDF
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
      // 載入 html2canvas（供備用）
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s2.onload = resolve;
      s2.onerror = resolve; // html2canvas 可選，不必要
      document.head.appendChild(s2);
    };
    s1.onerror = reject;
    document.head.appendChild(s1);
  });
}

/* ═══════════════════════════════════════════════════
   6. 建立 PDF 內容（仿「亞東彩印」Proforma Invoice 格式）
   ═══════════════════════════════════════════════════ */
async function _buildPDF(result) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('jsPDF 載入失敗');

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210;   // A4 寬 mm
  const H    = 297;   // A4 高 mm
  const ML   = 15;    // 左邊距
  const MR   = 15;    // 右邊距
  const CW   = W - ML - MR;  // 內容寬度
  const fmt  = n => n.toLocaleString('zh-TW');

  // ── 字體設定（內建 Helvetica，繁中用 Arial 近似）──
  // 注意：jsPDF 內建字體不支援繁中，繁中文字需嵌入字體或用圖片
  // 本版先用 ASCII 近似，後續可加入繁中字體
  doc.setFont('helvetica');

  let y = 14;  // 目前 y 座標

  // ─────────────────────────────────────────
  // 深藍色背景標題列
  // ─────────────────────────────────────────
  doc.setFillColor(31, 56, 100);  // #1F3864
  doc.rect(ML, y, CW, 14, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Songli Gifts', ML + 4, y + 5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('songligifts.com  |  eric@yz-usb.com.tw  |  02-2680-9966 ext.26', ML + 4, y + 10.5);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Proforma Invoice', W - MR - 2, y + 9, { align: 'right' });

  y += 18;

  // ─────────────────────────────────────────
  // 客戶資訊 + 報價單資訊（雙欄）
  // ─────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(240, 244, 251);  // 淡藍底
  doc.rect(ML, y, CW / 2 - 2, 30, 'F');
  doc.rect(ML + CW / 2 + 2, y, CW / 2 - 2, 30, 'F');

  // 左欄：客戶資訊
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('TO / Bill To:', ML + 3, y + 5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(PROPOSAL_STATE.customerName, ML + 3, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (PROPOSAL_STATE.customerContact) {
    doc.text('Contact: ' + PROPOSAL_STATE.customerContact, ML + 3, y + 16);
  }

  // 右欄：單號 / 日期 / 業務
  const today = _todayStr();
  const qNo   = 'SL-' + today.replace(/-/g, '') + '-001';
  const rx    = ML + CW / 2 + 5;

  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text('Quote No:',    rx, y + 5);
  doc.text('Date:',        rx, y + 11);
  doc.text('Valid Until:', rx, y + 17);
  doc.text('Sales Rep:',   rx, y + 23);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(qNo, rx + 22, y + 5);
  doc.text(today, rx + 22, y + 11);
  doc.text(_addDays(today, PROPOSAL_STATE.validDays), rx + 22, y + 17);
  doc.text(PROPOSAL_STATE.salesperson, rx + 22, y + 23);

  y += 34;

  // ─────────────────────────────────────────
  // 示意圖（若有）
  // ─────────────────────────────────────────
  if (PROPOSAL_STATE.previewDataURL) {
    try {
      const imgW  = 75;
      const imgH  = 55;
      const imgX  = W - MR - imgW;

      // 淡底框
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(imgX - 2, y - 2, imgW + 4, imgH + 4, 2, 2, 'F');

      doc.addImage(PROPOSAL_STATE.previewDataURL, 'PNG', imgX, y, imgW, imgH);

      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('Product Mockup', imgX + imgW / 2, y + imgH + 4, { align: 'center' });

      // 品名標籤
      const leftColW = CW - imgW - 6;

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 56, 100);
      _fitText(doc, result.cfg.label, ML, y + 2, leftColW, 13);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text('Spec:', ML, y + 10);
      _fitText(doc, result.cfg.spec, ML + 12, y + 10, leftColW - 14, 8);
      doc.text('Process:', ML, y + 16);
      _fitText(doc, result.cfg.process, ML + 14, y + 16, leftColW - 16, 8);

      y += imgH + 10;

    } catch (imgErr) {
      console.warn('[Proposal PDF] 圖片插入失敗：', imgErr);
      y += 8;
    }
  } else {
    // 無圖時純文字品名
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 56, 100);
    doc.text(result.cfg.label, ML, y + 2);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Spec: ' + result.cfg.spec, ML, y + 9);
    doc.text('Process: ' + result.cfg.process, ML, y + 15);
    y += 22;
  }

  // ─────────────────────────────────────────
  // 品項表格（仿亞東彩印格式）
  // ─────────────────────────────────────────
  // 表頭
  const cols = [
    { label: 'Item',     w: 40, align: 'left'   },
    { label: 'Spec',     w: 45, align: 'left'   },
    { label: 'Process',  w: 45, align: 'left'   },
    { label: 'Qty',      w: 15, align: 'center' },
    { label: 'Unit/NT$', w: 20, align: 'right'  },
    { label: 'Sub/NT$',  w: 15, align: 'right'  },
  ];

  // 表頭背景
  doc.setFillColor(31, 56, 100);
  doc.rect(ML, y, CW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let cx = ML;
  for (const col of cols) {
    _cellText(doc, col.label, cx, y + 5, col.w, col.align);
    cx += col.w;
  }
  y += 7;

  // 品項列（支援多數量方案）
  const rowH = 12;
  // 主方案
  _drawTableRow(doc, ML, y, CW, rowH, cols, result, true);
  y += rowH;

  // 若有其他數量階梯，提示
  const otherTiers = result.cfg.tiers.filter(t => t.min !== result.qty);
  let altRows = 0;
  for (const t of result.cfg.tiers) {
    if (t.min === result.qty) continue;
    const altQty  = t.min;
    const altRes  = calcProposalPrice(pid, altQty);
    if (!altRes) continue;
    doc.setFillColor(235, 243, 251);
    doc.rect(ML, y, CW, 8, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 80);
    const note = `Alt: ${altQty.toLocaleString()} ${result.cfg.unit}`;
    doc.text(note, ML + 3, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`NT$ ${fmt(altRes.unitPrice)} / ${result.cfg.unit}`, ML + 90, y + 5.5, { align: 'left' });
    doc.text(`Sub: NT$ ${fmt(altRes.subtotal)}`, ML + 130, y + 5.5);
    _drawRowBorder(doc, ML, y, CW, 8);
    y += 8;
    altRows++;
    if (altRows >= 2) break; // 最多顯示 2 個替代方案
  }

  // 空白填充列（至少 3 行）
  const blankRows = Math.max(0, 3 - 1 - altRows);
  for (let i = 0; i < blankRows; i++) {
    doc.setFillColor(255, 255, 255);
    doc.rect(ML, y, CW, 8, 'F');
    _drawRowBorder(doc, ML, y, CW, 8);
    y += 8;
  }

  // 合計區
  y += 2;
  const totX  = ML + CW - 75;
  const totW  = 75;

  // 幣別 + 合計
  doc.setFillColor(248, 248, 248);
  doc.rect(ML, y, CW - totW - 2, 24, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Currency: TWD (New Taiwan Dollar)', ML + 3, y + 8);
  doc.text('Min. Order: ' + result.cfg.tiers[0].min.toLocaleString() + ' ' + result.cfg.unit, ML + 3, y + 14);
  doc.text('Lead Time: ' + result.cfg.cfg?.leadDays || result.cfg.leadDays + ' working days', ML + 3, y + 20);

  // 右側合計表
  _drawTotals(doc, totX, y, totW, result, fmt);
  y += 28;

  // ─────────────────────────────────────────
  // 備註
  // ─────────────────────────────────────────
  doc.setFillColor(31, 56, 100);
  doc.rect(ML, y, CW, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Remarks / Notes', ML + 3, y + 4.5);
  y += 6;

  doc.setFillColor(255, 255, 255);
  doc.rect(ML, y, CW, 20, 'F');
  doc.setDrawColor(170, 170, 170);
  doc.rect(ML, y, CW, 20);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const baseNote = result.cfg.note || '';
  const userNote = PROPOSAL_STATE.notes ? '  ' + PROPOSAL_STATE.notes : '';
  const fullNote = '  ' + baseNote + (userNote ? '\n' + userNote : '');
  const noteLines = doc.splitTextToSize(fullNote, CW - 6);
  doc.text(noteLines, ML + 3, y + 5);
  y += 22;

  // ─────────────────────────────────────────
  // 付款 & 交期
  // ─────────────────────────────────────────
  doc.setFillColor(240, 244, 251);
  doc.rect(ML, y, CW / 2 - 2, 14, 'F');
  doc.rect(ML + CW / 2 + 2, y, CW / 2 - 2, 14, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 56, 100);
  doc.text('Payment Terms:', ML + 3, y + 5);
  doc.text('Delivery:', ML + CW / 2 + 5, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('50% deposit upon order, balance before shipment', ML + 3, y + 10);
  doc.text(_addDays(today, result.cfg.leadDays) + ' (approx.)', ML + CW / 2 + 5, y + 10);
  y += 18;

  // ─────────────────────────────────────────
  // 簽核
  // ─────────────────────────────────────────
  y = Math.max(y, H - 40);  // 確保在頁面底部
  doc.setDrawColor(31, 56, 100);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + CW, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('CONFIRMED BY', ML, y + 4);
  doc.text('Songli Gifts / 頌禮', W - MR, y + 4, { align: 'right' });
  y += 10;
  doc.setFont('helvetica', 'normal');
  const sigW = CW / 3;
  for (const [i, label] of ['Approved:', 'Reviewed:', 'Sales: ' + PROPOSAL_STATE.salesperson].entries()) {
    doc.text(label, ML + i * sigW + 3, y);
    doc.setDrawColor(180, 180, 180);
    doc.line(ML + i * sigW, y + 7, ML + (i + 1) * sigW - 5, y + 7);
  }

  // ─────────────────────────────────────────
  // 頁首浮水印（淡）
  // ─────────────────────────────────────────
  doc.setTextColor(220, 220, 220);
  doc.setFontSize(40);
  doc.setFont('helvetica', 'bold');
  doc.saveGraphicsState();
  doc.text('PROFORMA', W / 2, H / 2, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  // ─────────────────────────────────────────
  // 下載
  // ─────────────────────────────────────────
  const fileName = `頌禮提案_${PROPOSAL_STATE.customerName}_${today}.pdf`;
  doc.save(fileName);

  console.log('[Proposal PDF] 下載：', fileName);
}

/* ═══════════════════════════════════════════════════
   輔助：繪製表格列
   ═══════════════════════════════════════════════════ */
function _drawTableRow(doc, x, y, w, h, cols, result, highlight) {
  const fmt = n => n.toLocaleString('zh-TW');
  if (highlight) {
    doc.setFillColor(255, 242, 204);  // 淡黃（仿亞東彩印主方案）
  } else {
    doc.setFillColor(235, 243, 251);
  }
  doc.rect(x, y, w, h, 'F');

  const vals = [
    result.cfg.label,
    result.cfg.spec,
    result.cfg.process,
    fmt(result.qty),
    fmt(result.unitPrice),
    fmt(result.subtotal),
  ];
  const aligns = cols.map(c => c.align);
  let cx = x;
  doc.setFont('helvetica', highlight ? 'bold' : 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  for (let i = 0; i < cols.length; i++) {
    _cellText(doc, vals[i], cx + 2, y + h / 2 + 2.5, cols[i].w - 4, aligns[i]);
    cx += cols[i].w;
  }
  _drawRowBorder(doc, x, y, w, h);
}

function _drawRowBorder(doc, x, y, w, h) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
}

function _drawTotals(doc, x, y, w, result, fmt) {
  const rows = [
    { label: 'Subtotal:',     val: 'NT$ ' + fmt(result.subtotal), bold: false },
    { label: 'TAX (5%):',    val: 'NT$ ' + fmt(result.tax),      bold: false },
    { label: 'Grand Total:',  val: 'NT$ ' + fmt(result.total),    bold: true  },
  ];
  let ry = y;
  for (const row of rows) {
    if (row.bold) {
      doc.setFillColor(217, 225, 242);
      doc.rect(x, ry, w, 8, 'F');
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, ry, w, 8, 'F');
    }
    doc.setDrawColor(180, 180, 180);
    doc.rect(x, ry, w, 8);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 9 : 8);
    doc.setTextColor(0, 0, 0);
    doc.text(row.label, x + 3, ry + 5.5);
    doc.text(row.val, x + w - 3, ry + 5.5, { align: 'right' });
    ry += 8;
  }
}

/* ═══════════════════════════════════════════════════
   輔助函式
   ═══════════════════════════════════════════════════ */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _cellText(doc, text, x, y, maxW, align) {
  const t = String(text || '');
  if (align === 'right') {
    doc.text(t, x + maxW - 2, y, { align: 'right' });
  } else if (align === 'center') {
    doc.text(t, x + maxW / 2, y, { align: 'center' });
  } else {
    doc.text(t, x + 2, y, { align: 'left' });
  }
}

function _fitText(doc, text, x, y, maxW, fontSize) {
  const lines = doc.splitTextToSize(text || '', maxW);
  doc.text(lines[0] || '', x, y);  // 只取第一行，避免溢出
}

function _todayStr() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function _addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/* ═══════════════════════════════════════════════════
   全域暴露
   ═══════════════════════════════════════════════════ */
window.initProposalMode      = initProposalMode;
window.closeProposalPanel    = closeProposalPanel;
window.generateProposalPDF   = generateProposalPDF;
window.onProposalQtyChange   = onProposalQtyChange;
window.calcProposalPrice     = calcProposalPrice;
window.PROPOSAL_PRICES       = PROPOSAL_PRICES;
window.PROPOSAL_STATE        = PROPOSAL_STATE;
