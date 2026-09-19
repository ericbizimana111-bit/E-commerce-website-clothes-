/**
 * Consistent page header: title, optional description, action area.
 */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
