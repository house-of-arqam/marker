(function() {
  // The license key arrives in the URL fragment (#k=<jwt>), never the query
  // string: fragments are not sent to the server, so the key stays out of
  // access logs, Referer headers and analytics.
  var KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  var COPIED_RESET_MS = 4000;

  var config = window.SITE_CONFIG || {};
  var productName = config.productName || 'the extension';
  var proLabel = config.proLabel || 'Pro';
  var view = document.getElementById('key-view');
  var resetTimer = null;

  function render(nodes) {
    view.replaceChildren.apply(view, nodes);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function homeLink() {
    var a = el('a', 'btn', 'Back to ' + productName);
    a.href = '/';
    return a;
  }

  function showError(text) {
    render([
      el('div', 'error', text),
      el('p', 'hint', 'Your key is also in the purchase email, and the extension can re-fetch it: open Settings and choose Restore purchase.'),
      homeLink()
    ]);
  }

  function readKey() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return '';
    // Accept both #k=<jwt> (what the license email links to) and a bare #<jwt>.
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(hash)) return hash;
    var params = new URLSearchParams(hash);
    return params.get('k') || '';
  }

  // Clipboard API needs a secure context and permission; a hidden textarea plus
  // execCommand still works everywhere else (older Safari, http:// previews).
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      if (ok) resolve(); else reject(new Error('copy rejected'));
    });
  }

  function steps() {
    var list = el('ol', 'steps');
    [
      'Open ' + productName + ' in your browser and go to Settings.',
      'Paste the key into the License key field.',
      'Click Activate \u2014 ' + proLabel + ' features unlock immediately.'
    ].forEach(function(text) {
      list.appendChild(el('li', null, text));
    });
    return list;
  }

  function show(key) {
    var block = el('pre', 'key-block', key);
    var button = el('button', 'btn', 'Copy key');
    button.type = 'button';
    var feedback = el('p', 'copied');

    button.addEventListener('click', function() {
      copyText(key).then(function() {
        feedback.textContent = 'Copied to your clipboard.';
      }).catch(function() {
        feedback.textContent = 'Copy failed \u2014 select the key above and copy it manually.';
      });
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function() { feedback.textContent = ''; }, COPIED_RESET_MS);
    });

    render([
      el('p', 'hint', 'Copy this key, then paste it into the extension to activate ' + proLabel + '.'),
      block,
      button,
      feedback,
      steps()
    ]);
  }

  var key = readKey();
  if (!key) {
    showError('This link is missing your license key.');
  } else if (!KEY_PATTERN.test(key)) {
    showError('This link does not contain a valid license key.');
  } else {
    show(key);
  }
})();
