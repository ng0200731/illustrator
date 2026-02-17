import os
import json
import sqlite3
import tempfile
from flask import Flask, render_template, request, send_file, jsonify

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max upload

TOOLS_DIR = os.path.join(os.path.dirname(__file__), "tools")

# Vercel serverless: filesystem is read-only except /tmp
if os.environ.get("VERCEL"):
    TMP_DIR = "/tmp"
else:
    TMP_DIR = os.path.join(os.path.dirname(__file__), ".tmp")
    os.makedirs(TMP_DIR, exist_ok=True)

DB_PATH = os.path.join(TMP_DIR, "app.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _template_to_dict(row, partitions, components=None):
    return {
        "id": row["id"],
        "customerId": row["customer_id"],
        "name": row["name"],
        "width": row["width"],
        "height": row["height"],
        "orientation": row["orientation"],
        "padding": {
            "top": row["pad_top"], "bottom": row["pad_bottom"],
            "left": row["pad_left"], "right": row["pad_right"]
        },
        "sewing": {
            "position": row["sew_position"], "distance": row["sew_distance"],
            "padding": row["sew_padding"]
        },
        "folding": {
            "type": row["fold_type"], "padding": row["fold_padding"]
        },
        "printingArea": {
            "x": row["print_x"], "y": row["print_y"],
            "w": row["print_w"], "h": row["print_h"]
        },
        "partitions": [dict(p) for p in partitions],
        "components": [dict(c) for c in (components or [])],
        "bgImage": row["bg_image"] or "",
        "source": row["source"] if "source" in row.keys() else "drawing"
    }


# Auto-init DB on first run
if not os.path.exists(DB_PATH):
    try:
        from tools.init_db import init_db
        init_db()
    except Exception as e:
        print(f"DB init failed: {e}")
else:
    # Migrate: add bg_image column if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _cols = [r[1] for r in _mc.execute("PRAGMA table_info(templates)").fetchall()]
        if "bg_image" not in _cols:
            _mc.execute("ALTER TABLE templates ADD COLUMN bg_image TEXT DEFAULT ''")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"Migration failed: {e}")
    # Migrate: add page column to partitions if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _pcols = [r[1] for r in _mc.execute("PRAGMA table_info(partitions)").fetchall()]
        if "page" not in _pcols:
            _mc.execute("ALTER TABLE partitions ADD COLUMN page INTEGER NOT NULL DEFAULT 0")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"Partition migration failed: {e}")
    # Migrate: add locked column to partitions if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _pcols2 = [r[1] for r in _mc.execute("PRAGMA table_info(partitions)").fetchall()]
        if "locked" not in _pcols2:
            _mc.execute("ALTER TABLE partitions ADD COLUMN locked INTEGER NOT NULL DEFAULT 0")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"Locked migration failed: {e}")
    # Migrate: add source column to templates if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _cols2 = [r[1] for r in _mc.execute("PRAGMA table_info(templates)").fetchall()]
        if "source" not in _cols2:
            _mc.execute("ALTER TABLE templates ADD COLUMN source TEXT DEFAULT 'drawing'")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"Source migration failed: {e}")
    # Migrate: create components table if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _tables = [r[0] for r in _mc.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "components" not in _tables:
            _mc.execute("""CREATE TABLE IF NOT EXISTS components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
                partition_id INTEGER REFERENCES partitions(id) ON DELETE SET NULL,
                page INTEGER NOT NULL DEFAULT 0,
                type TEXT NOT NULL CHECK(type IN ('text','paragraph','barcode','qrcode','image')),
                content TEXT DEFAULT '',
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                w REAL NOT NULL DEFAULT 20,
                h REAL NOT NULL DEFAULT 10,
                font_family TEXT DEFAULT 'Arial',
                font_size REAL DEFAULT 8,
                sort_order INTEGER DEFAULT 0
            )""")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"Components migration failed: {e}")
    # Migrate: add path_data column to components if missing
    try:
        _mc = sqlite3.connect(DB_PATH)
        _ccols = [r[1] for r in _mc.execute("PRAGMA table_info(components)").fetchall()]
        if "path_data" not in _ccols:
            _mc.execute("ALTER TABLE components ADD COLUMN path_data TEXT DEFAULT NULL")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"path_data migration failed: {e}")
    # Migrate: update components type constraint to include pdfpath (requires recreate)
    try:
        _mc = sqlite3.connect(DB_PATH)
        # Check if pdfpath is already in the constraint by trying to insert a test row
        _mc.execute("BEGIN")
        try:
            _mc.execute("INSERT INTO components (template_id, type) VALUES (-1, 'pdfpath')")
            _mc.execute("DELETE FROM components WHERE template_id = -1")
            _mc.execute("ROLLBACK")
        except:
            # Constraint doesn't include pdfpath, need to recreate table
            _mc.execute("ROLLBACK")
            _mc.execute("""CREATE TABLE components_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
                partition_id INTEGER REFERENCES partitions(id) ON DELETE SET NULL,
                page INTEGER NOT NULL DEFAULT 0,
                type TEXT NOT NULL CHECK(type IN ('text','paragraph','barcode','qrcode','image','pdfpath')),
                content TEXT DEFAULT '',
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                w REAL NOT NULL DEFAULT 20,
                h REAL NOT NULL DEFAULT 10,
                font_family TEXT DEFAULT 'Arial',
                font_size REAL DEFAULT 8,
                sort_order INTEGER DEFAULT 0,
                path_data TEXT DEFAULT NULL
            )""")
            _mc.execute("INSERT INTO components_new SELECT id, template_id, partition_id, page, type, content, x, y, w, h, font_family, font_size, sort_order, path_data FROM components")
            _mc.execute("DROP TABLE components")
            _mc.execute("ALTER TABLE components_new RENAME TO components")
            _mc.commit()
        _mc.close()
    except Exception as e:
        print(f"pdfpath type migration failed: {e}")


