// 步驟式圖文編輯主邏輯

function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const STATE = {
  step: 1,
  productId: null,
  materialId: null,
  finishId: null,
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

// ─── 步驟導覽 ──────────────────────────────────────────────
function getTotalSteps() {
  return (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') ? 5 : 4;
}

function renderStepIndicator() {
  const isThick = STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic';
  const labels = isThick
    ? ['選商品', '選規格', '去背編輯', '生產刀模', '確認送出']
    : ['選商品', '選規格', '編輯', '確認送出'];
  const el = document.querySelector('.step-indicator');
  if (!el) return;
  el.innerHTML = labels.map((label, i) => {
    const n = i + 1;
    const cls = n === STATE.step ? ' active' : n < STATE.step ? ' done' : '';
    return (i > 0 ? '<div class="step-line"></div>' : '') +
      `<div class="step${cls}" data-step="${n}">` +
      `<div class="step-dot" onclick="goStep(${n})">${n}</div>` +
      `<div class="step-label">${label}</div></div>`;
  }).join('');
}

function goStep(n) {
  if (n < 1 || n > getTotalSteps()) return;
  if (n > 1 && !STATE.productId) { alert('請先選擇產品'); return; }
  if (n > 2 && !STATE.materialId) { alert('請先完成規格選擇'); return; }

  // 離開設計步驟前快照
  if (STATE.step === 3 || ((STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') && STATE.step === 4)) {
    STATE.designDataURL = (typeof get2DDataURL === 'function') ? get2DDataURL() : null;
    if (['thermos', 'mug', 'power_bank'].includes(STATE.productId) && typeof canvas2d !== 'undefined' && canvas2d) {
      STATE.canvasJSON = canvas2d.toJSON(['name', 'padding', 'lineHeight']);
    }
  }

  STATE.step = n;
  renderStep();
}

function nextStep() { goStep(STATE.step + 1); }
function prevStep() { goStep(STATE.step - 1); }

function renderStep() {
  renderStepIndicator();

  const isThick = STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic';
  const diecutPanel = document.getElementById('panel-diecut');

  // 顯示對應面板
  document.querySelectorAll('.step-panel').forEach(el => {
    if (isThick && STATE.step === 4) {
      el.classList.add('hidden');                              // 刀模步驟：隱藏所有 step-panel
    } else if (isThick && STATE.step === 5) {
      el.classList.toggle('hidden', el.dataset.step !== '4'); // biz_thick 步驟5 = data-step=4 的 preview panel
    } else {
      el.classList.toggle('hidden', el.dataset.step != STATE.step);
    }
  });

  if (diecutPanel) diecutPanel.classList.toggle('hidden', !(isThick && STATE.step === 4));

  // 初始化各步驟
  if (STATE.step === 2) renderSpecStep();
  if (STATE.step === 3) initDesignStep();
  if (isThick && STATE.step === 4) initDieCutStep();
  if ((!isThick && STATE.step === 4) || (isThick && STATE.step === 5)) initPreviewStep();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── 生產刀模步驟（biz_thick step 4）─────────────────────────
function initDieCutStep() {
  // 同步邊距滑桿
  const rmbgSlider = document.getElementById('rmbg-margin');
  const dcSlider   = document.getElementById('diecut-margin');
  const dcVal      = document.getElementById('diecut-margin-val');
  if (rmbgSlider && dcSlider) {
    dcSlider.value = rmbgSlider.value;
    if (dcVal) dcVal.textContent = rmbgSlider.value + 'px';
  }

  // 【嚴守商品隔離：只在 biz_thick 厚切電子票證顯示整體尺寸縮放滑桿】
  const maxSizeContainer = document.getElementById('diecut-max-size-container');
  if (maxSizeContainer) {
    maxSizeContainer.style.display = (typeof STATE !== 'undefined' && STATE.productId === 'biz_thick') ? 'block' : 'none';
  }

  const noPreview = document.getElementById('diecut-no-preview');
  const img       = document.getElementById('diecut-preview-img');

  if (typeof _thickDieCutContour !== 'undefined' && _thickDieCutContour) {
    // 刀模已有：直接截圖顯示
    if (noPreview) noPreview.style.display = 'none';
    _refreshDiecutPreview();
  } else if (typeof _lastUploadedDataURL !== 'undefined' && _lastUploadedDataURL) {
    // 有上傳圖但沒跑過去背：自動觸發
    if (noPreview) noPreview.style.display = 'none';
    regenDieCut();
  } else {
    // 完全沒有圖片
    if (img) img.style.display = 'none';
    if (noPreview) noPreview.style.display = '';
  }
}

// ─── 以下舊有 JS 輪廓繪製函式群已移除（biz_thick 升級為後端 API 模式）──────────
// 移除：_drawSmooth (Catmull-Rom 平滑), _contourToCanvasPts (輪廓座標轉換)
// 移除：_getHolePos (孔位計算), _drawDiecutWithHole (細頸孔繪製)
// 移除：_refreshDiecutPreview (JS輪廓截圖), _overlayThickDiecut (JS輪廓疊加)
// 以上功能現在全部由後端 Python API 處理，結果以圖片形式直接回傳。
// 相關函式已在 rembg_client.js v2 重新實作（_refreshDiecutPreview, _overlayThickDiecut）
// ────────────────────────────────────────────────────────────────────────────

// ─── regenDieCut（biz_thick 後端 API 模式）──────────────────────────────────
async function regenDieCut() {
  const btn      = document.getElementById('btn-regen-diecut');
  const status   = document.getElementById('diecut-status');
  const slider   = document.getElementById('diecut-margin');
  const marginPx = slider ? parseInt(slider.value) : 15;

  // 同步回 rmbg-section 的滑桿
  const rmbgSlider = document.getElementById('rmbg-margin');
  const rmbgVal    = document.getElementById('rmbg-margin-val');
  if (rmbgSlider) rmbgSlider.value = marginPx;
  if (rmbgVal)    rmbgVal.textContent = marginPx + 'px';

  if (typeof _lastUploadedDataURL === 'undefined' || !_lastUploadedDataURL) {
    if (status) status.textContent = '請先在步驟三上傳圖片並執行去背';
    return;
  }

  if (btn) btn.disabled = true;
  if (status) status.textContent = '連線後端 GPU 引擎中…';

  try {
    const holePosEl  = document.getElementById('diecut-hole-pos');
    const holePosVal = holePosEl ? holePosEl.value : '0.5';

    if (typeof _lastRembgDataURL !== 'undefined' && _lastRembgDataURL) {
      // 已有去背結果：只重算刀模外框與打孔耳朵（呼叫後端 /api/preview_die）
      const data = await calcContourOnlyClient(_lastRembgDataURL, marginPx, holePosVal);
      if (!data.success) throw new Error(data.error);
      _refreshDiecutPreview();
      if (status) status.textContent = '✅ 刀模已更新！';
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } else {
      // 首次：呼叫後端去背 + 刀模預覽 API
      const data = await removeBgWithContourClient(
        _lastUploadedDataURL,
        marginPx,
        (msg) => { if (status) status.textContent = msg; }
      );
      if (!data.success) throw new Error(data.error);

      _lastRembgDataURL = data.imageDataURL;

      // 更新 canvas 圖片物件（使用後端去背結果）
      if (typeof canvas2d !== 'undefined' && canvas2d) {
        const imgObj = canvas2d.getObjects().find(o => o.type === 'image' && o.selectable !== false);
        if (imgObj) {
          fabric.Image.fromURL(data.imageDataURL, newImg => {
            newImg.set({
              left: imgObj.left, top: imgObj.top,
              scaleX: imgObj.scaleX * (imgObj.width / newImg.width),
              scaleY: imgObj.scaleY * (imgObj.height / newImg.height),
              originX: imgObj.originX, originY: imgObj.originY,
              clipPath: imgObj.clipPath, selectable: true
            });
            canvas2d.remove(imgObj);
            canvas2d.add(newImg);
            canvas2d.sendToBack(newImg);
            _refreshDiecutPreview();
            if (status) status.textContent = '✅ 刀模已更新！';
            setTimeout(() => { if (status) status.textContent = ''; }, 3000);
          }, { crossOrigin: 'anonymous' });
          return; // 等 fabric.Image.fromURL callback 執行
        }
      }
      _refreshDiecutPreview();
      if (status) status.textContent = '✅ 刀模已更新！';
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    }
  } catch (err) {
    if (status) status.textContent = '❌ 失敗：' + (err.message || err);
    console.error('[regenDieCut]', err);
  } finally {
    if (btn) btn.disabled = false;
  }
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
      onclick = p.password
        ? `promptPassword('${p.id}', () => selectProduct('${p.id}'))`
        : `selectProduct('${p.id}')`;
    }

    const badgeHtml = p.badge
      ? `<div class="product-badge" style="background:${p.badgeColor || '#888'}">${p.password ? '🔒 ' : ''}${p.badge}</div>`
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
  STATE.canvasJSON = null; // 切換商品時清除上一個商品的設計內容

  document.querySelectorAll('.product-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.productId === productId);
  });

  // 預設第一個材質/工藝
  const p = PRODUCTS[productId];
  STATE.materialId = p.materials[0].id;
  STATE.finishId   = p.finishes[0].id;
  if (p.orientations)  STATE.orientationId = p.orientations[0].id;

  _preloadProductAssets(productId);
  nextStep();
}

function _preloadProductAssets(productId) {
  const p = PRODUCTS[productId];
  if (!p) return;
  const urls = [];

  // 材質預覽圖
  (p.materials || []).forEach(m => { if (m.image) urls.push(m.image); });

  // 方向組合圖
  if (p.orientationImages) {
    Object.values(p.orientationImages).forEach(u => urls.push(u));
  }

  // SVG 框線（biz_card / biz_leather_round / biz_leather_omamori / biz_lightbox / biz_thick）
  if (productId === 'biz_card') {
    urls.push('assets/card_portrait_frame.svg', 'assets/card_landscape_frame.svg');
  } else if (productId === 'biz_leather_round') {
    urls.push('assets/leather_round_easycard_frame.svg', 'assets/leather_round_ipass_frame.svg');
  } else if (productId === 'biz_leather_omamori') {
    urls.push('assets/leather_omamori_easycard_frame.svg', 'assets/leather_omamori_ipass_frame.svg');
  } else if (productId === 'biz_lightbox') {
    urls.push('assets/lightbox_frame.svg');
  } else if (productId === 'biz_thick') {
    urls.push('assets/thick_frame.svg');
  } else if (productId === 'biz_acrylic') {
    urls.push('assets/acrylic_frame.svg');
  }

  urls.forEach(url => { const i = new Image(); i.src = url; });
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
    });
  });

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

}

