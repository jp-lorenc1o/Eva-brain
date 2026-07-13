/* A small live Eva brain: the same marks as the app's graph surface.
   Ink cores with a paper stroke and graphite lift (#lift), quiet grey link
   lines, and the red pen reserved for the selected page and its edges.
   Vanilla JS, no dependencies; a miniature of apps/desktop/src/main.ts. */

(function () {
  'use strict';

  // Node inks, verbatim from the app's TYPE_COLORS (main.ts).
  var TYPE_COLORS = {
    index: '#7c3a2d',
    entity: '#5c7150',
    concept: '#46617d',
    summary: '#8c6a4f',
    analysis: '#7c5b78',
  };
  var TYPE_LABELS = {
    index: 'Index',
    entity: 'Entity',
    concept: 'Concept',
    summary: 'Summary',
    analysis: 'Analysis',
  };

  // An illustrative brain: a few Berkshire shareholder letters ingested into
  // entities, concepts, summaries, and one saved analysis.
  var NODES = [
    { id: 'home', title: 'Home', type: 'index' },
    { id: 'warren-buffett', title: 'Warren Buffett', type: 'entity' },
    { id: 'charlie-munger', title: 'Charlie Munger', type: 'entity' },
    { id: 'berkshire', title: 'Berkshire Hathaway', type: 'entity' },
    { id: 'compounding', title: 'Compounding', type: 'concept' },
    { id: 'float', title: 'Insurance float', type: 'concept' },
    { id: 'moats', title: 'Moats', type: 'concept' },
    { id: 'letter-1977', title: '1977 letter', type: 'summary' },
    { id: 'letter-1983', title: '1983 letter', type: 'summary' },
    { id: 'letter-2015', title: '2015 letter', type: 'summary' },
    { id: 'float-analysis', title: 'Why float compounds', type: 'analysis' },
  ];

  var EDGES = [
    ['home', 'warren-buffett'],
    ['home', 'berkshire'],
    ['home', 'compounding'],
    ['home', 'float-analysis'],
    ['warren-buffett', 'berkshire'],
    ['warren-buffett', 'charlie-munger'],
    ['warren-buffett', 'letter-1977'],
    ['berkshire', 'float'],
    ['berkshire', 'letter-1983'],
    ['compounding', 'letter-1977'],
    ['compounding', 'letter-2015'],
    ['float', 'letter-2015'],
    ['float', 'float-analysis'],
    ['moats', 'letter-1983'],
    ['moats', 'charlie-munger'],
    ['float-analysis', 'letter-1977'],
  ];

  // The ingest story the auto-selection walks through: a source arrives,
  // then the pages it fed light up in turn.
  var TOUR = ['letter-1977', 'compounding', 'warren-buffett', 'float-analysis', null];

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var W = 720;
  var H = 540;
  var CX = W / 2;
  var CY = H / 2 - 14;

  var svg = document.getElementById('brain');
  var legendEl = document.getElementById('legend');
  if (!svg) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var byId = {};
  NODES.forEach(function (node, i) {
    // Golden-angle seeding around the center, like the app's atlas.
    var angle = i * Math.PI * (3 - Math.sqrt(5));
    var radius = node.type === 'index' ? 0 : 90 + 34 * Math.sqrt(i + 1);
    node.x = CX + radius * Math.cos(angle);
    node.y = CY + radius * Math.sin(angle);
    node.vx = 0;
    node.vy = 0;
    node.phase = i * 1.7;
    byId[node.id] = node;
  });

  var edges = EDGES.map(function (pair) {
    return { source: byId[pair[0]], target: byId[pair[1]] };
  });

  /* Build the SVG exactly the way the app does: defs with the graphite lift,
     one line per edge, one group per node (ring + core + label). */
  var defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    '<filter id="lift" x="-60%" y="-60%" width="220%" height="220%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#3c3728" flood-opacity="0.35"/>' +
    '</filter>';
  svg.appendChild(defs);

  var lineEls = edges.map(function (edge) {
    var line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'edge');
    line.dataset.source = edge.source.id;
    line.dataset.target = edge.target.id;
    svg.appendChild(line);
    return line;
  });

  var nodeEls = NODES.map(function (node) {
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node');
    g.dataset.id = node.id;
    var ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('r', '15');
    var core = document.createElementNS(SVG_NS, 'circle');
    core.setAttribute('class', 'core');
    core.setAttribute('r', '8');
    core.setAttribute('fill', TYPE_COLORS[node.type]);
    core.setAttribute('filter', 'url(#lift)');
    var label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('y', '24');
    label.textContent = node.title;
    g.appendChild(ring);
    g.appendChild(core);
    g.appendChild(label);
    g.addEventListener('click', function (event) {
      event.stopPropagation();
      userTouched = Date.now();
      select(node.id === selectedId ? null : node.id);
    });
    svg.appendChild(g);
    return g;
  });

  if (legendEl) {
    Object.keys(TYPE_COLORS).forEach(function (type) {
      var key = document.createElement('span');
      key.className = 'key';
      var dot = document.createElement('span');
      dot.className = 'type-dot';
      dot.style.setProperty('--dot', TYPE_COLORS[type]);
      key.appendChild(dot);
      key.appendChild(document.createTextNode(TYPE_LABELS[type]));
      legendEl.appendChild(key);
    });
  }

  /* Selection mirrors the app's select(): the chosen page gets the dashed
     red ring, its real links go red, and everything else recedes. */
  var selectedId = null;
  var userTouched = 0;

  function select(id) {
    selectedId = id;
    if (!id) {
      svg.classList.remove('focused');
      nodeEls.forEach(function (el) { el.classList.remove('selected', 'faded'); });
      lineEls.forEach(function (el) { el.classList.remove('lit', 'faded'); });
      return;
    }
    var neighborhood = {};
    neighborhood[id] = true;
    lineEls.forEach(function (line) {
      var touches = line.dataset.source === id || line.dataset.target === id;
      line.classList.toggle('lit', touches);
      if (touches) {
        neighborhood[line.dataset.source] = true;
        neighborhood[line.dataset.target] = true;
      }
    });
    lineEls.forEach(function (line) {
      line.classList.toggle(
        'faded',
        !(neighborhood[line.dataset.source] && neighborhood[line.dataset.target])
      );
    });
    nodeEls.forEach(function (el) {
      el.classList.toggle('selected', el.dataset.id === id);
      el.classList.toggle('faded', !neighborhood[el.dataset.id]);
    });
    svg.classList.add('focused');
  }

  svg.addEventListener('click', function () {
    userTouched = Date.now();
    select(null);
  });

  /* Tiny force layout: springs along links, charge between marks, a gentle
     pull to the page center. After it settles, a quiet ambient sway keeps
     the brain feeling alive; reduced motion settles instantly and holds. */
  function tick(time) {
    var i, j, a, b, dx, dy, dist, force;

    for (i = 0; i < NODES.length; i++) {
      for (j = i + 1; j < NODES.length; j++) {
        a = NODES[i];
        b = NODES[j];
        dx = b.x - a.x;
        dy = b.y - a.y;
        dist = Math.max(24, Math.sqrt(dx * dx + dy * dy));
        force = 2600 / (dist * dist);
        dx /= dist;
        dy /= dist;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    edges.forEach(function (edge) {
      var rest = edge.source.type === 'index' || edge.target.type === 'index' ? 132 : 104;
      var ex = edge.target.x - edge.source.x;
      var ey = edge.target.y - edge.source.y;
      var d = Math.max(1, Math.sqrt(ex * ex + ey * ey));
      var pull = (d - rest) * 0.02;
      ex /= d;
      ey /= d;
      edge.source.vx += ex * pull;
      edge.source.vy += ey * pull;
      edge.target.vx -= ex * pull;
      edge.target.vy -= ey * pull;
    });

    NODES.forEach(function (node) {
      node.vx += (CX - node.x) * 0.004;
      node.vy += (CY - node.y) * 0.004;
      if (time !== undefined) {
        // Ambient sway: fractions of a pixel per frame, organic, unhurried.
        node.vx += 0.016 * Math.sin(time / 1400 + node.phase);
        node.vy += 0.016 * Math.cos(time / 1700 + node.phase * 1.3);
      }
      node.vx *= 0.84;
      node.vy *= 0.84;
      node.x = Math.min(W - 70, Math.max(70, node.x + node.vx));
      node.y = Math.min(H - 46, Math.max(34, node.y + node.vy));
    });
  }

  function draw() {
    edges.forEach(function (edge, i) {
      lineEls[i].setAttribute('x1', edge.source.x);
      lineEls[i].setAttribute('y1', edge.source.y);
      lineEls[i].setAttribute('x2', edge.target.x);
      lineEls[i].setAttribute('y2', edge.target.y);
    });
    NODES.forEach(function (node, i) {
      nodeEls[i].setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
    });
  }

  // Settle the layout before first paint so nothing flashes at the center.
  for (var s = 0; s < 320; s++) tick();
  draw();

  if (!reducedMotion) {
    var tourIndex = 0;
    window.setInterval(function () {
      // The tour yields to a person exploring the graph themselves.
      if (Date.now() - userTouched < 12000) return;
      select(TOUR[tourIndex]);
      tourIndex = (tourIndex + 1) % TOUR.length;
    }, 3600);

    var frame = function (time) {
      tick(time);
      draw();
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }
})();
