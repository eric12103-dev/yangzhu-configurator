// 楊竹科技 — 保溫杯 Mockup 合成模組
// 各顏色讀取各自單瓶圖 → 設計圖貼合標籤區 → 高光

// 標籤座標依「文字框.png」紅框分析（y=548~1088，x≈3~W-2）
// editorSrc / editorLabel：編輯步驟用新圖（375×475）；src / label：確認送出步驟合成用原圖（不動）
const _edL = { tl:[8,190], tr:[367,190], br:[367,455], bl:[8,455] }; // 共用框線座標
const MOCKUP_DATA = {
  mint_green:  { src: 'assets/thermos/mockup/thermos_mint_green.png',  W: 389, H: 875,
                 label: { tl:[5,204], tr:[384,204], br:[384,406], bl:[5,406] },
                 editorSrc: 'assets/thermos/editor/editor_mint_green.jpg',  editorW: 375, editorH: 475, editorLabel: _edL },
  cherry_pink: { src: 'assets/thermos/mockup/thermos_cherry_pink.png', W: 391, H: 875,
                 label: { tl:[5,204], tr:[386,204], br:[386,406], bl:[5,406] },
                 editorSrc: 'assets/thermos/editor/editor_cherry_pink.jpg', editorW: 375, editorH: 475, editorLabel: _edL },
  milk_purple: { src: 'assets/thermos/mockup/thermos_milk_purple.png', W: 391, H: 875,
                 label: { tl:[5,204], tr:[386,204], br:[386,406], bl:[5,406] },
                 editorSrc: 'assets/thermos/editor/editor_milk_purple.jpg', editorW: 375, editorH: 475, editorLabel: _edL },
  oat_tea:     { src: 'assets/thermos/mockup/thermos_oat_tea.png',     W: 393, H: 874,
                 label: { tl:[5,204], tr:[388,204], br:[388,405], bl:[5,405] },
                 editorSrc: 'assets/thermos/editor/editor_oat_tea.jpg',     editorW: 375, editorH: 475, editorLabel: _edL },
};

function _loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 主函式：傳入顏色ID 和設計圖 DataURL，回傳合成後的 canvas
async function renderMockup(colorId, designDataURL) {
  const data = MOCKUP_DATA[colorId];
  if (!data) return null;

  const [bottleImg, designImg] = await Promise.all([
    _loadImg(data.src),
    _loadImg(designDataURL)
  ]);

  const W = data.W, H = data.H;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 底層：瓶子圖 ──────────────────────────────────────
  ctx.drawImage(bottleImg, 0, 0, W, H);

  // ── 中層：設計圖（仿射變換貼合標籤區）──────────────────
  const corners = [data.label.tl, data.label.tr, data.label.br, data.label.bl];
  const dw = designImg.width  || 850;
  const dh = designImg.height || 465;

  const off = document.createElement('canvas');
  off.width  = dw;
  off.height = dh;
  off.getContext('2d').drawImage(designImg, 0, 0);

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width  = W;
  tmpCanvas.height = H;
  const tc = tmpCanvas.getContext('2d');
  tc.save();
  _drawProjective(tc, off, corners, dw, dh);
  tc.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.90;
  ctx.drawImage(tmpCanvas, 0, 0);
  ctx.restore();

  // ── 上層：圓柱高光 ──────────────────────────────────
  _drawHighlight(ctx, corners, W, H);

  return canvas;
}

// 仿射變換：把設計矩形映射到標籤四邊形
function _drawProjective(ctx, srcCanvas, corners, sw, sh) {
  const [tl, tr, br, bl] = corners;
  const a = (tr[0] - tl[0]) / sw;
  const b = (tr[1] - tl[1]) / sw;
  const c = (bl[0] - tl[0]) / sh;
  const d = (bl[1] - tl[1]) / sh;
  const e = tl[0];
  const f = tl[1];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl[0], tl[1]);
  ctx.lineTo(tr[0], tr[1]);
  ctx.lineTo(br[0], br[1]);
  ctx.lineTo(bl[0], bl[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(srcCanvas, 0, 0, sw, sh);
  ctx.restore();
}

// 高光：左側半透明白色漸層模擬圓柱反光
function _drawHighlight(ctx, corners, W, H) {
  const [tl, tr, br, bl] = corners;
  const cx  = (tl[0]*0.35 + tr[0]*0.65);
  const cy  = (tl[1] + bl[1]) / 2;
  const r   = (tr[0] - tl[0]) * 0.55;

  const grad = ctx.createRadialGradient(cx - r*0.15, cy, 0, cx - r*0.15, cy, r*0.9);
  grad.addColorStop(0,   'rgba(255,255,255,0.22)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1,   'rgba(255,255,255,0)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl[0], tl[1]);
  ctx.lineTo(tr[0], tr[1]);
  ctx.lineTo(br[0], br[1]);
  ctx.lineTo(bl[0], bl[1]);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(tl[0]-10, tl[1]-10, tr[0]-tl[0]+20, bl[1]-tl[1]+20);
  ctx.restore();
}

// 質感原木金屬馬克杯各顏色背景圖
const MUG_MOCKUP_DATA = {
  charcoal_mist: { src: 'assets/mug/charcoal_mist.png' },
  roasted_latte: { src: 'assets/mug/roasted_latte.png' },
  cloud_milk:    { src: 'assets/mug/cloud_milk.png' },
  mint_green:    { src: 'assets/mug/mint_green.png' }
};
