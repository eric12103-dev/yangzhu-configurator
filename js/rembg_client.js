/**
 * rembg_client.js  —  客戶端 AI 去背 + 刀模輪廓計算
 * ⚠️  此檔案僅供 biz_thick（厚切電子票證）使用，不影響其他商品
 *
 * 依賴：index.html 中的 <script type="module"> 載入
 *       @huggingface/transformers + briaai/RMBG-1.4 模型
 *       並將 __removeBgAI / __removeBgReady 掛載至 window
 *
 * 公開 API（與 rembg_server.py 回傳格式完全相容）：
 *   removeBgWithContourClient(imageDataURL, marginPx, onProgress)
 *     → Promise<{success, imageDataURL, contour, imageSize}>
 *   calcContourOnlyClient(imageDataURL, marginPx)
 *     → Promise<{success, contour, imageSize}>
 */

'use strict';

// 與 Python rembg_server.py 中的 FIXED_PAD 保持一致
var _RMBG_FIXED_PAD = 50;

// ── 等待 AI 函式庫就緒（最多 timeoutMs 毫秒）────────────────────────────────

function _waitForLib(timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise(function(res, rej) {
    if (window.__removeBgReady) { res(); return; }
    var t0 = Date.now();
    var iv = setInterval(function() {
      if (window.__removeBgReady) {
        clearInterval(iv); res();
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        rej(new Error('AI 去背函式庫載入逾時，請重新整理頁面再試'));
      }
    }, 200);
  });
}

// ── 將 Transformers.js RawImage 遮罩套用到原始圖片（透明化背景）──────────────

function _applyMaskToImage(imageDataURL, mask) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      // 建立輸出 canvas（與原圖同尺寸）
      var canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var imgData = ctx.getImageData(0, 0, img.width, img.height);

      // 將遮罩（mask.data = Uint8ClampedArray, 灰階 0–255）縮放至原圖尺寸
      var mCanvas = document.createElement('canvas');
      mCanvas.width  = img.width;
      mCanvas.height = img.height;
      var mCtx = mCanvas.getContext('2d');

      // 先把遮罩原始尺寸畫到暫存 canvas
      var tmpC = document.createElement('canvas');
      tmpC.width  = mask.width;
      tmpC.height = mask.height;
      var tCtx = tmpC.getContext('2d');
      var mIData = tCtx.createImageData(mask.width, mask.height);
      for (var i = 0; i < mask.data.length; i++) {
        var v = mask.data[i];  // 灰階值 0–255
        mIData.data[i * 4]     = v;
        mIData.data[i * 4 + 1] = v;
        mIData.data[i * 4 + 2] = v;
        mIData.data[i * 4 + 3] = 255;
      }
      tCtx.putImageData(mIData, 0, 0);

      // 縮放至原圖尺寸
      mCtx.drawImage(tmpC, 0, 0, img.width, img.height);
      var resized = mCtx.getImageData(0, 0, img.width, img.height);

      // 以遮罩紅通道值替換 alpha 通道（255=前景保留, 0=背景透明）
      for (var j = 0; j < imgData.data.length / 4; j++) {
        imgData.data[j * 4 + 3] = resized.data[j * 4];
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageDataURL;
  });
}

// ── 積分影像 Box Blur（O(n)，模擬 OpenCV GaussianBlur 三次疊加 ≈ Gaussian）──

