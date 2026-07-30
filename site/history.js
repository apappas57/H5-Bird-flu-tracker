/* History page for the H5 bird flu tracker.
 *
 * Reads site/data/history.json and renders it as a grouped timeline. Vanilla JS,
 * classic script, no dependencies, no build step, no network beyond the one
 * same-origin data file.
 *
 * Design rules this file obeys
 * ----------------------------
 * 1. Nothing is invented. Every date, number, quote and status printed here comes
 *    out of the data file. The only numbers computed locally are counts of the
 *    entries actually rendered, which is why they are derived rather than read
 *    from counts{}: a derived count cannot disagree with what is on screen.
 * 2. Colour means era, never category. Only entries in the current Australian
 *    H5N1 clade 2.3.4.4b incursion get .event--live (red). Everything else gets
 *    .event--historical (grey outline). The page states in words that grey does
 *    not mean finished, because the global event is ongoing.
 * 3. No fact without a source. An entry with no usable citation is rendered with
 *    an "Unsourced" label and a visible caveat, never hidden.
 * 4. Nothing is silently dropped. Any entry that does not match an era grouping
 *    lands in a final "Further entries" group, so a data change upstream cannot
 *    quietly remove content from the page.
 * 5. Graceful failure. If the file does not load, the reader keeps the whole
 *    written explanation and gets an honest notice saying what is missing and
 *    where to look, never a blank page.
 */
'use strict';

