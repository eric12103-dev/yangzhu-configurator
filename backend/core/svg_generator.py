import svgwrite
import base64

def generate_svg_bytes(dxf_path_mm, hole_center_mm, hole_radius_mm, img_bytes, img_width_mm, img_height_mm, offset_x_mm, offset_y_mm):
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
    
    width_mm = max_x - min_x
    height_mm = max_y - min_y
    
    dwg = svgwrite.Drawing(size=(f"{width_mm}mm", f"{height_mm}mm"), viewBox=f"{min_x} {min_y} {width_mm} {height_mm}")
    
    # Embed the image
    img_b64 = base64.b64encode(img_bytes).decode('utf-8')
    href = f"data:image/png;base64,{img_b64}"
    
    # The image origin is at offset_x_mm, offset_y_mm in the SVG coordinate system
    # Wait, the dxf_path_mm might have Y inverted if it was built for DXF.
    # We should ensure the path matches the SVG coordinate system (Y goes down).
    dwg.add(dwg.image(href=href, insert=(offset_x_mm, offset_y_mm), size=(img_width_mm, img_height_mm)))
    
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
