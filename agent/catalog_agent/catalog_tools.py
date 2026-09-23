"""Herramientas de consulta determinística para el catálogo de metadata.

El modelo de IA no recibe el archivo completo. Estas herramientas buscan y
devuelven solamente la evidencia necesaria para responder una pregunta.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import logging
import time
from functools import lru_cache
from pathlib import Path
from typing import Any


CATALOG_PATH = Path(os.getenv("CATALOG_PATH", "/app/catalog/catalog.json"))
VALID_OBJECT_TYPES = {"attribute", "fact", "metric", "filter", "table"}


def _normalize(value: object) -> str:
    """Normaliza texto para búsquedas que no distinguen mayúsculas ni tildes."""
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return " ".join(text.lower().split())


def _unique(values: list[str]) -> list[str]:
    """Conserva el orden y elimina valores vacíos o repetidos."""
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        value = str(value or "").strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    """Lee el catálogo una vez por proceso."""
    with CATALOG_PATH.open(encoding="utf-8") as file:
        return json.load(file)

@lru_cache(maxsize=1)
def _tables_by_object_key() -> dict[str, list[str]]:
    """Índice de tablas por clave de objeto."""
    data = _catalog()
    index: dict[str, list[str]] = {}

    for table in data.get("tables", []):
        table_name = table.get("name", "")
        
        for key in table.get("attribute", []):
            index.setdefault(key, []).append(table_name)

        for key in table.get("fact", []):
            index.setdefault(key, []).append(table_name)

    return index

def _object_by_key(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        item["key"]: item
        for item in [*data.get("objects", []), *data.get("tables", [])]
        if item.get("key")
    }


def _path_values(item: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for location in item.get("locations", []):
        values.append(location.get("folder", ""))
        values.extend(part for part in location.get("path", []) if part)
    return _unique(values)


def _row_values(item: dict[str, Any], field: str) -> list[str]:
    return _unique([row.get(field, "") for row in item.get("rows", [])])


def _relationship_names(
    data: dict[str, Any],
    item: dict[str, Any],
) -> dict[str, list[str]]:
    """Convierte las claves de relaciones a nombres legibles, sin inferir nuevas."""
    by_key = _object_by_key(data)
    links = data.get("links", {}).get(item.get("key"), {})
    result: dict[str, list[str]] = {}
    for relation in ("facts", "metrics", "attributes", "filters"):
        names = [
            by_key[key]["name"]
            for key in links.get(relation, [])
            if key in by_key and by_key[key].get("name")
        ]
        if names:
            result[relation] = _unique(names)[:12]
    return result


def _table_names(data, item):
    """Obtiene las tablas declaradas en filas y en asociaciones de tabla."""
    names = _row_values(item, "tableName")
    key = item.get("key")

    if key:
        names.extend(_tables_by_object_key().get(key, []))

    return _unique(names)


def _compact_object(data: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    """Devuelve evidencia acotada, útil para una respuesta del agente."""
    locations = []
    for location in item.get("locations", [])[:4]:
        path = [part for part in location.get("path", []) if part]
        locations.append(
            {
                "folder": location.get("folder") or None,
                "path": path or None,
            }
        )

    expressions = _row_values(item, "expression")[:6]
    qualifications = _row_values(item, "qualification")[:4]
    result: dict[str, Any] = {
        "key": item.get("key"),
        "type": item.get("type", "table"),
        "name": item.get("name"),
        "description": item.get("description") or None,
    }
    if locations:
        result["locations"] = locations
    if item.get("type") != "table":
        tables = _table_names(data, item)
        if tables:
            result["tables"] = tables[:12]
    if expressions:
        result["expressions"] = expressions
    if qualifications:
        result["qualifications"] = qualifications

    relationships = _relationship_names(data, item)
    if relationships:
        result["confirmed_relationships"] = relationships

    if item.get("type") == "table":
        result["associated_attributes"] = len(item.get("attribute", []))
        result["associated_facts"] = len(item.get("fact", []))
    return result


def _score_item(
    data: dict[str, Any],
    item: dict[str, Any],
    query: str,
) -> int:
    """Puntúa coincidencias de forma explicable, sin embeddings externos."""
    normalized_query = _normalize(query)
    tokens = [token for token in re.findall(r"[a-z0-9_]+", normalized_query) if len(token) > 1]
    name = _normalize(item.get("name"))
    identifier = _normalize(item.get("id") or item.get("key"))
    description = _normalize(item.get("description"))
    location = _normalize(" ".join(_path_values(item)))
    tables = _normalize(" ".join(_table_names(data, item)))
    definitions = _normalize(
        " ".join(
            [
                *_row_values(item, "expression"),
                *_row_values(item, "qualification"),
                *_row_values(item, "predicateName"),
            ]
        )
    )

    weighted_fields = (
        (name, 9),
        (identifier, 7),
        (description, 3),
        (location, 3),
        (tables, 3),
        (definitions, 2),
    )
    score = 0
    for field, weight in weighted_fields:
        if not field:
            continue
        if normalized_query and normalized_query in field:
            score += weight * 4
        score += sum(weight for token in tokens if token in field)
    return score


def _matches_filter(value: str | None, candidates: list[str]) -> bool:
    if not value:
        return True
    expected = _normalize(value)
    return any(expected in _normalize(candidate) for candidate in candidates)


def search_catalog(
    query: str,
    object_type: str | None = None,
    model: str | None = None,
    table: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Busca atributos, facts, métricas, filtros o tablas del catálogo.

    Usa esta herramienta antes de responder preguntas concretas sobre objetos,
    nombres, IDs, descripciones, expresiones, carpetas, modelos o tablas.
    ``object_type`` acepta: attribute, fact, metric, filter o table. ``model``
    y ``table`` son filtros opcionales por nombre. Devuelve evidencia acotada;
    no inventes información que no esté en la respuesta.
    """
    logger = logging.getLogger(__name__)
    start = time.perf_counter()
    logger.info("[TOOL] search_catalog - INICIO")

    try:
        if not isinstance(query, str) or not query.strip():
            return {"status": "error", "message": "La consulta debe contener texto."}
        if object_type is not None and object_type not in VALID_OBJECT_TYPES:
            return {
                "status": "error",
                "message": "object_type debe ser attribute, fact, metric, filter o table.",
            }

        try:
            t_catalog = time.perf_counter()
            data = _catalog()
            logger.info("[PERF] search_catalog - _catalog = %.3fs",
            time.perf_counter() - t_catalog
)
        except (OSError, json.JSONDecodeError) as error:
            return {
                "status": "error",
                "message": f"No se pudo leer catalog.json ({type(error).__name__}).",
            }

        max_results = max(1, min(int(limit), 12))
        candidates = [*data.get("objects", []), *data.get("tables", [])]
        matches: list[tuple[int, dict[str, Any]]] = []
        for item in candidates:
            item_type = item.get("type", "table")
            if object_type and item_type != object_type:
                continue
            if not _matches_filter(model, _path_values(item)):
                continue
            if not _matches_filter(table, _table_names(data, item) + [item.get("name", "")]):
                continue
            score = _score_item(data, item, query)
            if score:
                matches.append((score, item))

        matches.sort(key=lambda pair: (-pair[0], _normalize(pair[1].get("name"))))
        results = [_compact_object(data, item) for _, item in matches[:max_results]]
        return {
            "status": "ok",
            "query": query,
            "returned": len(results),
            "matches": results,
            "note": (
                "Las relaciones corresponden a las confirmadas en catalog.json; "
                "una ausencia no prueba que la relación no exista en MicroStrategy."
            ),
        }
    finally:
        elapsed = time.perf_counter() - start
        logger.info(
            "[TOOL] search_catalog - FIN - duración=%.3fs",
            elapsed,
        )