// ─── Step 3：設計 ──────────────────────────────────────────
const _TEXT_COLORS = [
  '#FFDD00','#E8A020','#F08000','#D84020','#C82020','#F080A0','#F040A0','#C00060',
  '#800020','#600040','#800080','#600060','#4040C0','#202080','#000060','#60A0E0',
  '#2060E0','#2040A0','#202060','#00A080','#40A040','#207040','#004020','#FFFFFF',
  '#E0E0E0','#808080','#000000','#606040'
];

function initDesignStep() {
  // 步驟3下一步按鈕文字（biz_thick 下一步是生產刀模）
  const nextBtn = document.getElementById('btn-step3-next');
  if (nextBtn) nextBtn.textContent = (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') ? '前往生產刀模 →' : '前往確認 →';

  const isThermos = STATE.productId === 'thermos' || STATE.productId === 'mug' || STATE.productId === 'power_bank';

  // 上傳框線模式：biz_card（橫式／直式）、biz_leather_round、biz_leather_omamori、biz_lightbox、biz_thick 或 biz_acrylic
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || STATE.productId === 'biz_lightbox' || STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic' || (STATE.productId === 'biz_card' && (
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

    if (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') {
      canvas2d.backgroundColor = null;
      if (canvas2d.wrapperEl) {
        canvas2d.wrapperEl.style.backgroundImage = 'linear-gradient(45deg, #e4e4e4 25%, transparent 25%), linear-gradient(-45deg, #e4e4e4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e4e4 75%), linear-gradient(-45deg, transparent 75%, #e4e4e4 75%)';
        canvas2d.wrapperEl.style.backgroundSize = '20px 20px';
        canvas2d.wrapperEl.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0';
        canvas2d.wrapperEl.style.backgroundColor = '#ffffff';
        canvas2d.wrapperEl.style.borderRadius = '12px';
        canvas2d.wrapperEl.style.boxShadow = '0 4px 24px rgba(0,0,0,0.12)';
      }
      canvas2d.renderAll();
    } else {
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
        _svgFrame.src = STATE.materialId === 'ipass'
          ? 'assets/leather_round_ipass_frame.svg'
          : 'assets/leather_round_easycard_frame.svg';
      } else if (STATE.productId === 'biz_leather_omamori') {
        _svgFrame.src = STATE.materialId === 'ipass'
          ? 'assets/leather_omamori_ipass_frame.svg'
          : 'assets/leather_omamori_easycard_frame.svg';
      } else if (STATE.productId === 'biz_lightbox') {
        _svgFrame.src = 'assets/lightbox_frame.svg';
      } else {
        _svgFrame.src = STATE.orientationId === 'portrait'
          ? 'assets/card_portrait_frame.svg'
          : 'assets/card_landscape_frame.svg';
      }
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

  // 去背按鈕（僅 biz_thick 顯示）
  const rmbgSection = document.getElementById('rmbg-section');
  if (rmbgSection) rmbgSection.style.display = (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') ? '' : 'none';

  // 鏡射／複製按鈕（僅 biz_lightbox 顯示）
  const mirrorBtn = document.getElementById('btn-mirror-lightbox');
  if (mirrorBtn) mirrorBtn.style.display = STATE.productId === 'biz_lightbox' ? '' : 'none';
  const copyBtn = document.getElementById('btn-copy-lightbox');
  if (copyBtn) copyBtn.style.display = STATE.productId === 'biz_lightbox' ? '' : 'none';

  // 旋轉滑桿（僅 biz_lightbox 顯示）
  const rotateSection = document.getElementById('rotate-slider-section');
  if (rotateSection) rotateSection.style.display = (isUploadOnly && STATE.productId !== 'biz_thick') ? '' : 'none';
  const rotateSlider = document.getElementById('rotate-slider');
  const rotateDisplay = document.getElementById('rotate-value-display');
  if (rotateSlider) rotateSlider.value = 0;
  if (rotateDisplay) rotateDisplay.textContent = '0°';

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
  if (bgSection) bgSection.style.display = (isThermos || isUploadOnly || STATE.productId === 'biz_thick') ? 'none' : '';

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
  const _curMat = _activeProduct && _activeProduct.materials && _activeProduct.materials.find(m => m.id === STATE.materialId);
  const _colorPalette = (_curMat && _curMat.textColors) ? _curMat.textColors :
                        (_activeProduct && _activeProduct.textColors) ? _activeProduct.textColors : _TEXT_COLORS;
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
    if (c.toUpperCase() === '#FFFFFF') d.style.border = '1.5px solid #000';
    d.addEventListener('click', () => onClick(c));
    el.appendChild(d);
  });
}

