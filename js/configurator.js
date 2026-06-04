// 楊竹科技 — 步驟式配置器主邏輯

function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const STATE = {
  step: 1,
  productId: null,
  materialId: null,
  finishId: null,
  capacityId: null,
  orientationId: null,
  qty: 100,
  bgColor: '#ffffff',
  canvasJSON: null,
  designDataURL: null,
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  contactNote: '',
  submittedFilename: ''
};

const TOTAL_STEPS = 4;

// ─── 步驟導覽 ──────────────────────────────────────────────
function goStep(n) {
  if (n < 1 || n > TOTAL_STEPS) return;
  if (n > 1 && !STATE.productId) { alert('請先選擇產品'); return; }
  if (n > 2 && !STATE.materialId) { alert('請先完成規格選擇'); return; }

  // 離開設計步驟前，先快照 2D 設計圖
  if (STATE.step === 3) {
    STATE.designDataURL = (typeof get2DDataURL === 'function') ? get2DDataURL() : null;
  }

  STATE.step = n;
  renderStep();
}

function nextStep() { goStep(STATE.step + 1); }
function prevStep() { goStep(STATE.step - 1); }

function renderStep() {
  // 更新進度條
  document.querySelectorAll('.step-indicator .step').forEach((el, i) => {
    el.classList.toggle('active',   i + 1 === STATE.step);
    el.classList.toggle('done',     i + 1 <  STATE.step);
  });

  // 顯示對應面板
  document.querySelectorAll('.step-panel').forEach(el => {
    el.classList.toggle('hidden', el.dataset.step != STATE.step);
  });

  // 各步驟初始化（Step 3 = 設計，Step 4 = 報價單）
  if (STATE.step === 3) { initDesignStep(); }
  if (STATE.step === 4) initPreviewStep();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── 密碼保護彈窗 ──────────────────────────────────────────
function promptPassword(productId, callback) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:32px 28px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">🔒</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">此商品測試中</div>
      <div style="font-size:13px;color:#888;margin-bottom:20px;">請輸入密碼以繼續</div>
      <input id="pw-input" type="password" placeholder="請輸入密碼" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:10px;outline:none;">
      <div id="pw-error" style="color:#e53e3e;font-size:12px;margin-bottom:10px;display:none;">密碼錯誤，請再試一次</div>
      <button id="pw-confirm" style="width:100%;padding:11px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px;">確認</button>
      <button id="pw-cancel" style="width:100%;padding:10px;background:none;border:1.5px solid #ddd;border-radius:8px;font-size:14px;cursor:pointer;color:#666;">取消</button>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#pw-input');
  const errEl = overlay.querySelector('#pw-error');
  input.focus();
  const close = () => document.body.removeChild(overlay);
  overlay.querySelector('#pw-cancel').onclick = close;
  const confirm = () => {
    const p = PRODUCTS[productId];
    if (input.value === p.password) { close(); callback(); }
    else { errEl.style.display = ''; input.value = ''; input.focus(); }
  };
  overlay.querySelector('#pw-confirm').onclick = confirm;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
}

// ─── Step 1：選產品 ────────────────────────────────────────
function renderProductGrid(parentId) {
  parentId = parentId || null;
  const grid = document.getElementById('product-grid');
  const subtitle = document.getElementById('product-grid-subtitle');
  if (!grid) return;

  const products = Object.values(PRODUCTS).filter(p => (p.parentId || null) === parentId);

  let html = '';
  if (parentId) {
    const parent = PRODUCTS[parentId];
    if (subtitle) subtitle.textContent = (parent ? parent.name : '') + ' — 選擇商品';
    html += `<div style="width:100%;margin-bottom:16px;">
      <button onclick="renderProductGrid(null)" style="background:none;border:1.5px solid #ccc;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:14px;color:#666;">← 返回</button>
    </div>`;
  } else {
    if (subtitle) subtitle.textContent = '點選後自動進入下一步';
  }

  html += products.map(p => {
    const isSvg = p.image && p.image.toLowerCase().endsWith('.svg');
    const imgStyle = isSvg ? 'object-fit:contain;padding:8px;background:#f5f0ea;' : '';
    const imgHtml = p.image
      ? `<div class="product-img-wrap">
           <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy"
                style="${imgStyle}"
                onerror="this.parentElement.outerHTML='<div class=\\'product-icon\\'>${p.icon || ''}</div>'">
         </div>`
      : `<div class="product-icon">${p.icon || ''}</div>`;

    let onclick;
    if (p.isCategory) {
      onclick = p.password
        ? `promptPassword('${p.id}', () => renderProductGrid('${p.id}'))`
        : `renderProductGrid('${p.id}')`;
    } else {
      onclick = `selectProduct('${p.id}')`;
    }

    const badgeHtml = p.badge
      ? `<div class="product-badge" style="background:${p.badgeColor || '#888'}">${p.isCategory && p.password ? '🔒 ' : ''}${p.badge}</div>`
      : '';
    const sizeHtml = !p.isCategory && p.displaySize
      ? `<div class="product-size">${p.displaySize}</div>` : '';
    const minQtyHtml = !p.isCategory && p.minQty
      ? `<div class="product-min">最低 ${p.minQty} 個起</div>` : '';

    return `<div class="product-card" data-product-id="${p.id}" onclick="${onclick}">
      ${imgHtml}
      ${badgeHtml}
      <h3>${p.name}</h3>
      <p>${p.description || ''}</p>
      ${sizeHtml}
      ${minQtyHtml}
    </div>`;
  }).join('');

  grid.innerHTML = html;
}

