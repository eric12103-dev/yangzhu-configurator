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

// 計算把矩形 [0,0,sw,sh] 映射到四邊形 corners 的 CSS matrix3d 係數
// 演算法：求解 8×8 線性方程組（projective transform）
function _perspectiveMatrix(sw, sh, corners) {
  const [tl, tr, br, bl] = corners;
  const s = [[0,0],[sw,0],[sw,sh],[0,sh]];
  const d = [tl, tr, br, bl];

  function adj(m) { // 3×3 矩陣伴隨
    return [
       m[4]*m[8]-m[5]*m[7], -(m[1]*m[8]-m[2]*m[7]),  m[1]*m[5]-m[2]*m[4],
      -(m[3]*m[8]-m[5]*m[6]),  m[0]*m[8]-m[2]*m[6], -(m[0]*m[5]-m[2]*m[3]),
       m[3]*m[7]-m[4]*m[6], -(m[0]*m[7]-m[1]*m[6]),  m[0]*m[4]-m[1]*m[3]
    ];
  }
  function multMV(m, v) {
    return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
            m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
            m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
  }
  function basisToPoints(p) {
    const m = [p[0][0],p[1][0],p[2][0], p[0][1],p[1][1],p[2][1], 1,1,1];
    const v = multMV(adj(m), [p[3][0],p[3][1],1]);
    return [m[0]*v[0],m[1]*v[1],m[2]*v[2], m[3]*v[0],m[4]*v[1],m[5]*v[2], m[6]*v[0],m[7]*v[1],m[8]*v[2]];
  }
  function multMM(a,b) {
    const r = new Array(9).fill(0);
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) for(let k=0;k<3;k++) r[i*3+j]+=a[i*3+k]*b[k*3+j];
    return r;
  }

  const src = basisToPoints(s);
  const dst = basisToPoints(d);
  const t   = multMM(dst, adj(src));
  const det = t[0]*t[4]*t[8]+t[1]*t[5]*t[6]+t[2]*t[3]*t[7]
             -t[2]*t[4]*t[6]-t[1]*t[3]*t[8]-t[0]*t[5]*t[7];
  const n = t.map(v => v/det);

  // CSS matrix3d（行主序 4×4）
  return [
     n[0], n[3], 0, n[6],
     n[1], n[4], 0, n[7],
        0,    0, 1,    0,
     n[2], n[5], 0, n[8]
  ];
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

  // ── 中層：設計圖（perspectiveTransform + multiply）──
  const corners = [label.tl, label.tr, label.br, label.bl];
  const dw = designImg.width  || 850;
  const dh = designImg.height || 465;

  // 把設計圖畫到 offscreen canvas
  const off = document.createElement('canvas');
  off.width  = dw;
  off.height = dh;
  off.getContext('2d').drawImage(designImg, 0, 0);

  // 用 CSS matrix3d 在臨時 div 做透視，再 drawImage 回主 canvas
  const mat = _perspectiveMatrix(dw, dh, corners);
  const tmpDiv = document.createElement('div');
  tmpDiv.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${W}px;height:${H}px;`;
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = W; tmpCanvas.height = H;
  tmpDiv.appendChild(tmpCanvas);
  document.body.appendChild(tmpDiv);

  const tc = tmpCanvas.getContext('2d');
  tc.save();
  // 手動套用 projective transform（掃描線法）
  _drawProjective(tc, off, corners, dw, dh);
  tc.restore();

  // 合成到主 canvas（multiply 混合）
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.88;
  ctx.drawImage(tmpCanvas, 0, 0);
  ctx.restore();

  document.body.removeChild(tmpDiv);

  // ── 上層：圓柱高光（程式生成）──────────────────
  _drawHighlight(ctx, corners, W, H);

  return canvas;
}

// 掃描線法：逐列繪製設計圖以模擬透視扭曲（100 條 strip）
function _drawProjective(ctx, srcCanvas, corners, sw, sh) {
  const STRIPS = 120;
  const [tl, tr, br, bl] = corners;

  for (let i = 0; i < STRIPS; i++) {
    const t0 = i / STRIPS;
    const t1 = (i + 1) / STRIPS;

    // 本 strip 左右兩側的 y 位置（在目標空間）
    const lx0 = tl[0] + (bl[0]-tl[0])*t0,  ly0 = tl[1] + (bl[1]-tl[1])*t0;
    const rx0 = tr[0] + (br[0]-tr[0])*t0,  ry0 = tr[1] + (br[1]-tr[1])*t0;
    const lx1 = tl[0] + (bl[0]-tl[0])*t1,  ly1 = tl[1] + (bl[1]-tl[1])*t1;
    const rx1 = tr[0] + (br[0]-tr[0])*t1,  ry1 = tr[1] + (br[1]-tr[1])*t1;

    const srcY0 = t0 * sh;
    const srcH  = (t1 - t0) * sh;

    // 建立橫向漸縮 transform
    const dstW0 = rx0 - lx0; // 頂邊寬
    const dstW1 = rx1 - lx1; // 底邊寬
    const dstW  = Math.max(dstW0, dstW1);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(rx0, ry0);
    ctx.lineTo(rx1, ry1);
    ctx.lineTo(lx1, ly1);
    ctx.closePath();
    ctx.clip();

    const scaleX = dstW0 / sw;
    const scaleY = (ly1 - ly0 + ry1 - ry0) / 2 / srcH;
    const skewX  = (rx0 - lx0 - dstW0) / (ly0 - ry0 + 0.001);

    ctx.transform(scaleX, (ly0-ry0)/dstW0*0 , (lx1-lx0)/(srcH||1), scaleY, lx0, ly0);
    ctx.drawImage(srcCanvas, 0, srcY0, sw, srcH, 0, 0, sw, srcH);

    ctx.restore();
  }
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
