// 頌禮 — 2D Canvas 設計預覽模組（Fabric.js）

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

// 桌面 Ctrl+V：textbox 選取但未進入 editing 模式時，攔截貼上事件插入文字
document.addEventListener('paste', e => {
  if (!canvas2d) return;
  const active = canvas2d.getActiveObject();
  if (!active || active.type !== 'textbox') return;
  if (active.isEditing) return; // editing 模式由 Fabric.js 自己處理
  const text = (e.clipboardData?.getData('text/plain') || '').trim();
  if (!text) return;
  e.preventDefault();
  active.enterEditing();
  active.insertChars(text);
  canvas2d.requestRenderAll();
});

// 可用字體清單
const FONTS = [
  { id: '(中英)標準體',   label: '(中英)標準體',   preview: '頌禮Aa'  },
  { id: '(中)草寫體',    label: '(中)草寫體',    preview: '頌禮Aa'  },
  { id: '(中)童趣手寫體', label: '(中)童趣手寫體', preview: '頌禮Aa'  },
  { id: '(中)簡約手寫體', label: '(中)簡約手寫體', preview: '頌禮Aa'  },
  { id: '(英)書法體',    label: '(英)書法體',    preview: 'Songli' },
  { id: '(英)流線體',    label: '(英)流線體',    preview: 'Songli' },
  { id: '(英)簽名體',    label: '(英)簽名體',    preview: 'Songli' },
];

