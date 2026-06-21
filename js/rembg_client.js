/**
 * rembg_client.js  —  客戶端 AI 去背 + 刀模輪廓計算
 * ⚠️  此檔案僅供 biz_thick（厚切電子票證）使用，不影響其他商品
 *
 * 輪廓計算管線：
 *   Alpha → Dilation → GaussBlur → Binary
 *   → Moore's Boundary Tracing（正確邊界追蹤）
 *   → Ramer-Douglas-Peucker 簡化
 *   → Chaikin 平滑（3 次，產生類 Bezier 曲線）
 *   → 均勻弧長重取樣（180 點）
 *   → 歸一化 [0,1]
 */

'use strict';

var _RMBG_FIXED_PAD = 50;  // 與 Python rembg_server.py 保持一致

// ── 等待 AI 函式庫就緒 ──────────────────────────────────────────────────────

function _waitForLib(timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise(function(res, rej) {
    if (window.__removeBgReady) { res(); return; }
    var t0 = Date.now();
    var iv = setInterval(function() {
      if (window.__removeBgReady) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        rej(new Error('AI 去背函式庫載入逾時，請重新整理頁面再試'));
      }
    }, 200);
  });
}

// ── 將 Transformers.js RawImage 遮罩套用到原始圖片 ──────────────────────────

function _applyMaskToImage(imageDataURL, mask) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var imgData = ctx.getImageData(0, 0, img.width, img.height);

      // 暫存原始尺寸遮罩
      var tmpC = document.createElement('canvas');
      tmpC.width  = mask.width;
      tmpC.height = mask.height;
      var tCtx = tmpC.getContext('2d');
      var mIData = tCtx.createImageData(mask.width, mask.height);
      for (var i = 0; i < mask.data.length; i++) {
        var v = mask.data[i];
        mIData.data[i * 4]     = v;
        mIData.data[i * 4 + 1] = v;
        mIData.data[i * 4 + 2] = v;
        mIData.data[i * 4 + 3] = 255;
      }
      tCtx.putImageData(mIData, 0, 0);

      // 縮放至原圖尺寸
      var mCanvas = document.createElement('canvas');
      mCanvas.width  = img.width;
      mCanvas.height = img.height;
      var mCtx = mCanvas.getContext('2d');
      mCtx.drawImage(tmpC, 0, 0, img.width, img.height);
      var resized = mCtx.getImageData(0, 0, img.width, img.height);

      // 以遮罩紅通道替換 alpha
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

// ════════════════════════════════════════════════════════════════════════════
// 影像處理工具函式（Box Blur、Dilation）
// ════════════════════════════════════════════════════════════════════════════

