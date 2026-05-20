// 楊竹科技 — 保溫杯 Mockup 合成模組
// 各顏色讀取各自單瓶圖 → 設計圖貼合標籤區 → 高光

// 標籤座標依「文字框.png」紅框分析（y=548~1088，x≈3~W-2）
const MOCKUP_DATA = {
  mint_green:  { src: 'assets/thermos/mockup/thermos_mint_green.png',  W: 1016, H: 2347,
                 label: { tl:[3,548], tr:[1013,548], br:[1013,1088], bl:[3,1088] } },
  cherry_pink: { src: 'assets/thermos/mockup/thermos_cherry_pink.png', W: 995,  H: 2347,
                 label: { tl:[3,548], tr:[992,548],  br:[992,1088],  bl:[3,1088] } },
  milk_purple: { src: 'assets/thermos/mockup/thermos_milk_purple.png', W: 995,  H: 2347,
                 label: { tl:[3,548], tr:[992,548],  br:[992,1088],  bl:[3,1088] } },
  oat_tea:     { src: 'assets/thermos/mockup/thermos_oat_tea.png',     W: 999,  H: 2347,
                 label: { tl:[3,548], tr:[996,548],  br:[996,1088],  bl:[3,1088] } },
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
