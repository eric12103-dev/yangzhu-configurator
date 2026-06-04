// 楊竹科技 — 2D Canvas 設計預覽模組（Fabric.js）

let canvas2d = null;
let uploadedImage = null;
let currentProduct = null;
let _suppressOverlay  = false;
let _showLabelBorder  = false;
let _uploadBaseScale  = 1;

// ─── Undo / Redo ─────────────────────────────
let _historyStack = [];
let _redoStack    = [];
let _historyLock  = false;
let _textChangeTimer = null;

function _saveHistory() {
  if (_historyLock || !canvas2d) return;
  const json = JSON.stringify(canvas2d.toJSON(['name', 'padding', 'lineHeight']));
  _historyStack.push(json);
  if (_historyStack.length > 40) _historyStack.shift();
  _redoStack = [];
  _updateUndoRedoBtns();
}

function _updateUndoRedoBtns() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.disabled = _historyStack.length < 2;
  if (r) r.disabled = _redoStack.length === 0;
}

function _restoreFromJSON(jsonStr) {
  if (!canvas2d) return;
  _historyLock = true;
  canvas2d.loadFromJSON(JSON.parse(jsonStr), () => {
    canvas2d.renderAll();
    _historyLock = false;
    _updateUndoRedoBtns();
    if (typeof _saveDraft === 'function') _saveDraft();
  });
}

function undo2D() {
  if (_historyStack.length < 2) return;
  _redoStack.push(_historyStack.pop());
  _restoreFromJSON(_historyStack[_historyStack.length - 1]);
}

function redo2D() {
  if (!_redoStack.length) return;
  const next = _redoStack.pop();
  _historyStack.push(next);
  _restoreFromJSON(next);
}

