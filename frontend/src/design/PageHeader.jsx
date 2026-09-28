/** Shared introduction for product pages. Actions remain optional and wrap on mobile. */
export default function PageHeader({ eyebrow, title, description, actions, aside, children, className = "" }) {
  return <header className={`ui-page-header ${className}`}>
    <div className="ui-page-header-copy">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children && <div className="ui-page-header-context">{children}</div>}
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
    {aside && <div className="ui-page-header-aside">{aside}</div>}
  </header>;
}
