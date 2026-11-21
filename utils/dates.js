// Date helpers shared by the poll controllers so the same parsing rules apply
// everywhere (create, update, queries). Always works with absolute instants:
// the frontend is expected to send ISO-8601 strings with a timezone (Z/offset).
function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { parseDate };
