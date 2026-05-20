import React from 'react';

export function SkeletonCard() {
  return (
    <div style={{ 
      borderRadius: 12, 
      padding: 20,
      background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.07)', 
      marginBottom: 10 
    }}>
      {[80, 200, 120].map((w, i) => (
        <div key={i} style={{ 
          width: w, 
          height: i === 1 ? 16 : 10,
          background: 'rgba(255,255,255,.08)', 
          borderRadius: 4,
          marginBottom: 10, 
          opacity: 1 - i * 0.2 
        }}/>
      ))}
    </div>
  )
}
