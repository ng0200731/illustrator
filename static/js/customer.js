(function () {
    "use strict";
    var App = window.App;

    document.getElementById("form-customer-create").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var c = {
            company: document.getElementById("cust-company").value.trim(),
            domain: document.getElementById("cust-domain").value.trim(),
            address: document.getElementById("cust-address").value.trim(),
            phone: document.getElementById("cust-phone").value.trim()
        };
        if (!c.company || !c.domain) { App.alert("Company and domain required."); return; }
        var form = this;
        App.api("POST", "/api/customers", c).then(function (saved) {
            App.store.customers.push(saved);
            form.reset();
            App.refreshCustomerSelects();
            App.switchToSubTab("tab-customer-create", "cust-member");
            document.getElementById("cust-member-company").value = saved.id;
            App.alert("Customer created. Switching to Member tab.");
        });
    });

    document.getElementById("form-customer-member").addEventListener("submit", function (e) {
        e.preventDefault();
        if (this.querySelector('[name="website"]').value) return;
        var compId = parseInt(document.getElementById("cust-member-company").value);
        var cust = App.store.customers.find(function (c) { return c.id === compId; });
        if (!cust) { App.alert("Select a company."); return; }
        var member = {
            name: document.getElementById("cust-member-name").value.trim(),
            email: document.getElementById("cust-member-email").value.trim(),
            role: document.getElementById("cust-member-role").value.trim(),
            phone: document.getElementById("cust-member-phone").value.trim()
        };
        if (!member.name || !member.email) { App.alert("Name and email required."); return; }
        var form = this;
        App.api("POST", "/api/members", {
            parent_type: "customer", parent_id: compId,
            name: member.name, email: member.email, role: member.role, phone: member.phone
        }).then(function (saved) {
            cust.members.push(saved);
            var selVal = document.getElementById("cust-member-company").value;
            form.reset();
            document.getElementById("cust-member-company").value = selVal;
            App.alert("Member added.");
        });
    });

    App.refreshCustomerSelects = function () {
        var selects = [
            document.getElementById("cust-member-company"),
            document.getElementById("tpl-customer"),
            document.getElementById("comp-customer")
        ];
        selects.forEach(function (sel) {
            if (!sel) return;
            var prev = sel.value;
            sel.innerHTML = '<option value="">-- Select --</option>';
            App.store.customers.forEach(function (c) {
                var opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = c.company;
                sel.appendChild(opt);
            });
            if (prev) sel.value = prev;
        });
    };

    App.renderCustomerTable = function () {
        var tbody = document.querySelector("#table-customers tbody");
        tbody.innerHTML = "";
        var q = (document.getElementById("cust-search").value || "").toLowerCase();
        App.store.customers.forEach(function (c) {
            if (q && c.company.toLowerCase().indexOf(q) === -1 && c.domain.toLowerCase().indexOf(q) === -1) return;
            var tr = document.createElement("tr");
            var memberCell = c.members.length > 0
                ? "<span class='member-toggle' data-cid='" + c.id + "'>" + c.members.length + " \u25B8</span>"
                : "0";
            tr.innerHTML = "<td>" + App.esc(c.company) + "</td><td>" + App.esc(c.domain) + "</td><td>" + App.esc(c.phone) + "</td><td>" + memberCell + "</td><td><button class='btn-outline' style='padding:2px 8px;font-size:11px'>Delete</button></td>";
            tr.querySelector("button").addEventListener("click", function () {
                App.api("DELETE", "/api/customers/" + c.id).then(function () {
                    App.store.customers = App.store.customers.filter(function (x) { return x.id !== c.id; });
                    App.renderCustomerTable();
                });
            });
            tbody.appendChild(tr);
            var toggle = tr.querySelector(".member-toggle");
            if (toggle) {
                var memberRows = [];
                c.members.forEach(function (m) {
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
                    toggle.textContent = c.members.length + (expanded ? " \u25B8" : " \u25BE");
                });
                memberRows.forEach(function (mr) { tbody.appendChild(mr); });
            }
        });
    };

    document.getElementById("cust-search").addEventListener("input", App.renderCustomerTable);
})();