function _getDefaultTextColor() {
  const _prod = PRODUCTS[STATE.productId];
  const _mat  = _prod && _prod.materials && _prod.materials.find(m => m.id === STATE.materialId);
  return (_mat  && _mat.textColors  && _mat.textColors[0])  ||
         (_prod && _prod.textColors && _prod.textColors[0]) || '#333333';
}

function addFreeText() {
  if (!canvas2d) return;
  const font = document.getElementById('free-font-select')?.value || '(中英)標準體';
  addText2D('新增文字', _getDefaultTextColor(), null, font, 'ft_' + Date.now());
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

async function pasteText2D() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch(e) {
    const fallback = prompt('請貼上文字（自動剪貼簿存取失敗）：');
    if (fallback) text = fallback;
  }
  text = (text || '').trim();
  if (!text) return;
  if (!canvas2d) return;
  const obj = canvas2d.getActiveObject();
  if (obj && obj.type === 'textbox') {
    if (!obj.isEditing) obj.enterEditing();
    obj.insertChars(text);
    canvas2d.requestRenderAll();
  } else {
    const font = document.getElementById('free-font-select')?.value || '(中英)標準體';
    addText2D(text, _getDefaultTextColor(), null, font, 'ft_' + Date.now());
  }
}

function _syncTextPropsPanel(obj) {
  const propsPanel = document.getElementById('panel-text-props');
  const addPanel   = document.getElementById('panel-add');
  const isText = obj && obj.type === 'textbox';

  // 上傳模式：不顯示任何文字功能
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || STATE.productId === 'biz_lightbox' || STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic' || (STATE.productId === 'biz_card' && (
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


// 背景預設色套用
function applyBgPreset(color) {
  STATE.bgColor = color;
  const picker = document.getElementById('design-bgcolor');
  if (picker) picker.value = color;
  setBackground2D(color);
}

// ─── Step 4：預覽 ──────────────────────────────────────────
function initPreviewStep() {
  const titleEl = document.getElementById('step4-title');
  const descEl  = document.getElementById('step4-desc');
  const thickPanel = document.getElementById('thick-submit-panel');
  const flatEl    = document.getElementById('preview-flat');
  const mockupDiv = document.getElementById('preview-mockup');
  const btnMockup = document.getElementById('btn-download-mockup');

  if (STATE.productId === 'biz_thick') {
    if (titleEl) titleEl.textContent = '設計確認與檔案輸出';
    if (descEl)  descEl.textContent  = '確認無誤後將自動產生 SVG 打印刀模圖，並存入本地資料夾。';
    if (thickPanel) thickPanel.style.display = 'none';
    if (flatEl) {
      flatEl.style.display = '';
      const previewImg = (typeof _thickDieCutOverlayURL !== 'undefined' && _thickDieCutOverlayURL) ? _thickDieCutOverlayURL : (STATE.designDataURL || '');
      flatEl.innerHTML = previewImg
        ? `<div style="margin-bottom:12px;font-size:14px;font-weight:700;color:var(--gray-700);">打印刀模圖預覽</div><img src="${previewImg}" style="max-width:320px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);background:#fff;padding:16px;">`
        : '<p style="color:var(--gray-400);">已準備好刀模數據，請點擊下方送出。</p>';
    }
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) { btnMockup.style.display = ''; btnMockup.innerHTML = '✉ 設計稿確認送出'; btnMockup.disabled = false; }
    return;
  } else {
    if (titleEl) titleEl.textContent = '設計確認';
    if (descEl)  descEl.textContent  = '確認無誤後送出並序號截圖';
    if (thickPanel) thickPanel.style.display = 'none';
    if (flatEl)    flatEl.style.display    = '';
  }

  const isThermosLike = ['thermos', 'mug', 'power_bank'].includes(STATE.productId);
  const isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || STATE.productId === 'biz_lightbox' || STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic' || (STATE.productId === 'biz_card' && (
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
    (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
  ));
  const dataURL   = get2DDataURL();
  if (dataURL) STATE.designDataURL = dataURL;

  // 商品連結按鈕
  const btnLink = document.getElementById('btn-product-link');
  if (btnLink) {
    const p = PRODUCTS[STATE.productId];
    if (p && p.url) { btnLink.href = p.url; btnLink.style.display = ''; }
    else             { btnLink.style.display = 'none'; }
  }

  if (isThermosLike) {
    // 隨行杯／馬克杯／行動電源：畫面顯示不含框線的底圖，同時背景產生含框版本供送出用
    if (flatEl)    flatEl.style.display    = '';
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) btnMockup.style.display = '';
    if (flatEl) {
      flatEl.innerHTML = dataURL
        ? `<img src="${dataURL}" style="max-width:280px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);">`
        : '<p style="color:var(--gray-400);">尚無設計圖，請返回編輯。</p>';
    }
    if (typeof get2DDataURLWithFrame === 'function') {
      get2DDataURLWithFrame().then(frameURL => { if (frameURL) STATE.designDataURL = frameURL; });
    }
  } else if (isUploadOnly && typeof get2DDataURLWithFrame === 'function') {
    // 卡片上傳模式：非同步合成框線後顯示
    if (mockupDiv) mockupDiv.style.display = 'none';
    if (btnMockup) btnMockup.style.display = '';
    if (flatEl) flatEl.innerHTML = '<p style="color:var(--gray-400);">載入中...</p>';
    get2DDataURLWithFrame().then(async (frameURL) => {
      // 厚切／壓克力票證：疊加刀模輪廓到確認預覽圖上
      if (frameURL && (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic')) {
        frameURL = await _overlayThickDiecut(frameURL);
      }
      if (frameURL) STATE.designDataURL = frameURL;
      if (flatEl) {
        let _imgStyle;
        if (STATE.productId === 'biz_leather_round') {
          _imgStyle = 'max-width:320px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);';
        } else if (STATE.productId === 'biz_lightbox') {
          _imgStyle = 'max-width:480px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);';
        } else if (STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic') {
          _imgStyle = 'max-width:280px;width:100%;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);';
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
    // 其他商品（biz_card 等）：顯示平面設計圖 + 設計稿確認送出
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

async function copyOrderName() {
  const name = STATE.submittedFilename || '';
  if (!name) return;
  const btn = document.getElementById('btn-copy-order');
  try {
    await navigator.clipboard.writeText(name);
    if (btn) { btn.textContent = '已複製 ✓'; setTimeout(() => { btn.textContent = '複製'; }, 2000); }
  } catch(e) {
    const el = document.getElementById('submit-order-name');
    if (el) {
      const r = document.createRange();
      r.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
    }
  }
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
  const SEQ_KEY  = 'songli_submit_seq';
  const DATE_KEY = 'songli_submit_date';
  const savedDate = localStorage.getItem(DATE_KEY);
  const seq = (savedDate === dateStr) ? parseInt(localStorage.getItem(SEQ_KEY) || '0') + 1 : 1;
  localStorage.setItem(DATE_KEY, dateStr);
  localStorage.setItem(SEQ_KEY, seq);
  const seqStr = String(seq).padStart(3, '0');

  const filename = `${p.name}-${mat.name}-${dateStr}-${seqStr}`;

  if (STATE.productId === 'biz_thick') {
    return await submitThickDesign(filename);
  }

  const btn = document.getElementById('btn-download-mockup');
  if (btn) { btn.innerHTML = '⏳ 產生中...'; btn.disabled = true; }

  try {
    let svg = null;
    // 卡片橫式上傳模式：優先呼叫 preview2d.js 的專屬函式（照片+向量框線，不走 canvas 渲染）
    const _isUploadOnly = STATE.productId === 'biz_leather_round' || STATE.productId === 'biz_leather_omamori' || STATE.productId === 'biz_lightbox' || STATE.productId === 'biz_thick' || STATE.productId === 'biz_acrylic' || (STATE.productId === 'biz_card' && (
      (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'landscape') ||
      (['easycard', 'ipass', 'super_easycard'].includes(STATE.materialId) && STATE.orientationId === 'portrait')
    ));
    if (_isUploadOnly) {
      if (STATE.productId === 'biz_leather_round' && typeof getUploadOnlyRoundSVG === 'function') {
        svg = await getUploadOnlyRoundSVG();
      } else if (STATE.productId === 'biz_leather_omamori' && typeof getUploadOnlyOmamoriSVG === 'function') {
        svg = await getUploadOnlyOmamoriSVG();
      } else if (STATE.productId === 'biz_lightbox' && typeof getUploadOnlyLightboxSVG === 'function') {
        svg = await getUploadOnlyLightboxSVG();
      } else if (STATE.productId === 'biz_thick' && typeof getUploadOnlyThickSVG === 'function') {
        svg = getUploadOnlyThickSVG();
      } else if (STATE.productId === 'biz_acrylic' && typeof getUploadOnlyAcrylicSVG === 'function') {
        svg = getUploadOnlyAcrylicSVG();
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
    // 隨行杯／馬克杯／行動電源：覆寫送出檔為底圖+紅框+文字向量的分層 SVG
    if (['thermos', 'mug', 'power_bank'].includes(STATE.productId) && typeof get2DLayeredSVG === 'function') {
      const _layeredSVG = await get2DLayeredSVG();
      if (_layeredSVG) svg = _layeredSVG;
    }
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

// ─── 厚切專屬：AI 渲染開關與送出函式 (嚴格商品隔離) ──────────────────────
function updateThickToggle(chk) {
  const slider = document.getElementById('thick-toggle-slider');
  const knob   = document.getElementById('thick-toggle-knob');
  if (chk.checked) {
    slider.style.backgroundColor = 'var(--green)';
    knob.style.transform = 'translateX(22px)';
  } else {
    slider.style.backgroundColor = '#ccc';
    knob.style.transform = 'translateX(0)';
  }
}

async function submitThickDesign(filename) {
  const btn = document.getElementById('btn-download-mockup');
  if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 刀模檔案處理中...'; btn.disabled = true; }

  const placeholder = document.getElementById('thick-mockup-placeholder');
  const imgEl       = document.getElementById('thick-final-mockup');
  const successBox  = document.getElementById('thick-save-success');
  if (placeholder) placeholder.style.display = 'none';
  if (imgEl) imgEl.style.display = 'none';
  if (successBox) successBox.style.display = 'none';

  const chk = document.getElementById('thick-use-ai');
  const useAi = chk ? chk.checked : false;

  const formData = new FormData();
  if (typeof _lastRembgBlob !== 'undefined' && _lastRembgBlob) {
    formData.append('image', _lastRembgBlob, 'cutout.png');
  } else if (typeof _lastRembgDataURL !== 'undefined' && _lastRembgDataURL) {
    const res = await fetch(_lastRembgDataURL);
    const blob = await res.blob();
    formData.append('image', blob, 'cutout.png');
  } else if (typeof _lastUploadedFile !== 'undefined' && _lastUploadedFile) {
    formData.append('image', _lastUploadedFile, _lastUploadedFile.name || 'cutout.png');
  } else if (STATE.designDataURL) {
    const res = await fetch(STATE.designDataURL);
    const blob = await res.blob();
    formData.append('image', blob, 'cutout.png');
  } else {
    alert('找不到去背圖，請返回上一步重新建立');
    if (btn) { btn.innerHTML = '✉ 設計稿確認送出'; btn.disabled = false; }
    return;
  }

  const maxSizeSlider = document.getElementById('diecut-max-size');
  const marginSlider  = document.getElementById('diecut-margin');
  const holePosSlider = document.getElementById('diecut-hole-pos');

  const marginPx = marginSlider ? parseFloat(marginSlider.value) : 15;
  const marginMm = Math.max(1, Math.round(marginPx / 5));

  formData.append('customer_name', filename);
  formData.append('max_size_mm', maxSizeSlider ? maxSizeSlider.value : '50');
  formData.append('margin_mm', String(marginMm));
  formData.append('hole_diameter_mm', '3');
  formData.append('hole_position', holePosSlider ? holePosSlider.value : '0.5');
  formData.append('clasp_type', window._thickSelectedClasp || 'lobster_gold');
  formData.append('use_ai_render', useAi ? 'true' : 'false');

  try {
    const apiBase = (typeof REMBG_API_BASE !== 'undefined' && REMBG_API_BASE) ? REMBG_API_BASE : '';
    const res = await fetch(apiBase + '/api/submit', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      STATE.submittedFilename = filename;
      const nameEl = document.getElementById('submit-order-name');
      if (nameEl) nameEl.textContent = filename;
      const uploadStatus = document.getElementById('upload-status');
      if (uploadStatus) {
        uploadStatus.style.color = '#15803d';
        uploadStatus.style.fontWeight = 'bold';
        uploadStatus.style.whiteSpace = 'pre-line';
        uploadStatus.textContent = '✅ ' + (data.message || '').replace('SVG 刀模檔成功儲存至：\n', '已儲存 SVG 刀模檔：').trim();
      }
      const resultDiv = document.getElementById('submit-result');
      if (resultDiv) resultDiv.style.display = '';
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      alert('生成失敗: ' + (data.error || '未知錯誤'));
    }
  } catch (err) {
    console.error('[submitThickDesign]', err);
    alert('無法連接到後端 API，請確認後端服務運行狀態');
  } finally {
    if (btn) { btn.innerHTML = '✉ 設計稿確認送出'; btn.disabled = false; }
  }
}

