import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas in text cells", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("keeps numbers exact and empties nulls", () => {
    expect(csvCell(123456789012345)).toBe("123456789012345");
    expect(csvCell(-100)).toBe("-100");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("builds a header row and CRLF lines", () => {
    expect(
      toCsv([
        { id: "a", amount_paise: 500 },
        { id: "b", amount_paise: 0 },
      ]),
    ).toBe("id,amount_paise\r\na,500\r\nb,0\r\n");
    expect(toCsv([], ["id"])).toBe("id\r\n");
  });
});
