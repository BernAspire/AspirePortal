import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Block } from "../schema";
import { QuestionBlocks, WorkedSteps } from "./question-blocks";

/*
 * Golden set for the question renderer: representative questions from the Whole Numbers
 * bank (plain stem, marks tag, blank box, multi-paragraph with a table, two-part steps,
 * and text that looks like HTML). If a change alters the output, review the diff and
 * update the files with `pnpm test -u` only when the change is intended.
 */
const GOLDEN: Record<string, { blocks: Block[]; steps?: Block[] }> = {
  "plain-stem": { blocks: [{ type: "paragraph", text: "What is the value of the digit 4 in 586 432?" }] },
  "marks-and-box": {
    blocks: [{ type: "paragraph", text: "24 × 500 = ☐ × 1000. What is the missing number in the box? [2]" }],
  },
  "paragraphs-and-table": {
    blocks: [
      { type: "paragraph", text: "The table below shows the mass of cans collected by five classes for recycling." },
      { type: "paragraph", text: "What is the difference between the greatest and the smallest mass of cans collected?" },
      { type: "table", rows: [["Class", "Cans collected (kg)"], ["5A", "1345"], ["5B", "1435"]] },
    ],
  },
  "two-part-steps": {
    blocks: [{ type: "paragraph", text: "(a) Write six million and forty-one in numerals. (b) What is 162 000 ÷ 400?" }],
    steps: [
      { type: "paragraph", text: "(a) Millions: 6, Thousands: 0, Ones: 041 → 6 000 041" },
      { type: "paragraph", text: "(b) 162 000 ÷ 100 = 1620" },
      { type: "paragraph", text: "1620 ÷ 4 = 405" },
    ],
  },
  "html-is-text": { blocks: [{ type: "paragraph", text: "Is 3 < 5 and 7 > 2? <b>bold</b> <script>x</script>" }] },
  // Format 2 (2026 banks): fractions, figures, tables with fractions, aligned worked steps.
  "format2-fractions-figure": {
    blocks: [
      { type: "paragraph", rich: ["Express 3", { frac: [["2"], ["7"]] }, " as an improper fraction. <i>not markup</i>"] },
      { type: "image", path: "centres/x/question-bank/images/y/abc.png", width: 320, src: "https://example.test/signed/abc.png" },
      { type: "image", path: "centres/x/question-bank/images/y/def.png", width: 200 },
      { type: "table", rows: [["Side", "Length"], [["a"], [{ frac: [["1"], ["2"]] }, " m"]]] },
    ],
    steps: [
      { type: "paragraph", rich: ["(a)"], part: true },
      { type: "equation", rows: [{ label: ["Fraction shaded"], value: ["= ", { frac: [["28", { frac: [["1"], ["2"]] }], ["50"]] }] }, { label: [], value: ["= 57/100"] }] },
    ],
  },
};

describe("question renderer golden set", () => {
  for (const [name, q] of Object.entries(GOLDEN)) {
    it(name, async () => {
      const html =
        renderToStaticMarkup(<QuestionBlocks blocks={q.blocks} />) + (q.steps ? renderToStaticMarkup(<WorkedSteps steps={q.steps} />) : "");
      await expect(html.replace(/></g, ">\n<") + "\n").toMatchFileSnapshot(`./__golden__/${name}.html`);
    });
  }

  it("never emits markup from question text", () => {
    const html = renderToStaticMarkup(<QuestionBlocks blocks={GOLDEN["html-is-text"]!.blocks} />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });
});