function selectProduct(productId) {
  STATE.productId  = productId;
  STATE.materialId = null;
  STATE.finishId   = null;
  STATE.capacityId = null;
  STATE.canvasJSON = null; // 切換商品時清除上一個商品的設計內容

  document.querySelectorAll('.product-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.productId === productId);
  });

  // 預設第一個材質/工藝
  const p = PRODUCTS[productId];
  STATE.materialId = p.materials[0].id;
  STATE.finishId   = p.finishes[0].id;
  if (p.capacities)    STATE.capacityId    = p.capacities[0].id;
  if (p.orientations)  STATE.orientationId = p.orientations[0].id;

  nextStep();
}

// ─── Step 2：選規格 ────────────────────────────────────────
function renderSpecStep() {
  const p = PRODUCTS[STATE.productId];
  if (!p) return;

  // 材質／顏色（標籤依產品動態切換）
  const matLabelEl = document.getElementById('spec-materials-label');
  if (matLabelEl) matLabelEl.textContent = p.materialLabel || '材質';

  const matContainer = document.getElementById('spec-materials');
  matContainer.innerHTML = p.materials.map(m => `
    <label class="spec-option ${m.id === STATE.materialId ? 'selected' : ''}">
      <input type="radio" name="material" value="${m.id}" ${m.id === STATE.materialId ? 'checked' : ''}>
      <span class="spec-label">${m.name}</span>
    </label>
  `).join('');

  matContainer.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      STATE.materialId = input.value;
      matContainer.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
      input.closest('label').classList.add('selected');
      updateLiveQuote();
      _updateColorPreview(p);
    });
  });

  // 初始顯示顏色預覽圖
  _updateColorPreview(p);

  // 表面工藝
  const finContainer = document.getElementById('spec-finishes');
  finContainer.innerHTML = p.finishes.map(f => `
    <label class="spec-option ${f.id === STATE.finishId ? 'selected' : ''}">
      <input type="radio" name="finish" value="${f.id}" ${f.id === STATE.finishId ? 'checked' : ''}>
      <span class="spec-label">${f.name}</span>
      <span class="spec-price">${f.price > 0 ? `+NT$${f.price}` : '標準'}</span>
    </label>
  `).join('');

  finContainer.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      STATE.finishId = input.value;
      finContainer.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
      input.closest('label').classList.add('selected');
      updateLiveQuote();
    });
  });

  // 容量（USB 類才有）
  const capSection = document.getElementById('spec-capacity-section');
  if (p.capacities) {
    capSection.classList.remove('hidden');
    const capContainer = document.getElementById('spec-capacities');
    capContainer.innerHTML = p.capacities.map(c => `
      <label class="spec-option ${c.id === STATE.capacityId ? 'selected' : ''}">
        <input type="radio" name="capacity" value="${c.id}" ${c.id === STATE.capacityId ? 'checked' : ''}>
        <span class="spec-label">${c.name}</span>
        <span class="spec-price">${c.price > 0 ? `+NT$${c.price}` : '標準'}</span>
      </label>
    `).join('');

    capContainer.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        STATE.capacityId = input.value;
        capContainer.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
        input.closest('label').classList.add('selected');
        updateLiveQuote();
      });
    });
  } else {
    capSection.classList.add('hidden');
  }

  // 方向（壓克力吊飾等才有）
  const oriSection = document.getElementById('spec-orientation-section');
  if (oriSection) {
    if (p.orientations) {
      oriSection.classList.remove('hidden');
      const oriContainer = document.getElementById('spec-orientations');
      oriContainer.innerHTML = p.orientations.map(o => `
        <label class="spec-option ${o.id === STATE.orientationId ? 'selected' : ''}">
          <input type="radio" name="orientation" value="${o.id}" ${o.id === STATE.orientationId ? 'checked' : ''}>
          <span class="spec-label">${o.name}</span>
        </label>
      `).join('');
      oriContainer.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
          STATE.orientationId = input.value;
          oriContainer.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
          input.closest('label').classList.add('selected');
          _updateColorPreview(p);
        });
      });
    } else {
      oriSection.classList.add('hidden');
    }
  }

  // 數量滑桿
  const qtyInput = document.getElementById('spec-qty');
  const qtyDisplay = document.getElementById('spec-qty-display');
  qtyInput.min   = p.minQty;
  qtyInput.value = Math.max(STATE.qty, p.minQty);
  qtyDisplay.textContent = qtyInput.value;
  STATE.qty = parseInt(qtyInput.value);

  qtyInput.addEventListener('input', () => {
    STATE.qty = parseInt(qtyInput.value);
    qtyDisplay.textContent = STATE.qty;
    updateLiveQuote();
  });

  updateLiveQuote();
}

