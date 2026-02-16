"""
PDF Export Tool for Wash Care Label Designer.

Generates a PDF file with exact mm dimensions using reportlab.
Components (text, paragraph, image) are placed at precise positions.
"""

import base64
import io
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import landscape
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.utils import ImageReader


def generate_pdf(data, output_path):
    """
    Generate a PDF from label designer data.

    Args:
        data: dict with 'label' ({width, height} in mm) and 'components' list
        output_path: file path for the output PDF
    """
    label = data["label"]
    components = data.get("components", [])

    w_mm = label["width"]
    h_mm = label["height"]

    # Create PDF with exact label dimensions
    page_w = w_mm * mm
    page_h = h_mm * mm

    c = pdf_canvas.Canvas(output_path, pagesize=(page_w, page_h))

    # Draw PDF background if present
    pdf_bg = data.get("pdfBackground")
    if pdf_bg:
        try:
            header, b64_data = pdf_bg.split(",", 1)
            img_bytes = base64.b64decode(b64_data)
            img = ImageReader(io.BytesIO(img_bytes))
            c.drawImage(img, 0, 0, width=page_w, height=page_h)
        except Exception:
            pass

    # Draw label border
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.5)
    c.rect(0, 0, page_w, page_h)

    for comp in components:
        comp_type = comp.get("type", "")
        x = comp.get("x", 0) * mm
        # reportlab origin is bottom-left; convert from top-left
        y = page_h - comp.get("y", 0) * mm
        w = comp.get("width", 0) * mm
        h = comp.get("height", 0) * mm

        if comp_type == "pdfpath":
            _draw_pdfpath(c, comp, page_h)
        elif comp_type in ("text", "paragraph"):
            _draw_text(c, comp, x, y, w, h)
        elif comp_type == "image":
            _draw_image(c, comp, x, y, w, h)
        elif comp_type == "barcode":
            _draw_barcode(c, comp, x, y, w, h)
        elif comp_type == "qrcode":
            _draw_qrcode(c, comp, x, y, w, h)

    c.save()


def _draw_pdfpath(c, comp, page_h):
    """Draw a vector path object extracted from a PDF."""
    path_data = comp.get("pathData", {})
    ops = path_data.get("ops", [])
    fill = path_data.get("fill")
    stroke = path_data.get("stroke")
    lw = path_data.get("lw", 0.5)

    if not ops:
        return

    p = c.beginPath()
    for op in ops:
        o = op.get("o", "")
        a = op.get("a", [])
        if o == "M" and len(a) >= 2:
            p.moveTo(a[0] * mm, page_h - a[1] * mm)
        elif o == "L" and len(a) >= 2:
            p.lineTo(a[0] * mm, page_h - a[1] * mm)
        elif o == "C" and len(a) >= 6:
            p.curveTo(a[0]*mm, page_h-a[1]*mm, a[2]*mm, page_h-a[3]*mm, a[4]*mm, page_h-a[5]*mm)
        elif o == "Z":
            p.close()

    do_fill = 0
    do_stroke = 0
    if fill:
        c.setFillColorRGB(fill[0], fill[1], fill[2])
        do_fill = 1
    if stroke:
        c.setStrokeColorRGB(stroke[0], stroke[1], stroke[2])
        c.setLineWidth(lw * mm)
        do_stroke = 1

    c.drawPath(p, fill=do_fill, stroke=do_stroke)


def _draw_text(c, comp, x, y, w, h):
    """Draw a text or paragraph component."""
    padding = comp.get("padding", 0) * mm
    font_family = comp.get("fontFamily", "Helvetica")
    font_size = comp.get("fontSize", 8)
    content = comp.get("content", "")

    # Map common font names to reportlab built-in fonts
    font_map = {
        "Arial": "Helvetica",
        "Helvetica": "Helvetica",
        "Times New Roman": "Times-Roman",
        "Courier New": "Courier",
        "Georgia": "Times-Roman",
        "Verdana": "Helvetica",
    }
    rl_font = font_map.get(font_family, "Helvetica")

    c.setFont(rl_font, font_size)
    c.setFillColorRGB(0, 0, 0)

    # Text area with padding
    tx = x + padding
    # y is top of component; text baseline needs to go down
    ty = y - padding - font_size * 0.3528 * mm  # approximate pt to mm

    available_w = w - 2 * padding

    if comp.get("type") == "text":
        # Single line, clip to width
        c.saveState()
        c.clipPath(c.beginPath())  # not ideal; just draw and let it clip
        c.restoreState()
        c.drawString(tx, ty, content)
    else:
        # Paragraph: wrap text
        lines = _wrap_text(c, content, rl_font, font_size, available_w)
        line_height = font_size * 1.3  # pt
        for i, line in enumerate(lines):
            line_y = ty - i * line_height * 0.3528 * mm
            if line_y < (y - h + padding):
                break  # exceeded component height
            c.drawString(tx, line_y, line)


def _wrap_text(c, text, font, size, max_width):
    """Simple word-wrap for paragraph text."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test = (current_line + " " + word).strip()
        if c.stringWidth(test, font, size) <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word

    if current_line:
        lines.append(current_line)

    return lines


def _draw_image(c, comp, x, y, w, h):
    """Draw an image component from a data URI."""
    data_uri = comp.get("dataUri", "")
    if not data_uri:
        return

    try:
        # Parse data URI
        header, b64_data = data_uri.split(",", 1)
        img_bytes = base64.b64decode(b64_data)
        img = ImageReader(io.BytesIO(img_bytes))

        # reportlab drawImage: x, y is bottom-left corner
        img_y = y - h
        c.drawImage(img, x, img_y, width=w, height=h, preserveAspectRatio=True, anchor="nw")
    except Exception:
        # Draw placeholder rectangle if image fails
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.25)
        c.rect(x, y - h, w, h)
        c.drawString(x + 1 * mm, y - h / 2, "[image]")


def _draw_barcode(c, comp, x, y, w, h):
    """Render barcode using python-barcode."""
    content = comp.get("content", "123456")
    try:
        import barcode as barcode_lib
        from barcode.writer import ImageWriter
        code = barcode_lib.get("code128", content, writer=ImageWriter())
        buf = io.BytesIO()
        code.write(buf, options={"write_text": False, "module_width": 0.2,
                                  "module_height": float(h / mm * 0.8)})
        buf.seek(0)
        img = ImageReader(buf)
        c.drawImage(img, x, y - h, width=w, height=h, preserveAspectRatio=True)
    except Exception:
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.25)
        c.rect(x, y - h, w, h)
        c.setFont("Helvetica", 6)
        c.drawString(x + 1 * mm, y - h / 2, "[barcode]")


def _draw_qrcode(c, comp, x, y, w, h):
    """Render QR code using qrcode package."""
    content = comp.get("content", "https://example.com")
    try:
        import qrcode
        qr = qrcode.make(content, box_size=10, border=0)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        img = ImageReader(buf)
        size = min(w, h)
        c.drawImage(img, x, y - size, width=size, height=size, preserveAspectRatio=True)
    except Exception:
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.25)
        size = min(w, h)
        c.rect(x, y - size, size, size)
        c.setFont("Helvetica", 6)
        c.drawString(x + 1 * mm, y - size / 2, "[qr]")
