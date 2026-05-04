from tree_sitter_languages import get_language, get_parser
import os

class ASTChunker:
    def __init__(self, language_name: str = "python"):
        self.language = get_language(language_name)
        self.parser = get_parser(language_name)

    def chunk_file(self, content: str, file_path: str) -> list[dict]:
        tree = self.parser.parse(bytes(content, "utf8"))
        chunks = []
        
        # Simple implementation: extract functions and classes
        query_scm = """
        (function_definition) @func
        (class_definition) @class
        """
        query = self.language.query(query_scm)
        captures = query.captures(tree.root_node)

        for node, tag in captures:
            start_byte = node.start_byte
            end_byte = node.end_byte
            chunk_content = content[start_byte:end_byte]
            
            chunks.append({
                "content": chunk_content,
                "metadata": {
                    "file_path": file_path,
                    "type": tag,
                    "start_line": node.start_point[0],
                    "end_line": node.end_point[0]
                }
            })
            
        # If no captures, fallback to basic chunking
        if not chunks:
            chunks.append({
                "content": content,
                "metadata": {"file_path": file_path, "type": "file"}
            })
            
        return chunks
