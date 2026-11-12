// Annotations: notes / photos / panoramas pinned onto a 3D model at a lng/lat
// plus an altitude (m). They belong to a *space* (e.g. 'HQ(이마트)'), not to one scan:
// the same pin shows on every acquisition epoch of that space. There is no backend or login yet, so records live in
// localStorage and ANNOTATION_ADMIN stands in for the admin role — flip it per
// user once auth exists. Private annotations are hidden from non-admins.
import { useSyncExternalStore } from 'react';
import { ITEMS } from '../data/explorerData';
import layerMemo from '../assets/annotation/layer-memo.svg';
import layerPhoto from '../assets/annotation/layer-photo.svg';
import layerPano from '../assets/annotation/layer-panorama.svg';
import poiMemo from '../assets/annotation/poi-memo.svg';
import poiPhoto from '../assets/annotation/poi-photo.svg';
import poiPano from '../assets/annotation/poi-panorama.svg';

export const ANNOTATION_ADMIN = true;
export const ALT_MAX = 300;
export const DESC_MAX = 100;

export const ANNO_TYPES = {
  memo: { label: '텍스트', layerIcon: layerMemo, poi: poiMemo, color: '#079CF8' },
  photo: { label: '사진', layerIcon: layerPhoto, poi: poiPhoto, color: '#7B61FF' },
  pano: { label: '파노라마', layerIcon: layerPano, poi: poiPano, color: '#F87307' },
};
export const ANNO_TYPE_KEYS = ['memo', 'photo', 'pano'];

// 유형은 첨부에 따라 자동으로 정해진다: 파노라마가 있으면 파노라마, 사진이 있으면 사진, 아니면 텍스트(유형 키는 memo — 화면에서 '메모'는 기능 이름이라 유형은 '텍스트'로 부른다).
export const annotationType = (a) => (a.panos && a.panos.length ? 'pano' : a.photos && a.photos.length ? 'photo' : 'memo');

const KEY = 'sams.annotations.v6';
// 엑셀·외장하드 데이터로 바꾸면서 예전 메모(옛 3D 자료에 붙어 있던 샘플과 테스트 기록)은 모두 버린다.
const OLD_KEYS = ['sams.annotations.v5', 'sams.annotations.v4', 'sams.annotations.v3', 'sams.annotations.v2', 'sams.annotations.v1'];
const base = import.meta.env.BASE_URL;
const url = (p) => base + p.replace(/^\//, '');

// Records saved before spaces existed get the space of the nearest item (within ~300 m).
function spaceFor(a) {
  if (a.lng == null) return undefined; // 위치 없는 메모
  let best = null; let bd = Infinity;
  for (const it of ITEMS) {
    const lng = it.lng ?? it.projectLng; const lat = it.lat ?? it.projectLat;
    if (lng == null || !it.space) continue;
    const d = Math.hypot((lng - a.lng) * 88000, (lat - a.lat) * 111000);
    if (d < bd) { bd = d; best = it.space; }
  }
  return bd < 300 ? best : undefined;
}
function load() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw).map((a) => ('space' in a ? a : { ...a, space: spaceFor(a) }));
  } catch { /* 저장소를 못 읽으면 빈 목록으로 시작 */ }
  return [];
}

let list = load();
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export const getAnnotations = () => list;
export function useAnnotations() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, getAnnotations);
}

// Returns false when the browser storage quota rejects the write (big photos).
export function saveAnnotation(a) {
  const prev = list;
  const i = list.findIndex((x) => x.id === a.id);
  list = i >= 0 ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];
  if (!persist()) { list = prev; return false; }
  emit();
  return true;
}
export function deleteAnnotation(id) {
  list = list.filter((x) => x.id !== id);
  persist();
  emit();
}
export function setAnnotationVisibility(id, visibility) {
  const a = list.find((x) => x.id === id);
  if (a) saveAnnotation({ ...a, visibility });
}

export const newAnnotationId = () => 'an' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export const blankAnnotation = (lng, lat, alt = 30, space, itemId) => ({
  id: newAnnotationId(), lng, lat, alt, space: space || undefined, itemId: itemId || undefined, title: '', desc: '', tags: [], urls: [], photos: [], panos: [], visibility: 'public', createdAt: Date.now(), isNew: true,
});

// Downscale an image file to a JPEG data URL so a few attachments fit in localStorage.
export function readImageFile(file, maxEdge = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
