'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { leftHeart, rightHeart } from '../lib/brand-hearts';
import { heartAnimationMode } from '../lib/workspace-loader-config';
import '../app/workspace-loader.css';

export function WorkspaceLoader({ visible = true }: { visible?: boolean }) {
  const overlapMask = useId();
  const frontHeart = useRef<SVGPathElement>(null);
  const [canReveal, setCanReveal] = useState(false);
  const showing = visible || !canReveal;

  useEffect(() => {
    if (visible) {
      setCanReveal(false);
      return;
    }

    let frame: number;
    function revealAfterDrawing() {
      const path = frontHeart.current;
      if (!path) return;
      const style = getComputedStyle(path);
      const complete = parseFloat(style.strokeDashoffset) === 0 && parseFloat(style.opacity) === 1;
      if (style.animationName === 'none' || complete) {
        setCanReveal(true);
      } else {
        frame = requestAnimationFrame(revealAfterDrawing);
      }
    }

    revealAfterDrawing();
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div
      className="workspace-loader"
      data-visible={showing}
      data-heart-animation={heartAnimationMode}
      role="status"
      aria-hidden={!showing}
    >
      <span className="sr-only">Opening Sweet Rascal…</span>
      <svg className="workspace-loader-logo" viewBox="130 190 1930 300" aria-hidden="true">
        <defs>
          <mask id={overlapMask} maskUnits="userSpaceOnUse" x="130" y="190" width="1930" height="300">
            <rect x="130" y="190" width="1930" height="300" fill="white" />
            <path d={rightHeart} fill="black" />
          </mask>
        </defs>
        <g className="workspace-loader-wordmark" fill="#b60923">
          <text x="768" y="412" textAnchor="end">Sweet</text>
          <text x="1350" y="412">Rascal</text>
        </g>
        {/* Both closed outlines start at the same upper intersection. */}
        <g fill="none" stroke="#b60923" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
          <path
            className="workspace-loader-heart workspace-loader-heart-left"
            mask={`url(#${overlapMask})`}
            pathLength="100"
            d={leftHeart}
          />
          <path
            ref={frontHeart}
            className="workspace-loader-heart workspace-loader-heart-right"
            pathLength="100"
            d={rightHeart}
          />
        </g>
      </svg>
    </div>
  );
}
