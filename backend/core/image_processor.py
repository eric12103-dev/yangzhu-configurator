import cv2
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import io
import rembg

def remove_background(img_bytes: bytes) -> bytes:
    """Uses rembg to remove the background of an image."""
    try:
        # Load image with PIL to check format
        input_image = Image.open(io.BytesIO(img_bytes))
        
        # rembg automatically uses GPU if onnxruntime-gpu is installed
        output_image = rembg.remove(input_image)
        
        # Save to bytes
        out_io = io.BytesIO()
        output_image.save(out_io, format="PNG")
        return out_io.getvalue()
    except Exception as e:
        raise ValueError(f"Background removal failed: {str(e)}")

def get_acrylic_shape(img_bytes: bytes, max_size_mm: float, margin_mm: float, hole_diameter_mm: float, hole_position: str = "center", product_id: str = "biz_thick"):
    """
    Analyzes transparent PNG, calculates scale, and returns the path in pixels and mm.
    """
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_UNCHANGED)
    
    if img is None or img.shape[2] != 4:
        raise ValueError("Image must have an alpha channel (transparent PNG).")

    alpha = img[:, :, 3]
    _, mask = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        raise ValueError("No opaque content found in the image.")
        
    largest_contour = max(contours, key=cv2.contourArea)
    contour_points = largest_contour.reshape(-1, 2)
    
    poly = Polygon(contour_points)
    if not poly.is_valid:
        poly = poly.buffer(0)
        
    h, w = img.shape[:2]
    
    # 【嚴守商品隔離：只針對 biz_thick 厚切商品，進行內容重心絕對置中對位】
    dx_px = 0.0
    dy_px = 0.0
    if product_id == "biz_thick":
        min_x, min_y, max_x, max_y = poly.bounds
        poly_cx = (min_x + max_x) / 2.0
        poly_cy = (min_y + max_y) / 2.0
        dx_px = (w / 2.0) - poly_cx
        dy_px = (h / 2.0) - poly_cy
        from shapely.affinity import translate
        poly = translate(poly, xoff=dx_px, yoff=dy_px)

    max_px = max(h, w)
    scale = max_size_mm / max_px  # mm per pixel
    
    margin_px = margin_mm / scale
    buffered_poly = poly.buffer(margin_px, join_style=1)
    
    # ── 啟動 AI 智能刀模模型 (嚴格商品隔離：只針對 biz_thick 厚切商品) ──
    ai_model = None
    if product_id == "biz_thick":
        try:
            import json
            import os
            model_path_v2 = os.path.join(os.path.dirname(__file__), "songli_diecut_v2.model")
            model_path_v1 = os.path.join(os.path.dirname(__file__), "songli_diecut_v1.model")
            target_model_path = model_path_v2 if os.path.exists(model_path_v2) else model_path_v1
            if os.path.exists(target_model_path):
                with open(target_model_path, "r", encoding="utf-8") as mf:
                    ai_model = json.load(mf)
        except Exception as e:
            print(f"[WARN] Failed to load AI diecut model: {e}")

    if ai_model:
        print(f"\n[AI INFERENCE] 收到 {product_id} 請求！正在啟用 AI 貝茲曲線張力平滑 (Tension={ai_model.get('base_tension', 0.65)}) 與美編黃金耳孔 (內洞3mm/外耳8mm)...")
        # 使用 AI 學習到的貝茲張力係數 (base_tension = 0.65+) 進行幾何曲線平滑過渡
        # 先用微小容差去噪，避免直接 simplify(1.0) 造成生硬折角
        simplified_poly = buffered_poly.simplify(0.25, preserve_topology=True)
        if isinstance(simplified_poly, MultiPolygon):
            simplified_poly = max(simplified_poly.geoms, key=lambda a: a.area)
        
        # 執行 Chaikin 曲線柔順化 (利用 AI 張力係數平滑折角)
        tension = ai_model.get("base_tension", 0.65)
        t = max(0.1, min(0.4, (1.0 - tension) / 2.0))
        coords = list(simplified_poly.exterior.coords)
        for _ in range(2):  # 迭代2次達成絲綢般滑順貝茲效果
            new_coords = []
            for i in range(len(coords) - 1):
                p1, p2 = np.array(coords[i]), np.array(coords[i+1])
                q = (1 - t) * p1 + t * p2
                r = t * p1 + (1 - t) * p2
                new_coords.extend([tuple(q), tuple(r)])
            new_coords.append(new_coords[0])
            coords = new_coords
        from shapely.geometry import Polygon as ShapelyPoly
        simplified_poly = ShapelyPoly(coords)
        if not simplified_poly.is_valid:
            simplified_poly = simplified_poly.buffer(0)
    else:
        simplified_poly = buffered_poly.simplify(1.0, preserve_topology=True)
    
    if isinstance(simplified_poly, MultiPolygon):
        simplified_poly = max(simplified_poly.geoms, key=lambda a: a.area)
        
    from shapely.geometry import LineString
    
    # Add Hole (Ear)
    min_x, min_y, max_x, max_y = simplified_poly.bounds
    
    if isinstance(hole_position, (int, float)):
        ratio = max(0.0, min(1.0, float(hole_position)))
        center_x = min_x + (max_x - min_x) * ratio
    else:
        try:
            ratio = max(0.0, min(1.0, float(hole_position)))
            center_x = min_x + (max_x - min_x) * ratio
        except ValueError:
            if hole_position == "left":
                center_x = min_x + (max_x - min_x) * 0.3
            elif hole_position == "right":
                center_x = min_x + (max_x - min_x) * 0.7
            else:
                center_x = (min_x + max_x) / 2
    
    if ai_model and hole_diameter_mm > 0:
        # 嚴格落實美編黃金實測比例：內洞直徑 3.0mm (r=1.5mm) + 耳朵外徑 8.0mm (r=4.0mm)
        hole_radius_mm = 1.5  # 鎖定為黃金標準 3.0mm 直徑 (半徑 1.5mm)
        ear_border_mm = 2.5   # r=1.5 + 2.5 = 4.0mm (外徑 exactly 8mm)
    else:
        hole_radius_mm = hole_diameter_mm / 2.0
        ear_border_mm = 2.5

    hole_radius_px = hole_radius_mm / scale
    ear_radius_px = hole_radius_px + (ear_border_mm / scale)
    
    # Find exact top edge at center_x
    vertical_line = LineString([(center_x, min_y - 100), (center_x, max_y + 100)])
    intersection = simplified_poly.intersection(vertical_line)
    
    intersect_y = min_y
    if not intersection.is_empty:
        if intersection.geom_type == 'LineString':
            intersect_y = min([p[1] for p in intersection.coords])
        elif intersection.geom_type == 'MultiLineString':
            intersect_y = min([min([p[1] for p in line.coords]) for line in intersection.geoms])
        elif intersection.geom_type == 'Point':
            intersect_y = intersection.y
    
    # Position ear slightly below the top edge so it smoothly joins
    ear_center_x = center_x
    ear_center_y = intersect_y - (ear_radius_px * 0.7) # Protrude more
    
    if hole_diameter_mm > 0:
        ear_shape = Point(ear_center_x, ear_center_y).buffer(ear_radius_px)
        final_acrylic_shape = unary_union([simplified_poly, ear_shape])
        if ai_model and isinstance(final_acrylic_shape, Polygon):
            # 1. 【工業級 CAD 形態學內倒角閉運算 (Fillet Bridging)】
            # 透過 buffer(+R) -> buffer(-R) 消除所有尖銳內凹轉角（V-Notch），
            # 讓耳朵與肩膀、下巴下緣、尾巴折角，自動過渡為美編藍色線般的防裂飽滿內角圓弧！
            fillet_r_px = max(9.0, 3.0 / scale)  # 採用美編實測外凸2mm/內凹3mm黃金標準
            try:
                # 採用反向內縮外擴的「內倒角開運算 (Concave Fillet Opening)」，
                # 精準將耳朵接縫與向內凹陷處過渡為半徑 3.0mm 的藍色線圓角！
                closed_shape = final_acrylic_shape.buffer(-fillet_r_px, join_style=1).buffer(+fillet_r_px, join_style=1)
                if closed_shape.is_valid and not closed_shape.is_empty:
                    if isinstance(closed_shape, MultiPolygon):
                        closed_shape = max(closed_shape.geoms, key=lambda a: a.area)
                    final_acrylic_shape = closed_shape
            except Exception:
                pass

            # 2. 【自適應貝茲 S 型柔化過渡】
            # 將倒角後的邊界進行 2 次迭代自適應平滑，徹底將接合處的點過渡為絲滑如波浪的藍色線圓弧！
            tension = ai_model.get("base_tension", 0.65)
            t = max(0.1, min(0.35, (1.0 - tension) / 2.0))
            coords = list(final_acrylic_shape.exterior.coords)
            for _ in range(2):
                new_coords = []
                for i in range(len(coords) - 1):
                    p1, p2 = np.array(coords[i]), np.array(coords[i+1])
                    q = (1 - t) * p1 + t * p2
                    r = t * p1 + (1 - t) * p2
                    new_coords.extend([tuple(q), tuple(r)])
                new_coords.append(new_coords[0])
                coords = new_coords
            from shapely.geometry import Polygon as ShapelyPoly
            smoothed_union = ShapelyPoly(coords)
            if smoothed_union.is_valid:
                final_acrylic_shape = smoothed_union
    else:
        final_acrylic_shape = simplified_poly
        
    # 3. 【嚴守商品隔離：只針對 biz_thick 厚切電子票證進行最大範圍限縮】
    # 依據 Kiven 提供的「厚切電子票證最大範圍.svg」之物理極限規格：
    # 最大極限尺寸 = 寬 54.0 mm × 高 85.6 mm，四角圓角半徑 = 3.3 mm。
    # 以圖片正中心為基準，執行 Shapely 幾何交集限縮 (Intersection Clipping)，絕不超框！
    try:
        max_w_px = 54.0 / scale
        max_h_px = 85.6 / scale
        radius_px = 3.3 / scale
        
        cx = w / 2.0
        cy = h / 2.0
        
        from shapely.geometry import box as ShapelyBox
        inner_box = ShapelyBox(
            cx - (max_w_px / 2.0) + radius_px,
            cy - (max_h_px / 2.0) + radius_px,
            cx + (max_w_px / 2.0) - radius_px,
            cy + (max_h_px / 2.0) - radius_px
        )
        max_boundary_poly = inner_box.buffer(radius_px, join_style=1, resolution=32)
        
        if max_boundary_poly.is_valid and not max_boundary_poly.is_empty:
            clipped_shape = final_acrylic_shape.intersection(max_boundary_poly)
            if clipped_shape.is_valid and not clipped_shape.is_empty:
                final_acrylic_shape = clipped_shape
    except Exception:
        pass

    if isinstance(final_acrylic_shape, MultiPolygon):
        final_acrylic_shape = max(final_acrylic_shape.geoms, key=lambda a: a.area)
        
    final_path_px = list(final_acrylic_shape.exterior.coords)
    
    dxf_path_mm = [(x * scale, y * scale) for x, y in final_path_px]
    hole_center_mm = (ear_center_x * scale, ear_center_y * scale) if hole_diameter_mm > 0 else None
    
    return {
        "final_path_px": final_path_px,
        "dxf_path_mm": dxf_path_mm,
        "hole_center_px": (ear_center_x, ear_center_y) if hole_diameter_mm > 0 else None,
        "hole_radius_px": hole_radius_px,
        "hole_center_mm": hole_center_mm,
        "hole_radius_mm": hole_radius_mm,
        "scale": scale,
        "img_w_px": w,
        "img_h_px": h,
        "bounds_px": final_acrylic_shape.bounds,
        "content_shift_px": (dx_px, dy_px),
        "product_id": product_id
    }

