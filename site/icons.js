/* Category marks for the H5 bird flu tracker.
 *
 * Five stroked marks, one per category in the data: human, poultry, dairy,
 * wild_bird, mammal. Vanilla JS, no dependencies, no build step, no network.
 *
 * Why they look like this
 * ----------------------
 * Colour on this site now encodes strain and era (red for the live H5N1 clade
 * 2.3.4.4b incursion, grey for the resolved 2024 to 2025 H7 poultry outbreaks
 * and the unrelated 2024 human case), so a category can never be carried by
 * colour. Every mark therefore has to survive in pure black on white at 14px.
 * That rules out fine detail and rules out anything that depends on hue.
 *
 * The set is built as one system on a shared 16 by 16 grid, single stroke
 * width, butt caps, mitre joins, mostly rectilinear, so the marks sit beside
 * Source Code Pro like the stamps on a shipping manifest rather than like app
 * icons. There is no cartoon chicken, no cow head and no human silhouette.
 *
 * The vocabulary is deliberately small and is reused across the set:
 *   chevron  a bird, drawn as a hard angular caret
 *   envelope whether the host is contained (a pen, a vessel) or not
 *   unit     a single solid square, one individual
 *   ground   a horizontal rule the host stands on
 *
 * Which gives:
 *   human      four corner brackets around one solid unit. A single individual,
 *              enumerated and flagged. Not a person shape.
 *   poultry    one chevron inside a low pen, walls and floor. A bird that is
 *              housed.
 *   dairy      an open vessel with a rim and a level line. The dairy system,
 *              abstracted through the vat rather than through the animal.
 *   wild_bird  three chevrons in open air, no envelope at all.
 *   mammal     a body rule on three legs, tail up at one end and neck up at the
 *              other. A four-limbed animal in profile, terrestrial, which is
 *              exactly what separates it from a bird. Five straight strokes, no
 *              face, no fur, no paw print.
 *
 * The contained hosts (poultry, dairy) both read as vessels and the free hosts
 * (wild_bird, mammal) both stand in open space. That kinship is deliberate: it
 * is the same distinction the data cares about, farmed against free-living.
 *
 * The hard pair is poultry against wild_bird, so it is solved at silhouette
 * level, not at detail level: both use the same chevron, and the only question
 * the eye has to answer at 14px is "is it penned or is it loose". Contained
 * versus free is also the real epidemiological distinction between the two, so
 * the mark carries meaning rather than decoration. Wild_bird then gets three
 * chevrons and poultry one, so the two also differ in count and in rhythm even
 * if the pen were cropped away.
 *
 * Rasterised and inspected at 14, 16 and 24px in black on white. The closest
 * pair at 14px is not poultry against wild_bird, it is poultry against dairy,
 * since both are open-topped containers. They separate on width (the pen is
 * 12.5 units wide, the vessel 6.5), on the vessel's overhanging rim, and on the
 * interior mark: a diagonal chevron in the pen, a full-width horizontal level
 * line in the vessel. Keep those three differences if the geometry is ever
 * touched.
 *
 * Colour and sizing
 * -----------------
 * Everything is drawn in currentColor, so the mark inherits whatever the
 * surrounding text is using. Set colour on the parent, never inside here:
 *   .is-live .mark { color: var(--live); }        live H5N1 clade 2.3.4.4b
 *   .is-historical .mark { color: var(--ink-2); } resolved H7, 2024 human case
 * Stroke width scales with the mark, so optical weight is constant at any size.
 *
 * Measured against white: --ink #101010 is 19.0:1, --ink-2 #4A4A4A is 8.9:1,
 * --live #C8102E is 5.9:1, --ink-3 #8C8C8C is 3.36:1. All clear the 3:1 WCAG
 * minimum for non-text contrast, but #8C8C8C at 14px is thin once antialiased,
 * so historical marks are better in --ink-2 even where their text is --ink-3.
 * Colour is never the only difference between two marks: shape carries the
 * category and a text label or an accessible name always carries the meaning.
 *
 * Accessibility
 * -------------
 * A mark that sits next to its own text label must not be announced twice, so
 * mark() is decorative by default: aria-hidden, not focusable. Pass
 * { labelled: true } only when the mark stands alone with no adjacent text, and
 * it is then exposed as role="img" with an accessible name from NAMES.
 */
