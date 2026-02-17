(function () {
    "use strict";
    var App = window.App;

    var navItems = document.querySelectorAll(".nav-item");
    var sections = document.querySelectorAll(".section-panel");
    var workspaceBar = document.getElementById("workspace-tabs");

    var welcomeTab = workspaceBar.querySelector('.workspace-tab[data-section="welcome"]');
    if (welcomeTab) {
        welcomeTab.addEventListener("click", function () { App.showSection("welcome"); });
    }

    var sectionLabels = {
        welcome: "Welcome", customer: "Customer", supplier: "Supplier", template: "Template",
        project: "Project", order: "Order", status: "Status"
    };

    App.showSection = function (sectionId) {
        sections.forEach(function (s) { s.classList.remove("active"); });
        navItems.forEach(function (n) { n.classList.remove("active"); });
        var sec = document.getElementById("section-" + sectionId);
        if (sec) sec.classList.add("active");
        var nav = document.querySelector('.nav-item[data-section="' + sectionId + '"]');
        if (nav) nav.classList.add("active");

        var existing = workspaceBar.querySelector('.workspace-tab[data-section="' + sectionId + '"]');
        if (!existing) {
            var wt = document.createElement("a");
            wt.className = "workspace-tab";
            wt.dataset.section = sectionId;
            wt.textContent = sectionLabels[sectionId] || sectionId;
            wt.addEventListener("click", function () { App.showSection(sectionId); });
            workspaceBar.appendChild(wt);
            existing = wt;
        }
        workspaceBar.querySelectorAll(".workspace-tab").forEach(function (t) { t.classList.remove("active"); });
        existing.classList.add("active");

        if (sectionId === "customer") {
            App.refreshCustomerSelects();
            var activeTab = sec.querySelector(".tab.active");
            if (activeTab && activeTab.dataset.tab === "customer-view") App.renderCustomerTable();
        }
        if (sectionId === "supplier") {
            App.refreshSupplierSelects();
            var activeTab2 = sec.querySelector(".tab.active");
            if (activeTab2 && activeTab2.dataset.tab === "supplier-view") App.renderSupplierTable();
        }
        if (sectionId === "template") {
            App.refreshCustomerSelects();
            App.refreshTemplateSelects("comp-tpl-select");
        }
    };

    navItems.forEach(function (item) {
        item.addEventListener("click", function () {
            App.showSection(item.dataset.section);
        });
    });

    document.querySelectorAll(".tab-bar .tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            var bar = tab.parentElement;
            bar.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
            tab.classList.add("active");
            var section = tab.closest(".section-panel");
            section.querySelectorAll(":scope > .tab-content").forEach(function (tc) { tc.classList.remove("active"); });
            var target = document.getElementById("tab-" + tab.dataset.tab);
            if (target) target.classList.add("active");
            if (tab.dataset.tab === "customer-view") App.renderCustomerTable();
            if (tab.dataset.tab === "supplier-view") App.renderSupplierTable();
            if (tab.dataset.tab === "template-view") App.renderTemplateTable();
        });
    });

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
            if (st.dataset.subtab === "cust-member") App.refreshCustomerSelects();
            if (st.dataset.subtab === "sup-member") App.refreshSupplierSelects();
            if (st.dataset.subtab === "tpl-drawing") {
                var activeSST = document.querySelector('#subtab-tpl-drawing .sub-sub-tab.active');
                if (activeSST && activeSST.dataset.subsubtab === "tpl-setup") App.renderTemplatePreview();
                if (activeSST && activeSST.dataset.subsubtab === "tpl-partition") App.renderPartitionCanvas();
            }
            if (st.dataset.subtab === "tpl-pdf") App.refreshTemplateSelects("comp-tpl-select");
        });
    });

    /* Sub-sub-tab click handler */
    document.querySelectorAll(".sub-sub-tab-bar .sub-sub-tab").forEach(function (sst) {
        sst.addEventListener("click", function () {
            if (sst.classList.contains("disabled")) return;
            var bar = sst.parentElement;
            bar.querySelectorAll(".sub-sub-tab").forEach(function (s) { s.classList.remove("active"); });
            sst.classList.add("active");
            var subTabContent = sst.closest(".sub-tab-content");
            subTabContent.querySelectorAll(":scope > .sub-sub-tab-content").forEach(function (sc) { sc.classList.remove("active"); });
            var target = document.getElementById("subtab-" + sst.dataset.subsubtab);
            if (target) target.classList.add("active");
            if (sst.dataset.subsubtab === "tpl-component") App.refreshTemplateSelects("comp-tpl-select");
            if (sst.dataset.subsubtab === "tpl-setup") App.renderTemplatePreview();
            if (sst.dataset.subsubtab === "tpl-partition") App.renderPartitionCanvas();
        });
    });

    App.switchToSubTab = function (tabContentId, subtabId) {
        var tabContent = document.getElementById(tabContentId);
        if (!tabContent) return;
        tabContent.querySelectorAll(".sub-tab-bar .sub-tab").forEach(function (s) { s.classList.remove("active"); });
        tabContent.querySelectorAll(":scope > .sub-tab-content").forEach(function (sc) { sc.classList.remove("active"); });
        var subtabBtn = tabContent.querySelector('.sub-tab[data-subtab="' + subtabId + '"]');
        if (subtabBtn) subtabBtn.classList.add("active");
        var subtabPanel = document.getElementById("subtab-" + subtabId);
        if (subtabPanel) subtabPanel.classList.add("active");
    };

    App.switchToSubSubTab = function (subTabContentId, subsubtabId) {
        var container = document.getElementById(subTabContentId);
        if (!container) return;
        container.querySelectorAll(".sub-sub-tab-bar .sub-sub-tab").forEach(function (s) { s.classList.remove("active"); });
        container.querySelectorAll(":scope > .sub-sub-tab-content").forEach(function (sc) { sc.classList.remove("active"); });
        var btn = container.querySelector('.sub-sub-tab[data-subsubtab="' + subsubtabId + '"]');
        if (btn) btn.classList.add("active");
        var panel = document.getElementById("subtab-" + subsubtabId);
        if (panel) panel.classList.add("active");
    };
})();
