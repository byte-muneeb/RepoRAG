import asyncio
from collections import defaultdict
from collections.abc import AsyncGenerator
from dataclasses import dataclass


@dataclass(slots=True)
class StreamEvent:
    event: str
    data: dict


class EventBroker:
    def __init__(self) -> None:
        self._repo_subscribers: dict[str, set[asyncio.Queue[StreamEvent]]] = defaultdict(set)

    async def publish_repo_event(self, repo_id: str, event: str, data: dict) -> None:
        payload = StreamEvent(event=event, data=data)
        for queue in list(self._repo_subscribers[repo_id]):
            await queue.put(payload)

    async def subscribe_repo(self, repo_id: str) -> AsyncGenerator[StreamEvent, None]:
        queue: asyncio.Queue[StreamEvent] = asyncio.Queue()
        self._repo_subscribers[repo_id].add(queue)

        try:
            # Initial connection message makes frontend connection status explicit.
            yield StreamEvent(event="stream.connected", data={"repo_id": repo_id})
            while True:
                item = await queue.get()
                yield item
        finally:
            self._repo_subscribers[repo_id].discard(queue)


broker = EventBroker()
