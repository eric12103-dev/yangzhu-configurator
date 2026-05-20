// 楊竹科技 — 保溫杯 Mockup 合成模組
// 底圖(1620×971，4瓶並排) → 裁切對應顏色 → 設計圖貼合 → 高光

const MOCKUP_IMG_SRC = 'assets/thermos/mockup/thermos_4bottles.png';
const BOTTLE_W = 384;   // 1536 / 4
const BOTTLE_H = 1024;

// 各顏色在4瓶圖中的裁切起始 X，以及標籤區四角座標（相對裁切後畫面）
// 瓶子排列：0=薄荷綠 1=櫻花粉 2=奶紫 3=燕麥咖
const MOCKUP_DATA = {
  mint_green:  { cropX: 0,    label: { tl:[25,130], tr:[359,130], br:[359,690], bl:[25,690] } },
  cherry_pink: { cropX: 384,  label: { tl:[25,130], tr:[359,130], br:[359,690], bl:[25,690] } },
  milk_purple: { cropX: 768,  label: { tl:[25,130], tr:[359,130], br:[359,690], bl:[25,690] } },
  oat_tea:     { cropX: 1152, label: { tl:[25,130], tr:[359,130], br:[359,690], bl:[25,690] } },
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
    _loadImg(MOCKUP_IMG_SRC),
    _loadImg(designDataURL)
  ]);

  const canvas = document.createElement('canvas');
  canvas.width  = BOTTLE_W;
  canvas.height = BOTTLE_H;
  const ctx = canvas.getContext('2d');

  // ── 底層：裁切對應顏色的瓶子 ──────────────────────────
  ctx.drawImage(bottleImg, data.cropX, 0, BOTTLE_W, BOTTLE_H, 0, 0, BOTTLE_W, BOTTLE_H);

  // ── 中層：設計圖（仿射變換貼合標籤區）──────────────────
  const corners = [data.label.tl, data.label.tr, data.label.br, data.label.bl];
  const dw = designImg.width  || 850;
  const dh = designImg.height || 465;

  const off = document.createElement('canvas');
  off.width  = dw;
  off.height = dh;
  off.getContext('2d').drawImage(designImg, 0, 0);

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width  = BOTTLE_W;
  tmpCanvas.height = BOTTLE_H;

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
  _drawHighlight(ctx, corners, BOTTLE_W, BOTTLE_H);

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
