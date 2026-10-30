import { describe, expect, it } from "vitest";
import { markdownSections, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, lists and inline marks", () => {
    expect(renderMarkdown("## Title\n\nOne **bold** and *soft*\nline.\n\n- a\n- b\n\n1. x\n2. y")).toBe(
      "<h2>Title</h2>\n<p>One <strong>bold</strong> and <em>soft</em> line.</p>\n<ul><li>a</li><li>b</li></ul>\n<ol><li>x</li><li>y</li></ol>",
    );
  });

  it("escapes HTML and drops comments", () => {
    expect(renderMarkdown('<script>alert(1)</script> & "x" <!-- TODO(host): hidden -->')).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>");
  });

  it("keeps only safe link targets", () => {
    expect(renderMarkdown("[a](/cancellation/) [b](mailto:x@y.z) [c](javascript:alert(1))")).toBe(
      '<p><a href="/cancellation/">a</a> <a href="mailto:x@y.z">b</a> <a href="#">c</a>)</p>',
    );
  });

  it("leaves bracketed placeholders that aren't links alone", () => {
    expect(renderMarkdown("Quiet hours are [TODO(host): e.g. 10 PM].")).toBe("<p>Quiet hours are [TODO(host): e.g. 10 PM].</p>");
  });
});

describe("markdownSections", () => {
  it("splits on second-level headings, ignoring commented-out ones", () => {
    const s = markdownSections("## Q1\n\nA1\n\n<!--\n## Hidden\nX\n-->\n## Q2\n\nA2");
    expect(s).toEqual([
      { heading: "Q1", html: "<p>A1</p>" },
      { heading: "Q2", html: "<p>A2</p>" },
    ]);
  });
});