def get_object_detail(key: str) -> dict[str, Any]:
    """Obtiene el detalle de un objeto por la clave exacta devuelta por search_catalog.

    Úsala cuando necesites responder sobre fórmulas, calificaciones, tablas,
    ubicaciones o relaciones de un objeto específico. No inventes una clave.
    """
    logger = logging.getLogger(__name__)
    start = time.perf_counter()
    logger.info("[TOOL] get_object_detail - INICIO")

    try:

        if not isinstance(key, str) or not key.strip():
            return {"status": "error", "message": "La clave del objeto es obligatoria."}
        try:
            data = _catalog()
        except (OSError, json.JSONDecodeError) as error:
            return {
                "status": "error",
                "message": f"No se pudo leer catalog.json ({type(error).__name__}).",
            }

        item = _object_by_key(data).get(key)
        if item is None:
            return {"status": "not_found", "message": "No existe un objeto con esa clave."}
        return {"status": "ok", "object": _compact_object(data, item)}

    finally:
        elapsed = time.perf_counter() - start
        logger.info(
            "[TOOL] get_object_detail - FIN - duración=%.3fs",
            elapsed,
        )

def get_catalog_summary() -> dict[str, Any]:
    """Devuelve conteos globales del catálogo para preguntas de resumen."""
    logger = logging.getLogger(__name__)
    start = time.perf_counter()
    logger.info("[TOOL] get_catalog_summary - INICIO")
    try:
        try:
            data = _catalog()
        except (OSError, json.JSONDecodeError) as error:
            return {
                "status": "error",
                "message": f"No se pudo leer catalog.json ({type(error).__name__}).",
            }

        stats = data.get("stats", {})
        objects = data.get("objects", [])
        return {
            "status": "ok",
            "objects": stats.get("objects", len(objects)),
            "tables": len(data.get("tables", [])),
            "models": stats.get("models"),
            "submodels": stats.get("submodels"),
            "by_type": {
                object_type: sum(1 for item in objects if item.get("type") == object_type)
                for object_type in ("attribute", "fact", "metric", "filter")
            },
        }
    finally:
        elapsed = time.perf_counter() - start
        logger.info(
        "[TOOL] search_catalog - FIN - duración=%.3fs",
        elapsed,
        )