function _boxBlurH(data, w, h, r) {
  var out = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    var prefix = new Float32Array(w + 1);
    for (var x = 0; x < w; x++) prefix[x + 1] = prefix[x] + data[y * w + x];
    for (var x2 = 0; x2 < w; x2++) {
      var lo = Math.max(0, x2 - r);
      var hi = Math.min(w - 1, x2 + r);
      out[y * w + x2] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

function _boxBlurV(data, w, h, r) {
  var out = new Float32Array(w * h);
  for (var x = 0; x < w; x++) {
    var prefix = new Float32Array(h + 1);
    for (var y = 0; y < h; y++) prefix[y + 1] = prefix[y] + data[y * w + x];
    for (var y2 = 0; y2 < h; y2++) {
      var lo = Math.max(0, y2 - r);
      var hi = Math.min(h - 1, y2 + r);
      out[y2 * w + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

function _tripleBoxBlur(data, w, h, r) {
  var buf = new Float32Array(data);
  for (var pass = 0; pass < 3; pass++) {
    buf = _boxBlurH(buf, w, h, r);
    buf = _boxBlurV(buf, w, h, r);
  }
  return buf;
}

// ── Box Dilation（O(n)，模擬 OpenCV dilate + np.ones square kernel）──────────

function _dilateBox(binary, w, h, r) {
  if (r <= 0) return new Uint8Array(binary);

  // 水平方向積分
  var hPass = new Uint8Array(w * h);
  for (var y = 0; y < h; y++) {
    var prefix = new Int32Array(w + 1);
    for (var x = 0; x < w; x++) prefix[x + 1] = prefix[x] + (binary[y * w + x] ? 1 : 0);
    for (var x2 = 0; x2 < w; x2++) {
      var lo = Math.max(0, x2 - r);
      var hi = Math.min(w - 1, x2 + r);
      if (prefix[hi + 1] - prefix[lo] > 0) hPass[y * w + x2] = 255;
    }
  }

  // 垂直方向積分
  var result = new Uint8Array(w * h);
  for (var x3 = 0; x3 < w; x3++) {
    var prefix2 = new Int32Array(h + 1);
    for (var y2 = 0; y2 < h; y2++) prefix2[y2 + 1] = prefix2[y2] + (hPass[y2 * w + x3] ? 1 : 0);
    for (var y3 = 0; y3 < h; y3++) {
      var lo2 = Math.max(0, y3 - r);
      var hi2 = Math.min(h - 1, y3 + r);
      if (prefix2[hi2 + 1] - prefix2[lo2] > 0) result[y3 * w + x3] = 255;
    }
  }
  return result;
}

// ── 極座標輪廓取樣（從重心出發，沿 nPts 個角度找最遠邊界點）──────────────────

function _polarContour(binary, w, h, nPts) {
  nPts = nPts || 180;

  var sumX = 0, sumY = 0, cnt = 0;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    if (binary[y * w + x]) { sumX += x; sumY += y; cnt++; }
  }
  if (cnt === 0) return [];
  var cx = sumX / cnt, cy = sumY / cnt;

  var diag = Math.sqrt(w * w + h * h);
  var pts  = [];

  for (var i = 0; i < nPts; i++) {
    var angle = (i / nPts) * 2 * Math.PI;
    var cos   = Math.cos(angle);
    var sin   = Math.sin(angle);

    // 二分搜尋最遠前景像素
    var lo = 0, hi = diag;
    for (var step = 0; step < 20; step++) {
      var mid = (lo + hi) * 0.5;
      var px  = Math.round(cx + cos * mid);
      var py  = Math.round(cy + sin * mid);
      var ok  = px >= 0 && px < w && py >= 0 && py < h && binary[py * w + px];
      if (ok) lo = mid; else hi = mid;
    }
    pts.push([cx + cos * lo, cy + sin * lo]);
  }
  return pts;
}

// ── 核心：從 RGBA 像素資料計算刀模輪廓 ──────────────────────────────────────

function _calcContourFromRGBA(rgbaData, imgW, imgH, marginPx) {
  var margin = Math.max(marginPx || 15, 1);
  var pad    = _RMBG_FIXED_PAD;

  // 1. Alpha 二值化
  var alpha = new Uint8Array(imgW * imgH);
  for (var i = 0; i < imgW * imgH; i++) {
    alpha[i] = rgbaData[i * 4 + 3] > 10 ? 255 : 0;
  }

  // 2. 找邊界框
  var rMin = imgH, rMax = -1, cMin = imgW, cMax = -1;
  for (var r = 0; r < imgH; r++) for (var c = 0; c < imgW; c++) {
    if (!alpha[r * imgW + c]) continue;
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (c < cMin) cMin = c; if (c > cMax) cMax = c;
  }
  if (rMax < 0) return null;

  // 3. 裁切 + 加 FIXED_PAD 白邊
  var cW = (cMax - cMin + 1) + pad * 2;
  var cH = (rMax - rMin + 1) + pad * 2;
  var cropped = new Uint8Array(cW * cH);
  for (var r2 = rMin; r2 <= rMax; r2++) {
    for (var c2 = cMin; c2 <= cMax; c2++) {
      cropped[(r2 - rMin + pad) * cW + (c2 - cMin + pad)] = alpha[r2 * imgW + c2];
    }
  }

  // 4. 膨脹
  var dilated = _dilateBox(cropped, cW, cH, margin);

  // 5. 三次 Box Blur 平滑
  var blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
  var blurred = _tripleBoxBlur(dilated, cW, cH, blurR);

  // 6. 二值化
  var smooth = new Uint8Array(cW * cH);
  for (var k = 0; k < cW * cH; k++) smooth[k] = blurred[k] >= 127 ? 255 : 0;

  // 7. 極座標輪廓取樣 → 180 點歸一化座標
  var rawPts = _polarContour(smooth, cW, cH, 180);
  if (rawPts.length < 3) return null;

  var contour = rawPts.map(function(pt) { return [pt[0] / cW, pt[1] / cH]; });

  return { contour: contour, imgW: cW, imgH: cH, rMin: rMin, rMax: rMax, cMin: cMin, cMax: cMax };
}

// ── 建立裁切+白邊後的 PNG DataURL ───────────────────────────────────────────

function _buildPaddedDataURL(img, rMin, rMax, cMin, cMax, newW, newH) {
  var pad = _RMBG_FIXED_PAD;
  var tmp = document.createElement('canvas');
  tmp.width  = newW;
  tmp.height = newH;
  var ctx = tmp.getContext('2d');
  ctx.clearRect(0, 0, newW, newH);
  ctx.drawImage(img, cMin, rMin, cMax - cMin + 1, rMax - rMin + 1,
                     pad, pad,  cMax - cMin + 1, rMax - rMin + 1);
  return tmp.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════════════════════
// 公開 API
// ════════════════════════════════════════════════════════════════════════════

/**
 * 去背 + 刀模輪廓（首次流程）
 * 使用 @huggingface/transformers + briaai/RMBG-1.4 在瀏覽器內執行 AI 去背
 * 回傳格式與 rembg_server.py POST /remove-bg-with-contour 完全相容
 */
async function removeBgWithContourClient(imageDataURL, marginPx, onProgress) {
  try {
    if (onProgress) onProgress('等待 AI 模型就緒…');
    await _waitForLib(35000);

    // 呼叫 window.__removeBgAI（由 index.html module script 定義）
    var aiResult = await window.__removeBgAI(imageDataURL, onProgress);
    if (!aiResult.ok) throw new Error(aiResult.error || '去背失敗');
    if (!aiResult.mask) throw new Error('模型未回傳遮罩');

    // 套用遮罩到原圖
    if (onProgress) onProgress('套用遮罩中…');
    var removedDataURL = await _applyMaskToImage(imageDataURL, aiResult.mask);

    // 計算刀模輪廓
    if (onProgress) onProgress('計算刀模輪廓…');

    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var cvs = document.createElement('canvas');
        cvs.width  = img.width;
        cvs.height = img.height;
        var ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var imgData = ctx.getImageData(0, 0, img.width, img.height);

        var result = _calcContourFromRGBA(imgData.data, img.width, img.height, marginPx);

        if (!result) {
          resolve({
            success: true,
            imageDataURL: removedDataURL,
            contour: null,
            imageSize: { w: img.width, h: img.height }
          });
          return;
        }

        var paddedURL = _buildPaddedDataURL(
          img, result.rMin, result.rMax, result.cMin, result.cMax,
          result.imgW, result.imgH
        );

        resolve({
          success:   true,
          imageDataURL: paddedURL,
          contour:      result.contour,
          imageSize:    { w: result.imgW, h: result.imgH }
        });
      };
      img.onerror = function() { reject(new Error('去背後圖片載入失敗')); };
      img.src = removedDataURL;
    });

  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * 只重算刀模輪廓（不重跑去背，供邊距滑桿調整用）
 * 回傳格式與 rembg_server.py POST /contour-only 完全相容
 */
async function calcContourOnlyClient(imageDataURL, marginPx) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var cvs = document.createElement('canvas');
      cvs.width  = img.width;
      cvs.height = img.height;
      var ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var imgData = ctx.getImageData(0, 0, img.width, img.height);

      // 此圖已含 FIXED_PAD，直接對整張圖膨脹+模糊+取輪廓
      var alpha = new Uint8Array(img.width * img.height);
      var d = imgData.data;
      for (var i = 0; i < img.width * img.height; i++) {
        alpha[i] = d[i * 4 + 3] > 10 ? 255 : 0;
      }

      var margin  = Math.max(marginPx || 15, 1);
      var dilated = _dilateBox(alpha, img.width, img.height, margin);
      var blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
      var blurred = _tripleBoxBlur(dilated, img.width, img.height, blurR);
      var smooth  = new Uint8Array(img.width * img.height);
      for (var k = 0; k < smooth.length; k++) smooth[k] = blurred[k] >= 127 ? 255 : 0;

      var rawPts = _polarContour(smooth, img.width, img.height, 180);
      if (rawPts.length < 3) {
        resolve({ success: false, error: '找不到輪廓' });
        return;
      }

      var contour = rawPts.map(function(pt) {
        return [pt[0] / img.width, pt[1] / img.height];
      });

      resolve({
        success:   true,
        contour:   contour,
        imageSize: { w: img.width, h: img.height }
      });
    };
    img.onerror = function() { resolve({ success: false, error: '圖片載入失敗' }); };
    img.src = imageDataURL;
  });
}
