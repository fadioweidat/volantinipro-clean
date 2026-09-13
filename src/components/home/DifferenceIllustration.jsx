import React, { useId } from 'react';

// Decorative vector artwork: no remote images, map requests or application data.
export default function DifferenceIllustration({ type }) {
  const id = useId().replace(/:/g, '');
  const fill = name => `url(#${id}-${name})`;
  const pin = (x, y, scale = 1) => <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="M0 35C-4 23-17 13-17 0a17 17 0 0 1 34 0C17 13 4 25 0 35Z" fill={fill('orange')} stroke="#ffc07b" strokeWidth="1" /><ellipse cy="-1" rx="7" ry="8" fill="#412b26" stroke="#ffce8c" /></g>;
  const map = <><path d="m15 71 79-46q7-4 14 0l77 43q7 4 0 9l-79 46q-6 4-13 0L15 79q-7-4 0-8Z" fill={fill('metal')} stroke="#53617f" /><path d="m35 60 23 14-13 19m13-19 24-17-4-22m4 22 28 16 23-20-8-18m-15 38-17 23 32 17m-32-17-27 4m44-27 25 14 33-16m-33 16 5 18" fill="none" stroke="#64718f" strokeOpacity=".4" strokeWidth="4" /></>;
  return <svg className={`vpd-art vpd-art--${type}`} viewBox="0 0 200 220" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#52617e" /><stop offset=".35" stopColor="#25324b" /><stop offset="1" stopColor="#101827" /></linearGradient>
      <linearGradient id={`${id}-orange`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#ffcd72" /><stop offset=".4" stopColor="#ff8a38" /><stop offset="1" stopColor="#e34b19" /></linearGradient>
      <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#eef1fc" /><stop offset=".3" stopColor="#abb9d2" /><stop offset="1" stopColor="#43516c" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#ff7d31" stopOpacity=".3" /><stop offset="1" stopColor="#ff7d31" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-screen`} x2="0" y2="1"><stop stopColor="#172132" /><stop offset="1" stopColor="#070e18" /></linearGradient>
      <filter id={`${id}-bloom`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" /></filter>
    </defs>
    <ellipse cx="129" cy="111" rx="75" ry="83" fill={fill('glow')} />
    {type === 'istat' && <>
      <path d="m26 37 11-7 9 4 7-11 10 6 8-9 9 5 8-4 8 6 13-1-5 9 6 7-5 8 5 9-12 3 6 14 7 11 10 8 8 14 20 8 12 6-3 8-15-6-11-1 2 10 12 9-4 10-8 7-7-5 2-11-13-11-12-8-9-14-13-10-13-14-7-14-8 5-11-1 3-9-8-4 4-8-7-7Zm3 94 9 2 3 17-5 14-9-7Zm38 43 20 1 12-6 1 9-18 10-19-7Z" fill="#31405b" opacity=".65" />
      {[[89,128,34],[119,105,65],[149,68,110]].map(([x,y,h], i) => <g key={x}><path d={`M${x} ${y}l13-7 14 5-13 8Z`} fill={i===2?'#ffca77': '#c5cadd'} stroke="#efdfce" strokeWidth=".6"/><path d={`M${x} ${y}l14 6v${h}l-14-7Z`} fill={i===2?fill('orange'):fill('silver')} /><path d={`M${x+14} ${y+6}l13-8v${h}l-13 8Z`} fill={i===2?'#bc542c':'#424b64'} stroke={i===2?'#ff9d55':'#76819b'} strokeWidth=".6" /></g>)}
    </>}
    {type === 'gis' && <g transform="translate(0 12)"><g transform="translate(0 55)" opacity=".2">{map}</g><g transform="translate(0 29)" opacity=".5">{map}</g>{map}<path d="m60 117 36 21q6 4 14 0l27-16" fill="none" stroke="#fc873b" opacity=".65" />{pin(132,51,1.18)}</g>}
    {type === 'analysis' && <>
      <g fill="none" stroke="#b46a43" strokeWidth="1" opacity=".65"><path d="M68 66H32V35m36 63H32v6H17m53 20H42v38m89-95V17m14 51h32V42m-35 68h35v34m-48-4v39M91 55V17" /></g>
      {[[32,35],[17,104],[42,162],[131,17],[177,42],[177,144],[129,179],[91,17],[177,93]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={fill('orange')} />)}
      <g transform="rotate(3 105 102)"><rect x="56" y="44" width="98" height="104" rx="16" fill={fill('metal')} stroke="#d3916b" /><rect x="61" y="48" width="86" height="94" rx="12" fill={fill('silver')} /><rect x="66" y="54" width="77" height="86" rx="10" fill={fill('metal')} stroke="#39465d" /><rect x="73" y="63" width="64" height="69" rx="6" fill={fill('screen')} /><text x="105" y="111" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="300" fontSize="41" fill="#ff8944">AI</text></g>
    </>}
    {type === 'gps' && <>
      <g transform="translate(-2 30) rotate(-24 100 85)" fill="none" stroke="#4a5b7b" strokeWidth="1" opacity=".45">{Array.from({length:7},(_,i)=><path key={i} d={`M${i*30-10} 14v156M0 ${i*25+10}h210`} />)}</g>
      <path d="M76 171c25-7 45-19 36-36s48-19 21-37-48-21-22-32l49-12" fill="none" stroke="#ff9b45" strokeWidth="9" filter={fill('bloom')} />
      <path d="M76 171c25-7 45-19 36-36s48-19 21-37-48-21-22-32l49-12" fill="none" stroke="#ffe2a0" strokeWidth="3" strokeLinecap="round" />
      {pin(76,156,.86)}{pin(163,42,.76)}
    </>}
    {type === 'pdf' && <>
      <g transform="skewY(9)"><rect x="76" y="21" width="86" height="130" rx="5" fill={fill('metal')} stroke="#8493b2" /><path d="M89 36h58v7H89Zm0 17h48v6H89Zm0 15h58v6H89Z" fill="#46536c" opacity=".5" />
      <path d="M127-3h44l17 16v125q0 5-5 5h-56q-5 0-5-5V2q0-5 5-5Z" fill={fill('metal')} stroke="#bac0d4" /><path d="M168-3v19h20" fill="none" stroke="#ce9676" /><rect x="147" y="17" width="33" height="30" rx="3" fill={fill('orange')} /><text x="163" y="37" fontSize="13" fontWeight="700" fontFamily="Arial,sans-serif" fill="white" textAnchor="middle">PDF</text>
      <rect x="59" y="62" width="104" height="124" rx="5" fill={fill('metal')} stroke="#52617c" /><path d="M139 82h14m-14 9h14m-14 30h14m-14 10h14m-14 10h14" stroke="#62718d" strokeWidth="4" />
      <rect x="43" y="53" width="90" height="115" rx="7" fill={fill('silver')} stroke="#ecf0fd" /><rect x="49" y="61" width="78" height="96" rx="4" fill="#7eabc3" />
      <path d="m50 98 21-12 17 9 16-17 23 9v69H50Z" fill="#49675a" /><path d="m67 156 26-54h15l18 54" fill="#979a98" /><path d="m55 90 27-9v39l-27 15Z" fill="#dbc5a0" /><path d="m52 91 16-17 17 6Z" fill="#ad744d" /><path d="m98 84 21-9v40l-21-9Z" fill="#dfb78b" />
      <path d="m60 95 6-2v9l-6 2Zm11-4 6-2v9l-6 2Zm-11 19 6-2v9l-6 2Zm11-4 6-2v9l-6 2Zm32-16 5-2v8l-5-1Zm9-3 5-2v8l-5-1Z" fill="#425665" /><path d="m92 129-8 18m17-32-5 11" stroke="#e8dfc9" strokeWidth="2" /><path d="M52 67q22-10 19 19T55 115" fill="#355742" />
      </g>{pin(112,156,.55)}
    </>}
    {type === 'assistant' && <>
      <path d="M65 104q-3-53 57-54" fill="none" stroke="#ff9651" strokeWidth="2" />
      <path d="M98 3h69q12 0 12 12v43q0 12-12 12h-42l-19 18 3-18H98q-12 0-12-12V15q0-12 12-12Z" fill={fill('metal')} stroke="#c5a696" />
      {[112,133,154].map(x=><g key={x}><ellipse cx={x} cy="37" rx="5" ry="6" fill="#ff9e45" filter={fill('bloom')} /><ellipse cx={x} cy="37" rx="4" ry="5" fill="#ffb95a" /></g>)}
      <path d="M59 217q3-42 25-48l42 2q27 13 29 46" fill={fill('metal')} stroke="#57617b" /><path d="m86 175 18 17 22-18" fill="none" stroke="#e38d52" opacity=".7" />
      <ellipse cx="53" cy="131" rx="11" ry="20" fill={fill('orange')} stroke="#9f9ba8" /><ellipse cx="157" cy="131" rx="10" ry="20" fill={fill('orange')} stroke="#9f9ba8" />
      <rect x="52" y="87" width="106" height="87" rx="41" fill={fill('metal')} stroke="#bbadab" strokeWidth="2" /><path d="M67 103q40-25 77 1" fill="none" stroke="#ffc48a" strokeWidth="2" />
      <rect x="61" y="113" width="89" height="51" rx="23" fill={fill('screen')} stroke="#806956" strokeWidth="2" />
      {[86,122].map(x=><g key={x}><ellipse cx={x} cy="137" rx="6" ry="10" fill="#ffb144" filter={fill('bloom')} /><ellipse cx={x} cy="137" rx="5" ry="9" fill="#ffc264" /></g>)}
    </>}
  </svg>;
}

