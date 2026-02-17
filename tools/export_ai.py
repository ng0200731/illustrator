"""
AI (Illustrator) Export Tool for Wash Care Label Designer.

Generates PDF-based .ai files that Illustrator opens natively.
Modern .ai format is PDF internally, so we generate a PDF and save as .ai.

Two modes:
  - Editable: text remains as text objects (editable in Illustrator)
  - Outlined: text converted to vector paths (not editable)
"""

import base64
import io
import os
import platform
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.utils import ImageReader


def generate_ai(data, output_path, outlined=False):
    """
    Generate a PDF-based .ai file from label designer data.

    Args:
        data: dict with 'label' ({width, height} in mm) and 'components' list
        output_path: file path for the output .ai file
        outlined: if True, convert text to paths (non-editable)
    """
    label = data["label"]
    components = data.get("components", [])

    w_mm = label["width"]
    h_mm = label["height"]

    page_w = w_mm * mm
    page_h = h_mm * mm

    c = pdf_canvas.Canvas(output_path, pagesize=(page_w, page_h))
    c.setCreator("Wash Care Label Designer")
    c.setTitle("Wash Care Label")

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

    # Label border
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.5)
    c.rect(0, 0, page_w, page_h)

    # Separate components into visible and hidden pdfpaths, and others
    visible_paths = []
    hidden_paths = []
    other_comps = []
    for comp in components:
        if comp.get("type") == "pdfpath":
            if comp.get("visible", True):
                visible_paths.append(comp)
            else:
                hidden_paths.append(comp)
        else:
            other_comps.append(comp)

    # Draw visible pdfpaths
    for comp in visible_paths:
        _draw_pdfpath(c, comp, page_h)

    # Draw other components
    for comp in other_comps:
        comp_type = comp.get("type", "")
        x = comp.get("x", 0) * mm
        y = page_h - comp.get("y", 0) * mm
        w = comp.get("width", 0) * mm
        h = comp.get("height", 0) * mm

        if comp_type in ("text", "paragraph"):
            if outlined:
                _draw_outlined_text(c, comp, x, y, w, h, page_h)
            else:
                _draw_editable_text(c, comp, x, y, w, h)
        elif comp_type == "image":
            _draw_image(c, comp, x, y, w, h)
        elif comp_type == "barcode":
            _draw_barcode(c, comp, x, y, w, h)
        elif comp_type == "qrcode":
            _draw_qrcode(c, comp, x, y, w, h)

    # Draw hidden pdfpaths with reduced opacity on a separate state
    if hidden_paths:
        c.saveState()
        c.setFillAlpha(0.15)
        c.setStrokeAlpha(0.15)
        for comp in hidden_paths:
            _draw_pdfpath(c, comp, page_h)
        c.restoreState()

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


# --- Font map ---
_FONT_MAP = {
    "Arial": "Helvetica",
    "Helvetica": "Helvetica",
    "Times New Roman": "Times-Roman",
    "Courier New": "Courier",
    "Georgia": "Times-Roman",
    "Verdana": "Helvetica",
}

_SYSTEM_FONT_FILES = {
    "Arial": "arial.ttf",
    "Helvetica": "arial.ttf",
    "Times New Roman": "times.ttf",
    "Courier New": "cour.ttf",
    "Georgia": "georgia.ttf",
    "Verdana": "verdana.ttf",
}


def _draw_editable_text(c, comp, x, y, w, h):
    """Draw text as editable text objects."""
    padding = comp.get("padding", 0) * mm
    font_family = comp.get("fontFamily", "Helvetica")
    font_size = comp.get("fontSize", 8)
    content = comp.get("content", "")

    rl_font = _FONT_MAP.get(font_family, "Helvetica")
    c.setFont(rl_font, font_size)
    c.setFillColorRGB(0, 0, 0)

    tx = x + padding
    ty = y - padding - font_size * 0.3528 * mm
    available_w = w - 2 * padding

    if comp.get("type") == "text":
        c.drawString(tx, ty, content)
    else:
        lines = _wrap_text(c, content, rl_font, font_size, available_w)
        line_height = font_size * 1.3 * 0.3528 * mm
        for i, line in enumerate(lines):
            line_y = ty - i * line_height
            if line_y < (y - h + padding):
                break
            c.drawString(tx, line_y, line)


def _draw_outlined_text(c, comp, x, y, w, h, page_h):
    """Draw text as vector paths (outlined, non-editable)."""
    padding = comp.get("padding", 0) * mm
    font_family = comp.get("fontFamily", "Helvetica")
    font_size = comp.get("fontSize", 8)
    content = comp.get("content", "")

    try:
        _draw_outlined_fonttools(c, comp, x, y, w, h, padding,
                                  font_family, font_size, content)
    except Exception:
        # Fallback to editable text if outline conversion fails
        _draw_editable_text(c, comp, x, y, w, h)


