import './DataTable.css';

/**
 * Shared data table.
 * Desktop: proper table with sticky header.
 * Small screens: rows transform into labeled cards (CSS only) so nothing
 * becomes an unusably shrunken grid.
 *
 * columns: [{ key, header, render?(row), className? }]
 */
export default function DataTable({ columns, rows, keyField = 'id', emptyState, isLoading, skeleton }) {
  if (isLoading && skeleton) {
    return skeleton;
  }
  if (!isLoading && (!rows || rows.length === 0)) {
    return emptyState || null;
  }

  return (
    <div className="dtable" role="region" aria-label="Data table" tabIndex={0}>
      <table className="dtable__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={col.className || ''}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row[keyField] ?? idx}>
              {columns.map((col) => (
                <td key={col.key} data-label={col.header} className={col.className || ''}>
                  {col.render ? col.render(row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
