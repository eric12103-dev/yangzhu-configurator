import os
import sys
import io
import json
import math
from datetime import datetime

# 處理 Windows cp950 難字 (例如「堃」) 輸出報錯
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    import fitz  # PyMuPDF
except ImportError:
    print("[WARN] 尚未安裝 PyMuPDF，正在自動安裝...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyMuPDF"])
    import fitz

def is_red_color(col):
    """判斷 PyMuPDF 繪圖顏色是否為紅色刀模線"""
    if not col:
        return False
    if len(col) == 3:  # RGB
        r, g, b = col
        return r > 0.7 and g < 0.3 and b < 0.3
    elif len(col) == 4:  # CMYK
        c, m, y, k = col
        return m > 0.7 and y > 0.7 and c < 0.3 and k < 0.3
    return False

def extract_path_data(drawing):
    """從 PyMuPDF drawing object 提取頂點、貝茲曲線張力與轉角曲率統計"""
    points = []
    bezier_count = 0
    total_tension = 0.0
    total_curve_len = 0.0

    for item in drawing.get("items", []):
        cmd = item[0]
        if cmd == 'l':  # line: ('l', p1, p2)
            p1, p2 = item[1], item[2]
            points.append((p1.x, p1.y))
            points.append((p2.x, p2.y))
        elif cmd == 'c':  # bezier curve: ('c', p1, p2, p3, p4)
            bezier_count += 1
            p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
            
            # 計算控制點張力 (控制點到端點距離 / 弦長)
            chord_len = math.hypot(p4.x - p1.x, p4.y - p1.y)
            ctrl_len = math.hypot(p2.x - p1.x, p2.y - p1.y) + math.hypot(p4.x - p3.x, p4.y - p3.y)
            if chord_len > 0.1:
                total_tension += (ctrl_len / chord_len)
                total_curve_len += chord_len

            # 均勻採樣貝茲曲線 (10個點)
            for t_idx in range(11):
                t = t_idx / 10.0
                x = ((1-t)**3)*p1.x + 3*((1-t)**2)*t*p2.x + 3*(1-t)*(t**2)*p3.x + (t**3)*p4.x
                y = ((1-t)**3)*p1.y + 3*((1-t)**2)*t*p2.y + 3*(1-t)*(t**2)*p3.y + (t**3)*p4.y
                points.append((x, y))
        elif cmd == 're':  # rect: ('re', rect)
            r = item[1]
            points.extend([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            
    return points, bezier_count, total_tension, total_curve_len

def calc_bounds(points):
    """計算一組點的 Bounding Box (min_x, min_y, max_x, max_y)"""
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))

