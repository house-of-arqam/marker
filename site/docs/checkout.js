(function() {
  // The extension creates the Paddle transaction server-side (Worker /checkout)
  // and opens this page with ?txn=<id>&env=<production|sandbox>. This page only
  // renders Paddle's overlay for that transaction.
  var config = window.SITE_CONFIG || {};
  var PINNED_TOKENS = config.paddleTokens || {};
  var TXN_PATTERN = /^txn_[a-z0-9]{1,64}$/;
  var LOAD_TIMEOUT_MS = 15000;

  var params = new URLSearchParams(window.location.search);
  var txnId = params.get('txn');
  var env = params.get('env') || 'production';
  var token = Object.prototype.hasOwnProperty.call(PINNED_TOKENS, env) ? PINNED_TOKENS[env] : '';
  var statusEl = document.getElementById('status');
  var productName = config.productName || 'the extension';
  var proLabel = config.proLabel || 'Pro';
  var settled = false;
  var errorShown = false;
  var completed = false;

  function render(nodes) {
    settled = true;
    statusEl.replaceChildren.apply(statusEl, nodes);
  }

  function message(className, text) {
    var el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
  }

  function hint(text) {
    var el = document.createElement('p');
    el.className = 'hint';
    el.textContent = text;
    return el;
  }

  function retryButton() {
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = 'Try Again';
    btn.addEventListener('click', function() { location.reload(); });
    return btn;
  }

  function homeLink() {
    var a = document.createElement('a');
    a.className = 'btn';
    a.href = '/';
    a.textContent = 'Back to ' + productName;
    return a;
  }

  function showError(text) {
    errorShown = true;
    render([message('error', text), retryButton()]);
  }

  if (!token) {
    render([
      message('error', 'Checkout is not configured for this environment.'),
      hint('Site owner: set paddleTokens.' + env + ' in assets/site-config.js.'),
      homeLink()
    ]);
    return;
  }

  if (!txnId) {
    render([
      message('error', 'This checkout link is incomplete.'),
      hint('Start your upgrade from the extension: open ' + productName + ', go to Settings and choose Upgrade to ' + proLabel + '.'),
      homeLink()
    ]);
    return;
  }

  if (!TXN_PATTERN.test(txnId)) {
    render([message('error', 'This checkout link is not valid.'), homeLink()]);
    return;
  }

  var loadTimer = setTimeout(function() {
    if (!settled) {
      showError('Could not reach our payment provider. Check your connection or any ad blocker, then try again.');
    }
  }, LOAD_TIMEOUT_MS);

  try {
    if (typeof Paddle === 'undefined') throw new Error('the payment provider did not load');

    Paddle.Environment.set(env);
    Paddle.Initialize({
      token: token,
      eventCallback: function(event) {
        if (event.name === 'checkout.loaded') {
          settled = true;
          clearTimeout(loadTimer);
        }
        if (event.name === 'checkout.completed') {
          clearTimeout(loadTimer);
          completed = true;
          var done = message('status', '\u2713 Payment successful!');
          done.style.color = '#15803d';
          render([
            done,
            hint('You can close this tab and return to the extension. Your ' + proLabel + ' features unlock within a couple of minutes; your license key is also on its way by email.')
          ]);
        }
        if (event.name === 'checkout.error') {
          clearTimeout(loadTimer);
          var detail = event && event.detail;
          if (detail && typeof detail === 'object') {
            detail = detail.message || detail.detail || JSON.stringify(detail);
          }
          showError('Checkout error: ' + (detail || 'An unexpected error occurred during checkout.'));
        }
        if (event.name === 'checkout.closed' && !errorShown && !completed) {
          clearTimeout(loadTimer);
          render([message('status', 'Checkout closed.'), retryButton()]);
        }
      }
    });

    Paddle.Checkout.open({
      transactionId: txnId,
      settings: {
        displayMode: 'overlay',
        theme: 'light'
      }
    });
  } catch (_e) {
    clearTimeout(loadTimer);
    showError('Failed to load checkout. Please try again.');
  }
})();
