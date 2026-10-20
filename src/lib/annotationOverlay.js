// Annotation POIs drawn as a screen-space overlay on top of the 3D viewer. Every
// marker is projected from lng/lat/altitude with the same matrix the model is rendered
// with (pick3d.project), so it sits exactly on the picked surface point; a stem + dot
// shows the height above the model base. Also hosts the cursor "ghost" pin used while
// choosing a position, and the draggable draft pin used while editing.
import { ANNO_TYPES, annotationType } from './annotations';
import { project, pickSurface, altitudeAlongVertical, isOccluded } from './pick3d';
import pinIcon from '../assets/annotation/pin.svg';

const NS = 'http://www.w3.org/2000/svg';

export function createAnnotationOverlay(map, { onPick, onDraftDrag }) {
  const root = document.createElement('div');
  root.className = 'sams-anno-overlay';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';
  root.appendChild(svg);
  map.getContainer().appendChild(root);

  let pois = []; let draft = null; let ghost = null;

  const make = ({ a, icon, size, tipY, color, interactive, tip }) => {
    const el = document.createElement('div');
    el.className = 'sams-poi';
    el.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;pointer-events:${interactive ? 'auto' : 'none'};cursor:${interactive ? 'pointer' : 'default'};will-change:transform;`;
    const img = document.createElement('img');
    img.src = icon; img.width = size; img.height = size; img.draggable = false;
    img.style.cssText = 'display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));';
    el.appendChild(img);
    if (tip) {
      const t = document.createElement('span');
      t.className = 'sams-poi-tip';
      t.textContent = tip;
      el.appendChild(t);
    }
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-opacity', '0.75');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '4'); dot.setAttribute('fill', color); dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', '2');
    svg.append(line, dot);
    root.appendChild(el);
    return { a, el, line, dot, size, tipY, label: null, occluded: false };
  };
  const destroyRec = (r) => { r.el.remove(); r.line.remove(); r.dot.remove(); };

  const place = (r) => {
    const a = r.a;
    const head = project(map, a.lng, a.lat, a.alt || 0);
    const ground = project(map, a.lng, a.lat, 0);
    const show = !!head && !!ground;
    r.el.style.display = show ? '' : 'none';
    r.line.style.display = show ? '' : 'none';
    r.dot.style.display = show ? '' : 'none';
    if (!show) return;
    r.el.style.transform = `translate(${head.x - r.size / 2}px,${head.y - r.tipY}px)`;
    r.line.setAttribute('x1', head.x); r.line.setAttribute('y1', head.y); r.line.setAttribute('x2', ground.x); r.line.setAttribute('y2', ground.y);
    r.dot.setAttribute('cx', ground.x); r.dot.setAttribute('cy', ground.y);
  };
  const placeAll = () => { pois.forEach(place); if (draft) place(draft); if (ghost) place(ghost); };

  // Hidden-behind-the-model markers fade; checked once the camera settles (ray casts are not free).
  let occTimer = 0;
  const refreshOcclusion = () => {
    clearTimeout(occTimer);
    occTimer = setTimeout(() => {
      pois.forEach((r) => {
        const occ = isOccluded(map, r.a.lng, r.a.lat, r.a.alt || 0);
        r.occluded = occ;
        r.el.classList.toggle('sams-poi-dim', occ);
      });
    }, 140);
  };
  const onRender = () => placeAll();
  map.on('render', onRender);
  map.on('moveend', refreshOcclusion);

  // Dragging the draft pin's head: follow the model surface under the cursor; off the model,
  // slide along the pin's vertical line so height can still be adjusted.
  const bindDrag = (r) => {
    let dragging = false; let raf = 0; let last = null;
    const canvasXY = (e) => { const b = map.getCanvas().getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const apply = () => {
      raf = 0;
      if (!last) return;
      const [px, py] = canvasXY(last);
      const hit = pickSurface(map, px, py);
      if (hit) onDraftDrag({ lng: hit.lng, lat: hit.lat, alt: Math.round(hit.alt * 10) / 10 });
      else {
        const alt = altitudeAlongVertical(map, r.a.lng, r.a.lat, px, py);
        if (alt != null) onDraftDrag({ alt: Math.round(alt * 10) / 10 });
      }
    };
    r.el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); dragging = true; r.el.style.cursor = 'grabbing';
      try { r.el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });
    r.el.addEventListener('pointermove', (e) => { if (!dragging) return; last = e; if (!raf) raf = requestAnimationFrame(apply); });
    const end = (e) => { dragging = false; r.el.style.cursor = 'grab'; try { r.el.releasePointerCapture(e.pointerId); } catch { /* noop */ } };
    r.el.addEventListener('pointerup', end); r.el.addEventListener('pointercancel', end);
  };

  return {
    setData(list) {
      pois.forEach(destroyRec);
      pois = list.map((a) => {
        const t = ANNO_TYPES[annotationType(a)];
        const r = make({ a, icon: t.poi, size: 34, tipY: 34, color: t.color, interactive: true, tip: a.title });
        r.el.addEventListener('click', (e) => { e.stopPropagation(); onPick(a); });
        return r;
      });
      placeAll(); refreshOcclusion();
    },
    setDraft(a) {
      // Same pin being edited/dragged: just move it — recreating the element would drop the drag.
      if (draft && a && draft.a.id === a.id) { draft.a = a; place(draft); return; }
      if (draft) { destroyRec(draft); draft = null; }
      if (!a) return;
      draft = make({ a, icon: pinIcon, size: 48, tipY: 43, color: '#1677ff', interactive: true, tip: '끌어서 위치·높이 조정' });
      draft.el.style.cursor = 'grab';
      bindDrag(draft);
      place(draft);
    },
    // Cursor-following pin while picking a position; `label` is the live X/Y/altitude readout.
    setGhost(p, label) {
      if (!p) { if (ghost) { destroyRec(ghost); ghost = null; } return; }
      if (!ghost) {
        ghost = make({ a: p, icon: pinIcon, size: 48, tipY: 43, color: '#1677ff', interactive: false });
        ghost.el.style.opacity = '0.85';
        const l = document.createElement('div');
        l.className = 'sams-ghost-label';
        ghost.el.appendChild(l);
        ghost.labelEl = l;
      }
      ghost.a = p;
      ghost.labelEl.textContent = label || '';
      place(ghost);
    },
    // While choosing a position, markers must not swallow the click.
    setPicking(on) { root.classList.toggle('sams-anno-picking', !!on); },
    refresh: placeAll,
    destroy() {
      map.off('render', onRender); map.off('moveend', refreshOcclusion); clearTimeout(occTimer);
      pois.forEach(destroyRec); if (draft) destroyRec(draft); if (ghost) destroyRec(ghost);
      root.remove();
    },
  };
}
