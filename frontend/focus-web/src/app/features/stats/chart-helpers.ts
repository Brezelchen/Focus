/** Tooltip look shared by the ECharts charts (stats page, habit history). */
export function tooltipStyle(dark: boolean) {
  return {
    backgroundColor: dark ? 'rgba(44,37,84,0.95)' : 'rgba(255,255,255,0.96)',
    borderColor: 'transparent',
    textStyle: { color: dark ? '#f2eefe' : '#2d2340' },
    extraCssText: 'border-radius:12px;box-shadow:0 10px 30px -12px rgba(60,30,90,.45);',
  };
}

/** Mixes two #rrggbb colours: t = 0 gives `a`, t = 1 gives `b`. Falls back to `a` for other colour formats. */
export function mix(a: string, b: string, t: number): string {
  const parse = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null);
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return a;
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
