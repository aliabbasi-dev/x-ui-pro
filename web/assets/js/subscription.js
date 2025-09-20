// تابع تبدیل خودکار حجم به B / KB / MB / GB
function formatSize(bytes) {
    if (bytes >= 1024*1024*1024) return (bytes / (1024*1024*1024)).toFixed(2) + ' GB';
    if (bytes >= 1024*1024) return (bytes / (1024*1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

// تابع رسم نمودار با استفاده از G2Plot
function createUsageChart(used, total) {
    const data = [
        { type: 'مصرف شده', value: used },
        { type: 'باقی‌مانده', value: total - used },
    ];

    const doughnutPlot = new G2Plot.Pie('usage-chart', {
        data,
        angleField: 'value',
        colorField: 'type',
        radius: 0.8,
        innerRadius: 0.6, // تبدیل به Doughnut
        legend: { position: 'bottom' },
        tooltip: {
            formatter: (datum) => {
                return { name: datum.type, value: formatSize(datum.value) };
            },
        },
        label: {
            type: 'spider',
            content: (datum) => `${datum.type}: ${formatSize(datum.value)}`,
            style: { fontSize: 14 },
        },
        statistic: {
            title: false,
            content: {
                formatter: ({ percent }) => `${(percent * 100).toFixed(1)}%`,
                style: { fontSize: 24 },
            },
        },
        interactions: [{ type: 'element-active' }],
        height: 250,
    });
    doughnutPlot.render();
}

(function () {
    const el = document.getElementById('subscription-data');
    if (!el) return;

    const textarea = document.getElementById('subscription-links');
    const rawLinks = (textarea?.value || '').split('\n').filter(Boolean);

    const data = {
        sId: el.getAttribute('data-sid') || '',
        subUrl: el.getAttribute('data-sub-url') || '',
        subJsonUrl: el.getAttribute('data-subjson-url') || '',
        download: el.getAttribute('data-download') || '',
        upload: el.getAttribute('data-upload') || '',
        used: el.getAttribute('data-used') || '',
        total: el.getAttribute('data-total') || '',
        remained: el.getAttribute('data-remained') || '',
        expireMs: (parseInt(el.getAttribute('data-expire') || '0', 10) || 0) * 1000,
        lastOnlineMs: (parseInt(el.getAttribute('data-lastonline') || '0', 10) || 0),
        downloadByte: parseInt(el.getAttribute('data-downloadbyte') || '0', 10) || 0,
        uploadByte: parseInt(el.getAttribute('data-uploadbyte') || '0', 10) || 0,
        totalByte: parseInt(el.getAttribute('data-totalbyte') || '0', 10) || 0,
        datepicker: el.getAttribute('data-datepicker') || 'gregorian',
    };

    if (data.lastOnlineMs && data.lastOnlineMs < 10_000_000_000) data.lastOnlineMs *= 1000;

    function renderLink(item) {
        return (
            Vue.h('a-list-item', {}, [
                Vue.h('a-space', { props: { size: 'small' } }, [
                    Vue.h('a-button', { props: { size: 'small' }, on: { click: () => copy(item) } }, [
                        Vue.h('a-icon', { props: { type: 'copy' } })
                    ]),
                    Vue.h('span', { class: 'break-all' }, item)
                ])
            ])
        );
    }

    function copy(text) {
        ClipboardManager.copyText(text).then(ok => {
            const messageType = ok ? 'success' : 'error';
            Vue.prototype.$message[messageType](ok ? 'Copied' : 'Copy failed');
        });
    }

    function open(url) { window.location.href = url; }

    function drawQR(value, elementId='qrcode') {
        try { new QRious({ element: document.getElementById(elementId), value, size: 220 }); }
        catch (e) { console.warn(e); }
    }

    function linkName(link, idx) {
        try {
            if (link.startsWith('vmess://')) {
                const json = JSON.parse(atob(link.replace('vmess://', '')));
                if (json.ps) return json.ps;
                if (json.add && json.id) return json.add;
            } else if (link.startsWith('vless://') || link.startsWith('trojan://')) {
                const hashIdx = link.indexOf('#');
                if (hashIdx !== -1) return decodeURIComponent(link.substring(hashIdx + 1));
                const qIdx = link.indexOf('?');
                if (qIdx !== -1) {
                    const qs = new URL('http://x/?' + link.substring(qIdx + 1, hashIdx !== -1 ? hashIdx : undefined)).searchParams;
                    if (qs.get('remark')) return qs.get('remark');
                    if (qs.get('email')) return qs.get('email');
                }
                const at = link.indexOf('@');
                const protSep = link.indexOf('://');
                if (at !== -1 && protSep !== -1) return link.substring(protSep + 3, at);
            } else if (link.startsWith('ss://')) {
                const hashIdx = link.indexOf('#');
                if (hashIdx !== -1) return decodeURIComponent(link.substring(hashIdx + 1));
            }
        } catch (e) { }
        return 'Link ' + (idx + 1);
    }

    const app = new Vue({
        delimiters: ['[[', ']]'],
        el: '#app',
        data: {
            themeSwitcher,
            app: data,
            links: rawLinks,
            lang: '',
            viewportWidth: window.innerWidth,
        },
        async mounted() {
            this.lang = LanguageManager.getLanguage();

            drawQR(this.app.subUrl);
            if (this.app.subJsonUrl) drawQR(this.app.subJsonUrl, 'qrcode-subjson');

            this._onResize = () => { this.viewportWidth = window.innerWidth; };
            window.addEventListener('resize', this._onResize);

            if (this.app.totalByte > 0) {
                this.$nextTick(() => {
                    const usedByte = this.app.downloadByte + this.app.uploadByte;
                    createUsageChart(usedByte, this.app.totalByte);
                });
            }
        },
        beforeDestroy() {
            if (this._onResize) window.removeEventListener('resize', this._onResize);
        },
        computed: {
            isMobile() { return this.viewportWidth < 576; },
            isUnlimited() { return !this.app.totalByte; },
            isActive() {
                const now = Date.now();
                const expiryOk = !this.app.expireMs || this.app.expireMs >= now;
                const trafficOk = !this.app.totalByte || (this.app.uploadByte + this.app.downloadByte) <= this.app.totalByte;
                return expiryOk && trafficOk;
            },
            usagePercentage() {
                if (!this.app.totalByte) return 0;
                const usedByte = this.app.downloadByte + this.app.uploadByte;
                return Math.min(100, (usedByte / this.app.totalByte) * 100);
            },
            shadowrocketUrl() {
                const rawUrl = this.app.subUrl + '?flag=shadowrocket';
                const base64Url = btoa(rawUrl);
                const remark = encodeURIComponent(this.app.sId || 'Subscription');
                return `shadowrocket://add/sub/${base64Url}?remark=${remark}`;
            },
            v2boxUrl() {
                return `v2box://install-sub?url=${encodeURIComponent(this.app.subUrl)}&name=${encodeURIComponent(this.app.sId)}`;
            },
            streisandUrl() { return `streisand://import/${encodeURIComponent(this.app.subUrl)}`; },
            v2raytunUrl() { return this.app.subUrl; },
            npvtunUrl() { return this.app.subUrl; },
        },
        methods: { renderLink, copy, open, linkName, i18nLabel(key) { return '{{ i18n "' + key + '" }}'; } },
    });
})();
