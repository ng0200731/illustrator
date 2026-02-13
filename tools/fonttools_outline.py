"""
Font outline conversion helper.

Converts text strings to SVG path data using fonttools.
Used for "outlined" SVG export where text is not editable.
"""

import os
import sys
import platform


def _find_system_font(font_family):
    """Locate a system font file matching the requested family."""
    font_map = {
        "Arial": "arial.ttf",
        "Helvetica": "arial.ttf",  # Helvetica fallback to Arial on Windows
        "Times New Roman": "times.ttf",
        "Courier New": "cour.ttf",
        "Georgia": "georgia.ttf",
        "Verdana": "verdana.ttf",
    }

    filename = font_map.get(font_family, "arial.ttf")

    if platform.system() == "Windows":
        font_dir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    elif platform.system() == "Darwin":
        font_dir = "/Library/Fonts"
    else:
        font_dir = "/usr/share/fonts/truetype"

    path = os.path.join(font_dir, filename)
    if os.path.exists(path):
        return path

    # Try case-insensitive search on Windows
    if platform.system() == "Windows" and os.path.isdir(font_dir):
        lower = filename.lower()
        for f in os.listdir(font_dir):
            if f.lower() == lower:
                return os.path.join(font_dir, f)

    return None


def text_to_paths(text, font_family, font_size_mm, start_x, baseline_y):
    """
    Convert a text string to a list of SVG path 'd' attribute strings.

    Args:
        text: the string to convert
        font_family: font family name (e.g. "Arial")
        font_size_mm: font size in mm (for SVG viewBox in mm)
        start_x: x position of text start in mm
        baseline_y: y position of text baseline in mm

    Returns:
        list of SVG path 'd' strings
    """
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen

    font_path = _find_system_font(font_family)
    if not font_path:
        raise FileNotFoundError(f"Could not find font: {font_family}")

    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units_per_em = font["head"].unitsPerEm

    # Scale factor: font units to mm
    scale = font_size_mm / units_per_em

    paths = []
    cursor_x = start_x

    for char in text:
        code = ord(char)
        glyph_name = cmap.get(code)
        if not glyph_name:
            # Skip unmapped characters, advance by space width estimate
            cursor_x += font_size_mm * 0.3
            continue

        glyph = glyph_set[glyph_name]
        pen = SVGPathPen(glyph_set)
        glyph.draw(pen)
        raw_path = pen.getCommands()

        if raw_path:
            # Transform: scale and translate
            # Font coordinates: y-up, origin at baseline
            # SVG coordinates: y-down
            transformed = _transform_path(raw_path, scale, cursor_x, baseline_y)
            if transformed:
                paths.append(transformed)

        # Advance cursor
        if hasattr(glyph, "width"):
            cursor_x += glyph.width * scale
        else:
            cursor_x += font_size_mm * 0.5

    font.close()
    return paths


def _transform_path(path_str, scale, tx, ty):
    """
    Transform an SVG path string: scale and translate.
    Flips Y axis (font y-up to SVG y-down).
    """
    import re

    commands = re.findall(r'([MmLlHhVvCcSsQqTtAaZz])|(-?\d+\.?\d*)', path_str)

    result = []
    i = 0
    tokens = []

    # Tokenize
    for match in re.finditer(r'([A-Za-z])|(-?\d+\.?\d*(?:e[+-]?\d+)?)', path_str):
        token = match.group()
        tokens.append(token)

    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        if token.isalpha():
            cmd = token
            result.append(cmd)
            idx += 1

            if cmd in ('Z', 'z'):
                continue

            # Determine how many coordinate pairs this command expects
            if cmd in ('M', 'L', 'T'):
                # Absolute: pairs of (x, y)
                while idx < len(tokens) and not tokens[idx].isalpha():
                    x = float(tokens[idx]) * scale + tx
                    y = -float(tokens[idx + 1]) * scale + ty
                    result.append(f"{x:.4f}")
                    result.append(f"{y:.4f}")
                    idx += 2
            elif cmd in ('m', 'l', 't'):
                while idx < len(tokens) and not tokens[idx].isalpha():
                    x = float(tokens[idx]) * scale
                    y = -float(tokens[idx + 1]) * scale
                    result.append(f"{x:.4f}")
                    result.append(f"{y:.4f}")
                    idx += 2
            elif cmd == 'H':
                while idx < len(tokens) and not tokens[idx].isalpha():
                    x = float(tokens[idx]) * scale + tx
                    result.append(f"{x:.4f}")
                    idx += 1
            elif cmd == 'h':
                while idx < len(tokens) and not tokens[idx].isalpha():
                    x = float(tokens[idx]) * scale
                    result.append(f"{x:.4f}")
                    idx += 1
            elif cmd == 'V':
                while idx < len(tokens) and not tokens[idx].isalpha():
                    y = -float(tokens[idx]) * scale + ty
                    result.append(f"{y:.4f}")
                    idx += 1
            elif cmd == 'v':
                while idx < len(tokens) and not tokens[idx].isalpha():
                    y = -float(tokens[idx]) * scale
                    result.append(f"{y:.4f}")
                    idx += 1
            elif cmd in ('C', 'S'):
                while idx < len(tokens) and not tokens[idx].isalpha():
                    pairs = 6 if cmd == 'C' else 4
                    for p in range(0, pairs, 2):
                        if idx + 1 < len(tokens):
                            x = float(tokens[idx]) * scale + tx
                            y = -float(tokens[idx + 1]) * scale + ty
                            result.append(f"{x:.4f}")
                            result.append(f"{y:.4f}")
                            idx += 2
            elif cmd in ('c', 's'):
                while idx < len(tokens) and not tokens[idx].isalpha():
                    pairs = 6 if cmd == 'c' else 4
                    for p in range(0, pairs, 2):
                        if idx + 1 < len(tokens):
                            x = float(tokens[idx]) * scale
                            y = -float(tokens[idx + 1]) * scale
                            result.append(f"{x:.4f}")
                            result.append(f"{y:.4f}")
                            idx += 2
            elif cmd in ('Q', 'q'):
                while idx < len(tokens) and not tokens[idx].isalpha():
                    for p in range(2):
                        if idx + 1 < len(tokens):
                            if cmd == 'Q':
                                x = float(tokens[idx]) * scale + tx
                                y = -float(tokens[idx + 1]) * scale + ty
                            else:
                                x = float(tokens[idx]) * scale
                                y = -float(tokens[idx + 1]) * scale
                            result.append(f"{x:.4f}")
                            result.append(f"{y:.4f}")
                            idx += 2
            else:
                # Unknown command, skip
                idx += 1
        else:
            idx += 1

    return " ".join(result)
