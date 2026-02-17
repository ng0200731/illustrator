(function () {
    "use strict";
    var App = window.App;

    /* ===== State ===== */
    var compTpl = null;
    var compPage = 0;
    var components = [];
    var savedComponents = [];
    var selectedIdx = -1;
    var selectedSet = [];  /* multi-select indices for rubber-band */
    var rubberBand = null; /* { startX, startY } in mm */
    var sc = 3;
    var pan = { x: 0, y: 0, zoom: 1, spaceDown: false, dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 };
    var dragState = null;
    var editingIdx = -1;
    var pdfFileName = "";
    var collapsedGroups = {}; /* track collapsed group state */

    /* ===== Group Toolbar ===== */
    function generateGroupId() {
        return "grp-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    }

    function updateGroupToolbar() {
        var toolbar = document.getElementById("group-toolbar");
        var btnGroup = document.getElementById("btn-group");
        var btnUngroup = document.getElementById("btn-ungroup");
        if (!toolbar || !btnGroup || !btnUngroup) return;

        if (selectedSet.length < 2) {
            toolbar.style.display = "none";
            return;
        }

        /* Check if all selected items belong to same group */
        var groupIds = [];
        selectedSet.forEach(function (i) {
            var gid = components[i] && components[i].groupId;
            if (gid && groupIds.indexOf(gid) === -1) groupIds.push(gid);
        });
        var allUngrouped = selectedSet.every(function (i) { return !components[i].groupId; });
        var allSameGroup = groupIds.length === 1 && selectedSet.every(function (i) { return components[i].groupId === groupIds[0]; });

        btnGroup.style.display = allUngrouped ? "inline-block" : "none";
        btnUngroup.style.display = allSameGroup ? "inline-block" : "none";

        if (!allUngrouped && !allSameGroup) {
            toolbar.style.display = "none";
            return;
        }

        /* Calculate bounding box of selected items */
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedSet.forEach(function (i) {
            var c = components[i];
            if (c.x < minX) minX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.x + c.w > maxX) maxX = c.x + c.w;
            if (c.y + c.h > maxY) maxY = c.y + c.h;
        });

        /* Position toolbar above selection */
        var preview = document.getElementById("component-preview");
        var canvasEl = preview.querySelector(".label-canvas");
        if (!canvasEl) { toolbar.style.display = "none"; return; }

        var cr = canvasEl.getBoundingClientRect();
        var pr = preview.getBoundingClientRect();
        var esc = sc * pan.zoom;
        var centerX = (minX + maxX) / 2 * esc + (cr.left - pr.left);
        var topY = minY * esc + (cr.top - pr.top) - 35;

        toolbar.style.left = (centerX - 50) + "px";
        toolbar.style.top = Math.max(5, topY) + "px";
        toolbar.style.display = "flex";
    }

    function doGroup() {
        if (selectedSet.length < 2) return;
        var gid = generateGroupId();
        selectedSet.forEach(function (i) {
            components[i].groupId = gid;
        });
        renderCanvas();
        renderPlacedList();
    }

    function doUngroup() {
        selectedSet.forEach(function (i) {
            components[i].groupId = null;
        });
        renderCanvas();
        renderPlacedList();
    }

    function selectGroup(groupId) {
        selectedSet = [];
        components.forEach(function (c, i) {
            if (c.groupId === groupId && (c.page || 0) === compPage) {
                selectedSet.push(i);
            }
        });
        selectedIdx = -1;
        renderCanvas();
    }

    /* ===== Helpers ===== */
    function getPagePartitions() {
        if (!compTpl || !compTpl.partitions) return [];
        return compTpl.partitions.filter(function (p) { return (p.page || 0) === compPage; });
    }

    function getPageComponents() {
        return components.filter(function (c) { return (c.page || 0) === compPage; });
    }

    function findPartitionAt(xMm, yMm) {
        var parts = getPagePartitions();
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (xMm >= p.x && xMm <= p.x + p.w && yMm >= p.y && yMm <= p.y + p.h) return p;
        }
        return null;
    }

    function clampToPartition(comp) {
        var parts = getPagePartitions();
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (comp.partitionLabel === p.label) {
                comp.x = Math.max(p.x, Math.min(p.x + p.w - comp.w, comp.x));
                comp.y = Math.max(p.y, Math.min(p.y + p.h - comp.h, comp.y));
                return;
            }
        }
    }

    function getPageCount() {
        if (!compTpl || !compTpl.partitions) return 1;
        var max = 0;
        compTpl.partitions.forEach(function (p) { if ((p.page || 0) > max) max = p.page; });
        return max + 1;
    }

    /* ===== Page Tabs ===== */
    function renderPageTabs() {
        var bar = document.getElementById("comp-page-tabs");
        if (!bar) return;
        bar.innerHTML = "";
        var count = getPageCount();
        for (var i = 0; i < count; i++) {
            (function (pg) {
                var tab = document.createElement("button");
                tab.className = "page-tab" + (pg === compPage ? " active" : "");
                var side = pg % 2 === 0 ? "front" : "back";
                tab.textContent = "Sheet " + (Math.floor(pg / 2) + 1) + " (" + side + ")";
                tab.addEventListener("click", function () {
                    compPage = pg;
                    renderPageTabs();
                    renderCanvas();
                });
                bar.appendChild(tab);
            })(i);
        }
    }

    /* ===== original List ===== */
    function renderPlacedList() {
        var list = document.getElementById("comp-placed-list");
        if (!list) return;
        list.innerHTML = "";
        var pageComps = getPageComponents();

        /* Collect groups and ungrouped items */
        var groups = {};
        var ungrouped = [];
        pageComps.forEach(function (c) {
            var idx = components.indexOf(c);
            if (c.groupId) {
                if (!groups[c.groupId]) groups[c.groupId] = [];
                groups[c.groupId].push({ comp: c, idx: idx });
            } else {
                ungrouped.push({ comp: c, idx: idx });
            }
        });

        /* Render groups first */
        Object.keys(groups).forEach(function (gid, gIndex) {
            var groupItems = groups[gid];
            var isCollapsed = collapsedGroups[gid];

            /* Check if any item in group is selected */
            var groupSelected = groupItems.some(function (item) {
                return item.idx === selectedIdx || (selectedSet && selectedSet.indexOf(item.idx) !== -1);
            });

            /* Group header */
            var header = document.createElement("div");
            header.className = "group-header" + (groupSelected ? " highlight" : "");
            var toggle = document.createElement("span");
            toggle.className = "toggle";
            toggle.textContent = isCollapsed ? "▶" : "▼";
            header.appendChild(toggle);
            var label = document.createElement("span");
            label.textContent = "Group " + (gIndex + 1) + " (" + groupItems.length + ")";
            header.appendChild(label);
            header.addEventListener("click", function (e) {
                if (e.target === toggle) {
                    /* Toggle collapse */
                    collapsedGroups[gid] = !collapsedGroups[gid];
                    renderPlacedList();
                } else {
                    /* Select entire group */
                    selectGroup(gid);
                    renderPlacedList();
                    updateGroupToolbar();
                }
            });
            list.appendChild(header);

            /* Group children container */
            var children = document.createElement("div");
            children.className = "group-children" + (isCollapsed ? " collapsed" : "");

            groupItems.forEach(function (item) {
                var c = item.comp;
                var idx = item.idx;
                var li = document.createElement("div");
                var isSelected = idx === selectedIdx || (selectedSet && selectedSet.indexOf(idx) !== -1);
                li.className = "component-list-item grouped" + (isSelected ? " highlight" : "");
                var span = document.createElement("span");
                span.textContent = c.type + ": " + (c.content || "").substring(0, 20);
                li.appendChild(span);
                if (c.type === "pdfpath") {
                    var eye = document.createElement("button");
                    eye.className = "eye-btn" + (c.visible === false ? " off" : "");
                    eye.innerHTML = c.visible === false ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><path d="M3 12c2-3 5-6 9-6s7 3 9 6"/><line x1="3" y1="12" x2="5" y2="15"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14.5" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="17"/><line x1="21" y1="12" x2="19" y2="15"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="#000"/></svg>';
                    eye.title = c.visible === false ? "Hidden" : "Visible";
                    eye.addEventListener("click", function (e) {
                        e.stopPropagation();
                        components[idx].visible = !(components[idx].visible !== false);
                        renderCanvas();
                        renderPlacedList();
                    });
                    li.appendChild(eye);
                    var lock = document.createElement("button");
                    lock.className = "lock-btn" + (c.locked ? " on" : "");
                    lock.innerHTML = c.locked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0" /></svg>';
                    lock.title = c.locked ? "Locked" : "Unlocked";
                    lock.addEventListener("click", function (e) {
                        e.stopPropagation();
                        components[idx].locked = !components[idx].locked;
                        renderCanvas();
                        renderPlacedList();
                    });
                    li.appendChild(lock);
                }
                var del = document.createElement("button");
                del.className = "delete-btn";
                del.textContent = "×";
                del.addEventListener("click", function (e) {
                    e.stopPropagation();
                    components.splice(idx, 1);
                    if (selectedIdx === idx) selectedIdx = -1;
                    else if (selectedIdx > idx) selectedIdx--;
                    /* Remove from selectedSet */
                    var setIdx = selectedSet.indexOf(idx);
                    if (setIdx >= 0) selectedSet.splice(setIdx, 1);
                    selectedSet = selectedSet.map(function (i) { return i > idx ? i - 1 : i; });
                    renderCanvas();
                    renderPlacedList();
                    updateGroupToolbar();
                });
                li.appendChild(del);
                li.addEventListener("click", function () {
                    selectGroup(gid);
                    renderPlacedList();
                    updateGroupToolbar();
                });
                addHoverHandlers(li, idx);
                children.appendChild(li);
            });
            list.appendChild(children);
        });

        /* Render ungrouped items */
        ungrouped.forEach(function (item) {
            var c = item.comp;
            var idx = item.idx;
            var li = document.createElement("div");
            var isSelected = idx === selectedIdx || (selectedSet && selectedSet.indexOf(idx) !== -1);
            li.className = "component-list-item" + (isSelected ? " highlight" : "");
            var span = document.createElement("span");
            span.textContent = c.type + ": " + (c.content || "").substring(0, 20);
            li.appendChild(span);
            if (c.type === "pdfpath") {
                var eye = document.createElement("button");
                eye.className = "eye-btn" + (c.visible === false ? " off" : "");
                eye.innerHTML = c.visible === false ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><path d="M3 12c2-3 5-6 9-6s7 3 9 6"/><line x1="3" y1="12" x2="5" y2="15"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14.5" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="17"/><line x1="21" y1="12" x2="19" y2="15"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="#000"/></svg>';
                eye.title = c.visible === false ? "Hidden" : "Visible";
                eye.addEventListener("click", function (e) {
                    e.stopPropagation();
                    components[idx].visible = !(components[idx].visible !== false);
                    renderCanvas();
                    renderPlacedList();
                });
                li.appendChild(eye);
                var lock = document.createElement("button");
                lock.className = "lock-btn" + (c.locked ? " on" : "");
                lock.innerHTML = c.locked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0" /></svg>';
                lock.title = c.locked ? "Locked" : "Unlocked";
                lock.addEventListener("click", function (e) {
                    e.stopPropagation();
                    components[idx].locked = !components[idx].locked;
                    renderCanvas();
                    renderPlacedList();
                });
                li.appendChild(lock);
            }
            var del = document.createElement("button");
            del.className = "delete-btn";
            del.textContent = "×";
            del.addEventListener("click", function (e) {
                e.stopPropagation();
                components.splice(idx, 1);
                if (selectedIdx === idx) selectedIdx = -1;
                else if (selectedIdx > idx) selectedIdx--;
                renderCanvas();
                renderPlacedList();
            });
            li.appendChild(del);
            li.addEventListener("click", function (e) {
                if (e.ctrlKey || e.metaKey) {
                    /* Ctrl+click: toggle this item in multi-select */
                    if (selectedIdx >= 0 && selectedSet.indexOf(selectedIdx) === -1) {
                        selectedSet.push(selectedIdx);
                    }
                    selectedIdx = -1;
                    var pos = selectedSet.indexOf(idx);
                    if (pos >= 0) {
                        selectedSet.splice(pos, 1);
                    } else {
                        selectedSet.push(idx);
                    }
                } else {
                    selectedIdx = idx;
                    selectedSet = [];
                }
                renderCanvas();
                renderPlacedList();
                updateGroupToolbar();
            });
            addHoverHandlers(li, idx);
            list.appendChild(li);
        });

        /* Sidebar group/ungroup toolbar */
        if (selectedSet.length >= 2) {
            var allUngrouped = selectedSet.every(function (i) { return !components[i].groupId; });
            var gids = [];
            selectedSet.forEach(function (i) {
                var g = components[i] && components[i].groupId;
                if (g && gids.indexOf(g) === -1) gids.push(g);
            });
            var allSameGroup = gids.length === 1 && selectedSet.every(function (i) { return components[i].groupId === gids[0]; });

            if (allUngrouped || allSameGroup) {
                var bar = document.createElement("div");
                bar.style.cssText = "display:flex;gap:4px;padding:6px 0;";
                if (allUngrouped) {
                    var bg = document.createElement("button");
                    bg.className = "btn";
                    bg.textContent = "Group";
                    bg.addEventListener("click", doGroup);
                    bar.appendChild(bg);
                }
                if (allSameGroup) {
                    var bu = document.createElement("button");
                    bu.className = "btn";
                    bu.textContent = "Ungroup";
                    bu.addEventListener("click", doUngroup);
                    bar.appendChild(bu);
                }
                list.appendChild(bar);
            }
        }
    }

    function addHoverHandlers(li, idx) {
        li.addEventListener("mouseenter", function () {
            var pathEl = document.querySelector('#component-preview svg path[data-comp-index="' + idx + '"]');
            if (pathEl) {
                pathEl.dataset.origStroke = pathEl.getAttribute("stroke");
                pathEl.dataset.origWidth = pathEl.getAttribute("stroke-width") || "";
                pathEl.setAttribute("stroke", "#09f");
                pathEl.setAttribute("stroke-width", "1");
            }
        });
        li.addEventListener("mouseleave", function () {
            var pathEl = document.querySelector('#component-preview svg path[data-comp-index="' + idx + '"]');
            if (pathEl) {
                pathEl.setAttribute("stroke", pathEl.dataset.origStroke || "none");
                if (pathEl.dataset.origWidth) pathEl.setAttribute("stroke-width", pathEl.dataset.origWidth);
                else pathEl.removeAttribute("stroke-width");
            }
        });
    }

    /* ===== Canvas Rendering ===== */
    function renderCanvas() {
        var preview = document.getElementById("component-preview");
        if (!preview || !compTpl) return;
        var fitBtn = preview.querySelector(".btn-fit");
        preview.innerHTML = "";
        if (fitBtn) preview.appendChild(fitBtn);

        var rect = preview.getBoundingClientRect();
        sc = Math.min((rect.width - 20) / compTpl.width, (rect.height - 20) / compTpl.height, 6);

        var canvas = document.createElement("div");
        canvas.className = "label-canvas";
        canvas.style.width = (compTpl.width * sc) + "px";
        canvas.style.height = (compTpl.height * sc) + "px";

        /* Draw partition outlines as reference */
        getPagePartitions().forEach(function (p) {
            var el = document.createElement("div");
            el.className = "partition-ref";
            el.style.left = (p.x * sc) + "px";
            el.style.top = (p.y * sc) + "px";
            el.style.width = (p.w * sc) + "px";
            el.style.height = (p.h * sc) + "px";
            var lbl = document.createElement("div");
            lbl.className = "canvas-label";
            lbl.style.position = "relative";
            lbl.style.left = "2px";
            lbl.style.top = "2px";
            lbl.style.color = "#aaa";
            lbl.textContent = p.label;
            el.appendChild(lbl);
            canvas.appendChild(el);
        });

        /* Single SVG layer for all pdfpath components (preserves draw order) */
        var pdfPaths = getPageComponents().filter(function (c) { return c.type === "pdfpath"; });
        if (pdfPaths.length) {
            var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.style.position = "absolute";
            svg.style.left = "0"; svg.style.top = "0";
            svg.style.width = (compTpl.width * sc) + "px";
            svg.style.height = (compTpl.height * sc) + "px";
            svg.style.zIndex = "1";
            svg.setAttribute("viewBox", "0 0 " + compTpl.width + " " + compTpl.height);
            function r(v) { return +v.toFixed(3); }

            pdfPaths.forEach(function (c) {
                var idx = components.indexOf(c);
                var d = "";
                c.pathData.ops.forEach(function (op) {
                    var a = op.a;
                    if (op.o === "M") d += " M" + r(a[0]) + " " + r(a[1]);
                    else if (op.o === "L") d += " L" + r(a[0]) + " " + r(a[1]);
                    else if (op.o === "C") d += " C" + r(a[0]) + " " + r(a[1]) + " " + r(a[2]) + " " + r(a[3]) + " " + r(a[4]) + " " + r(a[5]);
                    else if (op.o === "Z") d += "Z";
                });
                var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute("d", d);
                var fl = c.pathData.fill;
                var sl = c.pathData.stroke;
                pathEl.setAttribute("fill", fl ? "rgb("+Math.round(fl[0]*255)+","+Math.round(fl[1]*255)+","+Math.round(fl[2]*255)+")" : "none");
                pathEl.setAttribute("stroke", sl ? "rgb("+Math.round(sl[0]*255)+","+Math.round(sl[1]*255)+","+Math.round(sl[2]*255)+")" : "none");
                if (sl) pathEl.setAttribute("stroke-width", String(r(c.pathData.lw || 0.3)));
                pathEl.setAttribute("stroke-linecap", "round");
                pathEl.setAttribute("stroke-linejoin", "round");
                pathEl.style.cursor = c.locked ? "not-allowed" : "pointer";
                if (c.visible === false) pathEl.style.opacity = "0.15";
                if (idx === selectedIdx || selectedSet.indexOf(idx) >= 0) {
                    pathEl.setAttribute("filter", "url(#sel-outline)");
                }
                pathEl.dataset.compIndex = String(idx);
                pathEl.addEventListener("mousedown", function (e) {
                    e.stopPropagation();
                    var clickedComp = components[idx];
                    if (clickedComp.locked) return;
                    if (clickedComp && clickedComp.groupId) {
                        /* Select entire group */
                        selectGroup(clickedComp.groupId);
                        renderPlacedList();
                        updateGroupToolbar();
                    } else {
                        selectedIdx = idx;
                        selectedSet = [];
                        renderCanvas();
                        renderPlacedList();
                        updateGroupToolbar();
                    }
                });
                svg.appendChild(pathEl);
            });

            /* Selection highlight filter */
            var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            var filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
            filter.setAttribute("id", "sel-outline");
            filter.setAttribute("x", "-10%"); filter.setAttribute("y", "-10%");
            filter.setAttribute("width", "120%"); filter.setAttribute("height", "120%");
            var morph = document.createElementNS("http://www.w3.org/2000/svg", "feMorphology");
            morph.setAttribute("in", "SourceAlpha"); morph.setAttribute("operator", "dilate");
            morph.setAttribute("radius", "0.5"); morph.setAttribute("result", "expanded");
            var flood = document.createElementNS("http://www.w3.org/2000/svg", "feFlood");
            flood.setAttribute("flood-color", "#0099ff"); flood.setAttribute("result", "color");
            var comp = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
            comp.setAttribute("in", "color"); comp.setAttribute("in2", "expanded"); comp.setAttribute("operator", "in"); comp.setAttribute("result", "outline");
            var merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
            var mn1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
            mn1.setAttribute("in", "outline");
            var mn2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
            mn2.setAttribute("in", "SourceGraphic");
            merge.appendChild(mn1); merge.appendChild(mn2);
            filter.appendChild(morph); filter.appendChild(flood); filter.appendChild(comp); filter.appendChild(merge);
            defs.appendChild(filter);
            svg.insertBefore(defs, svg.firstChild);

            canvas.appendChild(svg);
        }

        /* Draw non-pdfpath components */
        getPageComponents().forEach(function (c) {
            if (c.type === "pdfpath") return;
            var idx = components.indexOf(c);
            var el = document.createElement("div");
            el.className = "canvas-component" + (idx === selectedIdx ? " selected" : "");
            el.style.left = (c.x * sc) + "px";
            el.style.top = (c.y * sc) + "px";
            el.style.width = (c.w * sc) + "px";
            el.style.height = (c.h * sc) + "px";
            el.dataset.compIndex = String(idx);
            el.style.zIndex = "2";

            var content = document.createElement("div");
            content.className = "comp-content";

            if (c.type === "text" || c.type === "paragraph") {
                content.style.fontSize = Math.max(6, c.fontSize * 0.3528 * sc) + "px";
                content.style.fontFamily = c.fontFamily || "Arial";
                content.style.padding = (1 * sc) + "px";
                content.style.whiteSpace = c.type === "text" ? "nowrap" : "normal";
                content.style.lineHeight = "1.3";
                content.textContent = c.content || "";
            } else if (c.type === "barcode") {
                var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.style.width = "100%";
                svg.style.height = "100%";
                content.appendChild(svg);
                (function (s, val) {
                    requestAnimationFrame(function () {
                        try { JsBarcode(s, val || "123456", { width: 1, height: Math.max(10, c.h * sc * 0.6), displayValue: false, margin: 0 }); }
                        catch (e) { s.parentNode.textContent = "[barcode]"; }
                    });
                })(svg, c.content);
            } else if (c.type === "qrcode") {
                var qrDiv = document.createElement("div");
                content.appendChild(qrDiv);
                (function (d, val) {
                    requestAnimationFrame(function () {
                        try {
                            var size = Math.min(c.w, c.h) * sc;
                            new QRCode(d, { text: val || "https://example.com", width: size, height: size, colorDark: "#000", colorLight: "#fff" });
                        } catch (e) { d.textContent = "[qr]"; }
                    });
                })(qrDiv, c.content);
            } else if (c.type === "image" && c.dataUri) {
                var img = document.createElement("img");
                img.src = c.dataUri;
                content.appendChild(img);
            }

            el.appendChild(content);

            /* Resize handle */
            if (idx === selectedIdx) {
                var handle = document.createElement("div");
                handle.className = "resize-handle";
                handle.addEventListener("mousedown", function (e) {
                    e.stopPropagation();
                    var startX = e.clientX, startY = e.clientY;
                    var origW = c.w, origH = c.h;
                    var esc = sc * pan.zoom;
                    function onMove(ev) {
                        c.w = Math.max(2, origW + (ev.clientX - startX) / esc);
                        c.h = Math.max(2, origH + (ev.clientY - startY) / esc);
                        renderCanvas();
                    }
                    function onUp() {
                        document.removeEventListener("mousemove", onMove);
                        document.removeEventListener("mouseup", onUp);
                    }
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                });
                el.appendChild(handle);
            }

            /* Click to select */
            el.addEventListener("mousedown", function (e) {
                if (editingIdx >= 0) return;
                e.stopPropagation();
                if (selectedIdx !== idx) {
                    selectedIdx = idx;
                    renderCanvas();
                    return;
                }
                /* Start move drag */
                dragState = {
                    idx: idx, startX: e.clientX, startY: e.clientY,
                    origX: c.x, origY: c.y
                };
            });

            /* Double-click to edit */
            el.addEventListener("dblclick", function (e) {
                e.stopPropagation();
                startEditing(idx);
            });

            canvas.appendChild(el);
        });

        /* Click canvas to deselect */
        canvas.addEventListener("mousedown", function (e) {
            if (e.target === canvas) {
                selectedIdx = -1;
                renderCanvas();
            }
        });

        var wrap = document.createElement("div");
        wrap.className = "preview-wrap";
        wrap.appendChild(canvas);
        wrap.style.transform = "translate(" + pan.x + "px," + pan.y + "px) scale(" + pan.zoom + ")";
        preview.appendChild(wrap);
        renderPlacedList();
    }

    function onMoveDrag(e) {
        if (!dragState) return;
        var esc = sc * pan.zoom;
        var c = components[dragState.idx];
        if (c.locked) return;
        c.x = dragState.origX + (e.clientX - dragState.startX) / esc;
        c.y = dragState.origY + (e.clientY - dragState.startY) / esc;
        clampToPartition(c);
        renderCanvas();
    }

    function onMoveDragEnd() {
        dragState = null;
    }

    /* ===== Inline Editing ===== */
    function startEditing(idx) {
        editingIdx = idx;
        var c = components[idx];
        var el = document.querySelector('.canvas-component[data-comp-index="' + idx + '"]');
        if (!el) return;
        var contentDiv = el.querySelector(".comp-content");
        contentDiv.innerHTML = "";

        var input;
        if (c.type === "paragraph") {
            input = document.createElement("textarea");
            input.style.resize = "none";
        } else {
            input = document.createElement("input");
            input.type = "text";
        }
        input.value = c.content || "";
        input.className = "comp-edit-input";
        contentDiv.appendChild(input);
        input.focus();
        input.select();

        function finish() {
            c.content = input.value;
            editingIdx = -1;
            renderCanvas();
        }
        input.addEventListener("blur", finish);
        if (c.type !== "paragraph") {
            input.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter") { ev.preventDefault(); finish(); }
            });
        }
    }

    /* ===== PDF Vector Extraction ===== */
    function mulMat(a, b) {
        return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
                a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
    }
    function txPt(m, x, y) { return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]; }
    function pt2mm(px, py, pdfH) { return [px/72*25.4, pdfH - py/72*25.4]; }

    function extractPdfObjects(page, pdfW, pdfH) {
        var OPS = pdfjsLib.OPS;
        return page.getOperatorList().then(function (opList) {
            var objects = [];
            var path = [];
            var stack = [];
            var st = { ctm: [1,0,0,1,0,0], fill: [0,0,0], stroke: [0,0,0], lw: 1 };
            /* PDF.js may return RGB in 0-255; normalize to 0-1 */
            function nc(arr) { var mx=Math.max(arr[0],arr[1],arr[2]); return mx>1?[arr[0]/255,arr[1]/255,arr[2]/255]:arr; }

            function snap() { return { ctm:st.ctm.slice(), fill:st.fill.slice(), stroke:st.stroke.slice(), lw:st.lw }; }

            function addPathPt(x, y) {
                var p = txPt(st.ctm, x, y);
                var mm = pt2mm(p[0], p[1], pdfH);
                return mm;
            }

            function finishPath(doFill, doStroke) {
                if (!path.length) return;
                var minX=1e9, minY=1e9, maxX=-1e9, maxY=-1e9;
                path.forEach(function (op) {
                    for (var i = 0; i < op.a.length; i += 2) {
                        var px = op.a[i], py = op.a[i+1];
                        if (px < minX) minX = px; if (px > maxX) maxX = px;
                        if (py < minY) minY = py; if (py > maxY) maxY = py;
                    }
                });
                if (maxX - minX < 0.1) maxX = minX + 0.5;
                if (maxY - minY < 0.1) maxY = minY + 0.5;
                objects.push({
                    ops: path.slice(), fill: doFill ? st.fill.slice() : null,
                    stroke: doStroke ? st.stroke.slice() : null, lw: st.lw / 72 * 25.4,
                    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
                });
                path = [];
            }

            for (var i = 0; i < opList.fnArray.length; i++) {
                var fn = opList.fnArray[i], args = opList.argsArray[i];
                if (fn === OPS.save) { stack.push(snap()); }
                else if (fn === OPS.restore) { if (stack.length) st = stack.pop(); }
                else if (fn === OPS.transform) { st.ctm = mulMat(st.ctm, args); }
                else if (fn === OPS.paintFormXObjectBegin) {
                    stack.push(snap());
                    if (args && args[0] && args[0].length === 6) st.ctm = mulMat(st.ctm, args[0]);
                }
                else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) st = stack.pop(); }
                else if (fn === OPS.setLineWidth) { st.lw = args[0]; }
                else if (fn === OPS.setStrokeRGBColor) { st.stroke = nc([args[0], args[1], args[2]]); }
                else if (fn === OPS.setFillRGBColor) { st.fill = nc([args[0], args[1], args[2]]); }
                else if (fn === OPS.setStrokeGray) { var g=args[0]>1?args[0]/255:args[0]; st.stroke = [g, g, g]; }
                else if (fn === OPS.setFillGray) { var g=args[0]>1?args[0]/255:args[0]; st.fill = [g, g, g]; }
                else if (fn === OPS.setStrokeCMYKColor) {
                    var c=args[0],m=args[1],y2=args[2],k=args[3];
                    st.stroke = [(1-c)*(1-k), (1-m)*(1-k), (1-y2)*(1-k)];
                } else if (fn === OPS.setFillCMYKColor) {
                    var c=args[0],m=args[1],y2=args[2],k=args[3];
                    st.fill = [(1-c)*(1-k), (1-m)*(1-k), (1-y2)*(1-k)];
                }
                else if (fn === OPS.constructPath) {
                    var subOps = args[0], coords = args[1], ci = 0;
                    for (var j = 0; j < subOps.length; j++) {
                        var so = subOps[j];
                        if (so === OPS.moveTo) { var p=addPathPt(coords[ci],coords[ci+1]); path.push({o:"M",a:p}); ci+=2; }
                        else if (so === OPS.lineTo) { var p=addPathPt(coords[ci],coords[ci+1]); path.push({o:"L",a:p}); ci+=2; }
                        else if (so === OPS.curveTo) {
                            var p1=addPathPt(coords[ci],coords[ci+1]), p2=addPathPt(coords[ci+2],coords[ci+3]), p3=addPathPt(coords[ci+4],coords[ci+5]);
                            path.push({o:"C",a:[p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]]}); ci+=6;
                        } else if (so === OPS.rectangle) {
                            var x0=coords[ci],y0=coords[ci+1],rw=coords[ci+2],rh=coords[ci+3];
                            var p1=addPathPt(x0,y0), p2=addPathPt(x0+rw,y0), p3=addPathPt(x0+rw,y0+rh), p4=addPathPt(x0,y0+rh);
                            path.push({o:"M",a:p1},{o:"L",a:p2},{o:"L",a:p3},{o:"L",a:p4},{o:"Z",a:[]}); ci+=4;
                        } else if (so === OPS.closePath) { path.push({o:"Z",a:[]}); }
                    }
                }
                else if (fn === OPS.moveTo) { var p=addPathPt(args[0],args[1]); path.push({o:"M",a:p}); }
                else if (fn === OPS.lineTo) { var p=addPathPt(args[0],args[1]); path.push({o:"L",a:p}); }
                else if (fn === OPS.curveTo) {
                    var p1=addPathPt(args[0],args[1]),p2=addPathPt(args[2],args[3]),p3=addPathPt(args[4],args[5]);
                    path.push({o:"C",a:[p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]]});
                }
                else if (fn === OPS.closePath) { path.push({o:"Z",a:[]}); }
                else if (fn === OPS.stroke || fn === OPS.closeStroke) { finishPath(false, true); }
                else if (fn === OPS.fill || fn === OPS.eoFill) { finishPath(true, false); }
                else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEoFillStroke) { finishPath(true, true); }
                else if (fn === OPS.endPath) { path = []; }
            }
            return objects;
        });
    }

    /* Group nearby PDF objects with same fill/stroke into compound paths */
    function groupPdfObjects(objects, gap) {
        if (!gap) gap = 1.5; /* mm proximity threshold */
        /* Color key for grouping by visual style */
        function colorKey(obj) {
            var f = obj.fill ? obj.fill.map(function(v){return Math.round(v*100)}).join(",") : "n";
            var s = obj.stroke ? obj.stroke.map(function(v){return Math.round(v*100)}).join(",") : "n";
            return f + "|" + s;
        }
        /* Union-Find */
        var parent = [];
        for (var i = 0; i < objects.length; i++) parent[i] = i;
        function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
        function unite(a, b) { parent[find(a)] = find(b); }

        /* Merge objects with same color whose bboxes overlap or are within gap */
        for (var i = 0; i < objects.length; i++) {
            var ki = colorKey(objects[i]), bi = objects[i].bbox;
            for (var j = i + 1; j < objects.length; j++) {
                if (colorKey(objects[j]) !== ki) continue;
                var bj = objects[j].bbox;
                if (bi.x - gap <= bj.x + bj.w && bi.x + bi.w + gap >= bj.x &&
                    bi.y - gap <= bj.y + bj.h && bi.y + bi.h + gap >= bj.y) {
                    unite(i, j);
                }
            }
        }

        /* Collect groups */
        var groups = {};
        for (var i = 0; i < objects.length; i++) {
            var root = find(i);
            if (!groups[root]) groups[root] = [];
            groups[root].push(objects[i]);
        }

        /* Merge each group into one compound object */
        var result = [];
        Object.keys(groups).forEach(function (k) {
            var g = groups[k];
            var allOps = [];
            var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
            g.forEach(function (obj) {
                allOps = allOps.concat(obj.ops);
                if (obj.bbox.x < minX) minX = obj.bbox.x;
                if (obj.bbox.y < minY) minY = obj.bbox.y;
                if (obj.bbox.x + obj.bbox.w > maxX) maxX = obj.bbox.x + obj.bbox.w;
                if (obj.bbox.y + obj.bbox.h > maxY) maxY = obj.bbox.y + obj.bbox.h;
            });
            result.push({
                ops: allOps, fill: g[0].fill, stroke: g[0].stroke, lw: g[0].lw,
                bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
            });
        });
        return result;
    }

    /* ===== PDF Parsing ===== */
    function parsePdfFile(file) {
        if (typeof pdfjsLib === "undefined") {
            App.showToast("PDF.js not loaded", true);
            return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
            var data = new Uint8Array(e.target.result);
            pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
                return pdf.getPage(1);
            }).then(function (page) {
                var vp = page.getViewport({ scale: 1 });
                var pdfW = vp.width / 72 * 25.4;
                var pdfH = vp.height / 72 * 25.4;

                compTpl = { id: null, name: file.name.replace(/\.pdf$/i, ""), width: pdfW, height: pdfH, partitions: [] };
                pdfFileName = compTpl.name;
                compPage = 0;
                components = [];
                savedComponents = [];
                selectedIdx = -1;
                pan.x = 0; pan.y = 0; pan.zoom = 1;

                return Promise.all([
                    extractPdfObjects(page, pdfW, pdfH),
                    page.getTextContent()
                ]).then(function (results) {
                    var pdfObjs = groupPdfObjects(results[0]);
                    var textContent = results[1];

                    /* Vector paths (outlined text + shapes) */
                    pdfObjs.forEach(function (obj) {
                        components.push({
                            page: 0, partitionLabel: "", type: "pdfpath", content: "",
                            x: obj.bbox.x, y: obj.bbox.y, w: obj.bbox.w, h: obj.bbox.h,
                            pathData: { ops: obj.ops, fill: obj.fill, stroke: obj.stroke, lw: obj.lw }
                        });
                    });

                    /* Non-outlined text: only add if characters are readable */
                    var textCount = 0;
                    textContent.items.forEach(function (item) {
                        if (!item.str || !item.str.trim()) return;
                        /* Skip garbled text from outlined fonts (private-use / replacement chars) */
                        var readable = item.str.replace(/[\x00-\x1f\ufffd]/g, "");
                        var printable = readable.replace(/[^\x20-\x7e\u00a0-\u024f\u0400-\u04ff\u4e00-\u9fff\u3000-\u30ff\uac00-\ud7af]/g, "");
                        if (printable.length < readable.length * 0.5) return;

                        var tx = item.transform;
                        var xMm = tx[4] / 72 * 25.4;
                        var yMm = pdfH - (tx[5] / 72 * 25.4);
                        var fontSize = Math.abs(tx[0]) / 72 * 25.4 / 0.3528;
                        var wMm = (item.width || 0) / 72 * 25.4;
                        var hMm = fontSize * 0.3528 * 1.3;
                        components.push({
                            page: 0, partitionLabel: "", type: "text", content: item.str,
                            x: xMm, y: yMm, w: Math.max(wMm, 10), h: Math.max(hMm, 3),
                            fontFamily: "Arial", fontSize: Math.round(fontSize) || 8
                        });
                        textCount++;
                    });

                    savedComponents = JSON.parse(JSON.stringify(components));
                    App.showToast("Imported " + pdfObjs.length + " paths" + (textCount ? ", " + textCount + " text" : ""));
                    renderPageTabs();
                    renderCanvas();
                });
            }).catch(function (err) {
                App.showToast("PDF parse error: " + err.message, true);
            });
        };
        reader.readAsArrayBuffer(file);
    }

    /* ===== Pan / Zoom ===== */
    function initPanZoom() {
        var preview = document.getElementById("component-preview");
        if (!preview) return;

        document.addEventListener("keydown", function (e) {
            if (e.code === "Space" && !pan.spaceDown && document.getElementById("subtab-tpl-component").offsetParent) {
                pan.spaceDown = true;
                preview.classList.add("pan-ready");
                e.preventDefault();
            }
            /* Delete key */
            if ((e.key === "Delete" || e.key === "Backspace") && editingIdx < 0 &&
                document.getElementById("subtab-tpl-component").offsetParent) {
                e.preventDefault();
                if (selectedSet.length > 0) {
                    /* Delete multi-selected components (reverse order to keep indices valid) */
                    selectedSet.sort(function (a, b) { return b - a; });
                    selectedSet.forEach(function (i) { components.splice(i, 1); });
                    selectedSet = [];
                    selectedIdx = -1;
                    renderCanvas();
                } else if (selectedIdx >= 0) {
                    components.splice(selectedIdx, 1);
                    selectedIdx = -1;
                    renderCanvas();
                }
            }
        });
        document.addEventListener("keyup", function (e) {
            if (e.code === "Space") { pan.spaceDown = false; preview.classList.remove("pan-ready"); }
        });

        preview.addEventListener("mousedown", function (e) {
            if (!pan.spaceDown) return;
            pan.dragging = true;
            pan.startX = e.clientX; pan.startY = e.clientY;
            pan.origX = pan.x; pan.origY = pan.y;
            preview.classList.add("panning");
            e.preventDefault();
        });
        document.addEventListener("mousemove", function (e) {
            if (!pan.dragging) return;
            pan.x = pan.origX + (e.clientX - pan.startX);
            pan.y = pan.origY + (e.clientY - pan.startY);
            var wrap = preview.querySelector(".preview-wrap");
            if (wrap) wrap.style.transform = "translate(" + pan.x + "px," + pan.y + "px) scale(" + pan.zoom + ")";
        });
        document.addEventListener("mouseup", function () {
            if (pan.dragging) { pan.dragging = false; preview.classList.remove("panning"); }
        });

        preview.addEventListener("wheel", function (e) {
            if (!compTpl) return;
            e.preventDefault();
            var delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            pan.zoom = Math.min(Math.max(pan.zoom * delta, 0.2), 10);
            var wrap = preview.querySelector(".preview-wrap");
            if (wrap) wrap.style.transform = "translate(" + pan.x + "px," + pan.y + "px) scale(" + pan.zoom + ")";
        }, { passive: false });

        /* Rubber-band selection for pdfpath */
        preview.addEventListener("mousedown", function (e) {
            if (pan.spaceDown || e.button !== 0) return;
            var canvasEl = preview.querySelector(".label-canvas");
            if (!canvasEl || !compTpl) return;
            var cr = canvasEl.getBoundingClientRect();
            var esc = sc * pan.zoom;
            var mx = (e.clientX - cr.left) / esc;
            var my = (e.clientY - cr.top) / esc;
            if (mx < 0 || my < 0 || mx > compTpl.width || my > compTpl.height) return;
            rubberBand = { startX: mx, startY: my, curX: mx, curY: my, el: null };
            selectedSet = [];
            selectedIdx = -1;
        });
        document.addEventListener("mousemove", function (e) {
            if (!rubberBand || pan.dragging) return;
            var canvasEl = preview.querySelector(".label-canvas");
            if (!canvasEl) return;
            var cr = canvasEl.getBoundingClientRect();
            var esc = sc * pan.zoom;
            rubberBand.curX = (e.clientX - cr.left) / esc;
            rubberBand.curY = (e.clientY - cr.top) / esc;
            /* Draw/update rubber-band rectangle */
            if (!rubberBand.el) {
                rubberBand.el = document.createElement("div");
                rubberBand.el.className = "rubber-band";
                canvasEl.appendChild(rubberBand.el);
            }
            var rx = Math.min(rubberBand.startX, rubberBand.curX) * sc;
            var ry = Math.min(rubberBand.startY, rubberBand.curY) * sc;
            var rw = Math.abs(rubberBand.curX - rubberBand.startX) * sc;
            var rh = Math.abs(rubberBand.curY - rubberBand.startY) * sc;
            rubberBand.el.style.left = rx + "px";
            rubberBand.el.style.top = ry + "px";
            rubberBand.el.style.width = rw + "px";
            rubberBand.el.style.height = rh + "px";
        });
        document.addEventListener("mouseup", function () {
            if (!rubberBand) return;
            var sx = Math.min(rubberBand.startX, rubberBand.curX);
            var sy = Math.min(rubberBand.startY, rubberBand.curY);
            var ex = Math.max(rubberBand.startX, rubberBand.curX);
            var ey = Math.max(rubberBand.startY, rubberBand.curY);
            if (rubberBand.el) rubberBand.el.remove();
            /* Only select if dragged more than 2mm */
            if (ex - sx > 2 || ey - sy > 2) {
                selectedSet = [];
                components.forEach(function (c, i) {
                    if (c.type !== "pdfpath") return;
                    if (c.locked) return;
                    /* Check bbox intersection */
                    if (c.x + c.w >= sx && c.x <= ex && c.y + c.h >= sy && c.y <= ey) {
                        selectedSet.push(i);
                    }
                });
                selectedIdx = -1;
                renderCanvas();
                renderPlacedList();
                updateGroupToolbar();
            }
            rubberBand = null;
        });

        var fitBtn = document.getElementById("btn-comp-fit");
        if (fitBtn) fitBtn.addEventListener("click", function () {
            pan.x = 0; pan.y = 0; pan.zoom = 1;
            renderCanvas();
        });
    }

    /* ===== Template Selection ===== */
    function loadTemplate(tplId) {
        var tpl = null;
        App.store.templates.forEach(function (t) { if (t.id === tplId) tpl = t; });
        if (!tpl) return;
        compTpl = tpl;
        compPage = 0;
        components = (tpl.components || []).map(function (c) {
            var comp = {
                page: c.page || 0, partitionLabel: c.partition_label || c.partitionLabel || "",
                type: c.type, content: c.content || "",
                x: c.x, y: c.y, w: c.w, h: c.h,
                fontFamily: c.font_family || c.fontFamily || "Arial",
                fontSize: c.font_size || c.fontSize || 8,
                dataUri: c.dataUri || "",
                groupId: c.group_id || c.groupId || null,
                visible: c.visible !== false && c.visible !== 0,
                locked: !!(c.locked)
            };
            if (c.type === "pdfpath" && (c.path_data || c.pathData)) {
                comp.pathData = typeof c.path_data === "string" ? JSON.parse(c.path_data) : (c.path_data || c.pathData);
            }
            return comp;
        });
        savedComponents = JSON.parse(JSON.stringify(components));
        selectedIdx = -1;
        selectedSet = [];
        pan.x = 0; pan.y = 0; pan.zoom = 1;

        /* Populate customer and template name fields */
        var custSelect = document.getElementById("comp-customer");
        var nameInput = document.getElementById("comp-tpl-name");
        if (custSelect && tpl.customerId) {
            custSelect.value = tpl.customerId;
        }
        if (nameInput && tpl.name) {
            nameInput.value = tpl.name;
        }

        renderPageTabs();
        renderCanvas();
    }

    /* ===== Save / Reset ===== */
    function saveComponents() {
        console.log("saveComponents called, compTpl:", compTpl, "components.length:", components.length);
        if (!compTpl) {
            App.showToast("Load a PDF first", true);
            return;
        }
        if (components.length === 0) {
            App.showToast("Nothing to save - canvas is empty", true);
            return;
        }

        var compPayload = {
            components: components.map(function (c) {
                var obj = {
                    page: c.page, partitionLabel: c.partitionLabel,
                    type: c.type, content: c.content,
                    x: c.x, y: c.y, w: c.w, h: c.h,
                    fontFamily: c.fontFamily, fontSize: c.fontSize,
                    groupId: c.groupId || null,
                    visible: c.visible !== false && c.visible !== 0,
                    locked: !!c.locked
                };
                if (c.type === "pdfpath" && c.pathData) obj.pathData = c.pathData;
                return obj;
            })
        };

        if (compTpl.id) {
            /* Existing template — save components directly */
            App.api("PUT", "/api/templates/" + compTpl.id + "/components", compPayload).then(function () {
                savedComponents = JSON.parse(JSON.stringify(components));
                App.showToast("Components saved");
            }).catch(function (err) {
                App.showToast("Save failed: " + err.message, true);
            });
        } else {
            /* PDF import — create template first, then save components */
            var custId = document.getElementById("comp-customer").value;
            var name = (document.getElementById("comp-tpl-name").value || "").trim();
            if (!custId) { App.showToast("Select a customer", true); return; }
            if (!name) { App.showToast("Enter a template name", true); return; }
            var w = compTpl.width, h = compTpl.height;
            var tplPayload = {
                customerId: custId, name: name,
                width: w, height: h,
                orientation: h >= w ? "vertical" : "horizontal",
                padding: { top: 0, bottom: 0, left: 0, right: 0 },
                sewing: { position: "none", distance: 0, padding: 0 },
                folding: { type: "none", padding: 0 },
                printingArea: { x: 0, y: 0, w: w, h: h },
                source: "pdf"
            };
            App.api("POST", "/api/templates", tplPayload).then(function (saved) {
                compTpl.id = saved.id;
                App.store.templates.push(saved);
                return App.api("PUT", "/api/templates/" + saved.id + "/components", compPayload);
            }).then(function () {
                savedComponents = JSON.parse(JSON.stringify(components));
                App.showToast("Template and components saved");
                if (App.renderTemplateTable) App.renderTemplateTable();
            }).catch(function (err) {
                App.showToast("Save failed: " + err.message, true);
            });
        }
    }

    function resetComponents() {
        components = JSON.parse(JSON.stringify(savedComponents));
        selectedIdx = -1;
        renderCanvas();
        App.showToast("Components reset");
    }

    /* ===== Export ===== */
    function exportFile(url, body, filename) {
        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }).then(function (r) {
            if (!r.ok) throw new Error("Export failed");
            return r.blob();
        }).then(function (blob) {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }).catch(function (err) {
            App.showToast(err.message, true);
        });
    }

    function buildExportData(outlined) {
        var data = {
            label: { width: compTpl.width, height: compTpl.height },
            components: components.map(function (c) {
                var obj = {
                    type: c.type, content: c.content,
                    x: c.x, y: c.y, width: c.w, height: c.h,
                    fontFamily: c.fontFamily, fontSize: c.fontSize,
                    page: c.page
                };
                if (c.type === "pdfpath" && c.pathData) {
                    obj.pathData = c.pathData;
                    obj.visible = c.visible !== false;
                }
                return obj;
            }),
            outlined: !!outlined
        };
        return data;
    }

    /* ===== Init ===== */
    function init() {
        initPanZoom();

        /* Move drag — document-level, set up once */
        document.addEventListener("mousemove", onMoveDrag);
        document.addEventListener("mouseup", onMoveDragEnd);

        /* Drag-and-drop on persistent preview container */
        var preview = document.getElementById("component-preview");
        preview.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        preview.addEventListener("drop", function (e) {
            e.preventDefault();

            /* PDF file drop */
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                var file = e.dataTransfer.files[0];
                if (file.name.toLowerCase().endsWith(".pdf")) {
                    parsePdfFile(file);
                    return;
                }
            }

            /* Component type drop from sidebar */
            var type = e.dataTransfer.getData("text/plain");
            if (!type || !compTpl) return;

            var canvasEl = preview.querySelector(".label-canvas");
            if (!canvasEl) return;
            var cr = canvasEl.getBoundingClientRect();
            var esc = sc * pan.zoom;
            var xMm = (e.clientX - cr.left) / esc;
            var yMm = (e.clientY - cr.top) / esc;

            var part = findPartitionAt(xMm, yMm);

            var defaults = { text: { w: 20, h: 5 }, paragraph: { w: 30, h: 15 }, barcode: { w: 25, h: 10 }, qrcode: { w: 12, h: 12 } };
            var d = defaults[type] || { w: 20, h: 10 };
            var comp = {
                page: compPage, partitionLabel: part ? part.label : "", type: type,
                content: type === "barcode" ? "123456789" : type === "qrcode" ? "https://example.com" : "Text",
                x: part ? Math.max(part.x, Math.min(xMm - d.w / 2, part.x + part.w - d.w)) : Math.max(0, Math.min(xMm - d.w / 2, compTpl.width - d.w)),
                y: part ? Math.max(part.y, Math.min(yMm - d.h / 2, part.y + part.h - d.h)) : Math.max(0, Math.min(yMm - d.h / 2, compTpl.height - d.h)),
                w: d.w, h: d.h, fontFamily: "Arial", fontSize: 8
            };
            components.push(comp);
            selectedIdx = components.length - 1;
            renderCanvas();
        });

        /* Sidebar drag */
        document.querySelectorAll("#subtab-tpl-component .component-item").forEach(function (el) {
            el.addEventListener("dragstart", function (e) {
                e.dataTransfer.setData("text/plain", el.dataset.type);
                e.dataTransfer.effectAllowed = "copy";
            });
        });

        /* PDF file input */
        document.getElementById("comp-pdf-input").addEventListener("change", function () {
            if (this.files && this.files[0]) { parsePdfFile(this.files[0]); this.value = ""; }
        });

        /* Clear canvas */
        document.getElementById("btn-comp-clear").addEventListener("click", function () {
            compTpl = null; pdfFileName = "";
            components = []; savedComponents = []; selectedIdx = -1; selectedSet = [];
            compPage = 0; pan.x = 0; pan.y = 0; pan.zoom = 1;
            var preview = document.getElementById("component-preview");
            preview.innerHTML = '<button class="btn-fit" id="btn-comp-fit" title="Fit">⊡</button><div class="group-toolbar" id="group-toolbar" style="display:none"><button id="btn-group" class="btn">Group</button><button id="btn-ungroup" class="btn">Ungroup</button></div><div class="preview-hint">Select a template or load a PDF.</div>';
            document.getElementById("btn-comp-fit").addEventListener("click", function () { pan.x = 0; pan.y = 0; pan.zoom = 1; renderCanvas(); });
            document.getElementById("btn-group").addEventListener("click", doGroup);
            document.getElementById("btn-ungroup").addEventListener("click", doUngroup);
            renderPageTabs();
            renderPlacedList();
            updateGroupToolbar();
        });

        /* Group / Ungroup buttons */
        document.getElementById("btn-group").addEventListener("click", doGroup);
        document.getElementById("btn-ungroup").addEventListener("click", doUngroup);

        /* Save / Reset */
        var saveBtn = document.getElementById("btn-comp-save");
        console.log("btn-comp-save element:", saveBtn);
        if (saveBtn) {
            saveBtn.addEventListener("click", function() {
                console.log("Save button clicked!");
                saveComponents();
            });
        } else {
            console.error("btn-comp-save not found!");
        }
        document.getElementById("btn-comp-reset").addEventListener("click", function () {
            App.confirm("Reset all component changes?").then(function (ok) { if (ok) resetComponents(); });
        });

        /* Export buttons */
        document.getElementById("btn-export-pdf").addEventListener("click", function () {
            if (!compTpl) return;
            exportFile("/export/pdf", buildExportData(false), compTpl.name + ".pdf");
        });
        document.getElementById("btn-export-ai").addEventListener("click", function () {
            if (!compTpl) return;
            exportFile("/export/ai", buildExportData(false), compTpl.name + "_editable.ai");
        });
        document.getElementById("btn-export-ai-outlined").addEventListener("click", function () {
            if (!compTpl) return;
            exportFile("/export/ai", buildExportData(true), compTpl.name + "_outlined.ai");
        });
    }

    /* Expose for init.js */
    App.initComponentEditor = init;
    App.loadComponentTemplate = loadTemplate;
    App.renderComponentCanvas = renderCanvas;
})();