function updateLiveQuote() {
  const el = document.getElementById('live-quote');
  if (!el) return;

  const p = PRODUCTS[STATE.productId];
  if (p && p.noPrice) {
    el.innerHTML = `<div class="quote-row total"><span>定價</span><strong>請洽詢報價</strong></div>`;
    return;
  }

  const q = calcQuote(STATE.productId, STATE.materialId, STATE.finishId, STATE.qty, STATE.capacityId);
  if (!q) return;

  el.innerHTML = `
    <div class="quote-row"><span>單價</span><strong>NT$ ${q.unitPrice.toLocaleString()}</strong></div>
    <div class="quote-row"><span>數量 × ${q.qty.toLocaleString()}</span><strong>NT$ ${q.subtotal.toLocaleString()}</strong></div>
    <div class="quote-row"><span>製版費</span><strong>NT$ ${q.setupFee.toLocaleString()}</strong></div>
    <div class="quote-row total"><span>預估總計</span><strong>NT$ ${q.total.toLocaleString()}</strong></div>
    <div class="quote-note">預計交期：下單後 ${q.leadDays} 個工作天</div>
  `;
}

// ─── Step 3：設計 ──────────────────────────────────────────
const _TEXT_COLORS = [
  '#FFDD00','#E8A020','#F08000','#D84020','#C82020','#F080A0','#F040A0','#C00060',
  '#800020','#600040','#800080','#600060','#4040C0','#202080','#000060','#60A0E0',
  '#2060E0','#2040A0','#202060','#00A080','#40A040','#207040','#004020','#FFFFFF',
  '#E0E0E0','#808080','#000000','#606040'
];

