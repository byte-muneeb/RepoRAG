from collections.abc import AsyncGenerator

from groq import AsyncGroq

from app.core.config import settings


class ChatGenerationService:
    def __init__(self) -> None:
        if not settings.groq_api_key:
            self.client: AsyncGroq | None = None
            return

        self.client = AsyncGroq(api_key=settings.groq_api_key)

    async def stream_answer(self, question: str, context: str) -> AsyncGenerator[str, None]:
        if not self.client:
            fallback = "No LLM configured. Add GROQ_API_KEY to backend/.env and restart the API."
            for token in fallback.split(" "):
                yield f"{token} "
            return

        prompt = (
            "You are RepoRAG, an expert software engineering assistant. "
            "You help developers understand codebases, identify bugs, improve architecture, "
            "suggest best practices, and answer any programming or project question. "
            "When code context is provided, ground the answer in concrete files and line ranges. "
            "Prioritize source code and architecture files over dependency lockfiles unless the user explicitly asks about dependencies. "
            "When no context is available, clearly say that and give practical guidance plus next steps. "
            "Prefer clear, readable responses with concise bullets, numbered steps, and short sections when useful. "
            "Adapt formatting to the question instead of following one fixed template. "
            "Do not force headings like Summary, Findings, Recommended Actions, or Notes unless the user asks for that structure. "
            "Include code snippets only when they improve understanding. "
            "Avoid fluff, but include enough depth to fully answer the user's request.\n\n"
            f"Code Context:\n{context}\n\n"
            f"Question:\n{question}"
        )

        # Try configured model first, then resilient fallbacks for provider deprecations.
        candidate_models = [
            settings.groq_model,
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]
        unique_models: list[str] = []
        for model_name in candidate_models:
            if model_name and model_name not in unique_models:
                unique_models.append(model_name)

        stream = None
        last_error: Exception | None = None

        for model_name in unique_models:
            try:
                stream = await self.client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are RepoRAG, an expert codebase and software engineering assistant. "
                                "Answer any question about code architecture, bugs, refactoring, "
                                "best practices, or general programming. Be specific, practical, "
                                "and cite file paths with line numbers when you have context. "
                                "Give complete answers with clear reasoning and concrete actions. "
                                "Use clean markdown formatting where it helps readability. "
                                "Never default to a fixed four-heading template unless the user requested it. "
                                "Do not append a raw citation dump at the end of the response."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                        temperature=0.2,
                        max_tokens=1200,
                    stream=True,
                )
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                continue

        if stream is None:
            fallback = (
                f"LLM provider error: {last_error}. "
                "Check GROQ_API_KEY, GROQ_MODEL, and provider account limits."
            )
            for token in fallback.split(" "):
                yield f"{token} "
            return

        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
