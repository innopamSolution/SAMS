// Spatial Log brand lockup (Figma "Group 33551"): longitude emblem + "Spatial Log" wordmark, 4px apart.
// Emblem and wordmark share one single color so the lockup reads as one mark.
export default function Logo() {
  return (
    <div aria-label="Spatial Log" style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24, color: 'rgba(0, 0, 0, 0.9)' }}>
      <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
        <path d="M3.35036 8.47007C2.98361 11.0929 5.81121 15.0019 10.2118 17.644C14.6124 20.286 19.3918 20.9442 21.5344 19.3875L3.35036 8.47007ZM4.46563 6.61248L22.6496 17.5299C23.0164 14.9071 20.1888 10.9981 15.7882 8.35604C11.3876 5.71397 6.60824 5.0558 4.46563 6.61248ZM2.18038 12.5974C2.04478 16.4116 3.92582 20.1879 7.42365 22.2879C10.9215 24.388 15.1387 24.2731 18.4415 22.3604C15.6732 22.3978 12.339 21.4482 9.09655 19.5015C5.85414 17.5548 3.44862 15.0584 2.18038 12.5974ZM7.55851 3.63963C10.3268 3.60215 13.661 4.55175 16.9034 6.49846C20.1459 8.44516 22.5514 10.9416 23.8196 13.4026C23.9552 9.58837 22.0742 5.81214 18.5764 3.71208C15.0785 1.61203 10.8613 1.72694 7.55851 3.63963Z" fill="currentColor" />
      </svg>
      <span style={{ fontFamily: "'Russo One', sans-serif", fontSize: 20, lineHeight: 1, whiteSpace: 'nowrap' }}>Spatial Log</span>
    </div>
  );
}