function initDesignStep() {
  const isThermos = STATE.productId === 'thermos';

  // 上傳框線模式：biz_card（橫式／直式）、biz_leather_round 或 biz_leather_omamori
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || (STATE.productId === 'biz_card' && (
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
  ));
  let _origSize = null;
  if (isUploadOnly && STATE.productId === 'biz_card') {
    const _prod = PRODUCTS['biz_card'];
    if (_prod) {
      _origSize = _prod.size;
      _prod.size = STATE.orientationId === 'portrait'
        ? { w: 1701, h: 2597, unit: '' }
        : { w: 2597, h: 1701, unit: '' };
    }
  }

  init2DCanvas(STATE.productId);

  if (_origSize) PRODUCTS['biz_card'].size = _origSize;

  if (STATE.canvasJSON && typeof loadCanvas2DJSON === 'function' && !isThermos) {
    loadCanvas2DJSON(STATE.canvasJSON);
  }

  _initFreeTextUI();

  const product = PRODUCTS[STATE.productId];

  // SVG 框線載入（上傳模式：框線畫在圖片上方，圖片裁切在黑色虛線框內）
  if (isUploadOnly && typeof canvas2d !== 'undefined' && canvas2d) {
    canvas2d.off('after:render');
    canvas2d.backgroundColor = '#ffffff';
    // 載入 SVG 框線圖，在 after:render 疊加於所有物件上方（不受 clipPath 影響）
    const _svgFrame = new Image();
    _svgFrame.onload = function() {
      canvas2d.on('after:render', function() {
        if (_suppressOverlay) return;
        canvas2d.contextContainer.drawImage(_svgFrame, 0, 0, canvas2d.getWidth(), canvas2d.getHeight());
      });
      canvas2d.renderAll();
    };
    if (STATE.productId === 'biz_leather_round') {
      _svgFrame.src = 'assets/leather_round_frame.svg';
    } else if (STATE.productId === 'biz_leather_omamori') {
      _svgFrame.src = 'assets/leather_omamori_frame.svg';
    } else {
      _svgFrame.src = STATE.orientationId === 'portrait'
        ? 'assets/card_portrait_frame.svg'
        : 'assets/card_landscape_frame.svg';
    }
  }

  // 圖片上傳
  const uploadSection = document.getElementById('upload-section');
  const showUpload = isUploadOnly || !product?.textOnly;
  if (uploadSection) uploadSection.style.display = showUpload ? '' : 'none';

  if (showUpload) {
    const fileInput = document.getElementById('design-upload');
    if (fileInput) {
      fileInput.replaceWith(fileInput.cloneNode(true));
      const newFile = document.getElementById('design-upload');
      newFile.addEventListener('change', e => {
        if (e.target.files[0]) uploadImage2D(e.target.files[0]);
      });
    }
  }

  // 新增文字按鈕與文字屬性面板（上傳模式時全部隱藏）
  const addPanel   = document.getElementById('panel-add');
  const propsPanel = document.getElementById('panel-text-props');
  if (addPanel)   addPanel.style.display   = isUploadOnly ? 'none' : '';
  if (propsPanel) propsPanel.style.display = isUploadOnly ? 'none' : 'none'; // 預設隱藏，由 _syncTextPropsPanel 控制

  // 縮放滑桿（upload-only 才顯示）
  const zoomSection = document.getElementById('zoom-slider-section');
  if (zoomSection) zoomSection.style.display = isUploadOnly ? '' : 'none';
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomDisplay = document.getElementById('zoom-value-display');
  if (zoomSlider) { zoomSlider.value = 100; }
  if (zoomDisplay) zoomDisplay.textContent = '100%';

  // 背景色
  const bgPicker = document.getElementById('design-bgcolor');
  if (bgPicker) {
    bgPicker.value = STATE.bgColor;
    bgPicker.addEventListener('input', e => {
      STATE.bgColor = e.target.value;
      setBackground2D(e.target.value);
    });
  }
  const bgSection = document.getElementById('bg-color-section');
  if (bgSection) bgSection.style.display = (isThermos || isUploadOnly) ? 'none' : '';

  // canvas 下方說明文字
  const canvasNote = document.getElementById('canvas-note');
  if (canvasNote) {
    canvasNote.textContent = isThermos
      ? '可拖曳移動、點選縮放旋轉文字'
      : '虛線為刀模輪廓參考線';
  }

  const canvas2dWrap   = document.getElementById('canvas-2d-wrap');
  const liveMockupWrap = document.getElementById('live-mockup-wrap');
  if (canvas2dWrap)   canvas2dWrap.style.display = '';
  if (liveMockupWrap) liveMockupWrap.style.display = 'none';

  // 確保 panel 預設狀態
  _syncTextPropsPanel(null);
}

function _initFreeTextUI() {
  if (typeof FONTS === 'undefined') return;
  const sel = document.getElementById('free-font-select');
  if (sel) {
    sel.innerHTML = FONTS.map(f => `<option value="${f.id}">${f.label}</option>`).join('');
    sel.value = FONTS[0].id;
  }
  const _activeProduct = PRODUCTS[STATE.productId];
  const _colorPalette = (_activeProduct && _activeProduct.textColors) ? _activeProduct.textColors : _TEXT_COLORS;
  _buildDotPalette('text-color-dots', _colorPalette, false, color => {
    const obj = canvas2d && canvas2d.getActiveObject();
    if (obj && obj.type === 'textbox') { obj.set('fill', color); canvas2d.renderAll(); }
    document.querySelectorAll('#text-color-dots .dot').forEach(d =>
      d.classList.toggle('active', (d.dataset.color || '').toLowerCase() === color.toLowerCase())
    );
  });
}

