import ezdxf
import io

def generate_dxf_bytes(dxf_path_points, hole_center, hole_radius):
    """
    Generates a DXF file from the given path points and hole info.
    Returns the DXF file as bytes.
    """
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    
    # Draw the main cutting path
    # dxf_path_points is a list of (x,y)
    if dxf_path_points:
        # ezdxf add_lwpolyline needs a list of (x, y) points
        polyline = msp.add_lwpolyline(dxf_path_points, close=True)
        # Set color to red for cutting line (usually color 1 is red in DXF)
        polyline.dxf.color = 1 
        
    # Draw the hole
    if hole_center and hole_radius > 0:
        # Set color to red for cutting
        circle = msp.add_circle(hole_center, hole_radius)
        circle.dxf.color = 1
        
    # Save to in-memory bytes
    # ezdxf docs recommend writing to string or stream, we can use a string stream and encode
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode('utf-8')
