"""Adapt document-model formatting to literal text, without inferring money.

Research adapter only. Regions remain model proposals; this never creates OCR
word boxes, confidence, quantities, currency, tax rates, or financial approval.
"""
from html.parser import HTMLParser
import re

MAX_TEXT = 60000
REGION = re.compile(
    r"^!\[([a-z][a-z0-9_-]{0,30})\]\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*"
    r"([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*"
    r"([+-]?\d+(?:\.\d+)?)\s*\)[ \t]*", re.I | re.M,
)


class _Rows(HTMLParser):
    allowed = {"table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
               "p", "div", "span", "b", "strong", "i", "em", "br", "hr", "colgroup", "col"}
    void = {"br", "hr", "col"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.output, self.tables = [], [], []
        self.table, self.row, self.cell = None, None, None

    def handle_starttag(self, tag, attrs):
        if tag not in self.allowed:
            raise ValueError("Unsupported document markup")
        if any(name in {"rowspan", "colspan"} and value != "1" for name, value in attrs):
            raise ValueError("Merged table cells need separate layout handling")
        if tag == "table":
            if self.table is not None:
                raise ValueError("Nested document tables are unsupported")
            self.table = []
            self.output.append("\n")
        elif tag == "tr":
            if self.table is None or self.row is not None:
                raise ValueError("Invalid document table row")
            self.row = []
        elif tag in {"td", "th"}:
            if self.row is None or self.cell is not None:
                raise ValueError("Invalid document table cell")
            self.cell = []
        elif tag in {"br", "hr", "p", "div"}:
            (self.cell if self.cell is not None else self.output).append(" " if self.cell is not None else "\n")
        if tag not in self.void:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.void:
            return
        if not self.stack or self.stack.pop() != tag:
            raise ValueError("Unbalanced document markup")
        if tag in {"td", "th"}:
            # Only formatting whitespace changes. NBSP, signs, punctuation and
            # every literal numeric character remain as decoded HTML text.
            self.row.append(re.sub(r"[ \t\r\n]+", " ", "".join(self.cell)).strip(" \t\r\n"))
            self.cell = None
        elif tag == "tr":
            self.table.append(self.row)
            self.output.extend(["\t".join(self.row), "\n"])
            self.row = None
        elif tag == "table":
            self.tables.append(self.table)
            self.table = None
            self.output.append("\n")
        elif tag in {"p", "div", "caption"} and self.cell is None:
            self.output.append("\n")

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
        elif self.row is not None and data.strip():
            raise ValueError("Table text is outside a cell")
        else:
            self.output.append(data)

    def handle_comment(self, data):
        raise ValueError("Hidden document comments are unsupported")

    def handle_decl(self, decl):
        raise ValueError("Document declarations are unsupported")

    def finish(self):
        self.close()
        if self.stack or self.table is not None or self.row is not None or self.cell is not None:
            raise ValueError("Truncated document markup")
        return "".join(self.output)


def _pipe_cells(line):
    line = line.strip(" \t")
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith(r"\|"):
        line = line[:-1]
    return [cell.strip(" \t").replace(r"\|", "|") for cell in re.split(r"(?<!\\)\|", line)]


def _markdown_tables(text):
    lines, output, tables = text.splitlines(), [], []
    index = 0
    while index < len(lines):
        if index + 1 < len(lines) and "|" in lines[index] and "|" in lines[index + 1]:
            header, separator = _pipe_cells(lines[index]), _pipe_cells(lines[index + 1])
            if len(header) >= 2 and len(header) == len(separator) and all(re.fullmatch(r":?-{3,}:?", value) for value in separator):
                rows = [header]
                index += 2
                while index < len(lines) and "|" in lines[index] and lines[index].strip():
                    row = _pipe_cells(lines[index])
                    if len(row) != len(header):
                        raise ValueError("Inconsistent Markdown table columns")
                    rows.append(row)
                    index += 1
                tables.append(rows)
                output.extend("\t".join(row) for row in rows)
                continue
        output.append(lines[index])
        index += 1
    return "\n".join(output), tables


def normalize_document_text(text):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ValueError("Empty or oversized document transcription")
    regions = []

    def region(match):
        raw = match.groups()[1:]
        if any(not re.fullmatch(r"\d{1,4}", value) for value in raw):
            raise ValueError("Invalid model region coordinates")
        x1, y1, x2, y2 = map(int, raw)
        if not (0 <= x1 < x2 <= 1000 and 0 <= y1 < y2 <= 1000):
            raise ValueError("Invalid model region bounds")
        regions.append({"label": match.group(1), "box": [x1, y1, x2, y2], "kind": "model-proposed-region"})
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    fence = re.fullmatch(r"\s*```(?:html|markdown|md|text)?[ \t]*\n(.*)\n```[ \t]*\s*", text, re.S)
    if fence:
        text = fence.group(1)
    text = REGION.sub(region, text)
    parser = _Rows()
    parser.feed(text)
    plain, markdown_tables = _markdown_tables(parser.finish())
    lines = [line.strip(" \r\n") for line in plain.splitlines() if line.strip()]
    normalized = "\n".join(lines)
    if not normalized or len(normalized) > MAX_TEXT or len(lines) > 2000 or any(len(line) > 1000 for line in lines):
        raise ValueError("Normalized transcription exceeds receipt text bounds")
    return {"text": normalized, "regions": regions, "tables": parser.tables + markdown_tables,
            "warnings": ["Model regions are proposals; no source OCR word confidence is available."] if regions else []}
