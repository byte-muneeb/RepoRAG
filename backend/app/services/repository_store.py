from dataclasses import dataclass


@dataclass(slots=True)
class RepoRecord:
    repo_id: str
    repo_url: str
    branch: str | None
    status: str = "queued"
    total_files: int = 0
    indexed_files: int = 0
    error_message: str | None = None


REPO_STORE: dict[str, RepoRecord] = {}
FILE_TREE_STORE: dict[str, list[dict]] = {}


def set_repo(record: RepoRecord) -> None:
    REPO_STORE[record.repo_id] = record


def get_repo(repo_id: str) -> RepoRecord | None:
    return REPO_STORE.get(repo_id)


def set_file_tree(repo_id: str, nodes: list[dict]) -> None:
    FILE_TREE_STORE[repo_id] = nodes


def get_file_tree(repo_id: str) -> list[dict]:
    return FILE_TREE_STORE.get(repo_id, [])