@app.route("/")
def index():
    return render_template("index.html")


# ==================== Customer API ====================

@app.route("/api/customers", methods=["GET"])
def api_get_customers():
    db = get_db()
    rows = db.execute("SELECT * FROM customers ORDER BY id").fetchall()
    result = []
    for r in rows:
        c = dict(r)
        members = db.execute(
            "SELECT * FROM members WHERE parent_type='customer' AND parent_id=? ORDER BY id",
            (r["id"],)
        ).fetchall()
        c["members"] = [dict(m) for m in members]
        result.append(c)
    db.close()
    return jsonify(result)


@app.route("/api/customers", methods=["POST"])
def api_create_customer():
    d = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO customers (company, domain, address, phone) VALUES (?, ?, ?, ?)",
        (d["company"], d["domain"], d.get("address", ""), d.get("phone", ""))
    )
    db.commit()
    cid = cur.lastrowid
    db.close()
    return jsonify({"id": cid, "company": d["company"], "domain": d["domain"],
                     "address": d.get("address", ""), "phone": d.get("phone", ""),
                     "members": []}), 201


@app.route("/api/customers/<int:cid>", methods=["DELETE"])
def api_delete_customer(cid):
    db = get_db()
    db.execute("DELETE FROM members WHERE parent_type='customer' AND parent_id=?", (cid,))
    db.execute("DELETE FROM customers WHERE id=?", (cid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# ==================== Supplier API ====================

@app.route("/api/suppliers", methods=["GET"])
def api_get_suppliers():
    db = get_db()
    rows = db.execute("SELECT * FROM suppliers ORDER BY id").fetchall()
    result = []
    for r in rows:
        s = dict(r)
        members = db.execute(
            "SELECT * FROM members WHERE parent_type='supplier' AND parent_id=? ORDER BY id",
            (r["id"],)
        ).fetchall()
        s["members"] = [dict(m) for m in members]
        result.append(s)
    db.close()
    return jsonify(result)


@app.route("/api/suppliers", methods=["POST"])
def api_create_supplier():
    d = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO suppliers (company, domain, address, phone) VALUES (?, ?, ?, ?)",
        (d["company"], d["domain"], d.get("address", ""), d.get("phone", ""))
    )
    db.commit()
    sid = cur.lastrowid
    db.close()
    return jsonify({"id": sid, "company": d["company"], "domain": d["domain"],
                     "address": d.get("address", ""), "phone": d.get("phone", ""),
                     "members": []}), 201


@app.route("/api/suppliers/<int:sid>", methods=["DELETE"])
def api_delete_supplier(sid):
    db = get_db()
    db.execute("DELETE FROM members WHERE parent_type='supplier' AND parent_id=?", (sid,))
    db.execute("DELETE FROM suppliers WHERE id=?", (sid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# ==================== Member API ====================

@app.route("/api/members", methods=["POST"])
def api_create_member():
    d = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO members (parent_type, parent_id, name, email, role, phone) VALUES (?, ?, ?, ?, ?, ?)",
        (d["parent_type"], d["parent_id"], d["name"], d["email"], d.get("role", ""), d.get("phone", ""))
    )
    db.commit()
    mid = cur.lastrowid
    db.close()
    return jsonify({"id": mid, "parent_type": d["parent_type"], "parent_id": d["parent_id"],
                     "name": d["name"], "email": d["email"],
                     "role": d.get("role", ""), "phone": d.get("phone", "")}), 201


@app.route("/api/members/<int:mid>", methods=["DELETE"])
def api_delete_member(mid):
    db = get_db()
    db.execute("DELETE FROM members WHERE id=?", (mid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# ==================== Template API ====================

@app.route("/api/templates", methods=["GET"])
def api_get_templates():
    db = get_db()
    rows = db.execute("SELECT * FROM templates ORDER BY id").fetchall()
    result = []
    for r in rows:
        parts = db.execute(
            "SELECT * FROM partitions WHERE template_id=? ORDER BY id",
            (r["id"],)
        ).fetchall()
        comps = db.execute(
            "SELECT * FROM components WHERE template_id=? ORDER BY page, sort_order",
            (r["id"],)
        ).fetchall()
        result.append(_template_to_dict(r, parts, comps))
    db.close()
    return jsonify(result)


@app.route("/api/templates", methods=["POST"])
def api_create_template():
    d = request.get_json()
    pad = d.get("padding", {})
    sew = d.get("sewing", {})
    fold = d.get("folding", {})
    pa = d.get("printingArea", {})
    db = get_db()
    cur = db.execute(
        """INSERT INTO templates
           (customer_id, name, width, height, orientation,
            pad_top, pad_bottom, pad_left, pad_right,
            sew_position, sew_distance, sew_padding,
            fold_type, fold_padding,
            print_x, print_y, print_w, print_h, bg_image, source)
           VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?, ?,?,?,?, ?,?)""",
        (d["customerId"], d["name"], d["width"], d["height"], d["orientation"],
         pad.get("top", 0), pad.get("bottom", 0), pad.get("left", 0), pad.get("right", 0),
         sew.get("position", "none"), sew.get("distance", 0), sew.get("padding", 0),
         fold.get("type", "none"), fold.get("padding", 0),
         pa.get("x", 0), pa.get("y", 0), pa.get("w", 0), pa.get("h", 0),
         d.get("bgImage", ""), d.get("source", "drawing"))
    )
    tid = cur.lastrowid
    parts_out = []
    for p in d.get("partitions", []):
        pcur = db.execute(
            "INSERT INTO partitions (template_id, page, label, x, y, w, h, locked) VALUES (?,?,?,?,?,?,?,?)",
            (tid, p.get("page", 0), p["label"], p["x"], p["y"], p["w"], p["h"], p.get("locked", 0))
        )
        parts_out.append({"id": pcur.lastrowid, "template_id": tid,
                          "page": p.get("page", 0),
                          "label": p["label"], "x": p["x"], "y": p["y"],
                          "w": p["w"], "h": p["h"], "locked": p.get("locked", 0)})
    db.commit()
    row = db.execute("SELECT * FROM templates WHERE id=?", (tid,)).fetchone()
    db.close()
    return jsonify(_template_to_dict(row, parts_out)), 201


@app.route("/api/templates/<int:tid>", methods=["DELETE"])
def api_delete_template(tid):
    db = get_db()
    db.execute("DELETE FROM partitions WHERE template_id=?", (tid,))
    db.execute("DELETE FROM templates WHERE id=?", (tid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/templates/<int:tid>", methods=["PUT"])
def api_update_template(tid):
    d = request.get_json()
    pad = d.get("padding", {})
    sew = d.get("sewing", {})
    fold = d.get("folding", {})
    pa = d.get("printingArea", {})
    db = get_db()
    try:
        db.execute(
            """UPDATE templates SET
               customer_id=?, name=?, width=?, height=?, orientation=?,
               pad_top=?, pad_bottom=?, pad_left=?, pad_right=?,
               sew_position=?, sew_distance=?, sew_padding=?,
               fold_type=?, fold_padding=?,
               print_x=?, print_y=?, print_w=?, print_h=?, bg_image=?, source=?
               WHERE id=?""",
            (d["customerId"], d["name"], d["width"], d["height"], d["orientation"],
             pad.get("top", 0), pad.get("bottom", 0), pad.get("left", 0), pad.get("right", 0),
             sew.get("position", "none"), sew.get("distance", 0), sew.get("padding", 0),
             fold.get("type", "none"), fold.get("padding", 0),
             pa.get("x", 0), pa.get("y", 0), pa.get("w", 0), pa.get("h", 0),
             d.get("bgImage", ""), d.get("source", "drawing"),
             tid)
        )
        db.execute("DELETE FROM partitions WHERE template_id=?", (tid,))
        parts_out = []
        for p in d.get("partitions", []):
            pcur = db.execute(
                "INSERT INTO partitions (template_id, page, label, x, y, w, h, locked) VALUES (?,?,?,?,?,?,?,?)",
                (tid, p.get("page", 0), p["label"], p["x"], p["y"], p["w"], p["h"], p.get("locked", 0))
            )
            parts_out.append({"id": pcur.lastrowid, "template_id": tid,
                              "page": p.get("page", 0),
                              "label": p["label"], "x": p["x"], "y": p["y"],
                              "w": p["w"], "h": p["h"], "locked": p.get("locked", 0)})
        db.commit()
        row = db.execute("SELECT * FROM templates WHERE id=?", (tid,)).fetchone()
        return jsonify(_template_to_dict(row, parts_out))
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


@app.route("/api/templates/<int:tid>/partitions", methods=["PUT"])
def api_update_partitions(tid):
    d = request.get_json()
    db = get_db()
    # Save bg_image if provided
    if "bgImage" in d:
        db.execute("UPDATE templates SET bg_image=? WHERE id=?", (d["bgImage"], tid))
    db.execute("DELETE FROM partitions WHERE template_id=?", (tid,))
    parts_out = []
    for p in d.get("partitions", []):
        pcur = db.execute(
            "INSERT INTO partitions (template_id, page, label, x, y, w, h, locked) VALUES (?,?,?,?,?,?,?,?)",
            (tid, p.get("page", 0), p["label"], p["x"], p["y"], p["w"], p["h"], p.get("locked", 0))
        )
        parts_out.append({"id": pcur.lastrowid, "template_id": tid,
                          "page": p.get("page", 0),
                          "label": p["label"], "x": p["x"], "y": p["y"],
                          "w": p["w"], "h": p["h"], "locked": p.get("locked", 0)})
    db.commit()
    row = db.execute("SELECT bg_image FROM templates WHERE id=?", (tid,)).fetchone()
    bg = row["bg_image"] if row else ""
    db.close()
    return jsonify({"partitions": parts_out, "bgImage": bg or ""})


# ==================== Component API ====================

@app.route("/api/templates/<int:tid>/components", methods=["GET"])
def api_get_components(tid):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM components WHERE template_id=? ORDER BY page, sort_order",
        (tid,)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/templates/<int:tid>/components", methods=["PUT"])
def api_save_components(tid):
    d = request.get_json()
    db = get_db()
    db.execute("UPDATE templates SET source='pdf' WHERE id=?", (tid,))
    db.execute("DELETE FROM components WHERE template_id=?", (tid,))
    out = []
    for i, c in enumerate(d.get("components", [])):
        path_data_json = json.dumps(c["pathData"]) if c.get("pathData") else None
        cur = db.execute(
            """INSERT INTO components
               (template_id, partition_id, page, type, content, x, y, w, h,
                font_family, font_size, sort_order, path_data)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (tid, c.get("partitionId"), c.get("page", 0), c["type"],
             c.get("content", ""), c["x"], c["y"], c["w"], c["h"],
             c.get("fontFamily", "Arial"), c.get("fontSize", 8), i, path_data_json)
        )
        out.append({"id": cur.lastrowid, "template_id": tid,
                     "partition_id": c.get("partitionId"),
                     "page": c.get("page", 0), "type": c["type"],
                     "content": c.get("content", ""),
                     "x": c["x"], "y": c["y"], "w": c["w"], "h": c["h"],
                     "font_family": c.get("fontFamily", "Arial"),
                     "font_size": c.get("fontSize", 8), "sort_order": i,
                     "path_data": c.get("pathData")})
    db.commit()
    db.close()
    return jsonify(out)


@app.route("/export/pdf", methods=["POST"])
def export_pdf():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    from tools.export_pdf import generate_pdf

    out_path = os.path.join(TMP_DIR, "label_export.pdf")
    generate_pdf(data, out_path)
    return send_file(out_path, as_attachment=True, download_name="label.pdf")


@app.route("/export/ai", methods=["POST"])
def export_ai():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    outlined = data.get("outlined", False)
    from tools.export_ai import generate_ai

    out_path = os.path.join(TMP_DIR, "label_export.ai")
    generate_ai(data, out_path, outlined=outlined)

    dl_name = "label_outlined.ai" if outlined else "label_editable.ai"
    return send_file(out_path, as_attachment=True, download_name=dl_name)


@app.route("/upload/image", methods=["POST"])
def upload_image():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "No file selected"}), 400

    import base64

    img_data = f.read()
    mime = f.content_type or "image/png"
    b64 = base64.b64encode(img_data).decode("utf-8")
    data_uri = f"data:{mime};base64,{b64}"
    return jsonify({"dataUri": data_uri})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
