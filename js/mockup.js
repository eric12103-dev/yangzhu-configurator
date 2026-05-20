// 楊竹科技 — 保溫杯 Mockup 合成模組
// 底圖(1248×832) → 設計圖(透視扭曲 + multiply) → 高光

// 各顏色瓶身的標籤區四個角點（像素座標，基於 1248×832）
// 順序：左上、右上、右下、左下
const MOCKUP_LABEL = {
  mint_green:  { tl:[292,268], tr:[555,248], br:[555,388], bl:[292,410] },
  oat_tea:     { tl:[282,268], tr:[548,248], br:[548,385], bl:[282,407] },
  cherry_pink: { tl:[285,268], tr:[550,248], br:[550,386], bl:[285,408] },
  milk_purple: { tl:[288,268], tr:[552,248], br:[552,387], bl:[288,409] },
};

const MOCKUP_IMG = {
  mint_green:  'assets/thermos/mockup/mint_green.png',
  oat_tea:     'assets/thermos/mockup/oat_tea.png',
  cherry_pink: 'assets/thermos/mockup/cherry_pink.png',
  milk_purple: 'assets/thermos/mockup/milk_purple.png',
};

// 讀取圖片並回傳 HTMLImageElement
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
  const label = MOCKUP_LABEL[colorId];
  const imgSrc = MOCKUP_IMG[colorId];
  if (!label || !imgSrc) return null;

  const [bottleImg, designImg] = await Promise.all([
    _loadImg(imgSrc),
    _loadImg(designDataURL)
  ]);

  const W = 1248, H = 832;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 底層：瓶身照片 ──────────────────────────
  ctx.drawImage(bottleImg, 0, 0, W, H);

  // ── 中層：設計圖（透明底，直接疊在瓶身上）──
  const corners = [label.tl, label.tr, label.br, label.bl];
  const dw = designImg.width  || 850;
  const dh = designImg.height || 465;

  const off = document.createElement('canvas');
  off.width  = dw;
  off.height = dh;
  off.getContext('2d').drawImage(designImg, 0, 0);

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = W; tmpCanvas.height = H;
  const tc = tmpCanvas.getContext('2d');
  tc.save();
  _drawProjective(tc, off, corners, dw, dh);
  tc.restore();

  // source-over：透明底設計直接疊在瓶身，dark 元素自然融入
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.92;
  ctx.drawImage(tmpCanvas, 0, 0);
  ctx.restore();

  // ── 上層：圓柱高光（程式生成）──────────────────
  _drawHighlight(ctx, corners, W, H);

  return canvas;
}

// 仿射變換法：把設計矩形直接映射到標籤四邊形（三點確定仿射，適合圓柱標籤輕微透視）
function _drawProjective(ctx, srcCanvas, corners, sw, sh) {
  const [tl, tr, br, bl] = corners;

  // 仿射矩陣：(0,0)→tl  (sw,0)→tr  (0,sh)→bl
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
