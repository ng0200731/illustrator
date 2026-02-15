(function () {
    "use strict";
    var App = window.App;

    document.getElementById("form-supplier-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var s = {
            company: document.getElementById("sup-company").value.trim(),
            domain: document.getElementById("sup-domain").value.trim(),
            address: document.getElementById("sup-address").value.trim(),
            phone: document.getElementById("sup-phone").value.trim()
        };
        if (!s.company || !s.domain) { App.alert("Company and domain required."); return; }
        var form = this;
        App.api("POST", "/api/suppliers", s).then(function (saved) {
            App.store.suppliers.push(saved);
            form.reset();
            App.refreshSupplierSelects();
            App.switchToSubTab("tab-supplier-create", "sup-member");
            document.getElementById("sup-member-company").value = saved.id;
            App.alert("Supplier created. Switching to Member tab.");
        });
    });

    document.getElementById("form-supplier-member").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var compId = parseInt(document.getElementById("sup-member-company").value);
        var sup = App.store.suppliers.find(function (s) { return s.id === compId; });
        if (!sup) { App.alert("Select a company."); return; }
        var member = {
            name: document.getElementById("sup-member-name").value.trim(),
            email: document.getElementById("sup-member-email").value.trim(),
            role: document.getElementById("sup-member-role").value.trim(),
            phone: document.getElementById("sup-member-phone").value.trim()
        };
        if (!member.name || !member.email) { App.alert("Name and email required."); return; }
        var form = this;
        App.api("POST", "/api/members", {
            parent_type: "supplier", parent_id: compId,
            name: member.name, email: member.email, role: member.role, phone: member.phone
        }).then(function (saved) {
            sup.members.push(saved);
            var selVal = document.getElementById("sup-member-company").value;
            form.reset();
            document.getElementById("sup-member-company").value = selVal;
            App.alert("Member added.");
        });
    });

    App.refreshSupplierSelects = function () {
        var sel = document.getElementById("sup-member-company");
        if (!sel) return;
        var prev = sel.value;
        sel.innerHTML = '<option value="">-- Select --</option>';
        App.store.suppliers.forEach(function (s) {
            var opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = s.company;
            sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
    };

    App.renderSupplierTable = function () {
        var tbody = document.querySelector("#table-suppliers tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("sup-search").value || "").toLowerCase();
        App.store.suppliers.forEach(function (s) {
            if (q && s.company.toLowerCase().indexOf(q) === -1 && s.domain.toLowerCase().indexOf(q) === -1) return;
            var tr = document.createElement("tr");
            var memberCell = s.members.length > 0
                ? "<span class='member-toggle' data-sid='" + s.id + "'>" + s.members.length + " \u25B8</span>"
                : "0";
            tr.innerHTML = "<td>" + App.esc(s.company) + "</td><td>" + App.esc(s.domain) + "</td><td>" + App.esc(s.phone) + "</td><td>" + memberCell + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function () {
                App.api("DELETE", "/api/suppliers/" + s.id).then(function () {
                    App.store.suppliers = App.store.suppliers.filter(function (x) { return x.id !== s.id; });
                    App.renderSupplierTable();
                });
            });
            tbody.appendChild(tr);
            var toggle = tr.querySelector(".member-toggle");
            if (toggle) {
                var memberRows = [];
                s.members.forEach(function (m) {
                    var mtr = document.createElement("tr");
                    mtr.className = "member-row hidden";
                    mtr.innerHTML = "<td></td><td>" + App.esc(m.name) + "</td><td>" + App.esc(m.email) + "</td><td>" + App.esc(m.role) + "</td><td></td>";
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
    };

    document.getElementById("sup-search").addEventListener("input", App.renderSupplierTable);
})();