function init2DCanvas(productId) {
  currentProduct = PRODUCTS[productId];
  if (!currentProduct) return;

  if (canvas2d) { canvas2d.dispose(); canvas2d = null; }

  const el = document.getElementById('canvas-2d');
  if (!el) return;

  const containerW = el.parentElement.offsetWidth || 400;
  const isThermos  = currentProduct.id === 'thermos';
  const isMug = currentProduct.id === 'mug' || currentProduct.id === 'power_bank';
  const isThermosLike = isThermos || isMug;

  let cw, ch, _mdata = null;
  if (isThermos) {
    const _colorId = (typeof STATE !== 'undefined' && STATE.materialId) ? STATE.materialId : 'oat_tea';
    _mdata = (typeof MOCKUP_DATA !== 'undefined') ? MOCKUP_DATA[_colorId] : null;
    const _aspect  = _mdata ? (_mdata.H / _mdata.W) : 2.35;
    cw = Math.min(containerW - 40, 360);
    ch = Math.round(cw * _aspect);
  } else {
    const ratio = currentProduct.size.h / currentProduct.size.w;
    const _isPortraitCard = (currentProduct.id === 'biz_card'
      && typeof STATE !== 'undefined' && STATE.orientationId === 'portrait')
      || currentProduct.id === 'biz_thick'
      || currentProduct.id === 'biz_acrylic';
    if (_isPortraitCard) {
      // 直式卡：以高度為基準（與橫式 canvas 長邊相同）
      ch = Math.min(containerW - 40, 480);
      cw = Math.round(ch / ratio);
    } else {
      cw = Math.min(containerW - 40, 480);
      ch = Math.round(cw * ratio);
    }
  }

  el.width  = cw;
  el.height = ch;

  const isThick = currentProduct && (currentProduct.id === 'biz_thick' || currentProduct.id === 'biz_acrylic');
  canvas2d = new fabric.Canvas('canvas-2d', {
    width: cw, height: ch,
    backgroundColor: isThermosLike ? '#f0ece6' : (isThick ? null : '#ffffff')
  });

  const wrap = document.getElementById('canvas-2d-wrap');
  if (wrap) {
    if (isThick && canvas2d && canvas2d.wrapperEl) {
      canvas2d.wrapperEl.style.backgroundImage = 'linear-gradient(45deg, #e4e4e4 25%, transparent 25%), linear-gradient(-45deg, #e4e4e4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e4e4 75%), linear-gradient(-45deg, transparent 75%, #e4e4e4 75%)';
      canvas2d.wrapperEl.style.backgroundSize = '20px 20px';
      canvas2d.wrapperEl.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0';
      canvas2d.wrapperEl.style.backgroundColor = '#ffffff';
      canvas2d.wrapperEl.style.borderRadius = '12px';
      canvas2d.wrapperEl.style.boxShadow = '0 4px 24px rgba(0,0,0,0.12)';
      wrap.style.backgroundImage = '';
      wrap.style.backgroundColor = '';
    } else {
      if (canvas2d && canvas2d.wrapperEl) {
        canvas2d.wrapperEl.style.backgroundImage = '';
        canvas2d.wrapperEl.style.backgroundColor = '';
        canvas2d.wrapperEl.style.borderRadius = '';
        canvas2d.wrapperEl.style.boxShadow = '';
      }
      wrap.style.backgroundImage = '';
      wrap.style.backgroundColor = '';
    }
  }

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

  // 隨行杯文字：只允許等比例縮放，靜止時隱藏框線（拖曳時才顯示）
  const _applyThermosTextControls = obj => {
    if (!isThermosLike || !obj || obj.type !== 'textbox') return;
    obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    obj.set({ lockUniScaling: true, hasBorders: true });
  };

  canvas2d.on('selection:created', e => {
    // 隨行杯：選取時不顯示咖啡色虛線，只有拖曳中才顯示
    _showLabelBorder = !isThermosLike;
    canvas2d.requestRenderAll();
    const obj = e.selected?.[0] || canvas2d.getActiveObject();
    _applyThermosTextControls(obj);
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(obj);
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
    _syncRotateSlider(obj);
  });
  canvas2d.on('selection:updated', e => {
    _showLabelBorder = !isThermosLike;
    canvas2d.requestRenderAll();
    const obj = e.selected?.[0] || canvas2d.getActiveObject();
    _applyThermosTextControls(obj);
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(obj);
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
    _syncRotateSlider(obj);
  });
  canvas2d.on('selection:cleared', () => {
    _showLabelBorder = false; canvas2d.requestRenderAll();
    if (typeof _syncTextPropsPanel === 'function') _syncTextPropsPanel(null);
    if (typeof _hideFloatToolbar === 'function') _hideFloatToolbar();
  });
  canvas2d.on('object:scaling', e => {
    if (isThermosLike && e.target && e.target.type === 'textbox') e.target.set('hasBorders', true);
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
  });
  canvas2d.on('object:modified', e => {
    if (typeof _updateFloatToolbar === 'function') _updateFloatToolbar();
    _updateTextOpacity();
    // biz_lightbox：圖片移動／縮放後，依最終位置更新 clipPath
    // 使用距離比較：只有明顯靠近另一圓圈（超過兩圓距離 20%）才切換，避免鏡射/複製圖片誤判
    if (productId === 'biz_lightbox' && e.target && e.target.type === 'image') {
      const _w = canvas2d.getWidth();
      const _h = canvas2d.getHeight();
      const _leftCX  = _w * (71.4  / 348.2);
      const _rightCX = _w * (277.4 / 348.2);
      const _cy = _h * (74.6 / 145.2);
      const _r  = _w * (51 / 348.2);
      const _switchThreshold = (_rightCX - _leftCX) * 0.2;
      const _curClipCX = e.target.clipPath ? e.target.clipPath.left : null;
      const _dLeft  = Math.abs(e.target.left - _leftCX);
      const _dRight = Math.abs(e.target.left - _rightCX);
      let _nearCX;
      if (_curClipCX !== null) {
        const _curDist   = _curClipCX < _w / 2 ? _dLeft  : _dRight;
        const _otherDist = _curClipCX < _w / 2 ? _dRight : _dLeft;
        // 只有明顯更靠近另一側才切換
        _nearCX = (_otherDist < _curDist - _switchThreshold)
          ? (_curClipCX < _w / 2 ? _rightCX : _leftCX)
          : _curClipCX;
      } else {
        _nearCX = _dLeft <= _dRight ? _leftCX : _rightCX;
      }
      e.target.clipPath = new fabric.Circle({
        radius: _r, left: _nearCX, top: _cy,
        originX: 'center', originY: 'center',
        absolutePositioned: true
      });
    }
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
    // 隨行杯：文字橫向自動展開，不換行（手動 Enter 仍可換行）
    if (isThermosLike) {
      const obj = canvas2d.getActiveObject();
      if (obj && obj.type === 'textbox') {
        // 依目前字體與文字內容重新計算 padding
        const newPad = _normPadding(obj.fontFamily, obj.fontSize, 6, obj.text || '');
        obj.set('padding', newPad);
        obj.set('width', 10000);
        if (typeof obj.initDimensions === 'function') obj.initDimensions();
        let maxW = 0;
        const lines = obj._textLines || [];
        for (let i = 0; i < lines.length; i++) {
          const lw = obj.getLineWidth(i);
          if (lw > maxW) maxW = lw;
        }
        const margin = 3;
        const fittedW = Math.max(Math.ceil(maxW) + 2, Math.ceil(maxW) + 2 * margin - 2 * newPad);
        obj.set('width', fittedW);
        obj.setCoords();
      }
    }
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
    if (isThermosLike && obj.type === 'textbox') {
      obj.set('hasBorders', true);
      _showLabelBorder = true;
    }
    // 圓形皮革：圖片跨越兩圓中線時自動切換 clipPath，不限制邊界
    // 御守皮革／圓形小燈箱：圖片可自由移動，clip path 處理可見範圍，不限制邊界
    const _isLRoundImg = typeof STATE !== 'undefined'
      && STATE.productId === 'biz_leather_round'
      && obj.type === 'image';
    const _isOmamoriImg = typeof STATE !== 'undefined'
      && STATE.productId === 'biz_leather_omamori'
      && obj.type === 'image';
    const _isLbImg = typeof STATE !== 'undefined'
      && STATE.productId === 'biz_lightbox'
      && obj.type === 'image';
    if (_isLRoundImg) {
      const _W = canvas2d.getWidth(), _H = canvas2d.getHeight();
      const _WVB = 324.2, _HVB = 177.9, _RVB = 66.6;
      const _lCx = _W * (81.3  / _WVB), _lCy = _H * (97.2 / _HVB);
      const _rCx = _W * (242.6 / _WVB), _rCy = _H * (97.1 / _HVB);
      const _cr  = _W * (_RVB  / _WVB);
      const _toLeft = obj.left < _W / 2;
      const _newName = _toLeft ? 'round-left' : 'round-right';
      if (obj.name !== _newName) {
        obj.clipPath = new fabric.Circle({
          radius: _cr,
          left: _toLeft ? _lCx : _rCx,
          top:  _toLeft ? _lCy : _rCy,
          originX: 'center', originY: 'center',
          absolutePositioned: true
        });
        obj.name = _newName;
      }
    } else if (_isOmamoriImg) {
      // 御守圖片：跨越中線時自動切換 clipPath（左／右御守形狀）
      const _OW = canvas2d.getWidth(), _OH = canvas2d.getHeight();
      const _OWVB = 324.2, _OHVB = 261.6;
      const _toOLeft = obj.left < _OW / 2;
      const _newOName = _toOLeft ? 'omamori-left' : 'omamori-right';
      if (obj.name !== _newOName) {
        const _OPATH_L = 'M34.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1S103,22,105.9,25c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2L34.8,247.3L34.8,247.3z';
        const _OPATH_R = 'M196.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1c15,0,21.7,7.1,24.6,10.1c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2H196.8z';
        const _oCx = _toOLeft ? _OW * (81.35 / _OWVB) : _OW * (243.35 / _OWVB);
        const _oCy = _OH * (131.1 / _OHVB);
        obj.clipPath = new fabric.Path(_toOLeft ? _OPATH_L : _OPATH_R, {
          scaleX: _OW / _OWVB,
          scaleY: _OH / _OHVB,
          left: _oCx, top: _oCy,
          originX: 'center', originY: 'center',
          absolutePositioned: true
        });
        obj.name = _newOName;
      }
    } else if (_isLbImg) {
      // 不限制邊界，clip path 處理可見範圍
    } else if (!isThermosLike) {
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

  // ── 手動微調筆刷事件監聽 ──
  canvas2d.on('mouse:down', function(e) {
    if (typeof _brushMode !== 'undefined' && _brushMode) {
      _isBrushing = true;
      const pointer = canvas2d.getPointer(e.e);
      if (typeof _applyBrushAtPointer === 'function') _applyBrushAtPointer(pointer);
    }
  });
  canvas2d.on('mouse:move', function(e) {
    if (typeof _brushMode !== 'undefined' && _brushMode && typeof _isBrushing !== 'undefined' && _isBrushing) {
      const pointer = canvas2d.getPointer(e.e);
      if (typeof _applyBrushAtPointer === 'function') _applyBrushAtPointer(pointer);
    }
  });
  canvas2d.on('mouse:up', function() {
    if (typeof _brushMode !== 'undefined' && _brushMode && typeof _isBrushing !== 'undefined' && _isBrushing) {
      _isBrushing = false;
      if (typeof _saveHistory === 'function') _saveHistory();
    }
  });

  // 隨行杯：拖曳結束後隱藏咖啡色虛線
  if (isThermosLike) {
    canvas2d.on('mouse:up', () => {
      _showLabelBorder = false;
      canvas2d.requestRenderAll();
    });
  }

  // after:render — 有 labelArea 畫虛線印刷框（隨行杯僅選取時顯示）；其他畫圓角框
  canvas2d.on('after:render', function() {
    if (!currentProduct || _suppressOverlay) return;
    const ctx = canvas2d.contextContainer;
    const w   = canvas2d.getWidth();
    const h   = canvas2d.getHeight();

    // 隨行杯：在印刷範圍內補繪 100% 不透明（框外保持 35%，框內恢復全色）
    if (isThermosLike && currentProduct.labelArea) {
      const la = currentProduct.labelArea;
      const fadedObjs = canvas2d.getObjects().filter(o => o.selectable && o.opacity < 1);
      if (fadedObjs.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * la.xRatio, h * la.yRatio, w * la.wRatio, h * la.hRatio);
        ctx.clip();
        fadedObjs.forEach(obj => {
          const sav = obj.opacity;
          obj.opacity = 1;
          obj.render(ctx);
          obj.opacity = sav;
        });
        ctx.restore();
      }
    }

    // 虛線框（隨行杯僅選取時顯示）
    if (isThermosLike && !_showLabelBorder) return;
    if (currentProduct.id === 'biz_thick' || currentProduct.id === 'biz_acrylic') return;

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

    // 厚切票證：刀模輪廓（紅色虛線，跟隨圖片位置）
    if (_thickDieCutContour && typeof STATE !== 'undefined' && STATE.productId === 'biz_thick') {
      const imgObj = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
      if (imgObj) {
        const iW = imgObj.getScaledWidth();
        const iH = imgObj.getScaledHeight();
        const oX = imgObj.originX === 'center' ? imgObj.left - iW / 2 : imgObj.left;
        const oY = imgObj.originY === 'center' ? imgObj.top  - iH / 2 : imgObj.top;
        ctx.save();
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        _thickDieCutContour.forEach((pt, i) => {
          const px = oX + pt[0] * iW;
          const py = oY + pt[1] * iH;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
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
      canvas2d.setBackgroundImage(img, () => {
        const _savedJSON = (typeof STATE !== 'undefined') ? STATE.canvasJSON : null;
        if (_savedJSON && typeof loadCanvas2DJSON === 'function') {
          loadCanvas2DJSON(_savedJSON);
        } else {
          addDefaultElements();
        }
      });
    });
  } else if (currentProduct.id === 'power_bank') {
    // 星耀行動電源：載入對應顏色商品照作為 canvas 背景
    const _pbColorId = (typeof STATE !== 'undefined' && STATE.materialId) ? STATE.materialId : 'ice_white';
    const _pbMat = currentProduct.materials && currentProduct.materials.find(m => m.id === _pbColorId);
    const _pbSrc = _pbMat ? _pbMat.image : 'assets/power_bank/ice_white.png';
    fabric.Image.fromURL(_pbSrc, img => {
      if (!canvas2d) return;
      img.set({ scaleX: cw / img.width, scaleY: ch / img.height });
      canvas2d.setBackgroundImage(img, () => {
        const _savedJSON = (typeof STATE !== 'undefined') ? STATE.canvasJSON : null;
        if (_savedJSON && typeof loadCanvas2DJSON === 'function') {
          loadCanvas2DJSON(_savedJSON);
        } else {
          addDefaultElements();
        }
      });
    }, { crossOrigin: 'anonymous' });
  } else if (isMug) {
    // 馬克杯：載入對應顏色商品照作為 canvas 背景
    const _mugColorId = (typeof STATE !== 'undefined' && STATE.materialId) ? STATE.materialId : 'charcoal_mist';
    const _mugSrc = (typeof MUG_MOCKUP_DATA !== 'undefined' && MUG_MOCKUP_DATA[_mugColorId])
      ? MUG_MOCKUP_DATA[_mugColorId].src : null;
    if (_mugSrc) {
      fabric.Image.fromURL(_mugSrc, img => {
        if (!canvas2d) return;
        img.set({ scaleX: cw / img.width, scaleY: ch / img.height });
        canvas2d.setBackgroundImage(img, () => {
          const _savedJSON = (typeof STATE !== 'undefined') ? STATE.canvasJSON : null;
          if (_savedJSON && typeof loadCanvas2DJSON === 'function') {
            loadCanvas2DJSON(_savedJSON);
          } else {
            addDefaultElements();
          }
        });
      }, { crossOrigin: 'anonymous' });
    } else {
      const _savedJSON = (typeof STATE !== 'undefined') ? STATE.canvasJSON : null;
      if (_savedJSON && typeof loadCanvas2DJSON === 'function') {
        loadCanvas2DJSON(_savedJSON);
      } else {
        addDefaultElements();
      }
    }
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

// 計算標準化 padding：依實際字形像素高度（actualBoundingBox）讓選取框緊貼文字
// 允許負值 padding，使框線可內縮至實際字形範圍
function _normPadding(font, fontSize, basePad, textSample) {
  try {
    // 優先使用 Fabric canvas context（字體已確保載入）
    // 新建 <canvas> 不保證能存取 @font-face 自訂字體，會 fallback 成系統字體導致量測錯誤
    let _ctx, _savedFont;
    if (canvas2d && canvas2d.lowerCanvasEl) {
      _ctx = canvas2d.lowerCanvasEl.getContext('2d');
      _savedFont = _ctx.font;
      _ctx.font = `${fontSize}px "${font}"`;
    } else {
      _ctx = document.createElement('canvas').getContext('2d');
      _ctx.font = `${fontSize}px "${font}"`;
    }
    const isEn = font.startsWith('(英)');
    const sample = (textSample && textSample.trim())
      ? textSample
      : (isEn ? 'Happy Agpq' : '頌禮Ag');
    const m = _ctx.measureText(sample);
    if (_savedFont !== undefined) _ctx.font = _savedFont; // 還原 Fabric canvas 字體
    const actAsc = m.actualBoundingBoxAscent;
    const actDes = m.actualBoundingBoxDescent;
    if (typeof actAsc === 'number' && actAsc > 0) {
      const actualH = actAsc + actDes;
      const fabricH = fontSize * 1.3; // Fabric.js 預設 lineHeight
      const margin  = 3;              // 選取框在文字上下各留 3px
      return Math.round((actualH + 2 * margin - fabricH) / 2);
    }
    // Fallback：舊邏輯（瀏覽器不支援 actualBoundingBox 時）
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

  const isThermos = currentProduct && (currentProduct.id === 'thermos' || currentProduct.id === 'mug' || currentProduct.id === 'power_bank');
  const boxWidth = la ? w * la.wRatio * (isThermos ? 0.93 : 1.0) : w * 0.92;
  const textCenterX = la ? w * (la.xRatio + la.wRatio / 2) : w / 2;

  const _pad = _normPadding(font, size || defaultSize, 6, text);

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
    splitByGrapheme: !isThermos,
    editable: true,
    name: role,
    padding: _pad,
    lineHeight: 1.3
  });

  canvas2d.add(t);
  canvas2d.bringToFront(t);
  // 隨行杯：新增時立即套用等比例縮放限制，隱藏靜止框線
  if (isThermos) {
    t.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    t.set({ lockUniScaling: true, hasBorders: true });
  }
  canvas2d.setActiveObject(t);
  canvas2d.renderAll();
  // 調整文字框寬度，讓選取框緊貼文字（補償 padding 對選取框寬度的影響）
  // 目標：選取框寬 = maxW + 2×margin，即 t.width + 2×_pad = maxW + 2×margin
  if (t._textLines && t._textLines.length) {
    let maxW = 0;
    for (let i = 0; i < t._textLines.length; i++) {
      const lw = t.getLineWidth(i);
      if (lw > maxW) maxW = lw;
    }
    const margin   = 3;
    const baseW    = Math.ceil(maxW) + 2 * margin - 2 * _pad;
    const fittedW  = Math.max(Math.ceil(maxW) + 2, baseW);
    t.set('width', fittedW);
    t.setCoords();
    canvas2d.renderAll();
  }
  return t;
}

// ─── 上傳圖片 ────────────────────────────────────────────
function uploadImage2D(file) {
  if (!canvas2d || !file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _lastUploadedDataURL = e.target.result; // 保存原始圖片 URL，送出時使用
    _lastRembgDataURL    = null;            // 重新上傳時清除去背快取
    fabric.Image.fromURL(e.target.result, img => {
      const w = canvas2d.getWidth();
      const h = canvas2d.getHeight();

      const _isLeatherRound = typeof STATE !== 'undefined' && STATE.productId === 'biz_leather_round';
      const _isLeatherOmamori = typeof STATE !== 'undefined' && STATE.productId === 'biz_leather_omamori';
      const _isLightbox = typeof STATE !== 'undefined' && STATE.productId === 'biz_lightbox';
      const _isThick = typeof STATE !== 'undefined' && (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic');
      // 卡片上傳模式：圖片填滿虛線框，並裁切在框線範圍內
      const _isUploadOnly = typeof STATE !== 'undefined'
        && STATE.productId === 'biz_card' && (
          (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
          (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
        );

      if (_isLeatherRound) {
        // 雙圓版面（SVG viewBox 324.2×177.9）：左圓 cx=81.3，右圓 cx=242.6，半徑 66.6
        const W_VB = 324.2, H_VB = 177.9;
        const leftCx  = w * (81.3  / W_VB);
        const leftCy  = h * (97.2  / H_VB);
        const rightCx = w * (242.6 / W_VB);
        const rightCy = h * (97.1  / H_VB);
        const circleR = w * (66.6  / W_VB);
        // 自動判斷上傳到哪個圓：左圓空 → 左；左圓有了 → 右
        const existingLeft = canvas2d.getObjects().find(o => o.name === 'round-left');
        const slot = existingLeft ? 'right' : 'left';
        const cx = slot === 'left' ? leftCx : rightCx;
        const cy = slot === 'left' ? leftCy : rightCy;
        // 移除同位置舊圖
        const existingSlot = canvas2d.getObjects().find(o => o.name === 'round-' + slot);
        if (existingSlot) canvas2d.remove(existingSlot);
        const scale = Math.max((circleR * 2) / img.width, (circleR * 2) / img.height);
        img._roundBaseScale = scale;
        _uploadBaseScale = scale;
        img.set({
          left: cx, top: cy,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
          name: 'round-' + slot
        });
        img.clipPath = new fabric.Circle({
          radius: circleR,
          left: cx, top: cy,
          originX: 'center', originY: 'center',
          absolutePositioned: true
        });
        const _s = document.getElementById('zoom-slider');
        const _d = document.getElementById('zoom-value-display');
        if (_s) _s.value = 100;
        if (_d) _d.textContent = '100%';
      } else if (_isLightbox) {
        // 圓形小燈箱：偵測左圓是否已有圖，有則放右圓，否則放左圓
        const _leftCX  = w * (71.4  / 348.2);
        const _rightCX = w * (277.4 / 348.2);
        const _lbCy = h * (74.6 / 145.2);
        const r = w * (51 / 348.2);
        const _existingImgs = canvas2d.getObjects().filter(o => o.selectable && o.type === 'image');
        const _hasLeft = _existingImgs.some(o => {
          const ox = o.clipPath ? o.clipPath.left : o.left;
          return ox < w / 2;
        });
        const cx = _hasLeft ? _rightCX : _leftCX;
        const cy = _lbCy;
        const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
        _uploadBaseScale = scale;
        img.set({
          left: cx, top: cy,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale
        });
        img.clipPath = new fabric.Circle({
          radius: r,
          left: cx, top: cy,
          originX: 'center', originY: 'center',
          absolutePositioned: true
        });
        const _s = document.getElementById('zoom-slider');
        const _d = document.getElementById('zoom-value-display');
        if (_s) _s.value = 100;
        if (_d) _d.textContent = '100%';
      } else if (_isLeatherOmamori) {
        // 御守版面（SVG viewBox 324.2×261.6）：左右各一御守印刷區，第一張傳左、第二張傳右
        const W_VB = 324.2, H_VB = 261.6;
        const oPW = w * (133.1 / W_VB);
        const oPH = h * (232.4 / H_VB);
        const OMAMORI_L_PATH = 'M34.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1S103,22,105.9,25c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2L34.8,247.3L34.8,247.3z';
        const OMAMORI_R_PATH = 'M196.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1c15,0,21.7,7.1,24.6,10.1c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2H196.8z';
        const existingLeft = canvas2d.getObjects().find(o => o.name === 'omamori-left');
        const oSlot = existingLeft ? 'right' : 'left';
        const oName = `omamori-${oSlot}`;
        const existingSlot = canvas2d.getObjects().find(o => o.name === oName);
        if (existingSlot) canvas2d.remove(existingSlot);
        const oCx = oSlot === 'left' ? w * (81.35 / W_VB) : w * (243.35 / W_VB);
        const oCy = h * (131.1 / H_VB);
        const scale = Math.max(oPW / img.width, oPH / img.height);
        img._roundBaseScale = scale;
        _uploadBaseScale = scale;
        img.set({
          left: oCx, top: oCy,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
          name: oName
        });
        img.clipPath = new fabric.Path(oSlot === 'left' ? OMAMORI_L_PATH : OMAMORI_R_PATH, {
          scaleX: w / W_VB,
          scaleY: h / H_VB,
          left: oCx, top: oCy,
          originX: 'center', originY: 'center',
          absolutePositioned: true
        });
        const _s2 = document.getElementById('zoom-slider');
        const _d2 = document.getElementById('zoom-value-display');
        if (_s2) _s2.value = 100;
        if (_d2) _d2.textContent = '100%';
      } else if (_isThick) {
        // 厚切電子票證：裁切到圓角框範圍（viewBox 158.7×248.3，框邊 x=2.8,y=2.8，圓角半徑 ~9.3）
        const _tx  = w * (2.8 / 158.7);
        const _ty  = h * (2.8 / 248.3);
        const _tw  = w * (153.1 / 158.7);
        const _th  = h * (242.7 / 248.3);
        const scale = Math.min(_tw / img.width, _th / img.height);
        _uploadBaseScale = scale;
        img.set({
          left: w / 2, top: h / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
          lockMovementX: true, lockMovementY: true, lockRotation: true,
          hasControls: false, hasBorders: false
        });
        img.clipPath = new fabric.Rect({
          left: _tx, top: _ty,
          width: _tw, height: _th,
          rx: w * (9.3 / 158.7),
          ry: h * (9.3 / 248.3),
          absolutePositioned: true
        });
        const _s = document.getElementById('zoom-slider');
        const _d = document.getElementById('zoom-value-display');
        if (_s) _s.value = 100;
        if (_d) _d.textContent = '100%';
      } else if (_isUploadOnly) {
        // 黑色虛線框範圍：依方向選對應 SVG viewBox 尺寸
        const _portrait = typeof STATE !== 'undefined' && STATE.orientationId === 'portrait';
        const _vw = _portrait ? 170.1 : 259.7;
        const _vh = _portrait ? 259.7 : 170.1;
        const _rx = _portrait ? 167.2 : 256.8;
        const _ry = _portrait ? 256.8 : 167.2;
        const cx  = w * (2.8 / _vw);
        const cy  = h * (2.8 / _vh);
        const cw2 = w * ((_rx - 2.8) / _vw);
        const ch2 = h * ((_ry - 2.8) / _vh);
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

// ─── 圓形小燈箱：鏡射圖片到另一側 ──────────────────────────
// 以 canvas 目前截圖（已套用 clip）做水平翻轉，讓紅圈內的內容鏡射到另一側
function mirrorLightboxImage() {
  if (!canvas2d) return;
  const w = canvas2d.getWidth();
  const h = canvas2d.getHeight();
  const leftCX  = w * (71.4  / 348.2);
  const rightCX = w * (277.4 / 348.2);
  const cy = h * (74.6 / 145.2);
  const r  = w * (51 / 348.2);

  const images = canvas2d.getObjects().filter(o => o.selectable && o.type === 'image');
  if (images.length === 0) return;

  const activeObj = canvas2d.getActiveObject();
  const srcImg = (activeObj && activeObj.type === 'image') ? activeObj : images[0];

  const srcIsLeft = srcImg.clipPath
    ? srcImg.clipPath.left < w / 2
    : srcImg.left < w / 2;
  const srcCX = srcIsLeft ? leftCX : rightCX;
  const targetCX = srcIsLeft ? rightCX : leftCX;

  // 移除目標側舊圖
  images
    .filter(o => o !== srcImg)
    .filter(o => {
      const oIsLeft = o.clipPath ? o.clipPath.left < w / 2 : o.left < w / 2;
      return oIsLeft !== srcIsLeft;
    })
    .forEach(o => canvas2d.remove(o));

  // 直接 clone 原圖物件，鏡射位置並翻轉 flipX（不用整張 canvas 截圖）
  srcImg.clone(cloned => {
    const dx = srcImg.left - srcCX;
    cloned.set({
      left: targetCX - dx,
      top: srcImg.top,
      scaleX: srcImg.scaleX,
      scaleY: srcImg.scaleY,
      flipX: !srcImg.flipX,
      flipY: srcImg.flipY,
      originX: 'center',
      originY: 'center'
    });
    cloned.clipPath = new fabric.Circle({
      radius: r, left: targetCX, top: cy,
      originX: 'center', originY: 'center',
      absolutePositioned: true
    });
    canvas2d.add(cloned);
    canvas2d.setActiveObject(cloned);
    canvas2d.renderAll();
    if (typeof _saveHistory === 'function') _saveHistory();
  });
}

// ─── 圓形小燈箱：複製圖片到另一側（不翻轉）──────────────────
function copyLightboxImage() {
  if (!canvas2d) return;
  const w = canvas2d.getWidth();
  const h = canvas2d.getHeight();
  const leftCX  = w * (71.4  / 348.2);
  const rightCX = w * (277.4 / 348.2);
  const cy = h * (74.6 / 145.2);
  const r  = w * (51 / 348.2);

  const images = canvas2d.getObjects().filter(o => o.selectable && o.type === 'image');
  if (images.length === 0) return;

  const activeObj = canvas2d.getActiveObject();
  const srcImg = (activeObj && activeObj.type === 'image') ? activeObj : images[0];
  const srcIsLeft = srcImg.clipPath
    ? srcImg.clipPath.left < w / 2
    : srcImg.left < w / 2;
  const targetCX = srcIsLeft ? rightCX : leftCX;

  // 移除目標側舊圖
  images
    .filter(o => o !== srcImg)
    .filter(o => {
      const oIsLeft = o.clipPath ? o.clipPath.left < w / 2 : o.left < w / 2;
      return oIsLeft !== srcIsLeft;
    })
    .forEach(o => canvas2d.remove(o));

  // 直接 clone 原圖物件，等距平移到目標圓圈（不用整張 canvas 截圖）
  const srcCX = srcIsLeft ? leftCX : rightCX;
  srcImg.clone(cloned => {
    const dx = srcImg.left - srcCX;
    cloned.set({
      left: targetCX + dx,
      top: srcImg.top,
      scaleX: srcImg.scaleX,
      scaleY: srcImg.scaleY,
      flipX: srcImg.flipX,
      flipY: srcImg.flipY,
      originX: 'center',
      originY: 'center'
    });
    cloned.clipPath = new fabric.Circle({
      radius: r, left: targetCX, top: cy,
      originX: 'center', originY: 'center',
      absolutePositioned: true
    });
    canvas2d.add(cloned);
    canvas2d.setActiveObject(cloned);
    canvas2d.renderAll();
    if (typeof _saveHistory === 'function') _saveHistory();
  });
}

// ─── 背景色 ──────────────────────────────────────────────
function setBackground2D(color) {
  if (!canvas2d) return;
  if (currentProduct && currentProduct.id === 'biz_thick') return;
  canvas2d.setBackgroundColor(color, canvas2d.renderAll.bind(canvas2d));
}

// ─── 隨行杯：文字超出 labelArea 時降低不透明度至 35% ──────────────
// 直接用 getBoundingRect()（已含 padding 校正），判斷 selection box 是否超出邊界
function _updateTextOpacity() {
  if (!canvas2d || !currentProduct || !currentProduct.labelArea) return;
  const isTh = currentProduct && (currentProduct.id === 'thermos' || currentProduct.id === 'mug' || currentProduct.id === 'power_bank');
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
let _cachedCardPortraitFrameImg = null;
let _cachedLeatherRoundEasycardFrameImg = null;
let _cachedLeatherRoundIpassFrameImg = null;
let _cachedLeatherOmamoriEasycardFrameImg = null;
let _cachedLeatherOmamoriIpassFrameImg = null;
let _cachedLightboxFrameImg = null;
let _cachedThickFrameImg = null;
let _cachedAcrylicFrameImg = null;
var _thickDieCutContour = null;   // 刀模正規化輪廓 [[nx,ny],...]
var _lastRembgDataURL   = null;   // 去背後的 canvas 圖片（含 FIXED_PAD 白邊，只設一次）
var _lastUploadedDataURL = null;

// 卡片橫式上傳模式：回傳向量 SVG（照片為 <image>，紅框+虛線為獨立向量路徑）
// viewBox 259.7×170.1 pt = 91.6×60 mm（含出血），路徑取自 card_landscape_frame.svg
function getUploadOnlySVG() {
  if (!_lastUploadedDataURL) return null;
  const isPortrait = typeof STATE !== 'undefined' && STATE.orientationId === 'portrait';
  // 卡片型電子票證：預先裁切到印刷區，圖片直接嵌入於 x=2.8,y=2.8，不依賴 SVG clip-path
  if (isPortrait) {
    const _w = canvas2d ? canvas2d.getWidth() : 314;
    const _h = canvas2d ? canvas2d.getHeight() : 480;
    const _crop = { left: _w*(2.8/170.1), top: _h*(2.8/259.7), width: _w*(164.4/170.1), height: _h*(254/259.7) };
    const _canvasDataURL = (typeof get2DDataURL === 'function' && get2DDataURL(2.5, _crop)) || _lastUploadedDataURL;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 170.1 259.7" width="60mm" height="91.6mm">
<style>.st0{fill:none;stroke:#E60012;stroke-miterlimit:10;}.st1{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;}.st2{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.0813,5.0813;}.st3{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.1404,5.1404;}</style>
<image xlink:href="${_canvasDataURL}" x="2.8" y="2.8" width="164.4" height="254" preserveAspectRatio="none"/>
<g>
<path class="st0" d="M17.8,251.1c-5.2,0-9.3-4.2-9.3-9.3v-224c0-5.2,4.2-9.3,9.3-9.3h134.4c5.2,0,9.3,4.2,9.3,9.3v224c0,5.2-4.2,9.3-9.3,9.3H17.8z"/>
<g><g>
<polyline class="st1" points="5.3,256.8 2.8,256.8 2.8,254.3"/>
<line class="st2" x1="2.8" y1="249.2" x2="2.8" y2="7.9"/>
<polyline class="st1" points="2.8,5.3 2.8,2.8 5.3,2.8"/>
<line class="st3" x1="10.5" y1="2.8" x2="162.2" y2="2.8"/>
<polyline class="st1" points="164.7,2.8 167.2,2.8 167.2,5.3"/>
<line class="st2" x1="167.2" y1="10.4" x2="167.2" y2="251.8"/>
<polyline class="st1" points="167.2,254.3 167.2,256.8 164.7,256.8"/>
<line class="st3" x1="159.6" y1="256.8" x2="7.9" y2="256.8"/>
</g></g>
</g>
</svg>`;
  }
  // 橫式
  const _w = canvas2d ? canvas2d.getWidth() : 480;
  const _h = canvas2d ? canvas2d.getHeight() : 314;
  const _crop = { left: _w*(2.8/259.7), top: _h*(2.8/170.1), width: _w*(254/259.7), height: _h*(164.4/170.1) };
  const _landscapeDataURL = (typeof get2DDataURL === 'function' && get2DDataURL(2.5, _crop)) || _lastUploadedDataURL;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 259.7 170.1" width="91.6mm" height="60mm">
<style>.st0{fill:none;stroke:#E60012;stroke-miterlimit:10;}.st1{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;}.st2{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.0813,5.0813;}.st3{fill:none;stroke:#3E3A39;stroke-width:0.25;stroke-miterlimit:10;stroke-dasharray:5.1404,5.1404;}</style>
<image xlink:href="${_landscapeDataURL}" x="2.8" y="2.8" width="254" height="164.4" preserveAspectRatio="none"/>
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

// 圓形皮革上傳模式：左右圓各自裁切為純圖片圖層，框線+票卡 logo 單獨圖層（從材質 SVG 內嵌）
async function getUploadOnlyRoundSVG() {
  if (!canvas2d) return null;
  const W_VB = 324.2, H_VB = 177.9, R_VB = 66.6;
  const logW = canvas2d.getWidth(), logH = canvas2d.getHeight();
  // SCALE=3.28：480px canvas → 1574px，圓直徑≈647px → 47mm@~350DPI
  const SCALE = 3.28;

  // 一次高解析渲染，兩圓共用
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  canvas2d.discardActiveObject();
  _suppressOverlay = true;
  const origBg    = canvas2d.backgroundColor;
  const origBgImg = canvas2d.backgroundImage || null;
  canvas2d.backgroundColor = 'rgba(0,0,0,0)';
  canvas2d.backgroundImage = null;
  const hiResURL = canvas2d.toDataURL({ multiplier: SCALE, format: 'png' });
  canvas2d.backgroundColor = origBg;
  canvas2d.backgroundImage = origBgImg;
  _suppressOverlay = false;
  bgObjs.forEach(o => o.set('visible', true));
  canvas2d.renderAll();

  // 載入高解析圖後裁切兩圓
  const hiResImg = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = hiResURL;
  });

  function _cropCircle(cx_vb, cy_vb) {
    const cx_px = Math.round(logW * (cx_vb / W_VB) * SCALE);
    const cy_px = Math.round(logH * (cy_vb / H_VB) * SCALE);
    const r_px  = Math.round(logW * (R_VB  / W_VB) * SCALE);
    const sd = r_px * 2;
    const tmp = document.createElement('canvas');
    tmp.width  = sd; tmp.height = sd;
    const ctx  = tmp.getContext('2d');
    ctx.beginPath();
    ctx.arc(sd / 2, sd / 2, sd / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(hiResImg, cx_px - r_px, cy_px - r_px, sd, sd, 0, 0, sd, sd);
    return tmp.toDataURL('image/png');
  }

  const leftURL  = _cropCircle(81.3,  97.2);
  const rightURL = _cropCircle(242.6, 97.1);
  const lx = 81.3  - R_VB, ly = 97.2 - R_VB;
  const rx = 242.6 - R_VB, ry = 97.1 - R_VB;
  const d  = R_VB * 2;

  // 非同步載入材質框線 SVG，含票卡 logo 向量，作為獨立 frame 圖層
  const matId = typeof STATE !== 'undefined' ? STATE.materialId : 'easycard';
  const frameSrc = matId === 'ipass'
    ? 'assets/leather_round_ipass_frame.svg'
    : 'assets/leather_round_easycard_frame.svg';
  let frameInner = '';
  try {
    const resp = await fetch(frameSrc);
    if (resp.ok) {
      const txt = await resp.text();
      const m = txt.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      if (m) frameInner = m[1];
    }
  } catch(e) { console.warn('[getUploadOnlyRoundSVG] frame fetch failed', e); }

  // Fallback：只有框線路徑（無票卡 logo）
  if (!frameInner) {
    frameInner = `<style>.fr0{fill:none;stroke:#000;stroke-miterlimit:10;}.fr1{fill:none;stroke:#000;stroke-width:.8;stroke-miterlimit:10;stroke-dasharray:3;}.fr2{fill:none;stroke:#E71F19;stroke-miterlimit:10;stroke-dasharray:4.809,4.8095;}</style>
<path class="fr0" d="M81.3,33.4c3.3,0,6.5,.2,9.6,.7V14.8H71.6v19.3C74.8,33.7,78,33.4,81.3,33.4z"/>
<path class="fr1" d="M139.4,97.2c0,32.1-26,58.1-58.1,58.1s-58.1-26-58.1-58.1s26-58.1,58.1-58.1S139.4,65.1,139.4,97.2z"/>
<path class="fr0" d="M145.1,97.2c0,35.2-28.6,63.8-63.8,63.8s-63.8-28.6-63.8-63.8s28.6-63.8,63.8-63.8S145.1,62,145.1,97.2z"/>
<circle class="fr2" cx="81.3" cy="97.2" r="66.6"/>
<path class="fr0" d="M242.6,33.3c3.3,0,6.5,.2,9.6,.7V14.8H233v19.3C236.1,33.6,239.3,33.3,242.6,33.3z"/>
<path class="fr1" d="M300.7,97.1c0,32.1-26,58.1-58.1,58.1c-32.1,0-58.1-26-58.1-58.1c0-32.1,26-58.1,58.1-58.1C274.7,39,300.7,65,300.7,97.1z"/>
<path class="fr0" d="M306.4,97.1c0,35.2-28.6,63.8-63.8,63.8c-35.2,0-63.8-28.6-63.8-63.8c0-35.2,28.6-63.8,63.8-63.8C277.8,33.3,306.4,61.9,306.4,97.1z"/>
<circle class="fr2" cx="242.6" cy="97.1" r="66.6"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W_VB} ${H_VB}" width="114.4mm" height="62.8mm">
<g id="left-circle"><image xlink:href="${leftURL}" x="${lx}" y="${ly}" width="${d}" height="${d}"/></g>
<g id="right-circle"><image xlink:href="${rightURL}" x="${rx}" y="${ry}" width="${d}" height="${d}"/></g>
<g id="frame">${frameInner}</g>
</svg>`;
}

// 御守皮革上傳模式：全畫布截圖，左右各以御守 clipPath 裁切，框線單獨圖層
async function getUploadOnlyOmamoriSVG() {
  if (!canvas2d) return null;
  const W_VB = 324.2, H_VB = 261.6;

  function _getDesignCanvas() {
    const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
    bgObjs.forEach(o => o.set('visible', false));
    canvas2d.discardActiveObject();
    _suppressOverlay = true;
    const origBg    = canvas2d.backgroundColor;
    const origBgImg = canvas2d.backgroundImage || null;
    canvas2d.backgroundColor = 'rgba(0,0,0,0)';
    canvas2d.backgroundImage = null;
    canvas2d.renderAll();
    // 350 DPI：canvas 顯示約 480px，物理寬 114.4mm=4.504"，4.504×350÷480≈3.28 → 輸出約 1576px ≈ 350 DPI
    const dataURL = canvas2d.toDataURL({ format: 'png', multiplier: 3.28 });
    canvas2d.backgroundColor = origBg;
    canvas2d.backgroundImage = origBgImg;
    _suppressOverlay = false;
    bgObjs.forEach(o => o.set('visible', true));
    canvas2d.renderAll();
    return dataURL;
  }

  const designURL = _getDesignCanvas();
  const OMAMORI_L_PATH = 'M34.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1S103,22,105.9,25c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2L34.8,247.3L34.8,247.3z';
  const OMAMORI_R_PATH = 'M196.8,247.3c-10.3,0-20-9.4-20-19.2V69.7c0-10,3.5-17.9,9.5-21.7c3.1-2,7.5-3.8,11.6-5.5c3.3-1.4,6.5-2.7,8.4-3.9c2.7-1.6,6.4-6.3,9-9.6c1.3-1.6,2.4-3.1,3.3-4c2.9-3.1,9.7-10.1,24.7-10.1c15,0,21.7,7.1,24.6,10.1c0.9,1,2.1,2.4,3.4,4.1c2.7,3.4,6.3,8,9.1,9.6c1.9,1.2,5.1,2.5,8.4,3.9c4.2,1.7,8.5,3.5,11.6,5.5c6.1,3.8,9.5,11.7,9.5,21.7v158.4c0,9.9-9.7,19.2-20,19.2H196.8z';

  const matId = typeof STATE !== 'undefined' ? STATE.materialId : 'easycard';
  const frameSrc = matId === 'ipass'
    ? 'assets/leather_omamori_ipass_frame.svg'
    : 'assets/leather_omamori_easycard_frame.svg';
  let frameInner = '';
  try {
    const resp = await fetch(frameSrc);
    if (resp.ok) {
      const txt = await resp.text();
      const m = txt.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      if (m) frameInner = m[1];
    }
  } catch(e) { console.warn('[getUploadOnlyOmamoriSVG] frame fetch failed', e); }

  // fallback：抽出 style 塊，視覺路徑保留
  let fallbackStyle = '';
  let fallbackVisual = '';
  if (!frameInner) {
    fallbackStyle = '<style>.fo0{fill:none;stroke:#231815;stroke-width:1.5;stroke-miterlimit:10;}.fo1{fill:none;stroke:#E60012;stroke-miterlimit:10;stroke-dasharray:8;}</style>';
    fallbackVisual = `<path class="fo1" d="${OMAMORI_L_PATH}"/><path class="fo1" d="${OMAMORI_R_PATH}"/>`;
  }

  // 從 frameInner 提取 <style> 與 <defs> 提升到 SVG 根層級
  // Illustrator 嚴格要求 <style>/<defs> 不能在 <g> 內
  const frameStyles = frameInner
    ? (frameInner.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('')
    : fallbackStyle;
  const frameDefs = frameInner
    ? (frameInner.match(/<defs[^>]*>([\s\S]*?)<\/defs>/gi) || [])
        .map(d => d.replace(/<\/?defs[^>]*>/gi, '')).join('')
    : '';
  const frameContent = frameInner
    ? frameInner
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')
        .trim()
    : fallbackVisual;

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W_VB} ${H_VB}" width="114.4mm" height="92.3mm">
${frameStyles}
<defs>
  <clipPath id="omamori-left-clip"><path d="${OMAMORI_L_PATH}"/></clipPath>
  <clipPath id="omamori-right-clip"><path d="${OMAMORI_R_PATH}"/></clipPath>
  ${frameDefs}
</defs>
<g id="design-left"><image xlink:href="${designURL}" x="0" y="0" width="${W_VB}" height="${H_VB}" clip-path="url(#omamori-left-clip)"/></g>
<g id="design-right"><image xlink:href="${designURL}" x="0" y="0" width="${W_VB}" height="${H_VB}" clip-path="url(#omamori-right-clip)"/></g>
<g id="frame">${frameContent}</g>
</svg>`;
}

// 圓形小燈箱上傳模式：左右圓各自裁切為純圖片圖層，框線路徑單獨圖層
// viewBox 348.2×145.2，左圓心 71.4,74.6 右圓心 277.4,74.6 印刷半徑 51
async function getUploadOnlyLightboxSVG() {
  if (!canvas2d) return null;
  const W_VB = 348.2, H_VB = 145.2, R_VB = 51;
  const logW = canvas2d.getWidth(), logH = canvas2d.getHeight();

  // 以 4x 高解析度渲染後裁切圓形，圓直徑~562px → 36mm @ ~397 DPI
  function _cropCircle(cx_vb, cy_vb) {
    return new Promise(resolve => {
      const SCALE  = 4;
      const cx_log = logW * (cx_vb / W_VB);
      const cy_log = logH * (cy_vb / H_VB);
      const r_log  = logW * (R_VB  / W_VB);
      const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
      bgObjs.forEach(o => o.set('visible', false));
      canvas2d.discardActiveObject();
      _suppressOverlay = true;
      const origBg    = canvas2d.backgroundColor;
      const origBgImg = canvas2d.backgroundImage || null;
      canvas2d.backgroundColor = 'rgba(0,0,0,0)';
      canvas2d.backgroundImage = null;
      const hiResURL = canvas2d.toDataURL({ multiplier: SCALE, format: 'png' });
      canvas2d.backgroundColor = origBg;
      canvas2d.backgroundImage = origBgImg;
      _suppressOverlay = false;
      bgObjs.forEach(o => o.set('visible', true));
      canvas2d.renderAll();
      const img = new Image();
      img.onload = () => {
        const cx_px = Math.round(cx_log * SCALE);
        const cy_px = Math.round(cy_log * SCALE);
        const r_px  = Math.round(r_log  * SCALE);
        const sd = r_px * 2;
        const tmp = document.createElement('canvas');
        tmp.width  = sd; tmp.height = sd;
        const ctx  = tmp.getContext('2d');
        ctx.beginPath();
        ctx.arc(sd / 2, sd / 2, sd / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, cx_px - r_px, cy_px - r_px, sd, sd, 0, 0, sd, sd);
        resolve(tmp.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = hiResURL;
    });
  }

  const leftURL  = await _cropCircle(71.4, 74.6);
  const rightURL = await _cropCircle(277.4, 74.6);
  const lx = (71.4  - R_VB).toFixed(1);
  const ly = (74.6  - R_VB).toFixed(1);
  const rx = (277.4 - R_VB).toFixed(1);
  const ry = (74.6  - R_VB).toFixed(1);
  const d  = (R_VB * 2).toFixed(1);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 348.2 145.2">
<style>.st2{fill:#1F1E1D;stroke:#000000;stroke-width:0.75;}.st3{fill:url(#SVGID_5_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st4{fill:url(#SVGID_6_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st5{fill:url(#SVGID_7_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st6{opacity:0.5;fill:url(#SVGID_8_);enable-background:new;}.st7{opacity:0.5;fill:url(#SVGID_9_);enable-background:new;}.st8{fill:#F7F8F8;stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st9{fill:#FFFFFF;stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st10{fill:url(#SVGID_10_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st11{fill:url(#SVGID_11_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st12{fill:url(#SVGID_12_);stroke:#B5B5B6;stroke-width:0.5;stroke-miterlimit:10;}.st13{opacity:0.5;fill:url(#SVGID_13_);enable-background:new;}.st14{opacity:0.5;fill:url(#SVGID_14_);enable-background:new;}.st15{fill:none;stroke:#E60012;stroke-width:0.7105;}</style>
<defs>
<linearGradient id="SVGID_5_" gradientUnits="userSpaceOnUse" x1="176.0893" y1="330.6606" x2="176.0893" y2="427.3789" gradientTransform="matrix(-1 0 0 1 358.4922 -304.9051)"><stop offset="1.4e-07" style="stop-color:#DCDDDD"/><stop offset="0.0578" style="stop-color:#F4F4F4"/><stop offset="0.1833" style="stop-color:#F4F4F4"/><stop offset="0.9521" style="stop-color:#F4F4F4"/><stop offset="0.9592" style="stop-color:#F9F9F9"/><stop offset="0.9742" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_6_" gradientUnits="userSpaceOnUse" x1="147.3893" y1="398.4865" x2="147.3893" y2="409.9677" gradientTransform="matrix(-1 0 0 1 358.4922 -304.9051)"><stop offset="0" style="stop-color:#DCDDDD"/><stop offset="0.0415" style="stop-color:#E1E2E2"/><stop offset="0.2017" style="stop-color:#EFF0F0"/><stop offset="0.3854" style="stop-color:#F9F9F9"/><stop offset="0.6109" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_7_" gradientUnits="userSpaceOnUse" x1="147.3893" y1="346.5735" x2="147.3893" y2="358.0992" gradientTransform="matrix(-1 0 0 1 358.4922 -304.9051)"><stop offset="0" style="stop-color:#DCDDDD"/><stop offset="0.0415" style="stop-color:#E1E2E2"/><stop offset="0.2017" style="stop-color:#EFF0F0"/><stop offset="0.3854" style="stop-color:#F9F9F9"/><stop offset="0.6109" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_8_" gradientUnits="userSpaceOnUse" x1="128.3769" y1="405.0235" x2="146.3756" y2="405.0235" gradientTransform="matrix(-1 0 0 1 358.4922 -304.9051)"><stop offset="1.4e-07" style="stop-color:#C9CACA"/><stop offset="0.2387" style="stop-color:#CCCDCD;stop-opacity:0.7613"/><stop offset="0.463" style="stop-color:#D5D5D6;stop-opacity:0.537"/><stop offset="0.6814" style="stop-color:#E3E3E3;stop-opacity:0.3186"/><stop offset="0.8949" style="stop-color:#F5F5F6;stop-opacity:0.1051"/><stop offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>
<linearGradient id="SVGID_9_" gradientUnits="userSpaceOnUse" x1="128.3769" y1="353.9734" x2="146.3756" y2="353.9734" gradientTransform="matrix(-1 0 0 1 358.4922 -304.9051)"><stop offset="1.4e-07" style="stop-color:#C9CACA"/><stop offset="0.2387" style="stop-color:#CCCDCD;stop-opacity:0.7613"/><stop offset="0.463" style="stop-color:#D5D5D6;stop-opacity:0.537"/><stop offset="0.6814" style="stop-color:#E3E3E3;stop-opacity:0.3186"/><stop offset="0.8949" style="stop-color:#F5F5F6;stop-opacity:0.1051"/><stop offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>
<linearGradient id="SVGID_10_" gradientUnits="userSpaceOnUse" x1="251.4424" y1="330.6606" x2="251.4424" y2="427.3789" gradientTransform="matrix(1 0 0 1 -85.0395 -304.9051)"><stop offset="1.4e-07" style="stop-color:#DCDDDD"/><stop offset="0.0578" style="stop-color:#F4F4F4"/><stop offset="0.1833" style="stop-color:#F4F4F4"/><stop offset="0.9521" style="stop-color:#F4F4F4"/><stop offset="0.9592" style="stop-color:#F9F9F9"/><stop offset="0.9742" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_11_" gradientUnits="userSpaceOnUse" x1="222.7424" y1="398.4865" x2="222.7424" y2="409.9677" gradientTransform="matrix(1 0 0 1 -85.0395 -304.9051)"><stop offset="0" style="stop-color:#DCDDDD"/><stop offset="0.0415" style="stop-color:#E1E2E2"/><stop offset="0.2017" style="stop-color:#EFF0F0"/><stop offset="0.3854" style="stop-color:#F9F9F9"/><stop offset="0.6109" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_12_" gradientUnits="userSpaceOnUse" x1="222.7424" y1="346.5735" x2="222.7424" y2="358.0992" gradientTransform="matrix(1 0 0 1 -85.0395 -304.9051)"><stop offset="0" style="stop-color:#DCDDDD"/><stop offset="0.0415" style="stop-color:#E1E2E2"/><stop offset="0.2017" style="stop-color:#EFF0F0"/><stop offset="0.3854" style="stop-color:#F9F9F9"/><stop offset="0.6109" style="stop-color:#FEFEFE"/><stop offset="1" style="stop-color:#FFFFFF"/></linearGradient>
<linearGradient id="SVGID_13_" gradientUnits="userSpaceOnUse" x1="203.67" y1="405.0235" x2="221.6686" y2="405.0235" gradientTransform="matrix(1 0 0 1 -85.0395 -304.9051)"><stop offset="1.4e-07" style="stop-color:#C9CACA"/><stop offset="0.2387" style="stop-color:#CCCDCD;stop-opacity:0.7613"/><stop offset="0.463" style="stop-color:#D5D5D6;stop-opacity:0.537"/><stop offset="0.6814" style="stop-color:#E3E3E3;stop-opacity:0.3186"/><stop offset="0.8949" style="stop-color:#F5F5F6;stop-opacity:0.1051"/><stop offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>
<linearGradient id="SVGID_14_" gradientUnits="userSpaceOnUse" x1="203.67" y1="354.0235" x2="221.6686" y2="354.0235" gradientTransform="matrix(1 0 0 1 -85.0395 -304.9051)"><stop offset="1.4e-07" style="stop-color:#C9CACA"/><stop offset="0.2387" style="stop-color:#CCCDCD;stop-opacity:0.7613"/><stop offset="0.463" style="stop-color:#D5D5D6;stop-opacity:0.537"/><stop offset="0.6814" style="stop-color:#E3E3E3;stop-opacity:0.3186"/><stop offset="0.8949" style="stop-color:#F5F5F6;stop-opacity:0.1051"/><stop offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>
</defs>
<g>
<rect x="273.2" y="15.1" class="st2" width="2.8" height="5.7"/>
<polygon class="st3" points="178.2,25 186.7,25 186.7,124.2 178.2,124.2"/>
<polygon class="st4" points="186.7,93 235.6,93 235.6,107.2 186.7,107.2"/>
<polygon class="st5" points="186.7,42 235.6,42 235.6,56.1 186.7,56.1"/>
<polygon class="st6" points="233.5,93 210.2,93 210.2,107.2 233.5,107.2"/>
<polygon class="st7" points="233.5,42 210.2,42 210.2,56.1 233.5,56.1"/>
<circle class="st8" cx="277.4" cy="74.6" r="56.7"/>
<circle class="st9" cx="277.4" cy="74.6" r="53.9"/>
</g>
<g>
<rect x="72.9" y="15" class="st2" width="2.8" height="5.7"/>
<rect x="162.2" y="25" class="st10" width="8.5" height="99.2"/>
<rect x="113.3" y="93" class="st11" width="48.9" height="14.2"/>
<rect x="113.3" y="42" class="st12" width="48.9" height="14.2"/>
<rect x="115.3" y="93" class="st13" width="23.4" height="14.2"/>
<rect x="115.3" y="42" class="st14" width="23.4" height="14.2"/>
<circle class="st8" cx="71.4" cy="74.6" r="56.7"/>
<circle class="st9" cx="71.4" cy="74.6" r="53.9"/>
</g>
<image xlink:href="${leftURL}" x="${lx}" y="${ly}" width="${d}" height="${d}" preserveAspectRatio="none"/>
<image xlink:href="${rightURL}" x="${rx}" y="${ry}" width="${d}" height="${d}" preserveAspectRatio="none"/>
<circle class="st15" cx="71.4" cy="74.6" r="51"/>
<circle class="st15" cx="277.4" cy="74.6" r="51"/>
</svg>`;
}

// 厚切電子票證：將刀模輪廓轉為 SVG path（viewBox 158.7×248.3）
// 吊飾孔採「細頸凸出 tab」設計（同 _drawDiecutWithHole）
function _thickDiecutToSVGPath() {
  if (!_thickDieCutContour || !canvas2d) return '';
  const imgObj = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
  if (!imgObj) return '';
  const cW = canvas2d.getWidth(), cH = canvas2d.getHeight();
  const vW = 158.7, vH = 248.3;
  const tm = imgObj.calcTransformMatrix();
  const w  = imgObj.width, h = imgObj.height;
  const pts = _thickDieCutContour.map(pt => {
    const lx = (pt[0] - 0.5) * w;
    const ly = (pt[1] - 0.5) * h;
    const cx = tm[0]*lx + tm[2]*ly + tm[4];
    const cy = tm[1]*lx + tm[3]*ly + tm[5];
    return [cx / cW * vW, cy / cH * vH];
  });
  if (pts.length < 3) return '';

  const n      = pts.length;
  const mmSVG  = vW / 54;
  const outerR = 4   * mmSVG;
  const innerR = 1.5 * mmSVG;
  const neckH  = 3   * mmSVG;
  const neckHW = innerR;
  const sqrtD  = Math.sqrt(outerR * outerR - innerR * innerR);
  const minY   = Math.min(...pts.map(p => p[1]));
  const minX   = Math.min(...pts.map(p => p[0]));
  const maxX   = Math.max(...pts.map(p => p[0]));
  const hx     = (minX + maxX) / 2;
  const holeCy = minY - neckH - sqrtD;
  const yConn  = minY - neckH;  // 細頸頂端 = holeCy + sqrtD

  // 找細頸底端輪廓點
  let leftIdx = 0, rightIdx = 0;
  let ld = Infinity, rd = Infinity;
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const dl = Math.hypot(px - (hx - neckHW), py - minY);
    const dr = Math.hypot(px - (hx + neckHW), py - minY);
    if (dl < ld) { ld = dl; leftIdx = i; }
    if (dr < rd) { rd = dr; rightIdx = i; }
  }

  // fallback：獨立輪廓 + 外圓 + 內孔
  if (leftIdx === rightIdx) {
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
      const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
      d += `C${(p1[0]+(p2[0]-p0[0])/6).toFixed(2)},${(p1[1]+(p2[1]-p0[1])/6).toFixed(2)} `+
           `${(p2[0]-(p3[0]-p1[0])/6).toFixed(2)},${(p2[1]-(p3[1]-p1[1])/6).toFixed(2)} `+
           `${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return `<path fill="none" stroke="#000000" stroke-width="0.5" d="${d}Z"/>\n`+
           `<circle cx="${hx.toFixed(2)}" cy="${holeCy.toFixed(2)}" r="${outerR.toFixed(2)}" fill="none" stroke="#000000" stroke-width="0.5"/>\n`+
           `<circle cx="${hx.toFixed(2)}" cy="${holeCy.toFixed(2)}" r="${innerR.toFixed(2)}" fill="none" stroke="#000000" stroke-width="0.5"/>`;
  }

  // 取主體段（較長方向）
  const fwdLen = ((leftIdx - rightIdx) + n) % n;
  const outside = [];
  if (fwdLen >= n / 2) {
    let idx = rightIdx, g = 0;
    while (idx !== leftIdx && g < n) { outside.push(pts[idx]); idx = (idx+1)%n; g++; }
  } else {
    const tmp = [];
    let idx = leftIdx, g = 0;
    while (idx !== rightIdx && g < n) { tmp.push(pts[idx]); idx = (idx+1)%n; g++; }
    tmp.push(pts[rightIdx]); tmp.reverse();
    outside.push(...tmp);
  }
  outside.push(pts[leftIdx]);
  const m = outside.length;

  // Catmull-Rom（端點不循環）
  let d = `M${outside[0][0].toFixed(2)},${outside[0][1].toFixed(2)}`;
  for (let i = 0; i < m-1; i++) {
    const p0=outside[Math.max(i-1,0)], p1=outside[i], p2=outside[i+1], p3=outside[Math.min(i+2,m-1)];
    d += `C${(p1[0]+(p2[0]-p0[0])/6).toFixed(2)},${(p1[1]+(p2[1]-p0[1])/6).toFixed(2)} `+
         `${(p2[0]-(p3[0]-p1[0])/6).toFixed(2)},${(p2[1]-(p3[1]-p1[1])/6).toFixed(2)} `+
         `${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  // 細頸 + 大弧（sweep=1 clockwise，large-arc=1）繞頂部
  const lx = (hx - neckHW).toFixed(2), rx = (hx + neckHW).toFixed(2);
  const ty = minY.toFixed(2), yc = yConn.toFixed(2);
  const r  = outerR.toFixed(2);
  d += `L${lx},${ty}L${lx},${yc}A${r},${r} 0 1 1 ${rx},${yc}L${rx},${ty}Z`;

  return `<path fill="none" stroke="#000000" stroke-width="0.5" d="${d}"/>\n`+
         `<circle cx="${hx.toFixed(2)}" cy="${holeCy.toFixed(2)}" r="${innerR.toFixed(2)}" fill="none" stroke="#000000" stroke-width="0.5"/>`;
}

// 厚切電子票證上傳模式：高解析 canvas 截圖裁切到圓角框，疊加晶片圓、刀模線、紅框
// viewBox 158.7×248.3 pt = 54×85.6mm（直式）
function getUploadOnlyThickSVG() {
  if (!canvas2d) return null;
  const _canvasDataURL = get2DDataURL(9) || _lastUploadedDataURL;
  if (!_canvasDataURL) return null;
  const _diecutPath = _thickDiecutToSVGPath();
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 158.7 248.3" width="54mm" height="85.6mm">
<style type="text/css">.st0{fill:#BC918F;}.st1{fill:none;stroke:#E60012;stroke-miterlimit:10;}</style>
<defs><clipPath id="thick-clip"><path d="M12.1,245.5c-5.2,0-9.3-4.2-9.3-9.3v-224c0-5.2,4.2-9.3,9.3-9.3h134.5c5.2,0,9.3,4.2,9.3,9.3v224c0,5.2-4.2,9.3-9.3,9.3H12.1z"/></clipPath></defs>
<image xlink:href="${_canvasDataURL}" x="0" y="0" width="158.7" height="248.3" preserveAspectRatio="none" clip-path="url(#thick-clip)"/>
<circle class="st0" cx="79.3" cy="124.1" r="49.6"/>
${_diecutPath}
<path class="st1" d="M12.1,245.5c-5.2,0-9.3-4.2-9.3-9.3v-224c0-5.2,4.2-9.3,9.3-9.3h134.5c5.2,0,9.3,4.2,9.3,9.3v224c0,5.2-4.2,9.3-9.3,9.3H12.1z"/>
</svg>`;
}

// 壓克力電子票證上傳模式：高解析 canvas 截圖裁切到圓角框，疊加刀模線、紅框（無晶片圓）
// viewBox 158.7×248.3 pt = 54×85.6mm（直式）
function getUploadOnlyAcrylicSVG() {
  if (!canvas2d) return null;
  const _canvasDataURL = get2DDataURL(9) || _lastUploadedDataURL;
  if (!_canvasDataURL) return null;
  const _diecutPath = _thickDiecutToSVGPath();
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 158.7 248.3" width="54mm" height="85.6mm">
<style type="text/css">.st0{fill:none;stroke:#E60012;stroke-miterlimit:10;}</style>
<defs><clipPath id="acrylic-clip"><path d="M12.1,245.5c-5.2,0-9.3-4.2-9.3-9.3v-224c0-5.2,4.2-9.3,9.3-9.3h134.5c5.2,0,9.3,4.2,9.3,9.3v224c0,5.2-4.2,9.3-9.3,9.3H12.1z"/></clipPath></defs>
<image xlink:href="${_canvasDataURL}" x="0" y="0" width="158.7" height="248.3" preserveAspectRatio="none" clip-path="url(#acrylic-clip)"/>
${_diecutPath}
<path class="st0" d="M12.1,245.5c-5.2,0-9.3-4.2-9.3-9.3v-224c0-5.2,4.2-9.3,9.3-9.3h134.5c5.2,0,9.3,4.2,9.3,9.3v224c0,5.2-4.2,9.3-9.3,9.3H12.1z"/>
</svg>`;
}

function _addLabelAreaFrame(base) {
  if (!canvas2d || !currentProduct || !currentProduct.labelArea) return Promise.resolve(base);
  const la = currentProduct.labelArea;
  const scale = 2;
  const w = canvas2d.getWidth() * scale;
  const h = canvas2d.getHeight() * scale;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      ctx.strokeStyle = 'rgba(220, 50, 50, 0.9)';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.strokeRect(la.xRatio * w, la.yRatio * h, la.wRatio * w, la.hRatio * h);
      resolve(tmp.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base);
    img.src = base;
  });
}

function get2DDataURLWithFrame() {
  const base = get2DDataURL();
  if (!base) return Promise.resolve(null);

  // 隨行杯／馬克杯／行動電源：在底圖上疊加印刷範圍虛線框
  const _isThermosLike = typeof STATE !== 'undefined' &&
    ['thermos', 'mug', 'power_bank'].includes(STATE.productId);
  if (_isThermosLike) return _addLabelAreaFrame(base);

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

  const _isLeatherRound = typeof STATE !== 'undefined' && STATE.productId === 'biz_leather_round';
  const _isLeatherOmamori = typeof STATE !== 'undefined' && STATE.productId === 'biz_leather_omamori';
  const _isLightboxFrame = typeof STATE !== 'undefined' && STATE.productId === 'biz_lightbox';
  const _isThickFrame = typeof STATE !== 'undefined' && STATE.productId === 'biz_thick';
  const _isAcrylicFrame = typeof STATE !== 'undefined' && STATE.productId === 'biz_acrylic';
  const _isPortraitFrame = !_isLeatherRound && !_isLeatherOmamori && !_isLightboxFrame && !_isThickFrame && !_isAcrylicFrame && typeof STATE !== 'undefined' && STATE.orientationId === 'portrait';
  const _lrMatId = _isLeatherRound && typeof STATE !== 'undefined' ? STATE.materialId : null;
  let _frameSrc, _cachedFrame;
  if (_isLeatherRound) {
    _frameSrc = _lrMatId === 'ipass'
      ? 'assets/leather_round_ipass_frame.svg'
      : 'assets/leather_round_easycard_frame.svg';
    _cachedFrame = _lrMatId === 'ipass' ? _cachedLeatherRoundIpassFrameImg : _cachedLeatherRoundEasycardFrameImg;
  } else if (_isLeatherOmamori) {
    const _omMatId = typeof STATE !== 'undefined' ? STATE.materialId : null;
    _frameSrc = _omMatId === 'ipass'
      ? 'assets/leather_omamori_ipass_frame.svg'
      : 'assets/leather_omamori_easycard_frame.svg';
    _cachedFrame = _omMatId === 'ipass' ? _cachedLeatherOmamoriIpassFrameImg : _cachedLeatherOmamoriEasycardFrameImg;
  } else if (_isLightboxFrame) {
    _frameSrc = 'assets/lightbox_frame.svg';
    _cachedFrame = _cachedLightboxFrameImg;
  } else if (_isThickFrame) {
    _frameSrc = 'assets/thick_frame.svg';
    _cachedFrame = _cachedThickFrameImg;
  } else if (_isAcrylicFrame) {
    _frameSrc = 'assets/acrylic_frame.svg';
    _cachedFrame = _cachedAcrylicFrameImg;
  } else {
    _frameSrc = _isPortraitFrame ? 'assets/card_portrait_frame.svg' : 'assets/card_landscape_frame.svg';
    _cachedFrame = _isPortraitFrame ? _cachedCardPortraitFrameImg : _cachedCardFrameImg;
  }
  if (_cachedFrame && _cachedFrame.complete && _cachedFrame.naturalWidth > 0) {
    return doComposite(_cachedFrame);
  }
  return new Promise(resolve => {
    const frameImg = new Image();
    frameImg.onload = () => {
      if (_isLeatherRound) {
        if (_lrMatId === 'ipass') _cachedLeatherRoundIpassFrameImg = frameImg;
        else _cachedLeatherRoundEasycardFrameImg = frameImg;
      } else if (_isLeatherOmamori) {
        const _omMatId = typeof STATE !== 'undefined' ? STATE.materialId : null;
        if (_omMatId === 'ipass') _cachedLeatherOmamoriIpassFrameImg = frameImg;
        else _cachedLeatherOmamoriEasycardFrameImg = frameImg;
      } else if (_isLightboxFrame) _cachedLightboxFrameImg = frameImg;
      else if (_isThickFrame) _cachedThickFrameImg = frameImg;
      else if (_isAcrylicFrame) _cachedAcrylicFrameImg = frameImg;
      else if (_isPortraitFrame) _cachedCardPortraitFrameImg = frameImg;
      else _cachedCardFrameImg = frameImg;
      doComposite(frameImg).then(resolve);
    };
    frameImg.onerror = () => resolve(base);
    frameImg.src = _frameSrc;
  });
}

// ─── 取得 DataURL（排除輔助線與虛線框）──────────────────────
// cropRect（選用）：{ left, top, width, height } 以 canvas 顯示像素為單位，用於預先裁切匯出區域
function get2DDataURL(hiResMultiplier, cropRect) {
  if (!canvas2d) return null;
  const _m = hiResMultiplier || 2;
  // bottle-bg 保留在匯出圖中（隨行杯瓶身），只隱藏 hint 等輔助物件
  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;
  canvas2d.renderAll();
  const opts = { format: 'png', multiplier: _m };
  if (cropRect) Object.assign(opts, cropRect);
  const dataURL = canvas2d.toDataURL(opts);
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
  const isThermos = currentProduct && (currentProduct.id === 'thermos' || currentProduct.id === 'mug' || currentProduct.id === 'power_bank');

  const bgObjs = canvas2d.getObjects().filter(o => !o.selectable && o.name !== 'bottle-bg');
  bgObjs.forEach(o => o.set('visible', false));
  _suppressOverlay = true;

  // 隨行杯／馬克杯：移除背景圖與背景色，SVG 只保留文字元素
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

  // 後處理：印刷尺寸（依商品）
  const cw = canvas2d.getWidth();
  const ch = canvas2d.getHeight();
  const _isThermosOnly   = currentProduct && currentProduct.id === 'thermos';
  const _isMugOnly       = currentProduct && currentProduct.id === 'mug';
  const _isPowerBankOnly = currentProduct && currentProduct.id === 'power_bank';
  if (_isThermosOnly) {
    svg = svg.replace(/(<svg\b[^>]*)\swidth="[^"]*"/,  '$1 width="85mm"');
    svg = svg.replace(/(<svg\b[^>]*)\sheight="[^"]*"/, '$1 height="46.5mm"');
  } else if (_isMugOnly) {
    svg = svg.replace(/(<svg\b[^>]*)\swidth="[^"]*"/,  '$1 width="51mm"');
    svg = svg.replace(/(<svg\b[^>]*)\sheight="[^"]*"/, '$1 height="71mm"');
  } else if (_isPowerBankOnly) {
    svg = svg.replace(/(<svg\b[^>]*)\swidth="[^"]*"/,  '$1 width="50.5mm"');
    svg = svg.replace(/(<svg\b[^>]*)\sheight="[^"]*"/, '$1 height="25.5mm"');
  }

  // 裁切 viewBox 到印刷區（thermos/mug 移除瓶身背景，只保留文字區）
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
    // fill 可能在 style 屬性裡（如 fabric.js 輸出 "fill: rgb(255,255,255)"），優先讀 attribute 再 fallback style
    const _styleFill = (() => {
      const m = (textEl.getAttribute('style') || '').match(/(?:^|;)\s*fill\s*:\s*([^;]+)/);
      return m ? m[1].trim() : null;
    })();
    const fill = textEl.getAttribute('fill') || _styleFill || '#000000';
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

// ─── 匯出分層向量 SVG（底圖 + 紅框 + 文字路徑 三圖層）────────────────────────
async function get2DLayeredSVG() {
  if (!canvas2d || !currentProduct) return null;
  const cw = canvas2d.getWidth();
  const ch = canvas2d.getHeight();
  const la = currentProduct.labelArea;
  const svgNS = 'http://www.w3.org/2000/svg';
  const xlNS  = 'http://www.w3.org/1999/xlink';

  // 1. 取得並解析輪廓 SVG（文字已轉路徑）
  const outlinedSVG = await get2DSVGOutlined();
  if (!outlinedSVG) return null;
  const parser  = new DOMParser();
  const outDoc  = parser.parseFromString(outlinedSVG, 'image/svg+xml');
  if (outDoc.querySelector('parsererror')) return null;
  const outRoot = outDoc.documentElement;

  // 2. 建立新 SVG 文件（確保命名空間正確）
  const doc = document.implementation.createDocument(svgNS, 'svg', null);
  const svg = doc.documentElement;
  svg.setAttribute('xmlns',       svgNS);
  svg.setAttribute('xmlns:xlink', xlNS);
  svg.setAttribute('viewBox',     `0 0 ${cw} ${ch}`);

  // 3. 圖層一：底圖（商品背景圖，縮至最大 800px 以 JPEG 嵌入）
  const gBg = doc.createElementNS(svgNS, 'g');
  gBg.setAttribute('id', '底圖');
  const bgFabricImg = canvas2d.backgroundImage;
  if (bgFabricImg && bgFabricImg._element) {
    try {
      const bgEl = bgFabricImg._element;
      const origW = bgEl.naturalWidth  || cw;
      const origH = bgEl.naturalHeight || ch;
      const scale = Math.min(1, 800 / Math.max(origW, origH));
      const tw = Math.round(origW * scale);
      const th = Math.round(origH * scale);
      const tmp = document.createElement('canvas');
      tmp.width = tw; tmp.height = th;
      tmp.getContext('2d').drawImage(bgEl, 0, 0, tw, th);
      const bgDataURL = tmp.toDataURL('image/jpeg', 0.85);
      const imgEl = doc.createElementNS(svgNS, 'image');
      imgEl.setAttributeNS(xlNS, 'xlink:href', bgDataURL);
      imgEl.setAttribute('x', '0');
      imgEl.setAttribute('y', '0');
      imgEl.setAttribute('width',  String(cw));
      imgEl.setAttribute('height', String(ch));
      imgEl.setAttribute('preserveAspectRatio', 'none');
      gBg.appendChild(imgEl);
    } catch(e) { console.warn('[layeredSVG] 底圖轉換失敗', e); }
  }
  svg.appendChild(gBg);

  // 4. 圖層二：印刷範圍紅框（向量矩形）
  const gFrame = doc.createElementNS(svgNS, 'g');
  gFrame.setAttribute('id', '印刷範圍');
  const rect = doc.createElementNS(svgNS, 'rect');
  rect.setAttribute('x',            la ? (la.xRatio * cw).toFixed(1) : '0');
  rect.setAttribute('y',            la ? (la.yRatio * ch).toFixed(1) : '0');
  rect.setAttribute('width',        la ? (la.wRatio * cw).toFixed(1) : String(cw));
  rect.setAttribute('height',       la ? (la.hRatio * ch).toFixed(1) : String(ch));
  rect.setAttribute('fill',         'none');
  rect.setAttribute('stroke',       '#DC3232');
  rect.setAttribute('stroke-width', '2');
  gFrame.appendChild(rect);
  svg.appendChild(gFrame);

  // 5. 圖層三：文字路徑（從 outlined SVG 使用 importNode 確保命名空間）
  const gText = doc.createElementNS(svgNS, 'g');
  gText.setAttribute('id', '文字');
  for (const child of Array.from(outRoot.childNodes)) {
    if (child.nodeName === 'defs') continue;
    if (child.nodeType === 3 && !child.textContent.trim()) continue;
    gText.appendChild(doc.importNode(child, true));
  }
  svg.appendChild(gText);

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
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
  // 優先用選取中的圖片，否則找第一張
  let img = canvas2d.getActiveObject();
  if (!img || img.type !== 'image') {
    img = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
  }
  if (!img) return;
  const baseScale = img._roundBaseScale || _uploadBaseScale;
  img.set({ scaleX: baseScale * ratio, scaleY: baseScale * ratio });
  img.setCoords();
  canvas2d.renderAll();
}

// ─── 旋轉滑桿（biz_lightbox 專用）────────────────────────────
function onRotateSlider(value) {
  const angle = parseFloat(value);
  const dispEl = document.getElementById('rotate-value-display');
  if (dispEl) dispEl.textContent = Math.round(angle) + '°';
  if (!canvas2d) return;
  let img = canvas2d.getActiveObject();
  if (!img || img.type !== 'image') {
    img = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
  }
  if (!img) return;
  img.rotate(angle);
  img.setCoords();
  canvas2d.renderAll();
}

function _syncRotateSlider(obj) {
  if (typeof STATE === 'undefined' || STATE.productId !== 'biz_lightbox') return;
  if (!obj || obj.type !== 'image') return;
  const slider = document.getElementById('rotate-slider');
  const dispEl = document.getElementById('rotate-value-display');
  const angle = Math.round(obj.angle || 0);
  if (slider) slider.value = angle;
  if (dispEl) dispEl.textContent = angle + '°';
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
  _thickDieCutContour = null;
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

// 厚切票證去背 + 刀模生成（改由後端 Python GPU API 處理：http://127.0.0.1:8000）
async function removeBgThick() {
  if (!canvas2d) return;
  const obj = canvas2d.getActiveObject() || canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
  if (!obj || obj.type !== 'image') {
    alert('請先上傳並點選圖片');
    return;
  }

  const btn         = document.getElementById('btn-rmbg');
  const status      = document.getElementById('rmbg-status');
  const progressWrap = document.getElementById('rmbg-progress-wrap');
  const progressBar  = document.getElementById('rmbg-progress-bar');
  const marginInput = document.getElementById('rmbg-margin');
  const marginPx    = marginInput ? parseInt(marginInput.value) : 15;

  // 進度更新輔助函式
  function _setStatus(msg) {
    if (status) status.textContent = msg;
    if (progressBar) {
      const m = msg.match(/(\d+)%/);
      progressBar.style.width = m ? m[1] + '%' : '100%';
    }
  }

  if (btn) btn.disabled = true;
  if (progressWrap) progressWrap.style.display = '';
  if (progressBar)  progressBar.style.width = '10%';
  _setStatus('連線後端 GPU 引擎中…');

  try {
    const el = obj.getElement();
    const tmp = document.createElement('canvas');
    tmp.width  = el.naturalWidth  || el.width;
    tmp.height = el.naturalHeight || el.height;
    tmp.getContext('2d').drawImage(el, 0, 0);
    _origUploadImageElement = tmp;
    const dataURL = tmp.toDataURL('image/png');

    // 呼叫後端 API 去背 + 刀模計算（定義於 rembg_client.js）
    const data = await removeBgWithContourClient(dataURL, marginPx, _setStatus);

    if (!data.success) throw new Error(data.error || '去背失敗');

    // 快取去背結果
    _lastRembgDataURL = data.imageDataURL;

    fabric.Image.fromURL(data.imageDataURL, (newImg) => {
      const scaleX = obj.scaleX * (obj.width  / newImg.width);
      const scaleY = obj.scaleY * (obj.height / newImg.height);
      newImg.set({
        left: canvas2d.getWidth() / 2, top: canvas2d.getHeight() / 2,
        scaleX, scaleY,
        originX: 'center', originY: 'center',
        clipPath: obj.clipPath,
        selectable: true,
        lockMovementX: true, lockMovementY: true, lockRotation: true,
        hasControls: false, hasBorders: false
      });
      canvas2d.remove(obj);
      canvas2d.add(newImg);
      canvas2d.setActiveObject(newImg);

      _thickDieCutContour = data.contour || null;

      canvas2d.requestRenderAll();

      if (progressBar) progressBar.style.width = '100%';
      _setStatus('✅ GPU 去背與刀模運算完成！');
      setTimeout(() => {
        if (progressWrap) progressWrap.style.display = 'none';
        if (progressBar)  progressBar.style.width = '0%';
        if (status)       status.textContent = '';
      }, 3000);
    }, { crossOrigin: 'anonymous' });

  } catch (err) {
    _setStatus('❌ 失敗：' + (err.message || err));
    if (progressWrap) { setTimeout(() => { progressWrap.style.display = 'none'; }, 3000); }
    console.error('[removeBgThick]', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── 手動修正背景（擦除與還原筆刷） ─────────────────────────
let _brushMode = null; // null | 'erase' | 'restore'
let _brushSize = 20;
let _origUploadImageElement = null;
let _isBrushing = false;

function toggleBrushMode(mode) {
  if (_brushMode === mode) {
    _brushMode = null;
  } else {
    _brushMode = mode;
  }

  const btnE = document.getElementById('btn-brush-erase');
  const btnR = document.getElementById('btn-brush-restore');
  const sizeWrap = document.getElementById('brush-size-wrap');

  if (btnE) {
    btnE.style.background = (_brushMode === 'erase') ? 'var(--green)' : '';
    btnE.style.color = (_brushMode === 'erase') ? 'white' : '';
  }
  if (btnR) {
    btnR.style.background = (_brushMode === 'restore') ? 'var(--green)' : '';
    btnR.style.color = (_brushMode === 'restore') ? 'white' : '';
  }
  if (sizeWrap) sizeWrap.style.display = _brushMode ? '' : 'none';

  if (!canvas2d) return;
  const imgObj = canvas2d.getObjects().find(o => o.type === 'image');
  if (imgObj) {
    if (currentProduct && currentProduct.id === 'biz_thick') {
      imgObj.lockMovementX = true;
      imgObj.lockMovementY = true;
      imgObj.lockRotation = true;
      imgObj.hasControls = false;
      imgObj.hasBorders = false;
    }
    imgObj.selectable = !_brushMode;
    imgObj.evented = true;
  }
  canvas2d.selection = !_brushMode;
  _updateBrushCursor();
  canvas2d.requestRenderAll();
}

function onBrushSizeChange(val) {
  _brushSize = parseInt(val, 10) || 20;
  const disp = document.getElementById('brush-size-display');
  if (disp) disp.textContent = _brushSize + 'px';
  _updateBrushCursor();
}

function _updateBrushCursor() {
  if (!canvas2d) return;
  const imgObj = canvas2d.getObjects().find(o => o.type === 'image');
  if (!_brushMode) {
    canvas2d.defaultCursor = 'default';
    canvas2d.hoverCursor = 'move';
    if (imgObj) imgObj.hoverCursor = 'move';
    return;
  }
  const r = Math.max(4, Math.round(_brushSize / 2));
  const d = r * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="rgba(255,255,255,0.25)" stroke="${_brushMode === 'erase' ? '#ef4444' : '#3b82f6'}" stroke-width="1.8"/></svg>`;
  const cursorUrl = 'data:image/svg+xml;base64,' + btoa(svg);
  const curStr = `url(${cursorUrl}) ${r} ${r}, crosshair`;
  canvas2d.defaultCursor = curStr;
  canvas2d.hoverCursor = curStr;
  if (imgObj) imgObj.hoverCursor = curStr;
}

function _ensureImgIsCanvas(imgObj) {
  if (!imgObj || !imgObj._element) return null;
  if (imgObj._element.nodeName.toLowerCase() !== 'canvas') {
    const el = imgObj._element;
    const c = document.createElement('canvas');
    c.width = el.naturalWidth || el.width;
    c.height = el.naturalHeight || el.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(el, 0, 0);
    imgObj._element = c;
  }
  return imgObj._element;
}

function _applyBrushAtPointer(pointer) {
  if (!_brushMode || !canvas2d) return;
  const imgObj = canvas2d.getObjects().find(o => o.type === 'image');
  if (!imgObj) return;
  const c = _ensureImgIsCanvas(imgObj);
  if (!c) return;

  const left = imgObj.originX === 'center' ? imgObj.left - (imgObj.width * imgObj.scaleX) / 2 : imgObj.left;
  const top  = imgObj.originY === 'center' ? imgObj.top  - (imgObj.height * imgObj.scaleY) / 2 : imgObj.top;
  const ix = (pointer.x - left) / imgObj.scaleX;
  const iy = (pointer.y - top) / imgObj.scaleY;
  const r = (_brushSize / imgObj.scaleX) / 2;

  const ctx = c.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(ix, iy, r, 0, Math.PI * 2);
  ctx.clip();

  if (_brushMode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
  } else if (_brushMode === 'restore' && _origUploadImageElement) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(_origUploadImageElement, 0, 0, c.width, c.height);
  }
  ctx.restore();

  imgObj.dirty = true;
  canvas2d.requestRenderAll();
}

