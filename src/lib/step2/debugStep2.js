export const isStep2DebugEnabled = () =>
  Boolean(
    import.meta.env.DEV &&
    (import.meta.env.VITE_DEBUG_STEP2 === "true" || globalThis.window?.__VOLANTINIPRO_DEBUG_STEP2__ === true)
  );

export const debugStep2Log = (...args) => {
  if (isStep2DebugEnabled()) console.log(...args);
};

export const debugStep2Warn = (...args) => {
  if (isStep2DebugEnabled()) console.warn(...args);
};
