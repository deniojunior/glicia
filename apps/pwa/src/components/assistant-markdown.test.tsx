import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expect, test } from "vitest";

test("renders common Markdown without interpreting raw HTML from the provider", () => {
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{"**Resumo**\n\n<script>alert('xss')</script>"}</ReactMarkdown>
  );

  expect(html).toContain("<strong>Resumo</strong>");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("alert('xss')");
});
