(function () {
    "use strict";
    var App = window.App;

    var tplScale = 3;

    App.enforceSewingMin = function () {
        var pos = document.getElementById("tpl-sew-position").value;
        var distInput = document.getElementById("tpl-sew-distance");
        if (pos === "none") {
            distInput.min = "0";
            return;
        }
        var padVal = parseFloat(document.getElementById("tpl-pad-" + pos).value) || 0;
        distInput.min = padVal;
        if (parseFloat(distInput.value) < padVal) {
            distInput.value = padVal;
        }
    };

    document.getElementById("tpl-sew-position").addEventListener("change", function () {
        var distInput = document.getElementById("tpl-sew-distance");
        if (this.value === "none") { distInput.min = "0"; distInput.value = "0"; }
        else { App.enforceSewingMin(); }
        App.renderTemplatePreview();
    });

    ["tpl-pad-top", "tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", App.enforceSewingMin);
    });

    document.getElementById("tpl-sew-distance").addEventListener("change", App.enforceSewingMin);

    ["tpl-width", "tpl-height", "tpl-pad-top", "tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right",
     "tpl-sew-distance", "tpl-sew-padding", "tpl-fold-padding"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", function () { App.renderTemplatePreview(); });
    });

    document.querySelectorAll(".orient-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var orient = btn.dataset.orient;
            var current = document.getElementById("tpl-orientation").value;
            document.querySelectorAll(".orient-btn").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            document.getElementById("tpl-orientation").value = orient;
            if (orient !== current) {
                var wInput = document.getElementById("tpl-width");
                var hInput = document.getElementById("tpl-height");
                var tmp = wInput.value;
                wInput.value = hInput.value;
                hInput.value = tmp;
                App.enforceSewingMin();
            }
            App.renderTemplatePreview();
        });
    });

    document.getElementById("btn-swap-wh").addEventListener("click", function () {
        var wInput = document.getElementById("tpl-width");
        var hInput = document.getElementById("tpl-height");
        var tmp = wInput.value;
        wInput.value = hInput.value;
        hInput.value = tmp;
        App.renderTemplatePreview();
    });

    var padLink = document.getElementById("tpl-pad-link");
    var padTop = document.getElementById("tpl-pad-top");
    var padOthers = ["tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right"].map(function (id) { return document.getElementById(id); });

    function syncPadding() {
        if (padLink.checked) {
            padOthers.forEach(function (el) { el.value = padTop.value; el.disabled = true; });
        }
        App.renderTemplatePreview();
    }
    function updateLinkToggleUI() {
        var toggle = document.getElementById("pad-link-toggle");
        var span = toggle.querySelector("span");
        if (padLink.checked) {
            toggle.classList.add("linked");
            span.textContent = "Linked";
        } else {
            toggle.classList.remove("linked");
            span.textContent = "Unlinked";
        }
    }
    padLink.addEventListener("change", function () {
        updateLinkToggleUI();
        if (padLink.checked) {
            syncPadding();
        } else {
            padOthers.forEach(function (el) { el.disabled = false; });
        }
    });
    padTop.addEventListener("input", syncPadding);

    document.querySelectorAll(".line-type-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".line-type-btn").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            var type = btn.dataset.linetype;
            document.getElementById("tpl-line-type").value = type;
            if (type === "sewing") {
                document.getElementById("fields-sewing").classList.remove("hidden");
                document.getElementById("fields-fold").classList.add("hidden");
            } else {
                document.getElementById("fields-fold").classList.remove("hidden");
                document.getElementById("fields-sewing").classList.add("hidden");
            }
            App.renderTemplatePreview();
        });
    });

    App.getTemplateFormData = function () {
        var lineType = document.getElementById("tpl-line-type").value;
        return {
            customerId: document.getElementById("tpl-customer").value,
            name: document.getElementById("tpl-name").value.trim(),
            width: parseFloat(document.getElementById("tpl-width").value) || 0,
            height: parseFloat(document.getElementById("tpl-height").value) || 0,
            orientation: document.getElementById("tpl-orientation").value,
            padding: {
                top: parseFloat(document.getElementById("tpl-pad-top").value) || 0,
                bottom: parseFloat(document.getElementById("tpl-pad-bottom").value) || 0,
                left: parseFloat(document.getElementById("tpl-pad-left").value) || 0,
                right: parseFloat(document.getElementById("tpl-pad-right").value) || 0
            },
            sewing: {
                position: lineType === "sewing" ? document.getElementById("tpl-sew-position").value : "none",
                distance: parseFloat(document.getElementById("tpl-sew-distance").value) || 0,
                padding: parseFloat(document.getElementById("tpl-sew-padding").value) || 0
            },
            folding: {
                type: lineType === "fold" ? "mid" : "none",
                padding: parseFloat(document.getElementById("tpl-fold-padding").value) || 0
            }
        };
    };

    App.calcPrintingArea = function (tpl) {
        var top = tpl.padding.top;
        var bottom = tpl.padding.bottom;
        var left = tpl.padding.left;
        var right = tpl.padding.right;
        if (tpl.sewing.position === "top" && tpl.sewing.distance > top) top = tpl.sewing.distance;
        if (tpl.sewing.position === "bottom" && tpl.sewing.distance > bottom) bottom = tpl.sewing.distance;
        if (tpl.sewing.position === "left" && tpl.sewing.distance > left) left = tpl.sewing.distance;
        if (tpl.sewing.position === "right" && tpl.sewing.distance > right) right = tpl.sewing.distance;
        return { x: left, y: top, w: tpl.width - left - right, h: tpl.height - top - bottom };
    };

    App.calcPrintingRegions = function (tpl) {
        var top = tpl.padding.top, bottom = tpl.padding.bottom, left = tpl.padding.left, right = tpl.padding.right;
        var sewTotal = tpl.sewing.distance + tpl.sewing.padding;
        if (tpl.sewing.position !== "none" && tpl.sewing.distance > 0) {
            if (tpl.sewing.position === "top" && sewTotal > top) top = sewTotal;
            if (tpl.sewing.position === "bottom" && sewTotal > bottom) bottom = sewTotal;
            if (tpl.sewing.position === "left" && sewTotal > left) left = sewTotal;
            if (tpl.sewing.position === "right" && sewTotal > right) right = sewTotal;
        }
        var regions = [];
        if (tpl.folding.type === "mid") {
            var fp = tpl.folding.padding;
            if (tpl.orientation === "vertical") {
                var midY = tpl.height / 2;
                regions.push({ x: left, y: top, w: tpl.width - left - right, h: midY - fp - top });
                regions.push({ x: left, y: midY + fp, w: tpl.width - left - right, h: tpl.height - bottom - (midY + fp) });
            } else {
                var midX = tpl.width / 2;
                regions.push({ x: left, y: top, w: midX - fp - left, h: tpl.height - top - bottom });
                regions.push({ x: midX + fp, y: top, w: tpl.width - right - (midX + fp), h: tpl.height - top - bottom });
            }
        } else {
            regions.push({ x: left, y: top, w: tpl.width - left - right, h: tpl.height - top - bottom });
        }
        return regions;
    };

    App.clearPreview = function (preview) {
        var btn = preview.querySelector(".btn-fit");
        preview.innerHTML = "";
        if (btn) preview.appendChild(btn);
    };

    App.renderTemplatePreview = function () {
        var tpl = App.getTemplateFormData();
        var preview = document.getElementById("template-preview");
        App.clearPreview(preview);
        if (!tpl.width || !tpl.height) {
            preview.insertAdjacentHTML("beforeend", '<div class="preview-hint">Click "Preview" to see label layout.</div>');
            return;
        }

        var rect = preview.getBoundingClientRect();
        var maxW = rect.width - 60;
        var maxH = rect.height - 60;
        tplScale = Math.min(maxW / tpl.width, maxH / tpl.height, 8);
        tplScale = Math.max(tplScale, 1);

        var pxW = Math.round(tpl.width * tplScale);
        var pxH = Math.round(tpl.height * tplScale);

        var canvas = document.createElement("div");
        canvas.className = "label-canvas";
        canvas.style.width = pxW + "px";
        canvas.style.height = pxH + "px";

        var padRect = document.createElement("div");
        padRect.className = "dotted-rect";
        padRect.style.left = (tpl.padding.left * tplScale) + "px";
        padRect.style.top = (tpl.padding.top * tplScale) + "px";
        padRect.style.width = ((tpl.width - tpl.padding.left - tpl.padding.right) * tplScale) + "px";
        padRect.style.height = ((tpl.height - tpl.padding.top - tpl.padding.bottom) * tplScale) + "px";
        canvas.appendChild(padRect);

        if (tpl.sewing.position !== "none" && tpl.sewing.distance > 0) {
            var sewLine = document.createElement("div");
            sewLine.className = "sewing-line solid";
            if (tpl.sewing.position === "top") {
                sewLine.classList.add("horizontal");
                sewLine.style.top = (tpl.sewing.distance * tplScale) + "px";
            } else if (tpl.sewing.position === "bottom") {
                sewLine.classList.add("horizontal");
                sewLine.style.top = ((tpl.height - tpl.sewing.distance) * tplScale) + "px";
            } else if (tpl.sewing.position === "left") {
                sewLine.classList.add("vertical");
                sewLine.style.left = (tpl.sewing.distance * tplScale) + "px";
            } else if (tpl.sewing.position === "right") {
                sewLine.classList.add("vertical");
                sewLine.style.left = ((tpl.width - tpl.sewing.distance) * tplScale) + "px";
            }
            var sewLabel = document.createElement("div");
            sewLabel.className = "canvas-label";
            sewLabel.textContent = "sewing " + tpl.sewing.distance + "mm";
            sewLabel.style.top = "2px";
            sewLabel.style.left = "2px";
            if (tpl.sewing.position === "top") {
                sewLabel.style.top = ((tpl.sewing.distance * tplScale) - 12) + "px";
                sewLabel.style.left = "4px";
            }
            canvas.appendChild(sewLine);
            canvas.appendChild(sewLabel);

            if (tpl.sewing.padding > 0) {
                var sewPos = tpl.sewing.position;
                var sewDist = tpl.sewing.distance;
                var sp = tpl.sewing.padding;
                if (sewPos === "top" || sewPos === "bottom") {
                    var baseY = sewPos === "top" ? sewDist : (tpl.height - sewDist);
                    var line1 = document.createElement("div");
                    line1.className = "sewing-line horizontal";
                    line1.style.top = ((baseY - sp) * tplScale) + "px";
                    canvas.appendChild(line1);
                    var line2 = document.createElement("div");
                    line2.className = "sewing-line horizontal";
                    line2.style.top = ((baseY + sp) * tplScale) + "px";
                    canvas.appendChild(line2);
                } else {
                    var baseX = sewPos === "left" ? sewDist : (tpl.width - sewDist);
                    var line1v = document.createElement("div");
                    line1v.className = "sewing-line vertical";
                    line1v.style.left = ((baseX - sp) * tplScale) + "px";
                    canvas.appendChild(line1v);
                    var line2v = document.createElement("div");
                    line2v.className = "sewing-line vertical";
                    line2v.style.left = ((baseX + sp) * tplScale) + "px";
                    canvas.appendChild(line2v);
                }
            }
        }

        var regions = App.calcPrintingRegions(tpl);
        regions.forEach(function (r) {
            if (r.w > 0 && r.h > 0) {
                var el = document.createElement("div");
                el.className = "printing-region";
                el.style.left = (r.x * tplScale) + "px";
                el.style.top = (r.y * tplScale) + "px";
                el.style.width = (r.w * tplScale) + "px";
                el.style.height = (r.h * tplScale) + "px";
                canvas.appendChild(el);

                var lbl = document.createElement("div");
                lbl.className = "canvas-label";
                lbl.style.color = "red";
                lbl.textContent = r.w.toFixed(1) + "x" + r.h.toFixed(1) + "mm";
                lbl.style.left = (r.x * tplScale + 2) + "px";
                lbl.style.top = (r.y * tplScale + 2) + "px";
                canvas.appendChild(lbl);
            }
        });

        if (tpl.folding.type === "mid") {
            var foldLine = document.createElement("div");
            foldLine.className = "fold-line";
            if (tpl.orientation === "vertical") {
                foldLine.classList.add("horizontal");
                foldLine.style.top = (tpl.height / 2 * tplScale) + "px";
            } else {
                foldLine.classList.add("vertical");
                foldLine.style.left = (tpl.width / 2 * tplScale) + "px";
            }
            var foldLabel = document.createElement("div");
            foldLabel.className = "canvas-label";
            foldLabel.textContent = "mid fold";
            if (tpl.orientation === "vertical") {
                foldLabel.style.top = ((tpl.height / 2 * tplScale) + 2) + "px";
                foldLabel.style.right = "4px";
            } else {
                foldLabel.style.left = ((tpl.width / 2 * tplScale) + 4) + "px";
                foldLabel.style.top = "2px";
            }
            canvas.appendChild(foldLine);
            canvas.appendChild(foldLabel);

            if (tpl.folding.padding > 0) {
                var fp = tpl.folding.padding;
                if (tpl.orientation === "vertical") {
                    var midY = tpl.height / 2;
                    var fl1 = document.createElement("div");
                    fl1.className = "fold-line horizontal";
                    fl1.style.top = ((midY - fp) * tplScale) + "px";
                    canvas.appendChild(fl1);
                    var fl2 = document.createElement("div");
                    fl2.className = "fold-line horizontal";
                    fl2.style.top = ((midY + fp) * tplScale) + "px";
                    canvas.appendChild(fl2);
                } else {
                    var midX = tpl.width / 2;
                    var fl1v = document.createElement("div");
                    fl1v.className = "fold-line vertical";
                    fl1v.style.left = ((midX - fp) * tplScale) + "px";
                    canvas.appendChild(fl1v);
                    var fl2v = document.createElement("div");
                    fl2v.className = "fold-line vertical";
                    fl2v.style.left = ((midX + fp) * tplScale) + "px";
                    canvas.appendChild(fl2v);
                }
            }
        }

        var sizeLabel = document.createElement("div");
        sizeLabel.className = "scale-indicator";
        var arrow = tpl.orientation === "vertical" ? "\u2195" : "\u2194";
        sizeLabel.textContent = tpl.width + " x " + tpl.height + " mm  " + arrow + " " + tpl.orientation;
        canvas.appendChild(sizeLabel);

        var wrap = document.createElement("div");
        wrap.className = "preview-wrap";
        wrap.appendChild(canvas);
        wrap.style.transform = "translate(" + panState.x + "px," + panState.y + "px) scale(" + panState.zoom + ")";
        preview.appendChild(wrap);
    };

    /* ===== Canvas Pan & Zoom ===== */
    var panState = { x: 0, y: 0, zoom: 1, spaceDown: false, dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 };

    function resetPanZoom() {
        panState.x = 0;
        panState.y = 0;
        panState.zoom = 1;
        applyPanZoom();
    }

    document.querySelectorAll(".btn-fit").forEach(function (btn) {
        btn.addEventListener("click", resetPanZoom);
    });

    function applyPanZoom() {
        var wrap = document.querySelector("#template-preview .preview-wrap");
        if (wrap) wrap.style.transform = "translate(" + panState.x + "px," + panState.y + "px) scale(" + panState.zoom + ")";
    }

    document.addEventListener("keydown", function (e) {
        if (e.code === "Space" && !panState.spaceDown) {
            var preview = document.getElementById("template-preview");
            if (preview && preview.closest(".section-panel.active")) {
                e.preventDefault();
                panState.spaceDown = true;
                preview.classList.add("pan-ready");
            }
        }
    });

    document.addEventListener("keyup", function (e) {
        if (e.code === "Space") {
            panState.spaceDown = false;
            panState.dragging = false;
            var preview = document.getElementById("template-preview");
            if (preview) {
                preview.classList.remove("pan-ready");
                preview.classList.remove("panning");
            }
        }
    });

    document.getElementById("template-preview").addEventListener("mousedown", function (e) {
        if (panState.spaceDown) {
            e.preventDefault();
            panState.dragging = true;
            panState.startX = e.clientX;
            panState.startY = e.clientY;
            panState.origX = panState.x;
            panState.origY = panState.y;
            this.classList.add("panning");
            this.classList.remove("pan-ready");
        }
    });

    document.addEventListener("mousemove", function (e) {
        if (panState.dragging) {
            panState.x = panState.origX + (e.clientX - panState.startX);
            panState.y = panState.origY + (e.clientY - panState.startY);
            applyPanZoom();
        }
    });

    document.addEventListener("mouseup", function () {
        if (panState.dragging) {
            panState.dragging = false;
            var preview = document.getElementById("template-preview");
            if (preview) {
                preview.classList.remove("panning");
                if (panState.spaceDown) preview.classList.add("pan-ready");
            }
        }
    });

    document.getElementById("template-preview").addEventListener("wheel", function (e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? 0.9 : 1.1;
        panState.zoom = Math.min(Math.max(panState.zoom * delta, 0.2), 10);
        applyPanZoom();
    }, { passive: false });

    /* ===== Template Save ===== */
    document.getElementById("form-template-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var tpl = App.getTemplateFormData();
        if (!tpl.name) { alert("Template name required."); return; }
        if (!tpl.customerId) { alert("Select a customer."); return; }

        if (tpl.sewing.position !== "none" && tpl.sewing.distance > 0) {
            var padVal = tpl.padding[tpl.sewing.position] || 0;
            if (tpl.sewing.distance < padVal) {
                alert("Sewing distance (" + tpl.sewing.distance + "mm) must be equal or bigger than " + tpl.sewing.position + " padding (" + padVal + "mm).");
                return;
            }
        }

        tpl.printingArea = App.calcPrintingArea(tpl);
        tpl.components = [];

        var isUpdate = !!App.activePartitionTpl;

        if (isUpdate) {
            // Use last-saved partitions, not live in-memory edits
            tpl.partitions = App._getPartitionSnapshot() || App.activePartitionTpl.partitions;
            tpl.bgImage = App.activePartitionTpl.bgImage || "";
        } else {
            // New template: create default partitions
            tpl.partitions = [];
            if (tpl.folding.type === "mid") {
                var fp = tpl.folding.padding || 0;
                if (tpl.orientation === "vertical") {
                    var halfH = tpl.height / 2;
                    tpl.partitions.push({ page: 0, label: "Top", x: tpl.printingArea.x, y: tpl.printingArea.y, w: tpl.printingArea.w, h: halfH - fp - tpl.printingArea.y });
                    tpl.partitions.push({ page: 0, label: "Bottom", x: tpl.printingArea.x, y: halfH + fp, w: tpl.printingArea.w, h: (tpl.printingArea.y + tpl.printingArea.h) - (halfH + fp) });
                } else {
                    var halfW = tpl.width / 2;
                    tpl.partitions.push({ page: 0, label: "Left", x: tpl.printingArea.x, y: tpl.printingArea.y, w: halfW - fp - tpl.printingArea.x, h: tpl.printingArea.h });
                    tpl.partitions.push({ page: 0, label: "Right", x: halfW + fp, y: tpl.printingArea.y, w: (tpl.printingArea.x + tpl.printingArea.w) - (halfW + fp), h: tpl.printingArea.h });
                }
            } else {
                tpl.partitions.push({ page: 0, label: "Main", x: tpl.printingArea.x, y: tpl.printingArea.y, w: tpl.printingArea.w, h: tpl.printingArea.h });
            }
        }
        var method = isUpdate ? "PUT" : "POST";
        var url = isUpdate ? "/api/templates/" + App.activePartitionTpl.id : "/api/templates";

        App.api(method, url, tpl).then(function (saved) {
            if (isUpdate) {
                var idx = App.store.templates.findIndex(function (t) { return t.id === saved.id; });
                if (idx !== -1) App.store.templates[idx] = saved;
            } else {
                App.store.templates.push(saved);
            }
            showTwoPiecePreview(saved);
            App.refreshTemplateSelects("comp-tpl-select");
            var bar = document.querySelector('#tab-template-create .sub-tab-bar');
            bar.querySelectorAll('.sub-tab.disabled').forEach(function (s) { s.classList.remove('disabled'); });
            App.switchToSubTab("tab-template-create", "tpl-partition");
            document.getElementById("partition-tpl-name").textContent = saved.name;
            App.activePartitionTpl = saved;
            App.activePartitionPage = 0;
            requestAnimationFrame(function () { App.renderPartitionCanvas(); });
        });
    });

    function showTwoPiecePreview(tpl) {
        var preview = document.getElementById("template-preview");
        App.clearPreview(preview);
        var wrap = document.createElement("div");
        wrap.className = "two-piece-wrap";
        if (tpl.folding.type === "mid") {
            if (tpl.orientation === "vertical") {
                wrap.appendChild(makePieceCanvas(tpl, "Top", 0, 0, tpl.width, tpl.height / 2));
                wrap.appendChild(makePieceCanvas(tpl, "Bottom", 0, tpl.height / 2, tpl.width, tpl.height / 2));
            } else {
                wrap.appendChild(makePieceCanvas(tpl, "Left", 0, 0, tpl.width / 2, tpl.height));
                wrap.appendChild(makePieceCanvas(tpl, "Right", tpl.width / 2, 0, tpl.width / 2, tpl.height));
            }
        } else {
            wrap.appendChild(makePieceCanvas(tpl, "Full", 0, 0, tpl.width, tpl.height));
        }
        preview.appendChild(wrap);
    }

    function makePieceCanvas(tpl, label, ox, oy, w, h) {
        var container = document.createElement("div");
        var lbl = document.createElement("div");
        lbl.className = "piece-label";
        lbl.textContent = label + " (" + w.toFixed(1) + " x " + h.toFixed(1) + " mm)";
        container.appendChild(lbl);
        var rect = document.getElementById("template-preview").getBoundingClientRect();
        var sc = Math.min((rect.width / 2 - 40) / w, (rect.height - 60) / h, 6);
        sc = Math.max(sc, 1);
        var cvs = document.createElement("div");
        cvs.className = "label-canvas";
        cvs.style.width = Math.round(w * sc) + "px";
        cvs.style.height = Math.round(h * sc) + "px";
        container.appendChild(cvs);
        return container;
    }

    /* ===== Template Selects ===== */
    App.refreshTemplateSelects = function (selectId) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select --</option>';
        App.store.templates.forEach(function (t) {
            var opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
    };

    /* ===== Component placeholder ===== */
    document.getElementById("comp-tpl-select").addEventListener("change", function () {
        var id = parseInt(this.value);
        var tpl = App.store.templates.find(function (t) { return t.id === id; }) || null;
        var preview = document.getElementById("component-preview");
        if (!tpl) {
            preview.innerHTML = '<div class="preview-hint">Select a template to begin.</div>';
            return;
        }
        preview.innerHTML = '<div class="preview-hint">Component drag-drop — details to follow.</div>';
    });

    /* ===== Load template for editing ===== */
    App.loadTemplateForEditing = function (t) {
        document.getElementById("tpl-customer").value = t.customerId || "";
        document.getElementById("tpl-name").value = t.name || "";
        document.getElementById("tpl-width").value = t.width || "";
        document.getElementById("tpl-height").value = t.height || "";

        document.getElementById("tpl-orientation").value = t.orientation || "vertical";
        document.querySelectorAll(".orient-btn").forEach(function (b) {
            b.classList.toggle("active", b.dataset.orient === t.orientation);
        });

        document.getElementById("tpl-pad-top").value = t.padding.top;
        document.getElementById("tpl-pad-bottom").value = t.padding.bottom;
        document.getElementById("tpl-pad-left").value = t.padding.left;
        document.getElementById("tpl-pad-right").value = t.padding.right;
        var allSame = t.padding.top === t.padding.bottom && t.padding.top === t.padding.left && t.padding.top === t.padding.right;
        var padLinkEl = document.getElementById("tpl-pad-link");
        padLinkEl.checked = allSame;
        padOthers.forEach(function (el) { el.disabled = allSame; });
        updateLinkToggleUI();

        var lineType = (t.folding && t.folding.type === "mid") ? "fold" : "sewing";
        document.getElementById("tpl-line-type").value = lineType;
        document.querySelectorAll(".line-type-btn").forEach(function (b) {
            b.classList.toggle("active", b.dataset.linetype === lineType);
        });
        document.getElementById("fields-sewing").classList.toggle("hidden", lineType !== "sewing");
        document.getElementById("fields-fold").classList.toggle("hidden", lineType !== "fold");

        if (t.sewing) {
            document.getElementById("tpl-sew-position").value = t.sewing.position || "top";
            document.getElementById("tpl-sew-distance").value = t.sewing.distance || 0;
            document.getElementById("tpl-sew-padding").value = t.sewing.padding || 0;
        }

        if (t.folding) {
            document.getElementById("tpl-fold-padding").value = t.folding.padding || 0;
        }

        App.activePartitionTpl = t;
        App.activePartitionPage = 0;

        if (t.bgImage) {
            var bgMap = {};
            try { bgMap = JSON.parse(t.bgImage); } catch (e) {
                /* backward compat: plain data URL → assign to page 0 */
                if (t.bgImage.indexOf("data:") === 0) bgMap = { "0": t.bgImage };
            }
            var pages = Object.keys(bgMap);
            var loaded = 0;
            pages.forEach(function (pg) {
                var img = new Image();
                img.onload = function () {
                    App.activePartitionPage = parseInt(pg);
                    App._setPartitionBg(img);
                    loaded++;
                    if (loaded === pages.length) {
                        App.activePartitionPage = 0;
                        App.renderPartitionCanvas();
                    }
                };
                img.src = bgMap[pg];
            });
        } else {
            App._clearPartitionBg();
        }

        var sec = document.getElementById("section-template");
        sec.querySelectorAll(".tab").forEach(function (tab) { tab.classList.remove("active"); });
        sec.querySelectorAll(":scope > .tab-content").forEach(function (tc) { tc.classList.remove("active"); });
        sec.querySelector('.tab[data-tab="template-create"]').classList.add("active");
        document.getElementById("tab-template-create").classList.add("active");

        var bar = document.querySelector('#tab-template-create .sub-tab-bar');
        bar.querySelectorAll('.sub-tab.disabled').forEach(function (s) { s.classList.remove('disabled'); });

        App.switchToSubTab("tab-template-create", "tpl-setup");
        document.getElementById("partition-tpl-name").textContent = t.name;

        App.enforceSewingMin();
        App.renderTemplatePreview();
    };

    /* ===== Template — View All Table ===== */
    App.renderTemplateTable = function () {
        var tbody = document.querySelector("#table-templates tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("tpl-search").value || "").toLowerCase();
        App.store.templates.forEach(function (t) {
            if (q && t.name.toLowerCase().indexOf(q) === -1) return;
            var cust = App.store.customers.find(function (c) { return c.id === parseInt(t.customerId); });
            var custName = cust ? cust.company : "\u2014";
            var tr = document.createElement("tr");
            tr.innerHTML = "<td>" + App.esc(t.name) + "</td><td>" + App.esc(custName) + "</td><td>" + t.width + "x" + t.height + " mm</td><td>" + App.esc(t.orientation) + "</td><td>" + App.esc(t.folding.type) + "</td><td>" + t.partitions.length + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function (e) {
                e.stopPropagation();
                App.api("DELETE", "/api/templates/" + t.id).then(function () {
                    App.store.templates = App.store.templates.filter(function (x) { return x.id !== t.id; });
                    App.renderTemplateTable();
                });
            });
            tr.style.cursor = "pointer";
            tr.addEventListener("dblclick", function () {
                App.loadTemplateForEditing(t);
            });
            tbody.appendChild(tr);
        });
    };

    document.getElementById("tpl-search").addEventListener("input", App.renderTemplateTable);
})();
