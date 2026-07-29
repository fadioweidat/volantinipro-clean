import { useState, useRef, useEffect } from "react";
import { formatRadiusLabel } from "../lib/utils/format.js";

function normalizeRadius(value, options) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return options[0];
  return options.reduce((closest, option) =>
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  );
}

export function InteractiveRadiusSlider({ value, options, disabled = false, onCommit, recommendedValue = null, accent = "#22C55E" }) {
  const normalizedValue = normalizeRadius(value, options);
  const normalizedRecommended = recommendedValue != null && Number.isFinite(Number(recommendedValue)) ? normalizeRadius(recommendedValue, options) : null;
  const confirmedIndex = options.indexOf(normalizedValue);

  const [previewIndex, setPreviewIndex] = useState(confirmedIndex);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef(null);

  useEffect(() => {
    if (!isDragging) {
      setPreviewIndex(confirmedIndex);
    }
  }, [confirmedIndex, isDragging]);

  const commitIndex = (nextIndex) => {
    const boundedIndex = Math.max(0, Math.min(options.length - 1, nextIndex));
    setPreviewIndex(boundedIndex);
    const nextRadius = options[boundedIndex];
    if (nextRadius !== normalizedValue) {
      onCommit(nextRadius);
    }
  };

  const calculateIndexFromEvent = (clientX) => {
    if (!trackRef.current) return previewIndex;
    const rect = trackRef.current.getBoundingClientRect();
    const rawIndex = ((clientX - rect.left) / rect.width) * (options.length - 1);
    return Math.round(Math.max(0, Math.min(options.length - 1, rawIndex)));
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setPreviewIndex(calculateIndexFromEvent(e.clientX));
  };

  const handlePointerMove = (e) => {
    if (disabled || !isDragging) return;
    setPreviewIndex(calculateIndexFromEvent(e.clientX));
  };

  const handlePointerUp = (e) => {
    if (disabled || !isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    commitIndex(calculateIndexFromEvent(e.clientX));
  };

  const handlePointerCancel = (e) => {
    if (disabled || !isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPreviewIndex(confirmedIndex);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    let nextIndex = previewIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = Math.min(options.length - 1, previewIndex + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      nextIndex = Math.max(0, previewIndex - 1);
      e.preventDefault();
    } else if (e.key === 'Home') {
      nextIndex = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      nextIndex = options.length - 1;
      e.preventDefault();
    } else {
      return;
    }
    commitIndex(nextIndex);
  };

  const fillPercentage = (previewIndex / (options.length - 1)) * 100;

  return (
    <div
      style={{
        width: '100%',
        padding: '24px 10px 32px',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        outline: 'none',
        touchAction: 'none',
        position: 'relative',
        userSelect: 'none',
        margin: '12px 0 24px'
      }}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={options.length - 1}
      aria-valuenow={previewIndex}
      aria-valuetext={formatRadiusLabel(options[previewIndex])}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 6,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 4,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fillPercentage}%`,
            background: accent,
            borderRadius: 4,
            transition: isDragging ? 'none' : 'width 0.15s ease-out',
          }}
        />

        {options.map((opt, i) => {
          const leftPercent = (i / (options.length - 1)) * 100;
          const isActive = i === previewIndex;
          const isPast = i <= previewIndex;
          const isRecommended = opt === normalizedRecommended;

          return (
            <div key={i} style={{ position: 'absolute', left: `${leftPercent}%`, top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {isRecommended && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 18,
                    background: 'rgba(34, 197, 94, 0.16)',
                    border: '1px solid rgba(34, 197, 94, 0.45)',
                    color: '#22C55E',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                    whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                    pointerEvents: 'none',
                    zIndex: 3,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}
                >
                  Consigliato
                </div>
              )}
              <div
                style={{
                  width: isActive ? 16 : 10,
                  height: isActive ? 16 : 10,
                  borderRadius: '50%',
                  background: isActive ? '#fff' : (isPast ? accent : 'rgba(255,255,255,0.3)'),
                  border: isActive ? `3px solid ${accent}` : 'none',
                  boxShadow: isActive ? `0 0 10px ${accent}80` : 'none',
                  transition: 'all 0.15s',
                  zIndex: 2,
                }}
              />
              <div
                className="radius-slider-label"
                style={{
                  position: 'absolute',
                  top: 20,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? accent : 'rgba(255,255,255,0.5)',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                {formatRadiusLabel(opt)}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @media (max-width: 600px) {
          .radius-slider-label {
            display: none !important;
          }
          div > div:nth-child(odd) > .radius-slider-label,
          div > div:last-child > .radius-slider-label {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
