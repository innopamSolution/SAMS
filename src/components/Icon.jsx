import { ICONS } from '../data/icons';

export default function Icon({ name, size = 16, style }) {
  const icon = ICONS[name];
  if (!icon) return null;
  const strokeProps = icon.stroke
    ? { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }
    : null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      {...strokeProps}
      style={{ display: 'block', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