function _buildDotPalette(containerId, colors, withNone, onClick) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  if (withNone) {
    const d = document.createElement('button');
    d.className = 'dot dot-none'; d.title = '無底色'; d.dataset.color = '';
    d.addEventListener('click', () => onClick(null));
    el.appendChild(d);
  }
  colors.forEach(c => {
    const d = document.createElement('button');
    d.className = 'dot'; d.style.background = c; d.title = c; d.dataset.color = c;
    if (c === '#FFFFFF') d.style.border = '1.5px solid #ddd';
    d.addEventListener('click', () => onClick(c));
    el.appendChild(d);
  });
}

function addFreeText() {
  if (!canvas2d) return;
  const font = document.getElementById('free-font-select')?.value || '(中英)標準體';
  addText2D('新增文字', '#333333', null, font, 'ft_' + Date.now());
  // 字體非同步載入，等完成後進入編輯模式
  setTimeout(() => {
    const obj = canvas2d.getActiveObject();
    if (obj && obj.enterEditing) {
      obj.enterEditing();
      obj.selectAll();
      canvas2d.renderAll();
    }
  }, 200);
}

function _syncTextPropsPanel(obj) {
  const propsPanel = document.getElementById('panel-text-props');
  const addPanel   = document.getElementById('panel-add');
  const isText = obj && obj.type === 'textbox';

  // 上傳模式：不顯示任何文字功能
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || (STATE.productId === 'biz_card' && (
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
  ));
  if (isUploadOnly) {
    if (propsPanel) propsPanel.style.display = 'none';
    if (addPanel)   addPanel.style.display   = 'none';
    return;
  }

  if (propsPanel) propsPanel.style.display = isText ? '' : 'none';
  if (addPanel)   addPanel.style.display   = isText ? 'none' : '';

  if (!isText) return;

  const sel = document.getElementById('free-font-select');
  if (sel) sel.value = obj.fontFamily || (typeof FONTS !== 'undefined' ? FONTS[0].id : '');

  const fillColor = (obj.fill || '#333333').toUpperCase();
  document.querySelectorAll('#text-color-dots .dot').forEach(d =>
    d.classList.toggle('active', (d.dataset.color || '').toUpperCase() === fillColor)
  );
}

function updateSelectedFont(font) {
  const obj = canvas2d && canvas2d.getActiveObject();
  if (!obj || obj.type !== 'textbox') return;
  document.fonts.load(`16px "${font}"`).then(() => {
    const normPad = (typeof _normPadding === 'function') ? _normPadding(font, obj.fontSize, 6) : 6;
    obj.set({ fontFamily: font, padding: normPad });
    canvas2d.renderAll();
    // 重新貼合寬度
    if (obj._textLines && obj._textLines.length) {
      let maxW = 0;
      for (let i = 0; i < obj._textLines.length; i++) {
        const lw = obj.getLineWidth(i); if (lw > maxW) maxW = lw;
      }
      const fw = Math.ceil(maxW) + 8;
      if (fw < obj.width) { obj.set('width', fw); obj.setCoords(); canvas2d.renderAll(); }
    }
  });
}

function duplicateSelected2D() {
  const obj = canvas2d && canvas2d.getActiveObject();
  if (!obj) return;
  obj.clone(cloned => {
    cloned.set({ left: (obj.left || 0) + 20, top: (obj.top || 0) + 20 });
    canvas2d.add(cloned);
    canvas2d.setActiveObject(cloned);
    canvas2d.renderAll();
    _updateFloatToolbar();
  });
}

function _updateFloatToolbar() {
  const toolbar  = document.getElementById('float-toolbar');
  const canvasEl = document.getElementById('canvas-2d');
  if (!toolbar || !canvasEl || !canvas2d) return;
  const obj = canvas2d.getActiveObject();
  if (!obj) { _hideFloatToolbar(); return; }
  obj.setCoords();
  const br = obj.getBoundingRect(true, true);
  const scaleX = canvasEl.offsetWidth  / canvas2d.getWidth();
  const scaleY = canvasEl.offsetHeight / canvas2d.getHeight();
  const objCenterX = canvasEl.offsetLeft + (br.left + br.width  / 2) * scaleX;
  const objTopY    = canvasEl.offsetTop  +  br.top * scaleY - 44;
  toolbar.style.left    = objCenterX + 'px';
  toolbar.style.top     = Math.max(4, objTopY) + 'px';
  toolbar.style.display = 'flex';
}

