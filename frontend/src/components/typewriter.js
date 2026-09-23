export function createTypewriter(onChange) {
  let target = "";
  let visible = "";
  let timer = null;
  const waiters = [];

  function tick() {
    timer = null;
    visible = target.slice(0, visible.length + 2);
    onChange(visible);
    if (visible.length < target.length) timer = window.setTimeout(tick, 20);
    else while (waiters.length) waiters.shift()();
  }

  return {
    push(chunk) {
      target += chunk;
      if (timer === null && visible.length < target.length) timer = window.setTimeout(tick, 0);
    },
    flush() {
      if (visible.length >= target.length) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    stop() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      while (waiters.length) waiters.shift()();
    },
  };
}
