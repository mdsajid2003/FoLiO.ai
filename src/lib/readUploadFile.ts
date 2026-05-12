/** Read CSV as UTF-8 text; read Excel as first sheet converted to CSV for the reconciliation API. */
export async function readUploadFileAsDelimitedText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) {
      throw new Error('Excel file has no sheets.');
    }
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet, { FS: ',', blankrows: false });
  }
  return file.text();
}
