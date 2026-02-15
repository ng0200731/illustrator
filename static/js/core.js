(function () {
    "use strict";

    window.App = {
        /* In-Memory Data Store (loaded from DB) */
        store: {
            customers: [],
            suppliers: [],
            templates: []
        },

        /* Shared state */
        activePartitionTpl: null,

        /* API helper */
        api: function (method, url, body) {
            var opts = { method: method, headers: { "Content-Type": "application/json" } };
            if (body) opts.body = JSON.stringify(body);
            return fetch(url, opts).then(function (r) {
                if (!r.ok) throw new Error("API error " + r.status);
                return r.json();
            });
        },

        /* Utilities */
        esc: function (s) {
            var d = document.createElement("div");
            d.textContent = s || "";
            return d.innerHTML;
        },
        rand: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
        randNum: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    };
})();