// 鍵盤快捷鍵 Ctrl+Z / Ctrl+Y
document.addEventListener('keydown', e => {
  if (!canvas2d) return;
  const active = canvas2d.getActiveObject();
  if (active && active.isEditing) return; // 文字輸入中不觸發
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo2D(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo2D(); }
});

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

  canvas2d.on('selection:created', e => {
    _showLabelBorder = true; canvas2d.requestRenderAll();
    const obj = e.selected?.[0] || canvas2d.getActiveObject();
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(obj);
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
  });
  canvas2d.on('selection:updated', e => {
    _showLabelBorder = true; canvas2d.requestRenderAll();
    const obj = e.selected?.[0] || canvas2d.getActiveObject();
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(obj);
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
  });
  canvas2d.on('selection:cleared', () => {
    _showLabelBorder = false; canvas2d.requestRenderAll();
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(null);
    if (typeof _hideFloatToolbar === 'function') _hideFloatToolbar();
  });
  canvas2d.on('object:scaling',  e => { if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar(); });
  canvas2d.on('object:modified', e => {
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
    _updateTextOpacity();
    canvas2d.requestRenderAll();
    _saveHistory();
    if (typeof _saveDraft === 'function') _saveDraft();
  });
  canvas2d.on('object:added', () => {
    _saveHistory();
    if (typeof _saveDraft === 'function') _saveDraft();
  });
  canvas2d.on('object:removed', () => {
    _saveHistory();
    if (typeof _saveDraft === 'function') _saveDraft();
  });
  canvas2d.on('text:changed', () => {
    _updateTextOpacity();
    canvas2d.requestRenderAll();
    if (_textChangeTimer) clearTimeout(_textChangeTimer);
    _textChangeTimer = setTimeout(() => {
      _saveHistory();
      if (typeof _saveDraft === 'function') _saveDraft();
    }, 600);
  });

  // 限制物件邊界不可拖出 canvas 邊界（隨行杯允許超出，由不透明度提示）
  canvas2d.on('object:moving', function(e) {
    const obj = e.target;
    if (!obj) return;
    if (!isThermos) {
      const w = canvas2d.getWidth();
      const h = canvas2d.getHeight();
      obj.setCoords();
      const br = obj.getBoundingRect(true, true);
      const objW = br.width, objH = br.height;
      if (objW < w) {
        if (br.left < 0) obj.left += -br.left;
        else if (br.left + objW > w) obj.left -= (br.left + objW - w);
      }
      if (objH < h) {
        if (br.top < 0) obj.top += -br.top;
        else if (br.top + objH > h) obj.top -= (br.top + objH - h);
      }
      obj.setCoords();
    }
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
    _updateTextOpacity();
  });

  // after:render — 有 labelArea 畫虛線印刷框（隨行杯僅選取時顯示）；其他畫圓角框
  canvas2d.on('after:render', function() {
    if (!currentProduct || _suppressOverlay) return;
    const ctx = canvas2d.contextContainer;
    const w   = canvas2d.getWidth();
    const h   = canvas2d.getHeight();

    // 虛線框（隨行杯僅選取時顯示）
    if (isThermos && !_showLabelBorder) return;

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
  // biz_card 不顯示品名浮水印
  if (typeof STATE !== 'undefined' && STATE.productId === 'biz_card') return;
}

function addDefaultElements() {
  canvas2d.renderAll();
  _historyStack = []; _redoStack = [];
  if (typeof _loadDraft === 'function') _loadDraft();
  setTimeout(() => { _saveHistory(); }, 300);
}

// 計算標準化 padding：補償不同字體 fontBoundingBox 差異，讓視覺間距趨於一致
function _normPadding(font, fontSize, basePad) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${fontSize}px "${font}"`;
    const m = ctx.measureText('楊Ag');
    const fAsc = m.fontBoundingBoxAscent;
    const fDes = m.fontBoundingBoxDescent;
    if (typeof fAsc !== 'number' || typeof fDes !== 'number') return basePad;
    const overflow = Math.max(0, (fAsc + fDes) - fontSize * 1.3);
    return Math.max(0, basePad - Math.round(overflow / 2));
  } catch(e) { return basePad; }
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

  const la = currentProduct && currentProduct.labelArea;
  let topPos, defaultSize;
  if (currentProduct && currentProduct.textLayout && currentProduct.textLayout[role]) {
    const tl = currentProduct.textLayout[role];
    topPos      = h * tl.yRatio;
    defaultSize = Math.round(h * tl.sizeRatio);
  } else {
    const yMap = { line1: 0.22, line2: 0.50, line3: 0.78 };
    topPos      = la ? h * (la.yRatio + la.hRatio / 2) : h * (yMap[role] ?? 0.28);
    defaultSize = la ? Math.round(h * la.hRatio * 0.18) : Math.round(h * 0.08);
  }

  const isThermos = currentProduct && currentProduct.id === 'thermos';
  const boxWidth = la ? w * la.wRatio * (isThermos ? 0.93 : 1.0) : w * 0.92;
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
    name: role,
    padding: _normPadding(font, size || defaultSize, 6),
    lineHeight: 1.3
  });

  canvas2d.add(t);
  canvas2d.bringToFront(t);
  canvas2d.setActiveObject(t);
  canvas2d.renderAll();
  // 縮小文字框寬度貼合實際文字（讓選取綠框不超過文字）
  if (t._textLines && t._textLines.length) {
    let maxW = 0;
    for (let i = 0; i < t._textLines.length; i++) {
      const lw = t.getLineWidth(i);
      if (lw > maxW) maxW = lw;
    }
    const fittedW = Math.ceil(maxW) + 8;
    if (fittedW < t.width) {
      t.set('width', fittedW);
      t.setCoords();
      canvas2d.renderAll();
    }
  }
  return t;
}

// ─── 上傳圖片 ────────────────────────────────────────────
function uploadImage2D(file) {
  if (!canvas2d || !file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _lastUploadedDataURL = e.target.result; // 保存原始圖片 URL，送出時使用
    fabric.Image.fromURL(e.target.result, img => {
      const w = canvas2d.getWidth();
      const h = canvas2d.getHeight();

      // 卡片上傳模式：圖片填滿虛線框，並裁切在框線範圍內
      const _isUploadOnly = typeof STATE !== 'undefined'
        && STATE.productId === 'biz_card'
        && ['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId)
        && STATE.orientationId === 'landscape';

      if (_isUploadOnly) {
        // 黑色虛線框範圍（SVG viewBox 259.7×170.1，角點 2.8~256.8 / 2.8~167.2）
        const cx  = w * (2.8 / 259.7);
        const cy  = h * (2.8 / 170.1);
        const cw2 = w * ((256.8 - 2.8) / 259.7);
        const ch2 = h * ((167.2 - 2.8) / 170.1);
        // 填滿虛線框
        const scale = Math.max(cw2 / img.width, ch2 / img.height);
        _uploadBaseScale = scale;
        img.set({
          left: w / 2, top: h / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale
        });
        // 裁切：超出虛線框的部分不顯示
        img.clipPath = new fabric.Rect({
          left: cx, top: cy,
          width: cw2, height: ch2,
          absolutePositioned: true
        });
        // 重設滑桿為 100%
        const _s = document.getElementById('zoom-slider');
        const _d = document.getElementById('zoom-value-display');
        if (_s) _s.value = 100;
        if (_d) _d.textContent = '100%';
      } else {
        const scale = Math.min(w / img.width, h / img.height) * 0.65;
        img.set({
          left: w / 2, top: h / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale
        });
      }

      canvas2d.add(img);
      canvas2d.sendToBack(img);
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

// ─── 隨行杯：文字超出 labelArea 時降低不透明度至 35% ──────────────
function _updateTextOpacity() {
  if (!canvas2d || !currentProduct || !currentProduct.labelArea) return;
  const isTh = currentProduct && currentProduct.id === 'thermos';
  if (!isTh) return;
  const la = currentProduct.labelArea;
  const w  = canvas2d.getWidth();
  const h  = canvas2d.getHeight();
  const laLeft   = w * la.xRatio;
  const laTop    = h * la.yRatio;
  const laRight  = laLeft + w * la.wRatio;
  const laBottom = laTop  + h * la.hRatio;
  canvas2d.getObjects().forEach(obj => {
    if (!obj.selectable) return;
    obj.setCoords();
    const br = obj.getBoundingRect(true, true);
    const outside = br.left < laLeft - 1 ||
                    br.top  < laTop  - 1 ||
                    (br.left + br.width)  > laRight  + 1 ||
                    (br.top  + br.height) > laBottom + 1;
    obj.opacity = outside ? 0.35 : 1.0;
  });
}

// ─── 取得 DataURL（含 SVG 框線合成，供預覽與送出用）─────────────
// 注意：after:render 繪圖不會被 toDataURL 擷取，需手動合成
let _cachedCardFrameImg = null;
var _lastUploadedDataURL = null;

// 卡片橫式上傳模式：回傳向量 SVG（照片為 <image>，紅框+虛線為獨立向量路徑）
// viewBox 259.7×170.1 pt = 91.6×60 mm（含出血），路徑取自 card_landscape_frame.svg
function getUploadOnlySVG() {
  if (!_lastUploadedDataURL) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 259.7 170.1" width="91.6mm" height="60mm">
<style>.st0{fill:none;stroke:#E60012;stroke-miterlimit:10;}.st1{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;}.st2{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.0813,5.0813;}.st3{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.1404,5.1404;}</style>
<defs><clipPath id="card-clip"><rect x="2.8" y="2.8" width="254" height="164.4"/></clipPath></defs>
<image xlink:href="${_lastUploadedDataURL}" x="0" y="0" width="259.7" height="170.1" preserveAspectRatio="none" clip-path="url(#card-clip)"/>
<g>
<path class="st0" d="M251.1,152.2c0,5.2-4.2,9.3-9.3,9.3h-224c-5.2,0-9.3-4.2-9.3-9.3V17.8c0-5.2,4.2-9.3,9.3-9.3h224c5.2,0,9.3,4.2,9.3,9.3V152.2z"/>
<g><g>
<polyline class="st1" points="256.8,164.7 256.8,167.2 254.3,167.2"/>
<line class="st2" x1="249.2" y1="167.2" x2="7.9" y2="167.2"/>
<polyline class="st1" points="5.3,167.2 2.8,167.2 2.8,164.7"/>
<line class="st3" x1="2.8" y1="159.6" x2="2.8" y2="7.9"/>
<polyline class="st1" points="2.8,5.3 2.8,2.8 5.3,2.8"/>
<line class="st2" x1="10.4" y1="2.8" x2="251.8" y2="2.8"/>
<polyline class="st1" points="254.3,2.8 256.8,2.8 256.8,5.3"/>
<line class="st3" x1="256.8" y1="10.5" x2="256.8" y2="162.2"/>
</g></g>
</g>
</svg>`;
}

