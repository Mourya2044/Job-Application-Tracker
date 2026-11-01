import base64
import hashlib
import ipaddress
import logging
import os
import socket
import urllib.parse
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Key derivation for OAuth token encryption at rest
_ENCRYPTION_KEY_ENV = os.getenv("SECRET_ENCRYPTION_KEY", "").strip()
_KEY_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".encryption_key")


def _get_fernet() -> Fernet:
    """Returns a Fernet instance using an env key, stored local key, or generated key."""
    if _ENCRYPTION_KEY_ENV:
        try:
            return Fernet(_ENCRYPTION_KEY_ENV.encode("utf-8"))
        except Exception:
            key_32 = hashlib.sha256(_ENCRYPTION_KEY_ENV.encode("utf-8")).digest()
            b64_key = base64.urlsafe_b64encode(key_32)
            return Fernet(b64_key)

    if os.path.exists(_KEY_FILE_PATH):
        try:
            with open(_KEY_FILE_PATH, "rb") as f:
                saved_key = f.read().strip()
                if saved_key:
                    return Fernet(saved_key)
        except Exception as e:
            logger.warning("Could not read .encryption_key: %s", e)

    # Generate and persist fallback key
    new_key = Fernet.generate_key()
    try:
        with open(_KEY_FILE_PATH, "wb") as f:
            f.write(new_key)
    except Exception as e:
        logger.warning("Could not persist generated encryption key: %s", e)

    return Fernet(new_key)


_fernet_instance: Optional[Fernet] = None


def get_fernet_cipher() -> Fernet:
    global _fernet_instance
    if _fernet_instance is None:
        _fernet_instance = _get_fernet()
    return _fernet_instance


def encrypt_token(plain_token: Optional[str]) -> Optional[str]:
    """Encrypts sensitive OAuth tokens at rest with an 'enc:' prefix."""
    if not plain_token:
        return None
    if plain_token.startswith("enc:"):
        return plain_token

    try:
        cipher = get_fernet_cipher()
        encrypted_bytes = cipher.encrypt(plain_token.encode("utf-8"))
        return f"enc:{encrypted_bytes.decode('utf-8')}"
    except Exception as e:
        logger.error("Failed to encrypt token: %s", e)
        return plain_token


def decrypt_token(token_val: Optional[str]) -> Optional[str]:
    """Decrypts token if encrypted; returns plain token if unencrypted (backwards compatibility)."""
    if not token_val:
        return None
    if not token_val.startswith("enc:"):
        return token_val

    raw_enc = token_val[4:]
    try:
        cipher = get_fernet_cipher()
        decrypted_bytes = cipher.decrypt(raw_enc.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except (InvalidToken, Exception) as e:
        logger.warning("Token decryption error: %s", e)
        return None


# ---------------------------------------------------------------------------
# SSRF Defense for Scraped URLs and Career Portals
# ---------------------------------------------------------------------------

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
    "instance-data",
}


def validate_safe_url(url: str) -> str:
    """
    Validates that a URL does not target private, loopback, link-local,
    or cloud metadata IP addresses to prevent Server-Side Request Forgery (SSRF).
    Returns cleaned URL or raises ValueError.
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string.")

    cleaned_url = url.strip()
    parsed = urllib.parse.urlparse(cleaned_url)

    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError(f"Unsupported scheme '{parsed.scheme}'. Only http and https are permitted.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("Invalid URL: missing hostname.")

    if hostname in BLOCKED_HOSTNAMES:
        raise ValueError(f"Restricted target hostname '{hostname}'. Access denied.")

    # Resolve IP and check for private / internal network addresses
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if (
                ip_obj.is_private
                or ip_obj.is_loopback
                or ip_obj.is_link_local
                or ip_obj.is_reserved
                or ip_obj.is_multicast
            ):
                raise ValueError(
                    f"Security Exception: Hostname '{hostname}' resolves to restricted internal IP {ip_str}."
                )
    except socket.gaierror as e:
        logger.debug("DNS resolution check for %s: %s", hostname, e)
    except ValueError:
        raise
    except Exception as e:
        logger.debug("SSRF verification warning for %s: %s", hostname, e)

    return cleaned_url

