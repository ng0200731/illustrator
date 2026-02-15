(function () {
    "use strict";
    var App = window.App;

    var dummyCompanies = ["Acme Corp", "Globe Textiles", "Star Garments", "Pacific Labels", "Summit Fashion", "Nova Apparel", "Delta Fabrics", "Echo Industries"];
    var dummyDomains = ["acme.com", "globetex.com", "stargarments.com", "pacificlabels.com", "summitfash.com", "novaapparel.com", "deltafab.com", "echoind.com"];
    var dummyNames = ["John Smith", "Jane Doe", "Alex Wong", "Maria Chen", "David Lee", "Sarah Kim", "Tom Brown", "Lisa Park"];
    var dummyRoles = ["Manager", "Designer", "Buyer", "QC Lead", "Director", "Coordinator", "Analyst", "Supervisor"];
    var dummyAddresses = ["123 Main St, City", "456 Oak Ave, Town", "789 Pine Rd, Metro", "321 Elm Blvd, District"];
    var dummyTplNames = ["Care Label A", "Wash Tag B", "Size Label C", "Content Tag D", "Brand Label E"];

    var dummyFillers = {
        "customer-create": function () {
            var i = App.randNum(0, dummyCompanies.length - 1);
            document.getElementById("cust-company").value = dummyCompanies[i];
            document.getElementById("cust-domain").value = dummyDomains[i];
            document.getElementById("cust-address").value = App.rand(dummyAddresses);
            document.getElementById("cust-phone").value = "+1-" + App.randNum(200,999) + "-" + App.randNum(1000,9999);
        },
        "customer-member": function () {
            var sel = document.getElementById("cust-member-company");
            if (sel.options.length > 1) sel.selectedIndex = App.randNum(1, sel.options.length - 1);
            var n = App.rand(dummyNames);
            document.getElementById("cust-member-name").value = n;
            var domain = sel.selectedIndex > 0 ? (App.store.customers.find(function(c){ return c.id === parseInt(sel.value); }) || {}).domain || "test.com" : "test.com";
            document.getElementById("cust-member-email").value = n.toLowerCase().replace(/ /g, ".") + "@" + domain;
            document.getElementById("cust-member-role").value = App.rand(dummyRoles);
            document.getElementById("cust-member-phone").value = "+1-" + App.randNum(200,999) + "-" + App.randNum(1000,9999);
        },
        "supplier-create": function () {
            var i = App.randNum(0, dummyCompanies.length - 1);
            document.getElementById("sup-company").value = dummyCompanies[i] + " Supply";
            document.getElementById("sup-domain").value = "supply." + dummyDomains[i];
            document.getElementById("sup-address").value = App.rand(dummyAddresses);
            document.getElementById("sup-phone").value = "+1-" + App.randNum(200,999) + "-" + App.randNum(1000,9999);
        },
        "supplier-member": function () {
            var sel = document.getElementById("sup-member-company");
            if (sel.options.length > 1) sel.selectedIndex = App.randNum(1, sel.options.length - 1);
            var n = App.rand(dummyNames);
            document.getElementById("sup-member-name").value = n;
            var domain = sel.selectedIndex > 0 ? (App.store.suppliers.find(function(s){ return s.id === parseInt(sel.value); }) || {}).domain || "test.com" : "test.com";
            document.getElementById("sup-member-email").value = n.toLowerCase().replace(/ /g, ".") + "@" + domain;
            document.getElementById("sup-member-role").value = App.rand(dummyRoles);
            document.getElementById("sup-member-phone").value = "+1-" + App.randNum(200,999) + "-" + App.randNum(1000,9999);
        },
        "template-create": function () {
            var sel = document.getElementById("tpl-customer");
            if (sel.options.length > 1) sel.selectedIndex = App.randNum(1, sel.options.length - 1);
            document.getElementById("tpl-name").value = App.rand(dummyTplNames);
            document.getElementById("tpl-width").value = App.rand([30, 40, 50, 60]);
            document.getElementById("tpl-height").value = App.rand([60, 80, 100, 120]);
            var orientVal = App.rand(["vertical", "horizontal"]);
            document.getElementById("tpl-orientation").value = orientVal;
            document.querySelectorAll(".orient-btn").forEach(function (b) {
                b.classList.toggle("active", b.dataset.orient === orientVal);
            });
            var pad = App.rand([2, 3, 5]);
            document.getElementById("tpl-pad-top").value = pad;
            document.getElementById("tpl-pad-bottom").value = pad;
            document.getElementById("tpl-pad-left").value = pad;
            document.getElementById("tpl-pad-right").value = pad;
            var lineType = App.rand(["sewing", "fold"]);
            document.getElementById("tpl-line-type").value = lineType;
            document.querySelectorAll(".line-type-btn").forEach(function (b) {
                b.classList.toggle("active", b.dataset.linetype === lineType);
            });
            document.getElementById("fields-sewing").classList.toggle("hidden", lineType !== "sewing");
            document.getElementById("fields-fold").classList.toggle("hidden", lineType !== "fold");
            document.getElementById("tpl-sew-position").value = App.rand(["top", "left"]);
            document.getElementById("tpl-sew-distance").value = App.rand([8, 10, 12]);
            document.getElementById("tpl-sew-padding").value = App.rand([0, 1, 2]);
            document.getElementById("tpl-fold-padding").value = App.rand([0, 1, 2]);
            App.enforceSewingMin();
            App.renderTemplatePreview();
        }
    };

    document.querySelectorAll(".btn-dummy").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var formKey = btn.dataset.form;
            if (dummyFillers[formKey]) dummyFillers[formKey]();
        });
    });
})();