function get2DDataURLWithFrame() {
  const base = get2DDataURL();
  if (!base) return Promise.resolve(null);

  const doComposite = (frameImg) => {
    const w = canvas2d.getWidth() * 2;
    const h = canvas2d.getHeight() * 2;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    return new Promise(resolve => {
      const baseImg = new Image();
      baseImg.onload = () => {
        ctx.drawImage(baseImg, 0, 0, w, h);
        ctx.drawImage(frameImg, 0, 0, w, h);
        resolve(tmp.toDataURL('image/png'));
      };
      baseImg.onerror = () => resolve(base);
      baseImg.src = base;
    });
  };

  if (_cachedCardFrameImg && _cachedCardFrameImg.complete && _cachedCardFrameImg.naturalWidth > 0) {
    return doComposite(_cachedCardFrameImg);
  }
  return new Promise(resolve => {
    const frameImg = new Image();
    frameImg.onload = () => { _cachedCardFrameImg = frameImg; doComposite(frameImg).then(resolve); };
    frameImg.onerror = () => resolve(base);
    frameImg.src = 'assets/card_landscape_frame.svg';
  });
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

// ─── 隨行杯專用：只匯出標籤印刷區 PNG（透明底、字體已渲染）────────────────
function get2DLabelDataURL() {
  if (!canvas2d) return null;
  const isThermos = currentProduct && currentProduct.id === 'thermos';
  const la = currentProduct && currentProduct.labelArea;
  if (!isThermos || !la) return get2DDataURLTransparent();

  const w = canvas2d.getWidth();
  const h = canvas2d.getHeight();
  const origBgImg   = canvas2d.backgroundImage;
  const origBgColor = canvas2d.backgroundColor;
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable);
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.backgroundImage = null;
  canvas2d.backgroundColor = '#ffffff';
  canvas2d.renderAll();

  const dataURL = canvas2d.toDataURL({
    format: 'png', multiplier: 2,
    left:   Math.round(w * la.xRatio),
    top:    Math.round(h * la.yRatio),
    width:  Math.round(w * la.wRatio),
    height: Math.round(h * la.hRatio)
  });

  canvas2d.backgroundImage = origBgImg;
  canvas2d.backgroundColor = origBgColor;
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
  const isThermos = currentProduct && currentProduct.id === 'thermos';

  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;

  // 隨行杯：移除瓶身背景圖與背景色，SVG 只保留文字元素
  const origBgImg   = canvas2d.backgroundImage;
  const origBgColor = canvas2d.backgroundColor;
  if (isThermos) {
    canvas2d.backgroundImage = null;
    canvas2d.backgroundColor = '';   // 空字串 = 不輸出背景矩形（rgba 在 SVG 無效會變黑）
  }

  canvas2d.renderAll();
  let svg = canvas2d.toSVG();

  // 還原
  if (isThermos) {
    canvas2d.backgroundImage = origBgImg;
    canvas2d.backgroundColor = origBgColor;
  }
  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.renderAll();

  // 後處理：移除所有 <image> 元素（瓶身背景圖，Illustrator 會找不到連結檔案）
  svg = svg.replace(/<image\b[^>]*(?:\/>|>[\s\S]*?<\/image>)/gi, '');

  // 後處理：印刷尺寸 85×46.5mm
  const cw = canvas2d.getWidth();
  const ch = canvas2d.getHeight();
  svg = svg.replace(/(<svg\b[^>]*)\swidth="[^"]*"/, '$1 width="85mm"');
  svg = svg.replace(/(<svg\b[^>]*)\sheight="[^"]*"/, '$1 height="46.5mm"');

  // 隨行杯：viewBox 裁切到標籤印刷區，排除瓶身其他區域
  if (isThermos && currentProduct.labelArea) {
    const la  = currentProduct.labelArea;
    const vbX = Math.round(cw * la.xRatio);
    const vbY = Math.round(ch * la.yRatio);
    const vbW = Math.round(cw * la.wRatio);
    const vbH = Math.round(ch * la.hRatio);
    svg = svg.replace(/(<svg\b[^>]*)\sviewBox="[^"]*"/, `$1 viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`);
  } else {
    svg = svg.replace(/(<svg\b[^>]*)\sviewBox="[^"]*"/, `$1 viewBox="0 0 ${cw} ${ch}"`);
  }
  return svg;
}

