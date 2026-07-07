import svgwrite
import base64
import os
import io
from PIL import Image as PILImage

def generate_svg_bytes(dxf_path_mm, hole_center_mm, hole_radius_mm, img_bytes, img_width_mm, img_height_mm, offset_x_mm, offset_y_mm, is_biz_thick=False, shape_info=None, ticket_type="easycard"):
    """
    Generates an SVG file containing the embedded image and the cutting path (die line).
    dxf_path_mm is a list of (x,y) in mm.
    """
    # Calculate bounding box to set SVG size
    if not dxf_path_mm:
        return b""
        
    xs = [p[0] for p in dxf_path_mm]
    ys = [p[1] for p in dxf_path_mm]
    
    # Adding a small margin for the SVG canvas
    min_x = min(xs) - 10
    max_x = max(xs) + 10
    min_y = min(ys) - 10
    max_y = max(ys) + 10
    
    cx_mm = offset_x_mm + (img_width_mm / 2.0)
    cy_mm = offset_y_mm + (img_height_mm / 2.0)
    cx_back_mm = 0.0

    if is_biz_thick:
        frame_min_x = cx_mm - 27.0
        frame_max_x = cx_mm + 27.0
        frame_min_y = cy_mm - 42.8
        frame_max_y = cy_mm + 42.8
        min_x = min(min_x, frame_min_x - 5)
        min_y = min(min_y, frame_min_y - 5)
        
        # 雙面並列：計算右側背面鏡像坐標
        gap_mm = 20.0
        front_w_mm = (frame_max_x - min_x) + 5
        cx_back_mm = cx_mm + front_w_mm + gap_mm
        max_x = cx_back_mm + 27.0 + 10
        max_y = max(max_y, frame_max_y + 12)
    
    width_mm = max_x - min_x
    height_mm = max_y - min_y
    
    dwg = svgwrite.Drawing(size=(f"{width_mm}mm", f"{height_mm}mm"), viewBox=f"{min_x} {min_y} {width_mm} {height_mm}")
    
    # Embed the image with explicit 350 DPI metadata for Adobe Illustrator / Photoshop
    try:
        from PIL import Image as PILImage
        import io as pil_io
        pil_img = PILImage.open(pil_io.BytesIO(img_bytes)).convert("RGBA")
        
        # 【嚴守商品隔離：只針對 biz_thick 厚切商品，於導出 SVG 前進行置中平移與防超框雷射遮罩剪裁】
        if is_biz_thick and shape_info:
            dx_px, dy_px = shape_info.get("content_shift_px", (0.0, 0.0))
            scale = shape_info["scale"]
            max_w_px = 54.0 / scale
            max_h_px = 85.6 / scale
            radius_px = 3.3 / scale
            
            shifted_img = PILImage.new('RGBA', pil_img.size, (0, 0, 0, 0))
            shifted_img.paste(pil_img, (int(round(dx_px)), int(round(dy_px))))
            pil_img = shifted_img
            
            cx = pil_img.width / 2.0
            cy = pil_img.height / 2.0
            mask = PILImage.new('L', pil_img.size, 0)
            from PIL import ImageDraw as PILImageDraw, ImageChops as PILImageChops
            mask_draw = PILImageDraw.Draw(mask)
            mask_draw.rounded_rectangle([cx - max_w_px/2.0, cy - max_h_px/2.0, cx + max_w_px/2.0, cy + max_h_px/2.0], radius=radius_px, fill=255)
            
            orig_alpha = pil_img.getchannel('A')
            pil_img.putalpha(PILImageChops.darker(orig_alpha, mask))
            
        out_io = pil_io.BytesIO()
        pil_img.save(out_io, format="PNG", dpi=(350, 350))
        img_bytes_to_embed = out_io.getvalue()
    except Exception:
        img_bytes_to_embed = img_bytes

    img_b64 = base64.b64encode(img_bytes_to_embed).decode('utf-8')
    href = f"data:image/png;base64,{img_b64}"
    
    # The image origin is at offset_x_mm, offset_y_mm in the SVG coordinate system
    dwg.add(dwg.image(href=href, insert=(offset_x_mm, offset_y_mm), size=(img_width_mm, img_height_mm)))
    
    # Draw maximum boundary frame for biz_thick (54mm x 85.6mm, rx=ry=3.3mm) with red outline
    if is_biz_thick:
        frame_x = cx_mm - 27.0
        frame_y = cy_mm - 42.8
        dwg.add(dwg.rect(insert=(frame_x, frame_y), size=(54.0, 85.6), rx=3.3, ry=3.3, fill="none", stroke="red", stroke_width=0.5, id="正面厚切最大範圍"))
        
        # 背面紅外框
        back_frame_x = cx_back_mm - 27.0
        dwg.add(dwg.rect(insert=(back_frame_x, frame_y), size=(54.0, 85.6), rx=3.3, ry=3.3, fill="none", stroke="red", stroke_width=0.5, id="背面厚切最大範圍"))
    
    # Draw cut path (正面)
    path_data = "M " + f"{dxf_path_mm[0][0]},{dxf_path_mm[0][1]} "
    for p in dxf_path_mm[1:]:
        path_data += f"L {p[0]},{p[1]} "
    path_data += "Z"
    dwg.add(dwg.path(d=path_data, fill="none", stroke="red", stroke_width=0.5, id="正面刀模"))
    
    # Draw hole (正面)
    if hole_center_mm and hole_radius_mm > 0:
        dwg.add(dwg.circle(center=hole_center_mm, r=hole_radius_mm, fill="none", stroke="blue", stroke_width=0.5, id="正面打孔"))
        
    # 【嚴守商品隔離：只針對 biz_thick 厚切商品，生成背面鏡像刀模與公版規範 SVG 向量物件】
    if is_biz_thick:
        # 背面鏡像刀模
        back_path_data = "M " + f"{cx_back_mm + cx_mm - dxf_path_mm[0][0]},{dxf_path_mm[0][1]} "
        for p in dxf_path_mm[1:]:
            back_path_data += f"L {cx_back_mm + cx_mm - p[0]},{p[1]} "
        back_path_data += "Z"
        dwg.add(dwg.path(d=back_path_data, fill="none", stroke="red", stroke_width=0.5, id="背面鏡像對位刀模"))

        # 背面鏡像打孔
        if hole_center_mm and hole_radius_mm > 0:
            hc_back_mm = (cx_back_mm + cx_mm - hole_center_mm[0], hole_center_mm[1])
            dwg.add(dwg.circle(center=hc_back_mm, r=hole_radius_mm, fill="none", stroke="blue", stroke_width=0.5, id="背面鏡像對位打孔"))

        # 線圈安全範圍虛線圓 (直徑 35mm，半徑 17.5mm)
        coil_cy_mm = cy_mm + 4.0
        dwg.add(dwg.circle(center=(cx_back_mm, coil_cy_mm), r=17.5, fill="none", stroke="#e11d48", stroke_width=0.5, stroke_dasharray="2,2", id="背面線圈安全範圍(直徑35mm)"))
        dwg.add(dwg.circle(center=(cx_mm, coil_cy_mm), r=17.5, fill="none", stroke="#e11d48", stroke_width=0.5, stroke_dasharray="2,2", id="正面線圈安全範圍(直徑35mm)"))

        # 公版 LOGO 與文字規範 (嵌入自刀模資料庫下載的官方 LOGO)
        logo_filename = "ipass_logo.png" if "ipass" in str(ticket_type).lower() else "easycard_logo.png"
        logo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", logo_filename)
        
        if os.path.exists(logo_path):
            try:
                with open(logo_path, "rb") as f:
                    logo_bytes = f.read()
                logo_b64 = base64.b64encode(logo_bytes).decode('utf-8')
                logo_href = f"data:image/png;base64,{logo_b64}"
                logo_w_mm = 30.0
                with PILImage.open(io.BytesIO(logo_bytes)) as lim:
                    logo_h_mm = logo_w_mm * (lim.height / float(max(1, lim.width)))
                logo_x_mm = cx_back_mm - (logo_w_mm / 2.0)
                logo_y_mm = cy_mm + 4.0
                dwg.add(dwg.image(href=logo_href, insert=(logo_x_mm, logo_y_mm), size=(logo_w_mm, logo_h_mm), id="官方公版LOGO"))
                info_y_mm = logo_y_mm + logo_h_mm + 3.0
            except Exception:
                info_y_mm = cy_mm + 15.0
        else:
            info_y_mm = cy_mm + 15.0
            
        if "ipass" in str(ticket_type).lower():
            dwg.add(dwg.text("888 8888888 8", insert=(cx_back_mm, info_y_mm), font_size="2.8mm", text_anchor="middle", fill="#666666", font_family="Microsoft JhengHei, Arial"))
            dwg.add(dwg.text("客服：(07)791-2000", insert=(cx_back_mm, info_y_mm + 5.0), font_size="2.8mm", text_anchor="middle", fill="#666666", font_family="Microsoft JhengHei, Arial"))
            dwg.add(dwg.text("www.i-pass.com.tw", insert=(cx_back_mm, info_y_mm + 10.0), font_size="2.5mm", text_anchor="middle", fill="#888888", font_family="Microsoft JhengHei, Arial"))
        else:
            dwg.add(dwg.text("123456789 1", insert=(cx_back_mm, info_y_mm), font_size="2.8mm", text_anchor="middle", fill="#666666", font_family="Microsoft JhengHei, Arial"))
            dwg.add(dwg.text("客服 412-8880", insert=(cx_back_mm, info_y_mm + 5.0), font_size="2.8mm", text_anchor="middle", fill="#666666", font_family="Microsoft JhengHei, Arial"))

        # 底部標籤
        dwg.add(dwg.text("(FRONT) 正面打印與刀模", insert=(cx_mm, max_y - 3), font_size="3.5mm", text_anchor="middle", fill="#111111", font_weight="bold", font_family="Microsoft JhengHei, Arial"))
        dwg.add(dwg.text("(BACK) 背面鏡像刀模與公版規範", insert=(cx_back_mm, max_y - 3), font_size="3.5mm", text_anchor="middle", fill="#111111", font_weight="bold", font_family="Microsoft JhengHei, Arial"))

    return dwg.tostring().encode('utf-8')
