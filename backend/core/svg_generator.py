import svgwrite
import base64

def generate_svg_bytes(dxf_path_mm, hole_center_mm, hole_radius_mm, img_bytes, img_width_mm, img_height_mm, offset_x_mm, offset_y_mm, is_biz_thick=False):
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
    
    if is_biz_thick:
        cx_mm = offset_x_mm + (img_width_mm / 2.0)
        cy_mm = offset_y_mm + (img_height_mm / 2.0)
        frame_min_x = cx_mm - 27.0
        frame_max_x = cx_mm + 27.0
        frame_min_y = cy_mm - 42.8
        frame_max_y = cy_mm + 42.8
        min_x = min(min_x, frame_min_x - 5)
        max_x = max(max_x, frame_max_x + 5)
        min_y = min(min_y, frame_min_y - 5)
        max_y = max(max_y, frame_max_y + 5)
    
    width_mm = max_x - min_x
    height_mm = max_y - min_y
    
    dwg = svgwrite.Drawing(size=(f"{width_mm}mm", f"{height_mm}mm"), viewBox=f"{min_x} {min_y} {width_mm} {height_mm}")
    
    # Embed the image with explicit 350 DPI metadata for Adobe Illustrator / Photoshop
    try:
        from PIL import Image as PILImage
        import io as pil_io
        pil_img = PILImage.open(pil_io.BytesIO(img_bytes))
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
        cx_mm = offset_x_mm + (img_width_mm / 2.0)
        cy_mm = offset_y_mm + (img_height_mm / 2.0)
        frame_x = cx_mm - 27.0
        frame_y = cy_mm - 42.8
        dwg.add(dwg.rect(insert=(f"{frame_x}mm", f"{frame_y}mm"), size=("54mm", "85.6mm"), rx="3.3mm", ry="3.3mm", fill="none", stroke="red", stroke_width=0.5, id="厚切電子票證最大範圍"))
    
    # Draw cut path
    path_data = "M " + f"{dxf_path_mm[0][0]},{dxf_path_mm[0][1]} "
    for p in dxf_path_mm[1:]:
        path_data += f"L {p[0]},{p[1]} "
    path_data += "Z"
    
    dwg.add(dwg.path(d=path_data, fill="none", stroke="red", stroke_width=0.5))
    
    # Draw hole
    if hole_center_mm and hole_radius_mm > 0:
        dwg.add(dwg.circle(center=hole_center_mm, r=hole_radius_mm, fill="none", stroke="red", stroke_width=0.5))
    
    return dwg.tostring().encode('utf-8')
