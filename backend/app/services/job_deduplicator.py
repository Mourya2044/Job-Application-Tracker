import re
import math
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import numpy as np

# RapidFuzz for high-speed Levenshtein & token sort distance
try:
    from rapidfuzz import fuzz, distance
except ImportError:
    import difflib
    class fuzz:
        @staticmethod
        def token_sort_ratio(s1: str, s2: str) -> float:
            toks1 = " ".join(sorted(s1.split()))
            toks2 = " ".join(sorted(s2.split()))
            return difflib.SequenceMatcher(None, toks1, toks2).ratio() * 100.0

        @staticmethod
        def ratio(s1: str, s2: str) -> float:
            return difflib.SequenceMatcher(None, s1, s2).ratio() * 100.0

# Neural vector embedding from existing ai_advisor service
try:
    from app.services.ai_advisor import (
        compute_batch_embeddings,
        calculate_semantic_similarity,
    )
except ImportError:
    compute_batch_embeddings = None
    calculate_semantic_similarity = None

logger = logging.getLogger(__name__)

STOPWORDS = {
    "and", "or", "the", "a", "an", "in", "at", "for", "with", "to", "of",
    "remote", "fulltime", "full", "time", "hybrid", "onsite", "role", "position",
    "job", "senior", "junior", "staff", "lead", "principal", "ii", "iii", "iv",
    "inc", "corp", "corporation", "ltd", "llc", "company", "co"
}


def normalize_company_name(comp: Optional[str]) -> str:
    """Normalizes company name for partitioning/blocking (e.g. 'Stripe, Inc.' -> 'stripe')."""
    if not comp:
        return "unknown"
    cleaned = re.sub(r"[^\w\s]", "", comp.lower())
    words = [w for w in cleaned.split() if w not in {"inc", "corp", "llc", "ltd", "technologies", "tech", "company", "co"}]
    return " ".join(words).strip() or cleaned.strip()


def extract_tokens(text: Optional[str]) -> Set[str]:
    """Cleans and extracts token set stripped of stopwords and punctuation."""
    if not text:
        return set()
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    tokens = {t.strip() for t in cleaned.split() if len(t.strip()) > 1}
    return tokens - STOPWORDS


clean_and_tokenize = extract_tokens


def extract_char_shingles(text: Optional[str], n: int = 3) -> Set[str]:
    """Generates character n-gram shingles for sub-word Jaccard similarity."""
    if not text:
        return set()
    s = re.sub(r"\s+", " ", text.lower().strip())
    if len(s) < n:
        return {s}
    return {s[i : i + n] for i in range(len(s) - n + 1)}