function _hideFloatToolbar() {
  const t = document.getElementById('float-toolbar');
  if (t) t.style.display = 'none';
}

// ─── 草稿自動儲存（localStorage）─────────────────────────────
function _draftKey() {
  return `yangzhu_draft_${STATE.productId}_${STATE.materialId || ''}`;
}
function _saveDraft() {}
function _loadDraft()  { _clearDraft(); }
function _clearDraft() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('yangzhu_draft_'))
      .forEach(k => localStorage.removeItem(k));
  } catch(e) {}
}

async function _refreshLiveMockup() {
  const mc = document.getElementById('live-mockup-canvas');
  const ml = document.getElementById('live-mockup-loading');
  if (!mc) return;
  const dataURL = get2DDataURLTransparent() || get2DDataURL();
  if (!dataURL) return;
  if (ml) ml.style.display = '';
  mc.style.display = 'none';
  const colorId = STATE.materialId || 'oat_tea';
  const result = await renderMockup(colorId, dataURL);
  if (!result) return;
  mc.width  = result.width;
  mc.height = result.height;
  mc.getContext('2d').drawImage(result, 0, 0);
  if (ml) ml.style.display = 'none';
  mc.style.display = '';
}

// 背景預設色套用
function applyBgPreset(color) {
  STATE.bgColor = color;
  const picker = document.getElementById('design-bgcolor');
  if (picker) picker.value = color;
  setBackground2D(color);
}

// ─── Step 4：預覽 ──────────────────────────────────────────
function initPreviewStep() {
  const isThermos = STATE.productId === 'thermos';
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || (STATE.productId === 'biz_card' && (
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
  ));
  const flatEl    = document.getElementById('preview-flat');
  const mockupDiv = document.getElementById('preview-mockup');
  const btnMockup = document.getElementById('btn-download-mockup');
  const dataURL   = get2DDataURL();
  if (dataURL) STATE.designDataURL = dataURL;

  // 商品連結按鈕
  const btnLink = document.getElementById('btn-product-link');
  if (btnLink) {
    const p = PRODUCTS[STATE.productId];
    if (p && p.url) { btnLink.href = p.url; btnLink.style.display = ''; }
    else             { btnLink.style.display = 'none'; }
  }

  if (isThermos) {
    // 隨行杯：直接展示帶瓶身背景的 canvas 匯出圖
    if (flatEl)    flatEl.style.display    = '';
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) btnMockup.style.display = '';
    if (flatEl && dataURL) {
      flatEl.innerHTML = `<img src="${dataURL}" style="max-width:280px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);">`;
    }
  } else if (isUploadOnly && typeof get2DDataURLWithFrame === 'function') {
    // 卡片上傳模式：非同步合成框線後顯示
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) btnMockup.style.display = '';
    if (flatEl) flatEl.innerHTML = '<p style="color:var(--gray-400);">載入中...</p>';
    get2DDataURLWithFrame().then(frameURL => {
      if (frameURL) STATE.designDataURL = frameURL;
      if (flatEl) {
        let _imgStyle;
        if (STATE.productId === 'biz_leather_round') {
          _imgStyle = 'max-width:320px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);';
        } else {
          const _isPortrait = STATE.orientationId === 'portrait';
          _imgStyle = _isPortrait
            ? 'max-width:314px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);'
            : 'max-width:480px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);';
        }
        flatEl.innerHTML = frameURL
          ? `<img src="${frameURL}" style="${_imgStyle}">`
          : '<p style="color:var(--gray-400);">尚無設計圖，請返回編輯。</p>';
      }
    });
  } else {
    // 其他商品（馬克杯等）：顯示平面設計圖 + 設計稿確認送出
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) btnMockup.style.display = '';
    if (flatEl && dataURL) {
      const _imgW = STATE.productId === 'biz_card' ? '480px' : '100%';
      flatEl.innerHTML = `<img src="${dataURL}" style="max-width:${_imgW};width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);">`;
    } else if (flatEl) {
      flatEl.innerHTML = '<p style="color:var(--gray-400);">尚無設計圖，請返回編輯。</p>';
    }
  }
}

