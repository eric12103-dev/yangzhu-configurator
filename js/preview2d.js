// 楊竹科技 — 2D Canvas 設計預覽模組（Fabric.js）

let canvas2d = null;
let uploadedImage = null;
let currentProduct = null;
let _suppressOverlay  = false;  // 匯出時暫時關閉虛線框
let _showLabelBorder  = false;  // 隨行杯：選取時才顯示印刷框

// 可用字體清單
const FONTS = [
  { id: '(中英)標準體',   label: '(中英)標準體',   preview: '楊竹Aa'  },
  { id: '(中)草寫體',    label: '(中)草寫體',    preview: '楊竹Aa'  },
  { id: '(中)童趣手寫體', label: '(中)童趣手寫體', preview: '楊竹Aa'  },
  { id: '(中)簡約手寫體', label: '(中)簡約手寫體', preview: '楊竹Aa'  },
  { id: '(英)書法體',    label: '(英)書法體',    preview: 'YangZhu' },
  { id: '(英)流線體',    label: '(英)流線體',    preview: 'YangZhu' },
  { id: '(英)簽名體',    label: '(英)簽名體',    preview: 'YangZhu' },
];

function init2DCanvas(productId) {
  currentProduct = PRODUCTS[productId];
  if (!currentProduct) return;

  if (canvas2d) { canvas2d.dispose(); canvas2d = null; }

  const el = document.getElementById('canvas-2d');
  if (!el) return;

  const containerW = el.parentElement.offsetWidth || 400;
  const isThermos  = currentProduct.id === 'thermos';

  let cw, ch, _mdata = null;
  if (isThermos) {
    const _colorId = (typeof STATE !== 'undefined' && STATE.materialId) ? STATE.materialId : 'oat_tea';
    _mdata = (typeof MOCKUP_DATA !== 'undefined') ? MOCKUP_DATA[_colorId] : null;
    const _aspect  = _mdata ? (_mdata.H / _mdata.W) : 2.35;
    cw = Math.min(containerW - 40, 360);
    ch = Math.round(cw * _aspect);
  } else {
    const ratio = currentProduct.size.h / currentProduct.size.w;
    cw = Math.min(containerW - 40, 480);
    ch = Math.round(cw * ratio);
  }

  el.width  = cw;
  el.height = ch;

  canvas2d = new fabric.Canvas('canvas-2d', {
    width: cw, height: ch,
    backgroundColor: isThermos ? '#f0ece6' : '#ffffff'
  });

  // ── 手機觸控優化 ──────────────────────────
  fabric.Object.prototype.cornerSize          = 14;
  fabric.Object.prototype.touchCornerSize     = 42;
  fabric.Object.prototype.cornerStyle         = 'circle';
  fabric.Object.prototype.transparentCorners  = false;
  fabric.Object.prototype.cornerColor         = '#16a34a';
  fabric.Object.prototype.borderColor         = '#16a34a';
  fabric.Object.prototype.borderScaleFactor   = 2;

  // 旋轉控制點改為旋轉游標
  if (fabric.Object.prototype.controls?.mtr) {
    const rotateCursorSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'/%3E%3C/svg%3E") 12 12, grab`;
    fabric.Object.prototype.controls.mtr.cursorStyle = rotateCursorSvg;
  }

  canvas2d.on('selection:created', () => { _showLabelBorder = true;  canvas2d.requestRenderAll(); _showScaleBar(); });
  canvas2d.on('selection:updated', () => { _showLabelBorder = true;  canvas2d.requestRenderAll(); _showScaleBar(); });
  canvas2d.on('selection:cleared', () => { _showLabelBorder = false; canvas2d.requestRenderAll(); _hideScaleBar(); });
  canvas2d.on('object:scaling',  _updateScaleSlider);
  canvas2d.on('object:modified', _updateScaleSlider);

  // 限制物件邊界不可拖出印刷邊界
  canvas2d.on('object:moving', function(e) {
    const obj = e.target;
    if (!obj || !currentProduct || !currentProduct.labelArea) return;
    const la   = currentProduct.labelArea;
    const w    = canvas2d.getWidth();
    const h    = canvas2d.getHeight();
    const xMin = w * la.xRatio;
    const yMin = h * la.yRatio;
    const xMax = w * (la.xRatio + la.wRatio);
    const yMax = h * (la.yRatio + la.hRatio);
    obj.setCoords();
    const br = obj.getBoundingRect(true, true);
    const objW = br.width, objH = br.height;
    // 若物件比標籤還寬/高，至少鎖定中心點在邊界內
    if (objW >= (xMax - xMin)) {
      const cx = (xMin + xMax) / 2;
      obj.left = cx; obj.originX = 'center';
    } else {
      if (br.left < xMin) obj.left += (xMin - br.left);
      else if (br.left + objW > xMax) obj.left -= (br.left + objW - xMax);
    }
    if (objH >= (yMax - yMin)) {
      const cy = (yMin + yMax) / 2;
      obj.top = cy; obj.originY = 'center';
    } else {
      if (br.top < yMin) obj.top += (yMin - br.top);
      else if (br.top + objH > yMax) obj.top -= (br.top + objH - yMax);
    }
    obj.setCoords();
  });

  // after:render — 有 labelArea 畫虛線印刷框（隨行杯僅選取時顯示）；其他畫圓角框
  canvas2d.on('after:render', function() {
    if (!currentProduct || _suppressOverlay) return;
    if (isThermos && !_showLabelBorder) return;
    const ctx = canvas2d.contextContainer;
    const w   = canvas2d.getWidth();
    const h   = canvas2d.getHeight();

    ctx.save();
    ctx.setLineDash([10, 5]);

    if (currentProduct.labelArea) {
      const la = currentProduct.labelArea;
      ctx.strokeStyle = currentProduct.color || '#B87333';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(
        w * la.xRatio + 1, h * la.yRatio + 1,
        w * la.wRatio - 2, h * la.hRatio - 2
      );
    } else {
      const r   = Math.round(Math.min(w, h) * 0.06);
      const sw  = 2.5;
      const off = sw / 2;
      ctx.strokeStyle = currentProduct.color || '#2D7D46';
      ctx.lineWidth   = sw;
      ctx.beginPath();
      ctx.moveTo(r + off, off);
      ctx.lineTo(w - r - off, off);
      ctx.arcTo(w - off, off,     w - off, r + off,    r);
      ctx.lineTo(w - off, h - r - off);
      ctx.arcTo(w - off, h - off, w - r - off, h - off, r);
      ctx.lineTo(r + off, h - off);
      ctx.arcTo(off, h - off,     off, h - r - off,     r);
      ctx.lineTo(off, r + off);
      ctx.arcTo(off, off,         r + off, off,          r);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  });

  if (isThermos && _mdata) {
    // 更新 labelArea / textLayout 對應瓶身標籤實際位置
    const _lxr = _mdata.label.tl[0] / _mdata.W;
    const _lyr = _mdata.label.tl[1] / _mdata.H;
    const _lwr = (_mdata.label.tr[0] - _mdata.label.tl[0]) / _mdata.W;
    const _lhr = (_mdata.label.bl[1] - _mdata.label.tl[1]) / _mdata.H;
    currentProduct.labelArea  = { xRatio: _lxr, yRatio: _lyr, wRatio: _lwr, hRatio: _lhr };
    currentProduct.textLayout = {
      line1: { yRatio: _lyr + _lhr * 0.22, sizeRatio: _lhr * 0.19 },
      line2: { yRatio: _lyr + _lhr * 0.52, sizeRatio: _lhr * 0.15 },
      line3: { yRatio: _lyr + _lhr * 0.80, sizeRatio: _lhr * 0.12 },
    };
    // 載入瓶身照片作為 canvas 不可選取背景
    fabric.Image.fromURL(_mdata.src, img => {
      if (!canvas2d) return;
      img.set({ scaleX: cw / img.width, scaleY: ch / img.height });
      canvas2d.setBackgroundImage(img, () => { addDefaultElements(); });
    });
  } else {
    addDefaultElements();
  }
}

// 載入隨行杯瓶身圖片作為背景（不可選取）並限制編輯區在印刷範圍內
function _loadThermosBottleBg(cw, ch, withHint, imgUrl) {
  const url = imgUrl || 'assets/thermos-bg.png';
  fabric.Image.fromURL(url, img => {
    if (!canvas2d) return;
    img.set({ scaleX: cw / img.width, scaleY: ch / img.height });
    canvas2d.setBackgroundImage(img, () => {
      // 印刷區：85×46.5mm，對應橫向 canvas 比例
      const clipRect = new fabric.Rect({
        left:   Math.round(cw * 0.410),
        top:    Math.round(ch * 0.358),
        width:  Math.round(cw * 0.158),
        height: Math.round(ch * 0.130),
        absolutePositioned: true
      });
      canvas2d.clipPath = clipRect;
      if (withHint) addDefaultElements();
      else canvas2d.renderAll();
    });
  });
}

function drawProductOutline(w, h) {
  // 虛線外框已改為 after:render 事件繪製（永遠在最上層）
  // 只保留品名浮水印
  const watermark = new fabric.Text(currentProduct.name, {
    left: w / 2, top: h / 2,
    originX: 'center', originY: 'center',
    fontSize: Math.round(h * 0.12),
    fill: 'rgba(0,0,0,0.04)',
    fontFamily: 'Arial',
    selectable: false, evented: false
  });
  canvas2d.add(watermark);
}

function addDefaultElements() {
  canvas2d.renderAll();
}

// ─── 加入文字（role: 'title' | 'subtitle'）────────────────
// title   → 上方 25% 處
// subtitle → 下方 75% 處
function addText2D(text, color = '#333333', size = null, font = 'Noto Sans TC', role = 'title') {
  if (!canvas2d || !text) return;

  // 確保字體已載入（對中文字體尤其重要）
  document.fonts.load(`16px "${font}"`).then(() => {
    _doAddText2D(text, color, size, font, role);
  }).catch(() => {
    _doAddText2D(text, color, size, font, role);
  });
}

function _doAddText2D(text, color, size, font, role) {
  if (!canvas2d) return;
  const w = canvas2d.getWidth();
  const h = canvas2d.getHeight();

  const hint = canvas2d.getObjects().find(o => o.name === 'hint');
  if (hint) canvas2d.remove(hint);

  let topPos, defaultSize;
  if (currentProduct && currentProduct.textLayout && currentProduct.textLayout[role]) {
    const tl = currentProduct.textLayout[role];
    topPos      = h * tl.yRatio;
    defaultSize = Math.round(h * tl.sizeRatio);
  } else {
    const yMap = { line1: 0.22, line2: 0.50, line3: 0.78 };
    topPos      = h * (yMap[role] ?? 0.28);
    defaultSize = Math.round(h * 0.12);
  }

  const la = currentProduct && currentProduct.labelArea;
  const isThermos = currentProduct && currentProduct.id === 'thermos';
  const boxWidth = la ? w * la.wRatio * (isThermos ? 0.75 : 1.0) : w * 0.92;
  const textCenterX = la ? w * (la.xRatio + la.wRatio / 2) : w / 2;

  const t = new fabric.Textbox(text, {
    left: textCenterX,
    top: topPos,
    width: boxWidth,
    originX: 'center',
    originY: 'center',
    fontSize: size || defaultSize,
    fill: color,
    fontFamily: font,
    textAlign: 'center',
    splitByGrapheme: true,
    editable: true,
    name: role
  });

  if (isThermos && la) {
    const _inset = 5;
    t.clipPath = new fabric.Rect({
      left:   w * la.xRatio + _inset,
      top:    h * la.yRatio + _inset,
      width:  w * la.wRatio - _inset * 2,
      height: h * la.hRatio - _inset * 2,
      absolutePositioned: true
    });
  }

  canvas2d.add(t);
  canvas2d.bringToFront(t);
  canvas2d.setActiveObject(t);
  canvas2d.renderAll();
  return t;
}

// ─── 上傳圖片 ────────────────────────────────────────────
function uploadImage2D(file) {
  if (!canvas2d || !file) return;
  const reader = new FileReader();
  reader.onload = e => {
    fabric.Image.fromURL(e.target.result, img => {
      const w = canvas2d.getWidth();
      const h = canvas2d.getHeight();
      const scale = Math.min(w / img.width, h / img.height) * 0.65;
      img.set({
        left: w / 2, top: h / 2,
        originX: 'center', originY: 'center',
        scaleX: scale, scaleY: scale
      });
      canvas2d.add(img);
      canvas2d.sendToBack(img);   // 圖片在文字下方
      canvas2d.setActiveObject(img);
      canvas2d.renderAll();
      uploadedImage = img;
    });
  };
  reader.readAsDataURL(file);
}

// ─── 背景色 ──────────────────────────────────────────────
function setBackground2D(color) {
  if (!canvas2d) return;
  canvas2d.setBackgroundColor(color, canvas2d.renderAll.bind(canvas2d));
}

// ─── 取得 DataURL（排除輔助線與虛線框）──────────────────────
function get2DDataURL() {
  if (!canvas2d) return null;
  // bottle-bg 保留在匯出圖中（隨行杯瓶身），只隱藏 hint 等輔助物件
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.renderAll();
  const dataURL = canvas2d.toDataURL({ format: 'png', multiplier: 2 });
  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.renderAll();
  return dataURL;
}

// ─── 取得透明底 DataURL（供 SVG 提交用，移除瓶身背景）──────────────────────
function get2DDataURLTransparent() {
  if (!canvas2d) return null;
  const origBg    = canvas2d.backgroundColor;
  const origBgImg = canvas2d.backgroundImage || null;
  const bgObjs    = canvas2d.getObjects().filter(o => !o.selectable);
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.backgroundColor = 'rgba(0,0,0,0)';
  canvas2d.backgroundImage = null;
  canvas2d.renderAll();
  const dataURL = canvas2d.toDataURL({ format: 'png', multiplier: 2 });
  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.backgroundColor = origBg;
  canvas2d.backgroundImage = origBgImg;
  canvas2d.renderAll();
  return dataURL;
}

// ─── Canvas JSON 存取（供返回設計稿時還原使用）─────────────────
function getCanvas2DJSON() {
  if (!canvas2d) return null;
  return canvas2d.toJSON();
}

function loadCanvas2DJSON(json) {
  if (!canvas2d || !json) return;
  canvas2d.loadFromJSON(json, function() {
    canvas2d.renderAll();
  });
}

// ─── 取得乾淨 Canvas Element（不含虛線框，供 3D 貼圖用）──────
function get2DCanvas() {
  if (!canvas2d) return null;
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.renderAll();
  const lc = canvas2d.lowerCanvasEl;
  const copy = document.createElement('canvas');
  copy.width  = lc.width;
  copy.height = lc.height;
  copy.getContext('2d').drawImage(lc, 0, 0);
  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.renderAll();
  return copy;
}

// ─── 匯出 SVG（基本，無字體嵌入）────────────────────────────
function get2DSVG() {
  if (!canvas2d) return null;
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.renderAll();

  let svg = canvas2d.toSVG();

  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.renderAll();

  // 後處理：設定正確印刷尺寸 85×46.5mm（各別替換，避免重複屬性）
  const cw = canvas2d.getWidth();
  const ch = canvas2d.getHeight();
  svg = svg.replace(/(<svg\b[^>]*)\swidth="[^"]*"/, '$1 width="85mm"');
  svg = svg.replace(/(<svg\b[^>]*)\sheight="[^"]*"/, '$1 height="46.5mm"');
  svg = svg.replace(/(<svg\b[^>]*)\sviewBox="[^"]*"/, `$1 viewBox="0 0 ${cw} ${ch}"`);
  return svg;
}

// ─── 本地字體對應路徑 ─────────────────────────────────────
const _LOCAL_FONTS = {
  '(中英)標準體':   '字體/標準體中、英文.ttf',
  '(中)草寫體':    '字體/草寫體中文.ttf',
  '(中)童趣手寫體': '字體/童趣手寫體中文.ttf',
  '(中)簡約手寫體': '字體/簡約手寫體中文.ttf',
  '(英)書法體':    '字體/書法體英文.ttf',
  '(英)流線體':    '字體/流線體英文.TTF',
  '(英)簽名體':    '字體/簽名體英文.ttf',
};

function _buf2b64(buf) {
  const bytes = new Uint8Array(buf);
  let b = '';
  for (let i = 0; i < bytes.length; i += 8192)
    b += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  return btoa(b);
}

async function _fetchFontAsBase64(family, uniqueChars) {
  // 本地字體：直接 fetch TTF
  if (_LOCAL_FONTS[family]) {
    const r = await fetch(_LOCAL_FONTS[family]);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return { data: 'data:font/truetype;base64,' + _buf2b64(buf), fmt: 'truetype' };
  }

  // Google Fonts：用 text 子集 API，只下載設計用到的字元
  const chars = [...new Set(uniqueChars.split(''))].join('').substring(0, 300);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(chars)}`;
  const cssResp = await fetch(cssUrl);
  if (!cssResp.ok) return null;
  const css = await cssResp.text();

  // 取出 woff2 URL
  const m = css.match(/url\(([^)]+)\)\s+format\('woff2'\)/);
  if (!m) return null;
  const url = m[1].replace(/['"]/g, '');
  const fontResp = await fetch(url);
  if (!fontResp.ok) return null;
  const buf = await fontResp.arrayBuffer();
  return { data: 'data:font/woff2;base64,' + _buf2b64(buf), fmt: 'woff2' };
}

// ─── 匯出 SVG（字體嵌入版）───────────────────────────────
async function get2DSVGWithFonts() {
  if (!canvas2d) return get2DSVG();
  const svgStr = get2DSVG();
  if (!svgStr) return null;

  const objs = canvas2d.getObjects();
  const fontFamilies = [...new Set(objs.filter(o => o.fontFamily).map(o => o.fontFamily))];
  const allText = objs.filter(o => o.text).map(o => o.text).join('');

  let fontCSS = '';
  for (const family of fontFamilies) {
    try {
      const result = await _fetchFontAsBase64(family, allText);
      if (result) {
        fontCSS += `@font-face{font-family:'${family}';src:url('${result.data}') format('${result.fmt}');}\n`;
      }
    } catch(e) {
      console.warn('[SVG font embed skipped]', family, e.message);
    }
  }

  if (!fontCSS) return svgStr;
  const style = `<style type="text/css">${fontCSS}</style>`;
  if (svgStr.includes('<defs>')) return svgStr.replace('<defs>', '<defs>' + style);
  return svgStr.replace(/(<svg[^>]*>)/, '$1<defs>' + style + '</defs>');
}

// ─── 手機縮放控制列 ───────────────────────────────────────
function _showScaleBar() {
  const bar = document.getElementById('mobile-scale-bar');
  if (bar) bar.style.display = 'flex';
  _updateScaleSlider();
}
function _hideScaleBar() {
  const bar = document.getElementById('mobile-scale-bar');
  if (bar) bar.style.display = 'none';
}
function _updateScaleSlider() {
  const obj    = canvas2d?.getActiveObject();
  const slider = document.getElementById('scale-slider');
  const pct    = document.getElementById('scale-pct');
  if (!obj || !slider) return;
  const val = Math.round((obj.scaleX || 1) * 100);
  slider.value = Math.max(5, Math.min(300, val));
  if (pct) pct.textContent = val + '%';
}
function scaleSelectedTo(scale) {
  if (!canvas2d) return;
  const obj = canvas2d.getActiveObject();
  if (!obj) return;
  const s = Math.max(0.05, Math.min(3.0, parseFloat(scale)));
  obj.set({ scaleX: s, scaleY: s });
  canvas2d.requestRenderAll();
  const pct = document.getElementById('scale-pct');
  if (pct) pct.textContent = Math.round(s * 100) + '%';
}

// ─── 刪除選取 ─────────────────────────────────────────────
function deleteSelected2D() {
  if (!canvas2d) return;
  const obj = canvas2d.getActiveObject();
  if (obj) { canvas2d.remove(obj); canvas2d.renderAll(); }
}

// ─── 清空 ─────────────────────────────────────────────────
function clear2D() {
  if (!canvas2d) return;
  canvas2d.getObjects().slice().forEach(o => canvas2d.remove(o));
  if (currentProduct && currentProduct.id === 'thermos') {
    const _cid = (typeof STATE !== 'undefined' && STATE.materialId) ? STATE.materialId : 'oat_tea';
    const _md  = (typeof MOCKUP_DATA !== 'undefined') ? MOCKUP_DATA[_cid] : null;
    canvas2d.backgroundColor = '#f0ece6';
    if (_md) {
      const cw = canvas2d.getWidth(), ch = canvas2d.getHeight();
      fabric.Image.fromURL(_md.src, img => {
        if (!canvas2d) return;
        img.set({ scaleX: cw / img.width, scaleY: ch / img.height });
        canvas2d.setBackgroundImage(img, () => { addDefaultElements(); });
      });
      return;
    }
    addDefaultElements();
  } else {
    canvas2d.setBackgroundColor('#ffffff', () => { canvas2d.renderAll(); });
    drawProductOutline(canvas2d.getWidth(), canvas2d.getHeight());
  }
}

// ─── 置中對齊 ─────────────────────────────────────────────
function alignCenter2D(axis) {
  if (!canvas2d) return;
  const obj = canvas2d.getActiveObject();
  if (!obj) return;
  if (axis === 'h') {
    obj.set({ left: canvas2d.getWidth() / 2, originX: 'center' });
  } else {
    obj.set({ top: canvas2d.getHeight() / 2, originY: 'center' });
  }
  obj.setCoords();
  canvas2d.requestRenderAll();
}
