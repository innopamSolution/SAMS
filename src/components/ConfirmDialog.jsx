// 브라우저 기본 window.confirm 은 미리보기·웹뷰 환경에서 곧바로 취소로 처리돼
// 삭제가 조용히 무시된다. 앱 안에서 직접 그리는 확인 창으로 대신한다.
export default function ConfirmDialog({ state, onClose }) {
  if (!state) return null;
  const { message, detail, confirmLabel = '삭제', danger = true } = state;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(15,20,28,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320, maxWidth: '100%',
          background: 'var(--ant-bg)', borderRadius: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.24)',
          padding: 20,
          fontFamily: 'var(--ant-font-sans)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ant-text)', lineHeight: 1.5 }}>{message}</div>
        {detail && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--ant-text-secondary)' }}>{detail}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ height: 32, padding: '0 16px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            취소
          </button>
          <button
            autoFocus
            onClick={() => { state.onOk && state.onOk(); onClose(); }}
            style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: danger ? 'var(--ant-error, #ff4d4f)' : 'var(--ant-primary)', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
