import { Fragment } from "react";

import type { Block } from "../schema";

/*
 * The one question renderer (CLAUDE.md, "Question bank"): used on screen now and by the
 * PDF worker later. Content is plain text, rendered as React text nodes, so nothing is
 * ever injected as HTML. Changes must keep the golden-set test passing
 * (question-blocks.golden.test.tsx).
 */

/** "Find the total. [3]" → the "[3]" marks shown as a tag, as on the centre's worksheets. */
function TextWithMarks({ text }: { text: string }) {
  const parts = text.split(/(\[\d{1,2}\])/);
  return (
    <>
      {parts.map((p, i) =>
        /^\[\d{1,2}\]$/.test(p) ? (
          <span key={i} className="qb-marks ml-1 whitespace-nowrap text-[13px] font-semibold text-muted-foreground">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function QuestionTable({ rows }: { rows: readonly (readonly string[])[] }) {
  const [head, ...body] = rows;
  return (
    <div className="qb-table my-1 max-w-full overflow-x-auto">
      <table className="border-collapse text-[15px]">
        {head ? (
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i} scope="col" className="border border-[#D9DBD8] bg-[#F3F4F2] px-3 py-1.5 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border border-[#D9DBD8] px-3 py-1.5 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Question text and tables, in order. */
export function QuestionBlocks({ blocks, className }: { blocks: readonly Block[]; className?: string }) {
  return (
    <div className={["qb-blocks flex flex-col gap-2 text-[17px] leading-relaxed", className].filter(Boolean).join(" ")}>
      {blocks.map((b, i) =>
        b.type === "paragraph" ? (
          <p key={i}>
            <TextWithMarks text={b.text} />
          </p>
        ) : (
          <QuestionTable key={i} rows={b.rows} />
        ),
      )}
    </div>
  );
}

/** Worked solution steps; lines starting "(a)" / "(b)" begin a part. */
export function WorkedSteps({ steps }: { steps: readonly Block[] }) {
  return (
    <ol className="qb-steps flex list-none flex-col gap-1 text-[15px] tabular-nums">
      {steps.map((s, i) =>
        s.type === "paragraph" ? (
          <li key={i} className={/^\([a-f]\)/.test(s.text) ? "mt-1.5 font-semibold" : undefined}>
            {s.text}
          </li>
        ) : (
          <li key={i}>
            <QuestionTable rows={s.rows} />
          </li>
        ),
      )}
    </ol>
  );
}
