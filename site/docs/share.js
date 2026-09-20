(function() {
  // Read-only viewer for a published page of highlights. The share id travels
  // in the fragment so it never reaches a server log; the Worker's GET /share
  // is public and returns only what the publisher chose to share.
  var ID_PATTERN = /^[A-Za-z0-9]{12}$/;

  var config = window.SITE_CONFIG || {};
  var api = String(config.licenseApi || '').replace(/\/+$/, '');
  var view = document.getElementById('share-view');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function render(nodes) {
    view.replaceChildren.apply(view, nodes);
  }

  function showError(title, text) {
    var card = el('div', 'card share-empty');
    card.appendChild(el('h1', null, title));
    card.appendChild(el('p', null, text));
    var link = el('a', 'cta', 'Get Marker');
    link.href = 'index.html#install';
    card.appendChild(link);
    render([card]);
  }

  function hostOf(url) {
    var match = /^https?:\/\/([^/?#]+)/.exec(url);
    return match ? match[1] : url;
  }

  function renderShare(data) {
    var header = el('header', 'share-head');
    var title = el('h1', null, data.title || hostOf(data.url));
    header.appendChild(title);
    var source = el('a', 'share-source', data.url);
    source.href = data.url;
    source.rel = 'noopener nofollow';
    source.target = '_blank';
    header.appendChild(source);
    var meta = el('p', 'share-meta',
      data.highlights.length + (data.highlights.length === 1 ? ' highlight' : ' highlights') +
      ' · ' + new Date(data.createdAt * 1000).toLocaleDateString());
    header.appendChild(meta);

    var list = el('ol', 'share-list');
    data.highlights.forEach(function(h) {
      var item = el('li');
      item.setAttribute('data-color', h.color);
      var quote = el('blockquote', null, h.text);
      item.appendChild(quote);
      list.appendChild(item);
    });
    document.title = (data.title || hostOf(data.url)) + ' - Marker';
    render([header, list]);
  }

  var id = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!ID_PATTERN.test(id)) {
    showError('No highlights here', 'This link is missing its share id. Ask the person who sent it for a fresh link.');
    return;
  }

  fetch(api + '/share?id=' + encodeURIComponent(id)).then(function(res) {
    if (res.status === 404) throw new Error('not_found');
    if (!res.ok) throw new Error('http_' + res.status);
    return res.json();
  }).then(renderShare).catch(function(err) {
    if (err.message === 'not_found') {
      showError('This page has expired', 'Shared highlights are kept for 90 days. The owner can publish them again from the extension.');
    } else {
      showError('Could not load highlights', 'The share service is unreachable right now. Try again in a minute.');
    }
  });
})();