function _boxBlurH(data, w, h, r) {
  var out = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    var prefix = new Float32Array(w + 1);
    for (var x = 0; x < w; x++) prefix[x + 1] = prefix[x] + data[y * w + x];
    for (var x2 = 0; x2 < w; x2++) {
      var lo = Math.max(0, x2 - r), hi = Math.min(w - 1, x2 + r);
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
      var lo = Math.max(0, y2 - r), hi = Math.min(h - 1, y2 + r);
      out[y2 * w + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

// 三次 Box Blur 近似 Gaussian（O(n)）
function _tripleBoxBlur(data, w, h, r) {
  var buf = new Float32Array(data);
  for (var pass = 0; pass < 3; pass++) {
    buf = _boxBlurH(buf, w, h, r);
    buf = _boxBlurV(buf, w, h, r);
  }
  return buf;
}

// Box Dilation（O(n) 積分法）
function _dilateBox(binary, w, h, r) {
  if (r <= 0) return new Uint8Array(binary);
  var hPass = new Uint8Array(w * h);
  for (var y = 0; y < h; y++) {
    var prefix = new Int32Array(w + 1);
    for (var x = 0; x < w; x++) prefix[x + 1] = prefix[x] + (binary[y * w + x] ? 1 : 0);
    for (var x2 = 0; x2 < w; x2++) {
      var lo = Math.max(0, x2 - r), hi = Math.min(w - 1, x2 + r);
      if (prefix[hi + 1] - prefix[lo] > 0) hPass[y * w + x2] = 255;
    }
  }
  var result = new Uint8Array(w * h);
  for (var x3 = 0; x3 < w; x3++) {
    var prefix2 = new Int32Array(h + 1);
    for (var y2 = 0; y2 < h; y2++) prefix2[y2 + 1] = prefix2[y2] + (hPass[y2 * w + x3] ? 1 : 0);
    for (var y3 = 0; y3 < h; y3++) {
      var lo2 = Math.max(0, y3 - r), hi2 = Math.min(h - 1, y3 + r);
      if (prefix2[hi2 + 1] - prefix2[lo2] > 0) result[y3 * w + x3] = 255;
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// 輪廓計算管線（Moore → RDP → Chaikin → 重取樣）
// ════════════════════════════════════════════════════════════════════════════

/**
 * Moore's Neighbor Tracing（正確的 8-連通邊界追蹤）
 * 不變式：bDir 方向的像素永遠是背景（已數學驗證）
 *
 * 參考：Toriwaki & Yoshida (2009), Moore Neighbor Tracing
 */
function _mooreBoundary(binary, w, h) {
  // 找最左上角前景像素
  var sX = -1, sY = -1;
  for (var y = 0; y < h && sX < 0; y++) {
    for (var x = 0; x < w; x++) {
      if (binary[y * w + x]) { sX = x; sY = y; break; }
    }
  }
  if (sX < 0) return [];

  // CW 8方向：E=0, SE=1, S=2, SW=3, W=4, NW=5, N=6, NE=7
  var DX = [1, 1, 0, -1, -1, -1, 0, 1];
  var DY = [0, 1, 1, 1, 0, -1, -1, -1];

  // 起始 backtrack 方向 = W（起始點為最左前景像素，West 必為背景）
  var bDir = 4;
  var cX = sX, cY = sY;
  var pts = [[cX, cY]];
  var MAX = (w + h) * 4 + w * h;  // 上限

  for (var iter = 0; iter < MAX; iter++) {
    var moved = false;
    for (var d = 0; d < 8; d++) {
      var dir = (bDir + d) % 8;
      var nx = cX + DX[dir], ny = cY + DY[dir];
      // 越界或背景：跳過
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || !binary[ny * w + nx]) continue;

      // d ≥ 1（bDir 方向不變式保證 d=0 永遠是背景，不會進入此分支）
      // 新 backtrack = 搜尋中最後一個被跳過的背景像素方向
      var bkDir = (bDir + d - 1 + 8) % 8;
      var bkX   = cX + DX[bkDir];
      var bkY   = cY + DY[bkDir];

      // 移動到下一個邊界像素
      cX = nx; cY = ny;

      // 從新位置計算指向 backtrack 的方向索引
      var fbx = bkX - cX, fby = bkY - cY;
      // fbx, fby ∈ [-1,1]（相鄰方向差最多 ±1，已驗證）
      var newBDir = bDir;
      for (var k = 0; k < 8; k++) {
        if (DX[k] === fbx && DY[k] === fby) { newBDir = k; break; }
      }
      bDir = newBDir;
      moved = true;
      break;
    }

    if (!moved) break;          // 孤立像素，停止
    if (cX === sX && cY === sY) break;  // 回到起點，完成
    pts.push([cX, cY]);
  }

  return pts;
}

/**
 * Ramer-Douglas-Peucker 多邊形簡化（迭代版，避免 call stack overflow）
 * eps: 像素誤差容忍值（建議 1.5–3.0）
 */
function _rdpIterative(pts, eps) {
  var n = pts.length;
  if (n <= 2) return pts;

  var keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  var stack = [[0, n - 1]];

  while (stack.length > 0) {
    var seg = stack.pop();
    var s = seg[0], e = seg[1];
    if (e - s <= 1) continue;

    var x1 = pts[s][0], y1 = pts[s][1];
    var x2 = pts[e][0], y2 = pts[e][1];
    var dx = x2 - x1, dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;

    var maxDist = -1, maxIdx = s + 1;
    for (var i = s + 1; i < e; i++) {
      var px = pts[i][0], py = pts[i][1];
      var dist = lenSq === 0
        ? Math.sqrt((px-x1)*(px-x1) + (py-y1)*(py-y1))
        : Math.abs(dy*px - dx*py + x2*y1 - y2*x1) / Math.sqrt(lenSq);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }

    if (maxDist > eps) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx]);
      stack.push([maxIdx, e]);
    }
  }

  return pts.filter(function(_, i) { return keep[i]; });
}

/**
 * Chaikin 角點切割平滑（閉合多邊形）
 * 每次迭代點數 x2，3 次後近似 B-Spline / Bezier 曲線
 */
function _chaikinSmooth(pts, iters) {
  var p = pts.slice();
  for (var iter = 0; iter < iters; iter++) {
    var n = p.length;
    var s = [];
    for (var i = 0; i < n; i++) {
      var x0 = p[i][0],       y0 = p[i][1];
      var x1 = p[(i+1)%n][0], y1 = p[(i+1)%n][1];
      s.push([0.75*x0 + 0.25*x1, 0.75*y0 + 0.25*y1]);
      s.push([0.25*x0 + 0.75*x1, 0.25*y0 + 0.75*y1]);
    }
    p = s;
  }
  return p;
}

/**
 * 閉合多邊形均勻弧長重取樣
 * 使點與點的弧長距離相等，消除尖銳/稀疏分布
 */
function _resampleUniform(pts, n) {
  var m = pts.length;
  if (m <= 1) return pts;

  // 累積弧長（含閉合線段）
  var cum = new Float32Array(m + 1);
  for (var i = 1; i < m; i++) {
    var dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    cum[i] = cum[i-1] + Math.sqrt(dx*dx + dy*dy);
  }
  var cdx = pts[0][0] - pts[m-1][0], cdy = pts[0][1] - pts[m-1][1];
  cum[m] = cum[m-1] + Math.sqrt(cdx*cdx + cdy*cdy);
  var total = cum[m];

  var result = [];
  var seg = 0;
  for (var j = 0; j < n; j++) {
    var t = (j / n) * total;
    while (seg < m - 1 && cum[seg + 1] < t) seg++;
    var segLen = cum[seg+1] - cum[seg];
    var alpha  = segLen > 1e-9 ? (t - cum[seg]) / segLen : 0;
    var x0 = pts[seg][0],     y0 = pts[seg][1];
    var x1 = pts[(seg+1)%m][0], y1 = pts[(seg+1)%m][1];
    result.push([x0 + alpha*(x1-x0), y0 + alpha*(y1-y0)]);
  }
  return result;
}

/**
 * 從二值遮罩 → 刀模輪廓（共用管線）
 * 回傳歸一化 [0,1] 座標的 180 個點，或 null
 */
function _computeContourFromBinary(smooth, w, h) {
  // 1. Moore's 邊界追蹤
  var raw = _mooreBoundary(smooth, w, h);
  if (raw.length < 6) return null;

  // 2. RDP 簡化（epsilon = 2 像素，保留主要轉折點）
  var simplified = _rdpIterative(raw, 2.0);
  if (simplified.length < 4) simplified = raw.filter(function(_, i) {
    return i % Math.max(1, Math.floor(raw.length / 60)) === 0;
  });

  // 3. Chaikin 平滑（3 次，產生類 B-Spline 曲線）
  var smoothed = _chaikinSmooth(simplified, 3);

  // 4. 均勻弧長重取樣至 180 點
  var resampled = _resampleUniform(smoothed, 180);

  // 5. 歸一化
  return resampled.map(function(pt) { return [pt[0] / w, pt[1] / h]; });
}

// ── 從 RGBA 像素資料計算刀模輪廓（含裁切+白邊+膨脹+平滑）──────────────────

function _calcContourFromRGBA(rgbaData, imgW, imgH, marginPx) {
  var margin = Math.max(marginPx || 15, 1);
  var pad    = _RMBG_FIXED_PAD;

  // 1. Alpha 二值化（RMBG-1.4: 前景≈255, 背景≈0）
  var alpha = new Uint8Array(imgW * imgH);
  for (var i = 0; i < imgW * imgH; i++) {
    alpha[i] = rgbaData[i * 4 + 3] > 127 ? 255 : 0;
  }

  // 2. 找邊界框
  var rMin = imgH, rMax = -1, cMin = imgW, cMax = -1;
  for (var r = 0; r < imgH; r++) {
    for (var c = 0; c < imgW; c++) {
      if (!alpha[r * imgW + c]) continue;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (c < cMin) cMin = c; if (c > cMax) cMax = c;
    }
  }
  if (rMax < 0) return null;  // 全透明

  // 3. 裁切 + 加 FIXED_PAD 白邊
  var cW = (cMax - cMin + 1) + pad * 2;
  var cH = (rMax - rMin + 1) + pad * 2;
  var cropped = new Uint8Array(cW * cH);
  for (var r2 = rMin; r2 <= rMax; r2++) {
    for (var c2 = cMin; c2 <= cMax; c2++) {
      cropped[(r2 - rMin + pad) * cW + (c2 - cMin + pad)] = alpha[r2 * imgW + c2];
    }
  }

  // 4. 膨脹（邊距 margin_px）
  var dilated = _dilateBox(cropped, cW, cH, margin);

  // 5. 三次 Box Blur 近似高斯平滑
  var blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
  var blurred = _tripleBoxBlur(dilated, cW, cH, blurR);

  // 6. 二值化（≥50% 視為前景）
  var smooth = new Uint8Array(cW * cH);
  for (var k = 0; k < cW * cH; k++) smooth[k] = blurred[k] >= 127 ? 255 : 0;

  // 7. Moore + RDP + Chaikin + 重取樣 → 180 點輪廓
  var contour = _computeContourFromBinary(smooth, cW, cH);
  if (!contour) return null;

  return {
    contour: contour,
    imgW: cW, imgH: cH,
    rMin: rMin, rMax: rMax, cMin: cMin, cMax: cMax
  };
}

// ── 建立裁切+白邊後的 PNG DataURL ───────────────────────────────────────────

function _buildPaddedDataURL(img, rMin, rMax, cMin, cMax, newW, newH) {
  var pad = _RMBG_FIXED_PAD;
  var tmp = document.createElement('canvas');
  tmp.width  = newW;
  tmp.height = newH;
  var ctx = tmp.getContext('2d');
  ctx.clearRect(0, 0, newW, newH);
  ctx.drawImage(img,
    cMin, rMin, cMax - cMin + 1, rMax - rMin + 1,
    pad,  pad,  cMax - cMin + 1, rMax - rMin + 1);
  return tmp.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════════════════════
// 公開 API（與 rembg_server.py 回傳格式完全相容）
// ════════════════════════════════════════════════════════════════════════════

/**
 * 去背 + 刀模輪廓（首次流程）
 * @param {string}   imageDataURL  原始含背景圖片
 * @param {number}   marginPx      刀模邊距（預設 15）
 * @param {Function} onProgress    進度回呼 (msg: string) => void
 */
async function removeBgWithContourClient(imageDataURL, marginPx, onProgress) {
  try {
    if (onProgress) onProgress('等待 AI 模型就緒…');
    await _waitForLib(35000);

    // 呼叫 index.html 中定義的 window.__removeBgAI
    var aiResult = await window.__removeBgAI(imageDataURL, onProgress);
    if (!aiResult.ok) throw new Error(aiResult.error || 'AI 去背失敗');
    if (!aiResult.mask) throw new Error('模型未回傳遮罩');

    if (onProgress) onProgress('套用遮罩中…');
    var removedDataURL = await _applyMaskToImage(imageDataURL, aiResult.mask);

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
          img,
          result.rMin, result.rMax, result.cMin, result.cMax,
          result.imgW, result.imgH
        );

        resolve({
          success:      true,
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
 * @param {string} imageDataURL  已去背且含 FIXED_PAD 白邊的 PNG
 * @param {number} marginPx      新的刀模邊距
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

      // 此圖已含 FIXED_PAD，直接對整張圖做膨脹+平滑+輪廓
      var alpha = new Uint8Array(img.width * img.height);
      var d = imgData.data;
      for (var i = 0; i < img.width * img.height; i++) {
        alpha[i] = d[i * 4 + 3] > 127 ? 255 : 0;
      }

      var margin  = Math.max(marginPx || 15, 1);
      var dilated = _dilateBox(alpha, img.width, img.height, margin);
      var blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
      var blurred = _tripleBoxBlur(dilated, img.width, img.height, blurR);
      var smooth  = new Uint8Array(img.width * img.height);
      for (var k = 0; k < smooth.length; k++) {
        smooth[k] = blurred[k] >= 127 ? 255 : 0;
      }

      var contour = _computeContourFromBinary(smooth, img.width, img.height);
      if (!contour) {
        resolve({ success: false, error: '找不到輪廓' });
        return;
      }

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