'use strict';

var Icons = (function () {
  var GRID = 16;          // viewBox is 0 0 16 16 for every mark
  var STROKE = 1.5;       // one stroke width across the whole set
  var DEFAULT_SIZE = 16;

  var KEYS = ['human', 'poultry', 'dairy', 'wild_bird', 'mammal'];

  // Short visible text, for legends, table cells and filter buttons.
  var LABELS = {
    human: 'Human',
    poultry: 'Poultry',
    dairy: 'Dairy cattle',
    wild_bird: 'Wild birds',
    mammal: 'Other mammals',
  };

  // Accessible name, used only when a mark stands alone.
  var NAMES = {
    human: 'Human case',
    poultry: 'Poultry detection',
    dairy: 'Dairy cattle detection',
    wild_bird: 'Wild bird detection',
    mammal: 'Mammal detection',
  };

  // One line each, for a legend that explains the mark rather than just naming
  // it. Plain description of the drawing, no claims about the data.
  var NOTES = {
    human: 'One unit inside corner brackets: a single person.',
    poultry: 'A bird inside a pen: housed or commercial birds.',
    dairy: 'An open vessel with a level line: the dairy system.',
    wild_bird: 'Three birds in open air, unenclosed.',
    mammal: 'A four-limbed animal in profile, standing on the ground.',
  };

  // Geometry. Coordinates are on the 16 by 16 grid. Live area is kept inside
  // 1.25 to 14.75 so a 1.5 stroke never clips at the viewBox edge.
  var SHAPES = {
    human: {
      paths: [
        'M2 6V2h4',            // top left bracket
        'M10 2h4v4',           // top right bracket
        'M14 10v4h-4',         // bottom right bracket
        'M6 14H2v-4',          // bottom left bracket
      ],
      // the single individual, solid so it holds at 14px
      rects: [{ x: 6.25, y: 6.25, w: 3.5, h: 3.5 }],
    },
    poultry: {
      paths: [
        'M1.75 6v7.5h12.5V6',    // the pen: floor and two walls, wide and low
        'M4.5 11 8 8l3.5 3',     // one chevron, housed inside it
      ],
      rects: [],
    },
    dairy: {
      paths: [
        'M2.5 4.5h11',                 // rim, wider than the body
        'M4.75 4.5v9h6.5v-9',          // open vessel
        'M4.75 9.25h6.5',              // level line
      ],
      rects: [],
    },
    wild_bird: {
      paths: [
        'M1.75 13 5.25 9.25 8.75 13',   // near bird
        'M8 9 11 5.75 14 9',            // second bird, higher and further right
        'M2.5 6.5 4.5 4.25 6.5 6.5',    // third bird, sets the flock rhythm
      ],
      rects: [],
    },
    mammal: {
      paths: [
        'M2.5 5.25v2h10v-3h1.75', // tail up, body rule, neck up, head
        'M3.75 7.25v6',           // legs
        'M8 7.25v6',
        'M12 7.25v6',
      ],
      rects: [],
    },
  };

  // Shown when a record carries a category we do not have a mark for. It says
  // "unspecified", it does not guess which of the five it might be.
  var FALLBACK = {
    paths: ['M2.75 2.75h10.5v10.5H2.75z'],
    rects: [],
    label: 'Unspecified',
    name: 'Unspecified category',
    note: 'An empty frame: category not stated by the source.',
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shapeFor(key) {
    return Object.prototype.hasOwnProperty.call(SHAPES, key) ? SHAPES[key] : FALLBACK;
  }

  function labelFor(key) {
    return Object.prototype.hasOwnProperty.call(LABELS, key) ? LABELS[key] : FALLBACK.label;
  }

  function nameFor(key) {
    return Object.prototype.hasOwnProperty.call(NAMES, key) ? NAMES[key] : FALLBACK.name;
  }

  function noteFor(key) {
    return Object.prototype.hasOwnProperty.call(NOTES, key) ? NOTES[key] : FALLBACK.note;
  }

  /* mark(key, opts) returns SVG markup as a string.
   *
   * opts.size      pixel size of the square mark, default 16
   * opts.labelled  true only when the mark stands alone. Exposes it as
   *                role="img" with an accessible name. Default false, which
   *                renders it aria-hidden so an adjacent text label is not
   *                announced twice.
   * opts.name      override the accessible name, used with labelled: true
   * opts.className extra class names, appended after "mark mark-<key>"
   */
  function mark(key, opts) {
    var o = opts || {};
    var size = Number(o.size) || DEFAULT_SIZE;
    var shape = shapeFor(key);
    var cls = 'mark mark-' + String(key).replace(/[^a-z0-9_-]/gi, '');
    if (o.className) cls += ' ' + o.className;

    var a11y = o.labelled
      ? ' role="img" aria-label="' + esc(o.name || nameFor(key)) + '"'
      : ' aria-hidden="true"';

    var body = shape.paths.map(function (d) {
      return '<path d="' + d + '"/>';
    }).join('');
    body += (shape.rects || []).map(function (r) {
      return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h
        + '" fill="currentColor" stroke="none"/>';
    }).join('');

    return '<svg class="' + esc(cls) + '" width="' + size + '" height="' + size
      + '" viewBox="0 0 ' + GRID + ' ' + GRID + '" fill="none" stroke="currentColor"'
      + ' stroke-width="' + STROKE + '" stroke-linecap="butt" stroke-linejoin="miter"'
      + ' focusable="false"' + a11y + '>' + body + '</svg>';
  }

  /* withLabel(key, opts) returns a mark plus its visible text, correctly paired:
   * the mark is aria-hidden and the text carries the meaning.
   * Markup only, no inline styles. Needs .cat / .cat-mark / .cat-text in CSS.
   */
  function withLabel(key, opts) {
    var o = opts || {};
    var text = o.text || labelFor(key);
    return '<span class="cat cat-' + String(key).replace(/[^a-z0-9_-]/gi, '') + '">'
      + mark(key, { size: o.size, className: 'cat-mark' })
      + '<span class="cat-text">' + esc(text) + '</span></span>';
  }

  /* Region selector. The emoji flags are gone and nothing replaces them: no
   * flag, no globe, no mark of any kind. A flag is a nation, not a dataset, and
   * a third mark family beside the category marks and the strain colour would
   * be one signal too many. The treatment is plain uppercase letterspaced text,
   * which in a monospace face already reads as a control.
   *
   * The text is here, the letterspacing belongs in CSS on the button:
   *   .chip { text-transform: uppercase; letter-spacing: 0.14em; }
   * Labels are stored already uppercased so a browser without
   * text-transform support still shows the intended form.
   */
  var REGION_LABELS = { au: 'AUSTRALIA', global: 'GLOBAL', us: 'UNITED STATES' };
  var REGION_NAMES = {
    au: 'Show Australia',
    global: 'Show global detections',
    us: 'Show United States',
  };

  function regionLabel(key) {
    return Object.prototype.hasOwnProperty.call(REGION_LABELS, key)
      ? REGION_LABELS[key] : String(key || '').toUpperCase();
  }

  function regionName(key) {
    return Object.prototype.hasOwnProperty.call(REGION_NAMES, key)
      ? REGION_NAMES[key] : regionLabel(key);
  }

  return {
    GRID: GRID,
    STROKE: STROKE,
    KEYS: KEYS,
    LABELS: LABELS,
    NAMES: NAMES,
    NOTES: NOTES,
    SHAPES: SHAPES,
    FALLBACK: FALLBACK,
    mark: mark,
    withLabel: withLabel,
    label: labelFor,
    name: nameFor,
    note: noteFor,
    REGION_LABELS: REGION_LABELS,
    REGION_NAMES: REGION_NAMES,
    regionLabel: regionLabel,
    regionName: regionName,
  };
})();

// Loaded as a classic script, so Icons is a global. The repo is "type": "module"
// for the pipeline, so no CommonJS export is added here: it would be dead code.
if (typeof window !== 'undefined') window.Icons = Icons;
