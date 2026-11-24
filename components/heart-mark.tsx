import { heartViewBox, leftHeartVisible, rightHeart } from '../lib/brand-hearts';

export function HeartMark({ width = 27 }: { width?: number }) {
  return (
    <svg viewBox={heartViewBox} width={width} height={width * 294 / 516} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round">
      <path d={leftHeartVisible} />
      <path d={rightHeart} />
    </svg>
  );
}
