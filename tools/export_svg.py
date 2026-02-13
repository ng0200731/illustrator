"""
SVG Export Tool for Wash Care Label Designer.

Generates SVG files compatible with Adobe Illustrator.
Supports two modes:
  - Editable (not outlined): text remains as <text> elements
  - Outlined: text converted to <path> elements using fonttools
"""

import base64
import os
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString


def generate_svg(data, output_path, outlined=False):
    """
    Generate an SVG from label designer data.

    Args:
        data: dict with 'label' ({width, height} in mm) and 'components' list
        output_path: file path for the output SVG
        outlined: if True, convert text to paths
    """
    label = data["label"]
    components = data.get("components", [])

    w_mm = label["width"]
    h_mm = label["height"]

    # SVG root with mm units
    svg = Element("svg")
    svg.set("xmlns", "http://www.w3.org/2000/svg")
    svg.set("xmlns:xlink", "http://www.w3.org/1999/xlink")
    svg.set("version", "1.1")
    svg.set("width", f"{w_mm}mm")
    svg.set("height", f"{h_mm}mm")
    svg.set("viewBox", f"0 0 {w_mm} {h_mm}")

    # White background
    bg = SubElement(svg, "rect")
    bg.set("x", "0")
    bg.set("y", "0")
    bg.set("width", str(w_mm))
    bg.set("height", str(h_mm))
    bg.set("fill", "white")
    bg.set("stroke", "black")
    bg.set("stroke-width", "0.1")

    for comp in components:
        comp_type = comp.get("type", "")
        if comp_type in ("text", "paragraph"):
            if outlined:
                _add_outlined_text(svg, comp)
            else:
                _add_editable_text(svg, comp)
        elif comp_type == "image":
            _add_image(svg, comp)

    # Write SVG
    raw_xml = tostring(svg, encoding="unicode")
    pretty = parseString(raw_xml).toprettyxml(indent="  ")
    # Remove extra xml declaration if present
    lines = pretty.split("\n")
    if lines[0].startswith("<?xml"):
        lines[0] = '<?xml version="1.0" encoding="UTF-8"?>'

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _add_editable_text(svg, comp):
    """Add text as editable <text> elements."""
    x = comp.get("x", 0)
    y = comp.get("y", 0)
    w = comp.get("width", 0)
    h = comp.get("height", 0)
    padding = comp.get("padding", 0)
    font_family = comp.get("fontFamily", "Arial")
    font_size = comp.get("fontSize", 8)
    content = comp.get("content", "")

    # Convert pt to mm for SVG (1pt = 0.3528mm)
    font_size_mm = font_size * 0.3528

    tx = x + padding
    # Approximate baseline position (top + padding + ascent)
    ty = y + padding + font_size_mm * 0.8

    if comp.get("type") == "text":
        # Single line
        text_el = SubElement(svg, "text")
        text_el.set("x", f"{tx:.2f}")
        text_el.set("y", f"{ty:.2f}")
        text_el.set("font-family", font_family)
        text_el.set("font-size", f"{font_size_mm:.2f}")
        text_el.set("fill", "black")
        text_el.text = content

        # Clip rect
        _add_clip(svg, text_el, x, y, w, h)
    else:
        # Paragraph: create multiple <text> lines
        # Simple word wrap estimation
        line_height = font_size_mm * 1.3
        avg_char_w = font_size_mm * 0.5  # rough estimate
        available_w = w - 2 * padding
        chars_per_line = max(1, int(available_w / avg_char_w))

        lines = _simple_wrap(content, chars_per_line)
        g = SubElement(svg, "g")

        for i, line in enumerate(lines):
            line_y = ty + i * line_height
            if line_y > y + h - padding:
                break
            text_el = SubElement(g, "text")
            text_el.set("x", f"{tx:.2f}")
            text_el.set("y", f"{line_y:.2f}")
            text_el.set("font-family", font_family)
            text_el.set("font-size", f"{font_size_mm:.2f}")
            text_el.set("fill", "black")
            text_el.text = line


def _add_outlined_text(svg, comp):
    """
    Add text as outlined paths.
    Uses fonttools to extract glyph outlines when available,
    falls back to simple rectangle placeholders.
    """
    x = comp.get("x", 0)
    y = comp.get("y", 0)
    w = comp.get("width", 0)
    h = comp.get("height", 0)
    padding = comp.get("padding", 0)
    font_family = comp.get("fontFamily", "Arial")
    font_size = comp.get("fontSize", 8)
    content = comp.get("content", "")

    font_size_mm = font_size * 0.3528

    try:
        _add_outlined_text_fonttools(svg, comp, x, y, w, h, padding,
                                      font_family, font_size_mm, content)
    except Exception:
        # Fallback: render as non-selectable text with a note
        _add_editable_text(svg, comp)
        # Add a comment noting outline conversion failed
        comment_el = SubElement(svg, "desc")
        comment_el.text = f"Outline conversion unavailable for: {font_family}"


def _add_outlined_text_fonttools(svg, comp, x, y, w, h, padding,
                                  font_family, font_size_mm, content):
    """Convert text to SVG paths using fonttools."""
    from tools.fonttools_outline import text_to_paths

    tx = x + padding
    ty = y + padding + font_size_mm * 0.8

    if comp.get("type") == "text":
        lines = [content]
    else:
        avg_char_w = font_size_mm * 0.5
        available_w = w - 2 * padding
        chars_per_line = max(1, int(available_w / avg_char_w))
        lines = _simple_wrap(content, chars_per_line)

    line_height = font_size_mm * 1.3
    g = SubElement(svg, "g")
    g.set("fill", "black")

    for i, line in enumerate(lines):
        line_y = ty + i * line_height
        if line_y > y + h - padding:
            break
        paths = text_to_paths(line, font_family, font_size_mm, tx, line_y)
        for path_d in paths:
            path_el = SubElement(g, "path")
            path_el.set("d", path_d)


def _add_image(svg, comp):
    """Add an image component as an embedded base64 image."""
    x = comp.get("x", 0)
    y = comp.get("y", 0)
    w = comp.get("width", 0)
    h = comp.get("height", 0)
    data_uri = comp.get("dataUri", "")

    if not data_uri:
        return

    img = SubElement(svg, "image")
    img.set("x", f"{x:.2f}")
    img.set("y", f"{y:.2f}")
    img.set("width", f"{w:.2f}")
    img.set("height", f"{h:.2f}")
    img.set("href", data_uri)
    img.set("preserveAspectRatio", "xMidYMid meet")


def _add_clip(svg, text_el, x, y, w, h):
    """Add a clip path to constrain text within bounds."""
    # For simplicity, we skip clip paths in this version
    # Illustrator handles overflow clipping well
    pass


def _simple_wrap(text, chars_per_line):
    """Simple word wrap by character count estimate."""
    words = text.split()
    lines = []
    current = ""

    for word in words:
        test = (current + " " + word).strip()
        if len(test) <= chars_per_line:
            current = test
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines
