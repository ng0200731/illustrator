(function () {
    "use strict";
    var App = window.App;

    /* Private state */
    var partitionBgImages = {};   /* page index → Image object */
    var partitionBgVisible = true;
    var partitionBgOpacity = 0.3;
    var rectDrawState = null;
    var partitionEditMode = false;
    var partitionSnapshot = null;
    var savedPartitions = null;    /* last-saved state for reset */

    /* Return last-saved partitions if unsaved edits are in progress */
    App._getPartitionSnapshot = function () { return partitionSnapshot; };

    /* Called when template is loaded for editing — captures the saved state */
    App._snapshotPartitions = function () {
        if (App.activePartitionTpl) {
            savedPartitions = JSON.parse(JSON.stringify(App.activePartitionTpl.partitions));
        }
    };

    /* Helpers for template.js to set/clear bg from loadTemplateForEditing */
    App._setPartitionBg = function (img) {
        partitionBgImages[App.activePartitionPage] = img;
        partitionBgVisible = true;
        partitionBgOpacity = parseInt(document.getElementById("partition-bg-opacity").value) / 100;
        document.getElementById("partition-bg-controls").style.display = "";
    };
    App._clearPartitionBg = function () {
        partitionBgImages = {};
        partitionBgVisible = true;
    };

    /* ===== Page helpers ===== */
    function getPagePartitions() {
        if (!App.activePartitionTpl) return [];
        return App.activePartitionTpl.partitions.filter(function (p) {
            return (p.page || 0) === App.activePartitionPage;
        });
    }

    function getPageCount() {
        if (!App.activePartitionTpl) return 1;
        var maxPage = 0;
        App.activePartitionTpl.partitions.forEach(function (p) {
            if ((p.page || 0) > maxPage) maxPage = p.page || 0;
        });
        return maxPage + 1;
    }

    function pageLabel(idx) {
        var sheetNum = Math.floor(idx / 2) + 1;
        var side = (idx % 2 === 0) ? "front" : "back";
        return sheetNum + " (" + side + ")";
    }

    function assignPartitionLabelsForPage(partitions, pageIndex) {
        var count = 0;
        partitions.forEach(function (p) {
            if ((p.page || 0) === pageIndex) {
                p.label = indexToLabel(count);
                count++;
            }
        });
    }

    function removePage(pageIdx) {
        var tpl = App.activePartitionTpl;
        if (!tpl || getPageCount() <= 1) return;
        if (!confirm("Delete page " + pageLabel(pageIdx) + " and all its partitions?")) return;

        /* Remove partitions on this page */
        tpl.partitions = tpl.partitions.filter(function (p) {
            return (p.page || 0) !== pageIdx;
        });
        /* Shift higher pages down by 1 */
        tpl.partitions.forEach(function (p) {
            if ((p.page || 0) > pageIdx) p.page = (p.page || 0) - 1;
        });
        /* Remove bg image for this page, shift higher ones */
        var newBg = {};
        Object.keys(partitionBgImages).forEach(function (pg) {
            var n = parseInt(pg);
            if (n < pageIdx) newBg[n] = partitionBgImages[n];
            else if (n > pageIdx) newBg[n - 1] = partitionBgImages[n];
        });
        partitionBgImages = newBg;

        if (App.activePartitionPage >= getPageCount()) {
            App.activePartitionPage = getPageCount() - 1;
        }
        App.renderPartitionCanvas();
    }

    function renderPageTabs() {
        var bar = document.getElementById("page-tab-bar");
        bar.innerHTML = "";
        if (!App.activePartitionTpl) return;
        var count = getPageCount();
        for (var i = 0; i < count; i++) {
            var tab = document.createElement("a");
            tab.className = "page-tab" + (i === App.activePartitionPage ? " active" : "");
            tab.textContent = pageLabel(i);
            tab.dataset.page = String(i);
            (function (idx) {
                tab.addEventListener("click", function () {
                    App.activePartitionPage = idx;
                    App.renderPartitionCanvas();
                });
            })(i);
            bar.appendChild(tab);
        }
    }

    function collectSnapEdges(tpl) {
        var xSet = {}, ySet = {};
        tpl.partitions.forEach(function (p) {
            if ((p.page || 0) !== App.activePartitionPage) return;
            xSet[p.x] = true;
            xSet[Math.round((p.x + p.w) * 10) / 10] = true;
            ySet[p.y] = true;
            ySet[Math.round((p.y + p.h) * 10) / 10] = true;
        });
        var pa = tpl.printingArea;
        if (pa) {
            xSet[pa.x] = true;
            xSet[Math.round((pa.x + pa.w) * 10) / 10] = true;
            ySet[pa.y] = true;
            ySet[Math.round((pa.y + pa.h) * 10) / 10] = true;
        }
        return { xs: Object.keys(xSet).map(Number), ys: Object.keys(ySet).map(Number) };
    }

    function snapToEdges(xMm, yMm, edges, sc, thresholdPx) {
        var threshMm = thresholdPx / sc;
        var sx = xMm, sy = yMm, snappedX = false, snappedY = false;
        var bestDx = threshMm, bestDy = threshMm;
        edges.xs.forEach(function (ex) {
            var d = Math.abs(ex - xMm);
            if (d < bestDx) { bestDx = d; sx = ex; snappedX = true; }
        });
        edges.ys.forEach(function (ey) {
            var d = Math.abs(ey - yMm);
            if (d < bestDy) { bestDy = d; sy = ey; snappedY = true; }
        });
        return { x: sx, y: sy, snapped: snappedX || snappedY };
    }

    function findAdjacentPartition(partitions, current, edge) {
        var EPSILON = 0.1;
        var best = null, bestOverlap = 0;
        for (var i = 0; i < partitions.length; i++) {
            var p = partitions[i];
            if (p === current) continue;
            if ((p.page || 0) !== (current.page || 0)) continue;
            var edgeMatch = false, overlap = 0;
            if (edge === "top" && Math.abs((p.y + p.h) - current.y) < EPSILON) {
                edgeMatch = true;
                overlap = Math.min(p.x + p.w, current.x + current.w) - Math.max(p.x, current.x);
            } else if (edge === "bottom" && Math.abs(p.y - (current.y + current.h)) < EPSILON) {
                edgeMatch = true;
                overlap = Math.min(p.x + p.w, current.x + current.w) - Math.max(p.x, current.x);
            } else if (edge === "left" && Math.abs((p.x + p.w) - current.x) < EPSILON) {
                edgeMatch = true;
                overlap = Math.min(p.y + p.h, current.y + current.h) - Math.max(p.y, current.y);
            } else if (edge === "right" && Math.abs(p.x - (current.x + current.w)) < EPSILON) {
                edgeMatch = true;
                overlap = Math.min(p.y + p.h, current.y + current.h) - Math.max(p.y, current.y);
            }
            if (edgeMatch && overlap > bestOverlap) { bestOverlap = overlap; best = p; }
        }
        return best;
    }

    function removePartition(index) {
        var tpl = App.activePartitionTpl;
        if (!tpl || getPagePartitions().length <= 1) return;
        if (!confirm("Delete this partition?")) return;

        tpl.partitions.splice(index, 1);
        assignPartitionLabelsForPage(tpl.partitions, App.activePartitionPage);
        App.renderPartitionCanvas();
    }

    function indexToLabel(i) {
        var label = "";
        do {
            label = String.fromCharCode(65 + (i % 26)) + label;
            i = Math.floor(i / 26) - 1;
        } while (i >= 0);
        return label;
    }

    function assignPartitionLabels(partitions) {
        partitions.forEach(function (p, i) { p.label = indexToLabel(i); });
    }

    function startRectDraw(ev, canvasEl, sc) {
        if (!App.activePartitionTpl) return;
        var tpl = App.activePartitionTpl;
        var canvasRect = canvasEl.getBoundingClientRect();
        var rawXmm = (ev.clientX - canvasRect.left) / sc;
        var rawYmm = (ev.clientY - canvasRect.top) / sc;
        var snapEdges = collectSnapEdges(tpl);
        var start = snapToEdges(rawXmm, rawYmm, snapEdges, sc, 8);
        var pa = tpl.printingArea;
        if (!pa) return;

        var previewEl = document.createElement("div");
        previewEl.className = "rect-draw-preview";
        canvasEl.appendChild(previewEl);

        var snapDot = document.createElement("div");
        snapDot.className = "snap-indicator";
        snapDot.style.display = "none";
        canvasEl.appendChild(snapDot);

        rectDrawState = {
            sc: sc, canvasEl: canvasEl, canvasRect: canvasRect, tpl: tpl,
            bounds: { x: pa.x, y: pa.y, x2: pa.x + pa.w, y2: pa.y + pa.h },
            startMm: start, snapEdges: snapEdges, previewEl: previewEl, snapDot: snapDot
        };

        document.addEventListener("mousemove", onRectDrawMove);
        document.addEventListener("mouseup", onRectDrawEnd);
    }

    function onRectDrawMove(e) {
        if (!rectDrawState) return;
        var s = rectDrawState;
        var B = s.bounds;
        var rawXmm = Math.max(B.x, Math.min(B.x2, (e.clientX - s.canvasRect.left) / s.sc));
        var rawYmm = Math.max(B.y, Math.min(B.y2, (e.clientY - s.canvasRect.top) / s.sc));
        var end = snapToEdges(rawXmm, rawYmm, s.snapEdges, s.sc, 8);
        end.x = Math.max(B.x, Math.min(B.x2, end.x));
        end.y = Math.max(B.y, Math.min(B.y2, end.y));
        var x1 = Math.min(s.startMm.x, end.x), y1 = Math.min(s.startMm.y, end.y);
        var x2 = Math.max(s.startMm.x, end.x), y2 = Math.max(s.startMm.y, end.y);
        s.previewEl.style.left = (x1 * s.sc) + "px";
        s.previewEl.style.top = (y1 * s.sc) + "px";
        s.previewEl.style.width = ((x2 - x1) * s.sc) + "px";
        s.previewEl.style.height = ((y2 - y1) * s.sc) + "px";
        if (end.snapped) {
            s.snapDot.style.display = "block";
            s.snapDot.style.left = (end.x * s.sc - 4) + "px";
            s.snapDot.style.top = (end.y * s.sc - 4) + "px";
        } else {
            s.snapDot.style.display = "none";
        }
    }

    function onRectDrawEnd(e) {
        document.removeEventListener("mousemove", onRectDrawMove);
        document.removeEventListener("mouseup", onRectDrawEnd);
        if (!rectDrawState) return;
        var s = rectDrawState;
        if (s.previewEl.parentNode) s.previewEl.parentNode.removeChild(s.previewEl);
        if (s.snapDot.parentNode) s.snapDot.parentNode.removeChild(s.snapDot);
        var B = s.bounds;
        var rawXmm = Math.max(B.x, Math.min(B.x2, (e.clientX - s.canvasRect.left) / s.sc));
        var rawYmm = Math.max(B.y, Math.min(B.y2, (e.clientY - s.canvasRect.top) / s.sc));
        var end = snapToEdges(rawXmm, rawYmm, s.snapEdges, s.sc, 8);
        end.x = Math.max(B.x, Math.min(B.x2, end.x));
        end.y = Math.max(B.y, Math.min(B.y2, end.y));
        var x1 = Math.round(Math.min(s.startMm.x, end.x) * 10) / 10;
        var y1 = Math.round(Math.min(s.startMm.y, end.y) * 10) / 10;
        var w = Math.round((Math.max(s.startMm.x, end.x) - x1) * 10) / 10;
        var h = Math.round((Math.max(s.startMm.y, end.y) - y1) * 10) / 10;
        rectDrawState = null;
        if (w < 2 || h < 2) return;
        s.tpl.partitions.push({ page: App.activePartitionPage, label: "", x: x1, y: y1, w: w, h: h });
        assignPartitionLabelsForPage(s.tpl.partitions, App.activePartitionPage);
        App.renderPartitionCanvas();
    }

    /* ===== Render Partition Canvas ===== */
    App.renderPartitionCanvas = function () {
        var preview = document.getElementById("partition-preview");
        App.clearPreview(preview);
        renderPageTabs();
        document.getElementById("partition-bg-controls").style.display =
            partitionBgImages[App.activePartitionPage] ? "" : "none";
        if (!App.activePartitionTpl) {
            preview.insertAdjacentHTML("beforeend", '<div class="preview-hint">Select a template to begin.</div>');
            return;
        }

        var tpl = App.activePartitionTpl;
        var rect = preview.getBoundingClientRect();
        var sc = Math.min((rect.width - 60) / tpl.width, (rect.height - 60) / tpl.height, 8);
        sc = Math.max(sc, 1);

        var canvas = document.createElement("div");
        canvas.className = "label-canvas";
        canvas.style.width = Math.round(tpl.width * sc) + "px";
        canvas.style.height = Math.round(tpl.height * sc) + "px";
        canvas.style.cursor = partitionEditMode ? "default" : "crosshair";

        var hoverDot = document.createElement("div");
        hoverDot.className = "snap-indicator";
        hoverDot.style.display = "none";
        canvas.appendChild(hoverDot);
        var hoverSnapEdges = collectSnapEdges(tpl);

        canvas.addEventListener("mousemove", function (ev) {
            if (rectDrawState || partitionEditMode) { hoverDot.style.display = "none"; return; }
            var rawX = (ev.clientX - canvas.getBoundingClientRect().left) / sc;
            var rawY = (ev.clientY - canvas.getBoundingClientRect().top) / sc;
            var snap = snapToEdges(rawX, rawY, hoverSnapEdges, sc, 8);
            if (snap.snapped) {
                hoverDot.style.display = "block";
                hoverDot.style.left = (snap.x * sc - 4) + "px";
                hoverDot.style.top = (snap.y * sc - 4) + "px";
            } else {
                hoverDot.style.display = "none";
            }
        });
        canvas.addEventListener("mouseleave", function () {
            hoverDot.style.display = "none";
        });

        canvas.addEventListener("mousedown", function (ev) {
            if (!partitionEditMode) return;
            var handle = ev.target.closest(".partition-resize-handle");
            if (!handle) return;
            ev.stopPropagation();
            ev.preventDefault();

            var edge = handle.dataset.edge;
            var idx = parseInt(handle.dataset.partitionIndex);
            var part = tpl.partitions[idx];
            if (!part) return;

            var neighbor = findAdjacentPartition(tpl.partitions, part, edge);
            var pa = tpl.printingArea || App.calcPrintingArea(tpl);

            var MIN_SIZE = 2;
            var startX = ev.clientX, startY = ev.clientY;
            var origP = { x: part.x, y: part.y, w: part.w, h: part.h };
            var origN = neighbor ? { x: neighbor.x, y: neighbor.y, w: neighbor.w, h: neighbor.h } : null;

            function onMove(e) {
                var dxMm = (e.clientX - startX) / sc;
                var dyMm = (e.clientY - startY) / sc;
                var delta;
                if (edge === "top") {
                    delta = origN
                        ? Math.max(-(origN.h - MIN_SIZE), Math.min(origP.h - MIN_SIZE, dyMm))
                        : Math.max(-(origP.y - pa.y), Math.min(origP.h - MIN_SIZE, dyMm));
                    delta = Math.round(delta * 10) / 10;
                    part.y = origP.y + delta; part.h = origP.h - delta;
                    if (origN) neighbor.h = origN.h + delta;
                } else if (edge === "bottom") {
                    delta = origN
                        ? Math.max(-(origP.h - MIN_SIZE), Math.min(origN.h - MIN_SIZE, dyMm))
                        : Math.max(-(origP.h - MIN_SIZE), Math.min((pa.y + pa.h) - (origP.y + origP.h), dyMm));
                    delta = Math.round(delta * 10) / 10;
                    part.h = origP.h + delta;
                    if (origN) { neighbor.y = origN.y + delta; neighbor.h = origN.h - delta; }
                } else if (edge === "left") {
                    delta = origN
                        ? Math.max(-(origN.w - MIN_SIZE), Math.min(origP.w - MIN_SIZE, dxMm))
                        : Math.max(-(origP.x - pa.x), Math.min(origP.w - MIN_SIZE, dxMm));
                    delta = Math.round(delta * 10) / 10;
                    part.x = origP.x + delta; part.w = origP.w - delta;
                    if (origN) neighbor.w = origN.w + delta;
                } else if (edge === "right") {
                    delta = origN
                        ? Math.max(-(origP.w - MIN_SIZE), Math.min(origN.w - MIN_SIZE, dxMm))
                        : Math.max(-(origP.w - MIN_SIZE), Math.min((pa.x + pa.w) - (origP.x + origP.w), dxMm));
                    delta = Math.round(delta * 10) / 10;
                    part.w = origP.w + delta;
                    if (origN) { neighbor.x = origN.x + delta; neighbor.w = origN.w - delta; }
                }
                App.renderPartitionCanvas();
            }
            function onUp() {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        canvas.addEventListener("mousedown", function (ev) {
            if (ev.button !== 0 || partitionEditMode) return;
            startRectDraw(ev, canvas, sc);
        });

        var pageBgImg = partitionBgImages[App.activePartitionPage];
        if (pageBgImg) {
            var bgEl = document.createElement("img");
            bgEl.className = "partition-bg-img";
            bgEl.src = pageBgImg.src;
            bgEl.style.opacity = partitionBgOpacity;
            if (!partitionBgVisible) bgEl.style.display = "none";
            canvas.appendChild(bgEl);
        }

        tpl.partitions.forEach(function (part, i) {
            if ((part.page || 0) !== App.activePartitionPage) return;
            var el = document.createElement("div");
            el.className = "partition-area";
            el.dataset.partitionIndex = String(i);
            el.style.left = (part.x * sc) + "px";
            el.style.top = (part.y * sc) + "px";
            el.style.width = (part.w * sc) + "px";
            el.style.height = (part.h * sc) + "px";

            var lbl = document.createElement("div");
            lbl.className = "canvas-label";
            lbl.style.left = "2px";
            lbl.style.top = "2px";
            lbl.style.position = "relative";
            lbl.textContent = part.label + " (" + part.w.toFixed(1) + "x" + part.h.toFixed(1) + ")";
            el.appendChild(lbl);

            if (partitionEditMode) {
                ["top", "bottom", "left", "right"].forEach(function (edge) {
                    var handle = document.createElement("div");
                    handle.className = "partition-resize-handle resize-" + edge;
                    handle.dataset.edge = edge;
                    handle.dataset.partitionIndex = String(i);
                    el.appendChild(handle);
                });
            }

            canvas.appendChild(el);
        });

        if (tpl.folding.type === "mid") {
            var foldLine = document.createElement("div");
            foldLine.className = "fold-line";
            if (tpl.orientation === "vertical") {
                foldLine.classList.add("horizontal");
                foldLine.style.top = (tpl.height / 2 * sc) + "px";
            } else {
                foldLine.classList.add("vertical");
                foldLine.style.left = (tpl.width / 2 * sc) + "px";
            }
            canvas.appendChild(foldLine);
        }

        canvas.querySelectorAll(".partition-area").forEach(function (el) {
            el.addEventListener("mouseenter", function () {
                var idx = el.dataset.partitionIndex;
                el.classList.add("highlight");
                var li = document.querySelector("#partition-list .component-list-item[data-partition-index='" + idx + "']");
                if (li) li.classList.add("highlight");
            });
            el.addEventListener("mouseleave", function () {
                var idx = el.dataset.partitionIndex;
                el.classList.remove("highlight");
                var li = document.querySelector("#partition-list .component-list-item[data-partition-index='" + idx + "']");
                if (li) li.classList.remove("highlight");
            });
        });

        preview.appendChild(canvas);
        renderPartitionList();
    };

    function renderPartitionList() {
        var list = document.getElementById("partition-list");
        list.innerHTML = "";
        if (!App.activePartitionTpl) return;
        App.activePartitionTpl.partitions.forEach(function (p, i) {
            if ((p.page || 0) !== App.activePartitionPage) return;
            var div = document.createElement("div");
            div.className = "component-list-item";
            div.dataset.partitionIndex = String(i);

            var span = document.createElement("span");
            span.textContent = p.label + " (" + p.w.toFixed(1) + "x" + p.h.toFixed(1) + ")";
            div.appendChild(span);

            if (getPagePartitions().length > 1) {
                var btn = document.createElement("button");
                btn.className = "delete-btn btn-outline";
                btn.textContent = "\u00d7";
                btn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    removePartition(i);
                });
                div.appendChild(btn);
            }

            div.addEventListener("mouseenter", function () {
                div.classList.add("highlight");
                var ce = document.querySelector("#partition-preview .partition-area[data-partition-index='" + i + "']");
                if (ce) ce.classList.add("highlight");
            });
            div.addEventListener("mouseleave", function () {
                div.classList.remove("highlight");
                var ce = document.querySelector("#partition-preview .partition-area[data-partition-index='" + i + "']");
                if (ce) ce.classList.remove("highlight");
            });

            list.appendChild(div);
        });
    }

    /* ===== Background image paste ===== */
    document.addEventListener("paste", function (e) {
        var tab = document.getElementById("subtab-tpl-partition");
        if (!tab || !tab.classList.contains("active")) return;
        if (!App.activePartitionTpl) return;
        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                e.preventDefault();
                var blob = items[i].getAsFile();
                var reader = new FileReader();
                reader.onload = function (ev) {
                    var img = new Image();
                    img.onload = function () {
                        partitionBgImages[App.activePartitionPage] = img;
                        partitionBgVisible = true;
                        partitionBgOpacity = parseInt(document.getElementById("partition-bg-opacity").value) / 100;
                        document.getElementById("partition-bg-controls").style.display = "";
                        App.renderPartitionCanvas();
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
    });

    document.getElementById("btn-bg-toggle").addEventListener("click", function () {
        partitionBgVisible = !partitionBgVisible;
        document.getElementById("ico-eye-open").style.display = partitionBgVisible ? "" : "none";
        document.getElementById("ico-eye-closed").style.display = partitionBgVisible ? "none" : "";
        var bgEl = document.querySelector("#partition-preview .partition-bg-img");
        if (bgEl) bgEl.style.display = partitionBgVisible ? "" : "none";
    });

    document.getElementById("partition-bg-opacity").addEventListener("input", function () {
        partitionBgOpacity = parseInt(this.value) / 100;
        document.getElementById("partition-bg-opacity-val").textContent = this.value + "%";
        var bgEl = document.querySelector("#partition-preview .partition-bg-img");
        if (bgEl) bgEl.style.opacity = partitionBgOpacity;
    });

    document.getElementById("btn-bg-remove").addEventListener("click", function () {
        delete partitionBgImages[App.activePartitionPage];
        partitionBgVisible = true;
        document.getElementById("partition-bg-controls").style.display = "none";
        App.renderPartitionCanvas();
    });

    document.getElementById("btn-reset-partitions").addEventListener("click", function () {
        if (!App.activePartitionTpl) return;
        if (!confirm("Reset all partitions to last saved state?")) return;
        var btn = this;
        if (savedPartitions) {
            App.activePartitionTpl.partitions = JSON.parse(JSON.stringify(savedPartitions));
        }
        App.activePartitionPage = 0;
        App.renderPartitionCanvas();
        btn.textContent = "Reset!";
        setTimeout(function () { btn.textContent = "Reset"; }, 1500);
    });

    function serializePartitions(parts) {
        return parts.map(function (p) {
            return { page: p.page || 0, label: p.label, x: p.x, y: p.y, w: p.w, h: p.h };
        });
    }

    document.getElementById("btn-save-partitions").addEventListener("click", function () {
        if (!App.activePartitionTpl) return;
        var btn = this;
        var tpl = App.activePartitionTpl;
        var serialized = serializePartitions(tpl.partitions);
        console.log("SAVE sending partitions:", JSON.stringify(serialized));
        var bgMap = {};
        Object.keys(partitionBgImages).forEach(function (pg) {
            bgMap[pg] = partitionBgImages[pg].src;
        });
        var payload = {
            partitions: serialized,
            bgImage: JSON.stringify(bgMap)
        };
        btn.disabled = true;
        btn.textContent = "Saving...";
        App.api("PUT", "/api/templates/" + tpl.id + "/partitions", payload).then(function (resp) {
            console.log("SAVE received partitions:", JSON.stringify(resp.partitions));
            App.activePartitionTpl.partitions = resp.partitions;
            App.activePartitionTpl.bgImage = JSON.stringify(bgMap);
            savedPartitions = JSON.parse(JSON.stringify(resp.partitions));
            partitionSnapshot = null;
            App.renderPartitionCanvas();
            btn.textContent = "Saved!";
            setTimeout(function () {
                btn.textContent = "Save";
                btn.disabled = false;
            }, 1500);
        }).catch(function () {
            btn.textContent = "Save";
            btn.disabled = false;
            alert("Save failed. Please try again.");
        });
    });

    document.getElementById("btn-edit-partitions").addEventListener("click", function () {
        partitionEditMode = !partitionEditMode;
        this.classList.toggle("active", partitionEditMode);
        document.getElementById("partition-preview").classList.toggle("edit-mode", partitionEditMode);
        if (partitionEditMode && App.activePartitionTpl && !partitionSnapshot) {
            partitionSnapshot = JSON.parse(JSON.stringify(App.activePartitionTpl.partitions));
        }
        App.renderPartitionCanvas();
    });

    document.getElementById("btn-add-page").addEventListener("click", function () {
        if (!App.activePartitionTpl) return;
        var tpl = App.activePartitionTpl;
        var newPageIndex = getPageCount();
        var pa = tpl.printingArea || App.calcPrintingArea(tpl);
        var newPartitions = [];

        if (tpl.folding && tpl.folding.type === "mid") {
            var fp = tpl.folding.padding || 0;
            if (tpl.orientation === "vertical") {
                var halfH = tpl.height / 2;
                newPartitions.push({ page: newPageIndex, label: "", x: pa.x, y: pa.y, w: pa.w, h: halfH - fp - pa.y });
                newPartitions.push({ page: newPageIndex, label: "", x: pa.x, y: halfH + fp, w: pa.w, h: (pa.y + pa.h) - (halfH + fp) });
            } else {
                var halfW = tpl.width / 2;
                newPartitions.push({ page: newPageIndex, label: "", x: pa.x, y: pa.y, w: halfW - fp - pa.x, h: pa.h });
                newPartitions.push({ page: newPageIndex, label: "", x: halfW + fp, y: pa.y, w: (pa.x + pa.w) - (halfW + fp), h: pa.h });
            }
        } else {
            newPartitions.push({ page: newPageIndex, label: "", x: pa.x, y: pa.y, w: pa.w, h: pa.h });
        }

        tpl.partitions = tpl.partitions.concat(newPartitions);
        assignPartitionLabelsForPage(tpl.partitions, newPageIndex);
        App.activePartitionPage = newPageIndex;
        App.renderPartitionCanvas();
    });
})();
