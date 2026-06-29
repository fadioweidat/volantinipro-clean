import React from 'react';

export function SkeletonCard({ variant = 'default', lines = [80, 200, 120] }) {
  const isDark = variant === 'dark';
  return (
    <div className={isDark ? "clean-card-dark" : "clean-card"} style={{ marginBottom: 12 }}>
      {lines.map((w, i) => (
        <div 
          key={i} 
          style={{ 
            width: typeof w === 'number' ? `${w}px` : w, 
            height: i === 1 ? 18 : 12,
            background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,25,44,0.08)', 
            borderRadius: 6,
            marginBottom: i === lines.length - 1 ? 0 : 12,
            animation: 'pulse 1.5s infinite ease-in-out'
          }}
        />
      ))}
    </div>
  );
}

