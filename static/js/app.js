(function () {
    "use strict";

    /* ===== In-Memory Data Store (loaded from DB) ===== */
    var store = {
        customers: [],
        suppliers: [],
        templates: []
    };

    function api(method, url, body) {
        var opts = { method: method, headers: { "Content-Type": "application/json" } };
        if (body) opts.body = JSON.stringify(body);
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error("API error " + r.status);
            return r.json();
        });
    }

    /* ===== Section / Tab / Sub-tab Navigation ===== */
    var navItems = document.querySelectorAll(".nav-item");
    var sections = document.querySelectorAll(".section-panel");
    var workspaceBar = document.getElementById("workspace-tabs");

    // Wire up permanent Welcome tab
    var welcomeTab = workspaceBar.querySelector('.workspace-tab[data-section="welcome"]');
    if (welcomeTab) {
        welcomeTab.addEventListener("click", function () { showSection("welcome"); });
    }

    var sectionLabels = {
        welcome: "Welcome", customer: "Customer", supplier: "Supplier", template: "Template",
        project: "Project", order: "Order", status: "Status"
    };

    function showSection(sectionId) {
        sections.forEach(function (s) { s.classList.remove("active"); });
        navItems.forEach(function (n) { n.classList.remove("active"); });
        var sec = document.getElementById("section-" + sectionId);
        if (sec) sec.classList.add("active");
        var nav = document.querySelector('.nav-item[data-section="' + sectionId + '"]');
        if (nav) nav.classList.add("active");

        // Add workspace tab if not already open
        var existing = workspaceBar.querySelector('.workspace-tab[data-section="' + sectionId + '"]');
        if (!existing) {
            var wt = document.createElement("a");
            wt.className = "workspace-tab";
            wt.dataset.section = sectionId;
            wt.textContent = sectionLabels[sectionId] || sectionId;
            wt.addEventListener("click", function () { showSection(sectionId); });
            workspaceBar.appendChild(wt);
            existing = wt;
        }
        // Activate this workspace tab
        workspaceBar.querySelectorAll(".workspace-tab").forEach(function (t) { t.classList.remove("active"); });
        existing.classList.add("active");

        // Refresh data when switching sections
        if (sectionId === "customer") {
            refreshCustomerSelects();
            var activeTab = sec.querySelector(".tab.active");
            if (activeTab && activeTab.dataset.tab === "customer-view") renderCustomerTable();
        }
        if (sectionId === "supplier") {
            refreshSupplierSelects();
            var activeTab2 = sec.querySelector(".tab.active");
            if (activeTab2 && activeTab2.dataset.tab === "supplier-view") renderSupplierTable();
        }
        if (sectionId === "template") {
            refreshCustomerSelects();
            refreshTemplateSelects("comp-tpl-select");
        }
    }

    navItems.forEach(function (item) {
        item.addEventListener("click", function () {
            showSection(item.dataset.section);
        });
    });

    // Tab switching within sections
    document.querySelectorAll(".tab-bar .tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            var bar = tab.parentElement;
            bar.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
            tab.classList.add("active");
            var section = tab.closest(".section-panel");
            section.querySelectorAll(":scope > .tab-content").forEach(function (tc) { tc.classList.remove("active"); });
            var target = document.getElementById("tab-" + tab.dataset.tab);
            if (target) target.classList.add("active");
            // Refresh data on tab switch
            if (tab.dataset.tab === "customer-view") renderCustomerTable();
            if (tab.dataset.tab === "supplier-view") renderSupplierTable();
            if (tab.dataset.tab === "template-view") renderTemplateTable();
        });
    });

    // Sub-tab switching
    document.querySelectorAll(".sub-tab-bar .sub-tab").forEach(function (st) {
        st.addEventListener("click", function () {
            if (st.classList.contains("disabled")) return;
            var bar = st.parentElement;
            bar.querySelectorAll(".sub-tab").forEach(function (s) { s.classList.remove("active"); });
            st.classList.add("active");
            var tabContent = st.closest(".tab-content");
            tabContent.querySelectorAll(":scope > .sub-tab-content").forEach(function (sc) { sc.classList.remove("active"); });
            var target = document.getElementById("subtab-" + st.dataset.subtab);
            if (target) target.classList.add("active");
            // Refresh on sub-tab switch
            if (st.dataset.subtab === "cust-member") refreshCustomerSelects();
            if (st.dataset.subtab === "sup-member") refreshSupplierSelects();
            if (st.dataset.subtab === "tpl-component") refreshTemplateSelects("comp-tpl-select");
            if (st.dataset.subtab === "tpl-setup") renderTemplatePreview();
            if (st.dataset.subtab === "tpl-partition") renderPartitionCanvas();
        });
    });

    function switchToSubTab(tabContentId, subtabId) {
        var tabContent = document.getElementById(tabContentId);
        if (!tabContent) return;
        tabContent.querySelectorAll(".sub-tab-bar .sub-tab").forEach(function (s) { s.classList.remove("active"); });
        tabContent.querySelectorAll(":scope > .sub-tab-content").forEach(function (sc) { sc.classList.remove("active"); });
        var subtabBtn = tabContent.querySelector('.sub-tab[data-subtab="' + subtabId + '"]');
        if (subtabBtn) subtabBtn.classList.add("active");
        var subtabPanel = document.getElementById("subtab-" + subtabId);
        if (subtabPanel) subtabPanel.classList.add("active");
    }

    /* ===== Customer CRUD ===== */
    document.getElementById("form-customer-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var c = {
            company: document.getElementById("cust-company").value.trim(),
            domain: document.getElementById("cust-domain").value.trim(),
            address: document.getElementById("cust-address").value.trim(),
            phone: document.getElementById("cust-phone").value.trim()
        };
        if (!c.company || !c.domain) { alert("Company and domain required."); return; }
        var form = this;
        api("POST", "/api/customers", c).then(function (saved) {
            store.customers.push(saved);
            form.reset();
            refreshCustomerSelects();
            switchToSubTab("tab-customer-create", "cust-member");
            document.getElementById("cust-member-company").value = saved.id;
            alert("Customer created. Switching to Member tab.");
        });
    });

    document.getElementById("form-customer-member").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var compId = parseInt(document.getElementById("cust-member-company").value);
        var cust = store.customers.find(function (c) { return c.id === compId; });
        if (!cust) { alert("Select a company."); return; }
        var member = {
            name: document.getElementById("cust-member-name").value.trim(),
            email: document.getElementById("cust-member-email").value.trim(),
            role: document.getElementById("cust-member-role").value.trim(),
            phone: document.getElementById("cust-member-phone").value.trim()
        };
        if (!member.name || !member.email) { alert("Name and email required."); return; }
        var form = this;
        api("POST", "/api/members", {
            parent_type: "customer", parent_id: compId,
            name: member.name, email: member.email, role: member.role, phone: member.phone
        }).then(function (saved) {
            cust.members.push(saved);
            var selVal = document.getElementById("cust-member-company").value;
            form.reset();
            document.getElementById("cust-member-company").value = selVal;
            alert("Member added.");
        });
    });

    function refreshCustomerSelects() {
        var selects = [
            document.getElementById("cust-member-company"),
            document.getElementById("tpl-customer")
        ];
        selects.forEach(function (sel) {
            if (!sel) return;
            var prev = sel.value;
            sel.innerHTML = '<option value="">-- Select --</option>';
            store.customers.forEach(function (c) {
                var opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = c.company;
                sel.appendChild(opt);
            });
            if (prev) sel.value = prev;
        });
    }

    function renderCustomerTable() {
        var tbody = document.querySelector("#table-customers tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("cust-search").value || "").toLowerCase();
        store.customers.forEach(function (c) {
            if (q && c.company.toLowerCase().indexOf(q) === -1 && c.domain.toLowerCase().indexOf(q) === -1) return;
            var tr = document.createElement("tr");
            var memberCell = c.members.length > 0
                ? "<span class='member-toggle' data-cid='" + c.id + "'>" + c.members.length + " ▸</span>"
                : "0";
            tr.innerHTML = "<td>" + esc(c.company) + "</td><td>" + esc(c.domain) + "</td><td>" + esc(c.phone) + "</td><td>" + memberCell + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function () {
                api("DELETE", "/api/customers/" + c.id).then(function () {
                    store.customers = store.customers.filter(function (x) { return x.id !== c.id; });
                    renderCustomerTable();
                });
            });
            tbody.appendChild(tr);
            // Expandable member rows
            var toggle = tr.querySelector(".member-toggle");
            if (toggle) {
                var memberRows = [];
                c.members.forEach(function (m) {
                    var mtr = document.createElement("tr");
                    mtr.className = "member-row hidden";
                    mtr.innerHTML = "<td></td><td>" + esc(m.name) + "</td><td>" + esc(m.email) + "</td><td>" + esc(m.role) + "</td><td></td>";
                    memberRows.push(mtr);
                });
                toggle.addEventListener("click", function () {
                    var expanded = toggle.textContent.indexOf("▾") !== -1;
                    memberRows.forEach(function (mr) {
                        if (expanded) mr.classList.add("hidden");
                        else mr.classList.remove("hidden");
                    });
                    toggle.textContent = c.members.length + (expanded ? " ▸" : " ▾");
                });
                memberRows.forEach(function (mr) { tbody.appendChild(mr); });
            }
        });
    }

    document.getElementById("cust-search").addEventListener("input", renderCustomerTable);

    /* ===== Supplier CRUD ===== */
    document.getElementById("form-supplier-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var s = {
            company: document.getElementById("sup-company").value.trim(),
            domain: document.getElementById("sup-domain").value.trim(),
            address: document.getElementById("sup-address").value.trim(),
            phone: document.getElementById("sup-phone").value.trim()
        };
        if (!s.company || !s.domain) { alert("Company and domain required."); return; }
        var form = this;
        api("POST", "/api/suppliers", s).then(function (saved) {
            store.suppliers.push(saved);
            form.reset();
            refreshSupplierSelects();
            switchToSubTab("tab-supplier-create", "sup-member");
            document.getElementById("sup-member-company").value = saved.id;
            alert("Supplier created. Switching to Member tab.");
        });
    });

    document.getElementById("form-supplier-member").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var compId = parseInt(document.getElementById("sup-member-company").value);
        var sup = store.suppliers.find(function (s) { return s.id === compId; });
        if (!sup) { alert("Select a company."); return; }
        var member = {
            name: document.getElementById("sup-member-name").value.trim(),
            email: document.getElementById("sup-member-email").value.trim(),
            role: document.getElementById("sup-member-role").value.trim(),
            phone: document.getElementById("sup-member-phone").value.trim()
        };
        if (!member.name || !member.email) { alert("Name and email required."); return; }
        var form = this;
        api("POST", "/api/members", {
            parent_type: "supplier", parent_id: compId,
            name: member.name, email: member.email, role: member.role, phone: member.phone
        }).then(function (saved) {
            sup.members.push(saved);
            var selVal = document.getElementById("sup-member-company").value;
            form.reset();
            document.getElementById("sup-member-company").value = selVal;
            alert("Member added.");
        });
    });

    function refreshSupplierSelects() {
        var sel = document.getElementById("sup-member-company");
        if (!sel) return;
        var prev = sel.value;
        sel.innerHTML = '<option value="">-- Select --</option>';
        store.suppliers.forEach(function (s) {
            var opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = s.company;
            sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
    }

    function renderSupplierTable() {
        var tbody = document.querySelector("#table-suppliers tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("sup-search").value || "").toLowerCase();
        store.suppliers.forEach(function (s) {
            if (q && s.company.toLowerCase().indexOf(q) === -1 && s.domain.toLowerCase().indexOf(q) === -1) return;
            var tr = document.createElement("tr");
            var memberCell = s.members.length > 0
                ? "<span class='member-toggle' data-sid='" + s.id + "'>" + s.members.length + " ▸</span>"
                : "0";
            tr.innerHTML = "<td>" + esc(s.company) + "</td><td>" + esc(s.domain) + "</td><td>" + esc(s.phone) + "</td><td>" + memberCell + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function () {
                api("DELETE", "/api/suppliers/" + s.id).then(function () {
                    store.suppliers = store.suppliers.filter(function (x) { return x.id !== s.id; });
                    renderSupplierTable();
                });
            });
            tbody.appendChild(tr);
            var toggle = tr.querySelector(".member-toggle");
            if (toggle) {
                var memberRows = [];
                s.members.forEach(function (m) {
                    var mtr = document.createElement("tr");
                    mtr.className = "member-row hidden";
                    mtr.innerHTML = "<td></td><td>" + esc(m.name) + "</td><td>" + esc(m.email) + "</td><td>" + esc(m.role) + "</td><td></td>";
                    memberRows.push(mtr);
                });
                toggle.addEventListener("click", function () {
                    var expanded = toggle.textContent.indexOf("\u25BE") !== -1;
                    memberRows.forEach(function (mr) {
                        if (expanded) mr.classList.add("hidden");
                        else mr.classList.remove("hidden");
                    });
                    toggle.textContent = s.members.length + (expanded ? " \u25B8" : " \u25BE");
                });
                memberRows.forEach(function (mr) { tbody.appendChild(mr); });
            }
        });
    }

    document.getElementById("sup-search").addEventListener("input", renderSupplierTable);

    /* ===== Template — Create ===== */
    var tplScale = 3;

    // Enforce sewing distance >= padding on selected side
    function enforceSewingMin() {
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
    }

    document.getElementById("tpl-sew-position").addEventListener("change", function () {
        var distInput = document.getElementById("tpl-sew-distance");
        if (this.value === "none") { distInput.min = "0"; distInput.value = "0"; }
        else { enforceSewingMin(); }
        renderTemplatePreview();
    });

    ["tpl-pad-top", "tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", enforceSewingMin);
    });

    document.getElementById("tpl-sew-distance").addEventListener("change", enforceSewingMin);

    // Real-time preview: refresh on any template parameter change
    ["tpl-width", "tpl-height", "tpl-pad-top", "tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right",
     "tpl-sew-distance", "tpl-sew-padding", "tpl-fold-padding"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", renderTemplatePreview);
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
                enforceSewingMin();
            }
            renderTemplatePreview();
        });
    });
    // Swap width ↔ height
    document.getElementById("btn-swap-wh").addEventListener("click", function () {
        var wInput = document.getElementById("tpl-width");
        var hInput = document.getElementById("tpl-height");
        var tmp = wInput.value;
        wInput.value = hInput.value;
        hInput.value = tmp;
        renderTemplatePreview();
    });
    // Padding link toggle
    var padLink = document.getElementById("tpl-pad-link");
    var padTop = document.getElementById("tpl-pad-top");
    var padOthers = ["tpl-pad-bottom", "tpl-pad-left", "tpl-pad-right"].map(function (id) { return document.getElementById(id); });

    function syncPadding() {
        if (padLink.checked) {
            padOthers.forEach(function (el) { el.value = padTop.value; el.disabled = true; });
        }
        renderTemplatePreview();
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
    // Line type toggle: Sewing vs Mid Fold (mutually exclusive)
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
            renderTemplatePreview();
        });
    });

    function getTemplateFormData() {
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
    }

    function calcPrintingArea(tpl) {
        // Start with padding offsets
        var top = tpl.padding.top;
        var bottom = tpl.padding.bottom;
        var left = tpl.padding.left;
        var right = tpl.padding.right;

        // Sewing overrides if larger
        if (tpl.sewing.position === "top" && tpl.sewing.distance > top) {
            top = tpl.sewing.distance;
        }
        if (tpl.sewing.position === "bottom" && tpl.sewing.distance > bottom) {
            bottom = tpl.sewing.distance;
        }
        if (tpl.sewing.position === "left" && tpl.sewing.distance > left) {
            left = tpl.sewing.distance;
        }
        if (tpl.sewing.position === "right" && tpl.sewing.distance > right) {
            right = tpl.sewing.distance;
        }

        return {
            x: left,
            y: top,
            w: tpl.width - left - right,
            h: tpl.height - top - bottom
        };
    }

    function calcPrintingRegions(tpl) {
        var top = tpl.padding.top;
        var bottom = tpl.padding.bottom;
        var left = tpl.padding.left;
        var right = tpl.padding.right;

        // Sewing: distance + sewing padding overrides
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
    }

    function clearPreview(preview) {
        var btn = preview.querySelector(".btn-fit");
        preview.innerHTML = "";
        if (btn) preview.appendChild(btn);
    }

    function renderTemplatePreview() {
        var tpl = getTemplateFormData();
        var preview = document.getElementById("template-preview");
        clearPreview(preview);
        if (!tpl.width || !tpl.height) {
            preview.insertAdjacentHTML("beforeend", '<div class="preview-hint">Click "Preview" to see label layout.</div>');
            return;
        }

        // Calculate scale
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

        // Padding dotted rectangle
        var padRect = document.createElement("div");
        padRect.className = "dotted-rect";
        padRect.style.left = (tpl.padding.left * tplScale) + "px";
        padRect.style.top = (tpl.padding.top * tplScale) + "px";
        padRect.style.width = ((tpl.width - tpl.padding.left - tpl.padding.right) * tplScale) + "px";
        padRect.style.height = ((tpl.height - tpl.padding.top - tpl.padding.bottom) * tplScale) + "px";
        canvas.appendChild(padRect);

        // Sewing line
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
            // Label
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

            // Sewing padding lines
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

        // Printing regions (red solid rectangles)
        var regions = calcPrintingRegions(tpl);
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

        // Fold line
        if (tpl.folding.type === "mid") {
            var foldLine = document.createElement("div");
            foldLine.className = "fold-line";
            if (tpl.orientation === "vertical") {
                // Vertical label: fold left-right, line goes left to right at mid height
                foldLine.classList.add("horizontal");
                foldLine.style.top = (tpl.height / 2 * tplScale) + "px";
            } else {
                // Horizontal label: fold top-bottom, line goes top to bottom at mid width
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

            // Fold padding lines
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

        // Size + orientation label
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
    }

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

    // Save template
    document.getElementById("form-template-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var tpl = getTemplateFormData();
        if (!tpl.name) { alert("Template name required."); return; }
        if (!tpl.customerId) { alert("Select a customer."); return; }

        // Sewing distance must be >= padding on that side
        if (tpl.sewing.position !== "none" && tpl.sewing.distance > 0) {
            var padVal = tpl.padding[tpl.sewing.position] || 0;
            if (tpl.sewing.distance < padVal) {
                alert("Sewing distance (" + tpl.sewing.distance + "mm) must be equal or bigger than " + tpl.sewing.position + " padding (" + padVal + "mm).");
                return;
            }
        }

        tpl.printingArea = calcPrintingArea(tpl);
        tpl.partitions = [];
        tpl.components = [];

        // Create initial partitions based on fold
        if (tpl.folding.type === "mid") {
            var fp = tpl.folding.padding || 0;
            if (tpl.orientation === "vertical") {
                var halfH = tpl.height / 2;
                tpl.partitions.push({
                    label: "Top",
                    x: tpl.printingArea.x, y: tpl.printingArea.y,
                    w: tpl.printingArea.w, h: halfH - fp - tpl.printingArea.y
                });
                tpl.partitions.push({
                    label: "Bottom",
                    x: tpl.printingArea.x, y: halfH + fp,
                    w: tpl.printingArea.w, h: (tpl.printingArea.y + tpl.printingArea.h) - (halfH + fp)
                });
            } else {
                var halfW = tpl.width / 2;
                tpl.partitions.push({
                    label: "Left",
                    x: tpl.printingArea.x, y: tpl.printingArea.y,
                    w: halfW - fp - tpl.printingArea.x, h: tpl.printingArea.h
                });
                tpl.partitions.push({
                    label: "Right",
                    x: halfW + fp, y: tpl.printingArea.y,
                    w: (tpl.printingArea.x + tpl.printingArea.w) - (halfW + fp), h: tpl.printingArea.h
                });
            }
        } else {
            tpl.partitions.push({
                label: "Main",
                x: tpl.printingArea.x, y: tpl.printingArea.y,
                w: tpl.printingArea.w, h: tpl.printingArea.h
            });
        }

        var isUpdate = !!activePartitionTpl;
        var method = isUpdate ? "PUT" : "POST";
        var url = isUpdate ? "/api/templates/" + activePartitionTpl.id : "/api/templates";

        api(method, url, tpl).then(function (saved) {
            if (isUpdate) {
                var idx = store.templates.findIndex(function (t) { return t.id === saved.id; });
                if (idx !== -1) store.templates[idx] = saved;
            } else {
                store.templates.push(saved);
            }
            showTwoPiecePreview(saved);
            refreshTemplateSelects("comp-tpl-select");
            // Enable Partition & Component sub-tabs
            var bar = document.querySelector('#tab-template-create .sub-tab-bar');
            bar.querySelectorAll('.sub-tab.disabled').forEach(function (s) { s.classList.remove('disabled'); });
            switchToSubTab("tab-template-create", "tpl-partition");
            document.getElementById("partition-tpl-name").textContent = saved.name;
            activePartitionTpl = saved;
            requestAnimationFrame(function () { renderPartitionCanvas(); });
        });
    });

    function showTwoPiecePreview(tpl) {
        var preview = document.getElementById("template-preview");
        clearPreview(preview);

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

    /* ===== Template — Partition ===== */
    var activePartitionTpl = null;
    var partitionBgImage = null;
    var partitionBgVisible = true;
    var partitionBgOpacity = 0.3;
    var rectDrawState = null;
    var partitionEditMode = false;

    function refreshTemplateSelects(selectId) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select --</option>';
        store.templates.forEach(function (t) {
            var opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
    }

    function renderPartitionCanvas() {
        var preview = document.getElementById("partition-preview");
        clearPreview(preview);
        if (!activePartitionTpl) {
            preview.insertAdjacentHTML("beforeend", '<div class="preview-hint">Select a template to begin.</div>');
            return;
        }

        var tpl = activePartitionTpl;
        var rect = preview.getBoundingClientRect();
        var sc = Math.min((rect.width - 60) / tpl.width, (rect.height - 60) / tpl.height, 8);
        sc = Math.max(sc, 1);

        var canvas = document.createElement("div");
        canvas.className = "label-canvas";
        canvas.style.width = Math.round(tpl.width * sc) + "px";
        canvas.style.height = Math.round(tpl.height * sc) + "px";
        canvas.style.cursor = partitionEditMode ? "default" : "crosshair";

        // Hover snap dot (visible before drag starts)
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

        // Resize drag handler (edit mode only)
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
            if (!neighbor) return;

            var MIN_SIZE = 2;
            var startX = ev.clientX, startY = ev.clientY;
            var origP = { x: part.x, y: part.y, w: part.w, h: part.h };
            var origN = { x: neighbor.x, y: neighbor.y, w: neighbor.w, h: neighbor.h };

            function onMove(e) {
                var dxMm = (e.clientX - startX) / sc;
                var dyMm = (e.clientY - startY) / sc;
                var delta;
                if (edge === "top") {
                    delta = Math.max(-(origP.h - MIN_SIZE), Math.min(origN.h - MIN_SIZE, dyMm));
                    delta = Math.round(delta * 10) / 10;
                    part.y = origP.y + delta; part.h = origP.h - delta;
                    neighbor.h = origN.h + delta;
                } else if (edge === "bottom") {
                    delta = Math.max(-(origP.h - MIN_SIZE), Math.min(origN.h - MIN_SIZE, dyMm));
                    delta = Math.round(delta * 10) / 10;
                    part.h = origP.h + delta;
                    neighbor.y = origN.y + delta; neighbor.h = origN.h - delta;
                } else if (edge === "left") {
                    delta = Math.max(-(origP.w - MIN_SIZE), Math.min(origN.w - MIN_SIZE, dxMm));
                    delta = Math.round(delta * 10) / 10;
                    part.x = origP.x + delta; part.w = origP.w - delta;
                    neighbor.w = origN.w + delta;
                } else if (edge === "right") {
                    delta = Math.max(-(origP.w - MIN_SIZE), Math.min(origN.w - MIN_SIZE, dxMm));
                    delta = Math.round(delta * 10) / 10;
                    part.w = origP.w + delta;
                    neighbor.x = origN.x + delta; neighbor.w = origN.w - delta;
                }
                renderPartitionCanvas();
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

        // Background image layer
        if (partitionBgImage) {
            var bgEl = document.createElement("img");
            bgEl.className = "partition-bg-img";
            bgEl.src = partitionBgImage.src;
            bgEl.style.opacity = partitionBgOpacity;
            if (!partitionBgVisible) bgEl.style.display = "none";
            canvas.appendChild(bgEl);
        }

        // Draw partitions
        tpl.partitions.forEach(function (part, i) {
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

            // Resize handles (edit mode only)
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

        // Fold line
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

        // Hover sync: canvas partitions -> list items
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
    }

    function renderPartitionList() {
        var list = document.getElementById("partition-list");
        list.innerHTML = "";
        if (!activePartitionTpl) return;
        activePartitionTpl.partitions.forEach(function (p, i) {
            var div = document.createElement("div");
            div.className = "component-list-item";
            div.dataset.partitionIndex = String(i);

            var span = document.createElement("span");
            span.textContent = p.label + " (" + p.w.toFixed(1) + "x" + p.h.toFixed(1) + ")";
            div.appendChild(span);

            if (activePartitionTpl.partitions.length > 1) {
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

    // Rectangle-draw partition system
    function collectSnapEdges(tpl) {
        var xSet = {}, ySet = {};
        tpl.partitions.forEach(function (p) {
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
        return {
            xs: Object.keys(xSet).map(Number),
            ys: Object.keys(ySet).map(Number)
        };
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
        var best = null;
        var bestOverlap = 0;
        for (var i = 0; i < partitions.length; i++) {
            var p = partitions[i];
            if (p === current) continue;
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
        var tpl = activePartitionTpl;
        if (!tpl || tpl.partitions.length <= 1) return;
        var removed = tpl.partitions[index];
        var EPSILON = 0.1;
        var bestNeighbor = null, bestLength = 0, bestEdge = null;

        tpl.partitions.forEach(function (p) {
            if (p === removed) return;
            [["top", (p.y + p.h), removed.y, "x"],
             ["bottom", p.y, (removed.y + removed.h), "x"],
             ["left", (p.x + p.w), removed.x, "y"],
             ["right", p.x, (removed.x + removed.w), "y"]
            ].forEach(function (cfg) {
                if (Math.abs(cfg[1] - cfg[2]) < EPSILON) {
                    var overlap = (cfg[3] === "x")
                        ? Math.min(p.x + p.w, removed.x + removed.w) - Math.max(p.x, removed.x)
                        : Math.min(p.y + p.h, removed.y + removed.h) - Math.max(p.y, removed.y);
                    if (overlap > bestLength) { bestLength = overlap; bestNeighbor = p; bestEdge = cfg[0]; }
                }
            });
        });

        if (!bestNeighbor) return;
        if (bestEdge === "top")    bestNeighbor.h += removed.h;
        if (bestEdge === "bottom") { bestNeighbor.y = removed.y; bestNeighbor.h += removed.h; }
        if (bestEdge === "left")   bestNeighbor.w += removed.w;
        if (bestEdge === "right")  { bestNeighbor.x = removed.x; bestNeighbor.w += removed.w; }

        tpl.partitions.splice(index, 1);
        assignPartitionLabels(tpl.partitions);
        renderPartitionCanvas();
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
        if (!activePartitionTpl) return;
        var tpl = activePartitionTpl;
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
            sc: sc,
            canvasEl: canvasEl,
            canvasRect: canvasRect,
            tpl: tpl,
            bounds: { x: pa.x, y: pa.y, x2: pa.x + pa.w, y2: pa.y + pa.h },
            startMm: start,
            snapEdges: snapEdges,
            previewEl: previewEl,
            snapDot: snapDot
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

        var x1 = Math.min(s.startMm.x, end.x);
        var y1 = Math.min(s.startMm.y, end.y);
        var x2 = Math.max(s.startMm.x, end.x);
        var y2 = Math.max(s.startMm.y, end.y);

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

        s.tpl.partitions.push({label: "", x: x1, y: y1, w: w, h: h});
        assignPartitionLabels(s.tpl.partitions);
        renderPartitionCanvas();
    }

    // Background image paste
    document.addEventListener("paste", function (e) {
        var tab = document.getElementById("subtab-tpl-partition");
        if (!tab || !tab.classList.contains("active")) return;
        if (!activePartitionTpl) return;
        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                e.preventDefault();
                var blob = items[i].getAsFile();
                var reader = new FileReader();
                reader.onload = function (ev) {
                    var img = new Image();
                    img.onload = function () {
                        partitionBgImage = img;
                        partitionBgVisible = true;
                        partitionBgOpacity = parseInt(document.getElementById("partition-bg-opacity").value) / 100;
                        document.getElementById("partition-bg-controls").style.display = "";
                        renderPartitionCanvas();
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
    });

    // Eye toggle
    document.getElementById("btn-bg-toggle").addEventListener("click", function () {
        partitionBgVisible = !partitionBgVisible;
        document.getElementById("ico-eye-open").style.display = partitionBgVisible ? "" : "none";
        document.getElementById("ico-eye-closed").style.display = partitionBgVisible ? "none" : "";
        var bgEl = document.querySelector("#partition-preview .partition-bg-img");
        if (bgEl) bgEl.style.display = partitionBgVisible ? "" : "none";
    });

    // Opacity slider
    document.getElementById("partition-bg-opacity").addEventListener("input", function () {
        partitionBgOpacity = parseInt(this.value) / 100;
        document.getElementById("partition-bg-opacity-val").textContent = this.value + "%";
        var bgEl = document.querySelector("#partition-preview .partition-bg-img");
        if (bgEl) bgEl.style.opacity = partitionBgOpacity;
    });

    // Remove background image
    document.getElementById("btn-bg-remove").addEventListener("click", function () {
        partitionBgImage = null;
        partitionBgVisible = true;
        document.getElementById("partition-bg-controls").style.display = "none";
        renderPartitionCanvas();
    });

    // Reset all partitions back to initial state
    document.getElementById("btn-reset-partitions").addEventListener("click", function () {
        if (!activePartitionTpl) return;
        var tpl = activePartitionTpl;
        var pa = tpl.printingArea || calcPrintingArea(tpl);
        var partitions = [];

        if (tpl.folding && tpl.folding.type === "mid") {
            var fp = tpl.folding.padding || 0;
            if (tpl.orientation === "vertical") {
                var halfH = tpl.height / 2;
                partitions.push({ label: "Top", x: pa.x, y: pa.y, w: pa.w, h: halfH - fp - pa.y });
                partitions.push({ label: "Bottom", x: pa.x, y: halfH + fp, w: pa.w, h: (pa.y + pa.h) - (halfH + fp) });
            } else {
                var halfW = tpl.width / 2;
                partitions.push({ label: "Left", x: pa.x, y: pa.y, w: halfW - fp - pa.x, h: pa.h });
                partitions.push({ label: "Right", x: halfW + fp, y: pa.y, w: (pa.x + pa.w) - (halfW + fp), h: pa.h });
            }
        } else {
            partitions.push({ label: "Main", x: pa.x, y: pa.y, w: pa.w, h: pa.h });
        }

        activePartitionTpl.partitions = partitions;
        api("PUT", "/api/templates/" + tpl.id + "/partitions", {
            partitions: partitions
        }).then(function (resp) {
            activePartitionTpl.partitions = resp.partitions;
            renderPartitionCanvas();
        });
    });

    // Save partitions button
    document.getElementById("btn-save-partitions").addEventListener("click", function () {
        if (!activePartitionTpl) return;
        var btn = this;
        var tpl = activePartitionTpl;
        var payload = {
            partitions: tpl.partitions,
            bgImage: partitionBgImage ? partitionBgImage.src : ""
        };
        btn.disabled = true;
        btn.textContent = "Saving...";
        api("PUT", "/api/templates/" + tpl.id + "/partitions", payload).then(function (resp) {
            activePartitionTpl.partitions = resp.partitions;
            renderPartitionCanvas();
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

    // Edit mode toggle
    document.getElementById("btn-edit-partitions").addEventListener("click", function () {
        partitionEditMode = !partitionEditMode;
        this.style.background = partitionEditMode ? "#000" : "";
        this.style.color = partitionEditMode ? "#fff" : "";
        renderPartitionCanvas();
    });

    /* ===== Template — Component (placeholder) ===== */
    document.getElementById("comp-tpl-select").addEventListener("change", function () {
        var id = parseInt(this.value);
        var tpl = store.templates.find(function (t) { return t.id === id; }) || null;
        var preview = document.getElementById("component-preview");
        if (!tpl) {
            preview.innerHTML = '<div class="preview-hint">Select a template to begin.</div>';
            return;
        }
        preview.innerHTML = '<div class="preview-hint">Component drag-drop — details to follow.</div>';
    });

    /* ===== Load template for editing (from View All dblclick) ===== */
    function loadTemplateForEditing(t) {
        // Populate form fields
        document.getElementById("tpl-customer").value = t.customerId || "";
        document.getElementById("tpl-name").value = t.name || "";
        document.getElementById("tpl-width").value = t.width || "";
        document.getElementById("tpl-height").value = t.height || "";

        // Orientation
        document.getElementById("tpl-orientation").value = t.orientation || "vertical";
        document.querySelectorAll(".orient-btn").forEach(function (b) {
            b.classList.toggle("active", b.dataset.orient === t.orientation);
        });

        // Padding
        document.getElementById("tpl-pad-top").value = t.padding.top;
        document.getElementById("tpl-pad-bottom").value = t.padding.bottom;
        document.getElementById("tpl-pad-left").value = t.padding.left;
        document.getElementById("tpl-pad-right").value = t.padding.right;
        var allSame = t.padding.top === t.padding.bottom && t.padding.top === t.padding.left && t.padding.top === t.padding.right;
        var padLinkEl = document.getElementById("tpl-pad-link");
        padLinkEl.checked = allSame;
        padOthers.forEach(function (el) { el.disabled = allSame; });
        updateLinkToggleUI();

        // Line type
        var lineType = (t.folding && t.folding.type === "mid") ? "fold" : "sewing";
        document.getElementById("tpl-line-type").value = lineType;
        document.querySelectorAll(".line-type-btn").forEach(function (b) {
            b.classList.toggle("active", b.dataset.linetype === lineType);
        });
        document.getElementById("fields-sewing").classList.toggle("hidden", lineType !== "sewing");
        document.getElementById("fields-fold").classList.toggle("hidden", lineType !== "fold");

        // Sewing
        if (t.sewing) {
            document.getElementById("tpl-sew-position").value = t.sewing.position || "top";
            document.getElementById("tpl-sew-distance").value = t.sewing.distance || 0;
            document.getElementById("tpl-sew-padding").value = t.sewing.padding || 0;
        }

        // Folding
        if (t.folding) {
            document.getElementById("tpl-fold-padding").value = t.folding.padding || 0;
        }

        // Set as active template for editing
        activePartitionTpl = t;

        // Restore background image if saved
        if (t.bgImage) {
            var img = new Image();
            img.onload = function () {
                partitionBgImage = img;
                partitionBgVisible = true;
                partitionBgOpacity = parseInt(document.getElementById("partition-bg-opacity").value) / 100;
                renderPartitionCanvas();
            };
            img.src = t.bgImage;
        } else {
            partitionBgImage = null;
            partitionBgVisible = true;
        }

        // Switch to Create tab → Template sub-tab
        var sec = document.getElementById("section-template");
        sec.querySelectorAll(".tab").forEach(function (tab) { tab.classList.remove("active"); });
        sec.querySelectorAll(":scope > .tab-content").forEach(function (tc) { tc.classList.remove("active"); });
        sec.querySelector('.tab[data-tab="template-create"]').classList.add("active");
        document.getElementById("tab-template-create").classList.add("active");

        // Enable Partition & Component sub-tabs
        var bar = document.querySelector('#tab-template-create .sub-tab-bar');
        bar.querySelectorAll('.sub-tab.disabled').forEach(function (s) { s.classList.remove('disabled'); });

        // Go to Template setup first so user sees the form
        switchToSubTab("tab-template-create", "tpl-setup");
        document.getElementById("partition-tpl-name").textContent = t.name;

        enforceSewingMin();
        renderTemplatePreview();
    }

    /* ===== Template — View All Table ===== */
    function renderTemplateTable() {
        var tbody = document.querySelector("#table-templates tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("tpl-search").value || "").toLowerCase();
        store.templates.forEach(function (t) {
            if (q && t.name.toLowerCase().indexOf(q) === -1) return;
            var cust = store.customers.find(function (c) { return c.id === parseInt(t.customerId); });
            var custName = cust ? cust.company : "—";
            var tr = document.createElement("tr");
            tr.innerHTML = "<td>" + esc(t.name) + "</td><td>" + esc(custName) + "</td><td>" + t.width + "x" + t.height + " mm</td><td>" + esc(t.orientation) + "</td><td>" + esc(t.folding.type) + "</td><td>" + t.partitions.length + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function (e) {
                e.stopPropagation();
                api("DELETE", "/api/templates/" + t.id).then(function () {
                    store.templates = store.templates.filter(function (x) { return x.id !== t.id; });
                    renderTemplateTable();
                });
            });
            tr.style.cursor = "pointer";
            tr.addEventListener("dblclick", function () {
                loadTemplateForEditing(t);
            });
            tbody.appendChild(tr);
        });
    }

    document.getElementById("tpl-search").addEventListener("input", renderTemplateTable);

    /* ===== Utilities ===== */
    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randNum(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    /* ===== Dummy Data Fill ===== */
    var dummyCompanies = ["Acme Corp", "Globe Textiles", "Star Garments", "Pacific Labels", "Summit Fashion", "Nova Apparel", "Delta Fabrics", "Echo Industries"];
    var dummyDomains = ["acme.com", "globetex.com", "stargarments.com", "pacificlabels.com", "summitfash.com", "novaapparel.com", "deltafab.com", "echoind.com"];
    var dummyNames = ["John Smith", "Jane Doe", "Alex Wong", "Maria Chen", "David Lee", "Sarah Kim", "Tom Brown", "Lisa Park"];
    var dummyRoles = ["Manager", "Designer", "Buyer", "QC Lead", "Director", "Coordinator", "Analyst", "Supervisor"];
    var dummyAddresses = ["123 Main St, City", "456 Oak Ave, Town", "789 Pine Rd, Metro", "321 Elm Blvd, District"];
    var dummyTplNames = ["Care Label A", "Wash Tag B", "Size Label C", "Content Tag D", "Brand Label E"];

    var dummyFillers = {
        "customer-create": function () {
            var i = randNum(0, dummyCompanies.length - 1);
            document.getElementById("cust-company").value = dummyCompanies[i];
            document.getElementById("cust-domain").value = dummyDomains[i];
            document.getElementById("cust-address").value = rand(dummyAddresses);
            document.getElementById("cust-phone").value = "+1-" + randNum(200,999) + "-" + randNum(1000,9999);
        },
        "customer-member": function () {
            var sel = document.getElementById("cust-member-company");
            if (sel.options.length > 1) sel.selectedIndex = randNum(1, sel.options.length - 1);
            var n = rand(dummyNames);
            document.getElementById("cust-member-name").value = n;
            var domain = sel.selectedIndex > 0 ? (store.customers.find(function(c){ return c.id === parseInt(sel.value); }) || {}).domain || "test.com" : "test.com";
            document.getElementById("cust-member-email").value = n.toLowerCase().replace(/ /g, ".") + "@" + domain;
            document.getElementById("cust-member-role").value = rand(dummyRoles);
            document.getElementById("cust-member-phone").value = "+1-" + randNum(200,999) + "-" + randNum(1000,9999);
        },
        "supplier-create": function () {
            var i = randNum(0, dummyCompanies.length - 1);
            document.getElementById("sup-company").value = dummyCompanies[i] + " Supply";
            document.getElementById("sup-domain").value = "supply." + dummyDomains[i];
            document.getElementById("sup-address").value = rand(dummyAddresses);
            document.getElementById("sup-phone").value = "+1-" + randNum(200,999) + "-" + randNum(1000,9999);
        },
        "supplier-member": function () {
            var sel = document.getElementById("sup-member-company");
            if (sel.options.length > 1) sel.selectedIndex = randNum(1, sel.options.length - 1);
            var n = rand(dummyNames);
            document.getElementById("sup-member-name").value = n;
            var domain = sel.selectedIndex > 0 ? (store.suppliers.find(function(s){ return s.id === parseInt(sel.value); }) || {}).domain || "test.com" : "test.com";
            document.getElementById("sup-member-email").value = n.toLowerCase().replace(/ /g, ".") + "@" + domain;
            document.getElementById("sup-member-role").value = rand(dummyRoles);
            document.getElementById("sup-member-phone").value = "+1-" + randNum(200,999) + "-" + randNum(1000,9999);
        },
        "template-create": function () {
            var sel = document.getElementById("tpl-customer");
            if (sel.options.length > 1) sel.selectedIndex = randNum(1, sel.options.length - 1);
            document.getElementById("tpl-name").value = rand(dummyTplNames);
            document.getElementById("tpl-width").value = rand([30, 40, 50, 60]);
            document.getElementById("tpl-height").value = rand([60, 80, 100, 120]);
            var orientVal = rand(["vertical", "horizontal"]);
            document.getElementById("tpl-orientation").value = orientVal;
            document.querySelectorAll(".orient-btn").forEach(function (b) {
                b.classList.toggle("active", b.dataset.orient === orientVal);
            });
            var pad = rand([2, 3, 5]);
            document.getElementById("tpl-pad-top").value = pad;
            document.getElementById("tpl-pad-bottom").value = pad;
            document.getElementById("tpl-pad-left").value = pad;
            document.getElementById("tpl-pad-right").value = pad;
            // Toggle between sewing or fold
            var lineType = rand(["sewing", "fold"]);
            document.getElementById("tpl-line-type").value = lineType;
            document.querySelectorAll(".line-type-btn").forEach(function (b) {
                b.classList.toggle("active", b.dataset.linetype === lineType);
            });
            document.getElementById("fields-sewing").classList.toggle("hidden", lineType !== "sewing");
            document.getElementById("fields-fold").classList.toggle("hidden", lineType !== "fold");
            // Fill both sides with values (preserved when switching)
            document.getElementById("tpl-sew-position").value = rand(["top", "left"]);
            document.getElementById("tpl-sew-distance").value = rand([8, 10, 12]);
            document.getElementById("tpl-sew-padding").value = rand([0, 1, 2]);
            document.getElementById("tpl-fold-padding").value = rand([0, 1, 2]);
            enforceSewingMin();
            renderTemplatePreview();
        }
    };

    document.querySelectorAll(".btn-dummy").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var formKey = btn.dataset.form;
            if (dummyFillers[formKey]) dummyFillers[formKey]();
        });
    });

    // Load all data from DB, then show UI
    Promise.all([
        api("GET", "/api/customers"),
        api("GET", "/api/suppliers"),
        api("GET", "/api/templates")
    ]).then(function (results) {
        store.customers = results[0];
        store.suppliers = results[1];
        store.templates = results[2];
        showSection("welcome");
    }).catch(function (err) {
        console.error("Failed to load data:", err);
        showSection("welcome");
    });
})();
