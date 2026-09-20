(function() {
  // Self-service seat management. The signed license key is the credential:
  // whoever holds it can list and release the installs registered against it,
  // exactly as they can from the extension's Settings page.
  var KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

  var config = window.SITE_CONFIG || {};
  var api = String(config.licenseApi || '').replace(/\/+$/, '');
  var form = document.getElementById('key-form');
  var input = document.getElementById('key-input');
  var view = document.getElementById('devices-view');
  var currentKey = '';

  function render(nodes) {
    view.replaceChildren.apply(view, nodes);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function showError(text) {
    render([el('div', 'error', text)]);
  }

  function post(path, body) {
    return fetch(api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : 'http_' + res.status);
        return data;
      });
    });
  }

  function formatDate(seconds) {
    if (!seconds) return 'unknown';
    return new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function describeError(err) {
    var code = err && err.message;
    if (code === 'invalid_key') return 'That is not a valid license key for ' + (config.productName || 'this extension') + '.';
    if (code === 'rate_limited') return 'Too many requests. Please wait a while and try again.';
    return 'Could not reach the licensing service. Check your connection and try again.';
  }

  function setBusy(busy) {
    view.querySelectorAll('button').forEach(function(btn) { btn.disabled = busy; });
  }

  function releaseButton(label, body) {
    var btn = el('button', 'btn', label);
    btn.type = 'button';
    btn.addEventListener('click', function() {
      setBusy(true);
      post('/deactivate', body).then(function() {
        return load(currentKey);
      }).catch(function(err) {
        showError(describeError(err));
      });
    });
    return btn;
  }

  function show(data) {
    var nodes = [];
    var status = data.status === 'active' || data.status === 'unknown' ? 'active' : data.status;
    var planText = data.plan.charAt(0).toUpperCase() + data.plan.slice(1) + ' plan';
    var expiry = data.plan === 'lifetime' ? 'never expires' : data.expiresAt ? 'key valid until ' + formatDate(data.expiresAt) : '';
    nodes.push(el('p', 'summary', planText + ' \u00b7 ' + status + (expiry ? ' \u00b7 ' + expiry : '')));

    if (!data.seats) {
      nodes.push(el('p', 'hint', 'Trial keys are not tied to devices, so there is nothing to manage here.'));
      render(nodes);
      return;
    }

    nodes.push(el('p', 'hint', data.seats.used + ' of ' + data.seats.max + ' devices in use.'));

    if (data.installs.length === 0) {
      nodes.push(el('p', 'hint', 'No devices are registered yet. Paste the key into the extension on each device you want to use.'));
    } else {
      var list = el('ul', 'devices');
      data.installs.forEach(function(install) {
        var item = el('li');
        var meta = el('div');
        meta.appendChild(el('div', 'id', 'Device ' + install.id.slice(0, 8)));
        meta.appendChild(el('div', 'seen', 'First seen ' + formatDate(install.firstSeen) + ' \u00b7 last seen ' + formatDate(install.lastSeen)));
        item.appendChild(meta);
        item.appendChild(releaseButton('Release', { key: currentKey, installId: install.id }));
        list.appendChild(item);
      });
      nodes.push(list);
      var all = releaseButton('Release all devices', { key: currentKey, all: true });
      all.className = 'btn secondary';
      nodes.push(all);
      nodes.push(el('p', 'hint', 'Released devices drop back to the free tier the next time they check in. Re-activate on the devices you still use by pasting the key in the extension\u2019s Settings.'));
    }
    render(nodes);
  }

  function load(key) {
    currentKey = key;
    render([el('div', 'status', 'Looking up your devices...')]);
    return post('/seats', { key: key }).then(function(data) {
      data.installs = data.installs || [];
      show(data);
    }).catch(function(err) {
      showError(describeError(err));
    });
  }

  if (!api) {
    showError('Device management is not configured. Site owner: set licenseApi in assets/site-config.js.');
    form.querySelector('button').disabled = true;
    return;
  }

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    var key = input.value.replace(/\s+/g, '');
    if (!KEY_PATTERN.test(key)) {
      showError('That does not look like a license key. Paste the whole key, including both dots.');
      return;
    }
    load(key);
  });
})();
