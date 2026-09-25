const ICON_ROOT = "/icons/lucide";

export default function Icon({ name, size = 20, className = "", label, ...props }) {
  const style = {
    "--icon-url": `url("${ICON_ROOT}/${name}.svg")`,
    width: typeof size === "number" ? `${size}px` : size,
    height: typeof size === "number" ? `${size}px` : size,
    ...props.style,
  };

  return (
    <span
      {...props}
      className={`ui-icon ${className}`.trim()}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    />
  );
}

export function StarRating({ value = 0, total = 5, className = "" }) {
  return (
    <span className={`ui-star-rating ${className}`.trim()} aria-label={`${value} из ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <Icon key={index} name="star" size={15} className={index < value ? "filled" : "empty"} />
      ))}
    </span>
  );
}
