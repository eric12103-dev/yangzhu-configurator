/**
 * rembg_client.js  —  biz_thick 厚切電子票證 後端 API 客戶端
 * ⚠️  此檔案僅供 biz_thick（厚切電子票證）使用，不影響其他商品
 *
 * 架構說明：
 *   - 去背：POST http://127.0.0.1:8000/api/remove_bg  (Python rembg GPU 引擎)
 *   - 刀模預覽：POST http://127.0.0.1:8000/api/preview_die  (OpenCV + Shapely 工業級運算)
 *   - 完全移除舊有前端 Transformers.js AI 與 JS 邊界追蹤數學演算法
 *
 * 全域變數（供 configurator.js 讀取）：
 *   _lastRembgDataURL     : 去背後圖片的 DataURL
 *   _lastRembgBlob        : 去背後圖片的 Blob（PNG）
 *   _thickDieCutOverlayURL: 後端回傳的刀模預覽圖 DataURL（直接顯示用）
 *   _thickDieCutContour   : 保持 null（不再使用 JS 輪廓，改用後端圖片直接顯示）
 */

'use strict';

// 後端 API 基底網址（與士元專案共用同一個 Python 伺服器）
var REMBG_API_BASE = 'http://127.0.0.1:8000';

// 全域狀態（供 configurator.js 讀取）
var _lastRembgDataURL      = null;
var _lastRembgBlob         = null;
var _thickDieCutContour    = null;  // 維持相容性，不再使用 JS 輪廓
var _thickDieCutOverlayURL = null;  // 後端回傳的刀模預覽合成圖
var _lastUploadedDataURL   = null;  // 原始上傳圖 DataURL（供 regenDieCut 使用）
var _lastUploadedFile      = null;  // 原始上傳圖 File 物件

// ── 工具函式：將 DataURL 轉換為 Blob ─────────────────────────────────────

function _dataURLtoBlob(dataURL) {
  var arr = dataURL.split(',');
  var mime = arr[0].match(/:(.*?);/)[1];
  var bstr = atob(arr[1]);
  var n = bstr.length;
  var u8arr = new Uint8Array(n);
  while (n--) { u8arr[n] = bstr.charCodeAt(n); }
  return new Blob([u8arr], { type: mime });
}

// ── 主要函式一：AI 去背（呼叫後端 GPU 引擎）─────────────────────────────
// 傳入：imageFile (File 物件) 或 imageDataURL (string)
// 回傳：{ success: bool, imageDataURL: string, imageBlob: Blob, error: string }

async function removeBgWithContourClient(imageFileOrDataURL, marginPx, onProgress) {
  marginPx = marginPx || 10;

  // 建立 FormData
  var formData = new FormData();
  if (imageFileOrDataURL instanceof File) {
    formData.append('image', imageFileOrDataURL, imageFileOrDataURL.name || 'upload.png');
  } else if (typeof imageFileOrDataURL === 'string' && imageFileOrDataURL.startsWith('data:')) {
    var blob = _dataURLtoBlob(imageFileOrDataURL);
    formData.append('image', blob, 'upload.png');
  } else {
    return { success: false, error: '不支援的圖片格式，請上傳 PNG 或 JPG 檔案' };
  }

  try {
    if (onProgress) onProgress('🚀 GPU 高速去背運算中（< 1 秒）…');

    var resp = await fetch(REMBG_API_BASE + '/api/remove_bg', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error('伺服器回傳錯誤 ' + resp.status + '：' + errText);
    }

    var json = await resp.json();
    if (!json.success) {
      throw new Error(json.error || '去背 API 回傳失敗');
    }

    // 儲存去背結果
    _lastRembgDataURL = json.image_b64;
    _lastRembgBlob    = _dataURLtoBlob(json.image_b64);

    if (onProgress) onProgress('✅ 去背完成！正在計算刀模外框…');

    // 立即接著呼叫刀模預覽
    var marginMm = Math.max(1, Math.round(marginPx / 5));
    var dieResult = await _callPreviewDie(_lastRembgBlob, marginMm, onProgress);

    return {
      success: true,
      imageDataURL: _lastRembgDataURL,
      imageBlob: _lastRembgBlob,
      contour: null,
      dieOverlayDataURL: dieResult.overlayDataURL || null
    };

  } catch (err) {
    var errMsg = err.message || String(err);
    if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('ERR_CONNECTION_REFUSED') || errMsg.includes('Load failed')) {
      errMsg = '⚠️ 無法連線到後端伺服器！\n請先雙擊執行「啟動生成器.bat」，等待黑框顯示「Application startup complete」後再試。\n\n伺服器位置：士元/AcrylicMockupTool/啟動生成器.bat';
    }
    console.error('[rembg_client] removeBgWithContourClient 失敗：', err);
    return { success: false, error: errMsg };
  }
}

