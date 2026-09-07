"""Graphe LangGraph : un seul agent full-LLM avec tool-calling.

- Mémoire courte : checkpointer SQLite par thread (conversations).
- Mémoire longue : coach_memory, injectée dans le prompt système à chaque tour.
- Honnêteté : le prompt interdit au LLM de produire des évaluations/coups ;
  tout vient des outils (Stockfish) ou de la base.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

import aiosqlite
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.prebuilt import create_react_agent

from ..config import settings
from . import memory as mem
from .tools import AgentContext, build_tools

logger = logging.getLogger(__name__)

SYSTEM_BASE = """Tu es « Coach d'échecs », un coach personnel de {username}.
Ton rôle : aider à progresser aux échecs en analysant SES parties réelles (chess.com),
avec pédagogie, en français, de façon concise et bienveillante mais honnête.

RÈGLES ABSOLUES :
1. Tu ne produis JAMAIS d'évaluation chiffrée (cp/mate/probabilité) ni de coup "recommandé"
   par toi-même. Tout ce qui est chiffré ou moteur doit venir d'un OUTIL.
2. Utilise les outils quand une réponse demande des données : une partie, une position,
   des stats. C'est obligatoire : ne réponds pas de mémoire.
3. TRANSCRIPTION EXACTE : quand tu cites des chiffres renvoyés par un outil (JSON),
   reproduis-les à l'identique (mêmes valeurs, mêmes libellés de clés). Ne les arrondis,
   ne les recombine et ne les reformule JAMAIS. Si tu ne connais pas un chiffre, dis-le.
4. Quand tu cites une bévue ou un coup, donne le numéro de coup, la position si utile,
   le coup du moteur (best_move_san) et la perte en probabilité (winprob_loss).
5. Mémoire : consulte memoire_lire si le contexte le demande ; inscris en memoire_ecrire
   (kind=prescription/diagnostic) ce que le joueur doit travailler.
6. Reste synthétique (4-8 lignes), utilise du Markdown léger, évite le jargon inutile.
7. Tu ne prétends jamais avoir analysé une partie qui n'est pas dans la base.
8. Le profil pédagogique ci-dessous est injecté : utilise-le pour personnaliser (point de
   départ, causes racines, concepts à travailler). Ne reformule pas ses chiffres.

Contexte mémoire longue durée :
{memory}

Contexte rapide du jour :
{quick_context}

Profil pédagogique du joueur :
{profile}

Dans le frontend, chaque partie est cliquable vers une page de revue :
`/revue/{game_id}` (tu peux mentionner ce lien dans tes réponses). Le joueur peut
s'entraîner sur ses erreurs via la page Entraînement.
"""


def build_system_prompt(username: str, memory_text: str, quick: str, profile_text: str = "") -> SystemMessage:
    return SystemMessage(content=SYSTEM_BASE.format(
        username=username, memory=memory_text, quick_context=quick, profile=profile_text,
    ))


class ChessCoachAgent:
    def __init__(self, ctx: AgentContext, memory_db: aiosqlite.Connection) -> None:
        self.ctx = ctx
        self._saver = AsyncSqliteSaver(memory_db)
        self._model = ChatOpenAI(
            model=settings.openrouter_model,
            api_key=settings.openrouter_key,
            base_url=settings.openrouter_base_url,
            temperature=0.2,
            max_retries=1,
            timeout=120,
        )
        tools = build_tools(ctx)
        self.graph = create_react_agent(self._model, tools, checkpointer=self._saver)

    def _config(self, thread_id: str) -> dict:
        return {"configurable": {"thread_id": thread_id}}

    async def _prompt(self) -> SystemMessage:
        from .profile import summarize_profile

        entries = await mem.read_memory(self.ctx.db)
        profile_text = await summarize_profile(self.ctx.db, self.ctx.username)
        return build_system_prompt(
            self.ctx.username,
            mem.memory_to_prompt(entries),
            "",
            profile_text,
        )

    async def invoke(self, thread_id: str, question: str) -> dict:
        """Réponse complète (non streamée). Renvoie {text, tool_calls, usage}."""
        prompt = await self._prompt()
        result = await self.graph.ainvoke(
            {"messages": [prompt, HumanMessage(content=question)]}, self._config(thread_id)
        )
        messages = result.get("messages", [])
        last = messages[-1] if messages else None
        text = ""
        usage = {}
        if isinstance(last, AIMessage):
            text = last.content or ""
            usage = last.response_metadata.get("usage", {})
        tool_calls = sum(
            1 for m in messages if isinstance(m, AIMessage) and m.tool_calls
        )
        return {"text": text, "tool_calls": tool_calls, "usage": usage}

    async def stream(self, thread_id: str, question: str) -> AsyncIterator[str]:
        """Flux des morceaux de texte (SSE)."""
        prompt = await self._prompt()
        async for event in self.graph.astream(
            {"messages": [prompt, HumanMessage(content=question)]},
            self._config(thread_id),
            stream_mode="messages",
        ):
            message, _meta = event
            if isinstance(message, AIMessage) and message.content:
                yield str(message.content)
