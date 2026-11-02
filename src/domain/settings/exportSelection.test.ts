import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/store/csv";
import {
  allSelected,
  EXPORT_DATASETS,
  exportFileName,
  selectedDatasets,
  toggleAll,
  toggleDataset,
} from "./exportSelection";

describe("export selection", () => {
  it("offers the five datasets Settings exports", () => {
    expect(EXPORT_DATASETS.map((d) => d.label)).toEqual([
      "Invoices",
      "Extraction results",
      "Disputes",
      "Drafts",
      "Audit log",
    ]);
  });

  it("toggles one dataset at a time", () => {
    const one = toggleDataset(new Set(), "disputes");
    expect([...one]).toEqual(["disputes"]);
    expect([...toggleDataset(one, "disputes")]).toEqual([]);
  });

  it("selects all, then clears on a second press", () => {
    const all = toggleAll(new Set(["audit"]));
    expect(allSelected(all)).toBe(true);
    expect(toggleAll(all).size).toBe(0);
  });

  it("returns the selection in display order", () => {
    const sel = new Set(["audit", "invoices"] as const);
    expect(selectedDatasets(sel).map((d) => d.kind)).toEqual(["invoices", "audit"]);
  });

  it("keeps the existing file names", () => {
    expect(exportFileName("extractions")).toBe("verilane-extractions.csv");
  });
});

describe("toCsv — what the export writes", () => {
  it("keeps amounts as whole paise", () => {
    const csv = toCsv("invoices", [
      {
        row_id: 1,
        invoice_id: "INV-1",
        invoice_number: "N-1",
        customer_id: "C-1",
        invoice_date: "2026-09-01",
        due_date: "2026-10-01",
        amount_paise: 12_500_050,
        currency: "INR",
        status_raw: "open",
        billing_period: null,
        po_number: null,
      },
    ]);
    const [, line] = csv.split("\r\n");
    expect(line.split(",")[6]).toBe("12500050");
  });

  it("quotes commas, quotes and newlines per RFC 4180", () => {
    const csv = toCsv("drafts", [{ id: "d1", body: 'Dear "Asha",\nplease pay' }]);
    expect(csv).toBe('id,body\r\nd1,"Dear ""Asha"",\nplease pay"');
    const back = Papa.parse<string[]>(csv).data;
    expect(back[1]).toEqual(["d1", 'Dear "Asha",\nplease pay']);
  });

  it.each(["=SUM(A1:A2)", "+1", "-1+2", "@cmd", "\tx", "\rx"])(
    "escapes the formula-like cell %j",
    (value) => {
      const csv = toCsv("audit", [{ summary: value }]);
      const cell = Papa.parse<string[]>(csv).data[1][0];
      expect(cell.startsWith("'")).toBe(true);
      expect(cell.slice(1)).toBe(value);
    },
  );
});
