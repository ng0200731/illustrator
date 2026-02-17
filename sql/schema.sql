CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    domain TEXT NOT NULL,
    address TEXT DEFAULT '',
    phone TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    domain TEXT NOT NULL,
    address TEXT DEFAULT '',
    phone TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_type TEXT NOT NULL CHECK(parent_type IN ('customer', 'supplier')),
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT '',
    phone TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    orientation TEXT NOT NULL DEFAULT 'vertical',
    pad_top REAL DEFAULT 0,
    pad_bottom REAL DEFAULT 0,
    pad_left REAL DEFAULT 0,
    pad_right REAL DEFAULT 0,
    sew_position TEXT DEFAULT 'none',
    sew_distance REAL DEFAULT 0,
    sew_padding REAL DEFAULT 0,
    fold_type TEXT DEFAULT 'none',
    fold_padding REAL DEFAULT 0,
    print_x REAL DEFAULT 0,
    print_y REAL DEFAULT 0,
    print_w REAL DEFAULT 0,
    print_h REAL DEFAULT 0,
    bg_image TEXT DEFAULT '',
    source TEXT DEFAULT 'drawing'
);

CREATE TABLE IF NOT EXISTS partitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    w REAL NOT NULL,
    h REAL NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS components (
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
    path_data TEXT DEFAULT NULL,
    group_id TEXT DEFAULT NULL,
    visible INTEGER DEFAULT 1,
    locked INTEGER DEFAULT 0
);
