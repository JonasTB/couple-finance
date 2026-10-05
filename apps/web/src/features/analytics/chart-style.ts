/** Shared Recharts styling: tokens only, so light and dark modes follow index.css. */
export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const;
export const GRID_STROKE = 'var(--border)';
export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600 },
  itemStyle: { color: 'var(--foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.6 },
} as const;
