// Browser-only Excel helpers (exceljs is loaded on demand).
export const SHEET_HEADER = [
  "Date",
  "Type",
  "Group",
  "Sub group",
  "Includes",
  "Necessity",
  "Payment source",
  "Amount",
  "Remarks",
  "Entry by",
];

export interface ExcelLists {
  groups: string[];
  /** [group, subGroup] pairs. */
  subGroups: [string, string][];
  /** [group, subGroup, includes] triples. */
  includes: [string, string, string][];
  paymentSources: string[];
  members: string[];
}

const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))].sort();

export async function buildTransactionsWorkbook(
  rows: (string | number)[][],
  lists: ExcelLists,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
  const ref = wb.addWorksheet("Lists");
  const tree = wb.addWorksheet("Tree", { state: "hidden" });

  const cols: [string, string[]][] = [
    ["Types", ["expense", "income", "investment"]],
    ["Groups", uniq(lists.groups)],
    ["Necessity", ["essential", "discretionary"]],
    ["PaymentSources", uniq(lists.paymentSources)],
    ["Members", uniq(lists.members)],
  ];
  const ranges: Record<string, string> = {};
  cols.forEach(([name, values], i) => {
    const col = ref.getColumn(i + 1);
    const letter = col.letter;
    ref.getCell(`${letter}1`).value = name;
    ref.getCell(`${letter}1`).font = { bold: true };
    values.forEach((v, r) => (ref.getCell(`${letter}${r + 2}`).value = v));
    col.width = 28;
    ranges[name] = `Lists!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`;
  });

  // Hidden tree: A=group key, B=sub group; D=group|sub key, E=includes. Sorted so
  // each parent's children are contiguous (needed for OFFSET-based dropdowns).
  const subs = [...new Map(lists.subGroups.map((p) => [`${p[0]}|${p[1]}`, p])).values()].sort(
    (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
  );
  subs.forEach(([g, s], i) => {
    tree.getCell(`A${i + 1}`).value = g;
    tree.getCell(`B${i + 1}`).value = s;
  });
  const incs = [
    ...new Map(lists.includes.map((t) => [`${t[0]}|${t[1]}|${t[2]}`, t])).values(),
  ].sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`) || a[2].localeCompare(b[2]));
  incs.forEach(([g, s, n], i) => {
    tree.getCell(`D${i + 1}`).value = `${g}|${s}`;
    tree.getCell(`E${i + 1}`).value = n;
  });

  ws.addRow(SHEET_HEADER);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F5C" } };
  [12, 12, 24, 24, 22, 14, 20, 12, 36, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  rows.forEach((r) => ws.addRow(r));
  ws.getColumn(1).numFmt = "yyyy-mm-dd";
  ws.getColumn(8).numFmt = "#,##0.00";

  const lastRow = Math.max(rows.length + 500, 1000);
  const map: [string, string][] = [
    ["B", "Types"],
    ["C", "Groups"],
    ["F", "Necessity"],
    ["G", "PaymentSources"],
    ["J", "Members"],
  ];
  for (let r = 2; r <= lastRow; r++) {
    map.forEach(([c, key]) => {
      ws.getCell(`${c}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ranges[key]],
        showErrorMessage: c === "B",
      };
    });
    // Sub group: only the sub groups under the Group chosen in this row.
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [
        `OFFSET(Tree!$B$1,MATCH($C${r},Tree!$A:$A,0)-1,0,MAX(1,COUNTIF(Tree!$A:$A,$C${r})),1)`,
      ],
    };
    // Includes: only items under the chosen Group + Sub group.
    ws.getCell(`E${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [
        `OFFSET(Tree!$E$1,MATCH($C${r}&"|"&$D${r},Tree!$D:$D,0)-1,0,MAX(1,COUNTIF(Tree!$D:$D,$C${r}&"|"&$D${r})),1)`,
      ],
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Reads the first sheet of an .xlsx into string rows (dates as yyyy-mm-dd). */
export async function readWorkbookRows(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Transactions") ?? wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row: import("exceljs").Row) => {
    const cells: string[] = [];
    for (let c = 1; c <= SHEET_HEADER.length; c++) {
      const v = row.getCell(c).value as unknown;
      let s = "";
      if (v instanceof Date) s = v.toISOString().slice(0, 10);
      else if (v && typeof v === "object") {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if (o.richText) s = o.richText.map((t) => t.text).join("");
        else if (o.result instanceof Date) s = o.result.toISOString().slice(0, 10);
        else s = String(o.result ?? o.text ?? "");
      } else if (v != null) s = String(v);
      cells.push(s);
    }
    out.push(cells);
  });
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
