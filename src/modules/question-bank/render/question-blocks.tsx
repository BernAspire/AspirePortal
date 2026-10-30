import { Fragment } from "react";

import type { Block, Inline, Rich } from "../schema";

/*
 * The one question renderer (CLAUDE.md, "Question bank"): used on screen now and by the
 * PDF worker later. Content is plain text and fractions, rendered as React text nodes, so
 * nothing is ever injected as HTML. Figures are <img> elements pointing at short-lived
 * signed URLs added on the server. Changes must keep the golden-set test passing
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

/** "3⟦2‖7⟧" → "3 2/7" (a space between a whole number and its fraction). */
function plainText(r: Rich): string {
  return r.reduce<string>((out, x) => {
    if (typeof x === "string") return out + x;
    return `${out}${/\d$/.test(out) ? " " : ""}${plainText(x.frac[0])}/${plainText(x.frac[1])}`;
  }, "");
}

/** Text with stacked fractions; screen readers hear "2 over 7". */
export function RichText({ value }: { value: Rich | string }) {
  if (typeof value === "string") return <>{value}</>;
  return (
    <>
      {value.map((x: Inline, i) =>
        typeof x === "string" ? (
          <Fragment key={i}>{x}</Fragment>
        ) : (
          <span key={i} className="qb-frac mx-[0.1em] inline-flex flex-col items-center align-middle text-[0.85em] leading-[1.15]">
            <span className="sr-only">{` ${plainText(x.frac[0])} over ${plainText(x.frac[1])} `}</span>
            <span aria-hidden className="border-b border-current px-[0.15em]">
              <RichText value={x.frac[0]} />
            </span>
            <span aria-hidden className="px-[0.15em]">
              <RichText value={x.frac[1]} />
            </span>
          </span>
        ),
      )}
    </>
  );
}

type Cell = string | Rich;

export function QuestionTable({ rows }: { rows: readonly (readonly Cell[])[] }) {
  const [head, ...body] = rows;
  return (
    <div className="qb-table my-1 max-w-full overflow-x-auto">
      <table className="border-collapse text-[15px]">
        {head ? (
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i} scope="col" className="border border-[#D9DBD8] bg-[#F3F4F2] px-3 py-1.5 text-left font-semibold">
                  <RichText value={c} />
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
                  <RichText value={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ src, width }: { src?: string; width: number }) {
  if (!src) {
    return (
      <div className="qb-figure flex h-24 max-w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground" style={{ width }}>
        Figure unavailable
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs from private storage
  return <img className="qb-figure h-auto max-w-full" src={src} alt="Figure for this question" width={width} style={{ width }} loading="lazy" />;
}

function EquationRows({ rows }: { rows: readonly { readonly label: Rich; readonly value: Rich }[] }) {
  return (
    <div className="qb-eq grid w-fit max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      {rows.map((r, i) => (
        <Fragment key={i}>
          <span>
            <RichText value={r.label} />
          </span>
          <span>
            <RichText value={r.value} />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "paragraph":
      return "text" in b ? (
        <p>
          <TextWithMarks text={b.text} />
        </p>
      ) : (
        <p className={b.part ? "qb-part mt-1 whitespace-pre-line" : "whitespace-pre-line"}>
          <RichText value={b.rich} />
        </p>
      );
    case "table":
      return <QuestionTable rows={b.rows} />;
    case "image":
      return <Figure src={b.src} width={b.width} />;
    case "equation":
      return <EquationRows rows={b.rows} />;
  }
}

/** Question text, tables and figures, in order. */
export function QuestionBlocks({ blocks, className }: { blocks: readonly Block[]; className?: string }) {
  return (
    <div className={["qb-blocks flex flex-col gap-2 text-[17px] leading-relaxed", className].filter(Boolean).join(" ")}>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  );
}

/** Worked solution steps; "(a)" / "(b)" lines begin a part. */
export function WorkedSteps({ steps }: { steps: readonly Block[] }) {
  if (steps.length === 0) return <p className="text-[15px] text-muted-foreground">There is no worked solution for this question.</p>;
  return (
    <ol className="qb-steps flex list-none flex-col gap-1 text-[15px] tabular-nums">
      {steps.map((s, i) => {
        const part = s.type === "paragraph" && ("text" in s ? /^\([a-f]\)/.test(s.text) : Boolean(s.part));
        return (
          <li key={i} className={part ? "mt-1.5 font-semibold" : undefined}>
            {s.type === "paragraph" && "text" in s ? s.text : <BlockView b={s} />}
          </li>
        );
      })}
    </ol>
  );
}
