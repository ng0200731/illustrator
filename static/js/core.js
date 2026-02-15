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
        activePartitionPage: 0,

        /* API helper */
        api: function (method, url, body) {
            var opts = { method: method, headers: { "Content-Type": "application/json" } };
            if (body) opts.body = JSON.stringify(body);
            return fetch(url, opts).then(function (r) {
                if (!r.ok) return r.json().catch(function () { return {}; }).then(function (data) {
                    throw new Error(data.error || "API error " + r.status);
                });
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
        randNum: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

        /* In-page modal — replaces alert() / confirm() */
        _modal: function (msg, isConfirm) {
            var overlay = document.getElementById("app-modal-overlay");
            var body = document.getElementById("app-modal-body");
            var btnOk = document.getElementById("app-modal-ok");
            var btnCancel = document.getElementById("app-modal-cancel");
            body.textContent = msg;
            btnCancel.style.display = isConfirm ? "" : "none";
            overlay.classList.add("active");
            btnOk.focus();
            return new Promise(function (resolve) {
                function close(val) {
                    overlay.classList.remove("active");
                    btnOk.removeEventListener("click", onOk);
                    btnCancel.removeEventListener("click", onCancel);
                    resolve(val);
                }
                function onOk() { close(true); }
                function onCancel() { close(false); }
                btnOk.addEventListener("click", onOk);
                btnCancel.addEventListener("click", onCancel);
            });
        },
        alert: function (msg) { return App._modal(msg, false); },
        confirm: function (msg) { return App._modal(msg, true); },

        showToast: function (msg, isError) {
            var el = document.createElement("div");
            el.className = "toast" + (isError ? " toast-error" : "");
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(function () { el.classList.add("show"); }, 10);
            setTimeout(function () {
                el.classList.remove("show");
                setTimeout(function () { el.remove(); }, 300);
            }, 4000);
        }
    };
})();