def sample_polygon(points, max_points=120):
    """將龐大的多邊形點位序列均勻降採樣為輕量代表點，方便 AI 學習幾何輪廓"""
    if not points or len(points) <= max_points:
        return [[round(p[0], 1), round(p[1], 1)] for p in points]
    step = max(1, len(points) // max_points)
    sampled = [points[i] for i in range(0, len(points), step)][:max_points]
    return [[round(p[0], 1), round(p[1], 1)] for p in sampled]

def calc_wall_thickness(red_points, hole):
    """計算耳孔邊緣到外框刀模的最短安全壁厚 (mm)"""
    if not hole or not red_points:
        return None
    hole_cx, hole_cy, hole_r = hole["cx"], hole["cy"], hole["radius"]
    min_dist_pt = float('inf')
    
    for x, y in red_points:
        dist_to_center = math.hypot(x - hole_cx, y - hole_cy)
        # 排除屬於圓孔本身的點 (距離圓心遠大於圓孔半徑者才算是外框線)
        if dist_to_center > hole_r * 1.8:
            wall_dist = dist_to_center - hole_r
            if wall_dist < min_dist_pt:
                min_dist_pt = wall_dist
                
    if min_dist_pt == float('inf'):
        return None
    return round(min_dist_pt * 0.3527, 2)  # 1 pt = 0.3527 mm

def calc_center_of_mass_offset(artwork_bounds, hole):
    """計算耳孔相對原圖視覺重心 (幾何中心) 的坐標偏移量 (mm)"""
    if not artwork_bounds or not hole:
        return None
    art_cx = (artwork_bounds[0] + artwork_bounds[2]) / 2.0
    art_cy = (artwork_bounds[1] + artwork_bounds[3]) / 2.0
    dx_mm = (hole["cx"] - art_cx) * 0.3527
    dy_mm = (hole["cy"] - art_cy) * 0.3527
    return {"dx_mm": round(dx_mm, 2), "dy_mm": round(dy_mm, 2)}

def process_ai_database(db_dir, output_dir):
    print("="*60)
    print(" 頌禮專屬 AI 刀模模型 - Step 1: 美編實戰特徵深度萃取 (v2.0)")
    print("="*60)
    print(f"[INFO] 來源資料庫目錄: {db_dir}")
    print(f"[INFO] 輸出訓練集目錄: {output_dir}")

    os.makedirs(output_dir, exist_ok=True)
    
    ai_files = sorted([f for f in os.listdir(db_dir) if f.lower().endswith('.ai')])
    print(f"[INFO] 共發現 {len(ai_files)} 筆 .ai 歷史檔案 (含最新新增檔)，開始深度萃取...\n")

    dataset = []
    seen_hashes = set()
    stats = {
        "total": len(ai_files),
        "success": 0,
        "duplicates_skipped": 0,
        "failed": 0
    }

    for idx, fname in enumerate(ai_files, 1):
        fpath = os.path.join(db_dir, fname)
        print(f"[{idx:03d}/{len(ai_files):03d}] 萃取中: {fname[:38].ljust(38)} ... ", end="")

        try:
            doc = fitz.open(fpath)
            page = doc[0]  # 取第一頁主設計稿

            red_points = []
            non_red_points = []
            hole_candidates = []
            
            total_bezier_count = 0
            total_tension_sum = 0.0
            total_curve_len_sum = 0.0

            for d in page.get_drawings():
                pts, b_cnt, t_sum, c_len = extract_path_data(d)
                if not pts:
                    continue
                
                is_red = is_red_color(d.get("color")) or is_red_color(d.get("fill"))
                if is_red:
                    red_points.extend(pts)
                    total_bezier_count += b_cnt
                    total_tension_sum += t_sum
                    total_curve_len_sum += c_len
                    
                    # 檢查是否為小圓孔 (直徑大約 8~25 pt)
                    b = calc_bounds(pts)
                    if b:
                        w, h = b[2] - b[0], b[3] - b[1]
                        if 5 < w < 28 and 5 < h < 28 and abs(w - h) < 5:
                            cx, cy = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
                            hole_candidates.append({"cx": cx, "cy": cy, "radius": w / 2.0})
                else:
                    non_red_points.extend(pts)

            doc.close()

            if not red_points:
                print("[SKIP] 找不到紅色刀模線")
                stats["failed"] += 1
                continue

            red_bounds = calc_bounds(red_points)
            non_red_bounds = calc_bounds(non_red_points) if non_red_points else page.rect

            # 幾何去重
            geom_hash = f"{round(red_bounds[2]-red_bounds[0], 1)}_{round(red_bounds[3]-red_bounds[1], 1)}_{len(red_points)}"
            if geom_hash in seen_hashes:
                print("[DEDUP] 重複幾何軌跡跳過")
                stats["duplicates_skipped"] += 1
                continue
            seen_hashes.add(geom_hash)

            # 挑選最靠近頂緣的鑰匙孔
            best_hole = None
            if hole_candidates:
                hole_candidates.sort(key=lambda h: h["cy"])
                best_hole = hole_candidates[0]

            # 1. 邊距與長寬比
            margin_w = (red_bounds[2] - red_bounds[0]) - (non_red_bounds[2] - non_red_bounds[0]) if non_red_bounds else 0
            margin_h = (red_bounds[3] - red_bounds[1]) - (non_red_bounds[3] - non_red_bounds[1]) if non_red_bounds else 0
            avg_margin_pt = max(0, (margin_w + margin_h) / 4.0)

            # 2. 轉角曲率與柔順度 (Bezier Tension)
            avg_tension = round(total_tension_sum / max(1, total_bezier_count), 4) if total_bezier_count > 0 else 0.6500
            avg_curve_radius_mm = round((total_curve_len_sum / max(1, total_bezier_count)) * 0.3527, 2) if total_bezier_count > 0 else 3.00

            # 3. 耳孔重心偏移與安全壁厚
            wall_thick_mm = calc_wall_thickness(red_points, best_hole)
            com_offset = calc_center_of_mass_offset(non_red_bounds, best_hole)

            # 4. 輕量化多邊形輪廓 (供 AI 學習形狀包覆)
            dieline_polygon = sample_polygon(red_points, max_points=120)
            artwork_polygon = sample_polygon(non_red_points, max_points=120) if non_red_points else []

            record = {
                "id": f"sample_{idx:03d}",
                "filename": fname,
                "artwork_bounds": non_red_bounds,
                "dieline_bounds": red_bounds,
                "dieline_points_count": len(red_points),
                "hole": best_hole,
                "learned_features": {
                    "aspect_ratio": round((red_bounds[2]-red_bounds[0]) / max(1, (red_bounds[3]-red_bounds[1])), 4),
                    "avg_margin_pt": round(avg_margin_pt, 2),
                    "avg_margin_mm": round(avg_margin_pt * 0.3527, 2),
                    "hole_top_offset_pt": round(best_hole["cy"] - red_bounds[1], 2) if best_hole else None,
                    # --- 美編核心四大特徵 ---
                    "corner_smoothness": {
                        "bezier_curves_count": total_bezier_count,
                        "avg_tension_factor": avg_tension,
                        "est_corner_radius_mm": avg_curve_radius_mm
                    },
                    "wall_thickness_mm": wall_thick_mm,
                    "center_of_mass_offset": com_offset,
                    "contour_polygon": {
                        "dieline_sample_points": dieline_polygon,
                        "artwork_sample_points": artwork_polygon
                    }
                }
            }
            dataset.append(record)
            stats["success"] += 1
            
            hole_str = f"孔r={round(best_hole['radius']*0.3527, 1)}mm|壁厚={wall_thick_mm}mm" if best_hole else "無獨立圓孔"
            print(f"[OK] 邊距:{record['learned_features']['avg_margin_mm']}mm | 張力:{avg_tension} | {hole_str}")

        except Exception as e:
            print(f"[ERR] 失敗: {str(e)}")
            stats["failed"] += 1

    # 寫入 JSON 訓練集檔案 (v2 版本)
    out_file = os.path.join(output_dir, "diecut_dataset_v2.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "meta": {
                "created_at": datetime.now().isoformat(),
                "target_product": "biz_thick",
                "version": "v2.0-aesthetic",
                "total_samples": len(dataset),
                "features_included": [
                    "aspect_ratio", "avg_margin_mm", "corner_smoothness", 
                    "wall_thickness_mm", "center_of_mass_offset", "contour_polygon"
                ]
            },
            "samples": dataset
        }, f, ensure_ascii=False, indent=2)

    print("\n" + "="*60)
    print(" 訓練資料集建置完成報告 (v2.0 Aesthetic Dataset Summary)")
    print("="*60)
    print(f" - 總掃描檔案數 : {stats['total']} 筆")
    print(f" - 成功萃取入庫 : {stats['success']} 筆 (已過濾重複與無效檔)")
    print(f" - 重複軌跡去重 : {stats['duplicates_skipped']} 筆")
    print(f" - 失敗/跳過    : {stats['failed']} 筆")
    print(f" - 訓練集檔案   : {out_file}")
    print("="*60)

if __name__ == "__main__":
    db_path = r"C:\Users\admin\Desktop\阿斯拉\刀模資料庫"
    out_path = r"C:\Users\admin\Desktop\阿斯拉\頌禮-企業禮贈品客製化服務\ai_diecut_model\dataset"
    process_ai_database(db_path, out_path)
