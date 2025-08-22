document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('share-btn');
    if (!btn) return;

    async function showFeedback(text) {
        const old = btn.innerHTML;
        btn.innerHTML = `<span class="copied" style="font-size:.85rem;">${text}</span>`;
        setTimeout(() => { btn.innerHTML = old; }, 1000);
    }

    btn.addEventListener('click', async () => {
        const url = window.location.href;

        // Prefer native share on mobile
        if (navigator.share) {
            try {
                await navigator.share({ url });
                return;
            } catch (e) {
            }
        }

        // Clipboard API (secure contexts: https:// or localhost)
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(url);
                await showFeedback('Copied!');
                return;
            } catch (e) {
                // fall through to legacy
            }
        }

        // Legacy fallback
        try {
            const tmp = document.createElement('input');
            tmp.value = url;
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
            await showFeedback('Copied!');
        } catch (e) {
            // Last resort: prompt
            window.prompt('Copy this link:', url);
        }
    });
});
