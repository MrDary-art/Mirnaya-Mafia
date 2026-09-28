const ICON_ROOT = "/icons/lucide";
const starPluralRules = new Intl.PluralRules("ru");

export function formatStarAmount(value) {
  if (value == null) return "Количество звёзд не указано";
  const unit = { one: "звезда", few: "звезды", many: "звёзд", other: "звезды" }[starPluralRules.select(Number(value))];
  return `${value} ${unit}`;
}

export function StarAmount({ value, className = "" }) {
  return <span className={`ui-star-amount ${className}`.trim()} role="img" aria-label={formatStarAmount(value)}>
    <span className="ui-star-value" aria-hidden="true">{value ?? "—"}</span>
    <Icon name="star" size="1em" className="ui-currency-star" />
  </span>;
}

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
    <span className={`ui-star-rating ${className}`.trim()} role="img" aria-label={`${value} из ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <Icon key={index} name="star" size={15} className={index < value ? "filled" : "empty"} />
      ))}
    </span>
  );
}
