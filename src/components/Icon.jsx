import { ICONS } from '../data/icons';

export default function Icon({ name, size = 16, style }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      style={{ display: 'block', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