(function () {
  var DATA_URL = 'data/history.json';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  /* Era grouping.
   *
   * history.json carries scope and sort_date on every entry but no era id, so
   * the grouping is defined here. Two boundaries are used and both are stated in
   * the dataset itself rather than chosen freely:
   *   late 2021, which the dataset calls the conventional start of the panzootic
   *              and its own global era boundary;
   *   June 2026, the arrival of H5N1 in Australia.
   *
   * tone drives colour and nothing else. 'live' is the current Australian
   * incursion only.
   */
  var ERAS = [
    {
      id: 'before-panzootic',
      title: 'Before the panzootic, 1996 to 2021',
      range: '1996 to 2021',
      headClass: 'era--historical',
      tone: 'historical',
      note: 'The first twenty five years of the lineage: where it came from, the first human cases, '
        + 'and the first time it travelled between continents in wild birds rather than in trade.',
      match: function (e) { return e.scope !== 'australia' && e.sort_date < '2021-12-01'; },
    },
    {
      id: 'panzootic',
      title: 'The panzootic, late 2021 onward',
      range: 'Late 2021 onward',
      headClass: '',
      tone: 'historical',
      note: 'A panzootic is an animal pandemic: one outbreak running across many countries and many '
        + 'species at once. This is the global event Australia has now joined, and it is ongoing. '
        + 'These entries are grey because they are not the Australian incursion, not because they '
        + 'are over.',
      match: function (e) { return e.scope !== 'australia' && e.sort_date >= '2021-12-01'; },
    },
    {
      id: 'australia-before',
      title: 'Australia before June 2026',
      range: 'Up to June 2026',
      headClass: 'era--historical',
      tone: 'historical',
      note: 'What stood in the Australian record before this virus arrived. Neither entry here '
        + 'belongs to the current incursion, and the human case is a different lineage of H5N1 '
        + 'altogether.',
      match: function (e) { return e.scope === 'australia' && e.sort_date < '2026-06-01'; },
    },
    {
      id: 'australia-current',
      title: 'Australia, from June 2026: the current H5N1 incursion',
      range: 'June 2026 onward, ongoing',
      headClass: 'era--live',
      tone: 'live',
      note: 'The event this tracker follows: H5N1 clade 2.3.4.4b in Australian wild birds. Entries '
        + 'labelled Live data are generated from records held by this tracker and from official '
        + 'Australian statements, so this section is rebuilt every day and its figures move.',
      match: function (e) { return e.scope === 'australia' && e.sort_date >= '2026-06-01'; },
    },
  ];

  var UNPLACED = {
    id: 'further',
    title: 'Further entries',
    range: 'Ungrouped',
    headClass: 'era--historical',
    tone: 'historical',
    note: 'These entries did not match any of the groupings above, so they are listed here rather '
      + 'than left out.',
  };

  /* ---------------------------------------------------------------- helpers */

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Only http(s) links are rendered as links. Anything else is shown as text, so
  // a bad value in the data can never become a javascript: or data: URL.
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function slug(s) {
    return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function isObj(x) { return x && typeof x === 'object'; }

  function isIsoDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  // "2026-07-30" to "30 July 2026". Parsed in UTC so the printed day never
  // shifts with the reader's timezone.
  function formatDay(iso) {
    if (!isIsoDay(iso)) return '';
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  // Full timestamp to "30 July 2026, 05:33 UTC".
  function formatStamp(iso) {
    if (typeof iso !== 'string' || !iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
      + ', ' + hh + ':' + mm + ' UTC';
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  function byId(list, key) {
    var out = {};
    (Array.isArray(list) ? list : []).forEach(function (x) {
      if (isObj(x) && x[key || 'id']) out[x[key || 'id']] = x;
    });
    return out;
  }

  /* ------------------------------------------------------------- citations */

  function citationLine(c) {
    var pub = esc(c.publisher || '');
    var text = esc(c.title || c.url || 'source');
    var url = safeUrl(c.url);
    var link = url
      ? '<a href="' + esc(url) + '" rel="noopener">' + text + '</a>'
      : text + ' <span class="quiet">(no link published)</span>';
    return pub ? pub + ', ' + link : link;
  }

  function citationsHtml(cits) {
    var list = (Array.isArray(cits) ? cits : []).filter(isObj);
    if (!list.length) {
      return '<p class="cite-caveat"><strong>Unsourced.</strong> This entry reached the page '
        + 'without a citation, which should not happen. Treat it as unverified until a source is '
        + 'attached.</p>';
    }
    if (list.length === 1) {
      // .cite writes the word "Source: " itself.
      return '<p class="cite">' + citationLine(list[0]) + '</p>';
    }
    return '<ul class="cite-list" aria-label="Sources for this entry">'
      + list.map(function (c) { return '<li>' + citationLine(c) + '</li>'; }).join('')
      + '</ul>';
  }

  /* ----------------------------------------------------------------- entry */

  function entryHtml(entry, ctx) {
    var tone = ctx.tone === 'live' ? 'live' : 'historical';
    var cls = 'event event--' + tone;
    var id = entry.id ? ' id="entry-' + esc(slug(entry.id)) + '"' : '';
    var date = entry.date_display || entry.sort_date || 'Date not stated';
    var sourced = (Array.isArray(entry.citations) ? entry.citations : []).filter(isObj).length > 0;

    var tags = [];
    var cat = ctx.categories[entry.category];
    if (cat && cat.label) {
      tags.push('<span class="tag"' + (cat.note ? ' title="' + esc(cat.note) + '"' : '') + '>'
        + esc(cat.label) + '</span>');
    } else if (entry.category) {
      tags.push('<span class="tag">' + esc(entry.category) + '</span>');
    }

    var cert = ctx.certainty[entry.certainty];
    var certLabel = cert && cert.label ? cert.label : entry.certainty;
    if (entry.certainty && entry.certainty !== 'established') {
      tags.push('<span class="tag tag--presumptive"'
        + (cert && cert.note ? ' title="' + esc(cert.note) + '"' : '')
        + '>' + esc(certLabel) + '</span>');
    }

    if (entry.origin === 'generated') {
      var t = 'Generated from data held by this tracker every time the daily build runs.';
      if (entry.generated_from) t += ' Built from: ' + entry.generated_from + '.';
      tags.push('<span class="tag tag--signal" title="' + esc(t) + '">Live data</span>');
    }

    if (!sourced) tags.push('<span class="tag tag--solid">Unsourced</span>');

    var parts = [];
    parts.push('<h4 class="event__title">' + esc(entry.title || 'Untitled entry') + '</h4>');
    if (entry.body) parts.push('<p class="event__text">' + esc(entry.body) + '</p>');

    if (entry.quote) {
      parts.push('<blockquote class="quote"><p>&ldquo;' + esc(entry.quote) + '&rdquo;</p>'
        + (entry.quote_attribution
          ? '<span class="quote__attr">' + esc(entry.quote_attribution) + '</span>' : '')
        + '</blockquote>');
    }

    if (tags.length) parts.push('<p class="event__tags">' + tags.join('') + '</p>');

    // Say why a fact is not settled, in words, next to the fact.
    if (entry.certainty && entry.certainty !== 'established' && cert && cert.note) {
      parts.push('<p class="cite-caveat">' + esc(certLabel) + '. ' + esc(cert.note) + '</p>');
    }

    parts.push(citationsHtml(entry.citations));

    return '<li class="' + cls + '"' + id + '>'
      + '<div class="event__date">' + esc(date) + '</div>'
      + '<div class="event__body">' + parts.join('') + '</div>'
      + '</li>';
  }

  /* -------------------------------------------------------------- sections */

  function renderOverview(data, entries) {
    var citations = entries.reduce(function (n, e) {
      return n + (Array.isArray(e.citations) ? e.citations.filter(isObj).length : 0);
    }, 0);
    var generated = entries.filter(function (e) { return e.origin === 'generated'; }).length;

    var figs = [
      { num: entries.length, label: 'Sourced ' + plural(entries.length, 'entry', 'entries') },
      { num: citations, label: plural(citations, 'Citation', 'Citations') },
      {
        num: generated,
        label: 'Generated from live data',
        note: 'Australian entries, rebuilt by the daily build. The rest are hand curated and change '
          + 'only when the record does.',
      },
    ];

    var box = $('#overviewFigures');
    box.innerHTML = figs.map(function (f) {
      return '<div class="figure">'
        + '<span class="figure__num">' + esc(String(f.num)) + '</span>'
        + '<span class="figure__label">' + esc(f.label) + '</span>'
        + (f.note ? '<span class="figure__note">' + esc(f.note) + '</span>' : '')
        + '</div>';
    }).join('');
    box.hidden = false;

    var meta = [];
    var curated = formatDay(data.curated_updated);
    if (curated) meta.push('<span>Curated record updated ' + esc(curated) + '</span>');
    var stamp = formatStamp(data.generated_at);
    if (stamp) meta.push('<span>Australian entries generated ' + esc(stamp) + '</span>');
    meta.push('<span><a href="' + DATA_URL + '">View the raw data file</a></span>');
    var metaBox = $('#overviewMeta');
    metaBox.innerHTML = meta.join('');
    metaBox.hidden = false;

    if (stamp) $('#footStamp').textContent = 'Last generated ' + stamp + '.';
  }

  function renderSubtypeEntries(entries, ctx) {
    var picked = entries.filter(function (e) { return e.category === 'subtype_distinction'; });
    var box = $('#subtypeEntries');
    if (!picked.length) {
      box.innerHTML = '<li class="event event--historical">'
        + '<div class="event__date">Not available</div>'
        + '<div class="event__body"><p class="event__text">The sourced entries for this section '
        + 'are not in the current data file. The explanation above stands, but read it against the '
        + 'sources on the <a href="index.html#sources">data sources</a> list rather than as cited '
        + 'here.</p></div></li>';
      return picked;
    }
    box.innerHTML = picked.map(function (e) {
      return entryHtml(e, { tone: 'historical', categories: ctx.categories, certainty: ctx.certainty });
    }).join('');
    return picked;
  }

  function renderDateNote(data) {
    if (!data.date_note) return;
    var el = $('#dateNote');
    el.textContent = data.date_note;
    el.hidden = false;
  }

  function renderTimeline(entries, ctx) {
    var pool = entries.slice().sort(function (a, b) {
      var x = String(a.sort_date || ''), y = String(b.sort_date || '');
      return x < y ? -1 : x > y ? 1 : 0;
    });

    var groups = ERAS.map(function (era) { return { era: era, items: [] }; });
    var leftovers = [];

    pool.forEach(function (e) {
      if (!isIsoDay(e.sort_date)) { leftovers.push(e); return; }
      for (var i = 0; i < ERAS.length; i++) {
        if (ERAS[i].match(e)) { groups[i].items.push(e); return; }
      }
      leftovers.push(e);
    });
    if (leftovers.length) groups.push({ era: UNPLACED, items: leftovers });

    var html = groups.filter(function (g) { return g.items.length; }).map(function (g) {
      var era = g.era;
      var n = g.items.length;
      return '<section class="era ' + era.headClass + '" aria-labelledby="era-' + esc(era.id) + '">'
        + '<div class="era__head">'
        + '<h3 class="era__title" id="era-' + esc(era.id) + '">' + esc(era.title) + '</h3>'
        + '<p class="era__range">' + esc(era.range) + ' &middot; ' + n + ' '
        + plural(n, 'entry', 'entries') + '</p>'
        + '<p class="era__note">' + esc(era.note) + '</p>'
        + '</div>'
        + '<ol class="events">'
        + g.items.map(function (e) {
          return entryHtml(e, { tone: era.tone, categories: ctx.categories, certainty: ctx.certainty });
        }).join('')
        + '</ol>'
        + '</section>';
    }).join('');

    $('#timelineRoot').innerHTML = html
      || '<p class="table-empty">The data file loaded but held no timeline entries.</p>';

    return { placed: pool.length - leftovers.length, leftover: leftovers.length };
  }

  function renderDl(target, rows) {
    var el = $(target);
    if (!rows.length) { el.innerHTML = ''; return; }
    el.innerHTML = rows.map(function (r) {
      return '<div class="dl-row"><dt class="dl-key">' + esc(r.key) + '</dt>'
        + '<dd class="dl-val">' + esc(r.val) + '</dd></div>';
    }).join('');
  }

  function renderBuild(data, entries, shown) {
    if (data.note) {
      $('#datasetNote').innerHTML = '<p>' + esc(data.note) + '</p>';
    }

    var curated = entries.filter(function (e) { return e.origin === 'curated'; }).length;
    var generated = entries.filter(function (e) { return e.origin === 'generated'; }).length;
    var other = entries.length - curated - generated;

    var bits = [];
    bits.push(entries.length + ' ' + plural(entries.length, 'entry', 'entries') + ' on this page: '
      + curated + ' hand curated, ' + generated + ' generated from live data'
      + (other > 0 ? ', ' + other + ' with no origin recorded' : '') + '.');
    if (shown.subtype > 0) {
      bits.push(shown.subtype + ' of them ' + plural(shown.subtype, 'is', 'are') + ' set out under '
        + 'H5 versus H7 rather than in the timeline, because they are background rather than dated '
        + 'events.');
    }
    if (data.counts && typeof data.counts.dropped === 'number') {
      bits.push('Entries dropped by this build for want of a citation: ' + data.counts.dropped + '.');
    }
    if (data.entries_order) bits.push('Order: ' + data.entries_order + '.');
    $('#datasetCounts').textContent = bits.join(' ');

    renderDl('#certaintyKey', (Array.isArray(data.certainty_levels) ? data.certainty_levels : [])
      .filter(isObj).map(function (c) {
        return { key: c.label || c.id || '', val: c.note || '' };
      }));

    renderDl('#categoryKey', (Array.isArray(data.categories) ? data.categories : [])
      .filter(isObj).map(function (c) {
        return { key: c.label || c.id || '', val: c.note || '' };
      }));
  }

  /* --------------------------------------------------------------- failure */

  function fail(reason) {
    var notice = $('#loadNotice');
    // Say which of the two failures happened, because they mean different things:
    // a file that never arrived is probably transient, a file that arrived empty
    // is a problem with the build.
    var lead;
    if (reason && reason.dataArrived) {
      lead = 'The data file for this page loaded but held no usable entries, so none are shown. '
        + 'That points at the daily build rather than at your connection.';
    } else {
      lead = 'The data file for this page did not load, so no entries are shown.';
      if (location.protocol === 'file:') {
        lead += ' This page is being read straight off the disk, and browsers block data files '
          + 'loaded that way. Serving the site folder over HTTP will fix it.';
      }
    }
    notice.innerHTML = '<div class="wrap"><p><strong>Timeline unavailable.</strong> ' + esc(lead)
      + ' Nothing on this page is guessed, so it shows nothing rather than something approximate. '
      + 'Try again shortly, read the file directly at <a href="' + DATA_URL + '">' + DATA_URL
      + '</a>, or go back to the <a href="index.html">tracker</a>.</p></div>';
    notice.hidden = false;

    $('#timelineRoot').innerHTML = '<p class="table-empty">No entries loaded. '
      + 'The written explanation above is unaffected.</p>';

    $('#subtypeEntries').innerHTML = '<li class="event event--historical">'
      + '<div class="event__date">Not loaded</div>'
      + '<div class="event__body"><p class="event__text">The sourced entries for this section could '
      + 'not be loaded. The explanation above stands on the sources listed under '
      + '<a href="index.html#sources">data sources</a>.</p></div></li>';

    $('#datasetCounts').textContent = 'Counts unavailable while the data file is not loading.';

    if (reason) console.error('history.json did not load:', reason);
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var err;
        if (!isObj(data)) {
          err = new Error('unexpected shape');
          err.dataArrived = true;
          throw err;
        }
        var entries = (Array.isArray(data.entries) ? data.entries : []).filter(isObj);
        if (!entries.length) {
          err = new Error('no entries in data file');
          err.dataArrived = true;
          throw err;
        }

        var ctx = {
          categories: byId(data.categories, 'id'),
          certainty: byId(data.certainty_levels, 'id'),
        };

        renderOverview(data, entries);
        var subtype = renderSubtypeEntries(entries, ctx);
        renderDateNote(data);

        // The timeline carries every entry except the background pieces already
        // set out under H5 versus H7, so nothing appears twice and nothing is
        // left out.
        var timelineEntries = entries.filter(function (e) {
          return e.category !== 'subtype_distinction';
        });
        var result = renderTimeline(timelineEntries, ctx);

        renderBuild(data, entries, { subtype: subtype.length });

        if (result.leftover) {
          console.warn(result.leftover + ' entr(y/ies) matched no era grouping and were listed '
            + 'under "Further entries".');
        }
      })
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
