export function Step1Help({ label, children }) {
  return (
    <span className="vp-s1-help-wrap">
      <button type="button" className="vp-s1-help" aria-label={`Aiuto: ${label}`}>?</button>
      <span role="tooltip" className="vp-s1-help-tip">{children}</span>
    </span>
  );
}
