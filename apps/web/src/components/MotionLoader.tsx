export default function MotionLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <style>{`
        @keyframes qabila-loader-pop {
          0% { transform: scale(0.55) rotate(45deg); opacity: 0.25; }
          18% { transform: scale(1) rotate(45deg); opacity: 1; }
          48% { transform: scale(0.72) rotate(45deg); opacity: 0.55; }
          100% { transform: scale(0.55) rotate(45deg); opacity: 0.25; }
        }
      `}</style>

      <div className="relative h-28 w-28">
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-[#b98a33]" style={{ animation: 'qabila-loader-pop 1.15s ease-in-out infinite' }} />
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-[110%] -translate-y-[110%] rounded-[8px] bg-[#b98a33]" style={{ animation: 'qabila-loader-pop 1.15s ease-in-out infinite 0.12s' }} />
        <span className="absolute left-1/2 top-1/2 h-8 w-8 translate-x-[10%] -translate-y-[110%] rounded-[8px] bg-[#b98a33]" style={{ animation: 'qabila-loader-pop 1.15s ease-in-out infinite 0.24s' }} />
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-[110%] translate-y-[10%] rounded-[8px] bg-[#b98a33]" style={{ animation: 'qabila-loader-pop 1.15s ease-in-out infinite 0.36s' }} />
        <span className="absolute left-1/2 top-1/2 h-8 w-8 translate-x-[10%] translate-y-[10%] rounded-[8px] bg-[#b98a33]" style={{ animation: 'qabila-loader-pop 1.15s ease-in-out infinite 0.48s' }} />
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-semibold tracking-[0.2em] text-on-surface">قبيلة</p>
        <p className="text-sm text-on-surface-variant">جارٍ تجهيز المساحة...</p>
      </div>
    </div>
  );
}