class JobDeduplicator:
    """
    Production Multi-Technique Deduplication Engine:
    1. Jaccard Similarity (Token & Shingle Intersection over Union)
    2. Edit Distance (Levenshtein & Token Sort Distance Ratio)
    3. Dense Vector Embeddings (GPU/CPU Transformer Semantic Cosine)
    """

    # -------------------------------------------------------------------------
    # Technique 1: Jaccard Similarity (Intersection over Union)
    # -------------------------------------------------------------------------
    @staticmethod
    def jaccard_similarity(set_a: Set[str], set_b: Set[str]) -> float:
        """
        Calculates Jaccard Index:
        J(A, B) = |A ∩ B| / |A ∪ B|
        """
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        return float(intersection / union) if union > 0 else 0.0

    @classmethod
    def jaccard_title_similarity(cls, title_a: str, title_b: str) -> float:
        """Computes combined token Jaccard and character 3-gram shingle Jaccard."""
        tokens_a = extract_tokens(title_a)
        tokens_b = extract_tokens(title_b)
        token_sim = cls.jaccard_similarity(tokens_a, tokens_b)

        shingles_a = extract_char_shingles(title_a, n=3)
        shingles_b = extract_char_shingles(title_b, n=3)
        shingle_sim = cls.jaccard_similarity(shingles_a, shingles_b)

        # Weighted combination: 60% token overlap + 40% sub-word shingle overlap
        return (0.6 * token_sim) + (0.4 * shingle_sim)

    # -------------------------------------------------------------------------
    # Technique 2: Edit Distance (Levenshtein / Token Sort Ratio)
    # -------------------------------------------------------------------------
    @staticmethod
    def edit_distance_ratio(str_a: str, str_b: str) -> float:
        """
        Calculates normalized edit distance ratio (0.0 to 1.0) using Token Sort Ratio.
        Normalizes token order so 'Engineer, Full Stack' == 'Full Stack Engineer'.
        """
        if not str_a or not str_b:
            return 0.0
        score = fuzz.token_sort_ratio(str_a.lower().strip(), str_b.lower().strip())
        return float(score / 100.0)

    # -------------------------------------------------------------------------
    # Technique 3: Dense Vector Embeddings (Semantic Cosine Similarity)
    # -------------------------------------------------------------------------
    @classmethod
    def vector_cosine_similarity(
        cls,
        text_a: str,
        text_b: str,
        emb_a: Optional[Any] = None,
        emb_b: Optional[Any] = None,
    ) -> float:
        """
        Computes cosine similarity between contextual embeddings:
        cos(u, v) = (u . v) / (||u|| * ||v||)
        """
        if emb_a is not None and emb_b is not None and calculate_semantic_similarity:
            try:
                return calculate_semantic_similarity(emb_a, emb_b)
            except Exception as e:
                logger.debug("calculate_semantic_similarity error: %s", e)

        # Fallback to computing on the fly if function is available
        if compute_batch_embeddings and calculate_semantic_similarity:
            try:
                embs = compute_batch_embeddings([text_a, text_b])
                if embs is not None and len(embs) >= 2:
                    return calculate_semantic_similarity(embs[0:1], embs[1:2])
            except Exception as e:
                logger.debug("Vector embedding computation fallback: %s", e)

        # Fallback to character n-gram cosine if neural model is not active
        shing_a = extract_char_shingles(text_a, 3)
        shing_b = extract_char_shingles(text_b, 3)
        all_vocab = list(shing_a.union(shing_b))
        if not all_vocab:
            return 0.0
        vec_a = np.array([1 if term in shing_a else 0 for term in all_vocab], dtype=float)
        vec_b = np.array([1 if term in shing_b else 0 for term in all_vocab], dtype=float)
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))

    # -------------------------------------------------------------------------
    # Multi-Tier Deduplication Decision
    # -------------------------------------------------------------------------
    @classmethod
    def evaluate_pair(
        cls,
        job_a: Dict[str, Any],
        job_b: Dict[str, Any],
        emb_a: Optional[Any] = None,
        emb_b: Optional[Any] = None,
        enable_vectors: bool = True,
    ) -> Tuple[bool, str, float]:
        """
        Evaluates whether job_a and job_b are duplicate postings.
        Returns: (is_duplicate: bool, technique_reason: str, confidence_score: float)
        """
        # 1. Canonical URL check
        url_a = (job_a.get("url") or "").split("?")[0].rstrip("/")
        url_b = (job_b.get("url") or "").split("?")[0].rstrip("/")
        if url_a and url_b and url_a == url_b:
            return True, "Canonical URL Equality", 1.0

        title_a = job_a.get("title") or ""
        title_b = job_b.get("title") or ""

        if not title_a or not title_b:
            return False, "Missing Title", 0.0

        # 2. Technique 1: Jaccard Similarity
        jaccard_score = cls.jaccard_title_similarity(title_a, title_b)
        if jaccard_score >= 0.82:
            return True, f"Jaccard Token/Shingle Overlap ({jaccard_score:.2f})", jaccard_score

        # 3. Technique 2: Edit Distance (Token Sort Ratio)
        edit_score = cls.edit_distance_ratio(title_a, title_b)
        if edit_score >= 0.86:
            return True, f"Levenshtein Edit Distance Match ({edit_score:.2f})", edit_score

        # Combined Lexical Fast-Path
        lexical_avg = (0.5 * jaccard_score) + (0.5 * edit_score)
        if lexical_avg >= 0.76:
            return True, f"Hybrid Lexical Match ({lexical_avg:.2f})", lexical_avg

        # 4. Technique 3: Vector Embedding Semantic Cosine
        # Only evaluate vector similarity if lexical score is within the ambiguous candidate band (0.35 - 0.75)
        if enable_vectors and lexical_avg >= 0.35:
            text_a = f"{title_a} {(job_a.get('description_snippet') or '')[:200]}"
            text_b = f"{title_b} {(job_b.get('description_snippet') or '')[:200]}"
            vec_score = cls.vector_cosine_similarity(text_a, text_b, emb_a, emb_b)
            if vec_score >= 0.85:
                return True, f"Neural Vector Semantic Match ({vec_score:.2f})", vec_score

        return False, "Distinct Posting", max(jaccard_score, edit_score)

    @staticmethod
    def _merge_duplicate_metadata(kept: Dict[str, Any], dropped: Dict[str, Any]) -> None:
        """
        Backfills missing metadata on the kept primary job record from a duplicate
        record discovered on a secondary job API.
        """
        if not kept.get("salary_range") and dropped.get("salary_range"):
            kept["salary_range"] = dropped["salary_range"]
        if not kept.get("department") and dropped.get("department"):
            kept["department"] = dropped["department"]
        kept_desc = kept.get("description_snippet") or ""
        drop_desc = dropped.get("description_snippet") or ""
        if len(drop_desc) > len(kept_desc):
            kept["description_snippet"] = drop_desc

    @classmethod
    def deduplicate_job_list(
        cls,
        jobs: List[Dict[str, Any]],
        enable_vectors: bool = True,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Deduplicates an arbitrary list of job dictionaries using blocking/partitioning.
        Returns: (deduplicated_jobs, metadata_report)
        """
        if len(jobs) <= 1:
            return jobs, {
                "original_count": len(jobs),
                "unique_count": len(jobs),
                "duplicates_removed": 0,
                "duplicates_found": [],
            }

        # Step 1: Pre-compute batch embeddings if vectors enabled and model available
        embeddings_cache = {}
        if enable_vectors and compute_batch_embeddings:
            try:
                texts = [f"{j.get('title', '')} {(j.get('description_snippet') or '')[:150]}" for j in jobs]
                batch_tensors = compute_batch_embeddings(texts)
                if batch_tensors is not None and len(batch_tensors) == len(jobs):
                    for idx, j in enumerate(jobs):
                        jid = j.get("id") or str(idx)
                        embeddings_cache[jid] = batch_tensors[idx : idx + 1]
            except Exception as ex:
                logger.warning("Could not pre-compute embeddings for deduplication: %s", ex)

        # Step 2: Blocking / Partitioning by normalized company
        buckets: Dict[str, List[Dict[str, Any]]] = {}
        for idx, job in enumerate(jobs):
            comp_norm = normalize_company_name(job.get("company_name"))
            buckets.setdefault(comp_norm, []).append(job)

        unique_jobs: List[Dict[str, Any]] = []
        duplicates_found: List[Dict[str, Any]] = []

        for comp_key, candidate_jobs in buckets.items():
            comp_uniques: List[Dict[str, Any]] = []

            for candidate in candidate_jobs:
                cand_id = candidate.get("id") or candidate.get("url") or candidate.get("title")
                cand_emb = embeddings_cache.get(cand_id)

                is_dup = False
                matched_job = None
                matched_reason = ""
                matched_score = 0.0

                for existing in comp_uniques:
                    ex_id = existing.get("id") or existing.get("url") or existing.get("title")
                    ex_emb = embeddings_cache.get(ex_id)

                    dup_flag, reason, score = cls.evaluate_pair(
                        candidate,
                        existing,
                        emb_a=cand_emb,
                        emb_b=ex_emb,
                        enable_vectors=enable_vectors,
                    )
                    if dup_flag:
                        is_dup = True
                        matched_job = existing
                        matched_reason = reason
                        matched_score = score
                        break

                if is_dup and matched_job:
                    cls._merge_duplicate_metadata(matched_job, candidate)
                    duplicates_found.append({
                        "dropped_job_id": candidate.get("id"),
                        "dropped_title": candidate.get("title"),
                        "kept_job_id": matched_job.get("id"),
                        "kept_title": matched_job.get("title"),
                        "company": candidate.get("company_name"),
                        "reason": matched_reason,
                        "confidence": round(matched_score, 3),
                    })
                else:
                    comp_uniques.append(candidate)

            unique_jobs.extend(comp_uniques)

        report = {
            "original_count": len(jobs),
            "unique_count": len(unique_jobs),
            "duplicates_removed": len(jobs) - len(unique_jobs),
            "duplicates_found": duplicates_found,
        }
        return unique_jobs, report
