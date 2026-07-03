(function (proto) {
    const origOpen = proto.open;
    const origSend = proto.send;

    proto.open = function (method, url) {
        this._mse_method = method;
        this._mse_url    = url;
        return origOpen.apply(this, arguments);
    };

    proto.send = function (body) {
        const events = 'loadstart load loadend progress error abort timeout readystatechange'.split(' ');
        events.forEach(evt => {
            this.addEventListener(evt, function () {
                if (
                    this._mse_url &&
                    (this._mse_url.includes('/search') || this._mse_url.startsWith('/search')) &&
                    this.readyState === 4
                ) {
                    try {
                        window.postMessage({ type: 'search', data: this.response }, '*');
                    } catch (e) {
                        console.error('[MSE] Erro ao postar resposta XHR:', e);
                    }
                }
            });
        });
        return origSend.apply(this, arguments);
    };
})(XMLHttpRequest.prototype);
