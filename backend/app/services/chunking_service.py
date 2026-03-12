import ast
from pathlib import Path
from dataclasses import dataclass


@dataclass(slots=True)
class ChunkRow:
    file_path: str
    chunk_index: int
    content: str
    start_line: int
    end_line: int


class ChunkingService:
    def chunk_text(self, file_path: str, text: str, chunk_size: int = 1400, overlap: int = 180) -> list[ChunkRow]:
        language = self._detect_language(file_path)

        if language == "python":
            ast_chunks = self._chunk_python_ast(file_path, text)
            if ast_chunks:
                return ast_chunks

        return self._chunk_by_lines(file_path, text, max_chars=chunk_size, overlap_chars=overlap)

    @staticmethod
    def _detect_language(file_path: str) -> str:
        extension = Path(file_path).suffix.lower()
        if extension == ".py":
            return "python"
        return "text"

    def _chunk_python_ast(self, file_path: str, text: str) -> list[ChunkRow]:
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []

        lines = text.splitlines()
        rows: list[ChunkRow] = []
        chunk_index = 0

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                start = max(1, getattr(node, "lineno", 1))
                end = max(start, getattr(node, "end_lineno", start))
                snippet = "\n".join(lines[start - 1:end]).strip()
                if not snippet:
                    continue
                rows.append(
                    ChunkRow(
                        file_path=file_path,
                        chunk_index=chunk_index,
                        content=snippet,
                        start_line=start,
                        end_line=end,
                    ),
                )
                chunk_index += 1

        return rows

    def _chunk_by_lines(self, file_path: str, text: str, max_chars: int, overlap_chars: int) -> list[ChunkRow]:
        lines = text.splitlines()
        rows: list[ChunkRow] = []

        if not lines:
            return rows

        start_idx = 0
        chunk_index = 0

        while start_idx < len(lines):
            cursor = start_idx
            char_count = 0

            while cursor < len(lines):
                next_line = lines[cursor]
                projected = char_count + len(next_line) + 1
                if projected > max_chars and cursor > start_idx:
                    break
                char_count = projected
                cursor += 1

            content = "\n".join(lines[start_idx:cursor]).strip()
            if content:
                rows.append(
                    ChunkRow(
                        file_path=file_path,
                        chunk_index=chunk_index,
                        content=content,
                        start_line=start_idx + 1,
                        end_line=cursor,
                    ),
                )
                chunk_index += 1

            if cursor >= len(lines):
                break

            overlap_line_count = 0
            overlap_chars_used = 0
            back_idx = cursor - 1
            while back_idx >= start_idx and overlap_chars_used < overlap_chars:
                overlap_chars_used += len(lines[back_idx]) + 1
                overlap_line_count += 1
                back_idx -= 1

            start_idx = max(start_idx + 1, cursor - overlap_line_count)

        return rows
