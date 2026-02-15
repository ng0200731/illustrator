(function () {
    "use strict";
    var App = window.App;

    Promise.all([
        App.api("GET", "/api/customers"),
        App.api("GET", "/api/suppliers"),
        App.api("GET", "/api/templates")
    ]).then(function (results) {
        App.store.customers = results[0];
        App.store.suppliers = results[1];
        App.store.templates = results[2];
        App.showSection("welcome");
    }).catch(function (err) {
        console.error("Failed to load data:", err);
        App.showSection("welcome");
    });
})();
