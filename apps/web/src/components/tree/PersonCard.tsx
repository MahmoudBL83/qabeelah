import { memo } from 'react';

interface PersonCardProps {
  name: string;
  dates: string;
  imageSrc?: string;
  branchLabel?: string;
  isMain?: boolean;
  onClick?: () => void;
  className?: string;
  nodeId?: string;
}

function PersonCard({ name, dates, imageSrc, isMain, onClick, className, nodeId }: PersonCardProps) {
  return (
    <div 
      onClick={onClick}
      data-tree-node="true"
      data-tree-node-id={nodeId}
      className={`relative cursor-pointer transition-transform hover:-translate-y-1 w-48 p-4 rounded-lg flex flex-col items-center text-center gap-3 z-10 ${className ?? ''} ${
        isMain 
          ? 'bg-gradient-to-b from-[#eadecc] to-[#cfb488] shadow-heritage-md border border-[#c19b60]' 
          : 'bg-surface-container-lowest shadow-heritage-sm border border-surface-variant'
      }`}
    >
      {isMain && (
        <div className="absolute -top-3 bg-secondary text-white text-[10px] px-2 py-0.5 rounded-sm">
          محدد
        </div>
      )}
      
      <div className="w-16 h-16 rounded-md overflow-hidden bg-surface-variant border border-surface/50 shadow-sm shrink-0">
        {imageSrc ? (
          <img src={imageSrc} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-50">
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-on-surface text-sm">{name}</h4>
        <p className="text-on-surface-variant text-xs mt-1" dir="ltr">{dates}</p>
        {/* {branchLabel ? (
          <span className="mt-2 inline-flex items-center rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">
            {branchLabel}
          </span>
        ) : null} */}
      </div>
    </div>
  );
}

export default memo(PersonCard, (prev, next) => (
  prev.name === next.name &&
  prev.dates === next.dates &&
  prev.imageSrc === next.imageSrc &&
  prev.branchLabel === next.branchLabel &&
  prev.isMain === next.isMain &&
  prev.className === next.className
));
