from app.db.schemas import FileTreeNode


def _to_node_id(path: str) -> str:
    return path.replace("/", "-").replace(".", "-")


def build_tree_from_paths(file_paths: list[str]) -> list[FileTreeNode]:
    folder_set: set[str] = set()
    for file_path in file_paths:
        parts = file_path.split("/")
        for index in range(1, len(parts)):
            folder_set.add("/".join(parts[:index]))

    rows: list[FileTreeNode] = []

    for folder_path in sorted(folder_set, key=lambda path: (path.count("/"), path)):
        parent = "/".join(folder_path.split("/")[:-1]) or None
        rows.append(
            FileTreeNode(
                id=_to_node_id(folder_path),
                parent_id=_to_node_id(parent) if parent else None,
                type="folder",
                name=folder_path.split("/")[-1],
                path=folder_path,
                depth=folder_path.count("/"),
                indexed=True,
            ),
        )

    for file_path in sorted(file_paths):
        parent = "/".join(file_path.split("/")[:-1]) or None
        rows.append(
            FileTreeNode(
                id=_to_node_id(file_path),
                parent_id=_to_node_id(parent) if parent else None,
                type="file",
                name=file_path.split("/")[-1],
                path=file_path,
                depth=file_path.count("/"),
                indexed=True,
            ),
        )

    rows.sort(key=lambda row: (row.depth, 0 if row.type == "folder" else 1, row.path))
    return rows