def _draw_outlined_fonttools(c, comp, x, y, w, h, padding,
                              font_family, font_size, content):
    """Convert text to PDF paths using fonttools glyph outlines."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.recordingPen import RecordingPen

    font_path = _find_system_font(font_family)
    if not font_path:
        raise FileNotFoundError(f"Font not found: {font_family}")

    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units_per_em = font["head"].unitsPerEm

    # Scale: font units to points, then to mm for reportlab
    scale = font_size / units_per_em  # font units -> pt
    pt2mm = 0.3528 * mm               # pt -> reportlab units (mm)

    tx = x + padding
    ty = y - padding - font_size * pt2mm
    available_w = w - 2 * padding

    if comp.get("type") == "text":
        lines = [content]
    else:
        rl_font = _FONT_MAP.get(font_family, "Helvetica")
        c.setFont(rl_font, font_size)
        lines = _wrap_text(c, content, rl_font, font_size, available_w)

    line_height = font_size * 1.3 * pt2mm

    c.setFillColorRGB(0, 0, 0)

    for i, line in enumerate(lines):
        line_y = ty - i * line_height
        if line_y < (y - h + padding):
            break
        cursor_x = tx
        for char in line:
            code = ord(char)
            glyph_name = cmap.get(code)
            if not glyph_name:
                cursor_x += font_size * 0.3
                continue

            glyph = glyph_set[glyph_name]
            pen = RecordingPen()
            glyph.draw(pen)

            # Transform helper: font units -> absolute position
            def fx(val):
                return cursor_x + val * scale * pt2mm

            def fy(val):
                return line_y + val * scale * pt2mm

            # Draw glyph as PDF path with proper curve conversion
            p = c.beginPath()
            cur_x, cur_y = 0.0, 0.0  # track current point in font units

            for op, args in pen.value:
                if op == "moveTo":
                    cur_x, cur_y = args[0]
                    p.moveTo(fx(cur_x), fy(cur_y))

                elif op == "lineTo":
                    cur_x, cur_y = args[0]
                    p.lineTo(fx(cur_x), fy(cur_y))

                elif op == "curveTo":
                    # Already cubic bezier — 3 points (cp1, cp2, end)
                    p.curveTo(
                        fx(args[0][0]), fy(args[0][1]),
                        fx(args[1][0]), fy(args[1][1]),
                        fx(args[2][0]), fy(args[2][1]),
                    )
                    cur_x, cur_y = args[2]

                elif op == "qCurveTo":
                    # TrueType quadratic B-spline: may have multiple
                    # off-curve points with implied on-curve midpoints.
                    # Decompose into individual quadratic segments,
                    # then convert each to cubic bezier.
                    off_curves = list(args[:-1])
                    on_curve = args[-1]

                    # If on_curve is None, the contour is closed with
                    # an implied point between last and first off-curve
                    if on_curve is None and len(off_curves) >= 2:
                        # Implied start = midpoint of last and first off-curve
                        mid_x = (off_curves[-1][0] + off_curves[0][0]) / 2
                        mid_y = (off_curves[-1][1] + off_curves[0][1]) / 2
                        on_curve = (mid_x, mid_y)

                    # Build list of on-curve points between consecutive
                    # off-curve points (implied midpoints)
                    points = []  # list of (on_curve, off_curve, on_curve) segments
                    p0 = (cur_x, cur_y)

                    for j, off in enumerate(off_curves):
                        if j < len(off_curves) - 1:
                            # Implied on-curve midpoint between this and next off-curve
                            next_off = off_curves[j + 1]
                            mid = ((off[0] + next_off[0]) / 2,
                                   (off[1] + next_off[1]) / 2)
                            points.append((p0, off, mid))
                            p0 = mid
                        else:
                            # Last off-curve to final on-curve
                            points.append((p0, off, on_curve))

                    # Convert each quadratic segment to cubic and draw
                    for p0_pt, p1_pt, p2_pt in points:
                        # Quadratic to cubic conversion:
                        # CP1 = P0 + 2/3 * (P1 - P0)
                        # CP2 = P2 + 2/3 * (P1 - P2)
                        cp1x = p0_pt[0] + 2/3 * (p1_pt[0] - p0_pt[0])
                        cp1y = p0_pt[1] + 2/3 * (p1_pt[1] - p0_pt[1])
                        cp2x = p2_pt[0] + 2/3 * (p1_pt[0] - p2_pt[0])
                        cp2y = p2_pt[1] + 2/3 * (p1_pt[1] - p2_pt[1])

                        p.curveTo(
                            fx(cp1x), fy(cp1y),
                            fx(cp2x), fy(cp2y),
                            fx(p2_pt[0]), fy(p2_pt[1]),
                        )

                    if on_curve is not None:
                        cur_x, cur_y = on_curve

                elif op == "closePath":
                    p.close()
                elif op == "endPath":
                    pass

            c.drawPath(p, fill=1, stroke=0)

            # Advance cursor
            if hasattr(glyph, "width"):
                cursor_x += glyph.width * scale * pt2mm
            else:
                cursor_x += font_size * 0.3

    font.close()


def _find_system_font(font_family):
    """Locate a system font file."""
    filename = _SYSTEM_FONT_FILES.get(font_family, "arial.ttf")

    if platform.system() == "Windows":
        font_dir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    elif platform.system() == "Darwin":
        font_dir = "/Library/Fonts"
    else:
        font_dir = "/usr/share/fonts/truetype"

    path = os.path.join(font_dir, filename)
    if os.path.exists(path):
        return path

    if platform.system() == "Windows" and os.path.isdir(font_dir):
        lower = filename.lower()
        for f in os.listdir(font_dir):
            if f.lower() == lower:
                return os.path.join(font_dir, f)

    return None


def _wrap_text(c, text, font, size, max_width):
    """Word-wrap text to fit within max_width."""
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
        header, b64_data = data_uri.split(",", 1)
        img_bytes = base64.b64decode(b64_data)
        img = ImageReader(io.BytesIO(img_bytes))
        img_y = y - h
        c.drawImage(img, x, img_y, width=w, height=h,
                     preserveAspectRatio=True, anchor="nw")
    except Exception:
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