// ─── 匯出向量 SVG（文字轉路徑，不需安裝字體）────────────────────────────────
async function get2DSVGOutlined() {
  const basicSVG = get2DSVG();
  if (!basicSVG) return null;

  // 動態載入 opentype.js
  if (!window.opentype) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js';
      s.onload = res;
      s.onerror = () => { console.warn('[SVG outline] opentype.js 載入失敗'); res(); };
      document.head.appendChild(s);
    });
  }
  if (!window.opentype) return basicSVG;

  // 解析 SVG，找出所有用到的字體
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(basicSVG, 'image/svg+xml');
  const textEls = Array.from(svgDoc.querySelectorAll('text[font-family]'));
  const families = [...new Set(textEls.map(el => el.getAttribute('font-family').replace(/['"]/g, '')))];

  // 載入字體（瀏覽器已快取，通常極快）
  const fontCache = {};
  for (const family of families) {
    const path = _LOCAL_FONTS[family];
    if (!path) continue;
    try {
      const resp = await fetch(path);
      if (resp.ok) fontCache[family] = opentype.parse(await resp.arrayBuffer());
    } catch(e) { console.warn('[SVG outline] 字體載入失敗', family); }
  }

  // 文字元素轉路徑
  const ns = 'http://www.w3.org/2000/svg';
  for (const textEl of textEls) {
    const family = (textEl.getAttribute('font-family') || '').replace(/['"]/g, '');
    const font = fontCache[family];
    if (!font) continue;  // 無對應字體，保留原 text 元素

    const fontSize = parseFloat(textEl.getAttribute('font-size') || '16');
    const fill     = textEl.getAttribute('fill') || '#000000';
    const newG     = document.createElementNS(ns, 'g');

    const tspans = Array.from(textEl.querySelectorAll('tspan'));
    const targets = tspans.length ? tspans : [textEl];

    for (const ts of targets) {
      const char = ts.textContent || '';
      if (!char.trim()) continue;
      const x  = parseFloat(ts.getAttribute('x')  ?? textEl.getAttribute('x')  ?? '0');
      const y  = parseFloat(ts.getAttribute('y')  ?? textEl.getAttribute('y')  ?? '0');
      const dy = parseFloat(ts.getAttribute('dy') ?? '0');
      const otPath = font.getPath(char, x, y + dy, fontSize);
      if (!otPath.commands.length) continue;
      const pathEl = document.createElementNS(ns, 'path');
      pathEl.setAttribute('d', otPath.toPathData(2));
      pathEl.setAttribute('fill', fill);
      newG.appendChild(pathEl);
    }

    textEl.parentNode.replaceChild(newG, textEl);
  }

  return new XMLSerializer().serializeToString(svgDoc);
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


// ─── 縮放滑桿（upload-only 模式）────────────────────────────
function onZoomSlider(value) {
  const ratio = parseFloat(value) / 100;
  const dispEl = document.getElementById('zoom-value-display');
  if (dispEl) dispEl.textContent = Math.round(ratio * 100) + '%';
  if (!canvas2d) return;
  const img = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
  if (!img) return;
  img.set({ scaleX: _uploadBaseScale * ratio, scaleY: _uploadBaseScale * ratio });
  img.setCoords();
  canvas2d.renderAll();
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
  _historyStack = []; _redoStack = []; _updateUndoRedoBtns();
  if (typeof _clearDraft === 'function') _clearDraft();
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
  const w = canvas2d.getWidth();
  const h = canvas2d.getHeight();
  const la = currentProduct && currentProduct.labelArea;
  if (axis === 'h') {
    const cx = la ? (la.xRatio + la.wRatio / 2) * w : w / 2;
    obj.set({ left: cx, originX: 'center' });
  } else {
    const cy = la ? (la.yRatio + la.hRatio / 2) * h : h / 2;
    obj.set({ top: cy, originY: 'center' });
  }
  obj.setCoords();
  canvas2d.requestRenderAll();
}