function _getHolePosVal() {
  var el = document.getElementById('diecut-hole-pos');
  return el ? el.value : '0.5';
}

// ── 主要函式二：純重算刀模（去背完成後重新指定邊距與打孔位置）──────────────────────
// 傳入：已去背的 DataURL + 新的邊距（px） + 打孔比例（0.1~0.9）
// 回傳：{ success: bool, overlayDataURL: string, error: string }

async function calcContourOnlyClient(rembgDataURL, marginPx, holePos) {
  var marginMm = Math.max(1, Math.round(marginPx / 5));
  try {
    var blob = _dataURLtoBlob(rembgDataURL);
    var result = await _callPreviewDie(blob, marginMm, null, holePos !== undefined ? holePos : _getHolePosVal());
    return {
      success: result.success,
      overlayDataURL: result.overlayDataURL || null,
      contour: null,
      error: result.error || null
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

// ── 內部函式：呼叫後端 /api/preview_die ─────────────────────────────────

async function _callPreviewDie(imageBlob, marginMm, onProgress, holePos) {
  try {
    var hp = holePos !== undefined ? holePos : _getHolePosVal();
    var formData = new FormData();
    formData.append('image', imageBlob, 'rembg_result.png');
    formData.append('max_size_mm', '50');
    formData.append('margin_mm', String(marginMm || 2.0));
    formData.append('hole_diameter_mm', '3');
    formData.append('hole_position', String(hp));

    var resp = await fetch(REMBG_API_BASE + '/api/preview_die', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error('刀模 API 錯誤 ' + resp.status + '：' + errText);
    }

    var json = await resp.json();
    if (!json.success) {
      throw new Error(json.error || '刀模 API 回傳失敗');
    }

    _thickDieCutOverlayURL = json.die_overlay_b64;
    if (onProgress) onProgress('✅ 刀模計算完成！');

    return { success: true, overlayDataURL: json.die_overlay_b64 };

  } catch (err) {
    console.error('[rembg_client] _callPreviewDie 失敗：', err);
    return { success: false, error: err.message || String(err) };
  }
}

// ── 相容性函式：_refreshDiecutPreview（改為顯示後端圖片）─────────────────
// configurator.js 中 initDieCutStep 與 regenDieCut 會呼叫此函式

function _refreshDiecutPreview() {
  var img       = document.getElementById('diecut-preview-img');
  var noPreview = document.getElementById('diecut-no-preview');
  if (!img) return;

  if (_thickDieCutOverlayURL) {
    img.src = _thickDieCutOverlayURL;
    img.style.display = '';
    if (noPreview) noPreview.style.display = 'none';
  } else if (_lastRembgDataURL) {
    img.src = _lastRembgDataURL;
    img.style.display = '';
    if (noPreview) noPreview.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (noPreview) noPreview.style.display = '';
  }
}

// ── 相容性函式：_overlayThickDiecut（改為直接回傳後端刀模預覽圖）──────────
// configurator.js 中的步驟5確認預覽會呼叫此函式

async function _overlayThickDiecut(baseURL) {
  return _thickDieCutOverlayURL || baseURL;
}

// ── 相容性函式：getUploadOnlyThickSVG（維持相容，回傳 null）──────────────

function getUploadOnlyThickSVG() {
  return null;
}

console.log('[rembg_client] 已升級：後端 GPU API 模式（' + REMBG_API_BASE + '）');
