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
  memo: { label: '메모', layerIcon: layerMemo, poi: poiMemo, color: '#079CF8' },
  photo: { label: '사진', layerIcon: layerPhoto, poi: poiPhoto, color: '#7B61FF' },
  pano: { label: '파노라마', layerIcon: layerPano, poi: poiPano, color: '#F87307' },
};
export const ANNO_TYPE_KEYS = ['memo', 'photo', 'pano'];

// 유형은 첨부에 따라 자동으로 정해진다: 파노라마가 있으면 파노라마, 사진이 있으면 사진, 아니면 메모.
export const annotationType = (a) => (a.panos && a.panos.length ? 'pano' : a.photos && a.photos.length ? 'photo' : 'memo');

const KEY = 'sams.annotations.v4';
const LEGACY_KEYS = ['sams.annotations.v3', 'sams.annotations.v2', 'sams.annotations.v1'];
const base = import.meta.env.BASE_URL;
const url = (p) => base + p.replace(/^\//, '');

const SEED_SPACE = 'HQ(이마트)'; // 샘플은 HQ(이마트) 성수클러스터 1차 3D 데이터 위에 둔다
const SEED_ITEM = 'BD_HQ-n2'; // 어노테이션은 3D 데이터가 취득된 시기(회차)마다 따로 붙는다
const SEED_IDS = ['an1', 'an2', 'an3', 'an4', 'an5'];

function seed() {
  // 좌표·고도는 모델 표면을 직접 찍어 얻은 값이다(고도 = 길(지면) 기준 높이, 그 지점 표면 + 약 1.5m). 모델 위치를 다시 맞추면 함께 갱신한다.
  const at = (lng, lat) => ({ lng, lat });
  const t = Date.now();
  return [
    { id: 'an1', ...at(127.0529932, 37.5399702), alt: 84, title: '옥상 설비 점검 필요', desc: '옥상 실외기 구역 배관 보온재가 벗겨져 있습니다. 다음 촬영 전에 확인해 주세요.', tags: ['#설비', '#점검'], urls: [], photos: [], panos: [], space: SEED_SPACE, itemId: SEED_ITEM, visibility: 'public', createdAt: t - 5e6 },
    { id: 'an2', ...at(127.0536317, 37.5403747), alt: 33.3, title: '옥상 바닥 균열 확인', desc: '주차장 옥상 북동측 바닥에서 균열이 관찰됩니다.', tags: ['#외벽'], urls: ['https://www.naver.com'], photos: [], panos: [], space: SEED_SPACE, itemId: SEED_ITEM, visibility: 'public', createdAt: t - 4e6 },
    { id: 'an3', ...at(127.0533665, 37.5400381), alt: 27.6, title: '서울숲 방향 전경', desc: '드론 촬영 사진 3장입니다.', tags: ['#성수', '#서울숲'], urls: [], photos: [url('uploads/image/megabox-01.jpg'), url('uploads/image/megabox-02.jpg'), url('uploads/image/megabox-03.jpg')], panos: [], space: SEED_SPACE, itemId: SEED_ITEM, visibility: 'public', createdAt: t - 3e6 },
    { id: 'an4', ...at(127.0528394, 37.539948), alt: 90.9, title: '옥상 전경 파노라마', desc: '옥상에서 본 360° 전경입니다.', tags: ['#옥상'], urls: [], photos: [], panos: [1, 2, 3].map((n) => url(`uploads/pano/pano-0${n}.jpg`)), space: SEED_SPACE, itemId: SEED_ITEM, visibility: 'public', createdAt: t - 2e6 },
    { id: 'an5', ...at(127.0536033, 37.5395388), alt: 42.5, title: '철거 협의 메모', desc: '내부 협의용 메모입니다. (비공개)', tags: ['#협의'], urls: [], photos: [], panos: [], space: SEED_SPACE, itemId: SEED_ITEM, visibility: 'private', createdAt: t - 1e6 },
  ];
}

// Records saved before spaces existed get the space of the nearest item (within ~300 m).
function spaceFor(a) {
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
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw).map((a) => ('space' in a ? a : { ...a, space: spaceFor(a) }));
    // 이전 버전 → v3: 샘플 위치·고도 기준이 바뀌었으므로 샘플은 새로 두고, 사용자가 만든 기록만 옮긴다.
    const old = LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (old) {
      const mine = JSON.parse(old).filter((a) => !SEED_IDS.includes(a.id)).map((a) => ('space' in a ? a : { ...a, space: spaceFor(a) }));
      return [...seed(), ...mine];
    }
  } catch { /* fall through to seed */ }
  return seed();
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
