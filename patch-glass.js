const fs = require('fs');

let c = fs.readFileSync('volantinipro-final.jsx', 'utf8');

const replacements = [
  {
    old: '.vp-s1-card-inner { background: #0A0D14; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 18px 20px; }',
    new: '.vp-s1-card-inner { background: rgba(8, 14, 28, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); }'
  },
  {
    old: '.vp-s1-input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: #fff; font-family: \'DM Sans\', sans-serif; font-size: 14px; transition: border-color 0.2s, background 0.2s; }',
    new: '.vp-s1-input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #fff; font-family: \'DM Sans\', sans-serif; font-size: 14px; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-input:focus { border-color: #E8571A; background: rgba(232,87,26,0.03); outline: none; }',
    new: '.vp-s1-input:focus { border-color: #E8571A; background: rgba(232,87,26,0.05); outline: none; box-shadow: 0 0 0 1px #E8571A, inset 0 2px 4px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-pill { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: \'DM Sans\', sans-serif; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.6); transition: all 0.2s ease; }',
    new: '.vp-s1-pill { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: \'DM Sans\', sans-serif; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: rgba(255,255,255,0.7); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }'
  },
  {
    old: '.vp-s1-pill:hover { border-color: rgba(255,255,255,0.15); color: #fff; }',
    new: '.vp-s1-pill:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; }'
  },
  {
    old: '.vp-s1-pill.active { border-color: #E8571A; background: rgba(232,87,26,0.12); color: #E8571A; }',
    new: '.vp-s1-pill.active { border-color: #E8571A; background: rgba(232,87,26,0.15); color: #E8571A; box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-option-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 11px; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); transition: all 0.2s ease; }',
    new: '.vp-s1-option-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 11px; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }'
  },
  {
    old: '.vp-s1-option-card:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); }',
    new: '.vp-s1-option-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }'
  },
  {
    old: '.vp-s1-option-card.active { border-color: #E8571A; background: rgba(232,87,26,0.08); }',
    new: '.vp-s1-option-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-format-card { border-radius: 9px; padding: 11px; cursor: pointer; text-align: center; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); transition: all 0.2s ease; }',
    new: '.vp-s1-format-card { border-radius: 9px; padding: 11px; cursor: pointer; text-align: center; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }'
  },
  {
    old: '.vp-s1-format-card:hover { border-color: rgba(255,255,255,0.15); }',
    new: '.vp-s1-format-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }'
  },
  {
    old: '.vp-s1-format-card.active { border-color: #E8571A; background: rgba(232,87,26,0.1); }',
    new: '.vp-s1-format-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-plan-card { border-radius: 11px; padding: 16px 14px; cursor: pointer; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); transition: all 0.2s ease; text-align: center; position: relative; }',
    new: '.vp-s1-plan-card { border-radius: 11px; padding: 16px 14px; cursor: pointer; border: 1px solid rgba(255,255,255,0.07); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; text-align: center; position: relative; }'
  },
  {
    old: '.vp-s1-plan-card:hover { border-color: rgba(255,255,255,0.15); }',
    new: '.vp-s1-plan-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }'
  },
  {
    old: '.vp-s1-plan-card.active { border-color: #E8571A; background: rgba(232,87,26,0.1); }',
    new: '.vp-s1-plan-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-campaign-btn { width: 56px; height: 56px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.55); font-family: \'DM Serif Display\', serif; font-size: 28px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; }',
    new: '.vp-s1-campaign-btn { width: 56px; height: 56px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: rgba(255,255,255,0.7); font-family: \'DM Serif Display\', serif; font-size: 28px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: '.vp-s1-campaign-btn:hover { border-color: rgba(255,255,255,0.2); color: #fff; }',
    new: '.vp-s1-campaign-btn:hover { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); color: #fff; }'
  },
  {
    old: '.vp-s1-campaign-btn.active { border-color: #E8571A; background: rgba(232,87,26,0.12); color: #E8571A; }',
    new: '.vp-s1-campaign-btn.active { border-color: #E8571A; background: rgba(232,87,26,0.15); color: #E8571A; box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }'
  },
  {
    old: 'background:"#1E1D1B"',
    new: 'background:"rgba(8, 14, 28, 0.65)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",boxShadow:"0 12px 48px rgba(0,0,0,0.3)"'
  }
];

let replacedCount = 0;
for (const r of replacements) {
  if (c.includes(r.old)) {
    c = c.replace(r.old, r.new);
    replacedCount++;
  } else {
    // If exact string not found, we can try matching by class name or prefix
    console.log("Could not find string:\n", r.old.substring(0, 50));
  }
}
console.log("Replaced", replacedCount, "instances.");

fs.writeFileSync('volantinipro-final.jsx', c);
