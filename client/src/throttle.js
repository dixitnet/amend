/**
 * Returns a throttled wrapper around `fn`: at most one call fires per
 * `wait` ms. A call made before the window elapses isn't just dropped —
 * it's remembered and fires once, right at the end of the window (a
 * classic "leading + trailing" throttle). Used to cap how often a
 * plugin repaints its panel (wordcount.js, outline.js, tkMarker.js): the
 * underlying data is kept correct on every transaction (see
 * incrementalScan.js), but the DOM write itself only needs to happen a
 * few times a second at most for a human to perceive it as live — see
 * rapport-test-charge-1.md, constat 2.2.
 */
export function throttle(fn, wait) {
  let last = 0
  let timer = null
  let pendingArgs = null

  function run(args) {
    last = Date.now()
    timer = null
    pendingArgs = null
    fn(...args)
  }

  return function throttled(...args) {
    const now = Date.now()
    const remaining = wait - (now - last)
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      run(args)
    } else {
      pendingArgs = args
      if (!timer) {
        timer = setTimeout(() => run(pendingArgs), remaining)
      }
    }
  }
}