def draw_preview_die(shape_info, img_bytes, ticket_type="easycard", clasp_type="lobster_gold"):
    """Draws the uploaded image with the red die line and hole overlay, dynamically padding canvas to prevent clipping."""
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    
    # Calculate padding needed to fit the die line
    min_x, min_y, max_x, max_y = shape_info["bounds_px"]
    if shape_info.get("product_id") == "biz_thick":
        scale = shape_info["scale"]
        max_w_px = 54.0 / scale
        max_h_px = 85.6 / scale
        card_min_x = (pil_img.width / 2.0) - (max_w_px / 2.0)
        card_min_y = (pil_img.height / 2.0) - (max_h_px / 2.0)
        card_max_x = (pil_img.width / 2.0) + (max_w_px / 2.0)
        card_max_y = (pil_img.height / 2.0) + (max_h_px / 2.0)
        min_x = min(min_x, card_min_x)
        min_y = min(min_y, card_min_y)
        max_x = max(max_x, card_max_x)
        max_y = max(max_y, card_max_y)
        
    pad_left = int(max(0, -min_x + 20))
    pad_top = int(max(0, -min_y + 20))
    pad_right = int(max(0, max_x - pil_img.width + 20))
    pad_bottom = int(max(0, max_y - pil_img.height + 20))
    
    # 【嚴守商品隔離：只針對 biz_thick 厚切商品，生成包含金屬鑰匙圈的「成品示意」雙面對照圖】
    if shape_info.get("product_id") == "biz_thick":
        hc = shape_info.get("hole_center_px")
        if hc:
            needed_top = 220 - int(hc[1] + pad_top)
            if needed_top > 0:
                pad_top += needed_top
        new_h = pil_img.height + pad_top + pad_bottom
        new_w = pil_img.width + pad_left + pad_right
        
        gap = 100
        dual_w = new_w * 2 + gap
        dual_h = new_h + 40
        preview = Image.new('RGBA', (dual_w, dual_h), (255, 255, 255, 255))
        draw = ImageDraw.Draw(preview)

        # 1. 繪製左上角「成品示意」標題
        from PIL import ImageFont, ImageFilter, ImageChops
        font_size_title = max(26, int(new_w / 11))
        try:
            font_title = ImageFont.truetype("C:\\Windows\\Fonts\\msjhbd.ttc", font_size_title)
        except:
            try:
                font_title = ImageFont.truetype("C:\\Windows\\Fonts\\msjh.ttc", font_size_title)
            except:
                font_title = ImageFont.load_default()
        draw.text((pad_left, 30), "成品示意", font=font_title, fill=(20, 20, 20, 255))

        # 正面與背面中心坐標
        cx_front = pad_left + (pil_img.width / 2.0)
        cy_front = pad_top + (pil_img.height / 2.0)
        cx_back = cx_front + new_w + gap
        cy_back = cy_front

        shifted_path = [(x + pad_left, y + pad_top) for x, y in shape_info["final_path_px"]]
        back_path = [(cx_back + cx_front - x, y) for x, y in shifted_path]

        # 2. 壓克力底座柔和陰影
        shadow_layer = Image.new('RGBA', (dual_w, dual_h), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(shadow_layer)
        s_draw.polygon([(x+8, y+8) for x, y in shifted_path], fill=(0, 0, 0, 45))
        s_draw.polygon([(x+8, y+8) for x, y in back_path], fill=(0, 0, 0, 45))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(8))
        preview = Image.alpha_composite(preview, shadow_layer)

        # 3. 壓克力本體底層 (正面與背面為白色/透明質感底板)
        body_layer = Image.new('RGBA', (dual_w, dual_h), (0, 0, 0, 0))
        b_draw = ImageDraw.Draw(body_layer)
        b_draw.polygon(shifted_path, fill=(255, 255, 255, 255), outline=(210, 215, 220, 255), width=2)
        b_draw.polygon(back_path, fill=(255, 255, 255, 255), outline=(210, 215, 220, 255), width=2)
        preview = Image.alpha_composite(preview, body_layer)

        # 4. 正面貼上 100% 飽和度圖案 (雷射遮罩防超框)
        front_img = pil_img.copy()
        dx_px, dy_px = shape_info.get("content_shift_px", (0.0, 0.0))
        scale = shape_info["scale"]
        max_w_px = 54.0 / scale
        max_h_px = 85.6 / scale
        radius_px = 3.3 / scale
        
        shifted_img = Image.new('RGBA', pil_img.size, (0, 0, 0, 0))
        shifted_img.paste(front_img, (int(round(dx_px)), int(round(dy_px))))
        front_img = shifted_img
        
        cx_orig = pil_img.width / 2.0
        cy_orig = pil_img.height / 2.0
        mask = Image.new('L', pil_img.size, 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([cx_orig - max_w_px/2.0, cy_orig - max_h_px/2.0, cx_orig + max_w_px/2.0, cy_orig + max_h_px/2.0], radius=radius_px, fill=255)
        
        orig_alpha = front_img.getchannel('A')
        front_img.putalpha(ImageChops.darker(orig_alpha, mask))
        preview.paste(front_img, (pad_left, pad_top), front_img)

        # 5. 壓克力邊緣高光
        gloss_layer = Image.new('RGBA', (dual_w, dual_h), (0, 0, 0, 0))
        g_draw = ImageDraw.Draw(gloss_layer)
        g_draw.polygon([(x, y - 2) for x, y in shifted_path], outline=(255, 255, 255, 180), width=2)
        g_draw.polygon([(x, y - 2) for x, y in back_path], outline=(255, 255, 255, 180), width=2)
        preview = Image.alpha_composite(preview, gloss_layer)

        # 6. 打孔位置 (白心灰邊仿真打洞)
        hc = shape_info["hole_center_px"]
        hr = shape_info["hole_radius_px"]
        h_cx_f, h_cy_f = 0, 0
        h_cx_b, h_cy_b = 0, 0
        if hc and hr:
            h_cx_f, h_cy_f = hc[0] + pad_left, hc[1] + pad_top
            h_cx_b = cx_back + cx_front - h_cx_f
            h_cy_b = h_cy_f
            draw = ImageDraw.Draw(preview)
            draw.ellipse([h_cx_f-hr, h_cy_f-hr, h_cx_f+hr, h_cy_f+hr], fill=(255, 255, 255, 255), outline=(170, 175, 180, 255), width=2)
            draw.ellipse([h_cx_b-hr, h_cy_b-hr, h_cx_b+hr, h_cy_b+hr], fill=(255, 255, 255, 255), outline=(170, 175, 180, 255), width=2)

        # 7. 背面：繪製公版 LOGO 與卡號客服資訊
        font_size_logo = max(15, int(new_w / 24))
        font_size_info = max(11, int(new_w / 34))
        try:
            font_logo = ImageFont.truetype("C:\\Windows\\Fonts\\msjh.ttc", font_size_logo)
            font_info = ImageFont.truetype("C:\\Windows\\Fonts\\msjh.ttc", font_size_info)
        except:
            font_logo = font_info = ImageFont.load_default()
            
        def draw_centered_text(cx_pos, y_pos, text_str, font_obj, fill_col):
            if hasattr(draw, 'textbbox'):
                bbox = draw.textbbox((0, 0), text_str, font=font_obj)
                tw = bbox[2] - bbox[0]
            else:
                tw = len(text_str) * (font_obj.size * 0.6)
            draw.text((cx_pos - tw / 2.0, y_pos), text_str, font=font_obj, fill=fill_col)

        logo_y = cy_back + (10.0 / scale)
        pr = max(4, int(new_w / 60))
        draw = ImageDraw.Draw(preview)
        if "ipass" in str(ticket_type).lower():
            draw.ellipse([cx_back - pr*3, logo_y - pr, cx_back - pr, logo_y + pr], fill=(255, 120, 0))
            draw.ellipse([cx_back + pr, logo_y - pr, cx_back + pr*3, logo_y + pr], fill=(0, 180, 80))
            draw_centered_text(cx_back, logo_y + pr*1.5, "iPASS 一卡通", font_logo, (50, 50, 50))
            draw_centered_text(cx_back, logo_y + pr*1.5 + font_size_logo + 4, "888 8888888 8", font_info, (100, 100, 100))
            draw_centered_text(cx_back, logo_y + pr*1.5 + font_size_logo + font_size_info + 8, "客服：(07)791-2000", font_info, (100, 100, 100))
            draw_centered_text(cx_back, logo_y + pr*1.5 + font_size_logo + font_size_info*2 + 12, "www.i-pass.com.tw", font_info, (120, 120, 120))
        else:
            draw.ellipse([cx_back - pr*1.5, logo_y - pr*1.5, cx_back - 2, logo_y - 2], fill=(235, 97, 0))
            draw.ellipse([cx_back + 2, logo_y - pr*1.5, cx_back + pr*1.5, logo_y - 2], fill=(255, 180, 0))
            draw.ellipse([cx_back + 2, logo_y + 2, cx_back + pr*1.5, logo_y + pr*1.5], fill=(0, 160, 80))
            draw.ellipse([cx_back - pr*1.5, logo_y + 2, cx_back - 2, logo_y + pr*1.5], fill=(0, 130, 200))
            draw_centered_text(cx_back, logo_y + pr*2, "EASYCARD 悠遊卡", font_logo, (50, 50, 50))
            draw_centered_text(cx_back, logo_y + pr*2 + font_size_logo + 4, "123456789 1", font_info, (100, 100, 100))
            draw_centered_text(cx_back, logo_y + pr*2 + font_size_logo + font_size_info + 8, "客服 412-8880", font_info, (100, 100, 100))

        # 8. 繪製頂部金屬鑰匙圈與鏈條 (對應正背面打孔位置)
        if hc and hr:
            keychain_layer = Image.new('RGBA', (dual_w, dual_h), (0, 0, 0, 0))
            k_draw = ImageDraw.Draw(keychain_layer)
            
            is_gold = ('gold' in str(clasp_type).lower())
            if is_gold:
                col_dark = (170, 130, 20, 255)
                col_main = (235, 195, 60, 255)
                col_light = (255, 245, 180, 255)
            else:
                col_dark = (120, 125, 130, 255)
                col_main = (190, 195, 200, 255)
                col_light = (245, 248, 250, 255)
                
            def draw_keychain_at_hole(hx, hy):
                # 穿過孔洞的小C環/扣環
                k_draw.arc([hx - 12, hy - 20, hx + 12, hy + 6], start=180, end=360, fill=col_main, width=5)
                k_draw.arc([hx - 12, hy - 20, hx + 12, hy + 6], start=180, end=360, fill=col_light, width=2)
                # 三節金屬鏈條
                k_draw.ellipse([hx - 7, hy - 40, hx + 7, hy - 16], outline=col_dark, width=4)
                k_draw.ellipse([hx - 7, hy - 40, hx + 7, hy - 16], outline=col_main, width=2)
                k_draw.ellipse([hx - 6, hy - 39, hx + 6, hy - 17], outline=col_light, width=1)
                
                k_draw.ellipse([hx - 8, hy - 62, hx + 8, hy - 36], outline=col_dark, width=4)
                k_draw.ellipse([hx - 8, hy - 62, hx + 8, hy - 36], outline=col_main, width=2)
                k_draw.ellipse([hx - 7, hy - 61, hx + 7, hy - 37], outline=col_light, width=1)
                
                k_draw.ellipse([hx - 7, hy - 84, hx + 7, hy - 58], outline=col_dark, width=4)
                k_draw.ellipse([hx - 7, hy - 84, hx + 7, hy - 58], outline=col_main, width=2)
                k_draw.ellipse([hx - 6, hy - 83, hx + 6, hy - 59], outline=col_light, width=1)
                # 旋轉接頭與夾片
                clip_y_top = hy - 124
                clip_y_bot = hy - 80
                k_draw.polygon([(hx - 10, clip_y_bot), (hx + 10, clip_y_bot), (hx + 13, clip_y_top), (hx - 13, clip_y_top)], fill=col_main, outline=col_dark, width=2)
                k_draw.line([(hx - 5, clip_y_bot - 2), (hx - 5, clip_y_top + 2)], fill=col_light, width=3)
                k_draw.line([(hx - 12, hy - 98), (hx + 12, hy - 98)], fill=col_dark, width=2)
                # 頂部大鑰匙圓環
                kr_cx = hx
                kr_cy = hy - 168
                kr_r = 44
                k_draw.ellipse([kr_cx - kr_r, kr_cy - kr_r, kr_cx + kr_r, kr_cy + kr_r], outline=col_dark, width=9)
                k_draw.ellipse([kr_cx - kr_r, kr_cy - kr_r, kr_cx + kr_r, kr_cy + kr_r], outline=col_main, width=7)
                k_draw.ellipse([kr_cx - kr_r + 1, kr_cy - kr_r + 1, kr_cx + kr_r - 1, kr_cy + kr_r - 1], outline=col_light, width=2)
                k_draw.ellipse([kr_cx - kr_r + 3, kr_cy - kr_r + 3, kr_cx + kr_r - 3, kr_cy + kr_r - 3], outline=col_dark, width=1)

            draw_keychain_at_hole(h_cx_f, h_cy_f)
            draw_keychain_at_hole(h_cx_b, h_cy_b)
            preview = Image.alpha_composite(preview, keychain_layer)

        out_io = io.BytesIO()
        preview.save(out_io, format="PNG")
        return out_io.getvalue()

    # 其他非厚切商品：維持原版單一預覽圖邏輯
    preview = Image.new('RGBA', (new_w, new_h), (0, 0, 0, 0))
    
    # Draw original image with 80% opacity
    faded_img = pil_img.copy()
    faded_img.putalpha(faded_img.getchannel('A').point(lambda i: i * 0.8))
    preview.paste(faded_img, (pad_left, pad_top))
    
    draw = ImageDraw.Draw(preview)
    
    # Draw outline with offset
    shifted_path = [(x + pad_left, y + pad_top) for x, y in shape_info["final_path_px"]]
    draw.polygon(shifted_path, outline="red", width=1, fill=None)
    
    # Draw hole prominently with offset
    hc = shape_info["hole_center_px"]
    hr = shape_info["hole_radius_px"]
    if hc and hr:
        cx, cy = hc[0] + pad_left, hc[1] + pad_top
        draw.ellipse([cx-hr, cy-hr, cx+hr, cy+hr], fill="white", outline="blue", width=2)
        
    out_io = io.BytesIO()
    preview.save(out_io, format="PNG")
    return out_io.getvalue()

def render_3d_mockup(img_bytes, shape_info, clasp_type="none", bg_bytes=None):
    """Renders the 3D-like acrylic mockup with dual view (Front and Side)."""
    from PIL import ImageFont
    
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    f_min_x, f_min_y, f_max_x, f_max_y = shape_info["bounds_px"]
    
    # Calculate sizes
    front_w = int(f_max_x - f_min_x)
    front_h = int(f_max_y - f_min_y)
    
    # Expand canvas to fit shadow, dimensions, and side view
    pad_top = 180
    pad_bottom = 150
    pad_left = 350 # Increased padding to prevent dimension cutoff
    gap = 200 # gap between front and side view
    side_w = 40 # width of the 4mm acrylic side view
    pad_right = 150
    
    canvas_w = pad_left + front_w + gap + side_w + pad_right
    canvas_h = pad_top + front_h + pad_bottom
    
    
    # Base background
    final_mockup = Image.new('RGBA', (canvas_w, canvas_h), (30, 30, 30, 255))
    
    # Mask for inpainting (black background, white where we want AI to redraw)
    ai_mask = Image.new('L', (canvas_w, canvas_h), 0)
    mask_draw = ImageDraw.Draw(ai_mask)
    
    if bg_bytes:
        try:
            bg_img = Image.open(io.BytesIO(bg_bytes)).convert("RGBA")
            # cover scale
            scale = max(canvas_w / bg_img.width, canvas_h / bg_img.height)
            new_w, new_h = int(bg_img.width * scale), int(bg_img.height * scale)
            bg_img = bg_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            cx, cy = (new_w - canvas_w) // 2, (new_h - canvas_h) // 2
            bg_img = bg_img.crop((cx, cy, cx + canvas_w, cy + canvas_h))
            final_mockup.paste(bg_img, (0, 0))
        except Exception:
            pass
            
    # Front View offsets
    offset_x = pad_left - int(f_min_x)
    offset_y = pad_top - int(f_min_y)
    
    acrylic_coords = [(x + offset_x, y + offset_y) for x, y in shape_info["final_path_px"]]
    
    # --- 1. FRONT VIEW: Shadow ---
    shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_coords = [(x + 20, y + 20) for x, y in acrylic_coords]
    shadow_draw.polygon(shadow_coords, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    final_mockup = Image.alpha_composite(final_mockup, shadow)
    
    # --- 2. FRONT VIEW: 3D Extrusion (Thickness) ---
    extrusion_depth = 12
    for i in range(extrusion_depth, 0, -1):
        layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        # shift right and down
        offset_coords = [(x + i, y + i) for x, y in acrylic_coords]
        if i == extrusion_depth:
            draw.polygon(offset_coords, fill=(80, 90, 100, 200)) # bottom rim (dark glass)
        else:
            draw.polygon(offset_coords, fill=(150, 160, 170, 150)) # glass body
        final_mockup = Image.alpha_composite(final_mockup, layer)

    # --- 3. FRONT VIEW: Top Surface ---
    shape_layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    shape_draw = ImageDraw.Draw(shape_layer)
    # very transparent white for clear acrylic
    shape_draw.polygon(acrylic_coords, fill=(255, 255, 255, 20), outline=(220, 220, 220, 180))
    
    # Hole cut
    hc = shape_info["hole_center_px"]
    hr = shape_info["hole_radius_px"]
    hx, hy = 0, 0
    if hc and hr:
        hx, hy = hc[0] + offset_x, hc[1] + offset_y
        shape_draw.ellipse([hx-hr, hy-hr, hx+hr, hy+hr], fill=(0,0,0,0), outline=(150, 160, 170, 200))
        # Draw hole extrusion inside
        for i in range(extrusion_depth):
            shape_draw.arc([hx-hr+i, hy-hr+i, hx+hr+i, hy+hr+i], 0, 360, fill=(100, 110, 120, 80))

    final_mockup = Image.alpha_composite(final_mockup, shape_layer)
    
    # --- 3.5. FRONT VIEW: Jump Ring (Bottom Half) ---
    # Draw the part of the jump ring that goes THROUGH/UNDER the hole
    jump_ring_layer_bottom = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    if clasp_type != "none" and hc and hr:
        jr_color = (212, 175, 55, 255) if 'gold' in clasp_type else (200, 200, 200, 255)
        jr_radius = hr * 1.5
        jr_draw = ImageDraw.Draw(jump_ring_layer_bottom)
        # bottom half of ring, make it an oval reaching up to clasp
        jr_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 0, 180, fill=jr_color, width=6)
        final_mockup = Image.alpha_composite(final_mockup, jump_ring_layer_bottom)
        # Add to mask
        mask_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 0, 180, fill=255, width=12) # Slightly thicker mask
    
    # --- 4. Paste Image (Front) ---
    final_mockup.paste(pil_img, (offset_x, offset_y), pil_img)
    
    # Add glossy reflection curve
    gloss = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_coords = [(x, y - 2) for x, y in acrylic_coords]
    gloss_draw.polygon(gloss_coords, outline=(255, 255, 255, 150), width=2)
    final_mockup = Image.alpha_composite(final_mockup, gloss)

    # --- 4.1. Add Clasps BEFORE Top Jump Ring ---
    if clasp_type != "none" and hc and hr:
        import os
        clasp_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "assets", f"{clasp_type}.png")
        if os.path.exists(clasp_path):
            clasp_img = Image.open(clasp_path).convert("RGBA")
            
            # Auto-crop transparent borders so the bottom exactly matches the metal
            bbox = clasp_img.getbbox()
            if bbox:
                clasp_img = clasp_img.crop(bbox)
            
            # Scale clasp realistically (approx 15mm width)
            target_clasp_w_px = int(15.0 / shape_info["scale"])
            ratio = target_clasp_w_px / clasp_img.width
            cw = target_clasp_w_px
            ch = int(clasp_img.height * ratio)
            clasp_img = clasp_img.resize((cw, ch), Image.Resampling.LANCZOS)
            
            # Paste on Front View (lifted slightly so jump ring can pass through)
            paste_x = int(hx - cw / 2)
            paste_y = int(hy - ch - hr * 1.8)
            final_mockup.paste(clasp_img, (paste_x, paste_y), clasp_img)
            
            # Paste on Side View
            side_x = pad_left + front_w + gap
            hole_y = pad_top + (shape_info["hole_center_px"][1] - int(f_min_y))
            paste_x_side = int(side_x + side_w/2 - cw/2)
            paste_y_side = int(hole_y - ch - hr * 1.8)
            final_mockup.paste(clasp_img, (paste_x_side, paste_y_side), clasp_img)
            
            # Add clasps to mask
            clasp_mask = clasp_img.getchannel('A')
            ai_mask.paste(clasp_mask, (paste_x, paste_y), clasp_mask)
            ai_mask.paste(clasp_mask, (paste_x_side, paste_y_side), clasp_mask)

    # --- 4.5. FRONT VIEW: Jump Ring (Top Half) ---
    jump_ring_layer_top = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    if clasp_type != "none" and hc and hr:
        jr_color = (255, 215, 0, 255) if 'gold' in clasp_type else (220, 220, 220, 255) # Brighter top
        jr_radius = hr * 1.5
        jr_draw = ImageDraw.Draw(jump_ring_layer_top)
        # top half of ring
        jr_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 180, 360, fill=jr_color, width=6)
        # Drop shadow for top ring over acrylic
        jr_shadow = jump_ring_layer_top.copy().filter(ImageFilter.GaussianBlur(2))
        final_mockup = Image.alpha_composite(final_mockup, jr_shadow)
        final_mockup = Image.alpha_composite(final_mockup, jump_ring_layer_top)
        
        # Add to mask
        mask_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 180, 360, fill=255, width=12)

    # --- 5. SIDE VIEW ---
    side_x = pad_left + front_w + gap
    side_y_start = pad_top
    side_y_end = pad_top + front_h
    
    side_layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    side_draw = ImageDraw.Draw(side_layer)
    
    # Side shadow
    side_draw.rounded_rectangle([side_x + 10, side_y_start + 10, side_x + side_w + 10, side_y_end + 10], radius=10, fill=(0,0,0,150))
    side_layer = side_layer.filter(ImageFilter.GaussianBlur(10))
    final_mockup = Image.alpha_composite(final_mockup, side_layer)
    
    # Side body
    side_body = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    sb_draw = ImageDraw.Draw(side_body)
    # Glassy effect
    sb_draw.rounded_rectangle([side_x, side_y_start, side_x + side_w, side_y_end], radius=10, fill=(200, 210, 220, 120), outline=(150, 160, 170, 200), width=2)
    # Highlights on edges
    sb_draw.line([(side_x+5, side_y_start+10), (side_x+5, side_y_end-10)], fill=(255,255,255,150), width=3)
    sb_draw.line([(side_x+side_w-5, side_y_start+10), (side_x+side_w-5, side_y_end-10)], fill=(120,130,140,150), width=3)
    # Draw hole vertically in side view
    if hc and hr:
        # The hole is near the top
        hole_y = pad_top + (shape_info["hole_center_px"][1] - int(f_min_y))
        sb_draw.rectangle([side_x, hole_y - hr, side_x + side_w, hole_y + hr], fill=(0,0,0,0), outline=(100,110,120,150))
    final_mockup = Image.alpha_composite(final_mockup, side_body)
    
    # Side Jump Ring
    if clasp_type != "none" and hc and hr:
        side_jr = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        jr_draw = ImageDraw.Draw(side_jr)
        jr_color = (255, 215, 0, 255) if 'gold' in clasp_type else (220, 220, 220, 255)
        jr_draw.ellipse([side_x+side_w/2-8, hole_y - hr*2.5, side_x+side_w/2+8, hole_y + hr*0.5], outline=jr_color, width=6)
        final_mockup = Image.alpha_composite(final_mockup, side_jr)
        # Add to mask
        mask_draw.ellipse([side_x+side_w/2-8, hole_y - hr*2.5, side_x+side_w/2+8, hole_y + hr*0.5], outline=255, width=12)

    # --- 7. Dimensions Drawing ---
    draw_dim = ImageDraw.Draw(final_mockup)
    
    # Load Font
    font = None
    try:
        font = ImageFont.truetype("C:\\Windows\\Fonts\\msjh.ttc", 36)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except:
            font = ImageFont.load_default()
            
    lc = (212, 175, 55, 255) # Gold color
    
    mm_w = shape_info["img_w_px"] * shape_info["scale"]
    mm_h = shape_info["img_h_px"] * shape_info["scale"]
    
    # Calculate exact bounds of the drawn acrylic shape
    actual_min_x = f_min_x + offset_x
    actual_max_x = f_max_x + offset_x
    actual_min_y = f_min_y + offset_y
    actual_max_y = f_max_y + offset_y
    
    # Front Width (Bottom)
    bx_start = actual_min_x
    bx_end = actual_max_x
    by = pad_top + front_h + 80
    draw_dim.line([(bx_start, by), (bx_end, by)], fill=lc, width=3)
    draw_dim.line([(bx_start, by-15), (bx_start, by+15)], fill=lc, width=3)
    draw_dim.line([(bx_end, by-15), (bx_end, by+15)], fill=lc, width=3)
    text_w = f"約 {int(mm_w)} mm"
    # To center text, we approximate width or use bounding box if available
    tw = draw_dim.textlength(text_w, font=font) if hasattr(draw_dim, 'textlength') else 100
    draw_dim.text((bx_start + (bx_end-bx_start)//2 - tw/2, by + 20), text_w, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    # Front Height (Left)
    hy_start = actual_min_y
    hy_end = actual_max_y
    hx_line = actual_min_x - 80
    draw_dim.line([(hx_line, hy_start), (hx_line, hy_end)], fill=lc, width=3)
    draw_dim.line([(hx_line-15, hy_start), (hx_line+15, hy_start)], fill=lc, width=3)
    draw_dim.line([(hx_line-15, hy_end), (hx_line+15, hy_end)], fill=lc, width=3)
    text_h = f"約 {int(mm_h)} mm"
    tw_h = draw_dim.textlength(text_h, font=font) if hasattr(draw_dim, 'textlength') else 100
    # draw text rotated or just normally beside it
    draw_dim.text((hx_line - tw_h - 30, hy_start + (hy_end-hy_start)//2 - 20), text_h, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    # Side Width (Bottom)
    sx_start = side_x
    sx_end = side_x + side_w
    sy = pad_top + front_h + 80
    draw_dim.line([(sx_start, sy), (sx_end, sy)], fill=lc, width=3)
    draw_dim.line([(sx_start, sy-15), (sx_start, sy+15)], fill=lc, width=3)
    draw_dim.line([(sx_end, sy-15), (sx_end, sy+15)], fill=lc, width=3)
    text_s = "約 4 mm"
    tw_s = draw_dim.textlength(text_s, font=font) if hasattr(draw_dim, 'textlength') else 100
    draw_dim.text((sx_start + (sx_end-sx_start)//2 - tw_s/2, sy + 20), text_s, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    out_io = io.BytesIO()
    # Save as PNG with solid dark background
    solid_bg = Image.new("RGB", final_mockup.size, (30, 30, 30))
    solid_bg.paste(final_mockup, mask=final_mockup.split()[3])
    solid_bg.save(out_io, format="PNG", dpi=(350, 350))
    
    mask_io = io.BytesIO()
    # Dilate mask slightly to ensure AI has context around the metal
    ai_mask = ai_mask.filter(ImageFilter.MaxFilter(5)) 
    ai_mask.save(mask_io, format="PNG", dpi=(350, 350))
    
    return out_io.getvalue(), mask_io.getvalue()