async function _buildMockup(designDataURL) {
  STATE._mockupReady = false;
  const colorId = STATE.materialId || 'oat_tea';
  // 使用透明底版本，讓設計直接融入瓶身
  const transparentDataURL = get2DDataURLTransparent() || designDataURL;
  try {
    const mc = document.getElementById('mockup-canvas');
    const ml = document.getElementById('mockup-loading');
    if (ml) ml.style.display = '';
    if (mc) mc.style.display = 'none';

    const result = await renderMockup(colorId, transparentDataURL);
    if (!result) return;

    if (mc) {
      mc.width  = result.width;
      mc.height = result.height;
      mc.getContext('2d').drawImage(result, 0, 0);
      mc.style.width  = Math.round(result.width  * 0.33) + 'px';
      mc.style.height = Math.round(result.height * 0.33) + 'px';
      mc.style.display = '';
      STATE._mockupReady = true;
      STATE._mockupCanvas = result;
    }
    if (ml) ml.style.display = 'none';
    const btnMockup = document.getElementById('btn-download-mockup');
    if (btnMockup) btnMockup.style.display = '';
  } catch(e) {
    console.warn('[mockup]', e);
  }
}

function downloadMockup() {
  const c = STATE._mockupCanvas;
  if (!c) { alert('效果圖尚未合成完成'); return; }
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `楊竹效果圖-${STATE.materialId || 'thermos'}.png`;
  a.click();
}


// Google Apps Script 網頁應用程式 URL（部署後填入）
const DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxfzeV4SS_VEWHQhNO-GzkF2UUknXg30NYqXY_xXvAqvIZO8A0Bhgp6AEKJuRcMwM85hA/exec';

async function _uploadWithRetry(url, formData, maxRetries = 3) {
  // sendBeacon：瀏覽器原生可靠傳送，無逾時限制、無 CORS 問題
  if (typeof navigator.sendBeacon === 'function') {
    const beaconOk = navigator.sendBeacon(url, formData);
    if (beaconOk) return true;
  }
  // fallback：fetch 重試
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      await fetch(url, { method: 'POST', mode: 'no-cors', body: formData, signal: ctrl.signal });
      clearTimeout(timer);
      return true;
    } catch (e) {
      console.warn('[upload] attempt', i + 1, 'failed:', e.name, e.message);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}

async function submitDesign() {
  const p   = PRODUCTS[STATE.productId];
  if (!p) return;
  const mat = p.materials.find(m => m.id === STATE.materialId) || p.materials[0];

  // 日期 YYYYMMDD
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  // 序號：每日從 001 重新計，跨產品全域計數
  const SEQ_KEY  = 'yangzhu_submit_seq';
  const DATE_KEY = 'yangzhu_submit_date';
  const savedDate = localStorage.getItem(DATE_KEY);
  const seq = (savedDate === dateStr) ? parseInt(localStorage.getItem(SEQ_KEY) || '0') + 1 : 1;
  localStorage.setItem(DATE_KEY, dateStr);
  localStorage.setItem(SEQ_KEY, seq);
  const seqStr = String(seq).padStart(3, '0');

  const filename = `${p.name}-${mat.name}-${dateStr}-${seqStr}`;

  const btn = document.getElementById('btn-download-mockup');
  if (btn) { btn.innerHTML = '⏳ 產生中...'; btn.disabled = true; }

  try {
    let svg = null;
    // 卡片橫式上傳模式：優先呼叫 preview2d.js 的專屬函式（照片+向量框線，不走 canvas 渲染）
    const _isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || (STATE.productId === 'biz_card' && (
      (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
      (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
    ));
    if (_isUploadOnly) {
      if (STATE.productId === 'biz_leather_round' && typeof getUploadOnlyRoundSVG === 'function') {
        svg = getUploadOnlyRoundSVG();
      } else if (STATE.productId === 'biz_leather_omamori' && typeof getUploadOnlyOmamoriSVG === 'function') {
        svg = getUploadOnlyOmamoriSVG();
      } else if (typeof getUploadOnlySVG === 'function') {
        svg = getUploadOnlySVG();
      }
    }
    // 其餘商品走一般流程
    if (!svg && typeof get2DSVGOutlined === 'function') {
      try { svg = await get2DSVGOutlined(); } catch(e) { console.warn('[submit] outline failed', e); }
    }
    if (!svg && STATE.productId === 'thermos' && typeof get2DLabelDataURL === 'function') {
      const labelPNG = get2DLabelDataURL();
      if (labelPNG) {
        svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="85mm" height="46.5mm"><image xlink:href="${labelPNG}" width="85mm" height="46.5mm"/></svg>`;
      }
    }
    if (!svg) svg = (typeof get2DSVG === 'function') ? get2DSVG() : null;
    if (svg && DRIVE_SCRIPT_URL && DRIVE_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL') {
      const fd = new FormData();
      fd.append('filename', filename + '.svg');
      fd.append('svg', svg);
      const statusEl = document.getElementById('upload-status');
      if (statusEl) { statusEl.textContent = '📤 傳送中...'; statusEl.style.color = 'var(--gray-500)'; }
      _uploadWithRetry(DRIVE_SCRIPT_URL, fd).then(ok => {
        if (!statusEl) return;
        if (ok) {
          statusEl.textContent = '';
          if (btn) btn.style.display = 'none';
        } else {
          statusEl.textContent = '⚠️ 傳送失敗，請截圖序號後告知設計師手動處理';
          statusEl.style.color = '#e53e3e';
          if (btn) { btn.innerHTML = '✉ 重新送出'; btn.disabled = false; }
        }
      });
    }
  } catch(e) {
    console.error('[submitDesign]', e);
  }

  // 顯示序號在 Step 4
  STATE.submittedFilename = filename;
  if (btn) { btn.innerHTML = '✉ 設計稿確認送出'; btn.disabled = false; }
  const resultDiv = document.getElementById('submit-result');
  const nameEl    = document.getElementById('submit-order-name');
  if (nameEl)    nameEl.textContent  = filename;
  if (resultDiv) resultDiv.style.display = '';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function sendInquiry() {
  const p   = PRODUCTS[STATE.productId];
  if (!p) return;
  const mat = p.materials.find(m => m.id === STATE.materialId) || p.materials[0];
  const fin = p.finishes.find(f => f.id === STATE.finishId)     || p.finishes[0];
  const cap = p.capacities ? (p.capacities.find(c => c.id === STATE.capacityId) || p.capacities[0]) : null;
  const q   = calcQuote(STATE.productId, STATE.materialId, STATE.finishId, STATE.qty, STATE.capacityId);

  const subject = encodeURIComponent(`[楊竹科技詢價] ${p.name} × ${STATE.qty} 個`);
  const body = encodeURIComponent(
`楊竹科技線上詢價單
==================
產品：${p.name}
${p.materialLabel || '材質'}：${mat.name}
工藝：${fin.name}${cap ? `\n容量：${cap.name}` : ''}
數量：${STATE.qty.toLocaleString()} 個
預估總計：${p.noPrice ? '請洽詢報價' : `NT$ ${q ? q.total.toLocaleString() : '--'}（未稅，含製版費）`}

--
此詢價單由楊竹科技線上配置器自動產生
`);
  window.location.href = `mailto:sales@yangzhu.com.tw?subject=${subject}&body=${body}`;
}

// ─── 初始化 ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 渲染產品卡片
  renderProductGrid(null);

  // 綁定規格步驟事件（在切到 Step 2 時 render）
  document.querySelectorAll('.step-panel').forEach(panel => {
    if (panel.dataset.step == 2) {
      // 由 goStep 呼叫 renderSpecStep
    }
  });

  renderStep();
});

// 顏色/規格預覽圖切換
function _updateColorPreview(p) {
  const wrap = document.getElementById('spec-color-preview');
  const img  = document.getElementById('spec-color-img');
  const name = document.getElementById('spec-color-name');
  if (!wrap || !img) return;

  // 優先：material + orientation 組合圖
  const comboKey = STATE.materialId + '_' + STATE.orientationId;
  if (p.orientationImages && STATE.orientationId && p.orientationImages[comboKey]) {
    const mat = p.materials.find(m => m.id === STATE.materialId);
    const ori = p.orientations && p.orientations.find(o => o.id === STATE.orientationId);
    img.src = p.orientationImages[comboKey];
    if (name) name.textContent = (mat ? mat.name : '') + (ori ? ' ' + ori.name : '');
    wrap.style.display = 'block';
    return;
  }

  // 次之：單一 material 圖
  const mat = p.materials.find(m => m.id === STATE.materialId);
  if (mat && mat.image) {
    img.src = mat.image;
    if (name) name.textContent = mat.name;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

// Step 2 切入時需重新渲染
const _origGoStep = goStep;
